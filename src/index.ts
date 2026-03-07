import 'dotenv/config';
import { App, ExpressReceiver } from '@slack/bolt';
import { Client } from '@notionhq/client';
import { createDb, hasSubmittedToday, recordSubmission } from './db.js';
import { recordMoodInNotion, type Mood } from './notion.js';
import { buildMoodBlocks } from './slack.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const MOODS: Mood[] = ['Awesome Day', 'Good Day', 'Not So Good Day', 'Horrible Day'];

const db = createDb(process.env.DB_PATH ?? './mood.db');

const notion = new Client({ auth: requireEnv('NOTION_API_KEY') });
const databaseId = requireEnv('NOTION_DATABASE_ID');

const receiver = new ExpressReceiver({
  signingSecret: requireEnv('SLACK_SIGNING_SECRET'),
});

receiver.router.get('/', (_req, res) => {
  res.status(200).send('ok');
});

const app = new App({
  token: requireEnv('SLACK_BOT_TOKEN'),
  receiver,
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
    if (
      'state' in body &&
      body.state &&
      typeof body.state === 'object' &&
      'values' in body.state &&
      body.state.values?.mood_comment?.comment_input?.value
    ) {
      comment = body.state.values.mood_comment.comment_input.value;
    }

    // Record in Notion first, then dedup store — if Notion fails, user can retry
    try {
      await recordMoodInNotion(notion, databaseId, mood, comment);
      recordSubmission(db, userId);

      await respond({
        response_type: 'ephemeral',
        replace_original: true,
        text: 'Thanks! Your mood has been recorded anonymously.',
      });
    } catch (err) {
      console.error('Failed to record mood:', err);
      await respond({
        response_type: 'ephemeral',
        replace_original: true,
        text: 'Something went wrong. Please try again later.',
      });
    }
  });
}

// Start the app
(async () => {
  const port = Number(process.env.PORT) || 3000;
  await app.start(port);
  console.log(`NikoNiko bot is running on port ${port}`);
})();
