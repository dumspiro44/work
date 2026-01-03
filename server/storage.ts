import { admins, settings, translationJobs, translatedMenuItems, logs, archiveRequests, type Admin, type Settings, type TranslationJob, type TranslatedMenuItem, type Log, type ArchiveRequest, type InsertAdmin, type InsertSettings, type InsertTranslationJob, type InsertTranslatedMenuItem, type InsertLog, type InsertArchiveRequest } from "@shared/schema";
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
  
  createArchiveRequest(req: InsertArchiveRequest): Promise<ArchiveRequest>;
  getArchiveRequests(status?: string): Promise<ArchiveRequest[]>;
  updateArchiveRequestStatus(id: string, status: string): Promise<ArchiveRequest | undefined>;
  
  getInterfaceTranslations(): Promise<any[]>;
  saveInterfaceTranslations(translations: any[]): Promise<void>;

  getCategoryIssues(): Promise<any[]>;
  saveCategoryIssues(issues: any[]): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  private interfaceTranslations: Map<string, any> = new Map();
  private categoryIssues: any[] = [];

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
    try {
      const allSettings = await db.select().from(settings).orderBy(desc(settings.updatedAt));
      return allSettings[0] || undefined;
    } catch (err) {
      console.error('Error fetching settings:', err);
      return undefined;
    }
  }

  async upsertSettings(insertSettings: InsertSettings): Promise<Settings> {
    try {
      const existing = await this.getSettings();
      
      if (existing) {
        const updateData: any = { ...insertSettings };
        updateData.updatedAt = new Date();
        const [updated] = await db
          .update(settings)
          .set(updateData)
          .where(eq(settings.id, existing.id))
          .returning();
        console.log('[DB] Settings updated successfully:', { wpUrl: updated.wpUrl, wpConnected: updated.wpConnected });
        return updated;
      } else {
        const [created] = await db
          .insert(settings)
          .values(insertSettings as any)
          .returning();
        console.log('[DB] Settings created successfully:', { wpUrl: created.wpUrl, wpConnected: created.wpConnected });
        return created;
      }
    } catch (err) {
      console.error('[DB] Error upserting settings:', err);
      throw err;
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
      .values(job as any)
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

  async getCategoryIssues(): Promise<any[]> {
    return this.categoryIssues;
  }

  async saveCategoryIssues(issues: any[]): Promise<void> {
    this.categoryIssues = issues;
  }

  async createArchiveRequest(req: InsertArchiveRequest): Promise<ArchiveRequest> {
    const [created] = await db
      .insert(archiveRequests)
      .values(req)
      .returning();
    return created;
  }

  async getArchiveRequests(status?: string): Promise<ArchiveRequest[]> {
    if (status) {
      return db.select().from(archiveRequests).where(eq(archiveRequests.status, status)).orderBy(desc(archiveRequests.createdAt));
    }
    return db.select().from(archiveRequests).orderBy(desc(archiveRequests.createdAt));
  }

  async updateArchiveRequestStatus(id: string, status: string): Promise<ArchiveRequest | undefined> {
    const updateData: any = { status };
    if (status === 'approved') {
      updateData.approvedAt = new Date();
    }
    const [updated] = await db
      .update(archiveRequests)
      .set(updateData)
      .where(eq(archiveRequests.id, id))
      .returning();
    return updated || undefined;
  }
}

export const storage = new DatabaseStorage();
