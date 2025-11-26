import type { Settings } from '@shared/schema';
import https from 'https';
import http from 'http';

export interface WordPressMenu {
  id: number;
  name: string;
  slug: string;
  description: string;
  count: number;
}

export interface WordPressMenuItem {
  id: number;
  title: string;
  url: string;
  menu_order: number;
  parent: number;
  type: string;
  type_label: string;
  description: string;
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

  private async makeRequest(url: string, method: string = 'GET', body?: any): Promise<any> {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
          'User-Agent': 'WP-PolyLingo-Translator/1.0',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const text = await response.text();
      const data = text ? JSON.parse(text) : {};

      if (!response.ok) {
        throw new Error(`WordPress API error: ${response.status} ${text}`);
      }

      return data;
    } catch (error) {
      throw error;
    }
  }

  async getMenus(): Promise<WordPressMenu[]> {
    try {
      // Try standard menus endpoint first
      try {
        const url = `${this.baseUrl}/wp-json/wp/v2/menus`;
        console.log('[MENU] Fetching menus from:', url);
        const menus = await this.makeRequest(url);
        return Array.isArray(menus) ? menus : [];
      } catch (stdError) {
        console.log('[MENU] Standard menus endpoint failed, trying alternative approach...');
        
        // Fallback: Get all nav_menu_item posts and group by menu
        const url = `${this.baseUrl}/wp-json/wp/v2/nav_menu_item?per_page=100`;
        const items = await this.makeRequest(url);
        
        if (!Array.isArray(items) || items.length === 0) {
          console.log('[MENU] No menu items found');
          return [];
        }

        // Group items by menu ID
        const menuMap = new Map<number, Set<any>>();
        const menuNames = new Map<number, string>();

        for (const item of items) {
          const menuId = item.menus?.[0] || item.menu;
          if (!menuMap.has(menuId)) {
            menuMap.set(menuId, new Set());
          }
          menuMap.get(menuId)!.add(item);
          
          // Try to get menu name from item
          if (item.title?.rendered && !menuNames.has(menuId)) {
            menuNames.set(menuId, `Menu ${menuId}`);
          }
        }

        // Convert to menu format
        const menus: WordPressMenu[] = Array.from(menuMap.entries()).map(([id, items]) => ({
          id,
          name: menuNames.get(id) || `Menu ${id}`,
          slug: `menu-${id}`,
          description: '',
          count: items.size,
        }));

        console.log('[MENU] Found menus via alternative method:', menus.length);
        return menus;
      }
    } catch (error) {
      console.error('[MENU] Error fetching menus:', error);
      return []; // Return empty instead of throwing
    }
  }

  async getMenuItems(menuId: number): Promise<WordPressMenuItem[]> {
    try {
      // Try standard menu items endpoint
      const url = `${this.baseUrl}/wp-json/wp/v2/menu-items?menus=${menuId}`;
      console.log('[MENU] Fetching menu items for menu:', menuId);
      
      try {
        const items = await this.makeRequest(url);
        return Array.isArray(items) ? items : [];
      } catch (stdError) {
        console.log('[MENU] Standard menu-items endpoint failed, trying nav_menu_item...');
        
        // Fallback: Get nav_menu_item posts filtered by menu
        const fallbackUrl = `${this.baseUrl}/wp-json/wp/v2/nav_menu_item?menus=${menuId}&per_page=100`;
        const items = await this.makeRequest(fallbackUrl);
        return Array.isArray(items) ? items : [];
      }
    } catch (error) {
      console.error('[MENU] Error fetching menu items:', error);
      return []; // Return empty instead of throwing
    }
  }

  async createMenu(name: string, slug: string): Promise<WordPressMenu> {
    try {
      const url = `${this.baseUrl}/wp-json/wp/v2/menus`;
      console.log('[MENU] Creating menu:', name);
      const menu = await this.makeRequest(url, 'POST', { name, slug });
      return menu;
    } catch (error) {
      console.error('[MENU] Error creating menu:', error);
      throw error;
    }
  }

  async createMenuItem(
    menuId: number,
    title: string,
    url: string,
    parentId: number = 0,
    order: number = 0
  ): Promise<any> {
    try {
      const endpoint = `${this.baseUrl}/wp-json/wp/v2/menu-items`;
      console.log('[MENU] Creating menu item:', title);
      
      const item = await this.makeRequest(endpoint, 'POST', {
        menu_order: order,
        title,
        url,
        parent: parentId,
        menus: [menuId],
      });
      return item;
    } catch (error) {
      console.error('[MENU] Error creating menu item:', error);
      throw error;
    }
  }

  async getOrCreateLanguageMenu(baseMenuName: string, language: string, languageName: string): Promise<WordPressMenu> {
    try {
      // Check if menu already exists
      const menus = await this.getMenus();
      const langMenuName = `${baseMenuName} (${languageName})`;
      const existing = menus.find(m => m.name === langMenuName);

      if (existing) {
        console.log(`[MENU] Menu already exists: ${langMenuName}`);
        return existing;
      }

      // Create new menu
      console.log(`[MENU] Creating new menu: ${langMenuName}`);
      const slug = `${baseMenuName.toLowerCase().replace(/\s+/g, '-')}-${language}`;
      return await this.createMenu(langMenuName, slug);
    } catch (error) {
      console.error('[MENU] Error getting or creating language menu:', error);
      throw error;
    }
  }
}
