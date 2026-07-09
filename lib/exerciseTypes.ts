import { COLOR_PALETTE } from './layout';

const TYPE_TONES = ['green', 'orange', 'blue', 'purple', 'teal', 'rose', 'amber', 'slate', 'indigo', 'lime'] as const;

export function normalizeExerciseType(value?: string) {
  return (value || 'untyped').trim() || 'untyped';
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getExerciseTypeTheme(value?: string) {
  const type = normalizeExerciseType(value);
  const tone = TYPE_TONES[hashString(type.toLowerCase()) % TYPE_TONES.length];
  const palette = COLOR_PALETTE[tone] ?? COLOR_PALETTE.green;
  return { type, tone, ...palette };
}

export function getExerciseTypeMark(value?: string) {
  const type = normalizeExerciseType(value).toLowerCase();
  const letters = type
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map(part => part[0] ?? '')
    .join('')
    .slice(0, 2);
  return (letters || type.slice(0, 2) || '??').toUpperCase();
}
