import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'crypto';
import {
  createDb,
  hasSubmittedToday,
  recordSubmission,
  saveSchedule,
  getSchedule,
  deleteSchedule,
  getSchedulesByLocalTime,
} from './db.js';
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

describe('schedules', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDb(':memory:');
  });

  it('returns null when no schedule exists', () => {
    expect(getSchedule(db, 'user1')).toBeNull();
  });

  it('saves and retrieves a schedule', () => {
    saveSchedule(db, 'user1', '17:00', 'America/New_York');
    const schedule = getSchedule(db, 'user1');
    expect(schedule).toEqual({
      user_id: 'user1',
      local_time: '17:00',
      timezone: 'America/New_York',
      last_sent_date: null,
    });
  });

  it('upserts an existing schedule', () => {
    saveSchedule(db, 'user1', '17:00', 'America/New_York');
    saveSchedule(db, 'user1', '09:00', 'Europe/London');
    const schedule = getSchedule(db, 'user1');
    expect(schedule?.local_time).toBe('09:00');
    expect(schedule?.timezone).toBe('Europe/London');
  });

  it('deletes a schedule', () => {
    saveSchedule(db, 'user1', '17:00', 'America/New_York');
    deleteSchedule(db, 'user1');
    expect(getSchedule(db, 'user1')).toBeNull();
  });

  it('finds schedules by local time', () => {
    saveSchedule(db, 'user1', '17:00', 'America/New_York');
    saveSchedule(db, 'user2', '17:00', 'Europe/London');
    saveSchedule(db, 'user3', '09:00', 'America/New_York');
    const results = getSchedulesByLocalTime(db, '17:00', '2026-03-08');
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.user_id).sort()).toEqual(['user1', 'user2']);
  });

  it('excludes schedules already sent today', () => {
    saveSchedule(db, 'user1', '17:00', 'America/New_York');
    db.prepare('UPDATE schedules SET last_sent_date = ? WHERE user_id = ?').run('2026-03-08', 'user1');
    const results = getSchedulesByLocalTime(db, '17:00', '2026-03-08');
    expect(results).toHaveLength(0);
  });
});
