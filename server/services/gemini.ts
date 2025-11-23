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
      
      // Remove explanation patterns like "The most common... is:" or "translation is:"
      result = result.replace(/^[^:]*(?:translation|is):\s*/i, '');
      
      // Extract text between ** or __ markers (markdown bold)
      const boldMatch = result.match(/\*\*([^*]+)\*\*|__([^_]+)__/);
      if (boldMatch) {
        result = boldMatch[1] || boldMatch[2] || result;
      }
      
      // Remove markdown characters
      result = result.replace(/[\*_`]/g, '');
      
      // Remove parenthetical explanations like (Privet mir!)
      result = result.replace(/\s*\([^)]*\)\s*/g, ' ');
      
      // Remove any quotes
      result = result.replace(/^["']|["']$/g, '');
      
      // Clean up extra whitespace
      result = result.replace(/\s+/g, ' ').trim();
      
      // If result is empty or too long (multiple sentences), return original title
      if (!result || result.split(' ').length > 10) {
        return title;
      }
      
      return result;
    } catch (error) {
      console.error('Title translation failed:', error);
      return title;
    }
  }
}
