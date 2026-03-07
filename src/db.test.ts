import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'crypto';
import { createDb, hasSubmittedToday, recordSubmission } from './db.js';
import Database from 'better-sqlite3';

describe('dedup database', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDb(':memory:');
  });

  it('returns false when user has not submitted today', () => {
    expect(hasSubmittedToday(db, 'user123')).toBe(false);
  });

  it('returns true after user submits', () => {
    recordSubmission(db, 'user123');
    expect(hasSubmittedToday(db, 'user123')).toBe(true);
  });

  it('allows same user on different days', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    const hash = createHash('sha256').update(`user123:${dateStr}`).digest('hex');
    db.prepare('INSERT INTO submissions (hash) VALUES (?)').run(hash);

    expect(hasSubmittedToday(db, 'user123')).toBe(false);
  });

  it('stores hashes not plain user IDs', () => {
    recordSubmission(db, 'user123');
    const rows = db.prepare('SELECT hash FROM submissions').all() as { hash: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].hash).not.toContain('user123');
    expect(rows[0].hash).toHaveLength(64);
  });
});
