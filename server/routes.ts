import type { Express } from "express";
import { createServer, type Server } from "http";
import express from "express";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import { authMiddleware, generateToken, type AuthRequest } from "./middleware/auth";
import { WordPressService } from "./services/wordpress";
import { translationQueue } from "./services/queue";
import { ContentExtractorService } from "./services/content-extractor";
import type { Settings } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  app.use(express.json());

  await initializeDefaultAdmin();
  await initializeQueue();

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ message: 'Username and password required' });
      }

      const admin = await storage.getAdminByUsername(username);
      if (!admin) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const isValid = await bcrypt.compare(password, admin.password);
      if (!isValid) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const token = generateToken(admin.id);
      res.json({ token });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Login failed' });
    }
  });

  app.get('/api/auth/me', authMiddleware, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      res.json({ user: req.user });
    } catch (error) {
      console.error('Auth me error:', error);
      res.status(500).json({ message: 'Failed to get user' });
    }
  });

  app.post('/api/auth/logout', authMiddleware, async (req: AuthRequest, res) => {
    try {
      res.json({ message: 'Logged out successfully' });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ message: 'Logout failed' });
    }
  });

  app.get('/api/stats', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const settings = await storage.getSettings();
      if (!settings || !settings.wpUrl || !settings.wpUsername || !settings.wpPassword) {
        return res.json({
          totalPosts: 0,
          translatedPosts: 0,
          pendingJobs: 0,
          tokensUsed: 0,
        });
      }

      let totalPosts = 0;
      let translatedPosts = 0;

      // Only fetch from WordPress if actually connected
      if ((settings as any).wpConnected === 1 || (settings as any).wpConnected === true) {
        try {
          const wpService = new WordPressService(settings);
          const posts = await wpService.getPosts();
          const pages = await wpService.getPages();
          const allContent = [...posts, ...pages];
          totalPosts = allContent.length;
          translatedPosts = allContent.filter(p => p.translations && Object.keys(p.translations).length > 0).length;
        } catch (error) {
          console.error('Failed to fetch WordPress posts for stats:', error);
          totalPosts = 0;
          translatedPosts = 0;
        }
      }

      const jobs = await storage.getAllTranslationJobs();
      const pendingJobs = jobs.filter(j => j.status === 'PENDING' || j.status === 'PROCESSING').length;
      const tokensUsed = jobs.reduce((sum, j) => sum + (j.tokensUsed || 0), 0);
      
      // Count unique posts with completed translations
      const completedJobs = jobs.filter(j => j.status === 'COMPLETED');
      const uniqueTranslatedPostIds = new Set(completedJobs.map(j => j.postId));
      const dbTranslatedPosts = uniqueTranslatedPostIds.size;
      
      // Use database count if WordPress stats are not available or if db has more completed translations
      if (translatedPosts === 0 && dbTranslatedPosts > 0) {
        translatedPosts = dbTranslatedPosts;
      } else if (dbTranslatedPosts > translatedPosts) {
        translatedPosts = dbTranslatedPosts;
      }

      res.json({
        totalPosts,
        translatedPosts,
        pendingJobs,
        tokensUsed,
      });
    } catch (error) {
      console.error('Stats error:', error);
      res.status(500).json({ message: 'Failed to fetch stats' });
    }
  });

  app.get('/api/settings', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const settings = await storage.getSettings();
      if (!settings) {
        return res.json({
          wpUrl: '',
          wpUsername: '',
          wpPassword: '',
          wpConnected: 0,
          sourceLanguage: 'en',
          targetLanguages: [],
          geminiApiKey: '',
          systemInstruction: 'You are a professional translator. Preserve all HTML tags, classes, IDs, and WordPress shortcodes exactly as they appear. Only translate the text content between tags.',
        });
      }
      
      const maskedSettings = {
        ...settings,
        wpPassword: settings.wpPassword ? '••••••••' : '',
        geminiApiKey: settings.geminiApiKey ? '••••••••' : '',
      };
      
      res.json(maskedSettings);
    } catch (error) {
      console.error('Get settings error:', error);
      res.status(500).json({ message: 'Failed to fetch settings' });
    }
  });

  app.post('/api/settings', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { wpUrl, wpUsername, wpPassword, sourceLanguage, targetLanguages, geminiApiKey, systemInstruction } = req.body;

      const existingSettings = await storage.getSettings();

      // Handle WordPress URL - use existing if not provided
      const finalWpUrl = (wpUrl && wpUrl.trim()) 
        ? wpUrl.trim() 
        : (existingSettings?.wpUrl || '');

      // Handle WordPress Username - use existing if not provided
      const finalWpUsername = (wpUsername && wpUsername.trim()) 
        ? wpUsername.trim() 
        : (existingSettings?.wpUsername || '');

      // Handle WordPress Password - use existing if masked or not provided
      const finalWpPassword = (wpPassword && wpPassword.trim() && wpPassword !== '••••••••') 
        ? wpPassword.trim() 
        : (existingSettings?.wpPassword || '');

      // Handle Gemini API Key - use existing if masked or not provided
      const isNewApiKey = geminiApiKey && geminiApiKey.trim() && geminiApiKey !== '••••••••';
      let finalGeminiApiKey = isNewApiKey 
        ? geminiApiKey.trim() 
        : (existingSettings?.geminiApiKey || '');

      // Validate Gemini API Key if it's being set (new key being provided)
      if (isNewApiKey && finalGeminiApiKey) {
        // Allow both real Gemini keys (AIza*) and test keys for development
        if (finalGeminiApiKey.length < 10) {
          return res.status(400).json({ message: 'Gemini API key is too short' });
        }
        // Only validate AIza format if it looks like a Gemini key
        if (finalGeminiApiKey.startsWith('AIza') && finalGeminiApiKey.length < 20) {
          return res.status(400).json({ message: 'Gemini API key is too short' });
        }
      }

      // Handle target languages - use existing if not provided
      const finalTargetLanguages = (Array.isArray(targetLanguages) && targetLanguages.length > 0)
        ? targetLanguages
        : (existingSettings?.targetLanguages || []);

      // Check WordPress connection if all credentials are provided
      let wpConnected = existingSettings?.wpConnected || 0;
      if (finalWpUrl && finalWpUsername && finalWpPassword) {
        try {
          const testSettings = {
            id: 'test',
            wpUrl: finalWpUrl,
            wpUsername: finalWpUsername,
            wpPassword: finalWpPassword,
            wpConnected: 0,
            sourceLanguage: sourceLanguage || existingSettings?.sourceLanguage || 'en',
            targetLanguages: finalTargetLanguages,
            geminiApiKey: finalGeminiApiKey,
            systemInstruction: systemInstruction || existingSettings?.systemInstruction || '',
            updatedAt: new Date(),
          } as Settings;
          
          const wpService = new WordPressService(testSettings);
          const connectionResult = await wpService.testConnection();
          wpConnected = connectionResult.success ? 1 : 0;
        } catch (error) {
          console.error('Failed to verify WordPress connection:', error);
          wpConnected = 0;
        }
      }

      const settings = await storage.upsertSettings({
        wpUrl: finalWpUrl,
        wpUsername: finalWpUsername,
        wpPassword: finalWpPassword,
        wpConnected,
        sourceLanguage: sourceLanguage || existingSettings?.sourceLanguage || 'en',
        targetLanguages: finalTargetLanguages,
        geminiApiKey: finalGeminiApiKey,
        systemInstruction: systemInstruction || existingSettings?.systemInstruction || 'You are a professional translator. Preserve all HTML tags, classes, IDs, and WordPress shortcodes exactly as they appear. Only translate the text content between tags.',
      } as any);

      const maskedSettings = {
        ...settings,
        wpPassword: settings.wpPassword ? '••••••••' : '',
        geminiApiKey: settings.geminiApiKey ? '••••••••' : '',
      };

      res.json(maskedSettings);
    } catch (error) {
      console.error('Save settings error:', error);
      res.status(500).json({ message: 'Failed to save settings' });
    }
  });

  app.post('/api/test-connection', authMiddleware, async (req: AuthRequest, res) => {
    try {
      let { wpUrl, wpUsername, wpPassword } = req.body;
      
      if (!wpUrl || !wpUsername || !wpPassword) {
        return res.status(400).json({ success: false, message: 'WordPress URL, username and password required' });
      }

      // If password is masked, get the real password from existing settings
      if (wpPassword === '••••••••') {
        const existingSettings = await storage.getSettings();
        wpPassword = existingSettings?.wpPassword || wpPassword;
      }

      // Get existing settings to use for other fields not provided in the request
      const existingSettings = await storage.getSettings();
      
      const testSettings = {
        id: 'test',
        wpUrl,
        wpUsername,
        wpPassword,
        sourceLanguage: existingSettings?.sourceLanguage || 'en',
        targetLanguages: existingSettings?.targetLanguages || [],
        geminiApiKey: existingSettings?.geminiApiKey || '',
        systemInstruction: existingSettings?.systemInstruction || '',
        updatedAt: new Date(),
      } as Settings;

      console.log(`[TEST CONNECTION] URL: ${testSettings.wpUrl}, User: ${testSettings.wpUsername}`);
      const wpService = new WordPressService(testSettings);
      const result = await wpService.testConnection();
      res.json(result);
    } catch (error) {
      console.error('Test connection error:', error);
      res.status(500).json({ success: false, message: 'Connection test failed' });
    }
  });

  app.get('/api/wordpress-diagnostics', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const settings = await storage.getSettings();
      if (!settings || !settings.wpUrl || !settings.wpUsername || !settings.wpPassword) {
        return res.status(400).json({ message: 'WordPress not configured' });
      }

      const wpService = new WordPressService(settings);
      const diagnosis = await wpService.diagnosePageBuilders();
      res.json(diagnosis);
    } catch (error) {
      console.error('WordPress diagnostics error:', error);
      res.status(500).json({ message: 'Failed to diagnose WordPress setup' });
    }
  });

  app.post('/api/install-polylang', authMiddleware, async (req: AuthRequest, res) => {
    try {
      let { wpUrl, wpUsername, wpPassword } = req.body;
      
      if (!wpUrl || !wpUsername || !wpPassword) {
        return res.status(400).json({ success: false, message: 'WordPress URL, username and password required' });
      }

      // If password is masked, get the real password from existing settings
      if (wpPassword === '••••••••') {
        const existingSettings = await storage.getSettings();
        wpPassword = existingSettings?.wpPassword || wpPassword;
      }

      // Get existing settings to use for other fields not provided in the request
      const existingSettings = await storage.getSettings();
      
      const testSettings = {
        id: 'test',
        wpUrl,
        wpUsername,
        wpPassword,
        sourceLanguage: existingSettings?.sourceLanguage || 'en',
        targetLanguages: existingSettings?.targetLanguages || [],
        geminiApiKey: existingSettings?.geminiApiKey || '',
        systemInstruction: existingSettings?.systemInstruction || '',
        updatedAt: new Date(),
      } as Settings;

      console.log(`[CHECK POLYLANG] URL: ${testSettings.wpUrl}, User: ${testSettings.wpUsername}`);
      const wpService = new WordPressService(testSettings);
      const result = await wpService.checkPolylangPlugin();
      res.json(result);
    } catch (error) {
      console.error('Check Polylang error:', error);
      res.status(500).json({ success: false, message: 'Polylang check failed' });
    }
  });

  app.get('/api/posts', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const settings = await storage.getSettings();
      if (!settings || !settings.wpUrl) {
        console.log('[GET POSTS] No settings or wpUrl');
        return res.json([]);
      }

      console.log('[GET POSTS] Fetching from:', settings.wpUrl);
      const wpService = new WordPressService(settings);
      const posts = await wpService.getPosts();
      const pages = await wpService.getPages();
      console.log(`[GET POSTS] Retrieved ${posts.length} posts, ${pages.length} pages`);
      const allContent = [...posts, ...pages];
      
      // Disable caching
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      
      res.json(allContent);
    } catch (error) {
      console.error('Get posts error:', error);
      res.status(500).json({ message: 'Failed to fetch posts' });
    }
  });

  app.get('/api/check-polylang', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const settings = await storage.getSettings();
      if (!settings || !settings.wpUrl) {
        return res.status(400).json({ success: false, message: 'WordPress not configured' });
      }

      const wpService = new WordPressService(settings);
      const result = await wpService.checkPolylangPlugin();
      res.json(result);
    } catch (error) {
      console.error('Check Polylang error:', error);
      res.status(500).json({ success: false, message: 'Polylang check failed' });
    }
  });

  app.post('/api/translate-manual', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { postId } = req.body;
      if (!postId) {
        return res.status(400).json({ message: 'postId required' });
      }

      const settings = await storage.getSettings();
      if (!settings || !settings.wpUrl) {
        return res.status(400).json({ message: 'WordPress not configured' });
      }

      if (!settings.geminiApiKey) {
        return res.status(400).json({ message: 'Gemini API key not configured' });
      }

      if (!settings.targetLanguages || settings.targetLanguages.length === 0) {
        return res.status(400).json({ message: 'No target languages configured' });
      }

      const wpService = new WordPressService(settings);
      const post = await wpService.getPost(postId);

      const createdJobs = [];
      for (const targetLang of settings.targetLanguages) {
        const job = await storage.createTranslationJob({
          postId,
          postTitle: post.title.rendered,
          sourceLanguage: settings.sourceLanguage,
          targetLanguage: targetLang,
          status: 'PENDING',
          progress: 0,
        });

        createdJobs.push(job);
        translationQueue.addJob(job.id, postId, targetLang);
      }

      res.json({ 
        message: `${createdJobs.length} translation job(s) created`,
        jobs: createdJobs,
      });
    } catch (error) {
      console.error('Manual translate error:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : 'Translation failed' });
    }
  });

  app.patch('/api/posts/:id', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const postId = parseInt(req.params.id);
      const { content } = req.body;

      const settings = await storage.getSettings();
      if (!settings || !settings.wpUrl) {
        return res.status(400).json({ message: 'WordPress URL not configured' });
      }

      const wpService = new WordPressService(settings);
      await wpService.updatePost(postId, content);
      res.json({ success: true });
    } catch (error) {
      console.error('Update post error:', error);
      res.status(500).json({ message: 'Failed to update post' });
    }
  });

  app.get('/api/jobs', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const jobs = await storage.getAllTranslationJobs();
      res.json(jobs);
    } catch (error) {
      console.error('Get jobs error:', error);
      res.status(500).json({ message: 'Failed to fetch jobs' });
    }
  });

  app.get('/api/jobs/:id', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const jobId = req.params.id;
      let job = await storage.getTranslationJob(jobId);

      if (!job) {
        return res.status(404).json({ message: 'Job not found' });
      }

      const settings = await storage.getSettings();
      if (!settings) {
        return res.status(400).json({ message: 'Settings not configured' });
      }

      const wpService = new WordPressService(settings);
      const sourcePost = await wpService.getPost(job.postId);

      // If translatedTitle/Content not in DB (old jobs), load from WordPress
      if (!job.translatedTitle || !job.translatedContent) {
        try {
          const translatedPost = await wpService.getTranslation(job.postId, job.targetLanguage);
          
          if (translatedPost) {
            job = {
              ...job,
              translatedTitle: translatedPost.title.rendered,
              translatedContent: translatedPost.content.rendered,
            };
          }
        } catch (err) {
          console.warn('Could not find translated post in WordPress, will use empty fields');
        }
      }

      res.json({ 
        job,
        sourcePost: {
          title: sourcePost.title.rendered,
          content: sourcePost.content.rendered,
        },
      });
    } catch (error) {
      console.error('Get job details error:', error);
      res.status(500).json({ message: 'Failed to fetch job details' });
    }
  });

  app.post('/api/jobs/:id/publish', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const jobId = req.params.id;
      const { translatedTitle, translatedContent } = req.body;
      const job = await storage.getTranslationJob(jobId);

      if (!job) {
        return res.status(404).json({ message: 'Job not found' });
      }

      if (job.status !== 'COMPLETED') {
        return res.status(400).json({ message: 'Job must be completed before publishing' });
      }

      const settings = await storage.getSettings();
      if (!settings || !settings.wpUrl) {
        return res.status(400).json({ message: 'WordPress not configured' });
      }

      const wpService = new WordPressService(settings);
      
      // Check if Polylang is installed
      const polylangStatus = await wpService.checkPolylangPlugin();
      if (!polylangStatus.success) {
        return res.status(400).json({ 
          message: 'Polylang plugin is not installed or activated. Please install Polylang on your WordPress site to enable translations.',
          code: 'POLYLANG_NOT_INSTALLED'
        });
      }
      
      // Use provided translated content or fallback to saved content
      const finalTitle = translatedTitle || job.translatedTitle;
      const finalContent = translatedContent || job.translatedContent;

      if (!finalTitle || !finalContent) {
        return res.status(400).json({ message: 'Translation content not available' });
      }

      // Create translated post in WordPress
      const newPostId = await wpService.createTranslation(
        job.postId,
        job.targetLanguage,
        finalTitle,
        finalContent
      );

      res.json({ 
        success: true, 
        message: `Translation published to WordPress (Post #${newPostId})`,
        postId: newPostId,
      });
    } catch (error) {
      console.error('Publish job error:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : 'Publish failed' });
    }
  });

  app.post('/api/translate', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { postIds } = req.body;

      if (!Array.isArray(postIds) || postIds.length === 0) {
        return res.status(400).json({ message: 'postIds array required' });
      }

      const settings = await storage.getSettings();
      if (!settings || !settings.wpUrl) {
        return res.status(400).json({ message: 'WordPress not configured' });
      }

      if (!settings.geminiApiKey || !settings.geminiApiKey.trim()) {
        return res.status(400).json({ message: 'Gemini API key not configured' });
      }

      if (!settings.targetLanguages || settings.targetLanguages.length === 0) {
        return res.status(400).json({ message: 'No target languages configured' });
      }

      const wpService = new WordPressService(settings);
      const createdJobs = [];

      for (const postId of postIds) {
        const post = await wpService.getPost(postId);

        for (const targetLang of settings.targetLanguages) {
          const job = await storage.createTranslationJob({
            postId,
            postTitle: post.title.rendered,
            sourceLanguage: settings.sourceLanguage,
            targetLanguage: targetLang,
            status: 'PENDING',
            progress: 0,
          });

          createdJobs.push(job);

          translationQueue.addJob(job.id, postId, targetLang);
        }
      }

      res.json({ 
        message: `${createdJobs.length} translation job(s) created`,
        jobs: createdJobs,
      });
    } catch (error) {
      console.error('Translate error:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : 'Translation failed' });
    }
  });

  // Interface strings endpoints
  app.get('/api/interface-strings', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const settings = await storage.getSettings();
      
      if (!settings || !settings.wpUrl || !settings.wpUsername || !settings.wpPassword) {
        return res.status(400).json({ message: 'WordPress not configured' });
      }

      const { WordPressInterfaceService } = await import('./services/wordpress-interface');
      const interfaceService = new WordPressInterfaceService(settings);
      const strings = await interfaceService.fetchInterfaceElements();

      res.json(strings);
    } catch (error) {
      console.error('Get interface strings error:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to fetch interface strings' });
    }
  });

  app.get('/api/interface-translations', authMiddleware, async (req: AuthRequest, res) => {
    try {
      // Return stored interface translations from storage
      const translations = await storage.getInterfaceTranslations();
      res.json(translations || []);
    } catch (error) {
      console.error('Get interface translations error:', error);
      res.status(500).json({ message: 'Failed to fetch interface translations' });
    }
  });

  app.post('/api/interface-translations', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { translations } = req.body;

      if (!Array.isArray(translations)) {
        return res.status(400).json({ message: 'translations array required' });
      }

      // Save interface translations to storage
      await storage.saveInterfaceTranslations(translations);

      res.json({
        success: true,
        message: 'Interface translations saved',
        count: translations.length,
      });
    } catch (error) {
      console.error('Save interface translations error:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to save translations' });
    }
  });

  // Translate interface strings with Gemini (batched to respect API quotas)
  app.post('/api/translate-interface', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { targetLanguages } = req.body;

      if (!Array.isArray(targetLanguages) || targetLanguages.length === 0) {
        return res.status(400).json({ message: 'targetLanguages array required' });
      }

      const settings = await storage.getSettings();
      if (!settings || !settings.geminiApiKey) {
        return res.status(400).json({ message: 'Gemini API key not configured' });
      }

      if (!settings.wpUrl || !settings.wpUsername || !settings.wpPassword) {
        return res.status(400).json({ message: 'WordPress not configured' });
      }

      const sourceLanguage = settings.sourceLanguage || 'en';

      // Get interface strings from WordPress
      const { WordPressInterfaceService } = await import('./services/wordpress-interface');
      const interfaceService = new WordPressInterfaceService(settings);
      const interfaceStrings = await interfaceService.fetchInterfaceElements();

      if (interfaceStrings.length === 0) {
        return res.status(400).json({ message: 'No interface elements found on WordPress site' });
      }

      const { GeminiTranslationService } = await import('./services/gemini');
      const geminiService = new GeminiTranslationService(settings.geminiApiKey);

      const translations: any[] = [];

      for (const targetLang of targetLanguages) {
        // Batch translate all strings for a language together
        const itemsToTranslate = interfaceStrings.map(s => s.value).join('\n---\n');
        
        try {
          console.log(`[INTERFACE] Translating ${interfaceStrings.length} items to ${targetLang} as batch`);
          
          const { translatedText } = await geminiService.translateContent(
            `Translate each item below from ${sourceLanguage} to ${targetLang}. Keep the same order and format. Separate translated items with ---\n\n${itemsToTranslate}`,
            sourceLanguage,
            targetLang,
            settings.systemInstruction || undefined
          );

          // Split results back and match with original items
          const translatedItems = translatedText.split(/\n?---\n?/).map(s => s.trim()).filter(s => s);
          
          for (let i = 0; i < interfaceStrings.length && i < translatedItems.length; i++) {
            const translation = translatedItems[i].trim();
            if (translation && translation.length > 0) {
              translations.push({
                stringId: interfaceStrings[i].id,
                language: targetLang,
                translation: translation,
              });
              console.log(`[INTERFACE] Translated "${interfaceStrings[i].key}" to "${translation}"`);
            }
          }
        } catch (error) {
          console.error(`Failed to translate batch to ${targetLang}:`, error);
          // Continue with other languages
        }
      }

      // Save translations to storage
      await storage.saveInterfaceTranslations(translations);

      res.json({
        success: true,
        message: `Translated ${translations.length} interface strings`,
        translations,
      });
    } catch (error) {
      console.error('Translate interface error:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : 'Translation failed' });
    }
  });

  // Publish interface translations to WordPress
  app.post('/api/publish-interface', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { targetLanguage } = req.body;

      if (!targetLanguage) {
        return res.status(400).json({ message: 'targetLanguage required' });
      }

      const settings = await storage.getSettings();
      if (!settings || !settings.wpUrl || !settings.wpUsername || !settings.wpPassword) {
        return res.status(400).json({ message: 'WordPress not configured' });
      }

      const translations = await storage.getInterfaceTranslations();
      const targetTranslations = translations.filter((t) => t.language === targetLanguage);

      if (targetTranslations.length === 0) {
        return res.status(400).json({ message: 'No translations found for this language' });
      }

      // Publish translations to WordPress
      const { WordPressInterfaceService } = await import('./services/wordpress-interface');
      const interfaceService = new WordPressInterfaceService(settings);

      let publishedCount = 0;
      const errors: string[] = [];

      for (const translation of targetTranslations) {
        try {
          const success = await interfaceService.publishTranslationToWordPress(
            translation.stringId,
            translation.translation,
            targetLanguage
          );
          if (success) {
            publishedCount++;
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          console.error(`Failed to publish ${translation.stringId}:`, error);
          errors.push(`${translation.stringId}: ${errorMsg}`);
        }
      }

      res.json({
        success: true,
        message: `Interface translations for ${targetLanguage} published`,
        count: publishedCount,
        total: targetTranslations.length,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      console.error('Publish interface error:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : 'Publish failed' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

async function initializeDefaultAdmin() {
  try {
    const existing = await storage.getAdminByUsername('admin');
    if (!existing) {
      const hashedPassword = await bcrypt.hash('admin', 10);
      await storage.createAdmin({
        username: 'admin',
        password: hashedPassword,
      });
      console.log('✅ Default admin user created (username: admin, password: admin)');
    }
  } catch (error) {
    console.error('Failed to initialize default admin:', error);
  }
}

async function initializeQueue() {
  try {
    console.log('[QUEUE] Initializing queue from persisted jobs...');
    const allJobs = await storage.getAllTranslationJobs();
    const processingJobs = allJobs.filter(j => j.status === 'PROCESSING' || j.status === 'PENDING');
    
    if (processingJobs.length > 0) {
      console.log(`[QUEUE] Found ${processingJobs.length} pending/processing jobs to restore`);
      for (const job of processingJobs) {
        console.log(`[QUEUE] Restoring job ${job.id} for post ${job.postId} to ${job.targetLanguage}`);
        translationQueue.addJob(job.id, job.postId, job.targetLanguage);
      }
    } else {
      console.log('[QUEUE] No pending jobs to restore');
    }
  } catch (error) {
    console.error('[QUEUE] Failed to initialize queue:', error);
  }
}
