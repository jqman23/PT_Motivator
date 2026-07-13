export type SmartHealthChanges = Record<string, string | number | null | undefined>;

export type SmartExerciseChange = {
  id: string;
  completed?: boolean | null;
  note?: string | null;
  reason?: string;
};

export type SmartDbMatch = {
  source: 'exercisedb' | 'api_ninjas';
  sourceId?: string;
  name: string;
  sets?: string;
  cue?: string;
  tips?: string[];
  label?: string;
};

export type SmartNewExercise = {
  name: string;
  categoryName?: string;
  type?: string;
  cat?: string;
  sets?: string;
  cue?: string;
  note?: string;
  completed?: boolean | null;
  reason?: string;
  origin?: 'patient_added' | 'exercisedb' | 'api_ninjas';
  sourceId?: string;
  mainImageUrl?: string;
  mainImageUrls?: string[];
  mainVideoUrl?: string;
  tips?: string[];
  dbMatches?: SmartDbMatch[];
};

export type SmartProposal = {
  summary: string[];
  exerciseChanges: SmartExerciseChange[];
  newExercises: SmartNewExercise[];
  healthChanges: SmartHealthChanges;
  questions: string[];
};
