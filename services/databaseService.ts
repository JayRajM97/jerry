
import { createClient } from "@libsql/client";
import { HistoryItem, ApplicationStatus } from "../types";

const DB_URL = "https://resume-updater-placeholder.turso.io";
const DB_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJwUURSSXcwT0VmR21hNEl3cVF5NkxnIn0.OjpXcM0-lTjqaZdosfM3Zyj1rWUp3old2R9a2u0CBwQxSqtDK_yTkW6jigrRnKpViuovW77HJOHaFwwRufuSDw";

const client = createClient({
  url: DB_URL,
  authToken: DB_TOKEN,
});

const FALLBACK_PREFIX_HISTORY = 'ru_offline_history_';
const FALLBACK_PREFIX_MASTER = 'ru_offline_master_';

async function tryAlterColumn(sql: string) {
  try { await client.execute(sql); } catch (_) { /* column already exists */ }
}

export const databaseService = {
  initDB: async () => {
    try {
      await client.execute(`
        CREATE TABLE IF NOT EXISTS user_history (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          timestamp INTEGER,
          job_title TEXT,
          jd_text TEXT,
          original_cv_html TEXT,
          optimized_cv_html TEXT,
          top_choice_message TEXT,
          wellfound_message TEXT,
          scores_json TEXT,
          analysis_data_json TEXT
        );
      `);

      // Migrations — idempotent
      await tryAlterColumn("ALTER TABLE user_history ADD COLUMN top_choice_message TEXT;");
      await tryAlterColumn("ALTER TABLE user_history ADD COLUMN wellfound_message TEXT;");
      await tryAlterColumn("ALTER TABLE user_history ADD COLUMN introduction_message TEXT;");
      await tryAlterColumn("ALTER TABLE user_history ADD COLUMN company_name TEXT;");
      await tryAlterColumn("ALTER TABLE user_history ADD COLUMN job_url TEXT;");
      await tryAlterColumn("ALTER TABLE user_history ADD COLUMN application_status TEXT DEFAULT 'saved';");
      await tryAlterColumn("ALTER TABLE user_history ADD COLUMN cover_letter TEXT;");
      await tryAlterColumn("ALTER TABLE user_history ADD COLUMN company_intel_json TEXT;");
      await tryAlterColumn("ALTER TABLE user_history ADD COLUMN outreach_options_json TEXT;");
      await tryAlterColumn("ALTER TABLE user_history ADD COLUMN chosen_outreach_id TEXT;");

      await client.execute(`
        CREATE TABLE IF NOT EXISTS master_cv (
          user_id TEXT PRIMARY KEY,
          html_content TEXT
        );
      `);

      console.log("Turso Database initialized successfully.");
    } catch (e) {
      console.warn("Turso connection failed. Using Offline Mode (LocalStorage). Error:", e);
    }
  },

  getHistory: async (userId: string): Promise<HistoryItem[]> => {
    try {
      const result = await client.execute({
        sql: "SELECT * FROM user_history WHERE user_id = ? ORDER BY timestamp DESC",
        args: [userId],
      });

      return result.rows.map(row => {
        let companyIntel;
        let outreachOptions;
        try { companyIntel = row.company_intel_json ? JSON.parse(row.company_intel_json as string) : undefined; } catch (_) {}
        try { outreachOptions = row.outreach_options_json ? JSON.parse(row.outreach_options_json as string) : undefined; } catch (_) {}

        return {
          id: row.id as string,
          userId: row.user_id as string,
          timestamp: row.timestamp as number,
          jobTitle: row.job_title as string,
          companyName: row.company_name as string | undefined,
          jobUrl: row.job_url as string | undefined,
          applicationStatus: (row.application_status as ApplicationStatus) || 'saved',
          jdText: row.jd_text as string,
          originalCvHtml: row.original_cv_html as string,
          optimizedCvHtml: row.optimized_cv_html as string,
          topChoiceMessage: row.top_choice_message as string,
          wellfoundMessage: row.wellfound_message as string,
          introductionMessage: row.introduction_message as string | undefined,
          coverLetter: row.cover_letter as string | undefined,
          companyIntel,
          outreachOptions,
          chosenOutreachId: row.chosen_outreach_id as any,
          scores: JSON.parse(row.scores_json as string),
          analysisData: JSON.parse(row.analysis_data_json as string),
        };
      });
    } catch (e) {
      console.warn("Falling back to local history.");
      const key = `${FALLBACK_PREFIX_HISTORY}${userId}`;
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    }
  },

  saveHistoryItem: async (userId: string, item: HistoryItem): Promise<void> => {
    try {
      await client.execute({
        sql: `
          INSERT INTO user_history
          (id, user_id, timestamp, job_title, company_name, job_url, application_status,
           jd_text, original_cv_html, optimized_cv_html, top_choice_message, wellfound_message,
           introduction_message, cover_letter, company_intel_json, outreach_options_json,
           chosen_outreach_id, scores_json, analysis_data_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          item.id,
          userId,
          item.timestamp,
          item.jobTitle,
          item.companyName || null,
          item.jobUrl || null,
          item.applicationStatus || 'saved',
          item.jdText,
          item.originalCvHtml,
          item.optimizedCvHtml,
          item.topChoiceMessage || '',
          item.wellfoundMessage || '',
          item.introductionMessage || '',
          item.coverLetter || '',
          item.companyIntel ? JSON.stringify(item.companyIntel) : null,
          item.outreachOptions ? JSON.stringify(item.outreachOptions) : null,
          item.chosenOutreachId || null,
          JSON.stringify(item.scores),
          JSON.stringify(item.analysisData),
        ],
      });
    } catch (e) {
      try {
        const key = `${FALLBACK_PREFIX_HISTORY}${userId}`;
        const existingStr = localStorage.getItem(key);
        const existing = existingStr ? JSON.parse(existingStr) : [];
        localStorage.setItem(key, JSON.stringify([item, ...existing]));
      } catch (localErr) {
        console.error("Failed to save to local storage", localErr);
      }
    }
  },

  updateApplicationStatus: async (userId: string, itemId: string, status: ApplicationStatus): Promise<void> => {
    try {
      await client.execute({
        sql: "UPDATE user_history SET application_status = ? WHERE id = ? AND user_id = ?",
        args: [status, itemId, userId],
      });
    } catch (e) {
      const key = `${FALLBACK_PREFIX_HISTORY}${userId}`;
      const data = localStorage.getItem(key);
      if (data) {
        const items: HistoryItem[] = JSON.parse(data);
        localStorage.setItem(key, JSON.stringify(
          items.map(i => i.id === itemId ? { ...i, applicationStatus: status } : i)
        ));
      }
    }
  },

  getMasterCV: async (userId: string): Promise<string | null> => {
    try {
      const result = await client.execute({
        sql: "SELECT html_content FROM master_cv WHERE user_id = ?",
        args: [userId],
      });
      if (result.rows.length > 0) return result.rows[0].html_content as string;
      return null;
    } catch (e) {
      return localStorage.getItem(`${FALLBACK_PREFIX_MASTER}${userId}`);
    }
  },

  saveMasterCV: async (userId: string, htmlContent: string): Promise<void> => {
    try {
      await client.execute({
        sql: `
          INSERT INTO master_cv (user_id, html_content) VALUES (?, ?)
          ON CONFLICT(user_id) DO UPDATE SET html_content = excluded.html_content
        `,
        args: [userId, htmlContent],
      });
    } catch (e) {
      localStorage.setItem(`${FALLBACK_PREFIX_MASTER}${userId}`, htmlContent);
    }
  }
};
