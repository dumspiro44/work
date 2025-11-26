import type { Settings } from '@shared/schema';

export interface WPMenu {
  ID: number;
  name: string;
  slug: string;
  items?: WPMenuItem[];
}

export interface WPMenuItem {
  ID: number;
  title: string;
  url: string;
  menu_order: number;
  menu_item_parent: number;
  type: string;
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
      // Use WP REST API Menus plugin endpoint
      const url = `${this.baseUrl}/wp-json/wp-api-menus/v2/menus`;
      console.log('[MENU] Fetching menus from:', url);
      
      const data = await this.makeRequest(url);
      
      // Handle both array and object responses
      if (Array.isArray(data)) {
        console.log('[MENU] ✓ Got menus:', data.length);
        return data;
      }
      
      if (data.menus && Array.isArray(data.menus)) {
        console.log('[MENU] ✓ Got menus:', data.menus.length);
        return data.menus;
      }

      console.log('[MENU] Unexpected response format:', typeof data);
      return [];
    } catch (error) {
      console.error('[MENU] Error fetching menus:', error);
      throw error;
    }
  }

  async getMenuItems(menuId: number | string): Promise<WPMenuItem[]> {
    try {
      // Get specific menu with all its items
      const url = `${this.baseUrl}/wp-json/wp-api-menus/v2/menus/${menuId}`;
      console.log('[MENU] Fetching menu items for menu:', menuId);
      
      const menu = await this.makeRequest(url);
      
      if (menu.items && Array.isArray(menu.items)) {
        console.log('[MENU] ✓ Got menu items:', menu.items.length);
        return menu.items;
      }

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
