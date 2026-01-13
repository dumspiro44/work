import { GoogleGenAI } from "@google/genai";
import type { Settings } from '@shared/schema';

export type ContentType = 'TYPE_1_OFFER' | 'TYPE_2_CATALOG' | 'TYPE_3_REALTY' | 'TYPE_4_NAVIGATION';

export interface RefactoringResult {
  type: ContentType;
  explanation: string;
  proposedActions: string[];
  refactoredContent?: string;
  newPosts?: Array<{
    title: string;
    content: string;
    slug?: string;
    featuredImage?: string;
    categories?: number[];
  }>;
}

export class RefactoringService {
  private ai: GoogleGenAI;

  constructor(settings: Settings) {
    const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('Gemini API key is not configured');
    }
    // Используем v1beta для максимальной совместимости с текущими ключами в Replit
    this.ai = new GoogleGenAI({ apiKey });
  }

  async classifyOnly(content: string): Promise<{ type: ContentType; explanation: string; proposedActions: string[] }> {
    // ПРАВИЛА КЛАССИФИКАЦИИ (Rule-based)
    const hasRealtyMarkers = content.includes('/realty/') || content.includes('realty-item') || content.includes('realty-card');
    const hasCatalogMarkers = content.includes('itemprop="itemListElement"') || 
                             content.includes('class="product') || 
                             (content.match(/<h[34][^>]*>/g) || []).length > 3;
    
    let type: ContentType = 'TYPE_1_OFFER';
    if (hasRealtyMarkers) {
      type = 'TYPE_3_REALTY';
    } else if (hasCatalogMarkers) {
      type = 'TYPE_2_CATALOG';
    }
    
    return {
      type,
      explanation: type === 'TYPE_3_REALTY'
        ? "Обнаружен каталог недвижимости с ссылками на объекты (/realty/). Рекомендуется извлечение данных из внешних страниц."
        : type === 'TYPE_2_CATALOG' 
        ? "Обнаружены повторяющиеся структуры (H3/H4 или классы товаров). Рекомендуется разделение на отдельные посты."
        : "Контент выглядит как единое предложение. Рекомендуется SEO-оптимизация и добавление FAQ.",
      proposedActions: type === 'TYPE_3_REALTY'
        ? ["Извлечение данных из /realty/ ссылок", "Создание карточек объектов", "Обогащение контента из внешних URL"]
        : type === 'TYPE_2_CATALOG'
        ? ["Разделение на посты", "Извлечение ссылок", "Очистка описания категории"]
        : ["Улучшение структуры H1-H2", "Создание сводной таблицы", "Генерация блока FAQ"]
    };
  }

  async classifyAndRefactor(content: string, context: string): Promise<RefactoringResult> {
    const classification = await this.classifyOnly(content);
    const detectedType = classification.type;
    
    // Используем проверенные модели. 
    // gemini-1.5-flash - самая быстрая и стабильная для рефакторинга
    const modelNames = ["gemini-1.5-flash", "gemini-pro"];
    let lastError: any;

    const maxRetries = 2;
    const baseDelay = 5000; 

    for (const modelName of modelNames) {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            await new Promise(resolve => setTimeout(resolve, baseDelay * attempt));
          }

          const systemPrompt = `
          You are a WordPress content cleaning and enhancement engine.
          The content has already been classified as: ${detectedType}.

          YOUR TASK:
          ${detectedType === 'TYPE_3_REALTY' ? `
            - Identify all property items with links matching /realty/.../ID/
            - Extract property names, short descriptions, and the direct URL.
            - MANDATORY: Format as newPosts with "link" field containing the /realty/ URL.
            - MANDATORY: In refactoredContent, provide a professional summary with a table of property types found.
          ` : detectedType === 'TYPE_2_CATALOG' ? `
            - Extract repeating items into a structured list.
            - Identify target URLs for each item.
            - Move relevant images to featuredImage field.
            - MANDATORY: In refactoredContent, provide a clean introduction using lists for general categories.
          ` : `
            - Clean HTML from junk.
            - MANDATORY: Tidy up headers (H1-H4) to ensure logical hierarchy and SEO optimization.
            - MANDATORY: Use <ul>/<li> lists for features or characteristics.
            - MANDATORY: Add a summary table (<table>) for technical specifications or key benefits.
            - MANDATORY: Add an "FAQ" section (<section><h3>FAQ</h3>...) at the end in Russian with at least 3 relevant questions and answers.
            - ENHANCEMENT: You may expand the content based on context to provide more value for SEO.
          `}

          STRICT RULES:
          - DO NOT modify or remove ANY internal WordPress links (e.g., [[~id]], relative links like /slug/, or absolute internal URLs).
          - DO NOT modify or remove ANY links within the content body (e.g., <a href="...">). Preserve all href attributes exactly as they are.
          - Preserve all formatting and shortcodes.

          MANDATORY OUTPUT JSON (Russian text for explanation, proposedActions, and all generated content):
          {
            "type": "${detectedType}",
            "explanation": "Определено на основе структуры контента (правила).",
            "proposedActions": ["Очистка HTML", "SEO оптимизация", "Извлечение ссылок"],
            "refactoredContent": "ОСТАВЬТЕ ТОЛЬКО вводный текст или заголовок. УДАЛИТЕ весь список объектов/товаров, так как они перенесены в новые записи. ДОПОЛНИТЕ текст полезной информацией по теме для SEO.",
            "newPosts": [
              { 
                "title": "Обязательно заполните заголовок", 
                "content": "Обязательно заполните подробное описание с таблицами и FAQ", 
                "slug": "slug-item-1", 
                "link": "URL если есть", 
                "featuredImage": "URL картинки", 
                "categories": [] 
              }
            ]
          }
        `;

        const userPrompt = `
          Context: ${context}
          Content to process:
          ${content}
        `;

        const combinedPrompt = `${systemPrompt}\n\nUser Context and Content:\n${userPrompt}`;

        const response = await this.ai.models.generateContent({
          model: modelName,
          contents: [{ role: "user", parts: [{ text: combinedPrompt }] }],
        });

        const text = response.text || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Invalid JSON');
        return JSON.parse(jsonMatch[0]);
      } catch (e: any) {
        lastError = e;
        const errorMessage = e.message || String(e);
        console.warn(`[REFACTORING] Model ${modelName} attempt ${attempt} failed: ${errorMessage}`);
        if (errorMessage.includes('429') || errorMessage.includes('quota')) continue;
        break;
      }
    }
    }
    throw lastError;
  }
}
