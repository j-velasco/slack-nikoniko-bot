# Scheduled Mood Prompts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users schedule a daily weekday DM with mood buttons at a time they choose, respecting their timezone.

**Architecture:** Add a `schedules` SQLite table storing user preferences (local_time + timezone). A Railway cron job hits `POST /api/send-reminders` every 5 minutes, which resolves due schedules by converting current UTC to each user's local timezone and sends DMs with the existing mood blocks.

**Tech Stack:** TypeScript, Slack Bolt, better-sqlite3, Node.js `Intl.DateTimeFormat` for timezone conversions.

**Design doc:** `docs/plans/2026-03-08-scheduled-mood-prompts-design.md`

---

### Task 1: Schedule Database Operations

**Files:**
- Modify: `src/db.ts`
- Test: `src/db.test.ts`

**Step 1: Write the failing tests**

Add to `src/db.test.ts`:

```typescript
import {
  createDb,
  hasSubmittedToday,
  recordSubmission,
  saveSchedule,
  getSchedule,
  deleteSchedule,
  getSchedulesByLocalTime,
} from './db.js';

// ... existing tests ...

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
    // Simulate already sent today
    db.prepare('UPDATE schedules SET last_sent_date = ? WHERE user_id = ?').run('2026-03-08', 'user1');
    const results = getSchedulesByLocalTime(db, '17:00', '2026-03-08');
    expect(results).toHaveLength(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `saveSchedule`, `getSchedule`, `deleteSchedule`, `getSchedulesByLocalTime` not exported.

**Step 3: Write minimal implementation**

Add to `src/db.ts`:

```typescript
// Add to createDb, after the submissions table creation:
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedules (
      user_id TEXT PRIMARY KEY,
      local_time TEXT NOT NULL,
      timezone TEXT NOT NULL,
      last_sent_date TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

// New exported types and functions:

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
```

**Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/db.ts src/db.test.ts
git commit -m "feat: add schedules table and CRUD operations"
```

---

### Task 2: Scheduler Logic (Timezone Resolution + Send Matching)

**Files:**
- Create: `src/scheduler.ts`
- Create: `src/scheduler.test.ts`

**Step 1: Write the failing tests**

Create `src/scheduler.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getLocalTime, isWeekday, roundToFiveMinutes } from './scheduler.js';

describe('getLocalTime', () => {
  it('converts UTC date to local time in a given timezone', () => {
    // 2026-03-08 22:00 UTC = 2026-03-08 17:00 EST (America/New_York, EST in March)
    const utcDate = new Date('2026-03-08T22:00:00Z');
    expect(getLocalTime(utcDate, 'America/New_York')).toBe('17:00');
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
```

**Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — module `./scheduler.js` not found.

**Step 3: Write minimal implementation**

Create `src/scheduler.ts`:

```typescript
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
```

**Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/scheduler.ts src/scheduler.test.ts
git commit -m "feat: add timezone conversion and weekday utilities"
```

---

### Task 3: Send Reminders Endpoint

**Files:**
- Modify: `src/scheduler.ts` (add `sendReminders` function)
- Modify: `src/scheduler.test.ts` (add integration-style tests)

**Step 1: Write the failing test**

Add to `src/scheduler.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createDb, saveSchedule, getSchedule } from './db.js';
import {
  getLocalTime,
  isWeekday,
  roundToFiveMinutes,
  findDueUsers,
} from './scheduler.js';

// ... existing tests ...

describe('findDueUsers', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDb(':memory:');
  });

  it('returns users whose local time matches the current 5-min slot on a weekday', () => {
    saveSchedule(db, 'user1', '17:00', 'America/New_York');
    saveSchedule(db, 'user2', '17:05', 'America/New_York');

    // 2026-03-09 22:00 UTC = 17:00 EST, Monday
    const now = new Date('2026-03-09T22:00:00Z');
    const dueUsers = findDueUsers(db, now);
    expect(dueUsers).toHaveLength(1);
    expect(dueUsers[0].user_id).toBe('user1');
  });

  it('returns empty on weekends', () => {
    saveSchedule(db, 'user1', '17:00', 'America/New_York');

    // 2026-03-08 22:00 UTC = 17:00 EST, Sunday
    const now = new Date('2026-03-08T22:00:00Z');
    const dueUsers = findDueUsers(db, now);
    expect(dueUsers).toHaveLength(0);
  });

  it('handles multiple timezones simultaneously', () => {
    saveSchedule(db, 'user1', '17:00', 'America/New_York');
    saveSchedule(db, 'user2', '22:00', 'UTC');

    // 2026-03-09 22:00 UTC = 17:00 EST and 22:00 UTC, Monday
    const now = new Date('2026-03-09T22:00:00Z');
    const dueUsers = findDueUsers(db, now);
    expect(dueUsers).toHaveLength(2);
  });

  it('skips users already sent today', () => {
    saveSchedule(db, 'user1', '17:00', 'America/New_York');
    db.prepare('UPDATE schedules SET last_sent_date = ? WHERE user_id = ?').run('2026-03-09', 'user1');

    const now = new Date('2026-03-09T22:00:00Z');
    const dueUsers = findDueUsers(db, now);
    expect(dueUsers).toHaveLength(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `findDueUsers` not exported.

**Step 3: Write minimal implementation**

Add to `src/scheduler.ts`:

```typescript
import type Database from 'better-sqlite3';
import { getSchedulesByLocalTime, markScheduleSent, type Schedule } from './db.js';

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
  // Get all distinct timezones from schedules
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
```

**Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/scheduler.ts src/scheduler.test.ts
git commit -m "feat: add findDueUsers to resolve due schedules across timezones"
```

---

### Task 4: Slash Command Parsing (`/mood schedule`, `/mood unschedule`)

**Files:**
- Modify: `src/index.ts`

This task modifies the `/mood` command handler to parse subcommands. No separate test file — the command parsing is thin glue code connecting tested modules.

**Step 1: Add schedule/unschedule handling to the `/mood` command**

Modify `src/index.ts`. The existing `/mood` handler (lines 46-77) needs to parse the command text for subcommands before showing the mood buttons.

Add these imports at the top of `src/index.ts`:

```typescript
import { saveSchedule, getSchedule, deleteSchedule } from './db.js';
import { roundToFiveMinutes } from './scheduler.js';
```

Replace the `/mood` command handler (lines 46-77) with:

```typescript
app.command('/mood', async ({ command, ack, respond, client }) => {
  await ack();

  try {
    if (!(await isUserInGroup(client, allowedUsergroupId, command.user_id))) {
      await respond({
        response_type: 'ephemeral',
        text: "You don't have access to this command.",
      });
      return;
    }

    const args = command.text.trim().split(/\s+/);
    const subcommand = args[0]?.toLowerCase();

    // /mood schedule [HH:MM] [timezone]
    if (subcommand === 'schedule') {
      const timeArg = args[1];

      // /mood schedule (no time) — show current schedule
      if (!timeArg) {
        const schedule = getSchedule(db, command.user_id);
        if (schedule) {
          await respond({
            response_type: 'ephemeral',
            text: `Your daily reminder is set for *${schedule.local_time}* (${schedule.timezone}).`,
          });
        } else {
          await respond({
            response_type: 'ephemeral',
            text: 'You have no schedule set. Use `/mood schedule HH:MM` to set one.',
          });
        }
        return;
      }

      // Validate time format
      if (!/^\d{2}:\d{2}$/.test(timeArg)) {
        await respond({
          response_type: 'ephemeral',
          text: 'Invalid time format. Use HH:MM (e.g., `/mood schedule 17:00`).',
        });
        return;
      }

      const [h, m] = timeArg.split(':').map(Number);
      if (h < 0 || h > 23 || m < 0 || m > 59) {
        await respond({
          response_type: 'ephemeral',
          text: 'Invalid time. Hours must be 00-23 and minutes 00-59.',
        });
        return;
      }

      // Determine timezone: explicit arg or Slack profile
      let timezone = args[2];
      if (!timezone) {
        const userInfo = await client.users.info({ user: command.user_id });
        timezone = userInfo.user?.tz ?? 'UTC';
      }

      // Validate timezone
      try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
      } catch {
        await respond({
          response_type: 'ephemeral',
          text: `Invalid timezone: "${timezone}". Use an IANA timezone like America/New_York.`,
        });
        return;
      }

      const roundedTime = roundToFiveMinutes(timeArg);
      saveSchedule(db, command.user_id, roundedTime, timezone);

      await respond({
        response_type: 'ephemeral',
        text: `Daily mood reminder set for *${roundedTime}* (${timezone}), weekdays only.`,
      });
      return;
    }

    // /mood unschedule
    if (subcommand === 'unschedule') {
      deleteSchedule(db, command.user_id);
      await respond({
        response_type: 'ephemeral',
        text: 'Your daily mood reminder has been removed.',
      });
      return;
    }

    // Default: show mood buttons (existing behavior)
    if (hasSubmittedToday(db, command.user_id)) {
      await respond({
        response_type: 'ephemeral',
        text: "You've already shared your mood today! Come back tomorrow.",
      });
      return;
    }

    await respond({
      response_type: 'ephemeral',
      blocks: buildMoodBlocks(),
    });
  } catch (err) {
    console.error('Failed to handle /mood command:', err);
    await respond({
      response_type: 'ephemeral',
      text: 'Something went wrong. Please try again later.',
    });
  }
});
```

**Step 2: Verify the build passes**

Run: `npm run build`
Expected: No type errors.

**Step 3: Run all tests**

Run: `npm test`
Expected: ALL PASS (existing tests unaffected).

**Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: add /mood schedule and /mood unschedule commands"
```

---

### Task 5: Send Reminders HTTP Endpoint

**Files:**
- Modify: `src/index.ts`

**Step 1: Add the endpoint**

Add the `CRON_SECRET` env var and endpoint. Add after the healthcheck route (line 36-38 in original `src/index.ts`):

```typescript
const cronSecret = process.env.CRON_SECRET;

receiver.router.post('/api/send-reminders', async (req, res) => {
  // Authenticate cron request
  const authHeader = req.headers.authorization;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const now = new Date();
    const dueUsers = findDueUsers(db, now);
    let sent = 0;

    for (const schedule of dueUsers) {
      try {
        // Skip if user already submitted today
        if (hasSubmittedToday(db, schedule.user_id)) continue;

        // Open DM channel and send mood blocks
        const dm = await app.client.conversations.open({ users: schedule.user_id });
        if (!dm.channel?.id) continue;

        await app.client.chat.postMessage({
          channel: dm.channel.id,
          text: 'Time for your daily mood check-in!',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: 'This is your daily mood check-in.',
              },
            },
            ...buildMoodBlocks(),
          ],
        });

        // Mark as sent to prevent double-sends
        const localDate = getLocalDate(now, schedule.timezone);
        markScheduleSent(db, schedule.user_id, localDate);
        sent++;
      } catch (err) {
        console.error(`Failed to send reminder to ${schedule.user_id}:`, err);
      }
    }

    res.json({ due: dueUsers.length, sent });
  } catch (err) {
    console.error('Failed to process reminders:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

Add these imports at the top of `src/index.ts`:

```typescript
import { findDueUsers, getLocalDate } from './scheduler.js';
import { markScheduleSent } from './db.js';
```

**Step 2: Verify the build passes**

Run: `npm run build`
Expected: No type errors.

**Step 3: Run all tests**

Run: `npm test`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: add POST /api/send-reminders endpoint for cron-triggered DMs"
```

---

### Task 6: Update Configuration Files

**Files:**
- Modify: `.env.example`

**Step 1: Add CRON_SECRET to `.env.example`**

Add this line to `.env.example`:

```
CRON_SECRET=your-cron-secret
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: add CRON_SECRET to .env.example"
```

---

### Task 7: Final Verification

**Step 1: Run full test suite**

Run: `npm test`
Expected: ALL PASS

**Step 2: Run build**

Run: `npm run build`
Expected: No errors

**Step 3: Verify no lint/type issues**

Run: `npx tsc --noEmit`
Expected: No errors
