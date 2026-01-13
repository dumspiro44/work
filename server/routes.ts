import type { Express } from "express";
import { createServer, type Server } from "http";
import express from "express";
import bcrypt from "bcrypt";
import { decode } from "html-entities";
import { storage } from "./storage";
import { authMiddleware, generateToken, type AuthRequest } from "./middleware/auth";
import { WordPressService } from "./services/wordpress";
import { WordPressInterfaceService } from "./services/wordpress-interface";
import { ContentExtractorService } from "./services/content-extractor";
import { RefactoringService } from "./services/refactoring";
import { translationQueue } from "./services/queue";
import { DeepLTranslationService as DeepLService } from "./services/deepl";
import { MenuTranslationService } from "./services/menu";
import { GeminiTranslationService } from "./services/gemini";
import { verifyToken } from "./middleware/auth";
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
          languageCoverage: {}
        });
      }

      let totalPosts = 0;
      let totalPages = 0;
      let totalSourceItems = 0;
      let totalTranslations = 0;
      const languageCoverage: Record<string, any> = {};

      // Only fetch from WordPress if actually connected
      if ((settings as any).wpConnected === 1 || (settings as any).wpConnected === true) {
        try {
          const wpService = new WordPressService(settings);
          
          // 1. Get total counts for dashboard cards
          totalPosts = await wpService.getPostsCount('post');
          totalPages = await wpService.getPostsCount('page');
          
          // 2. Load ALL content to calculate accurate language coverage
          // We need to know which source posts have which translations
          let allContent: any[] = [];
          
          // Helper to fetch all pages of a content type
          const fetchAll = async (type: 'post' | 'page') => {
            let page = 1;
            let hasMore = true;
            while (hasMore && page <= 50) { // Limit to 5000 items per type for performance
              const result = await wpService.getPosts(page, 100, '', type);
              allContent.push(...result.posts);
              hasMore = result.posts.length === 100;
              page++;
            }
          };

          await Promise.all([fetchAll('post'), fetchAll('page')]);

          const sourceLang = (settings.sourceLanguage || 'en').toLowerCase();
          
          // Separate source items and translations
          const sourceItems = allContent.filter(p => {
            const pLang = (p.lang || '').toLowerCase();
            return pLang === sourceLang || pLang.startsWith(sourceLang + '_');
          });
          
          totalSourceItems = sourceItems.length;
          
          const translations = allContent.filter(p => {
            const pLang = (p.lang || '').toLowerCase();
            return pLang !== '' && pLang !== sourceLang && !pLang.startsWith(sourceLang + '_');
          });
          
          totalTranslations = translations.length;

          // 3. Calculate coverage percentage and counts for each target language
          if (settings.targetLanguages && totalSourceItems > 0) {
            settings.targetLanguages.forEach(targetLang => {
              const targetLangLower = targetLang.toLowerCase();
              
              // Simple and robust: Count how many items in allContent are in this target language
              const langTranslations = allContent.filter(p => {
                const pLang = (p.lang || '').toLowerCase();
                return pLang === targetLangLower || pLang.startsWith(targetLangLower + '_') || targetLangLower.startsWith(pLang + '_');
              }).length;

              // Percentage is translations in this language divided by total items in source language
              // Use one decimal place for better precision in small datasets
              const percentage = (langTranslations / totalSourceItems) * 100;
              
              // Store as object with count and percentage
              languageCoverage[targetLang] = {
                count: langTranslations,
                percentage: Number(percentage.toFixed(1))
              };
              
              console.log(`[STATS] Language ${targetLang}: ${langTranslations}/${totalSourceItems} (${percentage.toFixed(1)}%)`);
            });
          }

          console.log(`[STATS] Calculated coverage:`, languageCoverage);
          console.log(`[STATS] Total source items: ${totalSourceItems}, Total translations: ${totalTranslations}`);
        } catch (error) {
          console.error('Failed to fetch WordPress data for stats:', error);
        }
      }

      const jobs = await storage.getAllTranslationJobs();
      const pendingJobs = jobs.filter(j => j.status === 'PENDING' || j.status === 'PROCESSING').length;
      const tokensUsed = jobs.reduce((sum, j) => sum + (j.tokensUsed || 0), 0);
      
      // Disable caching for stats
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      
      res.json({
        totalPosts,
        totalPages,
        translatedPosts: totalTranslations, // Show total number of translation versions
        pendingJobs,
        tokensUsed,
        languageCoverage,
      });
    } catch (error) {
      console.error('Stats error:', error);
      res.status(500).json({ message: 'Failed to fetch stats' });
    }
  });

  // Check WordPress connection status - for real-time validation
  app.get('/api/wordpress-check', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const settings = await storage.getSettings();
      
      // If no credentials configured, not connected
      if (!settings?.wpUrl || !settings?.wpUsername || !settings?.wpPassword) {
        return res.json({ connected: false });
      }
      
      // Try to actually connect and verify credentials work
      try {
        const wpService = new WordPressService(settings);
        const isConnected = await wpService.checkConnection();
        res.json({ connected: isConnected });
      } catch (error) {
        console.log('[WORDPRESS-CHECK] Connection test failed:', error);
        res.json({ connected: false });
      }
    } catch (error) {
      console.error('WordPress check error:', error);
      res.json({ connected: false });
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
      
      // Auto-detect source language from Polylang if connected but sourceLanguage not set properly
      let finalSourceLanguage = settings.sourceLanguage || 'en';
      if (settings.wpUrl && settings.wpUsername && settings.wpPassword && (!settings.sourceLanguage || settings.sourceLanguage.length === 0)) {
        try {
          const wpService = new WordPressService(settings);
          const detectedLang = await wpService.detectWordPressLanguage();
          if (detectedLang) {
            finalSourceLanguage = detectedLang;
            console.log(`[SETTINGS] Auto-detected and returning source language: ${detectedLang}`);
          }
        } catch (err) {
          console.log(`[SETTINGS] Could not auto-detect language from WordPress: ${err}`);
        }
      }
      
      const maskedSettings = {
        ...settings,
        sourceLanguage: finalSourceLanguage,
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
      
      // Get available languages from Polylang for validation
      let availablePolylangLanguages: string[] = [];
      let polylangError: string | null = null;
      
      if (finalWpUrl && finalWpUsername && finalWpPassword) {
        try {
      const testSettings = {
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
        lastContentCount: existingSettings?.lastContentCount || 0,
        updatedAt: new Date(),
      } as any;
      const wpService = new WordPressService(testSettings);
          const langResult = await wpService.getPolylangLanguages();
          if (!langResult.error && langResult.codes.length > 0) {
            availablePolylangLanguages = langResult.codes;
            console.log(`[SETTINGS] Available Polylang languages: ${availablePolylangLanguages.join(', ')}`);
          } else if (langResult.error) {
            polylangError = langResult.error;
            console.log(`[SETTINGS] Polylang error: ${polylangError}`);
          }
        } catch (err) {
          polylangError = err instanceof Error ? err.message : 'Unknown error';
          console.log(`[SETTINGS] Could not fetch languages from Polylang:`, err);
        }
      }
      
      // If user provided target languages, validate they exist in Polylang
      if (finalTargetLanguages.length > 0) {
        // If we couldn't get Polylang languages but user is trying to set them, that's an error
        if (availablePolylangLanguages.length === 0) {
          console.log(`[SETTINGS] Cannot validate target languages - Polylang not available`);
          return res.status(400).json({ 
            success: false,
            message: `Cannot validate language codes - Polylang plugin is not properly configured or accessible. ${polylangError ? 'Error: ' + polylangError : 'Please check Polylang installation.'}`,
          });
        }
        
        // Now validate against available languages
        const invalidLanguages = finalTargetLanguages.filter(lang => 
          !availablePolylangLanguages.some(pl => pl.toLowerCase() === lang.toLowerCase())
        );
        
        if (invalidLanguages.length > 0) {
          console.log(`[SETTINGS] Invalid target languages: ${invalidLanguages.join(', ')}`);
          return res.status(400).json({ 
            success: false,
            message: `Invalid language code(s): ${invalidLanguages.join(', ')}. Available languages in Polylang: ${availablePolylangLanguages.join(', ')}`,
            availableLanguages: availablePolylangLanguages
          });
        }
      }
      
      // If no target languages provided, try to fetch them from Polylang
      if (finalTargetLanguages.length === 0 && availablePolylangLanguages.length > 0) {
        finalTargetLanguages = availablePolylangLanguages.filter(l => l !== (sourceLanguage || 'en'));
        console.log(`[SETTINGS] Auto-set target languages from Polylang: ${finalTargetLanguages.join(', ')}`);
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

      // Use the default language from Polylang as source language
      const finalSourceLanguage = result.defaultLanguage || result.codes[0];
      const targetLanguages = result.codes.filter(l => l !== finalSourceLanguage);

      console.log(`[SYNC LANGUAGES] Default language from Polylang: ${finalSourceLanguage}, Target languages: ${targetLanguages.join(', ')}`);

      // Return languages and default language
      res.json({ 
        success: true, 
        message: `Found ${result.codes.length} language(s) in Polylang`,
        languages: targetLanguages,
        polylangLanguages: result.codes,
        defaultLanguage: finalSourceLanguage
      });
    } catch (error) {
      console.error('Sync languages error:', error);
      res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Failed to sync languages' });
    }
  });

  // Get ALL posts/pages for pre-loading
  app.get('/api/posts/all', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const settings = await storage.getSettings();
      if (!settings || !settings.wpUrl) {
        console.log('[GET POSTS ALL] No settings or wpUrl');
        return res.json({ data: [] });
      }

      console.log('[GET POSTS ALL] Loading all posts and pages...');
      const wpService = new WordPressService(settings);
      
      // Load all posts in batches
      let allPosts: any[] = [];
      let postsPage = 1;
      let hasMorePosts = true;
      while (hasMorePosts) {
        const result = await wpService.getPosts(postsPage, 100, undefined, 'post');
        if (result.posts.length === 0) break;
        allPosts.push(...result.posts);
        hasMorePosts = result.posts.length === 100;
        postsPage++;
      }
      
      // Load all pages in batches
      let allPages: any[] = [];
      let pagesPage = 1;
      let hasMorePages = true;
      while (hasMorePages) {
        const result = await wpService.getPosts(pagesPage, 100, undefined, 'page');
        if (result.posts.length === 0) break;
        allPages.push(...result.posts);
        hasMorePages = result.posts.length === 100;
        pagesPage++;
      }
      
      const allContent = [...allPosts, ...allPages];
      console.log(`[GET POSTS ALL] ✓ Loaded ${allContent.length} items (${allPosts.length} posts, ${allPages.length} pages)`);
      
      res.json({ data: allContent });
    } catch (error) {
      console.error('[GET POSTS ALL] Error:', error);
      res.status(500).json({ data: [] });
    }
  });

  app.get('/api/posts', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const settings = await storage.getSettings();
      if (!settings || !settings.wpUrl) {
        console.log('[GET POSTS] No settings or wpUrl');
        return res.json({ data: [], total: 0 });
      }

      // Get pagination, language filter, search, translation status, and content type params
      const page = parseInt((req.query.page as string) || '1', 10);
      const perPage = parseInt((req.query.per_page as string) || '10', 10);
      const filterLang = (req.query.lang as string);
      const searchName = (req.query.search as string) || '';
      const translationStatus = (req.query.translation_status as string) || 'all';
      const contentType = (req.query.content_type as string) || 'all';
      const postType = (req.query.post_type as string) || 'all';
      
      console.log(`[GET POSTS] Fetching page ${page}, per_page ${perPage}, lang filter: ${filterLang || 'NONE (all languages)'}, search: ${searchName}, status: ${translationStatus}, contentType: ${contentType}`);
      
      const wpService = new WordPressService(settings);
      
      // FIRST: Get REAL total counts from WordPress WITHOUT language filter
      const totalPostsOnSite = await wpService.getPostsCount('post');
      const totalPagesOnSite = await wpService.getPostsCount('page');
      
      // SECOND: Load ALL content in batches to build complete list
      // Load all posts in batches WITHOUT language filter to get complete data
      let allPosts: any[] = [];
      let postsPage = 1;
      let hasMorePosts = true;
      while (hasMorePosts) {
        // Pass 'all' or empty string to avoid language filtering in Polylang
        const result = await wpService.getPosts(postsPage, 100, '', 'post');
        if (result.posts.length === 0) break;
        allPosts.push(...result.posts);
        hasMorePosts = result.posts.length === 100;
        postsPage++;
      }
      
      // Load all pages in batches WITHOUT language filter to get complete data
      let allPages: any[] = [];
      let pagesPage = 1;
      let hasMorePages = true;
      while (hasMorePages) {
        // Pass 'all' or empty string to avoid language filtering in Polylang
        const result = await wpService.getPosts(pagesPage, 100, '', 'page');
        if (result.posts.length === 0) break;
        allPages.push(...result.posts);
        hasMorePages = result.posts.length === 100;
        pagesPage++;
      }
      
      // Combine all content
      let allContent = [...allPosts, ...allPages];
      
      // Filter by language - show posts in the selected language
      if (filterLang && filterLang !== 'all') {
        console.log(`[GET POSTS] Filtering to language: ${filterLang}`);
        const filterLangLower = filterLang.toLowerCase();
        allContent = allContent.filter(p => {
          const post = p as any;
          const postLang = (post.lang || '').toLowerCase();
          // Match 'kk' with 'kk' or 'kk_KZ'
          return postLang && (postLang === filterLangLower || postLang.startsWith(filterLangLower + '_'));
        });
      }
      
      // Filter by search name
      if (searchName) {
        console.log(`[GET POSTS] Filtering by name: ${searchName}`);
        allContent = allContent.filter(p => {
          const post = p as any;
          const title = post.title?.rendered || post.title || '';
          return title.toLowerCase().includes(searchName.toLowerCase());
        });
      }
      
      // Filter by translation status
      if (translationStatus === 'translated') {
        console.log(`[GET POSTS] Filtering to translated only`);
        allContent = allContent.filter(p => {
          const post = p as any;
          return post.translations && Object.keys(post.translations).length > 1;
        });
      } else if (translationStatus === 'untranslated') {
        console.log(`[GET POSTS] Filtering to untranslated only`);
        allContent = allContent.filter(p => {
          const post = p as any;
          return !post.translations || Object.keys(post.translations).length <= 1;
        });
      }
      
      // Filter by content type (legacy parameter)
      if (contentType === 'posts') {
        allContent = allContent.filter(p => p.type === 'post');
      } else if (contentType === 'pages') {
        allContent = allContent.filter(p => p.type === 'page');
      }
      
      // Filter by post type (new parameter)
      if (postType === 'post') {
        allContent = allContent.filter(p => p.type === 'post');
      } else if (postType === 'page') {
        allContent = allContent.filter(p => p.type === 'page');
      }
      
      // Calculate pagination
      const totalContent = allContent.length;
      const totalPagesInWP = Math.ceil(totalContent / perPage);
      
      // Apply pagination
      const startIndex = (page - 1) * perPage;
      const endIndex = startIndex + perPage;
      const paginatedContent = allContent.slice(startIndex, endIndex);
      
      console.log(`[GET POSTS] Page ${page}/${totalPagesInWP}: Total ${totalContent}, showing ${paginatedContent.length} items`);
      
      // Disable caching
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      
      res.json({
        data: paginatedContent,
        total: totalContent,
        page,
        perPage,
        totalPages: totalPagesInWP
      });
    } catch (error) {
      console.error('Get posts error:', error);
      res.status(500).json({ message: 'Failed to fetch posts' });
    }
  });

  app.post('/api/check-updates', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const settings = await storage.getSettings();
      if (!settings || !settings.wpUrl) {
        return res.status(400).json({ message: 'WordPress not configured' });
      }

      const wpService = new WordPressService(settings);
      
      // Get current totals from WordPress (ALL content, no pagination)
      let allPosts: any[] = [];
      let allPages: any[] = [];
      let page = 1;
      const perPage = 100;
      let hasMore = true;

      // Load ALL posts (full sync)
      while (hasMore) {
        const result = await wpService.getPosts(page, perPage, settings.sourceLanguage);
        allPosts.push(...result.posts);
        hasMore = result.posts.length === perPage;
        page++;
      }

      // Load ALL pages (full sync)
      page = 1;
      hasMore = true;
      while (hasMore) {
        const result = await wpService.getPages(page, perPage, settings.sourceLanguage);
        allPages.push(...result.pages);
        hasMore = result.pages.length === perPage;
        page++;
      }

      const currentCount = allPosts.length + allPages.length;
      const oldCount = settings.lastContentCount || 0;
      const newCount = Math.max(0, currentCount - oldCount);

      // Update settings with new count
      const updatedSettings = {
        ...settings,
        lastContentCount: currentCount,
      };
      await storage.upsertSettings(updatedSettings as any);

      console.log(`[CHECK UPDATES] Old count: ${oldCount}, Current: ${currentCount}, New: ${newCount}`);

      res.json({
        oldCount,
        currentCount,
        newCount,
        postsCount: allPosts.length,
        pagesCount: allPages.length,
      });
    } catch (error) {
      console.error('Check updates error:', error);
      res.status(500).json({ message: 'Failed to check updates' });
    }
  });

  app.get('/api/seo-plugin', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const settings = await storage.getSettings();
      if (!settings || !settings.wpUrl) {
        return res.json({ installed: false, plugin: null, multiple: false });
      }

      const wpService = new WordPressService(settings);
      const plugins = await wpService.getInstalledPlugins();
      
      const yoastActive = plugins.some(p => p.slug === 'wordpress-seo' && p.status === 'active');
      const rankMathActive = plugins.some(p => p.slug === 'seo-by-rank-math' && p.status === 'active');
      const aioseActive = plugins.some(p => p.slug === 'all-in-one-seo-pack' && p.status === 'active');

      const activePlugins = [];
      if (yoastActive) activePlugins.push('yoast');
      if (rankMathActive) activePlugins.push('rank-math');
      if (aioseActive) activePlugins.push('aioseo');

      const hasMultiple = activePlugins.length > 1;
      const seoPlugin = activePlugins.length > 0 ? activePlugins[0] : null;

      res.json({ 
        installed: activePlugins.length > 0, 
        plugin: seoPlugin,
        multiple: hasMultiple,
        activePlugins: activePlugins
      });
    } catch (error) {
      console.error('Get SEO plugin error:', error);
      res.json({ installed: false, plugin: null, multiple: false });
    }
  });

  app.get('/api/seo-posts', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const settings = await storage.getSettings();
      if (!settings || !settings.wpUrl) {
        return res.json([]);
      }

      const wpService = new WordPressService(settings);
      const postsResult = await wpService.getPosts();
      const pagesResult = await wpService.getPages();

      // Defensive extraction: safe against API response format variations
      const posts = postsResult?.posts ?? [];
      const pages = pagesResult?.pages ?? [];
      
      // Normalize data structure for consistent processing
      const normalize = (items: any[], type: 'post' | 'page') =>
        (Array.isArray(items) ? items : []).map((item: any) => ({
          ...item,
          id: item.id ?? 0,
          title: { rendered: item.title?.rendered ?? item.title ?? '' },
          slug: item.slug ?? '',
          type: item.type ?? type,
        }));

      const allContent = [
        ...normalize(posts, 'post'),
        ...normalize(pages, 'page'),
      ];
      
      // Filter content without Yoast focus keyword and with meaningful titles
      const postsWithoutFocusKw = allContent.filter(p => {
        const title = decode(p.title?.rendered || '').toLowerCase();
        const isGeneric = [
          'подробнее', 'read more', 'читать далее', 'далее', 
          'узнать больше', 'click here', 'перейти'
        ].some(gt => title.includes(gt));
        
        if (isGeneric) return false;

        const focusKw = (p.meta as any)?._yoast_wpseo_focuskw;
        return !focusKw || focusKw.trim() === '';
      });

      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.json(postsWithoutFocusKw);
    } catch (error) {
      console.error('Get SEO posts error:', error);
      res.status(500).json({ message: 'Failed to fetch posts' });
    }
  });

  app.patch('/api/seo-posts/:id', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const postId = parseInt(req.params.id);
      const { focusKeyword } = req.body;

      if (!focusKeyword || focusKeyword.trim() === '') {
        return res.status(400).json({ message: 'Focus keyword required' });
      }

      const settings = await storage.getSettings();
      if (!settings || !settings.wpUrl) {
        return res.status(400).json({ message: 'WordPress not configured' });
      }

      console.log(`[SEO UPDATE] Updating post ${postId} with focus keyword: "${focusKeyword}"`);

      const auth = Buffer.from(`${settings.wpUsername}:${settings.wpPassword}`).toString('base64');
      const updateUrl = new URL(`${settings.wpUrl}/wp-json/wp/v2/posts/${postId}`);

      console.log(`[SEO UPDATE] Endpoint: ${updateUrl.toString()}`);

      // Update post with meta fields directly
      const response = await fetch(updateUrl.toString(), {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + auth,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          meta: {
            _yoast_wpseo_focuskw: focusKeyword,
            _rank_math_focus_keyword: focusKeyword,
          }
        }),
      });

      const responseJson = await response.json();
      console.log(`[SEO UPDATE] Response status: ${response.status}`);
      console.log(`[SEO UPDATE] Response meta keys: ${Object.keys(responseJson.meta || {}).join(', ')}`);
      console.log(`[SEO UPDATE] Yoast focuskw in response: ${responseJson.meta?._yoast_wpseo_focuskw || 'NOT FOUND'}`);
      console.log(`[SEO UPDATE] Full meta response: ${JSON.stringify(responseJson.meta, null, 2)}`);

      if (!response.ok) {
        throw new Error(`WordPress API error: ${response.status} - ${JSON.stringify(responseJson)}`);
      }

      // Verify by fetching post immediately
      const verifyUrl = new URL(`${settings.wpUrl}/wp-json/wp/v2/posts/${postId}`);
      const verifyResponse = await fetch(verifyUrl.toString(), {
        headers: {
          'Authorization': 'Basic ' + auth,
        }
      });

      const verifyJson = await verifyResponse.json();
      console.log(`[SEO UPDATE] Verification - Stored focuskw: ${verifyJson.meta?._yoast_wpseo_focuskw || 'NOT FOUND'}`);
      console.log(`[SEO UPDATE] Verification - All meta: ${JSON.stringify(verifyJson.meta, null, 2)}`);

      res.json({ message: 'Focus keyword updated successfully' });
    } catch (error) {
      console.error('Update SEO post error:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to update focus keyword' });
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
      
      // Always use the primary language post as source if available
      let sourcePostId = job.postId;
      try {
        const sourceLang = settings.sourceLanguage || 'ru';
        const allTranslations = (await (wpService as any).getPostTranslations(job.postId)) || {};
        if (allTranslations[sourceLang]) {
          sourcePostId = allTranslations[sourceLang];
          console.log(`[JOB] Found primary language (${sourceLang}) version for post ${job.postId}: ${sourcePostId}`);
        }
      } catch (e) {
        console.warn(`[JOB] Could not find primary language version, using original post ID ${job.postId}`);
      }
      
      const sourcePost = await wpService.getPost(sourcePostId);

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

  // Get published translation for editing
  app.get('/api/posts/:postId/translations/:lang', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const postId = parseInt(req.params.postId);
      const targetLang = req.params.lang;

      const settings = await storage.getSettings();
      if (!settings) {
        return res.status(400).json({ message: 'Settings not configured' });
      }

      const wpService = new WordPressService(settings);
      
      // Always use the primary language post as source if available
      let sourcePostId = postId;
      try {
        const sourceLang = settings.sourceLanguage || 'ru';
        const allTranslations = (await (wpService as any).getPostTranslations(postId)) || {};
        if (allTranslations[sourceLang]) {
          sourcePostId = allTranslations[sourceLang];
          console.log(`[EDIT] Found primary language (${sourceLang}) version for post ${postId}: ${sourcePostId}`);
        }
      } catch (e) {
        console.warn(`[EDIT] Could not find primary language version, using original post ID ${postId}`);
      }

      const sourcePost = await wpService.getPost(sourcePostId);
      const translatedPost = await wpService.getTranslation(postId, targetLang);

      if (!translatedPost) {
        return res.status(404).json({ message: 'Translation not found' });
      }

      res.json({ 
        job: {
          id: `published-${postId}-${targetLang}`,
          postId,
          postTitle: sourcePost.title.rendered,
          targetLanguage: targetLang,
          translatedTitle: translatedPost.title.rendered,
          translatedContent: translatedPost.content.rendered,
        },
        sourcePost: {
          title: sourcePost.title.rendered,
          content: sourcePost.content.rendered,
        },
      });
    } catch (error) {
      console.error('Get published translation error:', error);
      res.status(500).json({ message: 'Failed to fetch translation' });
    }
  });

  // Save/update translation before publishing
  app.patch('/api/jobs/:id', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const jobId = req.params.id;
      const { translatedTitle, translatedContent, status } = req.body;
      console.log(`[PATCH JOBS] Updating job ${jobId}, status: ${status}`);
      
      const job = await storage.getTranslationJob(jobId);

      if (!job) {
        return res.status(404).json({ message: 'Job not found' });
      }

      // Update job with translated content and/or status
      const updateData: any = {
        translatedTitle: translatedTitle || job.translatedTitle,
        translatedContent: translatedContent || job.translatedContent,
      };
      
      if (status) {
        updateData.status = status;
        console.log(`[PATCH JOBS] Setting status to: ${status}`);
      }
      
      const updatedJob = await storage.updateTranslationJob(jobId, updateData);
      console.log(`[PATCH JOBS] Updated job:`, { id: updatedJob?.id, status: updatedJob?.status });

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
      
      // Copy Yoast SEO meta fields from original post
      const meta: any = originalPost.meta || {};
      if (meta && typeof meta === 'object') {
        const yoastFields = Object.keys(meta)
          .filter(key => key.startsWith('_yoast_wpseo_'))
          .reduce((acc: Record<string, any>, key: string) => {
            acc[key] = meta[key];
            return acc;
          }, {});
        
        // Override focus keyword with translated title
        if (Object.keys(yoastFields).length > 0) {
          yoastFields['_yoast_wpseo_focuskw'] = finalTitle;
          Object.assign(restoredMeta, yoastFields);
          console.log('[PUBLISH] Yoast SEO meta fields copied, focus keyword set to:', finalTitle);
        }
      }
      
      // Create translated post in WordPress
      const newPostId = await wpService.createTranslation(
        job.postId,
        job.targetLanguage,
        finalTitle,
        decodedContent,
        restoredMeta
      );

      // Mark job as PUBLISHED instead of deleting it
      await storage.updateTranslationJob(jobId, { status: 'PUBLISHED' });
      console.log(`[PUBLISH] Job ${jobId} marked as PUBLISHED`);

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
          
          // Copy Yoast SEO meta fields from original post
          const meta: any = originalPost.meta || {};
          if (meta && typeof meta === 'object') {
            const yoastFields = Object.keys(meta)
              .filter(key => key.startsWith('_yoast_wpseo_'))
              .reduce((acc: Record<string, any>, key: string) => {
                acc[key] = meta[key];
                return acc;
              }, {});
            
            // Override focus keyword with translated title
            if (Object.keys(yoastFields).length > 0) {
              yoastFields['_yoast_wpseo_focuskw'] = finalTitle;
              Object.assign(restoredMeta, yoastFields);
              console.log('[PUBLISH-ALL] Yoast SEO meta fields copied, focus keyword set to:', finalTitle);
            }
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

  // Image upload endpoint
  app.post('/api/upload-image', express.raw({ type: 'image/*', limit: '50mb' }), async (req: AuthRequest, res) => {
    try {
      // Get token from query parameter
      const token = req.query.token as string;
      const filename = req.query.filename as string;
      
      if (!token) {
        return res.status(401).json({ message: 'No token provided' });
      }
      
      const decoded = verifyToken(token);
      if (!decoded) {
        return res.status(401).json({ message: 'Invalid or expired token' });
      }

      const settings = await storage.getSettings();
      if (!settings || !settings.wpUrl) {
        return res.status(400).json({ message: 'WordPress not configured' });
      }

      if (!req.body || req.body.length === 0) {
        return res.status(400).json({ message: 'No file provided' });
      }

      const contentType = req.get('content-type') || 'image/jpeg';

      // Upload to WordPress media library
      const uploadUrl = `${settings.wpUrl}/wp-json/wp/v2/media`;
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${settings.wpUsername}:${settings.wpPassword}`).toString('base64'),
          'Content-Disposition': `attachment; filename="${filename || 'image.jpg'}"`,
          'Content-Type': contentType,
        },
        body: req.body,
      });

      if (!uploadResponse.ok) {
        const error = await uploadResponse.json();
        console.error('[UPLOAD] WordPress error:', error);
        return res.status(uploadResponse.status).json({ message: 'Failed to upload image to WordPress' });
      }

      const mediaItem = await uploadResponse.json();
      console.log(`[UPLOAD] ✓ Image uploaded: ${mediaItem.id}`);

      res.json({
        success: true,
        url: mediaItem.source_url,
        id: mediaItem.id,
        message: 'Image uploaded successfully',
      });
    } catch (error) {
      console.error('[UPLOAD] Error:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to upload image' });
    }
  });

  // NEW: Create post/page/news in WordPress with instant translations
  app.post('/api/create-content', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const settings = await storage.getSettings();
      if (!settings || !settings.wpUrl || !settings.geminiApiKey) {
        return res.status(400).json({ message: 'WordPress and Gemini not configured' });
      }

      const { title, content, postType, sourceLanguage, targetLanguages: reqTargetLanguages } = req.body;

      if (!title || !content || !postType) {
        return res.status(400).json({ message: 'Title, content, and postType are required' });
      }

      const srcLang: string = sourceLanguage || settings.sourceLanguage || 'en';
      const targetLangs: string[] = ((reqTargetLanguages || settings.targetLanguages || []) as string[]).filter((l: string) => l !== srcLang);
      
      if (targetLangs.length === 0) {
        return res.status(400).json({ message: 'Please select at least one target language' });
      }

      // Map postType to WordPress endpoint
      const endpoint = postType === 'cat_news' ? 'cat_news' : postType === 'page' ? 'pages' : 'posts';
      
      // Initialize Gemini for translations
      const gemini = new GeminiTranslationService(settings.geminiApiKey);
      
      console.log(`[CREATE CONTENT] Creating content with ${targetLangs.length} translations`);

      // Create original post
      const createUrl = `${settings.wpUrl}/wp-json/wp/v2/${endpoint}`;
      const originResponse = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${settings.wpUsername}:${settings.wpPassword}`).toString('base64'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          content,
          status: 'publish',
          lang: srcLang,
        }),
      });

      if (!originResponse.ok) {
        const error = await originResponse.json();
        console.error('[CREATE CONTENT] Original post error:', error);
        return res.status(originResponse.status).json({ message: 'Failed to create original content' });
      }

      const originPost = await originResponse.json();
      console.log(`[CREATE CONTENT] ✓ Created original ${postType} ID ${originPost.id}`);

      // Translate and create posts for each target language
      const createdPosts: any[] = [{ id: originPost.id, lang: srcLang, title, content }];
      let successCount = 1;

      for (const targetLang of targetLangs) {
        try {
          console.log(`[CREATE CONTENT] Translating to ${targetLang}...`);
          
          // Translate title and content
          const translatedTitle = await gemini.translateTitle(title, srcLang, targetLang);
          const translatedContent = await gemini.translateContent(content, srcLang, targetLang);

          console.log(`[CREATE CONTENT] ✓ Translated to ${targetLang}`);

          // Create translated post
          const translatedResponse = await fetch(createUrl, {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + Buffer.from(`${settings.wpUsername}:${settings.wpPassword}`).toString('base64'),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              title: translatedTitle,
              content: translatedContent,
              status: 'publish',
              lang: targetLang,
              translations: {
                [srcLang]: originPost.id,
              },
            }),
          });

          if (translatedResponse.ok) {
            const translatedPost = await translatedResponse.json();
            createdPosts.push({ id: translatedPost.id, lang: targetLang, title: translatedTitle });
            successCount++;
            console.log(`[CREATE CONTENT] ✓ Created ${targetLang} translation ID ${translatedPost.id}`);
          } else {
            const errorText = await translatedResponse.text();
            console.error(`[CREATE CONTENT] Failed to create ${targetLang} translation:`, errorText);
          }
        } catch (error) {
          console.error(`[CREATE CONTENT] Translation error for ${targetLang}:`, error);
        }
      }

      res.json({
        success: successCount === targetLangs.length + 1,
        postId: originPost.id,
        createdPosts: createdPosts.map(p => ({ id: p.id, lang: p.lang })),
        message: `✓ Created content in ${successCount} language(s) (${srcLang} + ${successCount - 1} translations)`,
      });
    } catch (error) {
      console.error('Create content error:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to create content' });
    }
  });

  // Archive endpoints
  app.get('/api/archive/all-content', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const settings = await storage.getSettings();
      if (!settings?.wpUrl) {
        console.log('[ARCHIVE] No WordPress URL configured');
        return res.json({ content: [] });
      }

      const { year, month, contentType } = req.query;
      console.log(`[ARCHIVE] All-content called with filters: year=${year || 'none'}, month=${month || 'none'}, type=${contentType || 'all'}`);
      
      const wpService = new WordPressService(settings);
      const parsedYear = year && year !== 'none' ? parseInt(year as string) : undefined;
      const parsedMonth = month && month !== 'none' ? parseInt(month as string) : undefined;
      
      const content = await wpService.getContentByDateRange(
        parsedYear,
        parsedMonth,
        contentType as string
      );
      
      console.log(`[ARCHIVE] Returning ${content.length} items`);
      res.json({ content });
    } catch (error) {
      console.error('[ARCHIVE] All-content error:', error);
      res.status(500).json({ message: 'Failed to get content', error: error instanceof Error ? error.message : 'Unknown' });
    }
  });

  app.get('/api/archive/suggest', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const settings = await storage.getSettings();
      if (!settings?.wpUrl) {
        console.log('[ARCHIVE] No WordPress URL configured');
        return res.json({ content: [] });
      }

      const year = req.query.year ? parseInt(req.query.year as string) : undefined;
      const month = req.query.month ? parseInt(req.query.month as string) : undefined;
      const type = req.query.type as string | undefined;

      console.log(`[ARCHIVE] Suggest called with year=${year}, month=${month}, type=${type}`);
      
      const wpService = new WordPressService(settings);
      const content = await wpService.getContentByDateRange(year, month, type);
      
      console.log(`[ARCHIVE] Returning ${content.length} items`);
      res.json({ content });
    } catch (error) {
      console.error('[ARCHIVE] Suggest error:', error);
      res.status(500).json({ message: 'Failed to get content suggestions', error: error instanceof Error ? error.message : 'Unknown' });
    }
  });

  app.post('/api/archive/create-request', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { postId, postTitle, postType, postDate, year, month, reason } = req.body;
      if (!postId || !postTitle) {
        return res.status(400).json({ message: 'postId and postTitle required' });
      }

      const newRequest = await storage.createArchiveRequest({
        postId,
        postTitle,
        postType: postType || 'post',
        postDate: postDate ? new Date(postDate) : undefined,
        year,
        month,
        reason: reason || 'archive',
        status: 'pending',
      });

      res.json({ success: true, id: newRequest.id });
    } catch (error) {
      console.error('[ARCHIVE] Create request error:', error);
      res.status(500).json({ message: 'Failed to create archive request' });
    }
  });

  app.get('/api/archive/requests', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const allRequests = await storage.getArchiveRequests();
      res.json(allRequests);
    } catch (error) {
      console.error('[ARCHIVE] Get requests error:', error);
      res.status(500).json({ message: 'Failed to get requests' });
    }
  });

  app.post('/api/archive/approve', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { requestId, action } = req.body;
      if (!requestId) return res.status(400).json({ message: 'requestId required' });
      
      console.log(`[ARCHIVE] Approving request: ${requestId}, action override: ${action || 'none'}`);
      
      const archiveRequests = await storage.getArchiveRequests('pending');
      const request = archiveRequests.find(r => r.id === requestId);
      
      if (!request) {
        console.error(`[ARCHIVE] Pending request not found: ${requestId}`);
        return res.status(404).json({ message: 'Request not found' });
      }

      // Action can be from request reason or explicitly passed
      const finalAction = action || (request.reason === 'delete' ? 'delete' : 'archive');
      console.log(`[ARCHIVE] Final action for ${request.postId}: ${finalAction}`);

      // Operation in WordPress if connected
      const settings = await storage.getSettings();
      if (settings?.wpUrl) {
        try {
          const wpService = new WordPressService(settings);
          if (finalAction === 'delete') {
            const deleted = await wpService.deletePost(request.postId, request.postType);
            console.log(`[ARCHIVE] Post ${request.postId} deleting: ${deleted ? 'success' : 'failed'}`);
          } else {
            const archived = await wpService.archivePost(request.postId, request.postType);
            console.log(`[ARCHIVE] Post ${request.postId} archiving: ${archived ? 'success' : 'failed'}`);
          }
        } catch (error) {
          console.warn(`[ARCHIVE] Warning: could not process in WordPress:`, error);
        }
      }

      const updated = await storage.updateArchiveRequestStatus(requestId, 'approved');
      if (updated) {
        res.json({ 
          success: true, 
          message: finalAction === 'delete' ? 'Content deleted (trash)' : 'Content archived (draft)', 
          postId: request.postId 
        });
      } else {
        res.status(404).json({ message: 'Request not found during status update' });
      }
    } catch (error) {
      console.error('[ARCHIVE] Approve error:', error);
      res.status(500).json({ message: 'Failed to approve request' });
    }
  });

  app.post('/api/archive/reject', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { requestId } = req.body;
      if (!requestId) return res.status(400).json({ message: 'requestId required' });
      
      const updated = await storage.updateArchiveRequestStatus(requestId, 'rejected');
      if (updated) {
        res.json({ success: true, message: 'Rejected' });
      } else {
        res.status(404).json({ message: 'Request not found' });
      }
    } catch (error) {
      console.error('[ARCHIVE] Reject error:', error);
      res.status(500).json({ message: 'Failed to reject' });
    }
  });

  // Bulk archive content older than year-month
  app.post('/api/archive/bulk-archive', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { year, month } = req.body;
      if (!year || !month) return res.status(400).json({ message: 'year and month required' });
      
      const settings = await storage.getSettings();
      if (!settings?.wpUrl) {
        return res.status(400).json({ message: 'WordPress not configured' });
      }

      const wpService = new WordPressService(settings);
      const cutoffDate = new Date(year, month - 1, 1);
      
      // Get all posts older than the cutoff date
      let page = 1;
      let totalArchived = 0;
      let hasMore = true;

      while (hasMore) {
        const postsData = await wpService.getPosts(page, 100);
        if (!postsData || !postsData.posts || postsData.posts.length === 0) {
          hasMore = false;
          break;
        }

        for (const post of postsData.posts) {
          const postDate = new Date(post.date_gmt || post.date || new Date());
          if (postDate < cutoffDate) {
            // Skip if already archived
            if (post.status !== 'draft') {
              try {
                // Create request
                const newRequest = await storage.createArchiveRequest({
                  postId: post.id,
                  postTitle: (typeof post.title === 'string' ? post.title : post.title.rendered) || `Post ${post.id}`,
                  postType: post.type || 'post',
                  postDate: postDate,
                  year: postDate.getFullYear(),
                  month: postDate.getMonth() + 1,
                  status: 'approved',
                });

                // Archive immediately
                await wpService.archivePost(post.id, post.type || 'post');
                totalArchived++;
                console.log(`[ARCHIVE BULK] Archived post ${post.id}`);
              } catch (error) {
                console.warn(`[ARCHIVE BULK] Could not archive post ${post.id}:`, error);
              }
            }
          }
        }

        page++;
        if (postsData.posts.length < 100) {
          hasMore = false;
        }
      }

      res.json({ success: true, totalArchived, message: `${totalArchived} posts archived` });
    } catch (error) {
      console.error('[ARCHIVE BULK] Error:', error);
      res.status(500).json({ message: 'Failed to bulk archive' });
    }
  });

  // Content Correction endpoints
  app.get('/api/content-correction/stats', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const settings = await storage.getSettings();
      if (!settings?.wpUrl) {
        return res.json({
          totalCategories: 0,
          brokenCategories: 0,
          fixedCategories: 0,
          totalNewPosts: 0,
          issues: [],
        });
      }

      const wpService = new WordPressService(settings);
      const categories = await wpService.getCategories();
      const issues: {
        categoryId: number;
        categoryName: string;
        description: string;
        postsFound: number;
        status: string;
        contentType?: string;
      }[] = [];
      
      // Get saved issues to preserve 'fixed' status
      const savedIssues = await storage.getCategoryIssues();
      const savedMap = new Map(savedIssues.map(i => [i.categoryId, i]));

      for (const cat of categories) {
        const description = typeof cat.description === 'object' ? (cat.description as any).rendered : (cat.description || '');
        const catalogItems = wpService.parseHtmlCatalog(description);
        if (catalogItems.length > 0 || description.trim().length > 100) {
          const saved = savedMap.get(cat.id);
          issues.push({
            categoryId: cat.id,
            categoryName: cat.name,
            description: description,
            postsFound: catalogItems.length,
            status: saved?.status || 'broken',
            contentType: (saved as any)?.contentType,
          });
        } else {
          // Check if it was fixed before
          const saved = savedMap.get(cat.id);
          if (saved && saved.status === 'fixed') {
            issues.push({
              ...saved,
              description: (saved as any).description || '',
              postsFound: (saved as any).postsFound || 0,
            } as any);
          }
        }
      }

      res.json({
        totalCategories: categories.length,
        brokenCategories: issues.filter(i => i.status === 'broken').length,
        fixedCategories: issues.filter(i => i.status === 'fixed').length,
        totalNewPosts: issues.reduce((sum, i) => sum + i.postsFound, 0),
        issues,
      });
    } catch (error) {
      console.error('[CORRECTION] Stats error:', error);
      res.status(500).json({ message: 'Failed to get stats' });
    }
  });

  app.post('/api/content-correction/analyze', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const settings = await storage.getSettings();
      const { description, categoryName } = req.body;
      const refactoringService = new RefactoringService(settings!);
      
      console.log(`[CORRECTION] Rule-based analysis for ${categoryName}`);
      const result = await refactoringService.classifyOnly(description);
      
      res.json(result);
    } catch (error) {
      console.error('[CORRECTION] Analysis error:', error);
      res.status(500).json({ message: 'Analysis failed' });
    }
  });

  app.post('/api/content-correction/apply-refactoring', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const settings = await storage.getSettings();
      if (!settings?.wpUrl) {
        return res.status(400).json({ message: 'WordPress not configured' });
      }

      const { categoryId, result } = req.body;
      const wpService = new WordPressService(settings);
      
      console.log(`[CORRECTION] Applying refactoring for category ${categoryId}`);
      
      if (result.type === 'TYPE_2_CATALOG' && result.newPosts) {
        // Handle TYPE 2: Create new posts with Enrichment
        for (const post of result.newPosts) {
          // Duplicate protection
          const exists = await wpService.checkPostExists(post.slug, (post as any).link);
          if (exists) {
            console.log(`[CORRECTION] Skipping duplicate post: ${post.title}`);
            continue;
          }

          let finalContent = post.content;
          let finalFeaturedImage = post.featuredImage;

          // Enrichment step
          if ((post as any).link) {
            const enriched = await wpService.enrichContentFromUrl((post as any).link);
            if (enriched && enriched.content) {
              console.log(`[CORRECTION] Enriched content for ${post.title} from ${(post as any).link}`);
              finalContent = enriched.content;
              if (enriched.featuredImage && !finalFeaturedImage) {
                finalFeaturedImage = enriched.featuredImage;
              }
            } else {
              console.log(`[CORRECTION] Enrichment failed or skipped for ${post.title}, using fallback`);
              // Ensure body is not empty by keeping original description or a reference link
              if (!finalContent) {
                finalContent = `<p><a href="${(post as any).link}">${post.title}</a></p>`;
              }
            }
          }

          await wpService.createPostFromCatalogItem({
            title: post.title,
            description: finalContent,
            slug: post.slug,
            featured_image: finalFeaturedImage
          }, categoryId);
        }
        // After creating posts, update category description to be empty or cleaned
        await wpService.updateCategoryDescription(categoryId, result.refactoredContent || '');
      } else if (result.type === 'TYPE_1_OFFER' && result.newPosts && result.newPosts.length === 1) {
        // Handle TYPE 1 with migration: Create single post and clean category
        const post = result.newPosts[0];
        await wpService.createPostFromCatalogItem({
          title: post.title,
          description: post.content,
          slug: post.slug,
          featured_image: post.featuredImage
        }, categoryId);
        await wpService.updateCategoryDescription(categoryId, result.refactoredContent || '');
      } else if (result.refactoredContent) {
        // Handle TYPE 3, 4 or simple TYPE 1: Update description
        await wpService.updateCategoryDescription(categoryId, result.refactoredContent);
      }

      res.json({ success: true });
    } catch (error) {
      console.error('[CORRECTION] Apply refactoring error:', error);
      res.status(500).json({ message: 'Failed to apply refactoring' });
    }
  });

  app.get('/api/content-correction/preview/:categoryId', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const settings = await storage.getSettings();
      if (!settings?.wpUrl) {
        return res.status(400).json({ message: 'WordPress not configured' });
      }

      const { categoryId } = req.params;
      const wpService = new WordPressService(settings);
      
      const category = await wpService.getCategory(parseInt(categoryId));
      if (!category) {
        return res.status(404).json({ message: 'Category not found' });
      }

      const items = wpService.parseHtmlCatalog(category.description || '');
      res.json({ categoryName: category.name, items });
    } catch (error) {
      console.error('[CORRECTION] Preview error:', error);
      res.status(500).json({ message: 'Failed to fetch preview items' });
    }
  });

  app.post('/api/content-correction/scan', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const settings = await storage.getSettings();
      if (!settings?.wpUrl) {
        return res.status(400).json({ message: 'WordPress not configured' });
      }

      const wpService = new WordPressService(settings);
      const categories = await wpService.getCategories();
      console.log(`[CORRECTION] Scanned ${categories.length} categories`);

      const issues = [];
      for (const cat of categories) {
        // We include ALL categories that have any items or a non-empty description
        const description = typeof cat.description === 'object' ? (cat.description as any).rendered : (cat.description || '');
        const catalogItems = wpService.parseHtmlCatalog(description);
        const isCandidate = catalogItems.length > 0 || description.trim().length > 0;

        if (isCandidate) {
          console.log(`[CORRECTION] Including category: ${cat.name} (ID: ${cat.id}), parsed items: ${catalogItems.length}`);
          issues.push({
            categoryId: cat.id,
            categoryName: cat.name,
            description: cat.description,
            postsFound: Math.max(catalogItems.length, 1),
            status: 'broken',
          });
        }
      }

      await storage.saveCategoryIssues(issues);
      res.json({ scanned: categories.length, issuesFound: issues.length, issues });
    } catch (error) {
      console.error('[CORRECTION] Scan error:', error);
      res.status(500).json({ message: 'Scan failed' });
    }
  });

  app.post('/api/content-correction/fix', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const settings = await storage.getSettings();
      if (!settings?.wpUrl) {
        return res.status(400).json({ message: 'WordPress not configured' });
      }

      const wpService = new WordPressService(settings);
      const { categoryIds, titleOverrides } = req.body;
      console.log(`[CORRECTION] Starting fix for categories:`, categoryIds || 'ALL');
      
      const categories = await wpService.getCategories();
      console.log(`[CORRECTION] Found ${categories.length} total categories in WordPress`);

      let totalPostsCreated = 0;
      const fixed = [];

      for (const cat of categories) {
        // Filter by categoryIds if provided
        if (categoryIds && Array.isArray(categoryIds) && categoryIds.length > 0) {
          if (!categoryIds.includes(cat.id)) continue;
        }

        // Check if there's anything to convert
        const items = wpService.parseHtmlCatalog(cat.description);
        if (items.length === 0) {
          if (categoryIds?.includes(cat.id)) {
            console.log(`[CORRECTION] Category ${cat.id} (${cat.name}) selected but no items found to convert`);
          }
          continue;
        }

        console.log(`[CORRECTION] Processing category ${cat.id} (${cat.name})...`);
        console.log(`[CORRECTION] Found ${items.length} items to convert in category ${cat.id}`);
        
        let firstDescription = '';
        let postsCreated = 0;

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          try {
            // Check for title override (by link first, then by original title)
            const override = titleOverrides?.[item.link || ''] || titleOverrides?.[item.title] || item.title;
            const finalItem = { ...item, title: override };

            const postId = await wpService.createPostFromCatalogItem(finalItem, cat.id);
            if (postId) {
              postsCreated++;
              if (i === 0) firstDescription = item.description || item.title;
              console.log(`[CORRECTION] ✓ Created post ${postId} from item "${finalItem.title}"`);
            }
          } catch (err) {
            console.error(`[CORRECTION] Failed to create post for item "${item.title}":`, err);
          }
        }

        if (postsCreated > 0) {
          const newDesc = firstDescription || cat.name;
          const updated = await wpService.updateCategoryDescription(cat.id, newDesc);
          console.log(`[CORRECTION] Updated category ${cat.id} description: ${updated ? 'success' : 'failed'}`);
          
          fixed.push({ categoryId: cat.id, name: cat.name, postsCreated });
          totalPostsCreated += postsCreated;
        }
      }

      console.log(`[CORRECTION] Fix completed. Created ${totalPostsCreated} posts in ${fixed.length} categories`);
      res.json({ success: true, fixed, totalPostsCreated });
    } catch (error) {
      console.error('[CORRECTION] Fix error:', error);
      res.status(500).json({ message: 'Fix failed', error: error instanceof Error ? error.message : 'Unknown error' });
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
