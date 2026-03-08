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
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedules (
      user_id TEXT PRIMARY KEY,
      local_time TEXT NOT NULL,
      timezone TEXT NOT NULL,
      last_sent_date TEXT,
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

export interface Schedule {
  user_id: string;
  local_time: string;
  timezone: string;
  last_sent_date: string | null;
}

export function saveSchedule(db: Database.Database, userId: string, localTime: string, timezone: string): void {
  db.prepare(`
    INSERT INTO schedules (user_id, local_time, timezone)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET local_time = excluded.local_time, timezone = excluded.timezone
  `).run(userId, localTime, timezone);
}

export function getSchedule(db: Database.Database, userId: string): Schedule | null {
  const row = db.prepare('SELECT user_id, local_time, timezone, last_sent_date FROM schedules WHERE user_id = ?').get(userId);
  return (row as Schedule) ?? null;
}

export function deleteSchedule(db: Database.Database, userId: string): void {
  db.prepare('DELETE FROM schedules WHERE user_id = ?').run(userId);
}

export function getSchedulesByLocalTime(db: Database.Database, localTime: string, todayDate: string): Schedule[] {
  return db.prepare(
    'SELECT user_id, local_time, timezone, last_sent_date FROM schedules WHERE local_time = ? AND (last_sent_date IS NULL OR last_sent_date != ?)'
  ).all(localTime, todayDate) as Schedule[];
}

export function markScheduleSent(db: Database.Database, userId: string, date: string): void {
  db.prepare('UPDATE schedules SET last_sent_date = ? WHERE user_id = ?').run(date, userId);
}
