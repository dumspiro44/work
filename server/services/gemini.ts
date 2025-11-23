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
      // Remove ** (bold), _ (italic), ` (code) markdown markers
      translatedText = translatedText.replace(/\*\*(.*?)\*\*/g, '$1');
      translatedText = translatedText.replace(/__(.*?)__/g, '$1');
      translatedText = translatedText.replace(/\_(.*?)\_/g, '$1');
      translatedText = translatedText.replace(/`(.*?)`/g, '$1');
      
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
    const prompt = `Translate this title from ${sourceLang} to ${targetLang}: ${title}`;

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      let result = response.text || title;
      
      // Clean up markdown syntax from Gemini responses
      result = result.replace(/\*\*(.*?)\*\*/g, '$1');
      result = result.replace(/__(.*?)__/g, '$1');
      result = result.replace(/\_(.*?)\_/g, '$1');
      result = result.replace(/`(.*?)`/g, '$1');
      
      return result;
    } catch (error) {
      console.error('Title translation failed:', error);
      return title;
    }
  }
}
