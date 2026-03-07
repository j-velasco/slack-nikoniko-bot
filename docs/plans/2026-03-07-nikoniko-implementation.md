# NikoNiko Mood Bot Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Slack bot that lets team members anonymously share daily mood via `/mood`, storing results in a Notion database.

**Architecture:** TypeScript Express server running Slack Bolt. SQLite stores SHA-256 hashes of user_id+date for anonymous dedup. Notion API writes mood entries. Deployed on Railway.

**Tech Stack:** @slack/bolt, better-sqlite3, @notionhq/client, dotenv, vitest

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`

**Step 1: Initialize the project**

Run:
```bash
npm init -y
```

**Step 2: Install dependencies**

Run:
```bash
npm install @slack/bolt better-sqlite3 @notionhq/client dotenv
npm install -D typescript @types/node @types/better-sqlite3 vitest tsx
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Create .gitignore**

```
node_modules/
dist/
.env
*.db
```

**Step 5: Create .env.example**

```
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_SIGNING_SECRET=your-signing-secret
NOTION_API_KEY=ntn_your-key
NOTION_DATABASE_ID=your-database-id
PORT=3000
```

**Step 6: Add scripts to package.json**

Add to `package.json`:
```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

**Step 7: Commit**

```bash
git add package.json tsconfig.json .gitignore .env.example
git commit -m "chore: scaffold project with dependencies and config"
```

---

### Task 2: Database Module (SQLite dedup store)

**Files:**
- Create: `src/db.ts`
- Create: `src/db.test.ts`

**Step 1: Write the failing test**

Create `src/db.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
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
    // Manually insert a hash for yesterday
    const crypto = require('crypto');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    const hash = crypto.createHash('sha256').update(`user123:${dateStr}`).digest('hex');
    db.prepare('INSERT INTO submissions (hash) VALUES (?)').run(hash);

    // Today should still be false
    expect(hasSubmittedToday(db, 'user123')).toBe(false);
  });

  it('stores hashes not plain user IDs', () => {
    recordSubmission(db, 'user123');
    const rows = db.prepare('SELECT hash FROM submissions').all() as { hash: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].hash).not.toContain('user123');
    expect(rows[0].hash).toHaveLength(64); // SHA-256 hex
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/db.test.ts`
Expected: FAIL — module `./db.js` not found

**Step 3: Write minimal implementation**

Create `src/db.ts`:
```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/db.test.ts`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add src/db.ts src/db.test.ts
git commit -m "feat: add SQLite dedup store with SHA-256 hashing"
```

---

### Task 3: Notion Module

**Files:**
- Create: `src/notion.ts`
- Create: `src/notion.test.ts`

**Step 1: Write the failing test**

Create `src/notion.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { buildMoodPage } from './notion.js';

describe('buildMoodPage', () => {
  it('creates correct Notion page properties for a mood with comment', () => {
    const result = buildMoodPage('db-id-123', 'Awesome Day', 'Feeling great!');

    expect(result).toEqual({
      parent: { database_id: 'db-id-123' },
      properties: {
        Date: {
          date: { start: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
        },
        Mood: {
          select: { name: 'Awesome Day' },
        },
        Comment: {
          rich_text: [{ text: { content: 'Feeling great!' } }],
        },
      },
    });
  });

  it('creates correct properties without comment', () => {
    const result = buildMoodPage('db-id-123', 'Good Day');

    expect(result.properties.Comment).toEqual({
      rich_text: [],
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/notion.test.ts`
Expected: FAIL — module `./notion.js` not found

**Step 3: Write minimal implementation**

Create `src/notion.ts`:
```typescript
import { Client } from '@notionhq/client';

export type Mood = 'Awesome Day' | 'Good Day' | 'Not So Good Day' | 'Horrible Day';

export function buildMoodPage(databaseId: string, mood: Mood, comment?: string) {
  const today = new Date().toISOString().split('T')[0];

  return {
    parent: { database_id: databaseId },
    properties: {
      Date: {
        date: { start: today },
      },
      Mood: {
        select: { name: mood },
      },
      Comment: {
        rich_text: comment ? [{ text: { content: comment } }] : [],
      },
    },
  };
}

export async function recordMoodInNotion(
  client: Client,
  databaseId: string,
  mood: Mood,
  comment?: string,
): Promise<void> {
  const page = buildMoodPage(databaseId, mood, comment);
  await client.pages.create(page as Parameters<Client['pages']['create']>[0]);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/notion.test.ts`
Expected: All 2 tests PASS

**Step 5: Commit**

```bash
git add src/notion.ts src/notion.test.ts
git commit -m "feat: add Notion mood page builder and recorder"
```

---

### Task 4: Slack App (slash command + button interactions)

**Files:**
- Create: `src/slack.ts`
- Create: `src/slack.test.ts`

**Step 1: Write the failing test**

Create `src/slack.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildMoodBlocks } from './slack.js';

describe('buildMoodBlocks', () => {
  it('returns blocks with 4 mood buttons and a comment input', () => {
    const blocks = buildMoodBlocks();

    // Should have a header, a section with buttons, and a comment input
    expect(blocks).toHaveLength(3);

    // First block is header
    expect(blocks[0].type).toBe('section');

    // Second block has 4 buttons
    const actions = blocks[1];
    expect(actions.type).toBe('actions');
    expect(actions.elements).toHaveLength(4);

    const labels = actions.elements.map((e: any) => e.text.text);
    expect(labels).toEqual([
      'Awesome Day',
      'Good Day',
      'Not So Good Day',
      'Horrible Day',
    ]);

    // Third block is comment input
    expect(blocks[2].type).toBe('input');
    expect(blocks[2].optional).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/slack.test.ts`
Expected: FAIL — module `./slack.js` not found

**Step 3: Write minimal implementation**

Create `src/slack.ts`:
```typescript
import type { Mood } from './notion.js';

const MOODS: { label: string; value: Mood; style?: 'primary' | 'danger' }[] = [
  { label: 'Awesome Day', value: 'Awesome Day', style: 'primary' },
  { label: 'Good Day', value: 'Good Day' },
  { label: 'Not So Good Day', value: 'Not So Good Day' },
  { label: 'Horrible Day', value: 'Horrible Day', style: 'danger' },
];

export function buildMoodBlocks() {
  return [
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: 'How are you feeling today? Your response is *anonymous*.',
      },
    },
    {
      type: 'actions' as const,
      block_id: 'mood_actions',
      elements: MOODS.map((mood) => ({
        type: 'button' as const,
        text: { type: 'plain_text' as const, text: mood.label },
        action_id: `mood_${mood.value}`,
        value: mood.value,
        ...(mood.style ? { style: mood.style } : {}),
      })),
    },
    {
      type: 'input' as const,
      block_id: 'mood_comment',
      optional: true,
      element: {
        type: 'plain_text_input' as const,
        action_id: 'comment_input',
        placeholder: {
          type: 'plain_text' as const,
          text: 'Add an optional comment...',
        },
      },
      label: {
        type: 'plain_text' as const,
        text: 'Comment',
      },
    },
  ];
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/slack.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/slack.ts src/slack.test.ts
git commit -m "feat: add Slack mood block builder with buttons and comment input"
```

---

### Task 5: Wire Everything Together (main app)

**Files:**
- Create: `src/index.ts`

**Step 1: Write the main app**

Create `src/index.ts`:
```typescript
import 'dotenv/config';
import { App } from '@slack/bolt';
import { Client } from '@notionhq/client';
import { createDb, hasSubmittedToday, recordSubmission } from './db.js';
import { recordMoodInNotion, type Mood } from './notion.js';
import { buildMoodBlocks } from './slack.js';

const MOODS: Mood[] = ['Awesome Day', 'Good Day', 'Not So Good Day', 'Horrible Day'];

const db = createDb(process.env.DB_PATH ?? './mood.db');

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const databaseId = process.env.NOTION_DATABASE_ID!;

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

// Handle /mood slash command
app.command('/mood', async ({ command, ack, respond }) => {
  await ack();

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
});

// Handle mood button clicks
for (const mood of MOODS) {
  app.action(`mood_${mood}`, async ({ ack, body, respond }) => {
    await ack();

    const userId = body.user.id;

    if (hasSubmittedToday(db, userId)) {
      await respond({
        response_type: 'ephemeral',
        replace_original: true,
        text: "You've already shared your mood today! Come back tomorrow.",
      });
      return;
    }

    // Extract optional comment from the state
    let comment: string | undefined;
    if ('state' in body && body.state?.values?.mood_comment?.comment_input?.value) {
      comment = body.state.values.mood_comment.comment_input.value;
    }

    // Record in both stores
    recordSubmission(db, userId);
    await recordMoodInNotion(notion, databaseId, mood, comment);

    await respond({
      response_type: 'ephemeral',
      replace_original: true,
      text: 'Thanks! Your mood has been recorded anonymously.',
    });
  });
}

// Start the app
(async () => {
  const port = Number(process.env.PORT) || 3000;
  await app.start(port);
  console.log(`NikoNiko bot is running on port ${port}`);
})();
```

**Step 2: Test manually**

Run: `npm run dev`
Expected: Console output "NikoNiko bot is running on port 3000"

Note: Full integration testing requires a Slack app configured. See Task 6 for setup instructions.

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire up slash command, button handlers, and Notion integration"
```

---

### Task 6: Slack App Configuration Guide

**Files:**
- Create: `docs/slack-setup.md`

**Step 1: Write setup guide**

Create `docs/slack-setup.md`:
```markdown
# Slack App Setup

## 1. Create the Slack App

1. Go to https://api.slack.com/apps
2. Click "Create New App" > "From scratch"
3. Name it "NikoNiko" and select your workspace

## 2. Configure Slash Command

1. Go to "Slash Commands" in the sidebar
2. Click "Create New Command"
   - Command: `/mood`
   - Request URL: `https://your-railway-url.up.railway.app/slack/events`
   - Description: "Share your daily mood anonymously"

## 3. Enable Interactivity

1. Go to "Interactivity & Shortcuts"
2. Toggle ON
3. Request URL: `https://your-railway-url.up.railway.app/slack/events`

## 4. Set Bot Scopes

Go to "OAuth & Permissions" and add these Bot Token Scopes:
- `commands`
- `chat:write`

## 5. Install to Workspace

1. Go to "Install App"
2. Click "Install to Workspace"
3. Copy the "Bot User OAuth Token" — this is your `SLACK_BOT_TOKEN`

## 6. Get Signing Secret

1. Go to "Basic Information"
2. Under "App Credentials", copy "Signing Secret" — this is your `SLACK_SIGNING_SECRET`
```

**Step 2: Commit**

```bash
git add docs/slack-setup.md
git commit -m "docs: add Slack app setup guide"
```

---

### Task 7: Railway Deployment Configuration

**Files:**
- Create: `Dockerfile`
- Create: `railway.toml`

**Step 1: Create Dockerfile**

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

CMD ["node", "dist/index.js"]
```

**Step 2: Create railway.toml**

```toml
[build]
builder = "dockerfile"

[deploy]
healthcheckPath = "/"
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

**Step 3: Add a health check endpoint to index.ts**

In `src/index.ts`, before `app.start()`, add:
```typescript
import http from 'http';

// Health check for Railway
const healthServer = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200);
    res.end('ok');
  }
});
```

And modify the start section:
```typescript
(async () => {
  const port = Number(process.env.PORT) || 3000;
  await app.start(port);
  console.log(`NikoNiko bot is running on port ${port}`);
})();
```

Note: Bolt's built-in Express receiver already serves on the PORT, and Railway's health check can hit `/slack/events` or we can handle `/` in a custom receiver. For simplicity, Bolt's default receiver will work — Railway just needs the app to respond on the port.

**Step 4: Commit**

```bash
git add Dockerfile railway.toml
git commit -m "chore: add Railway deployment config"
```

---

### Task 8: Notion Database Setup Guide

**Files:**
- Create: `docs/notion-setup.md`

**Step 1: Write setup guide**

Create `docs/notion-setup.md`:
```markdown
# Notion Database Setup

## 1. Create a Notion Integration

1. Go to https://www.notion.so/my-integrations
2. Click "New integration"
3. Name it "NikoNiko Bot"
4. Select the workspace
5. Copy the "Internal Integration Token" — this is your `NOTION_API_KEY`

## 2. Create the Database

Create a new database in Notion with these properties:

| Property Name | Type       | Configuration                                                 |
| ------------- | ---------- | ------------------------------------------------------------- |
| Date          | Date       | Default                                                       |
| Mood          | Select     | Options: Awesome Day, Good Day, Not So Good Day, Horrible Day |
| Comment       | Text       | Default                                                       |

## 3. Share with Integration

1. Open the database page
2. Click "..." menu > "Connections" > "Connect to" > Select "NikoNiko Bot"

## 4. Get Database ID

1. Open the database as a full page
2. The URL will look like: `https://www.notion.so/yourworkspace/abc123def456?v=...`
3. The `abc123def456` part is your `NOTION_DATABASE_ID`
```

**Step 2: Commit**

```bash
git add docs/notion-setup.md
git commit -m "docs: add Notion database setup guide"
```

---

### Summary

| Task | Description | Dependencies |
| ---- | ----------- | ------------ |
| 1    | Project scaffolding | None |
| 2    | SQLite dedup module (TDD) | Task 1 |
| 3    | Notion module (TDD) | Task 1 |
| 4    | Slack block builder (TDD) | Task 1 |
| 5    | Wire everything in index.ts | Tasks 2, 3, 4 |
| 6    | Slack app setup docs | None |
| 7    | Railway deployment config | Task 5 |
| 8    | Notion setup docs | None |

Tasks 2, 3, 4 can be done in parallel. Tasks 6 and 8 can be done in parallel with everything.
