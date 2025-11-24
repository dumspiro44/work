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
    console.log('[GEMINI] Input content screenshot check:', content.includes('Screenshot'));
    const screenshotMatch = content.match(/Screenshot[^"<>]*\.png/);
    if (screenshotMatch) {
      console.log('[GEMINI] Found image URL in input:', screenshotMatch[0]);
      // Log the full raw input around the URL
      const urlIndex = content.indexOf('Screenshot');
      if (urlIndex >= 0) {
        const contextStart = Math.max(0, urlIndex - 50);
        const contextEnd = Math.min(content.length, urlIndex + 150);
        console.log('[GEMINI] RAW INPUT context:', content.substring(contextStart, contextEnd));
      }
    }
    
    // Extract all links before translation for validation
    const linksRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
    const links: Array<{ url: string; text: string }> = [];
    let match;
    while ((match = linksRegex.exec(content)) !== null) {
      links.push({ url: match[1], text: match[2] });
    }
    
    const defaultInstruction = 'You are a professional translator. CRITICAL: Preserve all HTML tags, classes, IDs, links (href attributes), WordPress shortcodes, and attributes exactly as they appear. Do NOT translate URLs or href values. Only translate the text content between tags.';
    
    const linksInfo = links.length > 0 ? `\n\nIMPORTANT: This content contains ${links.length} internal link(s). Make sure all <a href="..."> links are preserved exactly as they are.` : '';
    
    const prompt = `Translate the following HTML content from ${sourceLang} to ${targetLang}. Maintain all HTML structure, attributes, and WordPress shortcodes exactly as they are. Only translate the visible text content. Preserve all internal and external links (do not modify href attributes)${linksInfo}:\n\n${content}`;

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        config: {
          systemInstruction: systemInstruction || defaultInstruction,
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      let translatedText = response.text || '';
      
      console.log('[GEMINI] Output from API screenshot check:', translatedText.includes('Screenshot'));
      const apiScreenshotMatch = translatedText.match(/Screenshot[^"<>]*\.png/);
      if (apiScreenshotMatch) {
        console.log('[GEMINI] Found image URL in API response:', apiScreenshotMatch[0]);
        // Log the full raw response around the URL
        const urlIndex = translatedText.indexOf('Screenshot');
        if (urlIndex >= 0) {
          const contextStart = Math.max(0, urlIndex - 50);
          const contextEnd = Math.min(translatedText.length, urlIndex + 150);
          console.log('[GEMINI] RAW API Response context:', translatedText.substring(contextStart, contextEnd));
        }
      }
      
      // Preserve URLs by replacing them with placeholders before markdown removal
      // Exclude quotes from URLs as they're often used as delimiters in HTML
      const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
      const urls: string[] = [];
      let beforeUrlReplace = translatedText;
      translatedText = translatedText.replace(urlRegex, (match) => {
        urls.push(match);
        return `URLPLACEHOLDER${urls.length - 1}URLEND`;
      });
      console.log('[GEMINI] Step 1 - URL extraction:', {
        urlsFound: urls.length,
        contentChanged: beforeUrlReplace !== translatedText,
        firstUrl: urls[0],
        sampleUrlFromResponse: apiScreenshotMatch?.[0]
      });
      
      // Remove markdown characters
      // First remove bold markdown with content: **text** -> text
      let beforeBold = translatedText;
      translatedText = translatedText.replace(/\*\*([^*]+?)\*\*/g, '$1');
      console.log('[GEMINI] Step 2 - Remove bold (**text**):', {
        changed: beforeBold !== translatedText
      });
      
      let beforeUnderscore = translatedText;
      translatedText = translatedText.replace(/__([^_]+?)__/g, '$1');
      console.log('[GEMINI] Step 3 - Remove double underscore (__text__):', {
        changed: beforeUnderscore !== translatedText,
        contentSample: translatedText.substring(0, 200)
      });
      
      // Then remove any remaining single asterisks and backticks (but NOT underscores in URLs)
      let beforeRemoveChars = translatedText;
      translatedText = translatedText.replace(/[\*`]/g, '');
      console.log('[GEMINI] Step 4 - Remove asterisks and backticks:', {
        changed: beforeRemoveChars !== translatedText
      });
      
      // Restore URLs
      let beforeUrlRestore = translatedText;
      urls.forEach((url, index) => {
        translatedText = translatedText.replace(`URLPLACEHOLDER${index}URLEND`, url);
      });
      console.log('[GEMINI] Step 5 - URL restoration:', {
        urlsRestored: urls.length,
        contentChanged: beforeUrlRestore !== translatedText,
        checkScreenshot: translatedText.includes('Screenshot'),
        screenshotInFinal: translatedText.match(/Screenshot[^"<>]*\.png/)?.[0]
      });
      
      // Log for debugging
      console.log('[GEMINI] URL preservation check:', {
        originalHadUrls: (response.text || '').match(/(https?:\/\/[^\s<>]+)/g)?.length || 0,
        translatedHasUrls: translatedText.match(/(https?:\/\/[^\s<>]+)/g)?.length || 0,
        sampleUrl: urls[0]
      });
      
      // Validate that links are preserved
      if (links.length > 0) {
        const translatedLinksRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
        const translatedLinksCount = (translatedText.match(translatedLinksRegex) || []).length;
        console.log(`[GEMINI] Links validation: Expected ${links.length} links, found ${translatedLinksCount} in translation`);
        
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
