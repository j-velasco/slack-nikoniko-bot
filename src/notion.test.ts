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
