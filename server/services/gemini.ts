import { GoogleGenAI } from "@google/genai";

export class GeminiTranslationService {
  private ai: GoogleGenAI;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || '';
    this.ai = new GoogleGenAI({ apiKey: this.apiKey });
  }

  async translateContent(
    content: string,
    sourceLang: string,
    targetLang: string,
    systemInstruction?: string
  ): Promise<{ translatedText: string; tokensUsed: number }> {
    const defaultInstruction = 'You are a professional translator. Preserve all HTML tags, classes, IDs, and WordPress shortcodes exactly as they appear. Only translate the text content between tags.';
    
    const prompt = `Translate the following HTML content from ${sourceLang} to ${targetLang}. Maintain all HTML structure, attributes, and WordPress shortcodes exactly as they are. Only translate the visible text content:\n\n${content}`;

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        config: {
          systemInstruction: systemInstruction || defaultInstruction,
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      let translatedText = response.text || '';
      
      // Remove markdown characters more aggressively
      // First remove bold markdown with content: **text** -> text
      translatedText = translatedText.replace(/\*\*([^*]+?)\*\*/g, '$1');
      translatedText = translatedText.replace(/__([^_]+?)__/g, '$1');
      // Then remove any remaining single markdown chars
      translatedText = translatedText.replace(/[\*_`]/g, '');
      
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
