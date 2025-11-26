import type { Express } from "express";
import { createServer, type Server } from "http";
import express from "express";
import bcrypt from "bcrypt";
import { decode } from "html-entities";
import { storage } from "./storage";
import { authMiddleware, generateToken, type AuthRequest } from "./middleware/auth";
import { WordPressService } from "./services/wordpress";
import { MenuTranslationService } from "./services/menu";
import { translationQueue } from "./services/queue";
import { ContentExtractorService } from "./services/content-extractor";
import type { Settings } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  app.use(express.json());

  await initializeDefaultAdmin();
  await initializeQueue();

  // Test endpoint - should always work
  app.get('/api/test', (req, res) => {
    console.log('[DEBUG] /api/test endpoint was called!');
    res.json({ status: 'ok', message: 'API is working' });
  });

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
          totalPages: 0,
          translatedPosts: 0,
          pendingJobs: 0,
          tokensUsed: 0,
        });
      }

      let totalPosts = 0;
      let totalPages = 0;
      let translatedPosts = 0;

      // Only fetch from WordPress if actually connected
      if ((settings as any).wpConnected === 1 || (settings as any).wpConnected === true) {
        try {
          const wpService = new WordPressService(settings);
          // Get accurate counts from WordPress REST API headers
          totalPosts = await wpService.getPostsCount();
          totalPages = await wpService.getPagesCount();
          
          console.log(`[STATS] Got WordPress counts: ${totalPosts} posts, ${totalPages} pages`);
          
          // For translated posts, we still need to fetch samples to check for translations
          const posts = await wpService.getPosts();
          const pages = await wpService.getPages();
          const allContent = [...posts, ...pages];
          translatedPosts = allContent.filter(p => p.translations && Object.keys(p.translations).length > 0).length;
        } catch (error) {
          console.error('Failed to fetch WordPress posts for stats:', error);
          totalPosts = 0;
          totalPages = 0;
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

      // Calculate language coverage: percentage of translated content for each language
      const languageCoverage: Record<string, number> = {};
      
      // Language coverage is calculated from the total translated posts (not total content)
      // This shows what percentage of already-translated posts are available in each language
      const baseDenom = Math.max(translatedPosts, 1); // Use translated posts count as base
      
      console.log(`[STATS] Total content: ${totalPosts + totalPages}, Translated posts: ${translatedPosts}, Target languages: ${settings?.targetLanguages?.join(',')}, Completed jobs: ${completedJobs.length}`);
      
      if (settings?.targetLanguages?.length > 0) {
        for (const targetLang of settings.targetLanguages) {
          // Count unique posts translated to this language from completed jobs
          const postsForThisLang = new Set(
            completedJobs
              .filter(j => j.targetLanguage === targetLang)
              .map(j => j.postId)
          );
          const coveragePercent = Math.max(
            Math.round((postsForThisLang.size / baseDenom) * 100),
            postsForThisLang.size > 0 ? 1 : 0  // Show at least 1% if there are any translations
          );
          languageCoverage[targetLang] = coveragePercent;
          console.log(`[STATS] Language ${targetLang}: ${postsForThisLang.size} posts translated out of ${baseDenom} = ${coveragePercent}%`);
        }
      }

      // Disable caching for stats
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.removeHeader('ETag');
      
      res.json({
        totalPosts,
        totalPages,
        translatedPosts,
        pendingJobs,
        tokensUsed,
        languageCoverage,
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
      const { wpUrl, wpUsername, wpPassword, wpAuthMethod, sourceLanguage, targetLanguages, geminiApiKey, systemInstruction } = req.body;

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

      // Handle WordPress Auth Method - use existing if not provided
      const finalWpAuthMethod = (wpAuthMethod && wpAuthMethod.trim()) 
        ? wpAuthMethod.trim() 
        : (existingSettings?.wpAuthMethod || 'basic_auth');

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

      // Handle target languages - fetch from WordPress instead of using saved values
      let finalTargetLanguages = (Array.isArray(targetLanguages) && targetLanguages.length > 0)
        ? targetLanguages
        : [];
      
      // If no target languages provided, try to fetch them from Polylang
      if (finalTargetLanguages.length === 0 && finalWpUrl && finalWpUsername && finalWpPassword) {
        try {
          const testSettingsForLangs = {
            id: 'test',
            wpUrl: finalWpUrl,
            wpUsername: finalWpUsername,
            wpPassword: finalWpPassword,
            wpAuthMethod: finalWpAuthMethod,
            sourceLanguage: sourceLanguage || 'en',
            targetLanguages: [],
            geminiApiKey: '',
            systemInstruction: '',
            wpConnected: 0,
            updatedAt: new Date(),
          } as Settings;
          const wpService = new WordPressService(testSettingsForLangs);
          const langResult = await wpService.getPolylangLanguages();
          if (!langResult.error && langResult.codes.length > 0) {
            finalTargetLanguages = langResult.codes.filter(l => l !== (sourceLanguage || 'en'));
          }
        } catch (err) {
          console.log('Could not fetch languages from WordPress:', err);
          // Continue without languages, user can set manually
        }
      }

      // Check WordPress connection if all credentials are provided
      let wpConnected = existingSettings?.wpConnected || 0;
      if (finalWpUrl && finalWpUsername && finalWpPassword) {
        try {
          const testSettings = {
            id: 'test',
            wpUrl: finalWpUrl,
            wpUsername: finalWpUsername,
            wpPassword: finalWpPassword,
            wpAuthMethod: finalWpAuthMethod,
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
          
          // Auto-detect WordPress language if connection is successful
          if (connectionResult.success && connectionResult.language) {
            console.log(`[SETTINGS] Auto-detected WordPress language: ${connectionResult.language}`);
            // Update testSettings to use detected language if not already set
            if (!sourceLanguage || sourceLanguage === existingSettings?.sourceLanguage) {
              testSettings.sourceLanguage = connectionResult.language;
            }
          }
        } catch (error) {
          console.error('Failed to verify WordPress connection:', error);
          wpConnected = 0;
        }
      }

      // DON'T save target languages to DB - they will be fetched from WordPress via Polylang
      const settings = await storage.upsertSettings({
        wpUrl: finalWpUrl,
        wpUsername: finalWpUsername,
        wpPassword: finalWpPassword,
        wpAuthMethod: finalWpAuthMethod,
        wpConnected,
        sourceLanguage: sourceLanguage || existingSettings?.sourceLanguage || 'en',
        targetLanguages: finalTargetLanguages,  // Store what was provided or auto-fetched, but don't filter
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
      let { wpUrl, wpUsername, wpPassword, wpAuthMethod } = req.body;
      
      if (!wpUrl || !wpUsername || !wpPassword) {
        return res.status(400).json({ success: false, message: 'WordPress URL, username and password required' });
      }

      const finalWpAuthMethod = wpAuthMethod || 'basic_auth';

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
        wpAuthMethod: finalWpAuthMethod,
        sourceLanguage: existingSettings?.sourceLanguage || 'en',
        targetLanguages: existingSettings?.targetLanguages || [],
        geminiApiKey: existingSettings?.geminiApiKey || '',
        systemInstruction: existingSettings?.systemInstruction || '',
        updatedAt: new Date(),
      } as Settings;

      console.log(`[TEST CONNECTION] URL: ${testSettings.wpUrl}, User: ${testSettings.wpUsername}, AuthMethod: ${finalWpAuthMethod}`);
      const wpService = new WordPressService(testSettings);
      const result = await wpService.testConnection() as any;
      
      // Auto-load languages from Polylang if connection successful
      let detectedLanguages: string[] = [];
      let detectedSourceLanguage: string | undefined;
      
      if (result.success) {
        try {
          console.log(`[TEST CONNECTION] Connection successful, loading Polylang languages...`);
          const langResult = await wpService.getPolylangLanguages();
          if (langResult.codes && langResult.codes.length > 0) {
            detectedLanguages = langResult.codes;
            // First language is source, rest are targets
            detectedSourceLanguage = langResult.codes[0];
            console.log(`[TEST CONNECTION] Detected languages: ${detectedLanguages.join(', ')}`);
            console.log(`[TEST CONNECTION] Source language: ${detectedSourceLanguage}`);
            
            // Update settings with detected languages and mark as connected
            const targetLanguages = langResult.codes.filter(l => l !== detectedSourceLanguage);
            await storage.upsertSettings({
              ...testSettings,
              sourceLanguage: detectedSourceLanguage,
              targetLanguages: targetLanguages,
              wpConnected: 1,
            } as any);
            
            result.detectedLanguages = detectedLanguages;
            result.detectedSourceLanguage = detectedSourceLanguage;
            result.detectedTargetLanguages = targetLanguages;
          }
        } catch (langError) {
          console.log(`[TEST CONNECTION] Could not auto-load languages:`, langError instanceof Error ? langError.message : 'Unknown error');
          // Don't fail the connection test, just skip language auto-load
        }
      }
      
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
      let { wpUrl, wpUsername, wpPassword, language } = req.body;
      
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
      const result = await wpService.checkPolylangPlugin(language);
      res.json(result);
    } catch (error) {
      console.error('Check Polylang error:', error);
      res.status(500).json({ success: false, message: 'Polylang check failed' });
    }
  });

  app.post('/api/sync-languages', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const settings = await storage.getSettings();
      if (!settings || !settings.wpUrl || !settings.wpUsername || !settings.wpPassword) {
        return res.status(400).json({ success: false, message: 'WordPress not configured' });
      }

      console.log(`[SYNC LANGUAGES] Getting languages from WordPress`);
      const wpService = new WordPressService(settings);
      const result = await wpService.getPolylangLanguages();

      if (result.error) {
        let message = result.error;
        
        // Provide more helpful messages based on error type
        if (result.status === 404) {
          message = 'Polylang plugin is not installed or REST API is disabled. Please install Polylang plugin in WordPress and enable REST API.';
        } else if (result.status === 401) {
          message = 'Authentication failed. Please verify your WordPress username and password.';
        }

        console.log(`[SYNC LANGUAGES] Error: ${message}`);
        return res.status(400).json({ success: false, message });
      }

      if (result.codes.length === 0) {
        const message = 'No languages found in Polylang. Please add at least one language in WordPress > Languages.';
        console.log(`[SYNC LANGUAGES] ${message}`);
        return res.status(400).json({ success: false, message });
      }

      // Get target languages (all Polylang languages except source language)
      const sourceLanguage = settings.sourceLanguage;
      const targetLanguages = result.codes.filter(l => l !== sourceLanguage);

      console.log(`[SYNC LANGUAGES] Target languages from Polylang: ${targetLanguages.join(', ')}`);

      // DON'T save to DB - just return the languages found on WordPress
      res.json({ 
        success: true, 
        message: `Found ${result.codes.length} language(s) in Polylang`,
        languages: targetLanguages,
        polylangLanguages: result.codes
      });
    } catch (error) {
      console.error('Sync languages error:', error);
      res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Failed to sync languages' });
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

  app.get('/api/check-polylang-post/:postId', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const postId = parseInt(req.params.postId);
      const settings = await storage.getSettings();
      if (!settings || !settings.wpUrl) {
        return res.status(400).json({ success: false, message: 'WordPress not configured' });
      }

      const wpService = new WordPressService(settings);
      const result = await wpService.diagnosticCheckPolylangPostAccess(postId);
      res.json(result);
    } catch (error) {
      console.error('Check Polylang post access error:', error);
      res.status(500).json({ success: false, message: 'Polylang diagnostic check failed', error: error instanceof Error ? error.message : 'Unknown error' });
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

  // Save/update translation before publishing
  app.patch('/api/jobs/:id', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const jobId = req.params.id;
      const { translatedTitle, translatedContent } = req.body;
      const job = await storage.getTranslationJob(jobId);

      if (!job) {
        return res.status(404).json({ message: 'Job not found' });
      }

      // Update job with translated content
      const updatedJob = await storage.updateTranslationJob(jobId, {
        translatedTitle: translatedTitle || job.translatedTitle,
        translatedContent: translatedContent || job.translatedContent,
      });

      res.json(updatedJob);
    } catch (error) {
      console.error('Update job error:', error);
      res.status(500).json({ message: 'Failed to update job' });
    }
  });

  // Delete translation job
  app.delete('/api/jobs/:id', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const jobId = req.params.id;
      const job = await storage.getTranslationJob(jobId);

      if (!job) {
        return res.status(404).json({ message: 'Job not found' });
      }

      const success = await storage.deleteTranslationJob(jobId);
      
      if (success) {
        res.json({ 
          success: true, 
          message: 'Translation job deleted successfully',
        });
      } else {
        res.status(500).json({ message: 'Failed to delete job' });
      }
    } catch (error) {
      console.error('Delete job error:', error);
      res.status(500).json({ message: 'Failed to delete job' });
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

      // Validate table structure - count opening and closing tags
      const openingTables = (finalContent.match(/<table[\s>]/g) || []).length;
      const closingTables = (finalContent.match(/<\/table>/g) || []).length;
      
      if (openingTables !== closingTables) {
        return res.status(400).json({ 
          message: `Table structure error: Found ${openingTables} opening <table> tags but ${closingTables} closing </table> tags. Please fix the table markup.`,
          code: 'TABLE_STRUCTURE_ERROR'
        });
      }

      console.log(`[PUBLISH] Table validation passed: ${openingTables} table(s) found with correct structure`);

      // Get the original post to restore content structure
      const originalPost = await wpService.getPost(job.postId);
      
      // If we have block metadata, restore content to original structure
      let restoredContent = finalContent;
      let restoredMeta: Record<string, any> = {};
      
      if (job.blockMetadata && Object.keys(job.blockMetadata).length > 0) {
        try {
          const { ContentRestorerService } = await import('./services/content-restorer');
          const restored = ContentRestorerService.restoreContent(
            originalPost.content.rendered,
            originalPost.meta || {},
            finalContent,
            job.blockMetadata
          );
          restoredContent = restored.content;
          restoredMeta = restored.meta;
          console.log('[PUBLISH] Content structure restored using ContentRestorerService');
        } catch (restoreError) {
          console.warn('[PUBLISH] Failed to restore content structure, using plain content:', restoreError);
          // Fall back to plain content if restoration fails
        }
      }

      // Decode HTML entities (e.g., &lt; -> <, &gt; -> >, &amp; -> &)
      // BUT: Don't decode meta fields that contain base64 (BeBuilder, Elementor)
      const decodedContent = decode(restoredContent);
      
      // Ensure metafields are not double-decoded
      // For BeBuilder: mfn-page-items should be a base64 string
      // For Elementor: _elementor_data should be a JSON string
      if (restoredMeta['mfn-page-items'] && typeof restoredMeta['mfn-page-items'] === 'string') {
        // mfn-page-items is already correctly formatted (base64), don't decode
        console.log('[PUBLISH] BeBuilder metafield preserved as base64');
      }
      
      if (restoredMeta['_elementor_data'] && typeof restoredMeta['_elementor_data'] === 'string') {
        // _elementor_data should be valid JSON, don't decode
        console.log('[PUBLISH] Elementor metafield preserved');
      }
      
      // Create translated post in WordPress
      const newPostId = await wpService.createTranslation(
        job.postId,
        job.targetLanguage,
        finalTitle,
        decodedContent,
        restoredMeta
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

  app.post('/api/posts/:postId/publish-all', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const postId = parseInt(req.params.postId);
      const allJobs = await storage.getAllTranslationJobs();
      const completedJobs = allJobs.filter(j => j.postId === postId && j.status === 'COMPLETED');

      if (completedJobs.length === 0) {
        return res.status(400).json({ message: 'No completed translations found for this post' });
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

      const publishedIds: number[] = [];
      const errors: string[] = [];
      const originalPost = await wpService.getPost(postId);
      const translationMap: Record<string, number> = {};

      // Publish all completed translations
      for (const job of completedJobs) {
        try {
          const finalTitle = job.translatedTitle;
          const finalContent = job.translatedContent;

          if (!finalTitle || !finalContent) {
            errors.push(`${job.targetLanguage}: Missing translation content`);
            continue;
          }

          // Validate table structure
          const openingTables = (finalContent.match(/<table[\s>]/g) || []).length;
          const closingTables = (finalContent.match(/<\/table>/g) || []).length;
          
          if (openingTables !== closingTables) {
            errors.push(`${job.targetLanguage}: Table structure error (${openingTables} opening, ${closingTables} closing)`);
            continue;
          }

          // Restore content structure if metadata available
          let restoredContent = finalContent;
          let restoredMeta: Record<string, any> = {};
          
          if (job.blockMetadata && Object.keys(job.blockMetadata).length > 0) {
            try {
              const { ContentRestorerService } = await import('./services/content-restorer');
              const restored = ContentRestorerService.restoreContent(
                originalPost.content.rendered,
                originalPost.meta || {},
                finalContent,
                job.blockMetadata
              );
              restoredContent = restored.content;
              restoredMeta = restored.meta;
            } catch (restoreError) {
              console.warn(`[PUBLISH-ALL] Failed to restore content for ${job.targetLanguage}`, restoreError);
            }
          }

          // Decode HTML entities (e.g., &lt; -> <, &gt; -> >, &amp; -> &)
          const decodedContent = decode(restoredContent);
          
          // Ensure metafields are not corrupted
          if (restoredMeta['mfn-page-items'] && typeof restoredMeta['mfn-page-items'] === 'string') {
            console.log('[PUBLISH-ALL] BeBuilder metafield preserved as base64');
          }
          if (restoredMeta['_elementor_data'] && typeof restoredMeta['_elementor_data'] === 'string') {
            console.log('[PUBLISH-ALL] Elementor metafield preserved');
          }
          
          // Create translation
          const newPostId = await wpService.createTranslation(
            job.postId,
            job.targetLanguage,
            finalTitle,
            decodedContent,
            restoredMeta
          );
          
          publishedIds.push(newPostId);
          translationMap[job.targetLanguage] = newPostId;
          console.log(`[PUBLISH-ALL] Published ${job.targetLanguage} as post #${newPostId}`);
        } catch (error) {
          errors.push(`${job.targetLanguage}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Link all translations back to the source post (so source shows all translations in Polylang)
      if (publishedIds.length > 0) {
        await wpService.linkTranslationsToSource(postId, translationMap);
      }

      res.json({ 
        success: true, 
        message: `Published ${publishedIds.length} translations`,
        publishedCount: publishedIds.length,
        publishedIds,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      console.error('Publish all error:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : 'Publish all failed' });
    }
  });

  app.post('/api/cleanup', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { postId, targetLanguages } = req.body;

      if (!postId || !Array.isArray(targetLanguages) || targetLanguages.length === 0) {
        return res.status(400).json({ message: 'postId and targetLanguages array required' });
      }

      const settings = await storage.getSettings();
      if (!settings || !settings.wpUrl) {
        return res.status(400).json({ message: 'WordPress not configured' });
      }

      const wpService = new WordPressService(settings);
      
      // Delete all translations
      const result = await wpService.deleteTranslations(postId, targetLanguages);
      
      res.json({ 
        success: true, 
        message: `Deleted ${result.deletedCount} translations`,
        deletedCount: result.deletedCount,
        errors: result.errors.length > 0 ? result.errors : undefined,
      });
    } catch (error) {
      console.error('Cleanup error:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : 'Cleanup failed' });
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

  // Diagnostic endpoint for checking Polylang REST API access (no auth required)
  app.get('/api/check-polylang-post/:postId', async (req, res) => {
    try {
      const postId = parseInt(req.params.postId);
      if (isNaN(postId)) {
        return res.status(400).json({ status: 'INVALID_ID', details: 'Post ID must be a number' });
      }

      const settings = await storage.getSettings();
      if (!settings || !settings.wpUrl) {
        return res.status(400).json({ status: 'NO_WP_CONFIG', details: 'WordPress not configured' });
      }

      const wpService = new WordPressService(settings);
      const result = await wpService.diagnosticCheckPolylangPostAccess(postId);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        status: 'EXCEPTION',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Menu translation endpoints
  app.get('/api/menus/check-plugin', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const settings = await storage.getSettings();
      if (!settings || !settings.wpUrl) {
        return res.status(400).json({ message: 'WordPress not configured' });
      }

      const menuService = new MenuTranslationService(settings);
      const result = await menuService.checkPluginActive();
      res.json(result);
    } catch (error) {
      console.error('Check plugin error:', error);
      res.status(500).json({ active: false, message: 'Failed to check plugin' });
    }
  });

  app.get('/api/menus', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const settings = await storage.getSettings();
      if (!settings || !settings.wpUrl) {
        return res.status(400).json({ message: 'WordPress not configured' });
      }

      const menuService = new MenuTranslationService(settings);
      const menus = await menuService.getMenus();
      res.json(menus);
    } catch (error) {
      console.error('Get menus error:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to fetch menus' });
    }
  });

  app.get('/api/menus/:menuId/items', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const menuId = parseInt(req.params.menuId);
      const settings = await storage.getSettings();
      if (!settings || !settings.wpUrl) {
        return res.status(400).json({ message: 'WordPress not configured' });
      }

      const menuService = new MenuTranslationService(settings);
      const items = await menuService.getMenuItems(menuId);
      res.json(items);
    } catch (error) {
      console.error('Get menu items error:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to fetch menu items' });
    }
  });

  app.post('/api/menus/translate', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { menuId, targetLanguage } = req.body;
      const settings = await storage.getSettings();
      if (!settings || !settings.wpUrl || !settings.geminiApiKey) {
        return res.status(400).json({ message: 'WordPress or Gemini not configured' });
      }

      const menuService = new MenuTranslationService(settings);
      const { GeminiTranslationService } = await import('./services/gemini');
      const gi = new GeminiTranslationService(settings.geminiApiKey);
      const languageNames: Record<string, string> = { 'en': 'English', 'cs': 'Čeština', 'kk': 'Қазақша' };
      
      const translatedItems: any[] = [];
      let menusToTranslate: any[] = [];
      let languagesToTranslate: string[] = [];

      // Get menus to translate
      if (menuId === 'all') {
        menusToTranslate = await menuService.getMenus();
      } else {
        const allMenus = await menuService.getMenus();
        const menu = allMenus.find((m: any) => m.term_id === menuId);
        if (!menu) {
          return res.status(404).json({ message: 'Menu not found' });
        }
        menusToTranslate = [menu];
      }

      // Get languages to translate to
      if (targetLanguage === 'all') {
        languagesToTranslate = ['en', 'cs', 'kk'];
      } else {
        languagesToTranslate = [targetLanguage];
      }

      const collectTranslatedItem = async (item: any, lang: string, menuTermId: number): Promise<void> => {
        try {
          // Use translateTitle which returns a string directly, not an object
          const translatedTitle = await gi.translateTitle(item.title, 'ru', lang);
          console.log(`[MENU] Translated "${item.title}" to "${translatedTitle}" (${lang})`);
          translatedItems.push({
            ID: item.ID,
            originalTitle: item.title,
            translatedTitle: translatedTitle || item.title,
            url: item.url,
            menuId: menuTermId,
            targetLanguage: lang,
          });
          
          // Translate child items if they exist
          if (item.children && Array.isArray(item.children)) {
            for (const child of item.children) {
              await collectTranslatedItem(child, lang, menuTermId);
            }
          }
        } catch (e) {
          console.warn(`[MENU] Failed to translate "${item.title}" to ${lang}:`, e);
        }
      };

      // Translate all menus in all target languages
      for (const menu of menusToTranslate) {
        for (const lang of languagesToTranslate) {
          try {
            const items = await menuService.getMenuItems(menu.term_id);
            console.log(`[MENU] Translating menu "${menu.name}" to ${languageNames[lang] || lang}...`);
            
            for (const item of items) {
              await collectTranslatedItem(item, lang, menu.term_id);
            }
          } catch (e) {
            console.warn(`[MENU] Error translating menu ${menu.name}:`, e);
          }
        }
      }

      // Save to database
      for (const item of translatedItems) {
        await storage.createTranslatedMenuItem({
          menuId: item.menuId,
          itemId: item.ID,
          targetLanguage: item.targetLanguage,
          originalTitle: item.originalTitle,
          translatedTitle: item.translatedTitle,
          originalUrl: item.url,
        });
      }

      const menuNames = menusToTranslate.map(m => m.name).join(', ');
      const langLabels = languagesToTranslate.map(l => languageNames[l] || l).join(', ');

      console.log(`[MENU] ✓ Translated ${translatedItems.length} items for menus: ${menuNames} to: ${langLabels}`);
      
      res.json({
        success: true,
        message: `Menus translated to: ${langLabels}`,
        menuNames: menuNames,
        itemsCount: translatedItems.length,
        items: translatedItems,
      });
    } catch (error) {
      console.error('Translate menu error:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : 'Translation failed' });
    }
  });

  app.post('/api/menus/publish', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { items } = req.body;
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ message: 'Invalid items format' });
      }

      const settings = await storage.getSettings();
      if (!settings || !settings.wpUrl) {
        return res.status(400).json({ message: 'WordPress not configured' });
      }

      console.log(`[MENU] Publishing ${items.length} translated items to WordPress...`);

      const menuService = new MenuTranslationService(settings);
      let successCount = 0;
      let errorCount = 0;

      // Update menu items in WordPress through WP REST API
      for (const item of items) {
        try {
          console.log(`[MENU] Publishing item: ${item.originalTitle} → ${item.translatedTitle}`);
          await menuService.updateMenuItem(item.menuId, item.ID, item.translatedTitle);
          successCount++;

          // Delete from database after successful publication
          try {
            await storage.deleteTranslatedMenuItems(item.menuId, item.targetLanguage);
          } catch (e) {
            console.warn('[MENU] Error deleting from DB:', e);
          }
        } catch (e) {
          console.error(`[MENU] Failed to publish item ${item.ID}:`, e);
          errorCount++;
        }
      }

      console.log(`[MENU] ✓ Published ${successCount}/${items.length} menu items (${errorCount} errors)`);

      res.json({
        success: errorCount === 0,
        message: `Published ${successCount}/${items.length} menu items`,
        itemsCount: successCount,
        errors: errorCount,
      });
    } catch (error) {
      console.error('Publish menu error:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : 'Publication failed' });
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
