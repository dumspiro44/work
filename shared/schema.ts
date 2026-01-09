import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const jobStatusEnum = pgEnum('job_status', ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'PUBLISHED']);

export const admins = pgTable("admins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  wpUrl: text("wp_url").notNull(),
  wpUsername: text("wp_username").notNull(),
  wpPassword: text("wp_password").notNull(),
  wpAuthMethod: text("wp_auth_method").default('basic_auth').notNull(), // 'basic_auth' or 'application_password'
  wpConnected: integer("wp_connected").default(0).notNull(), // 1 = true, 0 = false
  sourceLanguage: text("source_language").notNull().default('en'),
  targetLanguages: jsonb("target_languages").notNull().$type<string[]>().default(sql`'[]'::jsonb`),
  geminiApiKey: text("gemini_api_key"),
  deeplApiKey: text("deepl_api_key"),
  translationProvider: text("translation_provider").default('gemini').notNull(), // 'gemini' or 'deepl'
  systemInstruction: text("system_instruction").default('You are a professional translator. Preserve all HTML tags, classes, IDs, and WordPress shortcodes exactly as they appear. Only translate the text content between tags.'),
  lastContentCount: integer("last_content_count").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const translationJobs = pgTable("translation_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: integer("post_id").notNull(),
  postTitle: text("post_title").notNull(),
  sourceLanguage: text("source_language").notNull(),
  targetLanguage: text("target_language").notNull(),
  status: jobStatusEnum("status").notNull().default('PENDING'),
  progress: integer("progress").notNull().default(0),
  tokensUsed: integer("tokens_used").default(0),
  errorMessage: text("error_message"),
  translatedTitle: text("translated_title"),
  translatedContent: text("translated_content"),
  blockMetadata: jsonb("block_metadata").$type<BlockMetadata>().default(sql`'{}'::jsonb`),
  contentType: text("content_type").default('standard'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export interface BlockMetadata {
  type: 'bebuilder' | 'gutenberg' | 'elementor' | 'wpbakery' | 'standard';
  blocks: {
    index: number;
    field: string;
    path?: string;
    originalText: string;
    builderId?: string;
  }[];
  rawMetadata?: Record<string, any>;
}

export const translatedMenuItems = pgTable("translated_menu_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  menuId: integer("menu_id").notNull(),
  itemId: integer("item_id").notNull(),
  targetLanguage: text("target_language").notNull(),
  originalTitle: text("original_title").notNull(),
  translatedTitle: text("translated_title").notNull(),
  originalUrl: text("original_url"),
  status: text("status").default('translated').notNull(), // 'translated' or 'published'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const logs = pgTable("logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").references(() => translationJobs.id, { onDelete: 'cascade' }),
  level: text("level").notNull(),
  message: text("message").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const archiveRequests = pgTable("archive_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: integer("post_id").notNull(),
  postTitle: text("post_title").notNull(),
  postType: text("post_type").notNull().default('post'),
  postDate: timestamp("post_date"),
  reason: text("reason"),
  year: integer("year"),
  month: integer("month"),
  status: text("status").notNull().default('pending'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  approvedAt: timestamp("approved_at"),
});

export const insertAdminSchema = createInsertSchema(admins).omit({
  id: true,
  createdAt: true,
});

export const insertSettingsSchema = createInsertSchema(settings).omit({
  id: true,
  updatedAt: true,
}).extend({
  wpConnected: z.number().optional(),
});

export const insertTranslationJobSchema = createInsertSchema(translationJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTranslatedMenuItemSchema = createInsertSchema(translatedMenuItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLogSchema = createInsertSchema(logs).omit({
  id: true,
  createdAt: true,
});

export const insertArchiveRequestSchema = createInsertSchema(archiveRequests).omit({
  id: true,
  createdAt: true,
  approvedAt: true,
});

export type InsertAdmin = z.infer<typeof insertAdminSchema>;
export type Admin = typeof admins.$inferSelect;

export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settings.$inferSelect;

export type InsertTranslationJob = z.infer<typeof insertTranslationJobSchema>;
export type TranslationJob = typeof translationJobs.$inferSelect;

export type InsertTranslatedMenuItem = z.infer<typeof insertTranslatedMenuItemSchema>;
export type TranslatedMenuItem = typeof translatedMenuItems.$inferSelect;

export type InsertLog = z.infer<typeof insertLogSchema>;
export type Log = typeof logs.$inferSelect;

export type InsertArchiveRequest = z.infer<typeof insertArchiveRequestSchema>;
export type ArchiveRequest = typeof archiveRequests.$inferSelect;

export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
