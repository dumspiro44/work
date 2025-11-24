import { storage } from '../storage';
import { WordPressService } from './wordpress';
import { GeminiTranslationService } from './gemini';
import { ContentExtractorService } from './content-extractor';
import type { TranslationJob } from '@shared/schema';

interface QueueItem {
  jobId: string;
  postId: number;
  targetLanguage: string;
}

class TranslationQueue {
  private queue: QueueItem[] = [];
  private activeJobs = new Set<string>();
  private failedJobs = new Map<string, number>();
  private currentJob: QueueItem | null = null;
  private readonly MAX_PARALLEL_JOBS = 2; // Process up to 2 posts simultaneously to avoid API quota limits
  private readonly MAX_RETRIES = 3;
  private readonly BASE_RETRY_DELAY = 2000; // 2 seconds base delay

  async addJob(jobId: string, postId: number, targetLanguage: string) {
    console.log(`[QUEUE] Adding job ${jobId} to queue. Queue length before: ${this.queue.length}, active jobs: ${this.activeJobs.size}`);
    this.queue.push({ jobId, postId, targetLanguage });
    console.log(`[QUEUE] Queue length after: ${this.queue.length}`);
    await this.processQueue();
  }

  private async processQueue() {
    console.log(`[QUEUE] processQueue called. Queue length: ${this.queue.length}, active jobs: ${this.activeJobs.size}/${this.MAX_PARALLEL_JOBS}`);
    
    // Start jobs until we reach the parallel limit or run out of queue items
    while (this.queue.length > 0 && this.activeJobs.size < this.MAX_PARALLEL_JOBS) {
      const item = this.queue.shift();
      if (!item) break;

      this.activeJobs.add(item.jobId);
      console.log(`[QUEUE] Starting parallel job ${item.jobId} (active: ${this.activeJobs.size}/${this.MAX_PARALLEL_JOBS})`);
      
      // Process job in background without awaiting
      this.processJob(item).then(() => {
        this.activeJobs.delete(item.jobId);
        this.failedJobs.delete(item.jobId);
        console.log(`[QUEUE] Job ${item.jobId} completed. Active jobs: ${this.activeJobs.size}`);
        // Try to process more jobs from the queue
        this.processQueue();
      }).catch((error) => {
        this.activeJobs.delete(item.jobId);
        const retryCount = (this.failedJobs.get(item.jobId) || 0);
        const isQuotaError = error instanceof Error && error.message.includes('429');
        
        if (isQuotaError && retryCount < this.MAX_RETRIES) {
          // Re-queue for retry with exponential backoff
          const delay = this.BASE_RETRY_DELAY * Math.pow(2, retryCount);
          console.log(`[QUEUE] Job ${item.jobId} quota exceeded. Retrying in ${delay}ms (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
          
          this.failedJobs.set(item.jobId, retryCount + 1);
          setTimeout(() => {
            this.queue.unshift(item);
            this.processQueue();
          }, delay);
        } else {
          // Job failed permanently
          this.failedJobs.delete(item.jobId);
          console.error(`[QUEUE] Job ${item.jobId} failed permanently:`, error);
        }
        
        // Try to process more jobs from the queue
        this.processQueue();
      });
    }

    if (this.activeJobs.size === 0 && this.queue.length === 0) {
      console.log(`[QUEUE] Queue processing completed - no more jobs`);
    }
  }

  private async processJob(item: QueueItem) {
    const { jobId, postId, targetLanguage } = item;

    try {
      console.log(`[QUEUE] Starting job ${jobId} for post ${postId} to ${targetLanguage}`);

      await storage.updateTranslationJob(jobId, {
        status: 'PROCESSING',
        progress: 10,
      });

      await storage.createLog({
        jobId,
        level: 'info',
        message: 'Starting translation job',
        metadata: { postId, targetLanguage },
      });

      const settings = await storage.getSettings();
      if (!settings) {
        throw new Error('Settings not configured');
      }

      if (!settings.geminiApiKey || settings.geminiApiKey.trim() === '') {
        throw new Error('Gemini API key not configured');
      }

      if (!settings.wpUrl || settings.wpUrl.trim() === '') {
        throw new Error('WordPress URL not configured');
      }

      await storage.updateTranslationJob(jobId, { progress: 20 });

      console.log(`[QUEUE] Fetching post ${postId} from WordPress`);
      const wpService = new WordPressService(settings);
      const post = await wpService.getPost(postId);
      console.log(`[QUEUE] Got post title: ${post.title.rendered}`);

      await storage.createLog({
        jobId,
        level: 'info',
        message: 'Fetched WordPress post',
        metadata: { title: post.title.rendered },
      });

      await storage.updateTranslationJob(jobId, { progress: 40 });

      // Get raw HTML content - send to Gemini as-is
      const rawContent = post.content?.rendered || '';
      console.log(`[QUEUE] Raw HTML content length: ${rawContent.length} chars`);
      
      if (!rawContent || rawContent.trim().length === 0) {
        console.log(`[QUEUE] No content found for post ${postId}, marking as completed`);
        
        await storage.createLog({
          jobId,
          level: 'warning',
          message: 'No content found in post',
          metadata: { contentLength: 0 },
        });

        await storage.updateTranslationJob(jobId, {
          status: 'COMPLETED',
          progress: 100,
          translatedTitle: post.title.rendered,
          translatedContent: '',
          tokensUsed: 0,
        });
        
        return;
      }

      console.log(`[QUEUE] Starting Gemini translation for post ${postId}`);
      
      // Decode HTML entities before sending to Gemini
      const decodedContent = rawContent
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'");
      
      console.log(`[QUEUE] Decoded content: ${decodedContent.substring(0, 500)}`);
      
      const geminiService = new GeminiTranslationService(settings.geminiApiKey || '');
      
      const translatedTitle = await geminiService.translateTitle(
        post.title.rendered,
        settings.sourceLanguage,
        targetLanguage
      );

      await storage.updateTranslationJob(jobId, { progress: 60 });

      // Send full decoded HTML to Gemini
      const { translatedText, tokensUsed } = await geminiService.translateContent(
        decodedContent,
        settings.sourceLanguage,
        targetLanguage,
        settings.systemInstruction || undefined
      );

      await storage.createLog({
        jobId,
        level: 'info',
        message: 'Translation completed',
        metadata: { tokensUsed },
      });

      // Save translation to database for review
      await storage.updateTranslationJob(jobId, { 
        progress: 80,
        tokensUsed,
        translatedTitle,
        translatedContent: translatedText,
      });

      await storage.createLog({
        jobId,
        level: 'info',
        message: 'Translation completed and saved for review',
        metadata: { translatedTitle, tokensUsed },
      });

      // Mark job as completed - ready for manual review and publishing
      await storage.updateTranslationJob(jobId, {
        status: 'COMPLETED',
        progress: 100,
        tokensUsed,
      });

      await storage.createLog({
        jobId,
        level: 'success',
        message: 'Translation job completed successfully. Ready for review and publishing.',
        metadata: { tokensUsed },
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      await storage.updateTranslationJob(jobId, {
        status: 'FAILED',
        errorMessage,
      });

      await storage.createLog({
        jobId,
        level: 'error',
        message: 'Translation job failed',
        metadata: { error: errorMessage },
      });

      console.error('Translation job failed:', error);
    }
  }

  getStatus() {
    return {
      queueLength: this.queue.length,
      activeJobs: this.activeJobs.size,
      maxParallelJobs: this.MAX_PARALLEL_JOBS,
      currentJob: this.currentJob,
    };
  }
}

export const translationQueue = new TranslationQueue();
