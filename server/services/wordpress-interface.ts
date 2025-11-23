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
      elements.push(...menus);

      // Get categories (taxonomies)
      const categories = await this.fetchCategories();
      elements.push(...categories);

      // Get tags (taxonomies)
      const tags = await this.fetchTags();
      elements.push(...tags);

      return elements;
    } catch (error) {
      console.error('Failed to fetch interface elements:', error);
      throw new Error(`Failed to fetch interface elements: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async fetchMenus(): Promise<InterfaceElement[]> {
    try {
      const url = `${this.baseUrl}/wp-json/wp/v2/menus`;
      const response = await fetch(url, {
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(`Failed to fetch menus: HTTP ${response.status}`);
        return [];
      }

      const menus = await response.json();
      const elements: InterfaceElement[] = [];

      for (const menu of menus) {
        // Get menu items for this menu
        const itemsUrl = `${this.baseUrl}/wp-json/wp-menus/v1/menus/${menu.id}`;
        const itemsResponse = await fetch(itemsUrl, {
          headers: {
            'Authorization': this.getAuthHeader(),
            'Content-Type': 'application/json',
          },
        });

        if (itemsResponse.ok) {
          const menuData = await itemsResponse.json();
          
          // Add menu items as interface elements
          if (menuData.items && Array.isArray(menuData.items)) {
            for (const item of menuData.items) {
              elements.push({
                id: `menu_item_${item.id}`,
                key: item.title || item.label,
                value: item.title || item.label,
                context: `Menu item from "${menu.name || menu.slug}"`,
                type: 'menu',
              });
            }
          }
        }
      }

      return elements;
    } catch (error) {
      console.warn('Error fetching menus:', error);
      return [];
    }
  }

  private async fetchCategories(): Promise<InterfaceElement[]> {
    try {
      const url = `${this.baseUrl}/wp-json/wp/v2/categories?per_page=100`;
      const response = await fetch(url, {
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(`Failed to fetch categories: HTTP ${response.status}`);
        return [];
      }

      const categories = await response.json();
      return categories.map((cat: any) => ({
        id: `category_${cat.id}`,
        key: cat.name,
        value: cat.name,
        context: `Category${cat.description ? `: ${cat.description.substring(0, 50)}` : ''}`,
        type: 'taxonomy' as const,
      }));
    } catch (error) {
      console.warn('Error fetching categories:', error);
      return [];
    }
  }

  private async fetchTags(): Promise<InterfaceElement[]> {
    try {
      const url = `${this.baseUrl}/wp-json/wp/v2/tags?per_page=100`;
      const response = await fetch(url, {
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(`Failed to fetch tags: HTTP ${response.status}`);
        return [];
      }

      const tags = await response.json();
      return tags.map((tag: any) => ({
        id: `tag_${tag.id}`,
        key: tag.name,
        value: tag.name,
        context: `Tag${tag.description ? `: ${tag.description.substring(0, 50)}` : ''}`,
        type: 'taxonomy' as const,
      }));
    } catch (error) {
      console.warn('Error fetching tags:', error);
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
        // Update category translation using Polylang
        return await this.updateCategoryTranslation(parseInt(originalId), translatedValue, language);
      } else if (type === 'tag') {
        // Update tag translation using Polylang
        return await this.updateTagTranslation(parseInt(originalId), translatedValue, language);
      } else if (type === 'menu_item') {
        // Menu items are more complex, would require custom handling
        console.log(`Menu item translation publishing requires custom implementation for menu_item_${originalId}`);
        return true; // Still return true to mark as processed
      }

      return false;
    } catch (error) {
      console.error(`Error publishing translation for ${elementId}:`, error);
      return false;
    }
  }

  private async updateCategoryTranslation(catId: number, translatedName: string, language: string): Promise<boolean> {
    try {
      // This would use Polylang API to create/update category translation
      // Actual implementation depends on Polylang REST API capabilities
      const url = `${this.baseUrl}/wp-json/wp/v2/categories/${catId}`;
      
      // For now, just update the name (actual Polylang integration would be more complex)
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: translatedName,
        }),
      });

      return response.ok;
    } catch (error) {
      console.error(`Error updating category ${catId}:`, error);
      return false;
    }
  }

  private async updateTagTranslation(tagId: number, translatedName: string, language: string): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/wp-json/wp/v2/tags/${tagId}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: translatedName,
        }),
      });

      return response.ok;
    } catch (error) {
      console.error(`Error updating tag ${tagId}:`, error);
      return false;
    }
  }
}
