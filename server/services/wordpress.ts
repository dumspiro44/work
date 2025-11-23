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

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/wp-json/wp/v2/users/me`, {
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        return { success: false, message: `HTTP ${response.status}: ${response.statusText}` };
      }

      const user = await response.json();
      return { success: true, message: `Connected as ${user.name}` };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Connection failed' };
    }
  }

  async checkPolylangPlugin(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/wp-json/pll/v1/languages`, {
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (response.status === 404) {
        return { 
          success: false, 
          message: 'Polylang plugin not installed or REST API not enabled' 
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

      return response.json();
    } catch (error) {
      throw new Error(`Failed to fetch WordPress posts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getPost(postId: number): Promise<WordPressPost> {
    try {
      const response = await fetch(`${this.baseUrl}/wp-json/wp/v2/posts/${postId}`, {
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch post: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      throw new Error(`Failed to fetch WordPress post: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
