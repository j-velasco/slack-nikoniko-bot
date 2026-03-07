import Database from 'better-sqlite3';
import { createHash } from 'crypto';

export function createDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS submissions (
      hash TEXT PRIMARY KEY,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  return db;
}

function hashUserDate(userId: string, date?: string): string {
  const dateStr = date ?? new Date().toISOString().split('T')[0];
  return createHash('sha256').update(`${userId}:${dateStr}`).digest('hex');
}

export function hasSubmittedToday(db: Database.Database, userId: string): boolean {
  const hash = hashUserDate(userId);
  const row = db.prepare('SELECT 1 FROM submissions WHERE hash = ?').get(hash);
  return row !== undefined;
}

export function recordSubmission(db: Database.Database, userId: string): void {
  const hash = hashUserDate(userId);
  db.prepare('INSERT OR IGNORE INTO submissions (hash) VALUES (?)').run(hash);
}
