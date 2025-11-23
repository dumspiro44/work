import { GoogleGenAI } from "@google/genai";

export class GeminiTranslationService {
  private ai: GoogleGenAI;
  private apiKey: string;
  private shortcodeCache: Map<string, string> = new Map();

  constructor(apiKey: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || '';
    this.ai = new GoogleGenAI({ apiKey: this.apiKey });
  }

  private extractShortcodes(content: string): { cleanContent: string; shortcodes: Map<string, string> } {
    const shortcodes = new Map<string, string>();
    let cleanContent = content;
    let shortcodeIndex = 0;

    // Match all WordPress shortcodes: [name attr="value" /] or [name attr="value"]...[/name]
    const shortcodeRegex = /\[[\w]+[^\]]*(?:\][^\[]*?\[\/[\w]+\]|\s*\/\])/g;
    const matches = content.match(shortcodeRegex);
    
    if (matches) {
      matches.forEach((shortcode) => {
        const placeholder = `__SHORTCODE_${shortcodeIndex}__`;
        shortcodes.set(placeholder, shortcode);
        cleanContent = cleanContent.replace(shortcode, placeholder);
        shortcodeIndex++;
      });
    }

    return { cleanContent, shortcodes };
  }

  private restoreShortcodes(content: string, shortcodes: Map<string, string>): string {
    let result = content;
    shortcodes.forEach((shortcode, placeholder) => {
      result = result.replace(placeholder, shortcode);
    });
    return result;
  }

  async translateContent(
    content: string,
    sourceLang: string,
    targetLang: string,
    systemInstruction?: string
  ): Promise<{ translatedText: string; tokensUsed: number }> {
    const defaultInstruction = 'You are a professional translator. Preserve all HTML tags, classes, IDs, and placeholders like __SHORTCODE_X__ exactly as they appear. Only translate the text content between tags and placeholders. Never translate or modify anything inside square brackets or that starts with __.';
    
    // Extract shortcodes before translation
    const { cleanContent, shortcodes } = this.extractShortcodes(content);
    
    const prompt = `Translate the following HTML content from ${sourceLang} to ${targetLang}. Maintain all HTML structure, attributes, and special placeholders (__SHORTCODE_X__) exactly as they are. Only translate the visible text content:\n\n${cleanContent}`;

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        config: {
          systemInstruction: systemInstruction || defaultInstruction,
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      let translatedText = response.text || '';
      
      // Remove markdown characters carefully to preserve __SHORTCODE_X__ placeholders
      // First remove bold markdown with content: **text** -> text
      translatedText = translatedText.replace(/\*\*([^*]+?)\*\*/g, '$1');
      // For __, only remove if it's formatting markdown (has content between), not our placeholders
      translatedText = translatedText.replace(/__([^_]+)__/g, (match, content) => {
        // If content contains "SHORTCODE_", it's our placeholder, keep it
        if (content.includes('SHORTCODE_')) {
          return match;
        }
        // Otherwise it's markdown formatting, remove it
        return content;
      });
      // Remove any remaining single markdown chars
      translatedText = translatedText.replace(/[\*`]/g, '');
      
      // Restore shortcodes
      translatedText = this.restoreShortcodes(translatedText, shortcodes);
      
      const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

      return {
        translatedText,
        tokensUsed,
      };
    } catch (error) {
      throw new Error(`Gemini translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async translateTitle(
    title: string,
    sourceLang: string,
    targetLang: string
  ): Promise<string> {
    const prompt = `Translate ONLY this title from ${sourceLang} to ${targetLang}, return ONLY the translated text with no explanation: "${title}"`;

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      let result = (response.text || title).trim();
      
      // Split by lines and process each
      const lines = result.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      
      // Extract translation from markdown bold if present
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        
        // Remove explanation prefixes
        if (line.match(/^(the|a|an)\s+(most|common|direct|appropriate|best)/i)) {
          continue;
        }
        if (line.includes(':') && !line.match(/[\u0600-\u06FF\u0400-\u04FF]/)) {
          // Skip lines with colon that don't look like translations
          continue;
        }
        
        // Extract from **text** or __text__ markers
        const boldMatch = line.match(/\*\*([^*]+)\*\*|__([^_]+)__/);
        if (boldMatch) {
          line = boldMatch[1] || boldMatch[2];
        }
        
        // Remove markdown and parenthetical text
        line = line.replace(/[\*_`]/g, '');
        line = line.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
        
        // If this line looks like a translation (not all english explanation)
        if (line && !line.toLowerCase().includes('translation') && !line.toLowerCase().includes('context')) {
          return line || title;
        }
      }
      
      return title;
    } catch (error) {
      console.error('Title translation failed:', error);
      return title;
    }
  }
}
