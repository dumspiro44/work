import { storage } from '../storage';
import { WordPressService } from './wordpress';
import { GeminiTranslationService } from './gemini';
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
    this.queue.push({ jobId, postId, targetLanguage });
    await this.processQueue();
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      this.currentJob = item;
      await this.processJob(item);
      this.currentJob = null;
    }

    this.processing = false;
  }

  private async processJob(item: QueueItem) {
    const { jobId, postId, targetLanguage } = item;

    try {
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

      const wpService = new WordPressService(settings);
      const post = await wpService.getPost(postId);

      await storage.createLog({
        jobId,
        level: 'info',
        message: 'Fetched WordPress post',
        metadata: { title: post.title.rendered },
      });

      await storage.updateTranslationJob(jobId, { progress: 40 });

      const geminiService = new GeminiTranslationService(settings.geminiApiKey || '');
      
      const translatedTitle = await geminiService.translateTitle(
        post.title.rendered,
        settings.sourceLanguage,
        targetLanguage
      );

      await storage.updateTranslationJob(jobId, { progress: 60 });

      const { translatedText, tokensUsed } = await geminiService.translateContent(
        post.content.rendered,
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

      await storage.updateTranslationJob(jobId, { 
        progress: 80,
        tokensUsed,
      });

      const newPostId = await wpService.createTranslation(
        postId,
        targetLanguage,
        translatedTitle,
        translatedText
      );

      await storage.createLog({
        jobId,
        level: 'info',
        message: 'Created WordPress translation post',
        metadata: { newPostId },
      });

      await storage.updateTranslationJob(jobId, {
        status: 'COMPLETED',
        progress: 100,
        tokensUsed,
      });

      await storage.createLog({
        jobId,
        level: 'success',
        message: 'Translation job completed successfully',
        metadata: { newPostId, tokensUsed },
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
