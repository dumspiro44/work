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
    
    // Используем актуальные модели Gemini 2.x (1.5 больше не поддерживается для этого API-ключа)
    const modelNames = ["gemini-2.0-flash", "gemini-2.5-flash"];
    let lastError: any;

    const maxRetries = 3;
    const baseDelay = 30000; // 30 секунд базовая задержка для rate limiting

    for (const modelName of modelNames) {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          // Всегда ждем перед запросом (для rate limiting)
          const waitTime = attempt === 0 ? 2000 : baseDelay * attempt;
          console.log(`[REFACTORING] Waiting ${waitTime}ms before ${modelName} attempt ${attempt}...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));

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
            - Add a summary table with key property characteristics.
          ` : type === 'TYPE_2_CATALOG' ? `
            - Extract repeating services or items into 'newPosts'.
            - Clean up the main description to be a concise introduction.
            - Add a bullet list (<ul><li>) summarizing key services/features.
            - Add an FAQ section at the end with 3+ Q&A pairs.
          ` : `
            - Enhance the article structure with clear H2/H3 headers.
            - *** CRITICAL: YOU MUST ADD ALL THREE SEO ELEMENTS BELOW ***
          `}

          *** MANDATORY SEO ELEMENTS (ADD ALL THREE) ***
          
          1. BULLET LIST - Add a <ul> list with key points/features:
          <ul>
            <li>Ключевой пункт 1</li>
            <li>Ключевой пункт 2</li>
            <li>Ключевой пункт 3</li>
          </ul>

          2. TABLE - Add a comparison or summary table:
          <table border="1" style="border-collapse: collapse; width: 100%;">
            <thead><tr><th>Параметр</th><th>Значение</th></tr></thead>
            <tbody>
              <tr><td>Характеристика 1</td><td>Данные</td></tr>
              <tr><td>Характеристика 2</td><td>Данные</td></tr>
            </tbody>
          </table>

          3. FAQ SECTION - Add at least 3 Q&A pairs at the end:
          <h2>Часто задаваемые вопросы</h2>
          <h3>Вопрос 1?</h3>
          <p>Ответ на вопрос 1.</p>
          <h3>Вопрос 2?</h3>
          <p>Ответ на вопрос 2.</p>
          <h3>Вопрос 3?</h3>
          <p>Ответ на вопрос 3.</p>

          *** FAILURE TO INCLUDE THESE ELEMENTS IS NOT ACCEPTABLE ***

          STRICT RULES:
          1. PRESERVE ALL INTERNAL LINKS. Do not modify href attributes.
          2. NO EMPTY POSTS. Every generated post must have substantial content.
          3. FORMAT: Return ONLY a valid JSON object in Russian.

          *** CONTENT ENRICHMENT (CRITICAL) ***
          If the original content is thin or lacks detail, YOU MUST logically expand it:
          
          - ANALYZE the topic/context from the title and available text
          - ADD relevant factual information about the subject (institutions, services, locations)
          - INCLUDE practical details: addresses, contact methods, working hours if relevant
          - DESCRIBE benefits, advantages, and unique features
          - ADD historical context or background information when appropriate
          - EXPLAIN processes, procedures, or requirements if the topic involves them
          - MINIMUM content length: 800-1500 words per post
          
          Example: If content mentions "Университет в Праге" but has only 100 words:
          - Expand with: history of the institution, programs offered, admission requirements,
            location details, student life, career opportunities, accreditation info, etc.
          
          DO NOT leave thin content as-is. Your job is to CREATE valuable, informative articles.

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

        // Прямой вызов API через fetch для обхода багов SDK
        const apiKey = (this.genAI as any).apiKey;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        
        const apiResponse = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: combinedPrompt }] }],
            generationConfig: { temperature: 0.2, topP: 0.8, topK: 40 }
          })
        });

        if (!apiResponse.ok) {
          const errorData = await apiResponse.json().catch(() => ({}));
          throw new Error(`Google API Error: ${apiResponse.status} ${JSON.stringify(errorData)}`);
        }

        const apiData = await apiResponse.json() as any;
        const text = apiData.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!text) throw new Error('AI returned empty response');
        
        // Extract JSON from markdown code blocks or raw text
        let jsonStr = text;
        
        // Try to extract from markdown code block first
        const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
          jsonStr = codeBlockMatch[1].trim();
        } else {
          // Extract JSON object from raw text
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error('AI returned invalid non-JSON response');
          jsonStr = jsonMatch[0];
        }
        
        // Log raw response for debugging (first 500 chars)
        console.log(`[REFACTORING] Raw JSON (first 500 chars): ${jsonStr.substring(0, 500)}...`);
        
        // Clean up the JSON string robustly
        // 1. Remove control characters (except \n, \r, \t)
        jsonStr = jsonStr.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
        
        // 2. Fix common AI mistakes: unescaped quotes inside strings
        // This is tricky, so we'll try multiple parsing strategies
        
        let parsedResult;
        try {
          parsedResult = JSON.parse(jsonStr);
        } catch (parseError1) {
          // Strategy 2: Remove all newlines and try again
          try {
            const compactJson = jsonStr.replace(/\n/g, ' ').replace(/\r/g, ' ').replace(/\s+/g, ' ');
            parsedResult = JSON.parse(compactJson);
          } catch (parseError2) {
            // Strategy 3: Try to fix common escaping issues
            try {
              // Escape newlines inside strings more carefully
              const fixedJson = jsonStr.replace(/"([^"\\]|\\.)*"/g, (match: string) => {
                return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
              });
              parsedResult = JSON.parse(fixedJson);
            } catch (parseError3) {
              console.error(`[REFACTORING] All JSON parsing strategies failed. Raw: ${jsonStr.substring(0, 1000)}`);
              throw parseError1; // Throw original error
            }
          }
        }
        
        console.log(`[REFACTORING] Successfully synthesized content using ${modelName}`);
        return parsedResult;

      } catch (e: any) {
        lastError = e;
        const errorMessage = e.message || String(e);
        console.warn(`[REFACTORING] Synthesis via ${modelName} (attempt ${attempt}) failed: ${errorMessage}`);
        
        if (errorMessage.includes('429') || errorMessage.includes('quota')) {
          // Parse retry delay from Gemini error response
          const retryMatch = errorMessage.match(/retry in (\d+(?:\.\d+)?)/i);
          const suggestedDelay = retryMatch ? Math.ceil(parseFloat(retryMatch[1]) * 1000) : 60000;
          const waitTime = Math.max(suggestedDelay + 5000, 30000); // At least 30s, plus 5s buffer
          
          console.log(`[REFACTORING] Rate limited. Waiting ${Math.round(waitTime/1000)}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        break; // Try next model for non-rate-limit errors
      }
    }
    }
    throw lastError;
  }
}
