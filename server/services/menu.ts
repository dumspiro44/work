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
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;

      const options: any = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method,
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
          'User-Agent': 'WP-PolyLingo-Translator/1.0',
        },
        rejectUnauthorized: false,
      };

      if (body) {
        const bodyStr = JSON.stringify(body);
        options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
      }

      const req = client.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            if (res.statusCode! >= 200 && res.statusCode! < 300) {
              resolve(parsed);
            } else {
              reject(new Error(`WordPress API error: ${res.statusCode} ${data}`));
            }
          } catch (e) {
            reject(new Error(`Failed to parse response: ${data.substring(0, 100)}`));
          }
        });
      });

      req.on('error', (e) => reject(e));

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  async getMenus(): Promise<WordPressMenu[]> {
    try {
      const url = `${this.baseUrl}/wp-json/wp/v2/menus`;
      console.log('[MENU] Fetching menus from:', url);
      const menus = await this.makeRequest(url);
      return Array.isArray(menus) ? menus : [];
    } catch (error) {
      console.error('[MENU] Error fetching menus:', error);
      throw error;
    }
  }

  async getMenuItems(menuId: number): Promise<WordPressMenuItem[]> {
    try {
      const url = `${this.baseUrl}/wp-json/wp/v2/menu-items?menus=${menuId}`;
      console.log('[MENU] Fetching menu items for menu:', menuId);
      const items = await this.makeRequest(url);
      return Array.isArray(items) ? items : [];
    } catch (error) {
      console.error('[MENU] Error fetching menu items:', error);
      throw error;
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
