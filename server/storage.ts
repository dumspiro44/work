import { admins, settings, translationJobs, logs, type Admin, type Settings, type TranslationJob, type Log, type InsertAdmin, type InsertSettings, type InsertTranslationJob, type InsertLog } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

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
  
  createLog(log: InsertLog): Promise<Log>;
  getLogsByJobId(jobId: string): Promise<Log[]>;
}

export class DatabaseStorage implements IStorage {
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
      const [updated] = await db
        .update(settings)
        .set({ ...insertSettings, updatedAt: new Date() })
        .where(eq(settings.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(settings)
        .values(insertSettings)
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
}

export const storage = new DatabaseStorage();
