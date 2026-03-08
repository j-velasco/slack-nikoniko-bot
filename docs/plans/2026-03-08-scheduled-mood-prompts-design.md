# Scheduled Mood Prompts Design

## Problem

Users must manually type `/mood` to record their daily mood. There's no proactive reminder, so participation depends on memory. The team is distributed across timezones, so a single reminder time doesn't work.

## Solution

Allow each user to set a preferred daily reminder time. The bot sends a DM with mood buttons at that time on weekdays, respecting each user's timezone.

## User Commands

### Set a schedule

```
/mood schedule 17:00
```

Uses the user's Slack profile timezone by default.

```
/mood schedule 17:00 America/New_York
```

Explicit timezone override.

### View current schedule

```
/mood schedule
```

Shows current setting or "no schedule set."

### Remove schedule

```
/mood unschedule
```

### Existing behavior

`/mood` (no subcommand) continues to work as before — shows mood buttons immediately.

## Data Model

New SQLite table `schedules`:

| Column | Type | Description |
|--------|------|-------------|
| user_id | TEXT PK | Slack user ID |
| local_time | TEXT | HH:MM in user's local timezone |
| timezone | TEXT | IANA timezone (e.g., America/New_York) |
| last_sent_date | TEXT | YYYY-MM-DD of last sent reminder (prevents double-sends) |
| created_at | TEXT | Timestamp |

User IDs are stored here (unlike the anonymous mood data) because scheduling requires knowing who to message.

## Timezone Handling

- Default: pull timezone from the user's Slack profile via `users.info` API
- Override: user can pass an explicit IANA timezone in the command
- DST: handled automatically — the scheduler converts current UTC to each user's local timezone on every tick, so DST transitions are reflected immediately

## Scheduler: Railway Cron → HTTP Endpoint

### Architecture

1. A Railway cron job runs every 5 minutes (`*/5 * * * *`)
2. It sends `POST /api/send-reminders` to the main app
3. The endpoint is secured with a shared secret (`CRON_SECRET` env var)
4. The app determines which users are due and sends DMs

### Send Logic

On each invocation:

1. Get current UTC time
2. Query all distinct timezones from `schedules` table
3. For each timezone:
   a. Convert current UTC to local time (HH:MM) and day-of-week
   b. Skip if not a weekday (Mon-Fri) in that timezone
   c. Round local time to nearest 5-minute slot
   d. Query users with matching `local_time` AND `last_sent_date != today`
4. For each matching user:
   a. Check if they've already submitted today (reuse existing dedup logic)
   b. If not submitted: send DM with mood buttons
   c. Update `last_sent_date` to today
5. Log results, return summary

### 5-Minute Window

Since Railway cron has 5-minute minimum granularity and doesn't guarantee exact timing, user-selected times are rounded to the nearest 5-minute slot. A user who picks 17:00 may receive their DM between 17:00-17:04.

### Double-Send Prevention

The `last_sent_date` column ensures that even if the cron fires multiple times in the same window, each user receives at most one reminder per day.

## DM Delivery

The bot sends the same mood blocks (from `slack.ts`) as a DM using `chat.postMessage`. An additional context line is prepended:

> "This is your daily mood check-in."

Existing button handlers work regardless of where the message was posted (channel vs DM), so the response flow is unchanged.

## Weekday Filtering

Reminders are sent only on weekdays (Monday-Friday) determined in the user's local timezone.

## Error Handling

- If a DM fails (user deactivated, bot can't DM): log error, skip user, continue loop
- If Slack rate-limits: add small delay between sends (unlikely at team scale)
- If cron endpoint is called without valid secret: return 401

## New Environment Variables

| Variable | Description |
|----------|-------------|
| CRON_SECRET | Shared secret to authenticate cron requests |

## Files to Create/Modify

- `src/scheduler.ts` — new: schedule DB operations, send-reminders logic
- `src/index.ts` — modify: add `/mood schedule`, `/mood unschedule` command parsing, add `/api/send-reminders` endpoint
- `src/slack.ts` — modify: add schedule confirmation message blocks
- `src/db.ts` — modify: add schedules table creation
- `src/scheduler.test.ts` — new: tests for scheduling logic
