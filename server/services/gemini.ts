import { GoogleGenAI } from "@google/genai";

export class GeminiTranslationService {
  private ai: GoogleGenAI;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    this.ai = new GoogleGenAI({ apiKey: this.apiKey });
  }

  private extractShortcodes(content: string): { cleaned: string; shortcodes: Map<string, string> } {
    const shortcodes = new Map<string, string>();
    let cleaned = content;
    let index = 0;

    // Match WordPress shortcodes: [name ...] or [name][/name]
    // This regex matches [word ... /] or [word ...][/word]
    const shortcodeRegex = /\[[a-zA-Z_][a-zA-Z0-9_-]*(?:\s[^\]]*?)?\](?:(?:(?!\[).)*?\[[\/a-zA-Z_][a-zA-Z0-9_-]*\])?/g;
    
    let match;
    while ((match = shortcodeRegex.exec(content)) !== null) {
      const placeholder = `___SHORTCODE_${index}___`;
      shortcodes.set(placeholder, match[0]);
      cleaned = cleaned.replace(match[0], placeholder);
      index++;
    }

    return { cleaned, shortcodes };
  }

  private restoreShortcodes(content: string, shortcodes: Map<string, string>): string {
    let result = content;
    shortcodes.forEach((shortcode, placeholder) => {
      result = result.split(placeholder).join(shortcode);
    });
    return result;
  }

  async translateContent(
    content: string,
    sourceLang: string,
    targetLang: string,
    systemInstruction?: string
  ): Promise<{ translatedText: string; tokensUsed: number }> {
    // Extract shortcodes first
    const { cleaned, shortcodes } = this.extractShortcodes(content);
    
    const prompt = `Translate this HTML from ${sourceLang} to ${targetLang}. Keep all HTML structure unchanged. Preserve all placeholders like ___SHORTCODE_0___ exactly as they are:\n\n${cleaned}`;

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      let translatedText = response.text || cleaned;
      
      // Remove markdown code blocks
      if (translatedText.includes('```')) {
        translatedText = translatedText.replace(/```html\n/g, '').replace(/```\n/g, '').replace(/^```$/gm, '').replace(/```$/g, '');
      }
      
      translatedText = translatedText.trim();
      
      // Restore shortcodes
      translatedText = this.restoreShortcodes(translatedText, shortcodes);
      
      const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

      return {
        translatedText,
        tokensUsed,
      };
    } catch (error) {
      // Return original content if translation fails
      return {
        translatedText: content,
        tokensUsed: 0,
      };
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
