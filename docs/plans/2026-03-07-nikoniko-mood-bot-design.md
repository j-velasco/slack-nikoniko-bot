# NikoNiko Mood Bot — Design

## Purpose

A Slack bot that lets team members anonymously share their daily mood via a `/mood` slash command. Results are stored in a Notion database for tracking team sentiment over time.

## Architecture

- **Runtime:** TypeScript / Node.js with Slack Bolt framework
- **Hosting:** Railway (always-on Express server)
- **Dedup store:** SQLite on Railway persistent volume — stores SHA-256(user_id + date) hashes
- **Reporting:** Notion API — each mood entry creates a row in a Notion database

## User Flow

1. User types `/mood` in any Slack channel
2. Bot responds with an ephemeral message (only visible to user) showing 4 buttons + a text input for optional comment
3. User picks a mood and optionally writes a comment
4. Bot checks SQLite for hash(user_id + today's date):
   - If exists: ephemeral message "You've already shared your mood today!"
   - If new: store hash in SQLite, write entry to Notion, ephemeral "Thanks! Your mood has been recorded."
5. No identifying info is stored — only the irreversible hash and the mood/comment in Notion

## Mood Options

- Awesome Day
- Good Day
- Not So Good Day
- Horrible Day

## Notion Database Schema

| Property | Type         | Values / Description                                     |
| -------- | ------------ | -------------------------------------------------------- |
| Date     | Date         | Auto-set to submission date                              |
| Mood     | Select       | Awesome Day, Good Day, Not So Good Day, Horrible Day     |
| Comment  | Rich Text    | Optional free-text                                       |

## Tech Stack

- `@slack/bolt` — Slack app framework
- `better-sqlite3` — SQLite driver
- `@notionhq/client` — Notion API client
- `dotenv` — environment config

## Environment Variables

- `SLACK_BOT_TOKEN` — Bot OAuth token
- `SLACK_SIGNING_SECRET` — Request verification
- `NOTION_API_KEY` — Notion integration token
- `NOTION_DATABASE_ID` — Target database ID
- `PORT` — Server port (Railway provides this)

## Anonymity

Duplicate prevention uses SHA-256 hash of `user_id + YYYY-MM-DD`. This is irreversible — there is no way to determine who submitted which mood from the stored data. The Notion database contains only date, mood, and optional comment with no user identifiers.

## Hosting

Railway with a persistent volume mounted for SQLite storage. The app runs as a standard Express server.
