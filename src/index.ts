import 'dotenv/config';
import { App, ExpressReceiver } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import { google } from 'googleapis';
import { createDb, hasSubmittedToday, recordSubmission, saveSchedule, getSchedule, deleteSchedule, markScheduleSent } from './db.js';
import { recordMoodInSheets, type Mood } from './sheets.js';
import { buildMoodBlocks } from './slack.js';
import { roundToFiveMinutes, findDueUsers, getLocalDate } from './scheduler.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const MOODS: Mood[] = ['Awesome Day', 'Good Day', 'Not So Good Day', 'Horrible Day'];
const allowedUsergroupId = requireEnv('SLACK_ALLOWED_USERGROUP');

async function isUserInGroup(client: WebClient, usergroupId: string, userId: string): Promise<boolean> {
  const result = await client.usergroups.users.list({ usergroup: usergroupId });
  return result.users?.includes(userId) ?? false;
}

const db = createDb(process.env.DB_PATH ?? './mood.db');

const credentials = JSON.parse(requireEnv('GOOGLE_SERVICE_ACCOUNT_KEY'));
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const spreadsheetId = requireEnv('GOOGLE_SPREADSHEET_ID');
const cronSecret = process.env.CRON_SECRET;

const receiver = new ExpressReceiver({
  signingSecret: requireEnv('SLACK_SIGNING_SECRET'),
});

receiver.router.get('/', (_req, res) => {
  res.status(200).send('ok');
});

receiver.router.post('/api/send-reminders', async (req, res) => {
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
        if (hasSubmittedToday(db, schedule.user_id)) continue;

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

const app = new App({
  token: requireEnv('SLACK_BOT_TOKEN'),
  receiver,
});

// Handle /mood slash command
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
        new Intl.DateTimeFormat(undefined, { timeZone: timezone });
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

// Handle mood button clicks
for (const mood of MOODS) {
  app.action(`mood_${mood}`, async ({ ack, body, respond, client }) => {
    await ack();

    const userId = body.user.id;

    try {
      if (!(await isUserInGroup(client, allowedUsergroupId, userId))) {
        await respond({
          response_type: 'ephemeral',
          replace_original: true,
          text: "You don't have access to this command.",
        });
        return;
      }

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
