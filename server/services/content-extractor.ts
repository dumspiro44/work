import { unserialize } from 'php-serialize';
import type { BlockMetadata } from '@shared/schema';

export interface ContentBlock {
  type: 'bebuilder' | 'gutenberg' | 'elementor' | 'wpbakery' | 'standard';
  text: string;
  originalFormat?: string;
}

export interface ExtractedContent {
  type: 'bebuilder' | 'gutenberg' | 'elementor' | 'wpbakery' | 'standard';
  blocks: ContentBlock[];
  rawContent: string;
  hasMultipleFormats: boolean;
  blockMetadata: BlockMetadata;
  originalMetadata?: Record<string, any>;
}

export class ContentExtractorService {
  /**
   * Filter out service elements that shouldn't be translated
   */
  private static filterServiceContent(text: string): string {
    if (!text) return '';
    
    // Remove shortcodes like [divider height="..."]
    text = text.replace(/\[divider[^\]]*\]/gi, '');
    text = text.replace(/\[\/divider\]/gi, '');
    
    // Remove button labels if they're standalone
    if (text.trim().toLowerCase() === 'button') return '';
    if (text.trim() === 'Button') return '';
    
    // Remove common UI labels
    const uiLabels = ['les mer', 'lees meer', 'читать далее', 'подробнее', 'learn more', 'read more', 'more'];
    if (uiLabels.includes(text.trim().toLowerCase())) return '';
    
    // Remove leading/trailing whitespace
    text = text.trim();
    
    // Don't return very short strings that are likely not real content
    if (text.length < 3 && text !== text.toUpperCase()) return '';
    
    return text;
  }

  /**
   * Extract content from WordPress post, supporting all popular page builders
   */
  static extractContent(
    postContent: string,
    postMeta?: Record<string, any>
  ): ExtractedContent {
    const blocks: ContentBlock[] = [];
    let primaryType: ExtractedContent['type'] = 'standard';

    // 1. Check for BeBuilder (Muffin Builder) content
    if (postMeta?.['mfn-page-items']) {
      const bebuilderBlocks = this.extractBeBuilder(postMeta['mfn-page-items']);
      blocks.push(...bebuilderBlocks);
      primaryType = 'bebuilder';
    }

    // 2. Check for Elementor content
    if (postMeta?.['_elementor_data']) {
      const elementorBlocks = this.extractElementor(postMeta['_elementor_data']);
      blocks.push(...elementorBlocks);
      if (primaryType === 'standard') primaryType = 'elementor';
    }

    // 3. Check for Gutenberg blocks
    if (this.isGutenbergContent(postContent)) {
      const gutenbergBlocks = this.extractGutenberg(postContent);
      blocks.push(...gutenbergBlocks);
      if (primaryType === 'standard') primaryType = 'gutenberg';
    }

    // 4. Check for WP Bakery content
    if (this.isWpBakeryContent(postContent)) {
      const wpbakeryBlocks = this.extractWpBakery(postContent);
      blocks.push(...wpbakeryBlocks);
      if (primaryType === 'standard') primaryType = 'wpbakery';
    }

    // 5. Extract standard text content
    const standardBlocks = this.extractStandardContent(postContent);
    blocks.push(...standardBlocks);

    const hasMultipleFormats = blocks.filter(b => b.type !== 'standard').length > 1;

    // Create block metadata for content restoration
    const blockMetadata: BlockMetadata = {
      type: primaryType,
      blocks: blocks.map((block, idx) => ({
        index: idx,
        field: 'text',
        originalText: block.text,
      })),
      rawMetadata: postMeta,
    };

    return {
      type: primaryType,
      blocks,
      rawContent: postContent,
      hasMultipleFormats,
      blockMetadata,
      originalMetadata: postMeta,
    };
  }

  /**
   * Extract BeBuilder (Muffin Builder) content from JSON meta
   */
  private static extractBeBuilder(metaData: any): ContentBlock[] {
    const blocks: ContentBlock[] = [];

    try {
      let data = metaData;
      
      console.log('[EXTRACTOR] BeBuilder meta data type:', typeof metaData);
      
      // BeBuilder stores data as base64-encoded PHP-serialized array
      if (Array.isArray(metaData) && typeof metaData[0] === 'string') {
        console.log('[EXTRACTOR] BeBuilder data is base64-encoded PHP serialization');
        console.log('[EXTRACTOR] BeBuilder first element (first 100 chars):', metaData[0].substring(0, 100));
        
        try {
          // Decode base64
          const decoded = Buffer.from(metaData[0], 'base64').toString('utf-8');
          console.log('[EXTRACTOR] Decoded data (first 200 chars):', decoded.substring(0, 200));
          
          // Unserialize PHP data
          data = unserialize(decoded);
          console.log('[EXTRACTOR] Unserialized data type:', typeof data);
        } catch (decodeError) {
          console.error('[EXTRACTOR] Failed to decode/unserialize BeBuilder data:', decodeError);
          return blocks;
        }
      } else if (typeof metaData === 'string') {
        // Try parsing as JSON first
        try {
          data = JSON.parse(metaData);
        } catch {
          // Try base64 + PHP unserialize
          try {
            const decoded = Buffer.from(metaData, 'base64').toString('utf-8');
            data = unserialize(decoded);
          } catch {
            console.log('[EXTRACTOR] Could not parse BeBuilder data as JSON or PHP serialization');
            return blocks;
          }
        }
      }

      if (!data || typeof data !== 'object') {
        console.log('[EXTRACTOR] BeBuilder data is empty or not an object after parsing');
        return blocks;
      }

      // Recursively extract text from BeBuilder structure
      const structuralElements = new Set(['section', 'wrap', 'column', 'placeholder', 'image', 'row', 'grid', 'divider', 'spacer']);
      
      const extractFromObject = (obj: any, depth: number = 0): void => {
        if (!obj || typeof obj !== 'object' || depth > 20) return; // Prevent infinite recursion

        if (Array.isArray(obj)) {
          obj.forEach((item) => extractFromObject(item, depth + 1));
          return;
        }

        // Check if this is a structural element that shouldn't be translated
        const type = obj.type || obj.element || '';
        if (type && structuralElements.has(type.toLowerCase())) {
          // Skip the type name itself, but still process nested content
          for (const key in obj) {
            if (obj.hasOwnProperty(key) && typeof obj[key] === 'object' && key !== 'type') {
              extractFromObject(obj[key], depth + 1);
            }
          }
          return;
        }

        // Look for common text fields in BeBuilder
        const textFields = ['text', 'title', 'label', 'content', 'description', 'button_text', 'placeholder'];
        textFields.forEach(field => {
          if (obj[field] && typeof obj[field] === 'string') {
            const rawText = obj[field].trim();
            // Filter out structural element names and service content
            if (rawText && !structuralElements.has(rawText.toLowerCase())) {
              const filteredText = ContentExtractorService.filterServiceContent(rawText);
              if (filteredText) {
                blocks.push({
                  type: 'bebuilder',
                  text: filteredText,
                  originalFormat: 'bebuilder',
                });
              }
            }
          }
        });

        // Recursively process all nested objects
        for (const key in obj) {
          if (obj.hasOwnProperty(key) && typeof obj[key] === 'object' && key !== 'type') {
            extractFromObject(obj[key], depth + 1);
          }
        }
      };

      extractFromObject(data);
      console.log('[EXTRACTOR] BeBuilder extraction complete, found', blocks.length, 'blocks');
    } catch (error) {
      console.error('Error parsing BeBuilder data:', error);
    }

    return blocks;
  }

  /**
   * Extract Gutenberg block content
   */
  private static extractGutenberg(content: string): ContentBlock[] {
    const blocks: ContentBlock[] = [];
    
    // Match Gutenberg blocks: <!-- wp:blocktype {...} -->...<!-- /wp:blocktype -->
    const blockRegex = /<!-- wp:(\w+(?:\/\w+)*)\s*({[^]*?})?\s*-->([\s\S]*?)<!-- \/wp:\1\s*-->/g;
    let match;

    while ((match = blockRegex.exec(content)) !== null) {
      const blockType = match[1];
      const blockDataStr = match[2];
      const blockContent = match[3];

      // Extract text from block content (remove HTML tags)
      const text = blockContent.replace(/<[^>]*>/g, '').trim();
      const filteredText = this.filterServiceContent(text);
      
      if (filteredText) {
        blocks.push({
          type: 'gutenberg',
          text: filteredText,
          originalFormat: `gutenberg:${blockType}`,
        });
      }

      // Also try to parse attributes from block data
      try {
        if (blockDataStr) {
          const blockData = JSON.parse(blockDataStr);
          if (blockData.placeholder) {
            const filtered = this.filterServiceContent(blockData.placeholder);
            if (filtered) {
              blocks.push({
                type: 'gutenberg',
                text: filtered,
                originalFormat: `gutenberg:${blockType}:placeholder`,
              });
            }
          }
          if (blockData.content && typeof blockData.content === 'string') {
            const filtered = this.filterServiceContent(blockData.content);
            if (filtered) {
              blocks.push({
                type: 'gutenberg',
                text: filtered,
                originalFormat: `gutenberg:${blockType}:content`,
              });
            }
          }
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
    }

    return blocks;
  }

  /**
   * Extract Elementor content from meta data
   */
  private static extractElementor(elementorData: any): ContentBlock[] {
    const blocks: ContentBlock[] = [];

    try {
      let data = elementorData;

      if (typeof elementorData === 'string') {
        data = JSON.parse(elementorData);
      }

      if (!data || typeof data !== 'object') return blocks;

      // Recursively extract text from Elementor structure
      const extractFromObject = (obj: any): void => {
        if (!obj || typeof obj !== 'object') return;

        if (Array.isArray(obj)) {
          obj.forEach(extractFromObject);
          return;
        }

        // Look for Elementor common fields
        if (obj.settings && typeof obj.settings === 'object') {
          const settings = obj.settings;

          // Common Elementor text fields
          ['text', 'title', 'description', 'placeholder', 'button_text', 'label'].forEach(field => {
            if (settings[field] && typeof settings[field] === 'string') {
              const filtered = ContentExtractorService.filterServiceContent(settings[field]);
              if (filtered) {
                blocks.push({
                  type: 'elementor',
                  text: filtered,
                  originalFormat: `elementor:${field}`,
                });
              }
            }
          });

          // HTML content fields
          ['html', 'editor_content', 'content'].forEach(field => {
            if (settings[field] && typeof settings[field] === 'string') {
              const rawText = settings[field].replace(/<[^>]*>/g, '').trim();
              const filtered = ContentExtractorService.filterServiceContent(rawText);
              if (filtered) {
                blocks.push({
                  type: 'elementor',
                  text: filtered,
                  originalFormat: `elementor:${field}`,
                });
              }
            }
          });
        }

        // Recursively process nested objects and arrays
        for (const key in obj) {
          if (obj.hasOwnProperty(key) && typeof obj[key] === 'object') {
            extractFromObject(obj[key]);
          }
        }
      };

      extractFromObject(data);
    } catch (error) {
      console.error('Error parsing Elementor data:', error);
    }

    return blocks;
  }

  /**
   * Extract WP Bakery (Visual Composer) shortcode content
   */
  private static extractWpBakery(content: string): ContentBlock[] {
    const blocks: ContentBlock[] = [];

    // Match WP Bakery shortcodes: [vc_* ... ]
    const shortcodeRegex = /\[vc_(\w+)([^\]]*)\]([\s\S]*?)\[\/vc_\1\]/g;
    let match;

    while ((match = shortcodeRegex.exec(content)) !== null) {
      const shortcodeType = match[1];
      const attributes = match[2];
      const innerContent = match[3];

      // Extract text from inner content
      const text = innerContent.replace(/<[^>]*>/g, '').replace(/\[.*?\]/g, '').trim();
      const filteredText = this.filterServiceContent(text);
      
      if (filteredText) {
        blocks.push({
          type: 'wpbakery',
          text: filteredText,
          originalFormat: `wpbakery:${shortcodeType}`,
        });
      }

      // Try to extract from attributes
      // Look for title="...", heading="...", etc
      const attrRegex = /(?:title|heading|text|content|label)\s*=\s*['"](.*?)['"]/gi;
      let attrMatch;

      while ((attrMatch = attrRegex.exec(attributes)) !== null) {
        const attrText = attrMatch[1].trim();
        const filtered = this.filterServiceContent(attrText);
        if (filtered && filtered !== filteredText) {
          blocks.push({
            type: 'wpbakery',
            text: filtered,
            originalFormat: `wpbakery:${shortcodeType}:attr`,
          });
        }
      }
    }

    return blocks;
  }

  /**
   * Extract standard HTML/text content
   */
  private static extractStandardContent(content: string): ContentBlock[] {
    const blocks: ContentBlock[] = [];

    // Remove shortcodes first (they might be from WP Bakery or other plugins)
    let cleanContent = content.replace(/\[.*?\]/g, '');

    // Remove Gutenberg comments
    cleanContent = cleanContent.replace(/<!-- .*? -->/g, '');

    // Extract text, removing HTML tags
    const text = cleanContent.replace(/<[^>]*>/g, '').trim();

    if (text) {
      blocks.push({
        type: 'standard',
        text,
        originalFormat: 'html',
      });
    }

    return blocks;
  }

  /**
   * Check if content contains Gutenberg blocks
   */
  private static isGutenbergContent(content: string): boolean {
    return /<!-- wp:/.test(content);
  }

  /**
   * Check if content contains WP Bakery shortcodes
   */
  private static isWpBakeryContent(content: string): boolean {
    return /\[vc_/.test(content);
  }

  /**
   * Combine multiple content blocks into single text for translation
   */
  static combineBlocks(blocks: ContentBlock[]): string {
    return blocks
      .map(block => block.text)
      .filter(text => text && text.trim().length > 0)
      .join('\n\n');
  }

  /**
   * Get human-readable content type name
   */
  static getTypeLabel(type: ExtractedContent['type']): string {
    const labels: Record<ExtractedContent['type'], string> = {
      'bebuilder': 'BeBuilder',
      'gutenberg': 'Gutenberg',
      'elementor': 'Elementor',
      'wpbakery': 'WP Bakery',
      'standard': 'Standard Content',
    };
    return labels[type] || 'Unknown';
  }
}
