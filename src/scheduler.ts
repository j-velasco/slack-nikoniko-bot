import type Database from 'better-sqlite3';
import { getSchedulesByLocalTime, type Schedule } from './db.js';

export function getLocalDate(utcDate: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(utcDate);
}

export function findDueUsers(db: Database.Database, now: Date): Schedule[] {
  const timezones = db.prepare('SELECT DISTINCT timezone FROM schedules').all() as { timezone: string }[];

  const dueUsers: Schedule[] = [];

  for (const { timezone } of timezones) {
    if (!isWeekday(now, timezone)) continue;

    const localTime = getLocalTime(now, timezone);
    const rounded = roundToFiveMinutes(localTime);
    const localDate = getLocalDate(now, timezone);
    const users = getSchedulesByLocalTime(db, rounded, localDate);

    for (const user of users) {
      if (user.timezone === timezone) {
        dueUsers.push(user);
      }
    }
  }

  return dueUsers;
}

export function getLocalTime(utcDate: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(utcDate);
  const hour = parts.find((p) => p.type === 'hour')!.value;
  const minute = parts.find((p) => p.type === 'minute')!.value;
  return `${hour}:${minute}`;
}

export function isWeekday(utcDate: Date, timezone: string): boolean {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  });
  const day = formatter.format(utcDate);
  return !['Sat', 'Sun'].includes(day);
}

export function roundToFiveMinutes(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const rounded = Math.floor(m / 5) * 5;
  return `${h.toString().padStart(2, '0')}:${rounded.toString().padStart(2, '0')}`;
}
