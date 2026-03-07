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
    if (
      'state' in body &&
      body.state &&
      typeof body.state === 'object' &&
      'values' in body.state &&
      body.state.values?.mood_comment?.comment_input?.value
    ) {
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
