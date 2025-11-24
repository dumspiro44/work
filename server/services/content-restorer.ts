import { serialize } from 'php-serialize';
import type { BlockMetadata } from '@shared/schema';

/**
 * Restore translated content back to original structures (BeBuilder, Gutenberg, Elementor, WP Bakery)
 */
export class ContentRestorerService {
  /**
   * Restore BeBuilder content - replace translated text back into PHP serialized structure
   */
  static restoreBeBuilder(
    originalMetadata: any,
    translatedContent: string,
    blockMetadata: BlockMetadata
  ): string {
    try {
      // originalMetadata is already the unserialized object from ContentExtractor
      const data = Array.isArray(originalMetadata) ? originalMetadata : JSON.parse(JSON.stringify(originalMetadata));
      
      // Create map of blocks to find by index
      const blockMap = new Map();
      blockMetadata.blocks.forEach((meta, idx) => {
        blockMap.set(idx, meta);
      });

      // Split translated content by lines - matches extraction process
      const translatedLines = translatedContent.split('\n').map(line => line.trim()).filter(line => line);
      
      // Restore translated text back into structure
      let translatedIdx = 0;
      const restoreInObject = (obj: any, blockIdx: number): void => {
        if (!obj || typeof obj !== 'object') return;

        if (Array.isArray(obj)) {
          obj.forEach((item, idx) => {
            restoreInObject(item, idx);
          });
          return;
        }

        // Look for text fields and replace if this block has translations
        const textFields = ['text', 'title', 'label', 'content', 'description', 'button_text', 'placeholder'];
        textFields.forEach(field => {
          if (obj[field] && typeof obj[field] === 'string') {
            // Find matching metadata for this block
            const meta = blockMetadata.blocks.find(m => m.index === translatedIdx);
            if (meta && meta.field === field && translatedIdx < translatedLines.length) {
              const newText = translatedLines[translatedIdx];
              if (newText && newText !== obj[field]) {
                obj[field] = newText;
                translatedIdx++;
              }
            }
          }
        });

        // Recursively process nested objects
        for (const key in obj) {
          if (obj.hasOwnProperty(key) && typeof obj[key] === 'object') {
            restoreInObject(obj[key], blockIdx);
          }
        }
      };

      // Process all items
      if (Array.isArray(data)) {
        data.forEach((item, idx) => {
          restoreInObject(item, idx);
        });
      }

      // Re-serialize to PHP and base64 encode
      const serialized = serialize(data);
      const encoded = Buffer.from(serialized).toString('base64');
      return encoded;
    } catch (error) {
      console.error('Error restoring BeBuilder content:', error);
      throw error;
    }
  }

  /**
   * Restore Gutenberg blocks with translated content
   */
  static restoreGutenberg(
    originalContent: string,
    translatedContent: string,
    blockMetadata: BlockMetadata
  ): string {
    try {
      const translatedLines = translatedContent.split('\n').map(line => line.trim()).filter(line => line);
      let translatedIdx = 0;

      // Match and replace each block's translated content
      const blockRegex = /<!-- wp:(\w+(?:\/\w+)*)\s*({[^]*?})?\s*-->([\s\S]*?)<!-- \/wp:\1\s*-->/g;
      
      return originalContent.replace(blockRegex, (match, blockType, blockDataStr, blockContent) => {
        const meta = blockMetadata.blocks[translatedIdx];
        if (meta && translatedIdx < translatedLines.length) {
          const translatedText = translatedLines[translatedIdx];
          translatedIdx++;
          
          // Reconstruct the block with translated content
          const openTag = `<!-- wp:${blockType}${blockDataStr ? ' ' + blockDataStr : ''} -->`;
          const closeTag = `<!-- /wp:${blockType} -->`;
          return `${openTag}${translatedText}${closeTag}`;
        }
        return match;
      });
    } catch (error) {
      console.error('Error restoring Gutenberg content:', error);
      throw error;
    }
  }

  /**
   * Restore Elementor JSON content
   */
  static restoreElementor(
    originalMetadata: any,
    translatedContent: string,
    blockMetadata: BlockMetadata
  ): string {
    try {
      const data = typeof originalMetadata === 'string' ? JSON.parse(originalMetadata) : originalMetadata;
      const translatedLines = translatedContent.split('\n').map(line => line.trim()).filter(line => line);
      let translatedIdx = 0;

      const restoreInObject = (obj: any): void => {
        if (!obj || typeof obj !== 'object') return;

        if (Array.isArray(obj)) {
          obj.forEach(item => restoreInObject(item));
          return;
        }

        if (obj.settings && typeof obj.settings === 'object') {
          const settings = obj.settings;
          const textFields = ['text', 'title', 'description', 'placeholder', 'button_text', 'label'];
          
          textFields.forEach(field => {
            if (settings[field] && typeof settings[field] === 'string' && translatedIdx < translatedLines.length) {
              settings[field] = translatedLines[translatedIdx];
              translatedIdx++;
            }
          });
        }

        for (const key in obj) {
          if (obj.hasOwnProperty(key) && typeof obj[key] === 'object') {
            restoreInObject(obj[key]);
          }
        }
      };

      restoreInObject(data);
      return JSON.stringify(data);
    } catch (error) {
      console.error('Error restoring Elementor content:', error);
      throw error;
    }
  }

  /**
   * Restore WP Bakery shortcodes
   */
  static restoreWpBakery(
    originalContent: string,
    translatedContent: string,
    blockMetadata: BlockMetadata
  ): string {
    try {
      const translatedLines = translatedContent.split('\n').map(line => line.trim()).filter(line => line);
      let translatedIdx = 0;

      const shortcodeRegex = /\[vc_(\w+)([^\]]*)\]([\s\S]*?)\[\/vc_\1\]/g;
      
      return originalContent.replace(shortcodeRegex, (match, shortcodeType, attributes, innerContent) => {
        const meta = blockMetadata.blocks[translatedIdx];
        if (meta && translatedIdx < translatedLines.length) {
          const translatedText = translatedLines[translatedIdx];
          translatedIdx++;
          
          return `[vc_${shortcodeType}${attributes}]${translatedText}[/vc_${shortcodeType}]`;
        }
        return match;
      });
    } catch (error) {
      console.error('Error restoring WP Bakery content:', error);
      throw error;
    }
  }

  /**
   * Restore standard HTML content
   */
  static restoreStandard(
    originalContent: string,
    translatedContent: string
  ): string {
    // For standard content, just use the translated content directly
    return translatedContent;
  }

  /**
   * Main restore method - routes to appropriate restorer based on type
   */
  static restoreContent(
    originalPostContent: string,
    originalMeta: Record<string, any>,
    translatedContent: string,
    blockMetadata: BlockMetadata
  ): {
    content: string;
    meta: Record<string, any>;
  } {
    try {
      const meta = { ...originalMeta };

      if (blockMetadata.type === 'bebuilder' && meta['mfn-page-items']) {
        // Restore BeBuilder metafield
        const restored = this.restoreBeBuilder(meta['mfn-page-items'], translatedContent, blockMetadata);
        meta['mfn-page-items'] = [restored]; // Wrap back in array as expected by WordPress
        return { content: originalPostContent, meta };
      }

      if (blockMetadata.type === 'gutenberg') {
        // Restore Gutenberg blocks in post content
        const restored = this.restoreGutenberg(originalPostContent, translatedContent, blockMetadata);
        return { content: restored, meta };
      }

      if (blockMetadata.type === 'elementor' && meta['_elementor_data']) {
        // Restore Elementor metafield
        const restored = this.restoreElementor(meta['_elementor_data'], translatedContent, blockMetadata);
        meta['_elementor_data'] = restored;
        return { content: originalPostContent, meta };
      }

      if (blockMetadata.type === 'wpbakery') {
        // Restore WP Bakery shortcodes in post content
        const restored = this.restoreWpBakery(originalPostContent, translatedContent, blockMetadata);
        return { content: restored, meta };
      }

      // Standard content
      return { content: translatedContent, meta };
    } catch (error) {
      console.error('Error restoring content:', error);
      throw new Error(`Failed to restore content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
