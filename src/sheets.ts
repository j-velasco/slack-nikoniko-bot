import { google } from 'googleapis';
import type { JSONClient } from 'google-auth-library/build/src/auth/googleauth.js';

export type Mood = 'Awesome Day' | 'Good Day' | 'Not So Good Day' | 'Horrible Day';

export const MOOD_SCORES: Record<Mood, number> = {
  'Awesome Day': 4,
  'Good Day': 3,
  'Not So Good Day': 2,
  'Horrible Day': 1,
};

const MOOD_ORDER: Mood[] = ['Awesome Day', 'Good Day', 'Not So Good Day', 'Horrible Day'];

export type MoodSummary = {
  total: number;
  counts: Record<Mood, number>;
  average: number | null;
};

export function buildMoodRow(mood: Mood, comment?: string): [string, string, string] {
  const today = new Date().toISOString().split('T')[0];
  return [today, mood, comment ?? ''];
}

export function summarizeMoods(
  rows: string[][],
  options: { sinceDate?: string } = {},
): MoodSummary {
  const counts: Record<Mood, number> = {
    'Awesome Day': 0,
    'Good Day': 0,
    'Not So Good Day': 0,
    'Horrible Day': 0,
  };
  let total = 0;
  let scoreSum = 0;

  for (const row of rows) {
    const [date, moodCell] = row;
    if (options.sinceDate && (!date || date < options.sinceDate)) continue;
    if (!MOOD_ORDER.includes(moodCell as Mood)) continue;
    const mood = moodCell as Mood;
    counts[mood]++;
    scoreSum += MOOD_SCORES[mood];
    total++;
  }

  return {
    total,
    counts,
    average: total > 0 ? scoreSum / total : null,
  };
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

export async function fetchMoodRows(
  auth: InstanceType<typeof google.auth.GoogleAuth<JSONClient>>,
  spreadsheetId: string,
): Promise<string[][]> {
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Sheet1!A:C',
  });
  return (res.data.values as string[][] | undefined) ?? [];
}
