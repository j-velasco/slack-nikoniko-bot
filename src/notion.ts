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
