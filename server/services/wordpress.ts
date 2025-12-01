import type { Settings } from '@shared/schema';
import https from 'https';
import http from 'http';

/**
 * Decode HTML entities - keep replacing until no changes
 * Handles double-encoded entities like &amp;lt;
 */
function decodeHTML(html: string): string {
  if (!html) return html;
  let result = html;
  let prevResult = '';
  let iterations = 0;
  const maxIterations = 10; // Safety limit
  
  // Keep decoding until no more changes (handles double-encoded entities)
  while (result !== prevResult && iterations < maxIterations) {
    prevResult = result;
    result = result
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
    iterations++;
  }
  
  return result;
}

export interface WordPressPost {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  status: string;
  lang?: string;
  translations?: Record<string, number>;
  meta?: Record<string, any>;
  contentType?: 'bebuilder' | 'gutenberg' | 'elementor' | 'wpbakery' | 'standard';
  type?: 'post' | 'page';
}

export class WordPressService {
  private baseUrl: string;
  private username: string;
  private password: string;
  private authMethod: string;

  constructor(settings: Settings) {
    this.baseUrl = settings.wpUrl.replace(/\/$/, '');
    this.username = settings.wpUsername;
    this.password = settings.wpPassword;
    this.authMethod = settings.wpAuthMethod || 'basic_auth';
  }

  /**
   * Ensure all img tags have alt attributes
   * Adds alt="Image" if missing
   */
  private ensureImageAltAttributes(html: string): string {
    if (!html) return html;
    
    // Simple approach: replace all <img tags with version that has alt
    return html.replace(/<img\s+([^>]*?)>/g, (match, attrs) => {
      // Check if alt attribute already exists (case-insensitive, any quote style)
      if (/alt\s*=\s*["'].*?["']/i.test(match)) {
        return match; // Already has alt
      }
      // Add alt="Image" before closing >
      return `<img ${attrs.trim()} alt="Image">`;
    });
  }

  private getAuthHeader(): string {
    // Both basic_auth and application_password use Basic Auth header format
    // Application password is used like: Basic base64(username:app_password)
    // Regular password is used like: Basic base64(username:password)
    return 'Basic ' + Buffer.from(`${this.username}:${this.password}`).toString('base64');
  }

  private async makeRequest(url: string): Promise<Response> {
    // Try native fetch first (works in Node 18+)
    try {
      return await fetch(url, {
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
          'User-Agent': 'WP-PolyLingo-Translator/1.0',
        },
        // Ignore certificate errors for self-signed certificates
        // This is safe for development/internal use
      });
    } catch (fetchError) {
      // Fall back to https module for better error handling
      return this.makeHttpsRequest(url);
    }
  }

  private makeHttpsRequest(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
          'User-Agent': 'WP-PolyLingo-Translator/1.0',
        },
        // Ignore certificate errors for self-signed certificates
        rejectUnauthorized: false,
      } as any;

      const req = client.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          // Create a Response-like object without using Response constructor
          const response = {
            status: res.statusCode || 200,
            statusText: res.statusMessage || 'OK',
            ok: (res.statusCode || 200) >= 200 && (res.statusCode || 200) < 300,
            headers: res.headers,
            text: async () => data,
            json: async () => {
              try {
                return JSON.parse(data);
              } catch (e) {
                throw new Error(`Failed to parse JSON: ${data.substring(0, 100)}`);
              }
            },
          };
          resolve(response);
        });
      });

      req.on('error', (e) => {
        reject(e);
      });

      req.end();
    });
  }

  async testConnection(): Promise<{ success: boolean; message: string; language?: string }> {
    try {
      const url = `${this.baseUrl}/wp-json/wp/v2/users/me`;
      const authHeader = this.getAuthHeader();
      
      console.log(`[WP TEST] Connecting to: ${url}`);
      console.log(`[WP TEST] Username: ${this.username}`);
      console.log(`[WP TEST] Auth header set: ${authHeader.substring(0, 20)}...`);
      console.log(`[WP TEST] Auth Method: ${this.authMethod}`);
      
      let response;
      try {
        response = await this.makeRequest(url);
      } catch (error) {
        const errorDetails = error instanceof Error ? error.message : String(error);
        console.error(`[WP TEST] Request error: ${errorDetails}`);
        
        // Check if it's a network/SSL error
        if (errorDetails.includes('ENOTFOUND') || errorDetails.includes('ECONNREFUSED') || errorDetails.includes('ETIMEDOUT')) {
          return {
            success: false,
            message: `Server not reachable: ${errorDetails}. Please verify the WordPress URL is correct and the server is online.`
          };
        }
        
        if (errorDetails.includes('certificate') || errorDetails.includes('ssl') || errorDetails.includes('EPROTO')) {
          return {
            success: false,
            message: `SSL/TLS error: ${errorDetails}. The server may have an invalid SSL certificate.`
          };
        }
        
        return { success: false, message: `Connection error: ${errorDetails}` };
      }

      console.log(`[WP TEST] Response status: ${response.status}`);
      
      if (!response.ok) {
        const responseText = await response.text();
        console.log(`[WP TEST] Response body: ${responseText.substring(0, 200)}`);
        
        // Better error messages for common issues
        if (response.status === 401) {
          // WordPress doesn't support Basic Auth by default
          return { 
            success: false, 
            message: 'HTTP 401: Unauthorized. WordPress REST API does not support Basic Authentication by default. Please install a plugin like "Basic Auth Handler" or "Application Passwords" to enable authentication. If you have Application Passwords enabled in WordPress 5.6+, generate an app password in WordPress admin panel (Users > Your Profile > Application Passwords) and use that here.' 
          };
        }
        
        if (response.status === 403) {
          return {
            success: false,
            message: 'HTTP 403: Forbidden. WordPress may require a plugin to support Basic Authentication (like "Application Passwords" or "Basic Auth Handler" plugin).'
          };
        }
        
        return { success: false, message: `HTTP ${response.status}: ${response.statusText}` };
      }

      const user = await response.json();
      
      // Try to detect WordPress language
      let detectedLanguage: string | undefined;
      try {
        detectedLanguage = await this.detectWordPressLanguage();
      } catch (error) {
        console.log(`[WP TEST] Could not detect language: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      
      return { 
        success: true, 
        message: `Connected as ${user.name}`,
        language: detectedLanguage
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Connection failed';
      console.log(`[WP TEST] Unexpected error: ${errorMsg}`);
      return { success: false, message: `Unexpected error: ${errorMsg}` };
    }
  }

  async detectWordPressLanguage(): Promise<string | undefined> {
    try {
      // Try Polylang language detection first
      const languagesResponse = await fetch(`${this.baseUrl}/wp-json/pll/v1/languages`, {
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
      });

      if (languagesResponse.ok) {
        const languages = await languagesResponse.json();
        // Find the default/primary language
        const defaultLang = languages.find((lang: any) => lang.flag === true || lang.is_default === true);
        if (defaultLang && defaultLang.code) {
          console.log(`[WP LANGUAGE] Detected Polylang language: ${defaultLang.code}`);
          return defaultLang.code;
        }
      }

      // Fallback: Check WordPress site language from options
      const optionsUrl = `${this.baseUrl}/wp-json/wp/v2/settings`;
      const optionsResponse = await fetch(optionsUrl, {
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
      });

      if (optionsResponse.ok) {
        const settings = await optionsResponse.json();
        if (settings.language) {
          // WordPress stores language like "en_US", "ru_RU", etc.
          // Convert to 2-letter code
          const langCode = settings.language.split('_')[0].toLowerCase();
          console.log(`[WP LANGUAGE] Detected WordPress language: ${langCode} (from ${settings.language})`);
          return langCode;
        }
      }

      return undefined;
    } catch (error) {
      console.log(`[WP LANGUAGE] Detection error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return undefined;
    }
  }

  async getPolylangLanguages(): Promise<{ codes: string[]; defaultLanguage?: string; error?: string; status?: number }> {
    try {
      const response = await fetch(`${this.baseUrl}/wp-json/pll/v1/languages`, {
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
      });

      console.log(`[WP LANGUAGES] Polylang API response status: ${response.status}`);

      if (response.status === 404) {
        const error = 'Polylang plugin is not installed or REST API is disabled';
        console.warn(`[WP LANGUAGES] ${error}`);
        return { codes: [], error, status: 404 };
      }

      if (response.status === 401) {
        const error = 'Authentication failed - check WordPress credentials';
        console.warn(`[WP LANGUAGES] ${error}`);
        return { codes: [], error, status: 401 };
      }

      if (!response.ok) {
        const error = `HTTP ${response.status}: Failed to get languages`;
        console.warn(`[WP LANGUAGES] ${error}`);
        return { codes: [], error, status: response.status };
      }

      const languages = await response.json();
      console.log(`[WP LANGUAGES] Full API Response:`, JSON.stringify(languages));

      if (!Array.isArray(languages)) {
        const error = `API response is not an array: ${typeof languages}`;
        console.warn(`[WP LANGUAGES] ${error}`);
        console.log(`[WP LANGUAGES] Response structure:`, Object.keys(languages || {}));
        return { codes: [], error };
      }

      if (languages.length === 0) {
        const error = 'No languages configured in Polylang. Please add at least one language in WordPress > Languages';
        console.warn(`[WP LANGUAGES] ${error}`);
        return { codes: [], error };
      }

      console.log(`[WP LANGUAGES] First language object:`, JSON.stringify(languages[0]));

      // Extract language codes and find default language
      let defaultLanguage: string | undefined;
      const codes = languages
        .map((lang: any) => {
          // Try different possible field names
          const code = lang.code?.toLowerCase() || lang.slug?.toLowerCase() || lang.locale?.split('_')[0]?.toLowerCase();
          // Check if this is the default language
          if (lang.is_default === true || lang.flag === true) {
            defaultLanguage = code;
          }
          return code;
        })
        .filter((code: string | undefined): code is string => !!code);
      
      if (codes.length === 0) {
        const error = `Could not extract language codes. Language fields: ${Object.keys(languages[0] || {}).join(', ')}`;
        console.warn(`[WP LANGUAGES] ${error}`);
        return { codes: [], error };
      }

      console.log(`[WP LANGUAGES] Successfully retrieved ${codes.length} languages from Polylang: ${codes.join(', ')}, default: ${defaultLanguage}`);
      return { codes, defaultLanguage };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`[WP LANGUAGES] Exception:`, errorMsg);
      return { codes: [], error: errorMsg };
    }
  }

  async checkPolylangPlugin(language?: string): Promise<{ success: boolean; message: string; polylangStatus?: string }> {
    const isRussian = language === 'ru';
    
    try {
      const response = await fetch(`${this.baseUrl}/wp-json/pll/v1/languages`, {
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 404) {
        return { 
          success: false,
          polylangStatus: 'NOT_INSTALLED',
          message: isRussian 
            ? '❌ Плагин Polylang не установлен или REST API отключена.\n\nКак исправить:\n1. Перейди в админ-панель WordPress > Плагины > Добавить новый\n2. Найди "Polylang"\n3. Установи и активируй официальный плагин "Polylang"\n4. После активации перейди: Языки > Параметры\n5. Убедись что опция "REST API" ВКЛЮЧЕНА\n6. Добавь как минимум один дополнительный язык (например, Русский, Испанский)\n7. Попробуй снова'
            : '❌ Polylang plugin is not installed or REST API is disabled.\n\nHow to fix:\n1. Go to WordPress admin panel > Plugins > Add New\n2. Search for "Polylang"\n3. Install and activate the official "Polylang" plugin\n4. After activation, go to Languages > Settings\n5. Make sure "REST API" option is ENABLED\n6. Add at least one additional language (e.g., Russian, Spanish)\n7. Try again'
        };
      }

      if (response.status === 401) {
        return { 
          success: false,
          polylangStatus: 'AUTH_FAILED',
          message: isRussian
            ? 'HTTP 401: Ошибка авторизации. Проверь корректность имени пользователя и пароля.'
            : 'HTTP 401: Unauthorized. WordPress authentication failed. Please verify your credentials are correct.'
        };
      }

      if (!response.ok) {
        return { success: false, polylangStatus: 'ERROR', message: `HTTP ${response.status}: ${response.statusText}` };
      }

      const languages = await response.json();
      if (!Array.isArray(languages) || languages.length === 0) {
        return {
          success: false,
          polylangStatus: 'NO_LANGUAGES',
          message: isRussian
            ? '⚠️ Polylang установлен, но языки не настроены.\n\nКак исправить:\n1. Перейди в админ-панель WordPress > Языки\n2. Добавь как минимум один дополнительный язык (например, Русский, Испанский)\n3. Попробуй снова'
            : '⚠️ Polylang is installed but no languages are configured.\n\nHow to fix:\n1. Go to WordPress admin panel > Languages\n2. Add at least one additional language (e.g., Russian, Spanish)\n3. Try again'
        };
      }

      return { 
        success: true,
        polylangStatus: 'OK',
        message: isRussian
          ? `✅ Polylang активен с ${languages.length} языком(-и)`
          : `✅ Polylang is active with ${languages.length} language(s) configured`
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : isRussian ? 'Проверка не удалась' : 'Check failed';
      return { success: false, polylangStatus: 'ERROR', message: isRussian ? `Ошибка подключения: ${errorMsg}` : `Connection error: ${errorMsg}` };
    }
  }

  async getPosts(page: number = 1, perPage: number = 100, lang?: string): Promise<{ posts: WordPressPost[]; total: number; totalPages: number }> {
    try {
      const timestamp = Date.now(); // Avoid WordPress caching
      let url = `${this.baseUrl}/wp-json/wp/v2/posts?per_page=${perPage}&page=${page}&_fields=id,title,content,status,meta,lang,translations&nocache=${timestamp}`;
      if (lang) {
        url += `&lang=${lang}`;
      }
      const response = await fetch(url, {
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        console.warn(`[GET POSTS] Page ${page} returned ${response.status}`);
        return { posts: [], total: 0, totalPages: 0 };
      }

      const posts = await response.json();
      if (!Array.isArray(posts)) {
        return { posts: [], total: 0, totalPages: 0 };
      }

      // Get pagination from headers
      const total = response.headers.get('X-WP-Total') ? parseInt(response.headers.get('X-WP-Total')!, 10) : 0;
      const totalPages = response.headers.get('X-WP-TotalPages') ? parseInt(response.headers.get('X-WP-TotalPages')!, 10) : 0;
      
      // Debug first post structure
      if (posts.length > 0) {
        console.log(`[GET POSTS] First post structure:`, {
          id: posts[0].id,
          lang: posts[0].lang,
          translations: posts[0].translations,
          langField: Object.keys(posts[0]).filter(k => k.includes('lang')),
        });
      }
      
      console.log(`[GET POSTS] Page ${page}: fetched ${posts.length} posts, total ${total}, pages ${totalPages}`);

      return {
        posts: posts.map((p: any) => ({
          ...p,
          type: 'post',
          contentType: this.detectContentType(p),
        })),
        total,
        totalPages
      };
    } catch (error) {
      throw new Error(`Failed to fetch WordPress posts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getPostsCount(): Promise<number> {
    try {
      const response = await fetch(`${this.baseUrl}/wp-json/wp/v2/posts?per_page=1`, {
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch posts count: ${response.statusText}`);
      }

      // Get total count from X-WP-Total header
      const total = response.headers.get('X-WP-Total');
      return total ? parseInt(total, 10) : 0;
    } catch (error) {
      console.warn('Failed to get posts count:', error);
      return 0;
    }
  }

  async getPages(page: number = 1, perPage: number = 100, lang?: string): Promise<{ pages: WordPressPost[]; total: number; totalPages: number }> {
    try {
      let url = `${this.baseUrl}/wp-json/wp/v2/pages?per_page=${perPage}&page=${page}&_fields=id,title,content,status,meta,lang,translations`;
      if (lang) {
        url += `&lang=${lang}`;
      }
      const response = await fetch(url, {
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        console.warn(`[GET PAGES] Page ${page} returned ${response.status}`);
        return { pages: [], total: 0, totalPages: 0 };
      }

      const pages = await response.json();
      if (!Array.isArray(pages)) {
        return { pages: [], total: 0, totalPages: 0 };
      }

      // Get pagination from headers
      const total = response.headers.get('X-WP-Total') ? parseInt(response.headers.get('X-WP-Total')!, 10) : 0;
      const totalPages = response.headers.get('X-WP-TotalPages') ? parseInt(response.headers.get('X-WP-TotalPages')!, 10) : 0;
      
      console.log(`[GET PAGES] Page ${page}: fetched ${pages.length} pages, total ${total}, pages ${totalPages}`);

      return {
        pages: pages.map((p: any) => ({
          ...p,
          type: 'page',
          contentType: this.detectContentType(p),
        })),
        total,
        totalPages
      };
    } catch (error) {
      throw new Error(`Failed to fetch WordPress pages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getPagesCount(): Promise<number> {
    try {
      const response = await fetch(`${this.baseUrl}/wp-json/wp/v2/pages?per_page=1`, {
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch pages count: ${response.statusText}`);
      }

      // Get total count from X-WP-Total header
      const total = response.headers.get('X-WP-Total');
      return total ? parseInt(total, 10) : 0;
    } catch (error) {
      console.warn('Failed to get pages count:', error);
      return 0;
    }
  }

  async getInstalledPlugins(): Promise<Array<{ slug: string; name: string; status: string }>> {
    try {
      const response = await fetch(`${this.baseUrl}/wp-json/wp/v2/plugins`, {
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      console.log(`[PLUGINS] Response status: ${response.status}`);
      if (!response.ok) {
        console.log(`[PLUGINS] API endpoint failed, trying meta detection`);
        return await this.detectPluginsByMeta();
      }

      const plugins = await response.json() as Array<{ plugin: string; name: string; status: string }>;
      console.log(`[PLUGINS] Found ${plugins.length} plugins via API`);
      console.log(`[PLUGINS] Raw data:`, JSON.stringify(plugins.slice(0, 3)));
      
      return plugins.map(p => {
        const slug = p.plugin.split('/')[0];
        return { slug, name: p.name, status: p.status };
      });
    } catch (error) {
      console.error('[PLUGINS] Failed to get plugins via API:', error);
      console.log('[PLUGINS] Falling back to meta detection');
      return await this.detectPluginsByMeta();
    }
  }

  private async detectPluginsByMeta(): Promise<Array<{ slug: string; name: string; status: string }>> {
    try {
      // Fetch posts and pages to check for SEO plugin data
      const urls = [
        `${this.baseUrl}/wp-json/wp/v2/posts?per_page=50`,
        `${this.baseUrl}/wp-json/wp/v2/pages?per_page=50`
      ];
      
      const plugins: Array<{ slug: string; name: string; status: string }> = [];

      for (const url of urls) {
        try {
          const response = await fetch(url, {
            headers: { 'Authorization': this.getAuthHeader() },
          });

          if (!response.ok) continue;

          const posts = await response.json() as Array<any>;
          
          for (const post of posts) {
            const postData = post as any;
            const meta = postData.meta as any || {};
            
            // ✅ Yoast SEO v14+ - проверяем yoast_head_json (основной способ)
            if (postData.yoast_head_json && typeof postData.yoast_head_json === 'object') {
              if (!plugins.find(p => p.slug === 'wordpress-seo')) {
                console.log(`[PLUGINS META] ✅ Found Yoast SEO via yoast_head_json field`);
                plugins.push({ slug: 'wordpress-seo', name: 'Yoast SEO', status: 'active' });
              }
            }
            
            // Fallback: Check yoast_head (строка HTML)
            if (postData.yoast_head && typeof postData.yoast_head === 'string' && !plugins.find(p => p.slug === 'wordpress-seo')) {
              if (!plugins.find(p => p.slug === 'wordpress-seo')) {
                console.log(`[PLUGINS META] ✅ Found Yoast SEO via yoast_head string`);
                plugins.push({ slug: 'wordpress-seo', name: 'Yoast SEO', status: 'active' });
              }
            }
            
            // Fallback: Check meta fields - старые версии Yoast
            const yoastMetaKeys = Object.keys(meta).filter(k => k.startsWith('_yoast'));
            if (yoastMetaKeys.length > 0 && !plugins.find(p => p.slug === 'wordpress-seo')) {
              console.log(`[PLUGINS META] ✅ Found Yoast SEO via meta keys:`, yoastMetaKeys.slice(0, 2));
              plugins.push({ slug: 'wordpress-seo', name: 'Yoast SEO', status: 'active' });
            }
            
            // Check for All in One SEO
            if ((postData.aioseo_title || meta['_aioseo_title']) && !plugins.find(p => p.slug === 'all-in-one-seo-pack')) {
              console.log(`[PLUGINS META] ✅ Found All in One SEO`);
              plugins.push({ slug: 'all-in-one-seo-pack', name: 'All in One SEO', status: 'active' });
            }
            
            // Check for Rank Math
            const rankMathMetaKeys = Object.keys(meta).filter(k => k.startsWith('rank_math'));
            if (rankMathMetaKeys.length > 0 && !plugins.find(p => p.slug === 'seo-by-rank-math')) {
              console.log(`[PLUGINS META] ✅ Found Rank Math`);
              plugins.push({ slug: 'seo-by-rank-math', name: 'Rank Math', status: 'active' });
            }
            
            if (plugins.length >= 3) break;
          }
          
          if (plugins.length >= 3) break;
        } catch (e) {
          console.log(`[PLUGINS META] Error processing URL ${url}:`, e);
          continue;
        }
      }

      console.log(`[PLUGINS META] ✅ Detected ${plugins.length} plugins:`, plugins.map(p => p.slug));
      return plugins;
    } catch (error) {
      console.error('[PLUGINS META] Meta detection failed:', error);
      return [];
    }
  }

  private detectContentType(post: any): 'bebuilder' | 'gutenberg' | 'elementor' | 'wpbakery' | 'standard' {
    const meta = post.meta || {};
    
    // Check for BeBuilder
    if (meta['mfn-page-items']) return 'bebuilder';
    
    // Check for Elementor
    if (meta['_elementor_data']) return 'elementor';
    
    // Check for Gutenberg
    const content = post.content?.rendered || '';
    if (/<!-- wp:/.test(content)) return 'gutenberg';
    
    // Check for WP Bakery
    if (/\[vc_/.test(content)) return 'wpbakery';
    
    return 'standard';
  }

  async getPost(postId: number): Promise<WordPressPost> {
    try {
      // Try to fetch as post first
      let response = await fetch(`${this.baseUrl}/wp-json/wp/v2/posts/${postId}?_fields=id,title,content,status,meta,lang,translations,categories,tags`, {
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      // If not found as post, try as page
      if (response.status === 404) {
        console.log(`[WP] Post ${postId} not found as post, trying as page`);
        response = await fetch(`${this.baseUrl}/wp-json/wp/v2/pages/${postId}`, {
          headers: {
            'Authorization': this.getAuthHeader(),
          },
        });
      }

      if (!response.ok) {
        throw new Error(`Post ${postId} not found (${response.status})`);
      }

      let post = await response.json();
      
      // If no content and no meta, try to fetch with explicit _fields parameter
      if ((!post.content?.rendered || post.content.rendered.length === 0) && !post.meta) {
        console.log(`[WP] No content/meta found, trying with _fields parameter`);
        const postType = post.type === 'page' ? 'pages' : 'posts';
        const fieldsResponse = await fetch(
          `${this.baseUrl}/wp-json/wp/v2/${postType}/${postId}?_fields=id,title,content,status,meta,lang,translations`,
          {
            headers: {
              'Authorization': this.getAuthHeader(),
            },
          }
        );
        
        if (fieldsResponse.ok) {
          const fieldsPost = await fieldsResponse.json();
          post = fieldsPost;
          console.log(`[WP] Successfully fetched post with meta, meta keys: ${post.meta ? Object.keys(post.meta).join(', ') : 'none'}`);
        }
      }
      
      return {
        ...post,
        contentType: this.detectContentType(post),
      };
    } catch (error) {
      console.error(`[WP] Error fetching post ${postId}:`, error);
      throw new Error(`Failed to fetch WordPress post: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getTranslation(sourcePostId: number, targetLanguage: string): Promise<WordPressPost | null> {
    try {
      // Get the source post which contains Polylang's lang and translations fields
      const sourcePost = await this.getPost(sourcePostId);
      const postType = sourcePost.type === 'page' ? 'page' : 'post';
      
      console.log(`[WP] Checking for translation of ${postType} ${sourcePostId} in language ${targetLanguage}`);
      console.log(`[WP] Source post lang: ${sourcePost.lang}`);
      console.log(`[WP] Available translations:`, sourcePost.translations ? Object.keys(sourcePost.translations) : 'none');
      
      // Check if there's a translation ID for the target language
      // Polylang automatically adds 'translations' field to WordPress REST API responses
      if (sourcePost.translations && sourcePost.translations[targetLanguage]) {
        const translationId = sourcePost.translations[targetLanguage];
        console.log(`[WP] Found translation ID ${translationId} for language ${targetLanguage}`);
        
        // Fetch the actual translation post
        const translationPost = await this.getPost(translationId);
        return translationPost || null;
      }

      console.log(`[WP] No translation found for ${postType} ${sourcePostId} in language ${targetLanguage}`);
      
      return null;
    } catch (error) {
      console.warn(`[WP] Failed to get translation:`, error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }

  async diagnosticCheckPolylangPostAccess(postId: number): Promise<{ status: string; details: string }> {
    try {
      // Get the source post - Polylang fields are automatically added by WordPress REST API
      const sourcePost = await this.getPost(postId);
      const postType = sourcePost.type === 'page' ? 'page' : 'post';
      
      console.log(`[DIAGNOSTIC] Retrieved ${postType} ${postId}`);
      console.log(`[DIAGNOSTIC] Post lang: ${sourcePost.lang}`);
      console.log(`[DIAGNOSTIC] Translations: ${sourcePost.translations ? Object.keys(sourcePost.translations).join(', ') : 'none'}`);
      
      // Check if Polylang fields are present
      if (!sourcePost.lang) {
        return {
          status: 'MISSING_POLYLANG_FIELDS',
          details: `❌ Polylang lang field is missing for ${postType} ${postId}. This usually means:\n1. Polylang plugin is not active\n2. REST API is disabled in Polylang settings (go to Languages > Settings, enable REST API)\n3. The post doesn't have a language assigned`
        };
      }

      // Polylang is working properly - lang field is present
      const availableLanguages = sourcePost.translations ? Object.keys(sourcePost.translations) : [];
      return {
        status: 'OK',
        details: `✅ Polylang integration working for ${postType} ${postId}\nPost language: ${sourcePost.lang}\nAvailable translations: ${availableLanguages.length > 0 ? availableLanguages.join(', ') : 'none (can create new translations)'}`
      };
    } catch (error) {
      return {
        status: 'ERROR',
        details: `❌ Error accessing Polylang data: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async createTranslation(
    sourcePostId: number,
    targetLang: string,
    title: string,
    content: string,
    meta?: Record<string, any>,
    postType: 'post' | 'page' = 'post'
  ): Promise<number> {
    try {
      // Decode HTML entities to ensure proper HTML structure with valid image alt attributes
      const decodedContent = decodeHTML(content);
      
      // Get the source post to determine if it's a post or page
      const sourcePost = await this.getPost(sourcePostId);
      const actualPostType = sourcePost.type === 'page' ? 'page' : 'post';
      const endpoint = actualPostType === 'page' ? 'pages' : 'posts';

      // Check if a translation already exists for this language
      const existingTranslation = await this.getTranslation(sourcePostId, targetLang);
      
      if (existingTranslation) {
        // Update existing translation
        console.log(`[PUBLISH] Updating existing ${actualPostType} translation #${existingTranslation.id} for language: ${targetLang}`);
        
        const updateBody: any = {
          title,
          content: decodedContent,
          status: 'publish',
        };

        // Copy categories and tags from source post
        if (sourcePost.categories && Array.isArray(sourcePost.categories)) {
          updateBody.categories = sourcePost.categories;
          console.log(`[PUBLISH] Copying ${sourcePost.categories.length} categories from source post`);
        }
        if (sourcePost.tags && Array.isArray(sourcePost.tags)) {
          updateBody.tags = sourcePost.tags;
          console.log(`[PUBLISH] Copying ${sourcePost.tags.length} tags from source post`);
        }

        if (meta && Object.keys(meta).length > 0) {
          updateBody.meta = meta;
          console.log(`[PUBLISH] Metafields being updated:`, Object.keys(meta));
          if (meta['mfn-page-items']) {
            console.log(`[PUBLISH] BeBuilder mfn-page-items length: ${(meta['mfn-page-items'] as string).length}`);
          }
          if (meta['_elementor_data']) {
            console.log(`[PUBLISH] Elementor _elementor_data length: ${(meta['_elementor_data'] as string).length}`);
          }
        }

        // Build query params to ensure meta fields are included
        const metaFieldParams = meta 
          ? Object.keys(meta).map(key => `meta.${key}`).join(',')
          : '';
        const fieldsParams = `title,content,status,lang,translations${metaFieldParams ? ',meta,' + metaFieldParams : ''}`;
        
        const updateUrl = new URL(`${this.baseUrl}/wp-json/wp/v2/${endpoint}/${existingTranslation.id}`);
        if (metaFieldParams) {
          updateUrl.searchParams.append('_fields', fieldsParams);
        }

        const updateResponse = await fetch(updateUrl.toString(), {
          method: 'PUT',
          headers: {
            'Authorization': this.getAuthHeader(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateBody),
        });

        if (!updateResponse.ok) {
          const errorText = await updateResponse.text();
          console.error(`[PUBLISH] Failed to update ${actualPostType}:`, errorText);
          throw new Error(`Failed to update translation: ${updateResponse.statusText}`);
        }

        console.log(`[PUBLISH] Successfully updated ${actualPostType} #${existingTranslation.id}`);
        return existingTranslation.id;
      }

      // Create new translation if it doesn't exist
      // Ensure all images have alt attributes
      const contentWithAltAttrs = this.ensureImageAltAttributes(decodedContent);
      console.log(`[PUBLISH] Content before: ${decodedContent.substring(0, 100)}`);
      console.log(`[PUBLISH] Content after: ${contentWithAltAttrs.substring(0, 100)}`);
      console.log(`[PUBLISH] Has <img in content: ${contentWithAltAttrs.includes('<img')}`);
      console.log(`[PUBLISH] Sending content length: ${contentWithAltAttrs.length}`);
      
      const createBody: any = {
        title,
        content: contentWithAltAttrs,
        status: 'publish',
        lang: targetLang,
        // Link to source post via Polylang
        translations: {
          [sourcePost.lang || 'en']: sourcePostId,
        },
      };

      // Copy categories and tags from source post
      if (sourcePost.categories && Array.isArray(sourcePost.categories)) {
        createBody.categories = sourcePost.categories;
        console.log(`[PUBLISH] Copying ${sourcePost.categories.length} categories from source post`);
      }
      if (sourcePost.tags && Array.isArray(sourcePost.tags)) {
        createBody.tags = sourcePost.tags;
        console.log(`[PUBLISH] Copying ${sourcePost.tags.length} tags from source post`);
      }

      if (meta && Object.keys(meta).length > 0) {
        createBody.meta = meta;
        console.log(`[PUBLISH] Metafields being created:`, Object.keys(meta));
        if (meta['mfn-page-items']) {
          console.log(`[PUBLISH] BeBuilder mfn-page-items length: ${(meta['mfn-page-items'] as string).length}`);
        }
        if (meta['_elementor_data']) {
          console.log(`[PUBLISH] Elementor _elementor_data length: ${(meta['_elementor_data'] as string).length}`);
        }
      }

      console.log(`[PUBLISH] Creating new ${actualPostType} translation for language: ${targetLang}`);
      console.log(`[PUBLISH] Linking to source post #${sourcePostId} (${sourcePost.lang || 'en'})`);
      if (meta) {
        console.log(`[PUBLISH] Including Yoast focus keyword:`, meta['_yoast_wpseo_focuskw']);
      }

      // Build query params to ensure meta fields are included in the response
      const metaFieldParams = meta 
        ? Object.keys(meta).map(key => `meta.${key}`).join(',')
        : '';
      const fieldsParams = `title,content,status,lang,translations${metaFieldParams ? ',meta,' + metaFieldParams : ''}`;
      
      const createUrl = new URL(`${this.baseUrl}/wp-json/wp/v2/${endpoint}`);
      if (metaFieldParams) {
        createUrl.searchParams.append('_fields', fieldsParams);
      }

      const createResponse = await fetch(createUrl.toString(), {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createBody),
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error(`[PUBLISH] Failed to create ${actualPostType}:`, errorText);
        throw new Error(`Failed to create translation: ${createResponse.statusText}`);
      }

      const newPost = await createResponse.json();
      console.log(`[PUBLISH] Created and linked ${actualPostType} #${newPost.id} for language ${targetLang}`);

      return newPost.id;
    } catch (error) {
      throw new Error(`Failed to create translation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async linkTranslationsToSource(sourcePostId: number, translationIds: Record<string, number>): Promise<void> {
    try {
      // NOTE: When creating translations with correct links back to source,
      // Polylang automatically updates source post with translation info.
      // Direct update of source post 'translations' field can cause validation errors.
      // This function is now a no-op as Polylang handles linking automatically.
      
      const sourcePost = await this.getPost(sourcePostId);
      const actualPostType = sourcePost.type === 'page' ? 'page' : 'post';
      
      console.log(`[LINK] Polylang automatically linked ${Object.keys(translationIds).length} translations to source ${actualPostType} #${sourcePostId}`);
      console.log(`[LINK] Translations: ${Object.entries(translationIds).map(([lang, id]) => `${lang}:${id}`).join(', ')}`);
    } catch (error) {
      console.warn(`[LINK] Warning:`, error instanceof Error ? error.message : 'Unknown error');
      // Don't throw - this is not critical
    }
  }

  async updatePost(postId: number, content: string): Promise<void> {
    try {
      // Decode HTML entities to ensure proper HTML structure
      const decodedContent = decodeHTML(content);
      
      const response = await fetch(`${this.baseUrl}/wp-json/wp/v2/posts/${postId}`, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: decodedContent,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update post: ${response.statusText}`);
      }
    } catch (error) {
      throw new Error(`Failed to update WordPress post: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async diagnosePageBuilders(): Promise<{
    detectedBuilders: string[];
    installedPlugins: string[];
    hasBeBuilder: boolean;
    hasElementor: boolean;
    hasWPBakery: boolean;
    hasGutenberg: boolean;
    metaFieldsAvailable: string[];
    foundMetaFields: Record<string, boolean>;
  }> {
    try {
      const detectedBuilders: string[] = [];
      const installedPlugins: string[] = [];
      const foundMetaFields: Record<string, boolean> = {};

      // Check installed plugins
      const pluginsResponse = await fetch(`${this.baseUrl}/wp-json/wp/v2/plugins`, {
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (pluginsResponse.ok) {
        const plugins = await pluginsResponse.json();
        const pluginNames = plugins.map((p: any) => p.name || p.plugin || '').filter(Boolean);
        installedPlugins.push(...pluginNames);

        // Detect builders from plugin names
        const hasBeBuilder = pluginNames.some((p: string) => p.toLowerCase().includes('muffin') || p.toLowerCase().includes('bebuilder'));
        const hasElementor = pluginNames.some((p: string) => p.toLowerCase().includes('elementor'));
        const hasWPBakery = pluginNames.some((p: string) => p.toLowerCase().includes('wpbakery') || p.toLowerCase().includes('vc'));

        if (hasBeBuilder) {
          detectedBuilders.push('BeBuilder (Muffin Builder)');
        }
        if (hasElementor) {
          detectedBuilders.push('Elementor');
        }
        if (hasWPBakery) {
          detectedBuilders.push('WP Bakery');
        }
      }

      // Check for Gutenberg support
      const settingsResponse = await fetch(`${this.baseUrl}/wp-json/wp/v2/settings`, {
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (settingsResponse.ok) {
        detectedBuilders.push('Gutenberg (WordPress)');
      }

      // Check what meta fields are accessible
      const metaFieldsAvailable: string[] = [];
      try {
        // Scan both pages and posts for builder data
        for (const postType of ['pages', 'posts']) {
          try {
            const contentResponse = await fetch(`${this.baseUrl}/wp-json/wp/v2/${postType}?per_page=20&_fields=id,title,meta`, {
              headers: {
                'Authorization': this.getAuthHeader(),
              },
            });

            if (contentResponse.ok) {
              const items = await contentResponse.json();
              
              // Collect all meta field keys
              const allMetaKeys = new Set<string>();
              items.forEach((item: any) => {
                if (item.meta) {
                  Object.keys(item.meta).forEach(key => allMetaKeys.add(key));
                }
              });
              metaFieldsAvailable.push(...Array.from(allMetaKeys));

              // Check for specific builder data in meta fields
              items.forEach((item: any) => {
                if (item.meta) {
                  // Check for BeBuilder
                  if (item.meta['mfn-page-items'] || item.meta['mfn_page_items'] || item.meta['mfn-page-options']) {
                    foundMetaFields['BeBuilder (mfn-page-items)'] = true;
                    if (!detectedBuilders.includes('BeBuilder (Muffin Builder)')) {
                      detectedBuilders.push('BeBuilder (Muffin Builder)');
                    }
                  }
                  
                  // Check for Elementor
                  if (item.meta['_elementor_data'] || item.meta['elementor_data']) {
                    foundMetaFields['Elementor (_elementor_data)'] = true;
                    if (!detectedBuilders.includes('Elementor')) {
                      detectedBuilders.push('Elementor');
                    }
                  }
                  
                  // Check for WP Bakery
                  if (item.meta['_wpb_vc_js_status']) {
                    foundMetaFields['WP Bakery (_wpb_vc_js_status)'] = true;
                    if (!detectedBuilders.includes('WP Bakery')) {
                      detectedBuilders.push('WP Bakery');
                    }
                  }
                }
              });
            }
          } catch (e) {
            console.log(`[WP DIAG] Could not check ${postType}:`, e);
          }
        }
      } catch (e) {
        console.log('[WP DIAG] Could not check meta fields:', e);
      }

      return {
        detectedBuilders,
        installedPlugins: installedPlugins.slice(0, 20), // Limit to first 20
        hasBeBuilder: detectedBuilders.includes('BeBuilder (Muffin Builder)'),
        hasElementor: detectedBuilders.includes('Elementor'),
        hasWPBakery: detectedBuilders.includes('WP Bakery'),
        hasGutenberg: detectedBuilders.includes('Gutenberg (WordPress)'),
        metaFieldsAvailable,
        foundMetaFields,
      };
    } catch (error) {
      console.error('[WP DIAG] Error diagnosing page builders:', error);
      return {
        detectedBuilders: [],
        installedPlugins: [],
        hasBeBuilder: false,
        hasElementor: false,
        hasWPBakery: false,
        hasGutenberg: false,
        metaFieldsAvailable: [],
        foundMetaFields: {},
      };
    }
  }

  async deleteTranslations(sourcePostId: number, targetLanguages: string[]): Promise<{ deletedCount: number; errors: string[] }> {
    try {
      const deletedIds: number[] = [];
      const errors: string[] = [];

      // Try to get source post, but don't fail if it doesn't exist
      let sourcePost: (WordPressPost & { lang?: string }) | null = null;
      try {
        sourcePost = await this.getPost(sourcePostId);
      } catch (error) {
        console.warn(`[CLEANUP] Source post ${sourcePostId} not found, will try to find translations directly`);
      }

      // Delete each translation
      for (const lang of targetLanguages) {
        try {
          let translation: WordPressPost | null = null;
          
          // Try to get translation using the standard method if source exists
          if (sourcePost) {
            translation = await this.getTranslation(sourcePostId, lang);
          } else {
            // If source doesn't exist, try to find translation by searching for posts with this lang
            console.log(`[CLEANUP] Searching for orphaned translation of post ${sourcePostId} in language ${lang}`);
            for (const postType of ['posts', 'pages']) {
              try {
                const response = await fetch(
                  `${this.baseUrl}/wp-json/wp/v2/${postType}?lang=${lang}&_fields=id,title,content,lang,translations,type&per_page=100`,
                  {
                    headers: {
                      'Authorization': this.getAuthHeader(),
                    },
                  }
                );
                
                if (response.ok) {
                  const items = await response.json();
                  // Look for a post/page that has sourcePostId in its translations
                  // Search across ALL language keys, not just hardcoded ones
                  const found = items.find((item: any) => 
                    item.translations && Object.values(item.translations).includes(sourcePostId)
                  );
                  
                  if (found) {
                    translation = { ...found, type: postType === 'pages' ? 'page' : 'post', contentType: 'standard' };
                    break;
                  }
                }
              } catch (e) {
                // Continue to next post type
              }
            }
          }
          
          if (translation) {
            const postType = translation.type === 'page' ? 'pages' : 'posts';
            console.log(`[CLEANUP] Deleting ${postType} translation #${translation.id} for language ${lang}`);

            const deleteResponse = await fetch(`${this.baseUrl}/wp-json/wp/v2/${postType}/${translation.id}?force=true`, {
              method: 'DELETE',
              headers: {
                'Authorization': this.getAuthHeader(),
                'Content-Type': 'application/json',
              },
            });

            if (!deleteResponse.ok) {
              const errorText = await deleteResponse.text();
              errors.push(`${lang}: ${errorText}`);
              console.error(`[CLEANUP] Failed to delete ${lang} translation:`, errorText);
            } else {
              deletedIds.push(translation.id);
              console.log(`[CLEANUP] Successfully deleted ${lang} translation #${translation.id}`);
            }
          } else {
            console.log(`[CLEANUP] No translation found for language ${lang}`);
          }
        } catch (error) {
          errors.push(`${lang}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      return {
        deletedCount: deletedIds.length,
        errors,
      };
    } catch (error) {
      throw new Error(`Failed to delete translations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
