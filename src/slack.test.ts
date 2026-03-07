import { describe, it, expect } from 'vitest';
import { buildMoodBlocks } from './slack.js';

describe('buildMoodBlocks', () => {
  it('returns blocks with 4 mood buttons and a comment input', () => {
    const blocks = buildMoodBlocks();

    expect(blocks).toHaveLength(3);

    expect(blocks[0].type).toBe('section');

    const actions = blocks[1];
    expect(actions.type).toBe('actions');
    expect(actions.elements).toHaveLength(4);

    const labels = actions.elements!.map((e: any) => e.text.text);
    expect(labels).toEqual([
      'Awesome Day',
      'Good Day',
      'Not So Good Day',
      'Horrible Day',
    ]);

    expect(blocks[2].type).toBe('input');
    expect(blocks[2].optional).toBe(true);
  });
});
