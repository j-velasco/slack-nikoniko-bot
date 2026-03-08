import 'dotenv/config';
import { App, ExpressReceiver } from '@slack/bolt';
import { google } from 'googleapis';
import { createDb, hasSubmittedToday, recordSubmission } from './db.js';
import { recordMoodInSheets, type Mood } from './sheets.js';
import { buildMoodBlocks } from './slack.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const MOODS: Mood[] = ['Awesome Day', 'Good Day', 'Not So Good Day', 'Horrible Day'];

const db = createDb(process.env.DB_PATH ?? './mood.db');

const credentials = JSON.parse(requireEnv('GOOGLE_SERVICE_ACCOUNT_KEY'));
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const spreadsheetId = requireEnv('GOOGLE_SPREADSHEET_ID');

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

    // Record in Sheets first, then dedup store — if Sheets fails, user can retry
    try {
      await recordMoodInSheets(auth, spreadsheetId, mood, comment);
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
