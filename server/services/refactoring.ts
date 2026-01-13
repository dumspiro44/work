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

  private async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async classifyAndRefactor(content: string, context: string, retryCount: number = 0): Promise<RefactoringResult> {
    const modelNames = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"];
    let lastError: any;

    for (const modelName of modelNames) {
      try {
        // Add 2s delay between requests for rate limiting
        await this.sleep(2000);

        // Force v1 API version as requested by user
        const model = this.genAI.getGenerativeModel({ model: modelName }, { apiVersion: 'v1' });
        const systemPrompt = `
          You are an expert in WordPress content restructuring and SEO.
          Your goal is to classify and refactor WordPress content based on these 4 types:

          🔹 TYPE 1 — Offer / Single Commercial Offer
          - Signs: One topic, commercial text, no independent semantic blocks.
          - Action: Do NOT split into posts. Improve SEO structure (H1-H2, lists, FAQ). Preserve as one page.

          🔹 TYPE 2 — Announcements / Article Catalog
          - Signs: Repeating blocks like <h3><a href="URL">Title</a></h3> followed by brief description.
          - Action: Each <h3><a> = separate post. Permalink = URL from <a href>. Preserve all links. Delete layout tables. Delete original pseudo-page after posts are created.

          🔹 TYPE 3 — Realty Catalog / Listing
          - Signs: Dozens of h3 + table blocks leading to /realty/.../ID/. Navigation at bottom.
          - Action: DO NOT split into posts. Keep as CATALOG. Add SEO-H1, intro, FAQ. Do not touch object cards.

          🔹 TYPE 4 — Navigation SEO-block
          - Signs: Links like "Apartments - Houses - Plots" or parameters like ?s=K&p=1.
          - Action: Do NOT consider as content. Do NOT split or rewrite. Preserve 1:1.

          CRITICAL RULES:
          1. ZERO content loss.
          2. ALL links (<a href>) must be preserved 1:1 (href, anchor, title, target, rel, params).
          3. Only clean "trash" like <p><br /></p> or <p>&nbsp;</p>.
          4. If splitting (TYPE_2_CATALOG), identify images (<img>) and include them in the new post (first paragraph and featured image).

          Response must be in JSON format. IMPORTANT: All text fields (explanation, proposedActions) MUST be in Russian language.
          {
            "type": "TYPE_1_OFFER" | "TYPE_2_CATALOG" | "TYPE_3_REALTY" | "TYPE_4_NAVIGATION",
            "explanation": "Почему этот тип? (на русском)",
            "proposedActions": ["Шаг 1 (на русском)", "Шаг 2 (на русском)"],
            "refactoredContent": "Cleaned/Restructured HTML for Type 1, 3, 4",
            "newPosts": [
              { "title": "...", "content": "...", "slug": "...", "featuredImage": "...", "categories": [] }
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
        console.warn(`Model ${modelName} failed, trying next...`, errorMessage);

        // Retry on 429
        if ((errorMessage.includes('429') || errorMessage.includes('quota')) && retryCount < 3) {
          const backoffDelay = Math.pow(2, retryCount) * 5000;
          console.log(`[REFACTOR] Rate limit hit, retrying in ${backoffDelay}ms...`);
          await this.sleep(backoffDelay);
          return this.classifyAndRefactor(content, context, retryCount + 1);
        }
      }
    }
    throw lastError;
  }
}
