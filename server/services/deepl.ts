export class DeepLTranslationService {
  private apiKey: string;
  private apiUrl: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    // Use Pro API if key doesn't end in :fx, otherwise use Free API
    this.apiUrl = apiKey.endsWith(':fx') 
      ? 'https://api-free.deepl.com/v2/translate' 
      : 'https://api.deepl.com/v2/translate';
  }

  async translateContent(
    content: string,
    sourceLang: string,
    targetLang: string
  ): Promise<{ translatedText: string; tokensUsed: number }> {
    try {
      // DeepL uses ISO codes, may need some mapping if WP codes differ
      // For now assume they match or are close enough
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `DeepL-Auth-Key ${this.apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          text: content,
          source_lang: sourceLang.toUpperCase(),
          target_lang: targetLang.toUpperCase(),
          tag_handling: 'html',
          preserve_formatting: '1',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`DeepL API error: ${error}`);
      }

      const data = await response.json();
      return {
        translatedText: data.translations[0].text,
        tokensUsed: content.length, // DeepL doesn't return tokens, use chars
      };
    } catch (error) {
      console.error('[DEEPL] Translation failed:', error);
      throw error;
    }
  }

  async translateTitle(
    title: string,
    sourceLang: string,
    targetLang: string
  ): Promise<string> {
    const { translatedText } = await this.translateContent(title, sourceLang, targetLang);
    return translatedText;
  }
}
