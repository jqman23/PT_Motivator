export const AI_AGENT_VERSION = 1 as const;
export const MAX_AGENT_ACTIONS = 100;

export const HEALTH_FIELDS = [
  'sleep_hours',
  'sleep_quality',
  'energy',
  'mood',
  'pain',
  'sleep_notes',
  'sleep_quality_notes',
  'energy_notes',
  'mood_notes',
  'pain_notes',
  'general_notes',
  'treatment_notes',
] as const;

export type AgentHealthField = typeof HEALTH_FIELDS[number];
export type AgentNoteField = Extract<AgentHealthField, `${string}_notes`>;

export const WIDGET_KEYS = [
  'timer', 'library', 'aiCoach', 'info', 'manage', 'calendar', 'doctorNotes',
  'treatments', 'ptSessions', 'reporting', 'ptReport', 'dailySummary', 'masterDatabase',
] as const;

export type AgentWidgetKey = typeof WIDGET_KEYS[number];

export const NAVIGATION_DESTINATIONS = [
  'date', 'exercise', 'health', 'doctorNotes', 'doctorNote', 'settings', 'exerciseTypes',
  'library', 'calendar', 'ptSessions', 'treatments', 'progressReport', 'dataExport',
  'exerciseGuide', 'manageExercises', 'masterDatabase', 'timer', 'top',
] as const;

export type AgentNavigationDestination = typeof NAVIGATION_DESTINATIONS[number];

type AgentActionBase = {
  id: string;
  reason?: string;
};

export type AgentAction =
  | (AgentActionBase & { type: 'completion_set'; date: string; exerciseId: string; completed: boolean })
  | (AgentActionBase & { type: 'exercise_note_change'; date: string; exerciseId: string; mode: 'append' | 'replace'; text: string })
  | (AgentActionBase & { type: 'health_change'; date: string; field: AgentHealthField; mode: 'append' | 'replace'; value: string | number | null })
  | (AgentActionBase & { type: 'metrics_set'; date: string; exerciseId: string; sets: number; reps: number | null; durationSeconds: number | null; weight: number | null; weightUnit: 'lb' | 'kg'; scopeMultiplier: 1 | 2 | 4 })
  | (AgentActionBase & { type: 'metrics_clear'; date: string; exerciseId: string })
  | (AgentActionBase & { type: 'exercise_add'; exercise: AgentExerciseInput; categoryName?: string })
  | (AgentActionBase & { type: 'exercise_update'; exerciseId: string; patch: AgentExercisePatch })
  | (AgentActionBase & { type: 'exercise_move'; exerciseId: string; categoryName: string })
  | (AgentActionBase & { type: 'exercise_remove'; exerciseId: string })
  | (AgentActionBase & { type: 'category_upsert'; categoryId?: string; name: string; color?: string })
  | (AgentActionBase & { type: 'category_remove'; categoryId: string })
  | (AgentActionBase & { type: 'doctor_note_upsert'; noteId?: string; mode: 'create' | 'update' | 'append'; patch: AgentDoctorNotePatch })
  | (AgentActionBase & { type: 'doctor_note_remove'; noteId: string })
  | (AgentActionBase & { type: 'pt_session_upsert'; date: string; kind: 'pt' | 'training'; note?: string })
  | (AgentActionBase & { type: 'pt_session_remove'; date: string; kind: 'pt' | 'training' })
  | (AgentActionBase & { type: 'widget_set'; key: AgentWidgetKey; enabled: boolean })
  | (AgentActionBase & { type: 'app_title_set'; title: string })
  | (AgentActionBase & { type: 'photo_attach'; target: 'exercise_note' | 'health_general' | 'doctor_note'; date?: string; exerciseId?: string; noteId?: string })
  | (AgentActionBase & { type: 'bulk_completion_from_note'; exerciseId: string; phrase: string; field: AgentNoteField; startDate: string; endDate: string; completed: boolean })
  | (AgentActionBase & { type: 'navigate'; destination: AgentNavigationDestination; date?: string; exerciseId?: string; noteId?: string });

export type AgentExerciseInput = {
  name: string;
  cat: string;
  cue: string;
  sets?: string;
  tips?: string[];
  optional?: boolean;
  programs?: string[];
  imageSearch?: string;
  mainImageUrl?: string;
  mainImageUrls?: string[];
  mainVideoUrl?: string;
};

export type AgentExercisePatch = Partial<AgentExerciseInput>;

export type AgentDoctorNotePatch = {
  title?: string;
  kind?: string;
  provider?: string;
  referenceText?: string;
  body?: string;
  linkedDates?: string[];
  pinned?: boolean;
  noteColor?: 'none' | 'green' | 'orange' | 'blue' | 'purple';
};

export type AgentPlan = {
  version: typeof AI_AGENT_VERSION;
  summary: string;
  actions: AgentAction[];
};

export type AgentPreviewItem = {
  actionId: string;
  title: string;
  detail: string;
  risk: 'navigation' | 'change' | 'destructive' | 'bulk';
};

export type PreviewedAgentPlan = AgentPlan & {
  previewItems: AgentPreviewItem[];
  appliedRunId?: string;
  appliedAt?: string;
  appliedActionIds?: string[];
  undoneAt?: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const NUMERIC_HEALTH_FIELDS = new Set<AgentHealthField>(['sleep_hours', 'sleep_quality', 'energy', 'mood', 'pain']);
const HEALTH_FIELD_SET = new Set<string>(HEALTH_FIELDS);
const WIDGET_KEY_SET = new Set<string>(WIDGET_KEYS);
const NAVIGATION_SET = new Set<string>(NAVIGATION_DESTINATIONS);
const NOTE_FIELD_SET = new Set<string>(HEALTH_FIELDS.filter(field => field.endsWith('_notes')));
const NOTE_COLORS = new Set(['none', 'green', 'orange', 'blue', 'purple']);
const DOCTOR_NOTE_KINDS = new Set(['question', 'symptom', 'visit', 'result', 'plan']);
const CATEGORY_COLORS = new Set(['green', 'orange', 'blue', 'purple', 'teal', 'rose', 'amber', 'slate', 'indigo', 'lime']);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown, limit: number) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function multiline(value: unknown, limit: number) {
  return typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim().slice(0, limit) : '';
}

function date(value: unknown) {
  const clean = text(value, 10);
  if (!DATE_PATTERN.test(clean)) return '';
  const parsed = new Date(`${clean}T12:00:00`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== clean ? '' : clean;
}

function boundedNumber(value: unknown, min: number, max: number, decimals = 0): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const factor = 10 ** decimals;
  return Math.round(Math.max(min, Math.min(max, parsed)) * factor) / factor;
}

function stringList(value: unknown, limit: number, itemLimit: number) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(item => text(item, itemLimit)).filter(Boolean))).slice(0, limit);
}

function webUrl(value: unknown) {
  const clean = text(value, 1_000);
  if (!clean) return '';
  try {
    const parsed = new URL(clean);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function normalizeExerciseInput(value: unknown, partial = false): AgentExerciseInput | AgentExercisePatch | null {
  const raw = record(value);
  if (!raw) return null;
  const name = text(raw.name, 180);
  const cat = text(raw.cat ?? raw.type, 80).toLowerCase().replace(/[^a-z0-9 /&-]+/g, '').trim();
  const cue = multiline(raw.cue, 800);
  if (!partial && (!name || !cat || !cue)) return null;
  const result: AgentExercisePatch = {};
  if (name) result.name = name;
  if (cat) result.cat = cat;
  if (cue || Object.prototype.hasOwnProperty.call(raw, 'cue')) result.cue = cue;
  if (Object.prototype.hasOwnProperty.call(raw, 'sets')) result.sets = text(raw.sets, 180);
  if (Object.prototype.hasOwnProperty.call(raw, 'tips')) result.tips = stringList(raw.tips, 8, 300);
  if (typeof raw.optional === 'boolean') result.optional = raw.optional;
  if (Object.prototype.hasOwnProperty.call(raw, 'programs')) result.programs = stringList(raw.programs, 8, 80);
  if (Object.prototype.hasOwnProperty.call(raw, 'imageSearch')) result.imageSearch = text(raw.imageSearch, 200);
  if (Object.prototype.hasOwnProperty.call(raw, 'mainImageUrl')) result.mainImageUrl = webUrl(raw.mainImageUrl);
  if (Object.prototype.hasOwnProperty.call(raw, 'mainImageUrls')) result.mainImageUrls = stringList(raw.mainImageUrls, 8, 1_000).map(webUrl).filter(Boolean);
  if (Object.prototype.hasOwnProperty.call(raw, 'mainVideoUrl')) result.mainVideoUrl = webUrl(raw.mainVideoUrl);
  if (!partial) return result as AgentExerciseInput;
  return Object.keys(result).length ? result : null;
}

function normalizeDoctorPatch(value: unknown): AgentDoctorNotePatch | null {
  const raw = record(value);
  if (!raw) return null;
  const patch: AgentDoctorNotePatch = {};
  if (Object.prototype.hasOwnProperty.call(raw, 'title')) patch.title = text(raw.title, 180);
  if (Object.prototype.hasOwnProperty.call(raw, 'kind')) {
    const kind = text(raw.kind, 40);
    patch.kind = DOCTOR_NOTE_KINDS.has(kind) ? kind : 'question';
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'provider')) patch.provider = text(raw.provider, 180);
  if (Object.prototype.hasOwnProperty.call(raw, 'referenceText')) patch.referenceText = text(raw.referenceText, 300);
  if (Object.prototype.hasOwnProperty.call(raw, 'body')) patch.body = multiline(raw.body, 12_000);
  if (Object.prototype.hasOwnProperty.call(raw, 'linkedDates')) patch.linkedDates = stringList(raw.linkedDates, 20, 10).filter(item => date(item));
  if (typeof raw.pinned === 'boolean') patch.pinned = raw.pinned;
  const noteColor = text(raw.noteColor, 20);
  if (NOTE_COLORS.has(noteColor)) patch.noteColor = noteColor as AgentDoctorNotePatch['noteColor'];
  return Object.keys(patch).length ? patch : null;
}

function actionId(raw: Record<string, unknown>, index: number) {
  return text(raw.id, 80) || `action-${index + 1}`;
}

function reason(raw: Record<string, unknown>) {
  return text(raw.reason, 300) || undefined;
}

export function normalizeAgentActions(value: unknown): AgentAction[] {
  if (!Array.isArray(value)) return [];
  const actions: AgentAction[] = [];
  const seenIds = new Set<string>();

  for (let index = 0; index < value.length && actions.length < MAX_AGENT_ACTIONS; index += 1) {
    const raw = record(value[index]);
    if (!raw) continue;
    const type = text(raw.type, 60);
    let id = actionId(raw, index);
    while (seenIds.has(id)) id = `${id}-${index + 1}`;
    const base = { id, reason: reason(raw) };
    let action: AgentAction | null = null;

    if (type === 'completion_set') {
      const cleanDate = date(raw.date);
      const exerciseId = text(raw.exerciseId, 180);
      if (cleanDate && exerciseId && typeof raw.completed === 'boolean') action = { ...base, type, date: cleanDate, exerciseId, completed: raw.completed };
    } else if (type === 'exercise_note_change') {
      const cleanDate = date(raw.date);
      const exerciseId = text(raw.exerciseId, 180);
      const mode = raw.mode === 'replace' ? 'replace' : 'append';
      const noteText = multiline(raw.text, 8_000);
      if (cleanDate && exerciseId && (noteText || mode === 'replace')) action = { ...base, type, date: cleanDate, exerciseId, mode, text: noteText };
    } else if (type === 'health_change') {
      const cleanDate = date(raw.date);
      const field = text(raw.field, 40) as AgentHealthField;
      const mode = raw.mode === 'replace' ? 'replace' : 'append';
      if (cleanDate && HEALTH_FIELD_SET.has(field)) {
        const value = NUMERIC_HEALTH_FIELDS.has(field)
          ? boundedNumber(raw.value, field === 'sleep_hours' ? 0 : 0, field === 'sleep_hours' ? 24 : 10, 1)
          : multiline(raw.value, 8_000);
        if (!NUMERIC_HEALTH_FIELDS.has(field) || value !== null || raw.value === null) action = { ...base, type, date: cleanDate, field, mode: NUMERIC_HEALTH_FIELDS.has(field) ? 'replace' : mode, value };
      }
    } else if (type === 'metrics_set') {
      const cleanDate = date(raw.date);
      const exerciseId = text(raw.exerciseId, 180);
      const sets = boundedNumber(raw.sets, 1, 99);
      const reps = boundedNumber(raw.reps, 1, 9_999);
      const durationSeconds = boundedNumber(raw.durationSeconds, 1, 86_400);
      if (cleanDate && exerciseId && sets && Boolean(reps) !== Boolean(durationSeconds)) action = {
        ...base, type, date: cleanDate, exerciseId, sets, reps, durationSeconds,
        weight: boundedNumber(raw.weight, 0, 9_999.99, 2),
        weightUnit: raw.weightUnit === 'kg' ? 'kg' : 'lb',
        scopeMultiplier: raw.scopeMultiplier === 2 || raw.scopeMultiplier === 4 ? raw.scopeMultiplier : 1,
      };
    } else if (type === 'metrics_clear') {
      const cleanDate = date(raw.date);
      const exerciseId = text(raw.exerciseId, 180);
      if (cleanDate && exerciseId) action = { ...base, type, date: cleanDate, exerciseId };
    } else if (type === 'exercise_add') {
      const exercise = normalizeExerciseInput(raw.exercise);
      if (exercise) action = { ...base, type, exercise: exercise as AgentExerciseInput, categoryName: text(raw.categoryName, 120) || undefined };
    } else if (type === 'exercise_update') {
      const exerciseId = text(raw.exerciseId, 180);
      const patch = normalizeExerciseInput(raw.patch, true);
      if (exerciseId && patch) action = { ...base, type, exerciseId, patch };
    } else if (type === 'exercise_move') {
      const exerciseId = text(raw.exerciseId, 180);
      const categoryName = text(raw.categoryName, 120);
      if (exerciseId && categoryName) action = { ...base, type, exerciseId, categoryName };
    } else if (type === 'exercise_remove') {
      const exerciseId = text(raw.exerciseId, 180);
      if (exerciseId) action = { ...base, type, exerciseId };
    } else if (type === 'category_upsert') {
      const name = text(raw.name, 120);
      const color = text(raw.color, 30);
      if (name) action = { ...base, type, categoryId: text(raw.categoryId, 120) || undefined, name, color: CATEGORY_COLORS.has(color) ? color : undefined };
    } else if (type === 'category_remove') {
      const categoryId = text(raw.categoryId, 120);
      if (categoryId) action = { ...base, type, categoryId };
    } else if (type === 'doctor_note_upsert') {
      const mode = raw.mode === 'create' || raw.mode === 'append' ? raw.mode : 'update';
      const patch = normalizeDoctorPatch(raw.patch);
      const noteId = mode === 'create' ? undefined : text(raw.noteId, 100) || undefined;
      if (patch && (mode === 'create' || noteId)) action = { ...base, type, noteId, mode, patch };
    } else if (type === 'doctor_note_remove') {
      const noteId = text(raw.noteId, 100);
      if (noteId) action = { ...base, type, noteId };
    } else if (type === 'pt_session_upsert' || type === 'pt_session_remove') {
      const cleanDate = date(raw.date);
      const kind = raw.kind === 'training' ? 'training' : 'pt';
      if (cleanDate) action = type === 'pt_session_upsert'
        ? { ...base, type, date: cleanDate, kind, note: multiline(raw.note, 2_000) || undefined }
        : { ...base, type, date: cleanDate, kind };
    } else if (type === 'widget_set') {
      const key = text(raw.key, 40) as AgentWidgetKey;
      if (WIDGET_KEY_SET.has(key) && typeof raw.enabled === 'boolean') action = { ...base, type, key, enabled: raw.enabled };
    } else if (type === 'app_title_set') {
      const title = text(raw.title, 80);
      if (title) action = { ...base, type, title };
    } else if (type === 'photo_attach') {
      const target = raw.target === 'health_general' || raw.target === 'doctor_note' ? raw.target : 'exercise_note';
      const cleanDate = date(raw.date) || undefined;
      const exerciseId = text(raw.exerciseId, 180) || undefined;
      const noteId = text(raw.noteId, 100) || undefined;
      if ((target === 'exercise_note' && cleanDate && exerciseId) || (target === 'health_general' && cleanDate) || (target === 'doctor_note' && noteId)) action = { ...base, type, target, date: cleanDate, exerciseId, noteId };
    } else if (type === 'bulk_completion_from_note') {
      const exerciseId = text(raw.exerciseId, 180);
      const phrase = text(raw.phrase, 160);
      const field = text(raw.field, 40) as AgentNoteField;
      const startDate = date(raw.startDate);
      const endDate = date(raw.endDate);
      if (exerciseId && phrase.length >= 2 && NOTE_FIELD_SET.has(field) && startDate && endDate && startDate <= endDate && typeof raw.completed === 'boolean') action = { ...base, type, exerciseId, phrase, field, startDate, endDate, completed: raw.completed };
    } else if (type === 'navigate') {
      const destination = text(raw.destination ?? raw.target, 40) as AgentNavigationDestination;
      const cleanDate = date(raw.date) || undefined;
      const exerciseId = text(raw.exerciseId, 180) || undefined;
      const noteId = text(raw.noteId, 100) || undefined;
      const hasTarget = destination === 'date' ? Boolean(cleanDate)
        : destination === 'exercise' ? Boolean(exerciseId)
          : destination === 'doctorNote' ? Boolean(noteId)
            : true;
      if (NAVIGATION_SET.has(destination) && hasTarget) action = { ...base, type, destination, date: cleanDate, exerciseId, noteId };
    }

    if (action) {
      seenIds.add(action.id);
      actions.push(action);
    }
  }
  return actions;
}

export function normalizeAgentPlan(value: unknown): AgentPlan | undefined {
  const raw = record(value);
  if (!raw) return undefined;
  const actions = normalizeAgentActions(raw.actions);
  if (!actions.length) return undefined;
  return {
    version: AI_AGENT_VERSION,
    summary: text(raw.summary, 240) || 'Review the proposed app changes',
    actions,
  };
}

const FALLBACK_NAVIGATION_TARGETS = [
  { destination: 'doctorNotes', pattern: /\bdoctor(?:'s)? notes?\b/i, label: 'Doctor Notes' },
  { destination: 'exerciseTypes', pattern: /\bexercise types?\b/i, label: 'Exercise Types' },
  { destination: 'progressReport', pattern: /\b(?:progress|pt) reports?\b/i, label: 'Progress Report' },
  { destination: 'dataExport', pattern: /\bdata export\b|\bexport (?:my )?data\b/i, label: 'Data Export' },
  { destination: 'exerciseGuide', pattern: /\bexercise guides?\b/i, label: 'Exercise Guide' },
  { destination: 'manageExercises', pattern: /\bmanage exercises?\b/i, label: 'Manage Exercises' },
  { destination: 'masterDatabase', pattern: /\bmaster database\b/i, label: 'Master Database' },
  { destination: 'ptSessions', pattern: /\b(?:pt|physical therapy) sessions?\b/i, label: 'PT Sessions' },
  { destination: 'settings', pattern: /\bsettings?\b/i, label: 'Settings' },
  { destination: 'calendar', pattern: /\bcalendar\b/i, label: 'Calendar' },
  { destination: 'treatments', pattern: /\btreatments?\b/i, label: 'Treatments' },
  { destination: 'library', pattern: /\b(?:exercise )?library\b/i, label: 'Library' },
  { destination: 'timer', pattern: /\btimer\b/i, label: 'Timer' },
  { destination: 'health', pattern: /\bhealth(?: tracker)?\b/i, label: 'Health' },
] as const;

export function buildDeterministicAgentFallback(context: {
  question: string;
  today: string;
  selectedDate?: string | null;
  explicitDates?: string[];
}): AgentPlan | undefined {
  const { question, today, selectedDate, explicitDates = [] } = context;
  if (/\b(?:open|go to|take me to|bring me to|show me)\b/i.test(question)) {
    const target = FALLBACK_NAVIGATION_TARGETS.find(item => item.pattern.test(question));
    if (target) {
      return normalizeAgentPlan({
        version: 1,
        summary: `Open ${target.label}`,
        actions: [{ id: 'navigate-1', type: 'navigate', destination: target.destination, reason: `You asked to open ${target.label}.` }],
      });
    }
  }

  if (!/\b(?:set|record|log|change|update|put|save|track|mark)\b/i.test(question)) return undefined;
  const metric = question.match(/\b(sleep quality|sleep hours?|hours slept|pain|energy|mood)\b/i)?.[1]?.toLowerCase();
  if (!metric) return undefined;
  const metricPattern = metric.replace(/\s+/g, '\\s+');
  const afterMetric = question.match(new RegExp(`${metricPattern}[^0-9-]{0,32}(-?\\d+(?:\\.\\d+)?)`, 'i'))?.[1];
  const beforeMetric = question.match(new RegExp(`(-?\\d+(?:\\.\\d+)?)[^a-z0-9]{0,18}${metricPattern}`, 'i'))?.[1];
  const value = Number(afterMetric ?? beforeMetric);
  if (!Number.isFinite(value)) return undefined;

  const field = metric === 'sleep quality' ? 'sleep_quality'
    : metric === 'sleep hours' || metric === 'sleep hour' || metric === 'hours slept' ? 'sleep_hours'
      : metric;
  const actionDate = explicitDates.at(-1) ?? selectedDate ?? today;
  return normalizeAgentPlan({
    version: 1,
    summary: `Set ${metric} for ${actionDate}`,
    actions: [{ id: 'health-1', type: 'health_change', date: actionDate, field, mode: 'replace', value, reason: `You asked to record ${metric} as ${value}.` }],
  });
}

export function agentActionNeedsPhoto(action: AgentAction) {
  return action.type === 'photo_attach';
}

export function isAgentWriteAction(action: AgentAction) {
  return action.type !== 'navigate' && action.type !== 'bulk_completion_from_note';
}

export function redactAgentActions(actions: AgentAction[]) {
  return actions.map(action => ({ ...action }));
}
