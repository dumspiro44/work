import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const jobStatusEnum = pgEnum('job_status', ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']);

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
  wpConnected: integer("wp_connected").default(0).notNull(), // 1 = true, 0 = false
  sourceLanguage: text("source_language").notNull().default('en'),
  targetLanguages: jsonb("target_languages").notNull().$type<string[]>().default(sql`'[]'::jsonb`),
  geminiApiKey: text("gemini_api_key"),
  systemInstruction: text("system_instruction").default('You are a professional translator. Preserve all HTML tags, classes, IDs, and WordPress shortcodes exactly as they appear. Only translate the text content between tags.'),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const translationJobs = pgTable("translation_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: integer("post_id").notNull(),
  postType: text("post_type").notNull().default('post'), // 'post' or 'page'
  postTitle: text("post_title").notNull(),
  sourceLanguage: text("source_language").notNull(),
  targetLanguage: text("target_language").notNull(),
  status: jobStatusEnum("status").notNull().default('PENDING'),
  progress: integer("progress").notNull().default(0),
  tokensUsed: integer("tokens_used").default(0),
  errorMessage: text("error_message"),
  translatedTitle: text("translated_title"),
  translatedContent: text("translated_content"),
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

export const insertLogSchema = createInsertSchema(logs).omit({
  id: true,
  createdAt: true,
});

export type InsertAdmin = z.infer<typeof insertAdminSchema>;
export type Admin = typeof admins.$inferSelect;

export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settings.$inferSelect;

export type InsertTranslationJob = z.infer<typeof insertTranslationJobSchema>;
export type TranslationJob = typeof translationJobs.$inferSelect;

export type InsertLog = z.infer<typeof insertLogSchema>;
export type Log = typeof logs.$inferSelect;

export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
