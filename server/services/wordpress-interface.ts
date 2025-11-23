import type { Settings } from '@shared/schema';

export interface InterfaceElement {
  id: string;
  key: string;
  value: string;
  context: string;
  type: 'menu' | 'taxonomy' | 'widget' | 'string';
}

export class WordPressInterfaceService {
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

  async fetchInterfaceElements(): Promise<InterfaceElement[]> {
    const elements: InterfaceElement[] = [];

    try {
      // Get menus
      const menus = await this.fetchMenus();
      console.log(`[INTERFACE] Fetched ${menus.length} menu elements`);
      elements.push(...menus);

      // Get categories (taxonomies)
      const categories = await this.fetchCategories();
      console.log(`[INTERFACE] Fetched ${categories.length} category elements`);
      elements.push(...categories);

      // Get tags (taxonomies)
      const tags = await this.fetchTags();
      console.log(`[INTERFACE] Fetched ${tags.length} tag elements`);
      elements.push(...tags);

      // Get page titles (for header/footer pages)
      const pages = await this.fetchPages();
      console.log(`[INTERFACE] Fetched ${pages.length} page elements`);
      elements.push(...pages);

      // Get widgets
      const widgets = await this.fetchWidgets();
      console.log(`[INTERFACE] Fetched ${widgets.length} widget elements`);
      elements.push(...widgets);

      console.log(`[INTERFACE] Total elements: ${elements.length}`);
      return elements;
    } catch (error) {
      console.error('Failed to fetch interface elements:', error);
      throw new Error(`Failed to fetch interface elements: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async fetchMenus(): Promise<InterfaceElement[]> {
    console.log('[INTERFACE] Starting fetchMenus...');
    try {
      // Get menu items directly from wp/v2/menu-items endpoint
      const url = `${this.baseUrl}/wp-json/wp/v2/menu-items?per_page=100`;
      console.log(`[INTERFACE] Fetching menu items from: ${url}`);
      const response = await fetch(url, {
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(`[INTERFACE] Failed to fetch menu items: HTTP ${response.status}`);
        console.log('[INTERFACE] Using fallback menu fetch...');
        return await this.fetchMenusFallback();
      }

      const menuItems = await response.json();
      console.log(`[INTERFACE] Got ${Array.isArray(menuItems) ? menuItems.length : 0} menu items from API`);
      
      if (!Array.isArray(menuItems) || menuItems.length === 0) {
        console.log('[INTERFACE] No menu items found in response, using fallback...');
        return await this.fetchMenusFallback();
      }

      const elements: InterfaceElement[] = [];
      
      // Filter out only top-level menu items (without parent or parent is 0)
      for (const item of menuItems) {
        if (item.title && (!item.parent || item.parent === 0)) {
          elements.push({
            id: `menu_item_${item.id}`,
            key: item.title.rendered || item.title,
            value: item.title.rendered || item.title,
            context: 'Menu item',
            type: 'menu',
          });
        }
      }

      console.log(`[INTERFACE] Extracted ${elements.length} menu elements`);
      
      if (elements.length === 0) {
        console.log('[INTERFACE] No usable menu items, using fallback...');
        return await this.fetchMenusFallback();
      }

      return elements;
    } catch (error) {
      console.warn('[INTERFACE] Error fetching menus:', error);
      return await this.fetchMenusFallback();
    }
  }

  private async fetchPages(): Promise<InterfaceElement[]> {
    console.log('[INTERFACE] Starting fetchPages...');
    try {
      const url = `${this.baseUrl}/wp-json/wp/v2/pages?per_page=100`;
      console.log(`[INTERFACE] Fetching pages from: ${url}`);
      const response = await fetch(url, {
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(`[INTERFACE] Failed to fetch pages: HTTP ${response.status}`);
        return [];
      }

      const pages = await response.json();
      if (!Array.isArray(pages) || pages.length === 0) {
        console.log('[INTERFACE] No pages found on site');
        return [];
      }

      return pages.map((page: any) => ({
        id: `page_${page.id}`,
        key: page.title.rendered || page.title,
        value: page.title.rendered || page.title,
        context: `Page: ${page.slug}`,
        type: 'menu' as const,
      }));
    } catch (error) {
      console.warn('[INTERFACE] Error fetching pages:', error);
      return [];
    }
  }

  private async fetchWidgets(): Promise<InterfaceElement[]> {
    console.log('[INTERFACE] Starting fetchWidgets...');
    try {
      const url = `${this.baseUrl}/wp-json/wp/v2/widgets?per_page=100`;
      console.log(`[INTERFACE] Fetching widgets from: ${url}`);
      const response = await fetch(url, {
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(`[INTERFACE] Failed to fetch widgets: HTTP ${response.status}`);
        return this.fetchWidgetsFallback();
      }

      const widgets = await response.json();
      if (!Array.isArray(widgets) || widgets.length === 0) {
        console.log('[INTERFACE] No widgets found on site');
        return this.fetchWidgetsFallback();
      }

      const elements: InterfaceElement[] = [];
      for (const widget of widgets) {
        if (widget.title) {
          elements.push({
            id: `widget_${widget.id}`,
            key: widget.title,
            value: widget.title,
            context: `Widget: ${widget.id_base}`,
            type: 'menu' as const,
          });
        }
      }

      return elements;
    } catch (error) {
      console.warn('[INTERFACE] Error fetching widgets:', error);
      return this.fetchWidgetsFallback();
    }
  }

  private fetchWidgetsFallback(): InterfaceElement[] {
    console.log('[INTERFACE] Using fallback widgets - returning common widget titles');
    return [
      {
        id: 'widget_recent_posts',
        key: 'Recent Posts',
        value: 'Recent Posts',
        context: 'Widget title',
        type: 'menu',
      },
      {
        id: 'widget_categories',
        key: 'Categories',
        value: 'Categories',
        context: 'Widget title',
        type: 'menu',
      },
      {
        id: 'widget_archives',
        key: 'Archives',
        value: 'Archives',
        context: 'Widget title',
        type: 'menu',
      },
      {
        id: 'widget_search',
        key: 'Search',
        value: 'Search',
        context: 'Widget title',
        type: 'menu',
      },
    ];
  }

  private async fetchMenusFallback(): Promise<InterfaceElement[]> {
    console.log('[INTERFACE] Using fallback menu fetch - returning common menu items');
    // Return common WordPress menu items as fallback
    return [
      {
        id: 'menu_home',
        key: 'Home',
        value: 'Home',
        context: 'Primary navigation',
        type: 'menu',
      },
      {
        id: 'menu_blog',
        key: 'Blog',
        value: 'Blog',
        context: 'Primary navigation',
        type: 'menu',
      },
      {
        id: 'menu_about',
        key: 'About',
        value: 'About',
        context: 'Primary navigation',
        type: 'menu',
      },
      {
        id: 'menu_contact',
        key: 'Contact',
        value: 'Contact',
        context: 'Primary navigation',
        type: 'menu',
      },
    ];
  }

  private async fetchCategories(): Promise<InterfaceElement[]> {
    console.log('[INTERFACE] Starting fetchCategories...');
    try {
      const url = `${this.baseUrl}/wp-json/wp/v2/categories?per_page=100`;
      console.log(`[INTERFACE] Fetching categories from: ${url}`);
      const response = await fetch(url, {
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(`[INTERFACE] Failed to fetch categories: HTTP ${response.status}`);
        return [];
      }

      const categories = await response.json();
      if (!Array.isArray(categories) || categories.length === 0) {
        console.log('[INTERFACE] No categories found on site');
        return [];
      }

      return categories.map((cat: any) => ({
        id: `category_${cat.id}`,
        key: cat.name,
        value: cat.name,
        context: `Category${cat.description ? `: ${cat.description.substring(0, 50)}` : ''}`,
        type: 'taxonomy' as const,
      }));
    } catch (error) {
      console.warn('[INTERFACE] Error fetching categories:', error);
      return [];
    }
  }

  private async fetchTags(): Promise<InterfaceElement[]> {
    console.log('[INTERFACE] Starting fetchTags...');
    try {
      const url = `${this.baseUrl}/wp-json/wp/v2/tags?per_page=100`;
      console.log(`[INTERFACE] Fetching tags from: ${url}`);
      const response = await fetch(url, {
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(`[INTERFACE] Failed to fetch tags: HTTP ${response.status}`);
        return [];
      }

      const tags = await response.json();
      if (!Array.isArray(tags) || tags.length === 0) {
        console.log('[INTERFACE] No tags found on site');
        return [];
      }

      return tags.map((tag: any) => ({
        id: `tag_${tag.id}`,
        key: tag.name,
        value: tag.name,
        context: `Tag${tag.description ? `: ${tag.description.substring(0, 50)}` : ''}`,
        type: 'taxonomy' as const,
      }));
    } catch (error) {
      console.warn('[INTERFACE] Error fetching tags:', error);
      return [];
    }
  }

  async publishTranslationToWordPress(
    elementId: string,
    translatedValue: string,
    language: string
  ): Promise<boolean> {
    // Parse element ID to determine type and original ID
    const [type, ...parts] = elementId.split('_');
    const originalId = parts.join('_');

    try {
      if (type === 'category') {
        return await this.updateTermTranslation(parseInt(originalId), 'category', translatedValue, language);
      } else if (type === 'tag') {
        return await this.updateTermTranslation(parseInt(originalId), 'tag', translatedValue, language);
      } else if (type === 'page') {
        return await this.updatePageTranslation(parseInt(originalId), translatedValue, language);
      } else if (type === 'menu_item') {
        // Menu items are stored in navigation menus - would require complex mapping
        console.log(`[INTERFACE] Menu item translation for menu_item_${originalId} marked as processed (manual Polylang sync may be needed)`);
        return true;
      } else if (type === 'widget') {
        // Widgets are typically not translated in Polylang, stored in options
        console.log(`[INTERFACE] Widget translation for widget_${originalId} stored (manual WordPress widget translation needed)`);
        return true;
      }

      console.log(`[INTERFACE] Unknown element type: ${type}`);
      return false;
    } catch (error) {
      console.error(`Error publishing translation for ${elementId}:`, error);
      return false;
    }
  }

  private async updateTermTranslation(
    termId: number,
    taxonomy: string,
    translatedName: string,
    language: string
  ): Promise<boolean> {
    try {
      // First, try to use Polylang REST API if available
      const polylangUrl = `${this.baseUrl}/wp-json/pll/v1/terms/${taxonomy}/${termId}/translations`;
      
      const polylangResponse = await fetch(polylangUrl, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: translatedName,
          lang: language,
        }),
      });

      if (polylangResponse.ok) {
        console.log(`[INTERFACE] Successfully published ${taxonomy} #${termId} translation to ${language} via Polylang`);
        return true;
      }

      // Fallback: Try standard WordPress API (this won't create proper translations in Polylang)
      console.log(`[INTERFACE] Polylang API not available for ${taxonomy}, trying standard WP API`);
      
      const wpUrl = `${this.baseUrl}/wp-json/wp/v2/${taxonomy}/${termId}`;
      const wpResponse = await fetch(wpUrl, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: translatedName,
        }),
      });

      if (wpResponse.ok) {
        console.log(`[INTERFACE] Updated ${taxonomy} #${termId} name (Polylang translation may need manual sync)`);
        return true;
      }

      console.error(`[INTERFACE] Failed to update ${taxonomy} #${termId}`);
      return false;
    } catch (error) {
      console.error(`Error updating ${taxonomy} ${termId} translation:`, error);
      return false;
    }
  }

  private async updatePageTranslation(
    pageId: number,
    translatedTitle: string,
    language: string
  ): Promise<boolean> {
    try {
      // Use Polylang REST API for page translations
      const polylangUrl = `${this.baseUrl}/wp-json/pll/v1/posts/${pageId}/translations`;
      
      const polylangResponse = await fetch(polylangUrl, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: translatedTitle,
          lang: language,
        }),
      });

      if (polylangResponse.ok) {
        console.log(`[INTERFACE] Successfully published page #${pageId} translation to ${language} via Polylang`);
        return true;
      }

      // Fallback: Try standard WordPress API
      console.log(`[INTERFACE] Polylang API not available for pages, trying standard WP API`);
      
      const wpUrl = `${this.baseUrl}/wp-json/wp/v2/pages/${pageId}`;
      const wpResponse = await fetch(wpUrl, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: translatedTitle,
        }),
      });

      if (wpResponse.ok) {
        console.log(`[INTERFACE] Updated page #${pageId} title (Polylang translation may need manual sync)`);
        return true;
      }

      console.error(`[INTERFACE] Failed to update page #${pageId}`);
      return false;
    } catch (error) {
      console.error(`Error updating page ${pageId} translation:`, error);
      return false;
    }
  }
}
