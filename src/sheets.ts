import { google } from 'googleapis';
import type { JSONClient } from 'google-auth-library/build/src/auth/googleauth.js';

export type Mood = 'Awesome Day' | 'Good Day' | 'Not So Good Day' | 'Horrible Day';

export function buildMoodRow(mood: Mood, comment?: string): [string, string, string] {
  const today = new Date().toISOString().split('T')[0];
  return [today, mood, comment ?? ''];
}

export async function recordMoodInSheets(
  auth: InstanceType<typeof google.auth.GoogleAuth<JSONClient>>,
  spreadsheetId: string,
  mood: Mood,
  comment?: string,
): Promise<void> {
  const sheets = google.sheets({ version: 'v4', auth });
  const row = buildMoodRow(mood, comment);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Sheet1!A:C',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [row],
    },
  });
}
