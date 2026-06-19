export type SmartHealthChanges = Record<string, string | number | null | undefined>;

export type SmartExerciseChange = {
  id: string;
  completed?: boolean | null;
  note?: string | null;
  reason?: string;
};

export type SmartProposal = {
  summary: string[];
  exerciseChanges: SmartExerciseChange[];
  healthChanges: SmartHealthChanges;
  questions: string[];
};
