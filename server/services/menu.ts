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
      // 1. Try WP REST Menus plugin endpoint (skapator) first
      try {
        const url = `${this.baseUrl}/wp-json/menus/v1/menus`;
        console.log('[MENU] Attempting fetch from WP REST Menus plugin:', url);
        const data = await this.makeRequest(url);
        
        if (Array.isArray(data)) {
          console.log('[MENU] ✓ Got menus from plugin:', data.length);
          return data.map((menu: any) => ({
            term_id: menu.term_id,
            name: menu.name,
            slug: menu.slug,
            count: menu.count || 0,
          }));
        }
      } catch (pluginError) {
        console.log('[MENU] WP REST Menus plugin not available, trying native API...');
      }

      // 2. Try native WordPress REST API (v5.9+)
      const nativeUrl = `${this.baseUrl}/wp-json/wp/v2/menus`;
      console.log('[MENU] Attempting fetch from native WP API:', nativeUrl);
      const nativeData = await this.makeRequest(nativeUrl);
      
      if (Array.isArray(nativeData)) {
        console.log('[MENU] ✓ Got menus from native API:', nativeData.length);
        return nativeData.map((menu: any) => ({
          term_id: menu.id, // Native API uses 'id' instead of 'term_id'
          name: menu.name,
          slug: menu.slug,
          count: menu.count || 0,
        }));
      }

      console.log('[MENU] Unexpected response format from all endpoints');
      return [];
    } catch (error) {
      console.error('[MENU] Error fetching menus:', error);
      return []; // Return empty instead of throwing to prevent frontend crash
    }
  }

  async getMenuItems(menuId: number): Promise<WPMenuItem[]> {
    try {
      // 1. Try WP REST Menus plugin (nested structure is better)
      try {
        const url = `${this.baseUrl}/wp-json/menus/v1/menus/${menuId}?nested=1`;
        console.log('[MENU] Attempting fetch items from plugin for menu ID:', menuId);
        const items = await this.makeRequest(url);
        if (Array.isArray(items)) {
          console.log('[MENU] ✓ Got items from plugin:', items.length);
          return items;
        }
      } catch (pluginError) {
        console.log('[MENU] Items from plugin not available, trying native API...');
      }

      // 2. Try native WordPress API
      const nativeUrl = `${this.baseUrl}/wp-json/wp/v2/menu-items?menus=${menuId}&per_page=100`;
      console.log('[MENU] Attempting fetch items from native API for menu ID:', menuId);
      const nativeItems = await this.makeRequest(nativeUrl);
      
      if (Array.isArray(nativeItems)) {
        console.log('[MENU] ✓ Got items from native API:', nativeItems.length);
        // Map native items to WPMenuItem interface if needed
        return nativeItems.map((item: any) => ({
          ID: item.id,
          db_id: item.id,
          title: item.title?.rendered || item.title || '',
          url: item.url || '',
          object_id: item.object_id,
          object: item.object,
          type: item.type,
          type_label: item.type_label || 'Custom',
          children: [] // Native API returns flat list, would need reconstruction for tree
        }));
      }

      return [];
    } catch (error) {
      console.error('[MENU] Error fetching menu items:', error);
      return [];
    }
  }

  async checkPluginActive(): Promise<{ active: boolean; message: string }> {
    try {
      // If we can get menus from ANY endpoint, it's "active enough"
      const menus = await this.getMenus();
      if (menus && menus.length >= 0) {
        return { active: true, message: 'Menu API is available' };
      }
      return { active: false, message: 'No menu API available (neither plugin nor native)' };
    } catch (error) {
      return { active: false, message: 'Failed to check menu availability' };
    }
  }

  async createMenu(name: string, slug: string): Promise<WPMenu> {
    throw new Error('Creating menus via API is not recommended. Use WordPress admin panel instead.');
  }

  async updateMenuItem(
    menuId: number,
    itemId: number,
    translatedTitle: string
  ): Promise<any> {
    try {
      // Use standard WordPress REST API endpoint for nav_menu_items (WordPress 5.9+)
      const url = `${this.baseUrl}/wp-json/wp/v2/menu-items/${itemId}`;
      console.log(`[MENU] Updating menu item ${itemId} with title: "${translatedTitle}"`);
      console.log(`[MENU] URL: ${url}`);
      console.log(`[MENU] Auth header: Basic ${Buffer.from(this.username).toString('base64').substring(0, 10)}...`);

      const body = JSON.stringify({ title: translatedTitle });
      console.log(`[MENU] Request body: ${body}`);

      const response = await fetch(url, {
        method: 'POST', // WordPress menu-items endpoint uses POST for both create and update
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
          'User-Agent': 'WP-PolyLingo-Translator/1.0',
        },
        body: body,
      });

      const text = await response.text();
      console.log(`[MENU] Response status: ${response.status}, body: ${text.substring(0, 200)}`);
      
      const data = text ? JSON.parse(text) : {};

      if (!response.ok) {
        console.error(`[MENU] Full error response:`, {
          status: response.status,
          data: data,
          full: text
        });
        throw new Error(`WordPress API error: ${response.status} ${text}`);
      }

      console.log(`[MENU] ✓ Updated item ${itemId}: "${translatedTitle}"`);
      return data;
    } catch (error) {
      console.error(`[MENU] Error updating menu item:`, error);
      throw error;
    }
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
