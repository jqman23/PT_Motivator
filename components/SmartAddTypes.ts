export type SmartHealthChanges = Record<string, string | number | null | undefined>;

export type SmartExerciseChange = {
  id: string;
  completed?: boolean | null;
  note?: string | null;
  reason?: string;
};

export type SmartNewExercise = {
  name: string;
  categoryName?: string;
  sets?: string;
  cue?: string;
  note?: string;
  completed?: boolean | null;
  reason?: string;
};

export type SmartProposal = {
  summary: string[];
  exerciseChanges: SmartExerciseChange[];
  newExercises: SmartNewExercise[];
  healthChanges: SmartHealthChanges;
  questions: string[];
};
