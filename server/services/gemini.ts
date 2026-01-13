import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Decode HTML entities - keep replacing until no changes
 * Handles double-encoded entities like &amp;lt;
 */
function decodeHTML(html: string): string {
  if (!html) return html;
  let result = html;
  let prevResult = '';
  let iterations = 0;
  const maxIterations = 10; // Safety limit
  
  // Keep decoding until no more changes (handles double-encoded entities)
  while (result !== prevResult && iterations < maxIterations) {
    prevResult = result;
    result = result
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
    iterations++;
  }
  
  return result;
}

export class GeminiTranslationService {
  private genAI: GoogleGenerativeAI;
  private apiKey: string;
  private readonly MAX_CHUNK_SIZE = 8000; // Characters per chunk to avoid response truncation

  constructor(apiKey: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || '';
    console.log('[GEMINI] Using API key:', this.apiKey ? `***${this.apiKey.slice(-10)}` : 'NOT SET');
    this.genAI = new GoogleGenerativeAI(this.apiKey);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Extract script tags from HTML and store their positions
   * Returns: [contentWithoutScripts, scriptTags]
   */
  private extractScripts(html: string): [string, Array<{ content: string; index: number }>] {
    const scriptTags: Array<{ content: string; index: number }> = [];
    const scriptRegex = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
    
    let index = 0;
    const contentWithoutScripts = html.replace(scriptRegex, (match) => {
      scriptTags.push({ content: match, index });
      index++;
      return `<!-- SCRIPT_PLACEHOLDER_${index - 1} -->`;
    });
    
    return [contentWithoutScripts, scriptTags];
  }

  /**
   * Restore script tags back into translated content
   */
  private restoreScripts(html: string, scripts: Array<{ content: string; index: number }>): string {
    let result = html;
    
    // Restore in reverse order to preserve indices
    for (let i = scripts.length - 1; i >= 0; i--) {
      const placeholder = `<!-- SCRIPT_PLACEHOLDER_${i} -->`;
      result = result.replace(placeholder, scripts[i].content);
    }
    
    return result;
  }

  /**
   * Extract image tags from HTML and store their complete attributes
   * ENSURES all images have alt text (WordPress requirement)
   * Handles both regular and HTML-encoded img tags
   * Returns: [contentWithoutImages, imageTags]
   */
  private extractImages(html: string): [string, Array<{ content: string; index: number }>] {
    const imageTags: Array<{ content: string; index: number }> = [];
    
    // Match both &lt;img and <img patterns
    const imgRegex = /(&lt;img\s+[^&]*(?:&gt;|&lt;\/img\s*&gt;))|(<img\s+[^>]*>)/gi;
    
    let index = 0;
    const contentWithoutImages = html.replace(imgRegex, (match) => {
      let imgTag = match;
      let isEncoded = imgTag.startsWith('&lt;');
      
      // Decode if HTML-encoded
      if (isEncoded) {
        imgTag = decodeHTML(imgTag);
      }
      
      // Check if image has alt attribute with value
      const hasAltWithValue = /\salt\s*=\s*["'][^"']*["']/i.test(imgTag);
      
      // If no alt with value, add default alt text
      if (!hasAltWithValue) {
        // Remove old empty alt if it exists
        imgTag = imgTag.replace(/\salt\s*=\s*["']["']/i, '');
        // Add default alt text before the closing >
        imgTag = imgTag.replace(/>$/, ` alt="Image">`);
      }
      
      imageTags.push({ content: imgTag, index });
      index++;
      return `<!-- IMG_PLACEHOLDER_${index - 1} -->`;
    });
    
    return [contentWithoutImages, imageTags];
  }

  /**
   * Restore image tags back into translated content
   * Ensures images remain DECODED (not HTML-encoded)
   */
  private restoreImages(html: string, images: Array<{ content: string; index: number }>): string {
    let result = html;
    
    // Restore in reverse order to preserve indices
    for (let i = images.length - 1; i >= 0; i--) {
      const placeholder = `<!-- IMG_PLACEHOLDER_${i} -->`;
      // Ensure image content is decoded when restoring
      const decodedImage = decodeHTML(images[i].content);
      result = result.replace(placeholder, decodedImage);
    }
    
    return result;
  }

  /**
   * Split HTML content into logical chunks for translation
   * Prioritizes breaking after </table> tags to maintain table structure
   */
  private splitHtmlIntoChunks(html: string): string[] {
    if (html.length <= this.MAX_CHUNK_SIZE) {
      return [html];
    }

    const chunks: string[] = [];
    let i = 0;

    while (i < html.length) {
      let chunkEndPos = i + this.MAX_CHUNK_SIZE;
      
      if (chunkEndPos >= html.length) {
        // Last chunk - take everything remaining
        chunks.push(html.substring(i));
        break;
      }

      // Search backwards from chunk end to find best break point
      const searchStart = Math.max(i, chunkEndPos - 1000); // Search in 1000 char window
      const searchArea = html.substring(searchStart, Math.min(chunkEndPos + 100, html.length));
      
      let breakPos = chunkEndPos;
      let foundBreakPoint = false;

      // PRIORITY 1: Break after </table> tag
      const tableCloseIdx = searchArea.lastIndexOf('</table>');
      if (tableCloseIdx !== -1) {
        breakPos = searchStart + tableCloseIdx + 8; // 8 = length of '</table>'
        foundBreakPoint = true;
      }

      // PRIORITY 2: Break after </div> tag
      if (!foundBreakPoint) {
        const divCloseIdx = searchArea.lastIndexOf('</div>');
        if (divCloseIdx !== -1) {
          breakPos = searchStart + divCloseIdx + 6; // 6 = length of '</div>'
          foundBreakPoint = true;
        }
      }

      // PRIORITY 3: Break after </p> tag
      if (!foundBreakPoint) {
        const pCloseIdx = searchArea.lastIndexOf('</p>');
        if (pCloseIdx !== -1) {
          breakPos = searchStart + pCloseIdx + 4; // 4 = length of '</p>'
          foundBreakPoint = true;
        }
      }

      // PRIORITY 4: Break at last space/newline
      if (!foundBreakPoint) {
        const lastSpace = html.lastIndexOf(' ', chunkEndPos);
        const lastNewline = html.lastIndexOf('\n', chunkEndPos);
        if (lastSpace > i + 500 || lastNewline > i + 500) {
          breakPos = Math.max(lastSpace, lastNewline) + 1;
          foundBreakPoint = true;
        }
      }

      // Safety: ensure we move forward
      if (breakPos <= i) {
        breakPos = Math.min(i + this.MAX_CHUNK_SIZE, html.length);
      }

      chunks.push(html.substring(i, breakPos));
      i = breakPos;
    }

    return chunks;
  }

  async translateContent(
    content: string,
    sourceLang: string,
    targetLang: string,
    systemInstruction?: string,
    retryCount: number = 0,
    isChunk: boolean = false,
    scripts?: Array<{ content: string; index: number }>,
    images?: Array<{ content: string; index: number }>
  ): Promise<{ translatedText: string; tokensUsed: number }> {
    // Decode HTML entities to ensure proper HTML parsing (WordPress sends encoded content)
    content = decodeHTML(content);
    
    // Extract script tags and image tags on first call (to avoid translating them)
    if (!isChunk && !scripts) {
      const [contentWithoutScripts, extractedScripts] = this.extractScripts(content);
      scripts = extractedScripts;
      content = contentWithoutScripts;
      
      const [contentWithoutImages, extractedImages] = this.extractImages(content);
      images = extractedImages;
      content = contentWithoutImages;
    }

    // Split large content into chunks to avoid response truncation
    if (!isChunk) {
      const chunks = this.splitHtmlIntoChunks(content);
      
      if (chunks.length > 1) {
        const translatedChunks: string[] = [];
        let totalTokens = 0;
        
        for (let i = 0; i < chunks.length; i++) {
          try {
            // Add delay between chunks to respect rate limits (5 RPM free tier limit)
            if (i > 0) {
              await this.sleep(13000);
            }
            
            const result = await this.translateContent(
              chunks[i],
              sourceLang,
              targetLang,
              systemInstruction,
              0,
              true, // Mark as chunk to avoid infinite recursion
              scripts, // Pass scripts through to preserve them
              images  // Pass images through to preserve them
            );
            translatedChunks.push(result.translatedText);
            totalTokens += result.tokensUsed;
          } catch (error) {
            console.error(`[GEMINI] Failed to translate chunk ${i + 1}:`, error);
            throw error;
          }
        }
        
        const fullTranslation = translatedChunks.join('');
        // Restore scripts to final translation
        const finalTranslation = scripts ? this.restoreScripts(fullTranslation, scripts) : fullTranslation;
        
        return {
          translatedText: finalTranslation,
          tokensUsed: totalTokens,
        };
      }
    }

    const defaultInstruction = 'You are a professional translator. Translate HTML content while preserving ALL structure, formatting, and tags. CRITICAL: DO NOT modify HTML tags, attributes, or structure - ONLY translate text between tags.';
    
    const prompt = `Translate this HTML content from ${sourceLang} to ${targetLang}. Preserve HTML structure, tags, attributes, and formatting exactly as is. Only translate text content between tags. Return the HTML as-is but with translated text.

HTML to translate:
${content}`;

    // Add delay before API call to respect rate limits
    await this.sleep(13000);

    const modelNames = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"];
    let lastError: any;

    for (const modelName of modelNames) {
      try {
        const model = this.genAI.getGenerativeModel(
          { model: modelName, systemInstruction: systemInstruction || defaultInstruction },
          { apiVersion: 'v1' }
        );
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let translatedText = response.text() || '';
        
        // Clean up markdown if Gemini wrapped in ```html ... ```
        translatedText = translatedText.replace(/^```html\n/, '').replace(/\n```$/, '');
        translatedText = translatedText.replace(/^```\n/, '').replace(/\n```$/, '');
        translatedText = translatedText.trim();
        
        // Restore script tags back into the translated content
        if (scripts && scripts.length > 0) {
          translatedText = this.restoreScripts(translatedText, scripts);
        }
        
        // Restore image tags back into the translated content
        if (images && images.length > 0) {
          translatedText = this.restoreImages(translatedText, images);
        }
        
        const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

        return {
          translatedText,
          tokensUsed,
        };
      } catch (error) {
        lastError = error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`[GEMINI] Model ${modelName} failed, trying next...`, errorMessage);
      }
    }
    
    // If we reach here, all models failed
    const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
    
    // Retry logic for 500/503 (internal error / service overloaded) - try up to 3 times
    if ((errorMessage.includes('500') || errorMessage.includes('503') || errorMessage.includes('UNAVAILABLE') || errorMessage.includes('INTERNAL')) && retryCount < 3) {
      const delayMs = Math.pow(2, retryCount) * 2000; // 2s, 4s, 8s
      console.log(`[GEMINI] Got retryable error (500/503/INTERNAL), retrying in ${delayMs}ms... (attempt ${retryCount + 1}/3)`);
      await this.sleep(delayMs);
      return this.translateContent(content, sourceLang, targetLang, systemInstruction, retryCount + 1, isChunk);
    }
    
    // Detect and re-throw quota errors with 429 code for retry logic
    if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('exceeded')) {
      throw new Error(`429: ${errorMessage}`);
    }
    
    // Try to extract cleaner message if it's JSON from Google API
    let cleanMessage = errorMessage;
    try {
      if (errorMessage.includes('{')) {
        const jsonMatch = errorMessage.match(/\{.*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.error?.message) {
            cleanMessage = parsed.error.message;
          }
        }
      }
    } catch (e) {
      // Keep original if parsing fails
    }

    throw new Error(`Gemini translation failed: ${cleanMessage}`);
  }

  async translateTitle(
    title: string,
    sourceLang: string,
    targetLang: string,
    retryCount: number = 0
  ): Promise<string> {
    const prompt = `Translate ONLY this title from ${sourceLang} to ${targetLang}, return ONLY the translated text with no explanation: "${title}"`;

    // Add delay before API call to respect rate limits
    const delayMs = 4500;
    await this.sleep(delayMs);

    const modelNames = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"];
    let lastError: any;

    for (const modelName of modelNames) {
      try {
        const model = this.genAI.getGenerativeModel({ model: modelName }, { apiVersion: 'v1' });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let resultText = (response.text() || title).trim();
        
        // If response is empty or same as original, return original
        if (!resultText || resultText === title) {
          continue;
        }
        
        // Split by lines and process each
        const lines = resultText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        
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
        return resultText || title;
      } catch (error) {
        lastError = error;
        console.warn(`[GEMINI TITLE] Model ${modelName} failed, trying next...`, error instanceof Error ? error.message : String(error));
      }
    }
    
    const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
    
    // Retry logic for 500/503 (internal error / service overloaded) - try up to 3 times
    if ((errorMessage.includes('500') || errorMessage.includes('503') || errorMessage.includes('UNAVAILABLE') || errorMessage.includes('INTERNAL')) && retryCount < 3) {
      const delayMs = Math.pow(2, retryCount) * 2000; // 2s, 4s, 8s
      console.log(`[GEMINI] Title translation got retryable error (500/503/INTERNAL), retrying in ${delayMs}ms... (attempt ${retryCount + 1}/3)`);
      await this.sleep(delayMs);
      return this.translateTitle(title, sourceLang, targetLang, retryCount + 1);
    }
    
    console.error('Title translation failed after trying all models:', lastError);
    return title;
  }
}
