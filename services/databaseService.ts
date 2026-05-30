
import { createClient } from "@libsql/client";
import { HistoryItem, ApplicationProfile, ApplicationLogEntry } from "../types";

// --- CONFIGURATION ---
// 1. We use the token provided by the user.
// 2. We keep a placeholder URL. To enable real Cloud Sync, replace this with your specific Turso DB URL (e.g. https://my-db-name.turso.io).
// 3. We implemented a fallback: If the URL is invalid or connection fails, the app automatically degrades to LocalStorage so you can still work.
const DB_URL = "https://resume-updater-placeholder.turso.io"; 
const DB_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJwUURSSXcwT0VmR21hNEl3cVF5NkxnIn0.OjpXcM0-lTjqaZdosfM3Zyj1rWUp3old2R9a2u0CBwQxSqtDK_yTkW6jigrRnKpViuovW77HJOHaFwwRufuSDw";

// Initialize the Turso client
const client = createClient({
  url: DB_URL,
  authToken: DB_TOKEN,
});

// Keys for LocalStorage fallback
const FALLBACK_PREFIX_HISTORY = 'ru_offline_history_';
const FALLBACK_PREFIX_MASTER = 'ru_offline_master_';
const FALLBACK_PREFIX_APP_PROFILE = 'ru_offline_app_profile_';
const FALLBACK_PREFIX_SUBMITTED = 'ru_offline_submitted_';
const FALLBACK_PREFIX_APP_LOG = 'ru_offline_app_log_';

/**
 * TURSO DATABASE SERVICE (WITH OFFLINE FALLBACK)
 * Tries to persist to Turso. If connection fails, falls back to LocalStorage.
 */
export const databaseService = {
  /**
   * Initialize Database Schema
   */
  initDB: async () => {
    try {
      // Create user_history table
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

      // Attempt to add the column if it doesn't exist (migration for existing dbs)
      try {
        await client.execute("ALTER TABLE user_history ADD COLUMN top_choice_message TEXT;");
      } catch (e) {
        // Ignore error if column already exists
      }
      try {
        await client.execute("ALTER TABLE user_history ADD COLUMN wellfound_message TEXT;");
      } catch (e) {
        // Ignore error if column already exists
      }

      // Create master_cv table
      await client.execute(`
        CREATE TABLE IF NOT EXISTS master_cv (
          user_id TEXT PRIMARY KEY,
          html_content TEXT
        );
      `);

      // Application profile (contact + work-authorization facts for auto-apply)
      await client.execute(`
        CREATE TABLE IF NOT EXISTS application_profile (
          user_id TEXT PRIMARY KEY,
          profile_json TEXT
        );
      `);

      // Submitted applications (dedupe so the same posting isn't auto-applied twice)
      await client.execute(`
        CREATE TABLE IF NOT EXISTS submitted_applications (
          user_id TEXT NOT NULL,
          board_token TEXT NOT NULL,
          job_id TEXT NOT NULL,
          timestamp INTEGER,
          PRIMARY KEY (user_id, board_token, job_id)
        );
      `);

      // Per-posting Q+A audit log (NOT a reusable bank — answers are company-specific).
      await client.execute(`
        CREATE TABLE IF NOT EXISTS application_log (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          board_token TEXT NOT NULL,
          job_id TEXT NOT NULL,
          job_title TEXT,
          company TEXT,
          status TEXT,
          timestamp INTEGER,
          answers_json TEXT
        );
      `);

      console.log("Turso Database initialized successfully.");
    } catch (e) {
      console.warn("Turso connection failed. Using Offline Mode (LocalStorage). Error:", e);
      // No strict action needed; subsequent calls will fail to try/catch blocks and use fallback
    }
  },

  /**
   * Fetch user's application history
   */
  getHistory: async (userId: string): Promise<HistoryItem[]> => {
    try {
      const result = await client.execute({
        sql: "SELECT * FROM user_history WHERE user_id = ? ORDER BY timestamp DESC",
        args: [userId],
      });

      return result.rows.map(row => ({
        id: row.id as string,
        userId: row.user_id as string,
        timestamp: row.timestamp as number,
        jobTitle: row.job_title as string,
        jdText: row.jd_text as string,
        originalCvHtml: row.original_cv_html as string,
        optimizedCvHtml: row.optimized_cv_html as string,
        topChoiceMessage: row.top_choice_message as string,
        wellfoundMessage: row.wellfound_message as string,
        scores: JSON.parse(row.scores_json as string),
        analysisData: JSON.parse(row.analysis_data_json as string),
      }));
    } catch (e) {
      console.warn("Falling back to local history.");
      const key = `${FALLBACK_PREFIX_HISTORY}${userId}`;
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    }
  },

  /**
   * Save a new history item
   */
  saveHistoryItem: async (userId: string, item: HistoryItem): Promise<void> => {
    // Try Cloud
    try {
      await client.execute({
        sql: `
          INSERT INTO user_history 
          (id, user_id, timestamp, job_title, jd_text, original_cv_html, optimized_cv_html, top_choice_message, wellfound_message, scores_json, analysis_data_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          item.id,
          userId,
          item.timestamp,
          item.jobTitle,
          item.jdText,
          item.originalCvHtml,
          item.optimizedCvHtml,
          item.topChoiceMessage || '',
          item.wellfoundMessage || '',
          JSON.stringify(item.scores),
          JSON.stringify(item.analysisData)
        ],
      });
    } catch (e) {
      // Fallback Local
      try {
        const key = `${FALLBACK_PREFIX_HISTORY}${userId}`;
        const existingStr = localStorage.getItem(key);
        const existing = existingStr ? JSON.parse(existingStr) : [];
        const updated = [item, ...existing];
        localStorage.setItem(key, JSON.stringify(updated));
      } catch (localErr) {
        console.error("Failed to save to local storage", localErr);
      }
    }
  },

  /**
   * Get Master CV Profile
   */
  getMasterCV: async (userId: string): Promise<string | null> => {
    try {
      const result = await client.execute({
        sql: "SELECT html_content FROM master_cv WHERE user_id = ?",
        args: [userId],
      });

      if (result.rows.length > 0) {
        return result.rows[0].html_content as string;
      }
      return null;
    } catch (e) {
      const key = `${FALLBACK_PREFIX_MASTER}${userId}`;
      return localStorage.getItem(key);
    }
  },

  /**
   * Update Master CV Profile
   */
  saveMasterCV: async (userId: string, htmlContent: string): Promise<void> => {
    // Try Cloud
    try {
      await client.execute({
        sql: `
          INSERT INTO master_cv (user_id, html_content) VALUES (?, ?)
          ON CONFLICT(user_id) DO UPDATE SET html_content = excluded.html_content
        `,
        args: [userId, htmlContent],
      });
    } catch (e) {
      // Fallback Local
      const key = `${FALLBACK_PREFIX_MASTER}${userId}`;
      localStorage.setItem(key, htmlContent);
    }
  },

  /**
   * Get the user's Application Profile (contact + work-authorization facts).
   */
  getApplicationProfile: async (userId: string): Promise<ApplicationProfile | null> => {
    try {
      const result = await client.execute({
        sql: "SELECT profile_json FROM application_profile WHERE user_id = ?",
        args: [userId],
      });
      if (result.rows.length > 0) {
        return JSON.parse(result.rows[0].profile_json as string);
      }
      return null;
    } catch (e) {
      const data = localStorage.getItem(`${FALLBACK_PREFIX_APP_PROFILE}${userId}`);
      return data ? JSON.parse(data) : null;
    }
  },

  /**
   * Save the user's Application Profile.
   */
  saveApplicationProfile: async (userId: string, profile: ApplicationProfile): Promise<void> => {
    const json = JSON.stringify(profile);
    try {
      await client.execute({
        sql: `
          INSERT INTO application_profile (user_id, profile_json) VALUES (?, ?)
          ON CONFLICT(user_id) DO UPDATE SET profile_json = excluded.profile_json
        `,
        args: [userId, json],
      });
    } catch (e) {
      localStorage.setItem(`${FALLBACK_PREFIX_APP_PROFILE}${userId}`, json);
    }
  },

  /**
   * Keys ("boardToken/jobId") of postings already auto-applied to.
   */
  getSubmittedKeys: async (userId: string): Promise<string[]> => {
    try {
      const result = await client.execute({
        sql: "SELECT board_token, job_id FROM submitted_applications WHERE user_id = ?",
        args: [userId],
      });
      return result.rows.map(r => `${r.board_token}/${r.job_id}`);
    } catch (e) {
      const data = localStorage.getItem(`${FALLBACK_PREFIX_SUBMITTED}${userId}`);
      return data ? JSON.parse(data) : [];
    }
  },

  /**
   * Record a submitted application for dedupe.
   */
  /**
   * Persist a per-posting application log entry (Q+A audit, not reused across companies).
   */
  saveApplicationLog: async (entry: ApplicationLogEntry): Promise<void> => {
    const json = JSON.stringify(entry.answers);
    try {
      await client.execute({
        sql: `
          INSERT INTO application_log (id, user_id, board_token, job_id, job_title, company, status, timestamp, answers_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [entry.id, entry.userId, entry.boardToken, entry.jobId, entry.jobTitle, entry.company, entry.status, entry.timestamp, json],
      });
    } catch (e) {
      const key = `${FALLBACK_PREFIX_APP_LOG}${entry.userId}`;
      const existing: ApplicationLogEntry[] = JSON.parse(localStorage.getItem(key) || '[]');
      localStorage.setItem(key, JSON.stringify([entry, ...existing]));
    }
  },

  getApplicationLogs: async (userId: string): Promise<ApplicationLogEntry[]> => {
    try {
      const result = await client.execute({
        sql: "SELECT * FROM application_log WHERE user_id = ? ORDER BY timestamp DESC",
        args: [userId],
      });
      return result.rows.map(r => ({
        id: r.id as string,
        userId: r.user_id as string,
        boardToken: r.board_token as string,
        jobId: r.job_id as string,
        jobTitle: r.job_title as string,
        company: r.company as string,
        status: r.status as ApplicationLogEntry['status'],
        timestamp: r.timestamp as number,
        answers: JSON.parse((r.answers_json as string) || '[]'),
      }));
    } catch (e) {
      const data = localStorage.getItem(`${FALLBACK_PREFIX_APP_LOG}${userId}`);
      return data ? JSON.parse(data) : [];
    }
  },

  recordSubmitted: async (userId: string, boardToken: string, jobId: string): Promise<void> => {
    try {
      await client.execute({
        sql: `
          INSERT INTO submitted_applications (user_id, board_token, job_id, timestamp)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, board_token, job_id) DO NOTHING
        `,
        args: [userId, boardToken, jobId, Date.now()],
      });
    } catch (e) {
      const key = `${FALLBACK_PREFIX_SUBMITTED}${userId}`;
      const existing: string[] = JSON.parse(localStorage.getItem(key) || '[]');
      const entry = `${boardToken}/${jobId}`;
      if (!existing.includes(entry)) {
        localStorage.setItem(key, JSON.stringify([...existing, entry]));
      }
    }
  }
};
