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

  async classifyAndRefactor(content: string, context: string): Promise<RefactoringResult> {
    const modelNames = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash", "gemini-1.5-pro"];
    let lastError: any;

    for (const modelName of modelNames) {
      try {
        const model = this.genAI.getGenerativeModel({ model: modelName });
        const systemPrompt = `
          You are an automated WordPress content refactoring engine.
          Your task is to analyze raw HTML content and decide the correct content architecture.

          🔹 STEP 1 — Content Classification
          Classify the content into ONE of the following types:
          - TYPE A (Catalog Content): Repeating blocks, independent h3/h4 headings, services/listings.
          - TYPE B (Single Informational Content): One topic, one narrative, cannot be split.

          🔹 STEP 2 — Decision Logic
          IF TYPE A:
            - Split into separate posts.
            - Move images to first paragraph and set as featured image.
            - CRITICAL: Identify and return the target URL (link) for each item if it points to a full article/object page.
            - Map to type: "TYPE_2_CATALOG".
          IF TYPE B:
            - CREATE exactly ONE post from full content.
            - Improve SEO structure (H1-H2).
            - MANDATORY: Add a summary table at the beginning or middle if the content contains technical specs or comparable data.
            - MANDATORY: Add a "FAQ" (Часто задаваемые вопросы) section at the end of the post, based on the most important points of the content.
            - Map to type: "TYPE_1_OFFER".

          🔹 Cleanup Rules: Remove empty <p>, <br><br>, navigation-only blocks.

          MANDATORY OUTPUT JSON (Russian text for explanation and proposedActions):
          {
            "type": "TYPE_1_OFFER" | "TYPE_2_CATALOG",
            "explanation": "Почему этот тип? (на русском)",
            "proposedActions": ["Шаг 1 (на русском)", "Шаг 2 (на русском)"],
            "refactoredContent": "Replacement text for category description (cleaned/short intro)",
            "newPosts": [
              { "title": "...", "content": "...", "slug": "...", "link": "target URL if exists", "featuredImage": "...", "categories": [] }
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
        console.warn(`Model ${modelName} failed, trying next...`);
      }
    }
    throw lastError;
  }
}
