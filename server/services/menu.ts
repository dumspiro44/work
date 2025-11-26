import type { Settings } from '@shared/schema';

export interface WPMenu {
  term_id: number;
  name: string;
  slug: string;
  count: number;
}

export interface WPMenuItem {
  ID: number;
  db_id: number;
  title: string;
  url: string;
  target?: string;
  attr_title?: string;
  description?: string;
  object_id: number;
  object: string;
  type: string;
  type_label: string;
  classes?: string[];
  children?: WPMenuItem[];
}

export class MenuTranslationService {
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

  private async makeRequest(url: string): Promise<any> {
    const response = await fetch(url, {
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json',
        'User-Agent': 'WP-PolyLingo-Translator/1.0',
      },
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};

    if (!response.ok) {
      throw new Error(`WordPress API error: ${response.status} ${text}`);
    }

    return data;
  }

  async getMenus(): Promise<WPMenu[]> {
    try {
      // Use WP REST Menus plugin endpoint (skapator)
      const url = `${this.baseUrl}/wp-json/menus/v1/menus`;
      console.log('[MENU] Fetching menus from:', url);
      
      const data = await this.makeRequest(url);
      
      // Handle array response - returns array of menu objects with term_id
      if (Array.isArray(data)) {
        console.log('[MENU] ✓ Got menus:', data.length);
        return data.map((menu: any) => ({
          term_id: menu.term_id,
          name: menu.name,
          slug: menu.slug,
          count: menu.count || 0,
        }));
      }

      console.log('[MENU] Unexpected response format:', typeof data);
      return [];
    } catch (error) {
      console.error('[MENU] Error fetching menus:', error);
      throw error;
    }
  }

  async getMenuItems(menuId: number): Promise<WPMenuItem[]> {
    try {
      // Get specific menu by term_id with nested structure
      // Use ?nested=1 to get children items in a 'children' field
      const url = `${this.baseUrl}/wp-json/menus/v1/menus/${menuId}?nested=1`;
      console.log('[MENU] Fetching menu items for menu ID:', menuId);
      
      const items = await this.makeRequest(url);
      
      // Response is directly an array of menu items
      if (Array.isArray(items)) {
        console.log('[MENU] ✓ Got menu items:', items.length);
        return items;
      }

      console.log('[MENU] Unexpected response format:', typeof items);
      return [];
    } catch (error) {
      console.error('[MENU] Error fetching menu items:', error);
      throw error;
    }
  }

  async createMenu(name: string, slug: string): Promise<WPMenu> {
    throw new Error('Creating menus via API is not recommended. Use WordPress admin panel instead.');
  }

  async createMenuItem(
    menuId: number,
    title: string,
    url: string,
    parentId: number = 0
  ): Promise<any> {
    throw new Error('Creating menu items via API is not recommended. Use WordPress admin panel instead.');
  }
}
