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
  private processing = false;
  private currentJob: QueueItem | null = null;

  async addJob(jobId: string, postId: number, targetLanguage: string) {
    console.log(`[QUEUE] Adding job ${jobId} to queue. Queue length before: ${this.queue.length}`);
    this.queue.push({ jobId, postId, targetLanguage });
    console.log(`[QUEUE] Queue length after: ${this.queue.length}, processing: ${this.processing}`);
    await this.processQueue();
  }

  private async processQueue() {
    console.log(`[QUEUE] processQueue called. Processing: ${this.processing}, Queue length: ${this.queue.length}`);
    
    if (this.processing || this.queue.length === 0) {
      console.log(`[QUEUE] Skipping processQueue - processing=${this.processing}, queueLength=${this.queue.length}`);
      return;
    }

    console.log(`[QUEUE] Starting queue processing...`);
    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      this.currentJob = item;
      console.log(`[QUEUE] Processing queue item for job ${item.jobId}`);
      await this.processJob(item);
      console.log(`[QUEUE] Finished processing job ${item.jobId}`);
      this.currentJob = null;
    }

    this.processing = false;
    console.log(`[QUEUE] Queue processing completed`);
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

      console.log(`[QUEUE] Extracting content from all page builders for post ${postId}`);
      console.log(`[QUEUE] Post content length: ${post.content?.rendered?.length || 0} chars`);
      console.log(`[QUEUE] Post meta keys: ${post.meta ? Object.keys(post.meta).join(', ') : 'none'}`);
      
      // Extract content from all page builders (BeBuilder, Gutenberg, Elementor, WP Bakery, Standard)
      const extractedContent = ContentExtractorService.extractContent(
        post.content.rendered,
        post.meta
      );
      
      console.log(`[QUEUE] Detected content type: ${extractedContent.type}`);
      console.log(`[QUEUE] Found ${extractedContent.blocks.length} content blocks`);
      
      if (extractedContent.blocks.length === 0) {
        console.log(`[QUEUE] WARNING: No content blocks found! Raw content: ${(post.content.rendered || '').substring(0, 500)}`);
      }
      
      // Log content type info
      await storage.createLog({
        jobId,
        level: 'info',
        message: `Content type detected: ${ContentExtractorService.getTypeLabel(extractedContent.type)}`,
        metadata: { contentType: extractedContent.type, blockCount: extractedContent.blocks.length },
      });

      console.log(`[QUEUE] Starting Gemini translation for post ${postId}`);
      const geminiService = new GeminiTranslationService(settings.geminiApiKey || '');
      
      const translatedTitle = await geminiService.translateTitle(
        post.title.rendered,
        settings.sourceLanguage,
        targetLanguage
      );

      await storage.updateTranslationJob(jobId, { progress: 60 });

      // Combine all content blocks for translation
      const contentToTranslate = ContentExtractorService.combineBlocks(extractedContent.blocks);
      
      const { translatedText, tokensUsed } = await geminiService.translateContent(
        contentToTranslate,
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
      isProcessing: this.processing,
      currentJob: this.currentJob,
    };
  }
}

export const translationQueue = new TranslationQueue();
