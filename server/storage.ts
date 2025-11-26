import { admins, settings, translationJobs, translatedMenuItems, logs, type Admin, type Settings, type TranslationJob, type TranslatedMenuItem, type Log, type InsertAdmin, type InsertSettings, type InsertTranslationJob, type InsertTranslatedMenuItem, type InsertLog } from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  getAdmin(id: string): Promise<Admin | undefined>;
  getAdminByUsername(username: string): Promise<Admin | undefined>;
  createAdmin(admin: InsertAdmin): Promise<Admin>;
  
  getSettings(): Promise<Settings | undefined>;
  upsertSettings(settings: InsertSettings): Promise<Settings>;
  
  getTranslationJob(id: string): Promise<TranslationJob | undefined>;
  getAllTranslationJobs(): Promise<TranslationJob[]>;
  createTranslationJob(job: InsertTranslationJob): Promise<TranslationJob>;
  updateTranslationJob(id: string, data: Partial<TranslationJob>): Promise<TranslationJob | undefined>;
  deleteTranslationJob(id: string): Promise<boolean>;
  
  createTranslatedMenuItem(item: InsertTranslatedMenuItem): Promise<TranslatedMenuItem>;
  getTranslatedMenuItems(menuId: number, targetLanguage: string): Promise<TranslatedMenuItem[]>;
  deleteTranslatedMenuItems(menuId: number, targetLanguage: string): Promise<boolean>;
  
  createLog(log: InsertLog): Promise<Log>;
  getLogsByJobId(jobId: string): Promise<Log[]>;
  
  getInterfaceTranslations(): Promise<any[]>;
  saveInterfaceTranslations(translations: any[]): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  private interfaceTranslations: Map<string, any> = new Map();

  async getAdmin(id: string): Promise<Admin | undefined> {
    const [admin] = await db.select().from(admins).where(eq(admins.id, id));
    return admin || undefined;
  }

  async getAdminByUsername(username: string): Promise<Admin | undefined> {
    const [admin] = await db.select().from(admins).where(eq(admins.username, username));
    return admin || undefined;
  }

  async createAdmin(insertAdmin: InsertAdmin): Promise<Admin> {
    const [admin] = await db
      .insert(admins)
      .values(insertAdmin)
      .returning();
    return admin;
  }

  async getSettings(): Promise<Settings | undefined> {
    const [setting] = await db.select().from(settings).limit(1);
    return setting || undefined;
  }

  async upsertSettings(insertSettings: InsertSettings): Promise<Settings> {
    const existing = await this.getSettings();
    
    if (existing) {
      const updateData: any = { ...insertSettings };
      updateData.updatedAt = new Date();
      const [updated] = await db
        .update(settings)
        .set(updateData)
        .where(eq(settings.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(settings)
        .values(insertSettings as any)
        .returning();
      return created;
    }
  }

  async getTranslationJob(id: string): Promise<TranslationJob | undefined> {
    const [job] = await db.select().from(translationJobs).where(eq(translationJobs.id, id));
    return job || undefined;
  }

  async getAllTranslationJobs(): Promise<TranslationJob[]> {
    return db.select().from(translationJobs).orderBy(desc(translationJobs.createdAt));
  }

  async createTranslationJob(job: InsertTranslationJob): Promise<TranslationJob> {
    const [created] = await db
      .insert(translationJobs)
      .values(job)
      .returning();
    return created;
  }

  async updateTranslationJob(id: string, data: Partial<Omit<TranslationJob, 'id' | 'createdAt'>>): Promise<TranslationJob | undefined> {
    const updateData: any = { ...data };
    delete updateData.id;
    delete updateData.createdAt;
    updateData.updatedAt = new Date();
    
    const [updated] = await db
      .update(translationJobs)
      .set(updateData)
      .where(eq(translationJobs.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteTranslationJob(id: string): Promise<boolean> {
    const result = await db
      .delete(translationJobs)
      .where(eq(translationJobs.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async createTranslatedMenuItem(item: InsertTranslatedMenuItem): Promise<TranslatedMenuItem> {
    const [created] = await db
      .insert(translatedMenuItems)
      .values(item)
      .returning();
    return created;
  }

  async getTranslatedMenuItems(menuId: number, targetLanguage: string): Promise<TranslatedMenuItem[]> {
    return db.select().from(translatedMenuItems).where(
      and(eq(translatedMenuItems.menuId, menuId), eq(translatedMenuItems.targetLanguage, targetLanguage))
    ).orderBy(desc(translatedMenuItems.createdAt));
  }

  async deleteTranslatedMenuItems(menuId: number, targetLanguage: string): Promise<boolean> {
    const result = await db
      .delete(translatedMenuItems)
      .where(and(eq(translatedMenuItems.menuId, menuId), eq(translatedMenuItems.targetLanguage, targetLanguage)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async createLog(log: InsertLog): Promise<Log> {
    const [created] = await db
      .insert(logs)
      .values(log)
      .returning();
    return created;
  }

  async getLogsByJobId(jobId: string): Promise<Log[]> {
    return db.select().from(logs).where(eq(logs.jobId, jobId)).orderBy(desc(logs.createdAt));
  }

  async getInterfaceTranslations(): Promise<any[]> {
    return Array.from(this.interfaceTranslations.values());
  }

  async saveInterfaceTranslations(translations: any[]): Promise<void> {
    this.interfaceTranslations.clear();
    for (const t of translations) {
      const key = `${t.stringId}_${t.language}`;
      this.interfaceTranslations.set(key, t);
    }
  }
}

export const storage = new DatabaseStorage();
