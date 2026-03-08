import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createDb, saveSchedule } from './db.js';
import {
  getLocalTime,
  isWeekday,
  roundToFiveMinutes,
  findDueUsers,
} from './scheduler.js';

describe('getLocalTime', () => {
  it('converts UTC date to local time in a given timezone', () => {
    // 2026-03-08 22:00 UTC = 2026-03-08 18:00 EDT (America/New_York, DST active)
    const utcDate = new Date('2026-03-08T22:00:00Z');
    expect(getLocalTime(utcDate, 'America/New_York')).toBe('18:00');
  });

  it('handles timezones ahead of UTC', () => {
    // 2026-03-08 08:30 UTC = 2026-03-08 14:00 IST (Asia/Kolkata, UTC+5:30)
    const utcDate = new Date('2026-03-08T08:30:00Z');
    expect(getLocalTime(utcDate, 'Asia/Kolkata')).toBe('14:00');
  });
});

describe('isWeekday', () => {
  it('returns true for Monday-Friday', () => {
    // 2026-03-09 is a Monday
    const monday = new Date('2026-03-09T12:00:00Z');
    expect(isWeekday(monday, 'UTC')).toBe(true);
  });

  it('returns false for Saturday', () => {
    // 2026-03-07 is a Saturday
    const saturday = new Date('2026-03-07T12:00:00Z');
    expect(isWeekday(saturday, 'UTC')).toBe(false);
  });

  it('returns false for Sunday', () => {
    // 2026-03-08 is a Sunday
    const sunday = new Date('2026-03-08T12:00:00Z');
    expect(isWeekday(sunday, 'UTC')).toBe(false);
  });

  it('respects timezone for day boundary', () => {
    // 2026-03-09 01:00 UTC = 2026-03-08 20:00 EST (still Sunday in New York)
    const date = new Date('2026-03-09T01:00:00Z');
    expect(isWeekday(date, 'America/New_York')).toBe(false);
    expect(isWeekday(date, 'UTC')).toBe(true); // Monday in UTC
  });
});

describe('roundToFiveMinutes', () => {
  it('rounds down to nearest 5-minute slot', () => {
    expect(roundToFiveMinutes('17:03')).toBe('17:00');
    expect(roundToFiveMinutes('17:07')).toBe('17:05');
    expect(roundToFiveMinutes('17:00')).toBe('17:00');
    expect(roundToFiveMinutes('17:59')).toBe('17:55');
  });
});

describe('findDueUsers', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDb(':memory:');
  });

  it('returns users whose local time matches the current 5-min slot on a weekday', () => {
    saveSchedule(db, 'user1', '17:00', 'America/New_York');
    saveSchedule(db, 'user2', '17:05', 'America/New_York');

    // 2026-03-09 21:00 UTC = 17:00 EDT (America/New_York, DST active since March 8), Monday
    const now = new Date('2026-03-09T21:00:00Z');
    const dueUsers = findDueUsers(db, now);
    expect(dueUsers).toHaveLength(1);
    expect(dueUsers[0].user_id).toBe('user1');
  });

  it('returns empty on weekends', () => {
    saveSchedule(db, 'user1', '17:00', 'America/New_York');

    // 2026-03-08 is a Sunday. 21:00 UTC = 17:00 EDT
    const now = new Date('2026-03-08T21:00:00Z');
    const dueUsers = findDueUsers(db, now);
    expect(dueUsers).toHaveLength(0);
  });

  it('handles multiple timezones simultaneously', () => {
    saveSchedule(db, 'user1', '17:00', 'America/New_York');
    saveSchedule(db, 'user2', '21:00', 'UTC');

    // 2026-03-09 21:00 UTC = 17:00 EDT and 21:00 UTC, Monday
    const now = new Date('2026-03-09T21:00:00Z');
    const dueUsers = findDueUsers(db, now);
    expect(dueUsers).toHaveLength(2);
  });

  it('skips users already sent today', () => {
    saveSchedule(db, 'user1', '17:00', 'America/New_York');
    db.prepare('UPDATE schedules SET last_sent_date = ? WHERE user_id = ?').run('2026-03-09', 'user1');

    const now = new Date('2026-03-09T21:00:00Z');
    const dueUsers = findDueUsers(db, now);
    expect(dueUsers).toHaveLength(0);
  });
});
