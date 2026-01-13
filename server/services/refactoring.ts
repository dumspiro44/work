import { GoogleGenerativeAI } from '@google/generative-ai';
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
  private genAI: GoogleGenerativeAI;

  constructor(settings: Settings) {
    if (!settings.geminiApiKey) {
      throw new Error('Gemini API key is not configured');
    }
    this.genAI = new GoogleGenerativeAI(settings.geminiApiKey);
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
    // Используем тот же метод для консистентности
    const classification = await this.classifyOnly(content);
    const detectedType = classification.type;
    
    // Используем только gemini-1.5-flash как наиболее стабильную и быструю модель
    const modelNames = ["gemini-1.5-flash", "gemini-1.5-pro"];
    let lastError: any;

    // 2. ИИ ИСПОЛЬЗУЕТСЯ ТОЛЬКО ДЛЯ ГЕНЕРАЦИИ (Clean & Enhance)
    const maxRetries = 2;
    const baseDelay = 15000; 

    for (const modelName of modelNames) {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          // Задержка 3с перед каждым запросом для соблюдения лимитов
          await new Promise(resolve => setTimeout(resolve, 3000));

          const model = this.genAI.getGenerativeModel({ model: modelName });
          const systemPrompt = `
          You are a WordPress content cleaning and enhancement engine.
          The content has already been classified as: ${detectedType}.

          YOUR TASK:
          ${detectedType === 'TYPE_3_REALTY' ? `
            - Identify all property items with links matching /realty/.../ID/
            - Extract property names, short descriptions, and the direct URL.
            - MANDATORY: Format as newPosts with "link" field containing the /realty/ URL.
          ` : detectedType === 'TYPE_2_CATALOG' ? `
            - Extract repeating items into a structured list.
            - Identify target URLs for each item.
            - Move relevant images to featuredImage field.
          ` : `
            - Clean HTML from junk.
            - Improve SEO structure (H1-H2).
            - MANDATORY: Add a summary table for technical specs.
            - MANDATORY: Add an "FAQ" section at the end in Russian.
          `}

          MANDATORY OUTPUT JSON (Russian text for explanation and proposedActions):
          {
            "type": "${detectedType}",
            "explanation": "Определено на основе структуры контента (правила).",
            "proposedActions": ["Очистка HTML", "SEO оптимизация", "Извлечение ссылок"],
            "refactoredContent": "ОСТАВЬТЕ ТОЛЬКО вводный текст или заголовок. УДАЛИТЕ весь список объектов/товаров, так как они перенесены в новые записи.",
            "newPosts": [
              { "title": "...", "content": "...", "slug": "...", "link": "URL", "featuredImage": "...", "categories": [] }
            ]
          }
        `;

        const userPrompt = `
          Context: ${context}
          Content to process:
          ${content}
        `;

        const result = await model.generateContent([
          { text: systemPrompt },
          { text: userPrompt }
        ]);
        const response = await result.response;
        const text = response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Invalid JSON');
        return JSON.parse(jsonMatch[0]);
      } catch (e: any) {
        lastError = e;
        const errorMessage = e.message || String(e);

        if (errorMessage.includes('429') || errorMessage.includes('quota')) {
          if (attempt < maxRetries) {
            const delay = baseDelay * (attempt + 1);
            console.warn(`[REFACTORING] Quota exceeded (429), retrying model ${modelName} in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue; // Retry same model
          }
        }

        console.warn(`[REFACTORING] Model ${modelName} failed, trying next... Error: ${errorMessage}`);
        break; // Move to next model
      }
    }
    }
    throw lastError;
  }
}
