import { describe, it, expect } from 'vitest';
import { buildMoodRow, summarizeMoods } from './sheets.js';

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

describe('summarizeMoods', () => {
  it('returns zeros and null average for empty input', () => {
    const summary = summarizeMoods([]);
    expect(summary.total).toBe(0);
    expect(summary.average).toBeNull();
    expect(summary.counts).toEqual({
      'Awesome Day': 0,
      'Good Day': 0,
      'Not So Good Day': 0,
      'Horrible Day': 0,
    });
  });

  it('counts moods and computes average score', () => {
    const rows = [
      ['2026-04-25', 'Awesome Day', ''],
      ['2026-04-26', 'Good Day', 'meh'],
      ['2026-04-27', 'Good Day', ''],
      ['2026-04-28', 'Horrible Day', ''],
    ];
    const summary = summarizeMoods(rows);
    expect(summary.total).toBe(4);
    expect(summary.counts).toEqual({
      'Awesome Day': 1,
      'Good Day': 2,
      'Not So Good Day': 0,
      'Horrible Day': 1,
    });
    // (4 + 3 + 3 + 1) / 4 = 2.75
    expect(summary.average).toBeCloseTo(2.75);
  });

  it('filters rows before sinceDate', () => {
    const rows = [
      ['2026-04-01', 'Awesome Day', ''],
      ['2026-04-25', 'Good Day', ''],
      ['2026-04-29', 'Horrible Day', ''],
    ];
    const summary = summarizeMoods(rows, { sinceDate: '2026-04-20' });
    expect(summary.total).toBe(2);
    expect(summary.counts['Awesome Day']).toBe(0);
    expect(summary.counts['Good Day']).toBe(1);
    expect(summary.counts['Horrible Day']).toBe(1);
  });

  it('skips rows with unrecognized mood values', () => {
    const rows = [
      ['2026-04-25', 'Awesome Day', ''],
      ['2026-04-26', 'Mediocre Day', ''],
      ['2026-04-27', '', ''],
    ];
    const summary = summarizeMoods(rows);
    expect(summary.total).toBe(1);
    expect(summary.counts['Awesome Day']).toBe(1);
  });
});
