import { Exercise } from './exercises';

export interface CategoryConfig {
  id: string;
  name: string;
  color: string; // 'green' | 'orange' | 'blue' | 'purple'
  exerciseIds: string[];
}

export const COLOR_PALETTE: Record<string, { accent: string; light: string }> = {
  green:   { accent: '#7E9B86', light: '#E4ECE6' },
  orange:  { accent: '#C17B4F', light: '#F4E3D6' },
  blue:    { accent: '#5B9BD5', light: '#dbeafe' },
  purple:  { accent: '#7C3AED', light: '#ede9fe' },
  teal:    { accent: '#0D9488', light: '#CCFBF1' },
  rose:    { accent: '#E11D48', light: '#FFE4E6' },
  amber:   { accent: '#D97706', light: '#FEF3C7' },
  slate:   { accent: '#475569', light: '#E2E8F0' },
  indigo:  { accent: '#4F46E5', light: '#EEF2FF' },
  lime:    { accent: '#65A30D', light: '#ECFCCB' },
};

export const COLOR_KEYS = ['green', 'orange', 'blue', 'purple', 'teal', 'rose', 'amber', 'slate', 'indigo', 'lime'] as const;

// A custom exercise has the same shape as a built-in one. We fill the
// search/media fields from the name so the video & image lookups still work.
export function makeCustomExercise(opts: {
  name: string;
  cue: string;
  sets?: string;
  cat: Exercise['cat'];
  origin?: Exercise['origin'];
  sourceId?: string;
  imageSearch?: string;
  tips?: string[];
  mainImageUrl?: string;
  mainImageUrls?: string[];
  mainVideoUrl?: string;
}): Exercise {
  const name = opts.name.trim();
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    cat: opts.cat.trim() || 'mobility',
    name,
    cue: opts.cue.trim(),
    sets: opts.sets?.trim() || undefined,
    videoIds: [],
    videoTitles: [],
    imageSearch: opts.imageSearch?.trim() || name,
    tips: opts.tips ?? [],
    origin: opts.origin ?? 'patient_added',
    sourceId: opts.sourceId,
    mainImageUrl: opts.mainImageUrl,
    mainImageUrls: opts.mainImageUrls,
    mainVideoUrl: opts.mainVideoUrl,
  };
}
