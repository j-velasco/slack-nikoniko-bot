import type { Mood } from './sheets.js';

const MOODS: { label: string; value: Mood; style?: 'primary' | 'danger' }[] = [
  { label: 'Awesome Day', value: 'Awesome Day', style: 'primary' },
  { label: 'Good Day', value: 'Good Day' },
  { label: 'Not So Good Day', value: 'Not So Good Day' },
  { label: 'Horrible Day', value: 'Horrible Day', style: 'danger' },
];

export function buildMoodBlocks() {
  return [
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: 'How are you feeling today? Your response is *anonymous*.',
      },
    },
    {
      type: 'actions' as const,
      block_id: 'mood_actions',
      elements: MOODS.map((mood) => ({
        type: 'button' as const,
        text: { type: 'plain_text' as const, text: mood.label },
        action_id: `mood_${mood.value}`,
        value: mood.value,
        ...(mood.style ? { style: mood.style } : {}),
      })),
    },
    {
      type: 'input' as const,
      block_id: 'mood_comment',
      optional: true,
      element: {
        type: 'plain_text_input' as const,
        action_id: 'comment_input',
        placeholder: {
          type: 'plain_text' as const,
          text: 'Add an optional comment...',
        },
      },
      label: {
        type: 'plain_text' as const,
        text: 'Comment',
      },
    },
  ];
}
