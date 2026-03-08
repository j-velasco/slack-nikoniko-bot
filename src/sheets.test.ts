import { describe, it, expect } from 'vitest';
import { buildMoodRow } from './sheets.js';

describe('buildMoodRow', () => {
  it('creates correct row for a mood with comment', () => {
    const result = buildMoodRow('Awesome Day', 'Feeling great!');

    expect(result).toEqual([
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      'Awesome Day',
      'Feeling great!',
    ]);
  });

  it('creates correct row without comment', () => {
    const result = buildMoodRow('Good Day');

    expect(result).toEqual([
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      'Good Day',
      '',
    ]);
  });
});
