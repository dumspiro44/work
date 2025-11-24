import type { Settings } from '@shared/schema';

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

  constructor(settings: Settings) {
    this.baseUrl = settings.wpUrl.replace(/\/$/, '');
    this.username = settings.wpUsername;
    this.password = settings.wpPassword;
  }

  private getAuthHeader(): string {
    return 'Basic ' + Buffer.from(`${this.username}:${this.password}`).toString('base64');
  }

  async testConnection(): Promise<{ success: boolean; message: string; language?: string }> {
    try {
      const url = `${this.baseUrl}/wp-json/wp/v2/users/me`;
      const authHeader = this.getAuthHeader();
      
      console.log(`[WP TEST] Connecting to: ${url}`);
      console.log(`[WP TEST] Username: ${this.username}`);
      console.log(`[WP TEST] Auth header set: ${authHeader.substring(0, 20)}...`);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      console.log(`[WP TEST] Response status: ${response.status}`);
      
      if (!response.ok) {
        const responseText = await response.text();
        console.log(`[WP TEST] Response body: ${responseText.substring(0, 200)}`);
        
        // Better error messages for common issues
        if (response.status === 401) {
          return { 
            success: false, 
            message: 'HTTP 401: Unauthorized. Please check your username and password. If using Application Password mode, make sure you generated it in WordPress admin panel (Users > Your Profile > Application Passwords). Otherwise, use your regular admin password.' 
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
      console.log(`[WP TEST] Error: ${errorMsg}`);
      return { success: false, message: errorMsg };
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

  async checkPolylangPlugin(): Promise<{ success: boolean; message: string }> {
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
          message: 'Polylang plugin not installed or REST API not enabled' 
        };
      }

      if (response.status === 401) {
        return { 
          success: false, 
          message: 'HTTP 401: Unauthorized. Please check your username and password. If using Application Password mode, make sure you generated it in WordPress admin panel.' 
        };
      }

      if (!response.ok) {
        return { success: false, message: `HTTP ${response.status}: ${response.statusText}` };
      }

      const languages = await response.json();
      return { 
        success: true, 
        message: `Polylang is active with ${languages.length} language(s) configured` 
      };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Check failed' };
    }
  }

  async getPosts(): Promise<WordPressPost[]> {
    try {
      const response = await fetch(`${this.baseUrl}/wp-json/wp/v2/posts?per_page=100&_fields=id,title,content,status,meta,lang,translations`, {
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch posts: ${response.statusText}`);
      }

      const posts = await response.json();
      return posts.map((p: any) => ({
        ...p,
        type: 'post',
        contentType: this.detectContentType(p),
      }));
    } catch (error) {
      throw new Error(`Failed to fetch WordPress posts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getPages(): Promise<WordPressPost[]> {
    try {
      const response = await fetch(`${this.baseUrl}/wp-json/wp/v2/pages?per_page=100&_fields=id,title,content,status,meta,lang,translations`, {
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch pages: ${response.statusText}`);
      }

      const pages = await response.json();
      return pages.map((p: any) => ({
        ...p,
        type: 'page',
        contentType: this.detectContentType(p),
      }));
    } catch (error) {
      throw new Error(`Failed to fetch WordPress pages: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      let response = await fetch(`${this.baseUrl}/wp-json/wp/v2/posts/${postId}`, {
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
      // Get source post to find its translations
      const sourcePost = await this.getPost(sourcePostId);
      
      // Get all posts with the target language
      const response = await fetch(
        `${this.baseUrl}/wp-json/wp/v2/posts?lang=${targetLanguage}&per_page=100`,
        {
          headers: {
            'Authorization': this.getAuthHeader(),
          },
        }
      );

      if (!response.ok) {
        return null;
      }

      const posts = await response.json();
      
      // Find the translated post that is linked to source post
      const translatedPost = posts.find((p: any) => {
        // Check if this post has translation link to source post
        return p.translations?.[sourcePost.lang || 'en'] === sourcePostId;
      });

      return translatedPost || null;
    } catch (error) {
      console.warn(`Failed to get translation: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  async createTranslation(
    sourcePostId: number,
    targetLang: string,
    title: string,
    content: string,
    meta?: Record<string, any>
  ): Promise<number> {
    try {
      const createBody: any = {
        title,
        content,
        status: 'draft',
        lang: targetLang,
      };

      // Add meta fields if provided
      if (meta && Object.keys(meta).length > 0) {
        createBody.meta = meta;
      }

      const createResponse = await fetch(`${this.baseUrl}/wp-json/wp/v2/posts`, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createBody),
      });

      if (!createResponse.ok) {
        throw new Error(`Failed to create translation: ${createResponse.statusText}`);
      }

      const newPost = await createResponse.json();

      try {
        await fetch(`${this.baseUrl}/wp-json/pll/v1/posts/${newPost.id}/translations`, {
          method: 'POST',
          headers: {
            'Authorization': this.getAuthHeader(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            [targetLang]: sourcePostId,
          }),
        });
      } catch (linkError) {
        console.error('Failed to link translation via Polylang:', linkError);
      }

      return newPost.id;
    } catch (error) {
      throw new Error(`Failed to create translation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async updatePost(postId: number, content: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/wp-json/wp/v2/posts/${postId}`, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
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
}
