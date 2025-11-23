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
      
      // Clean up markdown syntax from Gemini responses
      // Remove ** (bold), __ (bold), * (italic), _ (italic), ` (code)
      translatedText = translatedText.replace(/\*\*([^*]*)\*\*/g, '$1');
      translatedText = translatedText.replace(/__([^_]*)__/g, '$1');
      translatedText = translatedText.replace(/\*([^*]*)\*/g, '$1');
      translatedText = translatedText.replace(/_([^_]*)_/g, '$1');
      translatedText = translatedText.replace(/`([^`]*)`/g, '$1');
      
      // Remove any remaining lone markdown characters
      translatedText = translatedText.replace(/[*_`]/g, '');
      
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
      
      // Clean up markdown syntax - handle ** and __ with any content between them
      result = result.replace(/\*\*([^*]*)\*\*/g, '$1');
      result = result.replace(/__([^_]*)__/g, '$1');
      result = result.replace(/\*([^*]*)\*/g, '$1');
      result = result.replace(/_([^_]*)_/g, '$1');
      result = result.replace(/`([^`]*)`/g, '$1');
      
      // Remove any quotes that might wrap the result
      result = result.replace(/^["']|["']$/g, '');
      
      // Extract just the translation if Gemini added explanation
      // Look for common patterns where translation is after colon, dash, or is the first sentence
      const lines = result.split('\n').filter(l => l.trim());
      if (lines.length > 1) {
        // If multiple lines, try to find the actual translation
        for (const line of lines) {
          if (!line.includes('(') && !line.includes('translation') && !line.includes('means')) {
            result = line.trim();
            break;
          }
        }
      }
      
      // Final cleanup - remove any remaining markdown
      result = result.replace(/[*_`]/g, '');
      
      return result.trim() || title;
    } catch (error) {
      console.error('Title translation failed:', error);
      return title;
    }
  }
}
