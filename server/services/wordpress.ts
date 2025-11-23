import type { Settings } from '@shared/schema';

export interface WordPressPost {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  status: string;
  lang?: string;
  translations?: Record<string, number>;
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
            message: 'HTTP 401: Unauthorized. WordPress requires an Application Password instead of the user password. Create one in WordPress admin panel under Users > Your Profile > Application Passwords.' 
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
          message: 'HTTP 401: Unauthorized. WordPress requires an Application Password instead of the user password. Create one in WordPress admin panel under Users > Your Profile > Application Passwords.' 
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
      const response = await fetch(`${this.baseUrl}/wp-json/wp/v2/posts?per_page=100`, {
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch posts: ${response.statusText}`);
      }

      const posts = await response.json();
      return posts.map((p: any) => ({ ...p, type: 'post' }));
    } catch (error) {
      throw new Error(`Failed to fetch WordPress posts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getPages(): Promise<WordPressPost[]> {
    try {
      const response = await fetch(`${this.baseUrl}/wp-json/wp/v2/pages?per_page=100`, {
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch pages: ${response.statusText}`);
      }

      const pages = await response.json();
      return pages.map((p: any) => ({ ...p, type: 'page' }));
    } catch (error) {
      throw new Error(`Failed to fetch WordPress pages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getPost(postId: number, type?: string): Promise<WordPressPost> {
    try {
      // Try to fetch as post first, then as page
      let endpoint = type === 'page' ? 'pages' : 'posts';
      let response = await fetch(`${this.baseUrl}/wp-json/wp/v2/${endpoint}/${postId}`, {
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      // If first attempt fails and we haven't tried the other type, try it
      if (!response.ok && !type) {
        endpoint = endpoint === 'posts' ? 'pages' : 'posts';
        response = await fetch(`${this.baseUrl}/wp-json/wp/v2/${endpoint}/${postId}`, {
          headers: {
            'Authorization': this.getAuthHeader(),
          },
        });
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch post: ${response.statusText}`);
      }

      const post = await response.json();
      
      // Ensure content.rendered exists
      if (!post.content?.rendered) {
        console.warn(`[WP] Post ${postId} has no content.rendered, checking excerpt`);
        // Try to get it with explicit request
        const retryResponse = await fetch(
          `${this.baseUrl}/wp-json/wp/v2/${endpoint}/${postId}?context=edit`,
          {
            headers: {
              'Authorization': this.getAuthHeader(),
            },
          }
        );
        if (retryResponse.ok) {
          const retryPost = await retryResponse.json();
          post.content = retryPost.content || post.content;
        }
      }
      
      return post;
    } catch (error) {
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
    content: string
  ): Promise<number> {
    try {
      const createResponse = await fetch(`${this.baseUrl}/wp-json/wp/v2/posts`, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          content,
          status: 'draft',
          lang: targetLang,
        }),
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
}
