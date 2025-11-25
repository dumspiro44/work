import { GoogleGenAI } from "@google/genai";

export class GeminiTranslationService {
  private ai: GoogleGenAI;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || '';
    this.ai = new GoogleGenAI({ apiKey: this.apiKey });
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async translateContent(
    content: string,
    sourceLang: string,
    targetLang: string,
    systemInstruction?: string,
    retryCount: number = 0
  ): Promise<{ translatedText: string; tokensUsed: number }> {
    // Extract all links before translation for validation
    const linksRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
    const links: Array<{ url: string; text: string }> = [];
    let match;
    while ((match = linksRegex.exec(content)) !== null) {
      links.push({ url: match[1], text: match[2] });
    }
    
    const defaultInstruction = 'You are a professional translator. Translate HTML content while preserving ALL structure, formatting, and tags. CRITICAL: DO NOT modify HTML tags, attributes, or structure - ONLY translate text between tags.';
    
    const prompt = `Translate this HTML content from ${sourceLang} to ${targetLang}. Preserve HTML structure, tags, attributes, and formatting exactly as is. Only translate text content between tags. Return the HTML as-is but with translated text.

HTML to translate:
${content}`;

    console.log('[GEMINI] Sending content length:', content.length, 'chars');
    console.log('[GEMINI] Content preview (first 300 chars):', content.substring(0, 300));

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        config: {
          systemInstruction: systemInstruction || defaultInstruction,
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      let translatedText = response.text || '';
      
      console.log('[GEMINI] RAW RESPONSE LENGTH:', translatedText.length);
      console.log('[GEMINI] RAW RESPONSE (first 500 chars):', translatedText.substring(0, 500));
      console.log('[GEMINI] RAW RESPONSE HAS TABLE TAG:', translatedText.includes('<table'));
      console.log('[GEMINI] RAW RESPONSE HAS BR TAGS:', translatedText.includes('<br'));
      
      // Clean up markdown if Gemini wrapped in ```html ... ```
      translatedText = translatedText.replace(/^```html\n/, '').replace(/\n```$/, '');
      translatedText = translatedText.replace(/^```\n/, '').replace(/\n```$/, '');
      translatedText = translatedText.trim();
      
      console.log('[GEMINI] AFTER CLEANUP LENGTH:', translatedText.length);
      console.log('[GEMINI] AFTER CLEANUP (first 500 chars):', translatedText.substring(0, 500));
      
      // Validate that links are preserved
      if (links.length > 0) {
        const translatedLinksRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
        const translatedLinksCount = (translatedText.match(translatedLinksRegex) || []).length;
        
        if (translatedLinksCount < links.length) {
          console.warn(`[GEMINI] WARNING: Some links may have been lost during translation! Expected ${links.length}, got ${translatedLinksCount}`);
        }
      }
      
      const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

      return {
        translatedText,
        tokensUsed,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Retry logic for 503 (service overloaded) - try up to 3 times
      if ((errorMessage.includes('503') || errorMessage.includes('UNAVAILABLE')) && retryCount < 3) {
        const delayMs = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        console.log(`[GEMINI] Got 503 error, retrying in ${delayMs}ms... (attempt ${retryCount + 1}/3)`);
        await this.sleep(delayMs);
        return this.translateContent(content, sourceLang, targetLang, systemInstruction, retryCount + 1);
      }
      
      // Detect and re-throw quota errors with 429 code for retry logic
      if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('exceeded')) {
        throw new Error(`429: ${errorMessage}`);
      }
      
      throw new Error(`Gemini translation failed: ${errorMessage}`);
    }
  }

  async translateTitle(
    title: string,
    sourceLang: string,
    targetLang: string,
    retryCount: number = 0
  ): Promise<string> {
    const prompt = `Translate ONLY this title from ${sourceLang} to ${targetLang}, return ONLY the translated text with no explanation: "${title}"`;

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      let result = (response.text || title).trim();
      
      // If response is empty or same as original, return original
      if (!result || result === title) {
        return title;
      }
      
      // Split by lines and process each
      const lines = result.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      
      // Process each line to extract the actual translation
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        
        // Skip metadata lines (explanation prefixes)
        if (line.match(/^(the|a|an)\s+(most|common|direct|appropriate|best)/i)) {
          continue;
        }
        if (line.toLowerCase().includes('translation') || line.toLowerCase().includes('context')) {
          continue;
        }
        
        // Extract from **text** or __text__ markers (remove markdown)
        const boldMatch = line.match(/\*\*([^*]+)\*\*|__([^_]+)__/);
        if (boldMatch) {
          line = boldMatch[1] || boldMatch[2];
        }
        
        // Remove remaining markdown and parenthetical text
        line = line.replace(/[\*_`]/g, '');
        line = line.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
        
        // If we found a non-empty line that's different from original, return it as translation
        if (line && line.length > 0 && line !== title) {
          return line;
        }
      }
      
      // Fallback: if no valid translation found but result is different, return result
      return result || title;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Retry logic for 503 (service overloaded) - try up to 3 times
      if ((errorMessage.includes('503') || errorMessage.includes('UNAVAILABLE')) && retryCount < 3) {
        const delayMs = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        console.log(`[GEMINI] Title translation got 503, retrying in ${delayMs}ms... (attempt ${retryCount + 1}/3)`);
        await this.sleep(delayMs);
        return this.translateTitle(title, sourceLang, targetLang, retryCount + 1);
      }
      
      console.error('Title translation failed:', error);
      return title;
    }
  }
}
