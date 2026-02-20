import Database from "better-sqlite3";
import path from "path";
import { randomUUID } from "crypto";

const DB_PATH = path.join(process.cwd(), "data", "seo.db");

let db: Database.Database;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        keyword TEXT NOT NULL,
        search_results TEXT,
        analysis TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS generations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        version INTEGER NOT NULL,
        title TEXT NOT NULL,
        meta_description TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT NOT NULL,
        rating TEXT,
        feedback TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }
  return db;
}

export interface Session {
  id: string;
  keyword: string;
  search_results: string | null;
  analysis: string | null;
  created_at: string;
}

export interface Generation {
  id: number;
  session_id: string;
  version: number;
  title: string;
  meta_description: string;
  content: string;
  tags: string;
  rating: string | null;
  feedback: string | null;
  created_at: string;
}

export function createSession(
  keyword: string,
  searchResults: string,
  analysis: string
): string {
  const id = randomUUID();
  getDb()
    .prepare(
      "INSERT INTO sessions (id, keyword, search_results, analysis) VALUES (?, ?, ?, ?)"
    )
    .run(id, keyword, searchResults, analysis);
  return id;
}

export function saveGeneration(
  sessionId: string,
  version: number,
  result: { title: string; metaDescription: string; content: string; tags: string[] }
): number {
  const info = getDb()
    .prepare(
      "INSERT INTO generations (session_id, version, title, meta_description, content, tags) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(
      sessionId,
      version,
      result.title,
      result.metaDescription,
      result.content,
      JSON.stringify(result.tags)
    );
  return Number(info.lastInsertRowid);
}

export function updateFeedback(
  generationId: number,
  rating: string,
  feedback: string
): void {
  getDb()
    .prepare("UPDATE generations SET rating = ?, feedback = ? WHERE id = ?")
    .run(rating, feedback, generationId);
}

export function getSession(
  sessionId: string
): (Session & { generations: Generation[] }) | null {
  const session = getDb()
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .get(sessionId) as Session | undefined;
  if (!session) return null;

  const generations = getDb()
    .prepare("SELECT * FROM generations WHERE session_id = ? ORDER BY version ASC")
    .all(sessionId) as Generation[];

  return { ...session, generations };
}

export function getLatestGeneration(sessionId: string): Generation | null {
  return (
    (getDb()
      .prepare(
        "SELECT * FROM generations WHERE session_id = ? ORDER BY version DESC LIMIT 1"
      )
      .get(sessionId) as Generation | undefined) ?? null
  );
}

export function getGenerationCount(sessionId: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) as count FROM generations WHERE session_id = ?")
    .get(sessionId) as { count: number };
  return row.count;
}

export interface KeywordHistoryItem {
  keyword: string;
  sessionCount: number;
  latestTitle: string;
  latestDate: string;
  sessions: { id: string; version: number; createdAt: string }[];
}

export function getKeywordHistory(): KeywordHistoryItem[] {
  const rows = getDb()
    .prepare(`
      SELECT
        s.id as session_id,
        s.keyword,
        s.created_at as session_created_at,
        g.title,
        g.version,
        g.created_at as gen_created_at
      FROM sessions s
      LEFT JOIN generations g ON g.session_id = s.id
        AND g.version = (
          SELECT MAX(g2.version) FROM generations g2 WHERE g2.session_id = s.id
        )
      ORDER BY s.created_at DESC
    `)
    .all() as {
      session_id: string;
      keyword: string;
      session_created_at: string;
      title: string | null;
      version: number | null;
      gen_created_at: string | null;
    }[];

  const keywordMap = new Map<string, KeywordHistoryItem>();

  for (const row of rows) {
    const existing = keywordMap.get(row.keyword);
    const session = {
      id: row.session_id,
      version: row.version ?? 1,
      createdAt: row.session_created_at,
    };

    if (existing) {
      existing.sessionCount++;
      existing.sessions.push(session);
    } else {
      keywordMap.set(row.keyword, {
        keyword: row.keyword,
        sessionCount: 1,
        latestTitle: row.title ?? "",
        latestDate: row.gen_created_at ?? row.session_created_at,
        sessions: [session],
      });
    }
  }

  return Array.from(keywordMap.values());
}
