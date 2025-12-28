// Using native fetch - no additional dependencies

/**
 * Decode HTML entities
 */
function decodeHTML(html: string): string {
  if (!html) return html;
  let result = html;
  let prevResult = '';
  let iterations = 0;
  const maxIterations = 10;
  
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

export class GoogleTranslateService {
  private readonly MAX_CHUNK_SIZE = 500; // MyMemory API has very small limits - use 500 chars max

  constructor(apiKey?: string) {
    // Google Translate API (free version) doesn't require API key
    console.log('[GOOGLE-TRANSLATE] Service initialized (free tier, no API key needed)');
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private extractScripts(html: string): [string, Array<{ content: string; index: number }>] {
    const scriptTags: Array<{ content: string; index: number }> = [];
    const scriptRegex = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
    
    let index = 0;
    const contentWithoutScripts = html.replace(scriptRegex, (match) => {
      scriptTags.push({ content: match, index });
      index++;
      return `<!-- SCRIPT_PLACEHOLDER_${index - 1} -->`;
    });
    
    console.log(`[GOOGLE-TRANSLATE] Extracted ${scriptTags.length} script tags for protection`);
    return [contentWithoutScripts, scriptTags];
  }

  private restoreScripts(html: string, scripts: Array<{ content: string; index: number }>): string {
    let result = html;
    
    for (let i = scripts.length - 1; i >= 0; i--) {
      const placeholder = `<!-- SCRIPT_PLACEHOLDER_${i} -->`;
      result = result.replace(placeholder, scripts[i].content);
    }
    
    if (scripts.length > 0) {
      console.log(`[GOOGLE-TRANSLATE] Restored ${scripts.length} script tags back into content`);
    }
    return result;
  }

  private extractImages(html: string): [string, Array<{ content: string; index: number }>] {
    const imageTags: Array<{ content: string; index: number }> = [];
    const imgRegex = /(&lt;img\s+[^&]*(?:&gt;|&lt;\/img\s*&gt;))|(<img\s+[^>]*>)/gi;
    
    let index = 0;
    const contentWithoutImages = html.replace(imgRegex, (match) => {
      let imgTag = match;
      let isEncoded = imgTag.startsWith('&lt;');
      
      if (isEncoded) {
        imgTag = decodeHTML(imgTag);
      }
      
      const hasAltWithValue = /\salt\s*=\s*["'][^"']*["']/i.test(imgTag);
      
      if (!hasAltWithValue) {
        imgTag = imgTag.replace(/\salt\s*=\s*["']["']/i, '');
        imgTag = imgTag.replace(/>$/, ` alt="Image">`);
        console.log(`[GOOGLE-TRANSLATE] Added missing alt attribute to image ${index}`);
      }
      
      imageTags.push({ content: imgTag, index });
      index++;
      return `<!-- IMG_PLACEHOLDER_${index - 1} -->`;
    });
    
    console.log(`[GOOGLE-TRANSLATE] Extracted and verified ${imageTags.length} image tags`);
    return [contentWithoutImages, imageTags];
  }

  private restoreImages(html: string, images: Array<{ content: string; index: number }>): string {
    let result = html;
    
    for (let i = images.length - 1; i >= 0; i--) {
      const placeholder = `<!-- IMG_PLACEHOLDER_${i} -->`;
      const decodedImage = decodeHTML(images[i].content);
      result = result.replace(placeholder, decodedImage);
    }
    
    if (images.length > 0) {
      console.log(`[GOOGLE-TRANSLATE] Restored ${images.length} decoded image tags`);
    }
    return result;
  }

  private splitHtmlIntoChunks(html: string): string[] {
    if (html.length <= this.MAX_CHUNK_SIZE) {
      return [html];
    }

    console.log(`[GOOGLE-TRANSLATE] Content too large (${html.length} chars), splitting into chunks of ${this.MAX_CHUNK_SIZE}...`);
    const chunks: string[] = [];
    let i = 0;

    while (i < html.length) {
      let chunkEndPos = i + this.MAX_CHUNK_SIZE;
      
      if (chunkEndPos >= html.length) {
        chunks.push(html.substring(i));
        break;
      }

      const searchStart = Math.max(i, chunkEndPos - 1000);
      const searchArea = html.substring(searchStart, Math.min(chunkEndPos + 100, html.length));
      
      let breakPos = chunkEndPos;
      let foundBreakPoint = false;

      const tableCloseIdx = searchArea.lastIndexOf('</table>');
      if (tableCloseIdx !== -1) {
        breakPos = searchStart + tableCloseIdx + 8;
        foundBreakPoint = true;
        console.log(`[GOOGLE-TRANSLATE] Breaking after </table> at position ${breakPos}`);
      }

      if (!foundBreakPoint) {
        const divCloseIdx = searchArea.lastIndexOf('</div>');
        if (divCloseIdx !== -1) {
          breakPos = searchStart + divCloseIdx + 6;
          foundBreakPoint = true;
        }
      }

      if (!foundBreakPoint) {
        const pCloseIdx = searchArea.lastIndexOf('</p>');
        if (pCloseIdx !== -1) {
          breakPos = searchStart + pCloseIdx + 4;
          foundBreakPoint = true;
        }
      }

      if (breakPos <= i) {
        breakPos = Math.min(i + this.MAX_CHUNK_SIZE, html.length);
      }

      chunks.push(html.substring(i, breakPos));
      i = breakPos;
    }

    console.log(`[GOOGLE-TRANSLATE] Split into ${chunks.length} chunks, sizes: ${chunks.map(c => c.length).join(', ')}`);
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
    content = decodeHTML(content);
    
    if (!isChunk && !scripts) {
      const [contentWithoutScripts, extractedScripts] = this.extractScripts(content);
      scripts = extractedScripts;
      content = contentWithoutScripts;
      
      const [contentWithoutImages, extractedImages] = this.extractImages(content);
      images = extractedImages;
      content = contentWithoutImages;
    }

    if (!isChunk) {
      const chunks = this.splitHtmlIntoChunks(content);
      
      if (chunks.length > 1) {
        console.log(`[GOOGLE-TRANSLATE] Processing ${chunks.length} chunks...`);
        const translatedChunks: string[] = [];
        
        for (let i = 0; i < chunks.length; i++) {
          console.log(`[GOOGLE-TRANSLATE] Translating chunk ${i + 1}/${chunks.length}...`);
          try {
            if (i > 0) {
              await this.sleep(300);
            }
            
            const result = await this.translateContent(
              chunks[i],
              sourceLang,
              targetLang,
              systemInstruction,
              0,
              true,
              scripts,
              images
            );
            translatedChunks.push(result.translatedText);
          } catch (error) {
            console.error(`[GOOGLE-TRANSLATE] Failed to translate chunk ${i + 1}:`, error);
            throw error;
          }
        }
        
        const fullTranslation = translatedChunks.join('');
        const finalTranslation = scripts ? this.restoreScripts(fullTranslation, scripts) : fullTranslation;
        const restoredWithImages = images ? this.restoreImages(finalTranslation, images) : finalTranslation;
        
        console.log(`[GOOGLE-TRANSLATE] ✅ All chunks translated. Total length: ${restoredWithImages.length} chars`);
        
        return {
          translatedText: restoredWithImages,
          tokensUsed: 0,
        };
      }
    }

    console.log('[GOOGLE-TRANSLATE] Translating content length:', content.length, 'chars');
    
    await this.sleep(100);

    try {
      const langPair = `${this.langToCode(sourceLang)}|${this.langToCode(targetLang)}`;
      // Truncate long content to avoid API limits (MyMemory has max request size)
      const maxLength = 500; // Keep it small for API reliability
      const truncatedContent = content.length > maxLength ? content.substring(0, maxLength) : content;
      const encodedContent = encodeURIComponent(truncatedContent);
      const url = `https://api.mymemory.translated.net/get?q=${encodedContent}&langpair=${langPair}`;
      
      console.log(`[GOOGLE-TRANSLATE] Fetching: ${url.substring(0, 100)}...`);
      const response = await fetch(url);
      const responseText = await response.text();
      
      console.log(`[GOOGLE-TRANSLATE] Response status: ${response.status}, first 200 chars: ${responseText.substring(0, 200)}`);
      
      // Check if response is actually JSON
      if (!responseText.startsWith('{')) {
        console.error('[GOOGLE-TRANSLATE] Response is not JSON (likely HTML error page)');
        throw new Error(`API returned HTML instead of JSON: ${responseText.substring(0, 100)}`);
      }
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`Invalid JSON from API: ${responseText.substring(0, 150)}`);
      }

      if (data.responseStatus === 200 && data.responseData?.translatedText) {
        let translatedText = data.responseData.translatedText;
        
        // If we truncated, just return the truncated translation
        // For chunks, this is expected behavior
        
        if (scripts) {
          translatedText = this.restoreScripts(translatedText, scripts);
        }
        if (images) {
          translatedText = this.restoreImages(translatedText, images);
        }
        
        console.log(`[GOOGLE-TRANSLATE] Content translated successfully (${translatedText.length} chars)`);
        return {
          translatedText,
          tokensUsed: 0,
        };
      } else {
        throw new Error(`MyMemory API error: ${data.responseStatus} - ${JSON.stringify(data)}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[GOOGLE-TRANSLATE] Translation failed:', errorMessage);
      throw new Error(`Translation failed: ${errorMessage}`);
    }
  }

  async translateTitle(
    title: string,
    sourceLang: string,
    targetLang: string,
    retryCount: number = 0
  ): Promise<string> {
    await this.sleep(100);

    try {
      const langPair = `${this.langToCode(sourceLang)}|${this.langToCode(targetLang)}`;
      const encodedTitle = encodeURIComponent(title);
      const url = `https://api.mymemory.translated.net/get?q=${encodedTitle}&langpair=${langPair}`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.responseStatus === 200) {
        let translatedTitle = data.responseData.translatedText.trim();
        
        if (!translatedTitle || translatedTitle === title) {
          return title;
        }
        
        console.log(`[GOOGLE-TRANSLATE] Title translated successfully`);
        return translatedTitle;
      } else {
        return title;
      }
    } catch (error) {
      console.error('[GOOGLE-TRANSLATE] Title translation failed:', error);
      return title;
    }
  }

  private langToCode(lang: string): string {
    // Convert to ISO 639-1 language codes for MyMemory API
    const langMap: Record<string, string> = {
      'ru': 'ru',
      'en': 'en',
      'cs': 'cs',
      'kk': 'kk',
      'sk': 'sk',
      'mo': 'ro',
    };
    
    return langMap[lang] || lang;
  }
}
