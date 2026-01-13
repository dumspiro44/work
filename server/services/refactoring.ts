import { GoogleGenerativeAI } from "@google/generative-ai";
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
    const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('Gemini API key is not configured');
    }
    // Используем официальный SDK Google Generative AI
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  /**
   * Deterministic rule-based content classification.
   * Logic is local to reduce dependency on fragile AI APIs for core decisions.
   */
  async classifyOnly(content: string): Promise<{ type: ContentType; explanation: string; proposedActions: string[] }> {
    const lowerContent = content.toLowerCase();
    
    // 1. Realty Detection (Deterministic)
    const hasRealtyMarkers = lowerContent.includes('/realty/') || 
                             lowerContent.includes('realty-item') || 
                             lowerContent.includes('realty-card') ||
                             lowerContent.includes('prodej') || 
                             lowerContent.includes('pronájem');
                             
    if (hasRealtyMarkers) {
      return {
        type: 'TYPE_3_REALTY',
        explanation: "Обнаружены признаки каталога недвижимости (локации, типы сделок, ссылки /realty/).",
        proposedActions: [
          "Извлечь данные об объектах недвижимости",
          "Создать отдельные карточки объектов",
          "Сформировать сводную таблицу характеристик"
        ]
      };
    }

    // 2. Catalog Detection (Deterministic)
    const liCount = (content.match(/<li>/g) || []).length;
    const h34Count = (content.match(/<h[34][^>]*>/g) || []).length;
    const hasCatalogMarkers = lowerContent.includes('itemprop="itemlistelement"') || 
                             lowerContent.includes('class="product') || 
                             liCount > 5 || h34Count > 3;
                             
    if (hasCatalogMarkers) {
      return {
        type: 'TYPE_2_CATALOG',
        explanation: `Обнаружена структура каталога (${liCount} элементов списка, ${h34Count} подзаголовков).`,
        proposedActions: [
          "Разделить контент на структурированные посты",
          "Очистить описание категории от лишнего HTML",
          "Добавить SEO-оптимизированные списки преимуществ"
        ]
      };
    }

    // 3. Default: Offer/Article
    return {
      type: 'TYPE_1_OFFER',
      explanation: "Контент определен как информационная статья или предложение услуг.",
      proposedActions: [
        "Оптимизировать иерархию заголовков (H1-H3)",
        "Добавить блок FAQ для улучшения SEO",
        "Сформировать маркированный список ключевых особенностей"
      ]
    };
  }

  /**
   * AI-powered content generation/refactoring.
   * AI is used as a content synthesis plugin, guided by deterministic classification.
   */
  async classifyAndRefactor(content: string, context: string): Promise<RefactoringResult> {
    console.log(`[REFACTORING] Starting processing based on deterministic classification...`);
    
    const classification = await this.classifyOnly(content);
    const { type, explanation, proposedActions } = classification;
    
    // Используем максимально надежные идентификаторы моделей
    const modelNames = ["models/gemini-1.5-flash", "models/gemini-1.5-pro", "models/gemini-pro"];
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
          You are a professional WordPress SEO and content synthesis engine.
          
          DETERMINISTIC CLASSIFICATION: ${type}
          CONTEXT: ${context}

          YOUR GOAL:
          Refactor the provided "raw" or "broken" HTML content into a high-quality WordPress post.
          
          SPECIFIC INSTRUCTIONS FOR ${type}:
          ${type === 'TYPE_3_REALTY' ? `
            - Identify property objects and extract them into 'newPosts' array.
            - Ensure each object has a clear title, description, and price if found.
            - Preserve all original links to property pages.
          ` : type === 'TYPE_2_CATALOG' ? `
            - Extract repeating services or items into 'newPosts'.
            - Clean up the main description to be a concise introduction.
          ` : `
            - Enhance the article structure with clear H2/H3 headers.
            - MANDATORY: Add an FAQ section with at least 3 relevant Q&A in Russian at the end.
            - MANDATORY: Add a comparison or summary table (<table>) if applicable.
          `}

          STRICT RULES:
          1. PRESERVE ALL INTERNAL LINKS. Do not modify href attributes.
          2. ENRICH CONTENT. If the text is thin, expand it with relevant SEO-friendly information.
          3. NO EMPTY POSTS. Every generated post must have substantial content.
          4. FORMAT: Return ONLY a valid JSON object in Russian.

          JSON SCHEMA:
          {
            "type": "${type}",
            "explanation": "${explanation}",
            "proposedActions": ${JSON.stringify(proposedActions)},
            "refactoredContent": "Main cleaned content here",
            "newPosts": [
              { "title": "...", "content": "Detailed HTML content", "slug": "...", "featuredImage": "..." }
            ]
          }
        `;

        const combinedPrompt = `${systemPrompt}\n\nRAW CONTENT TO PROCESS:\n${content}`;

        // Используем официальный SDK для обращения к модели
        // Явно указываем версию API v1 для стабильности
        const model = this.genAI.getGenerativeModel({ model: modelName }, { apiVersion: 'v1' });
        const apiResult = await model.generateContent(combinedPrompt);
        const response = await apiResult.response;
        const text = response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('AI returned invalid non-JSON response');
        
        const parsedResult = JSON.parse(jsonMatch[0]);
        console.log(`[REFACTORING] Successfully synthesized content using ${modelName}`);
        return parsedResult;

      } catch (e: any) {
        lastError = e;
        const errorMessage = e.message || String(e);
        console.warn(`[REFACTORING] Synthesis via ${modelName} (attempt ${attempt}) failed: ${errorMessage}`);
        if (errorMessage.includes('429') || errorMessage.includes('quota')) continue;
        break; // Try next model
      }
    }
    }
    throw lastError;
  }
}
