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

function joinedAppendText(previous: unknown, next: unknown) {
  const before = String(previous ?? '').trim();
  const addition = String(next ?? '').trim();
  if (!before) return addition;
  if (!addition || before.includes(addition)) return before;
  return `${before}\n${addition}`;
}

function conflictTarget(action: AgentAction) {
  switch (action.type) {
    case 'completion_set': return `completion:${action.date}:${action.exerciseId}`;
    case 'health_change': return `health:${action.date}:${action.field}`;
    case 'metrics_set':
    case 'metrics_clear': return `metrics:${action.date}:${action.exerciseId}`;
    case 'exercise_update': return `exercise-update:${action.exerciseId}`;
    case 'exercise_move': return `exercise-move:${action.exerciseId}`;
    case 'exercise_remove': return `exercise-remove:${action.exerciseId}`;
    case 'category_upsert': return `category:${action.categoryId || action.name.toLowerCase()}`;
    case 'category_remove': return `category:${action.categoryId}`;
    case 'doctor_note_upsert': return action.noteId ? `doctor:${action.noteId}` : '';
    case 'doctor_note_remove': return `doctor:${action.noteId}`;
    case 'pt_session_upsert':
    case 'pt_session_remove': return `session:${action.date}:${action.kind}`;
    case 'widget_set': return `widget:${action.key}`;
    case 'app_title_set': return 'app-title';
    default: return '';
  }
}

/**
 * Makes a multi-action plan deterministic without discarding compatible edits.
 * The user still sees the resulting actions in preview before anything is applied.
 */
export function coalesceAgentActions(actions: AgentAction[]) {
  const result: AgentAction[] = [];
  const indexByTarget = new Map<string, number>();

  for (const action of actions) {
    const target = conflictTarget(action);
    const existingIndex = target ? indexByTarget.get(target) : undefined;
    if (existingIndex === undefined) {
      if (target) indexByTarget.set(target, result.length);
      result.push(action);
      continue;
    }

    const previous = result[existingIndex];
    if (previous.type === 'exercise_update' && action.type === 'exercise_update') {
      result[existingIndex] = { ...action, patch: { ...previous.patch, ...action.patch } };
      continue;
    }
    if (previous.type === 'category_upsert' && action.type === 'category_upsert') {
      result[existingIndex] = { ...action, color: action.color ?? previous.color };
      continue;
    }
    if (previous.type === 'health_change' && action.type === 'health_change' && action.mode === 'append') {
      result[existingIndex] = {
        ...action,
        mode: previous.mode === 'replace' ? 'replace' : 'append',
        value: joinedAppendText(previous.value, action.value),
      };
      continue;
    }
    if (previous.type === 'doctor_note_upsert' && action.type === 'doctor_note_upsert') {
      const previousBody = previous.patch.body;
      const nextBody = action.patch.body;
      let mode = action.mode;
      let body = nextBody;
      if (nextBody === undefined && previousBody !== undefined) {
        body = previousBody;
        mode = previous.mode;
      } else if (nextBody !== undefined && action.mode === 'append' && previousBody !== undefined) {
        body = joinedAppendText(previousBody, nextBody);
        mode = previous.mode === 'append' ? 'append' : 'update';
      }
      result[existingIndex] = {
        ...action,
        mode,
        patch: { ...previous.patch, ...action.patch, ...(body === undefined ? {} : { body }) },
      };
      continue;
    }

    result[existingIndex] = action;
  }

  const removedExercises = new Set(result.flatMap(action => action.type === 'exercise_remove' ? [action.exerciseId] : []));
  return result.filter(action => (
    (action.type !== 'exercise_update' && action.type !== 'exercise_move') || !removedExercises.has(action.exerciseId)
  ));
}

export type AgentModelPlanContext = {
  question: string;
  today: string;
  selectedDate?: string | null;
  exercises?: Array<{ id: string; name: string }>;
  categories?: Array<{ id: string; name: string }>;
  doctorNotes?: Array<{ id: string; title?: string }>;
};

function modelKey(value: unknown) {
  return String(value ?? '').trim().replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function modelNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const match = String(value ?? '').match(/-?\d+(?:\.\d+)?/);
  const parsed = match ? Number(match[0]) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function modelBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  const key = modelKey(value);
  if (['true', 'yes', 'on', 'enable', 'enabled', 'show', 'shown', 'complete', 'completed', 'checked'].includes(key)) return true;
  if (['false', 'no', 'off', 'disable', 'disabled', 'hide', 'hidden', 'incomplete', 'unchecked'].includes(key)) return false;
  return undefined;
}

function shiftIsoDate(base: string, days: number) {
  const parsed = new Date(`${base}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function resolveModelDate(value: unknown, context: AgentModelPlanContext) {
  const exact = date(value);
  if (exact) return exact;
  const key = modelKey(value);
  if (!key || ['today', 'current', 'current_date', 'selected', 'selected_date', 'this_day'].includes(key)) return context.selectedDate || context.today;
  if (key === 'yesterday') return shiftIsoDate(context.today, -1);
  if (key === 'tomorrow') return shiftIsoDate(context.today, 1);
  const short = String(value ?? '').trim().match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (!short) return '';
  const year = short[3] ? Number(short[3].length === 2 ? `20${short[3]}` : short[3]) : Number(context.today.slice(0, 4));
  return date(`${year}-${String(Number(short[1])).padStart(2, '0')}-${String(Number(short[2])).padStart(2, '0')}`);
}

function resolveNamedId(value: unknown, items: Array<{ id: string; name?: string; title?: string }>) {
  const raw = typeof value === 'string' ? value.trim() : '';
  const nested = record(value);
  const candidate = raw || text(nested?.id ?? nested?.name ?? nested?.title, 180);
  if (!candidate) return '';
  const exactId = items.find(item => item.id === candidate);
  if (exactId) return exactId.id;
  const key = modelKey(candidate);
  const exactName = items.find(item => modelKey(item.name ?? item.title) === key);
  if (exactName) return exactName.id;
  const partial = items.filter(item => {
    const itemKey = modelKey(item.name ?? item.title);
    return key.length >= 4 && itemKey.length >= 4 && (itemKey.includes(key) || key.includes(itemKey));
  });
  return partial.length === 1 ? partial[0].id : '';
}

const MODEL_ACTION_TYPE_ALIASES: Record<string, AgentAction['type']> = {
  completion_set: 'completion_set', exercise_completion: 'completion_set', exercise_complete: 'completion_set', complete_exercise: 'completion_set', mark_complete: 'completion_set', check_off: 'completion_set', uncheck_exercise: 'completion_set',
  exercise_note_change: 'exercise_note_change', exercise_note: 'exercise_note_change', add_exercise_note: 'exercise_note_change', append_exercise_note: 'exercise_note_change', update_exercise_note: 'exercise_note_change', note_exercise: 'exercise_note_change',
  health_change: 'health_change', health_update: 'health_change', health_metric: 'health_change', health_metric_set: 'health_change', set_health_metric: 'health_change', add_health_note: 'health_change', update_health_note: 'health_change',
  metrics_set: 'metrics_set', exercise_metrics: 'metrics_set', exercise_metrics_set: 'metrics_set', set_metrics: 'metrics_set', update_metrics: 'metrics_set', log_metrics: 'metrics_set',
  metrics_clear: 'metrics_clear', clear_metrics: 'metrics_clear', remove_metrics: 'metrics_clear',
  exercise_add: 'exercise_add', add_exercise: 'exercise_add', create_exercise: 'exercise_add', new_exercise: 'exercise_add',
  exercise_update: 'exercise_update', update_exercise: 'exercise_update', edit_exercise: 'exercise_update', modify_exercise: 'exercise_update',
  exercise_move: 'exercise_move', move_exercise: 'exercise_move',
  exercise_remove: 'exercise_remove', remove_exercise: 'exercise_remove', delete_exercise: 'exercise_remove',
  category_upsert: 'category_upsert', add_category: 'category_upsert', create_category: 'category_upsert', update_category: 'category_upsert', rename_category: 'category_upsert',
  category_remove: 'category_remove', remove_category: 'category_remove', delete_category: 'category_remove',
  doctor_note_upsert: 'doctor_note_upsert', add_doctor_note: 'doctor_note_upsert', create_doctor_note: 'doctor_note_upsert', update_doctor_note: 'doctor_note_upsert', append_doctor_note: 'doctor_note_upsert', add_doctor_question: 'doctor_note_upsert',
  doctor_follow_up: 'doctor_note_upsert', add_doctor_follow_up: 'doctor_note_upsert', add_follow_up: 'doctor_note_upsert', append_follow_up: 'doctor_note_upsert',
  doctor_note_remove: 'doctor_note_remove', remove_doctor_note: 'doctor_note_remove', delete_doctor_note: 'doctor_note_remove',
  pt_session_upsert: 'pt_session_upsert', add_pt_session: 'pt_session_upsert', update_pt_session: 'pt_session_upsert', add_training_session: 'pt_session_upsert',
  pt_session_remove: 'pt_session_remove', remove_pt_session: 'pt_session_remove', delete_pt_session: 'pt_session_remove', remove_training_session: 'pt_session_remove',
  widget_set: 'widget_set', set_widget: 'widget_set', toggle_widget: 'widget_set', show_widget: 'widget_set', hide_widget: 'widget_set', enable_widget: 'widget_set', disable_widget: 'widget_set',
  app_title_set: 'app_title_set', set_app_title: 'app_title_set', change_app_title: 'app_title_set', rename_app: 'app_title_set',
  photo_attach: 'photo_attach', attach_photo: 'photo_attach', add_photo: 'photo_attach',
  bulk_completion_from_note: 'bulk_completion_from_note', bulk_completion: 'bulk_completion_from_note', complete_from_note: 'bulk_completion_from_note',
  navigate: 'navigate', navigation: 'navigate', navigate_to: 'navigate', open: 'navigate', open_screen: 'navigate',
};

const MODEL_HEALTH_FIELDS: Record<string, AgentHealthField> = {
  sleep: 'sleep_hours', sleep_hour: 'sleep_hours', sleep_hours: 'sleep_hours', hours_slept: 'sleep_hours',
  sleep_quality: 'sleep_quality', energy: 'energy', mood: 'mood', pain: 'pain', pain_score: 'pain',
  sleep_note: 'sleep_notes', sleep_notes: 'sleep_notes', sleep_quality_note: 'sleep_quality_notes', sleep_quality_notes: 'sleep_quality_notes',
  energy_note: 'energy_notes', energy_notes: 'energy_notes', mood_note: 'mood_notes', mood_notes: 'mood_notes', pain_note: 'pain_notes', pain_notes: 'pain_notes',
  general_note: 'general_notes', general_notes: 'general_notes', health_note: 'general_notes', treatment_note: 'treatment_notes', treatment_notes: 'treatment_notes',
};

const MODEL_WIDGET_KEYS: Record<string, AgentWidgetKey> = {
  timer: 'timer', library: 'library', exercise_library: 'library', ai: 'aiCoach', ai_coach: 'aiCoach', ask_ai: 'aiCoach',
  info: 'info', exercise_guide: 'info', manage: 'manage', manage_exercises: 'manage', calendar: 'calendar', doctor_notes: 'doctorNotes',
  treatments: 'treatments', meds: 'treatments', pt_sessions: 'ptSessions', reporting: 'reporting', progress_report: 'reporting',
  pt_report: 'ptReport', data_export: 'ptReport', daily_summary: 'dailySummary', master_database: 'masterDatabase',
};

const MODEL_NAVIGATION: Record<string, AgentNavigationDestination> = {
  date: 'date', day: 'date', exercise: 'exercise', exercise_note: 'exercise', health: 'health', health_tracker: 'health',
  doctor_notes: 'doctorNotes', doctor_note: 'doctorNote', settings: 'settings', widget_settings: 'settings', exercise_types: 'exerciseTypes',
  library: 'library', exercise_library: 'library', calendar: 'calendar', pt_sessions: 'ptSessions', treatments: 'treatments',
  progress_report: 'progressReport', reporting: 'progressReport', data_export: 'dataExport', pt_report: 'dataExport', exercise_guide: 'exerciseGuide',
  manage_exercises: 'manageExercises', master_database: 'masterDatabase', timer: 'timer', top: 'top', home: 'top',
};

function canonicalModelAction(value: unknown, index: number, context: AgentModelPlanContext): Record<string, unknown> | null {
  const outer = record(value);
  if (!outer) return null;
  const nested = record(outer.parameters) ?? record(outer.params) ?? record(outer.payload) ?? record(outer.data) ?? record(outer.details) ?? {};
  const raw = { ...nested, ...outer };
  const rawType = modelKey(raw.type ?? raw.actionType ?? raw.action_type ?? raw.operation ?? raw.action);
  const type = MODEL_ACTION_TYPE_ALIASES[rawType];
  if (!type) return null;
  const id = text(raw.id ?? raw.actionId ?? raw.action_id, 80) || `action-${index + 1}`;
  const reason = text(raw.reason ?? raw.explanation, 300) || undefined;
  const actionDate = resolveModelDate(raw.date ?? raw.day ?? raw.targetDate ?? raw.target_date, context);
  const exerciseId = resolveNamedId(
    raw.exerciseId ?? raw.exercise_id ?? raw.exerciseName ?? raw.exercise_name ?? raw.targetExercise ?? raw.target_exercise ?? (typeof raw.exercise === 'string' ? raw.exercise : record(raw.exercise)?.id ?? record(raw.exercise)?.name),
    context.exercises ?? [],
  );
  const base = { id, type, reason };

  if (type === 'completion_set') {
    const explicit = modelBoolean(raw.completed ?? raw.complete ?? raw.checked ?? raw.value ?? raw.status);
    const completed = explicit ?? !/uncheck|incomplete|undo|remove/.test(rawType);
    return { ...base, date: actionDate, exerciseId, completed };
  }
  if (type === 'exercise_note_change') return {
    ...base, date: actionDate, exerciseId,
    mode: /replace|rewrite|clear|overwrite/.test(modelKey(raw.mode ?? raw.operation)) ? 'replace' : 'append',
    text: multiline(raw.text ?? raw.note ?? raw.value ?? raw.content, 8_000),
  };
  if (type === 'health_change') {
    const field = MODEL_HEALTH_FIELDS[modelKey(raw.field ?? raw.metric ?? raw.healthField ?? raw.health_field ?? raw.target)] ?? modelKey(raw.field) as AgentHealthField;
    return {
      ...base, date: actionDate, field,
      mode: /replace|rewrite|clear|overwrite|set/.test(modelKey(raw.mode ?? raw.operation)) ? 'replace' : 'append',
      value: raw.value ?? raw.score ?? raw.text ?? raw.note ?? raw.content ?? null,
    };
  }
  if (type === 'metrics_set') {
    let durationSeconds = modelNumber(raw.durationSeconds ?? raw.duration_seconds ?? raw.seconds ?? raw.duration);
    if (durationSeconds !== null && /min/.test(String(raw.duration ?? raw.durationMinutes ?? raw.duration_minutes ?? ''))) durationSeconds *= 60;
    if (raw.durationMinutes !== undefined || raw.duration_minutes !== undefined) durationSeconds = (modelNumber(raw.durationMinutes ?? raw.duration_minutes) ?? 0) * 60;
    const scope = modelNumber(raw.scopeMultiplier ?? raw.scope_multiplier ?? raw.scope ?? raw.multiplier);
    return {
      ...base, date: actionDate, exerciseId,
      sets: modelNumber(raw.sets ?? raw.setsCount ?? raw.sets_count),
      reps: modelNumber(raw.reps ?? raw.repsCount ?? raw.reps_count),
      durationSeconds,
      weight: modelNumber(raw.weight ?? raw.weightValue ?? raw.weight_value),
      weightUnit: /kg|kilo/.test(modelKey(raw.weightUnit ?? raw.weight_unit ?? raw.unit)) ? 'kg' : 'lb',
      scopeMultiplier: scope === 2 || scope === 4 ? scope : 1,
    };
  }
  if (type === 'metrics_clear') return { ...base, date: actionDate, exerciseId };
  if (type === 'exercise_add') {
    const supplied = record(raw.exercise) ?? record(raw.newExercise) ?? record(raw.new_exercise) ?? raw;
    return {
      ...base,
      exercise: {
        name: supplied.name ?? supplied.exerciseName ?? supplied.exercise_name,
        cat: supplied.cat ?? supplied.category ?? supplied.type,
        cue: supplied.cue ?? supplied.description ?? supplied.instructions,
        sets: supplied.sets ?? supplied.dosage,
        tips: supplied.tips ?? supplied.steps,
        optional: supplied.optional,
        programs: supplied.programs,
        imageSearch: supplied.imageSearch ?? supplied.image_search,
        mainImageUrl: supplied.mainImageUrl ?? supplied.main_image_url,
        mainImageUrls: supplied.mainImageUrls ?? supplied.main_image_urls,
        mainVideoUrl: supplied.mainVideoUrl ?? supplied.main_video_url,
      },
      categoryName: raw.categoryName ?? raw.category_name ?? raw.category,
    };
  }
  if (type === 'exercise_update') {
    const patch = record(raw.patch) ?? record(raw.changes) ?? record(raw.updates) ?? raw;
    return { ...base, exerciseId, patch };
  }
  if (type === 'exercise_move') return { ...base, exerciseId, categoryName: raw.categoryName ?? raw.category_name ?? raw.category ?? raw.destination };
  if (type === 'exercise_remove') return { ...base, exerciseId };
  if (type === 'category_upsert') {
    const requestedName = raw.newName ?? raw.new_name ?? raw.name ?? raw.categoryName ?? raw.category_name ?? raw.category;
    const existingReference = raw.categoryId ?? raw.category_id ?? raw.existingCategory ?? raw.existing_category
      ?? raw.currentName ?? raw.current_name ?? raw.oldName ?? raw.old_name
      ?? ((raw.newName !== undefined || raw.new_name !== undefined) ? raw.category ?? raw.name ?? raw.categoryName ?? raw.category_name : raw.category);
    const categoryId = resolveNamedId(existingReference, context.categories ?? []);
    const existingName = context.categories?.find(category => category.id === categoryId)?.name;
    return { ...base, categoryId: categoryId || undefined, name: requestedName ?? existingName, color: raw.color };
  }
  if (type === 'category_remove') return { ...base, categoryId: resolveNamedId(raw.categoryId ?? raw.category_id ?? raw.name ?? raw.categoryName ?? raw.category, context.categories ?? []) };
  if (type === 'doctor_note_upsert') {
    const noteId = resolveNamedId(raw.noteId ?? raw.note_id ?? raw.doctorNoteId ?? raw.doctor_note_id ?? raw.noteTitle ?? raw.note_title, context.doctorNotes ?? []);
    const patchRaw = record(raw.patch) ?? record(raw.note) ?? {};
    const patch = Object.fromEntries(Object.entries({
      title: patchRaw.title ?? raw.title,
      kind: patchRaw.kind ?? raw.kind ?? (/question/.test(rawType) ? 'question' : undefined),
      provider: patchRaw.provider ?? raw.provider,
      referenceText: patchRaw.referenceText ?? patchRaw.reference_text ?? raw.referenceText ?? raw.reference_text,
      body: patchRaw.body ?? patchRaw.content ?? patchRaw.text ?? raw.body ?? raw.content ?? raw.text ?? raw.question ?? raw.followUp ?? raw.follow_up ?? raw.answer ?? raw.nextSteps ?? raw.next_steps,
      linkedDates: patchRaw.linkedDates ?? patchRaw.linked_dates ?? raw.linkedDates ?? raw.linked_dates,
      pinned: patchRaw.pinned ?? raw.pinned,
      noteColor: patchRaw.noteColor ?? patchRaw.note_color ?? raw.noteColor ?? raw.note_color,
    }).filter(([, item]) => item !== undefined));
    const mode = /append|follow_up/.test(rawType) || modelKey(raw.mode) === 'append' ? 'append' : noteId ? 'update' : 'create';
    return { ...base, noteId: noteId || undefined, mode, patch };
  }
  if (type === 'doctor_note_remove') return { ...base, noteId: resolveNamedId(raw.noteId ?? raw.note_id ?? raw.title ?? raw.noteTitle, context.doctorNotes ?? []) };
  if (type === 'pt_session_upsert' || type === 'pt_session_remove') return {
    ...base, date: actionDate,
    kind: /training/.test(rawType) || modelKey(raw.kind ?? raw.sessionType ?? raw.session_type) === 'training' ? 'training' : 'pt',
    note: raw.note ?? raw.text ?? raw.content,
  };
  if (type === 'widget_set') {
    const key = MODEL_WIDGET_KEYS[modelKey(raw.key ?? raw.widget ?? raw.name ?? raw.target)];
    const enabled = modelBoolean(raw.enabled ?? raw.value ?? raw.visible ?? raw.state) ?? !/hide|disable|off/.test(rawType);
    return { ...base, key, enabled };
  }
  if (type === 'app_title_set') return { ...base, title: raw.title ?? raw.value ?? raw.name ?? raw.appTitle ?? raw.app_title };
  if (type === 'photo_attach') {
    const targetKey = modelKey(raw.target ?? raw.destination ?? raw.noteType ?? raw.note_type);
    const target = /doctor/.test(targetKey) ? 'doctor_note' : /health|general/.test(targetKey) ? 'health_general' : 'exercise_note';
    const noteId = resolveNamedId(raw.noteId ?? raw.note_id ?? raw.doctorNoteId ?? raw.doctor_note_id, context.doctorNotes ?? []);
    return { ...base, target, date: actionDate, exerciseId: exerciseId || undefined, noteId: noteId || undefined };
  }
  if (type === 'bulk_completion_from_note') return {
    ...base, exerciseId,
    phrase: raw.phrase ?? raw.match ?? raw.contains ?? raw.text,
    field: MODEL_HEALTH_FIELDS[modelKey(raw.field ?? raw.noteField ?? raw.note_field)] ?? raw.field,
    startDate: resolveModelDate(raw.startDate ?? raw.start_date, context),
    endDate: resolveModelDate(raw.endDate ?? raw.end_date, context),
    completed: modelBoolean(raw.completed ?? raw.value) ?? true,
  };
  if (type === 'navigate') {
    const destination = MODEL_NAVIGATION[modelKey(raw.destination ?? raw.target ?? raw.screen ?? raw.page)];
    const noteId = resolveNamedId(raw.noteId ?? raw.note_id, context.doctorNotes ?? []);
    return { ...base, destination, date: actionDate, exerciseId: exerciseId || undefined, noteId: noteId || undefined };
  }
  return null;
}

export function normalizeModelAgentPlan(value: unknown, context: AgentModelPlanContext): AgentPlan | undefined {
  const outer = record(value);
  if (!outer) return undefined;
  const plan = record(outer.agentPlan) ?? record(outer.agent_plan) ?? record(outer.plan) ?? outer;
  let actionValues = Array.isArray(plan.actions) ? plan.actions
    : Array.isArray(plan.proposedActions) ? plan.proposedActions
      : Array.isArray(plan.proposed_actions) ? plan.proposed_actions
        : record(plan.action) ? [plan.action]
          : [];
  const confirmedExercise = record(outer.confirmedExercise) ?? record(outer.confirmed_exercise);
  if (!actionValues.length && confirmedExercise && /\b(?:add|create|make|build)\b.{0,36}\bexercise\b/i.test(context.question)) {
    actionValues = [{ type: 'exercise_add', exercise: confirmedExercise }];
  }
  const actions = actionValues.map((action, index) => canonicalModelAction(action, index, context)).filter(Boolean);
  return normalizeAgentPlan({
    summary: plan.summary ?? plan.title ?? plan.description,
    actions,
  });
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
  exercises?: Array<{ id: string; name: string }>;
  doctorNotes?: Array<{ id: string; title?: string }>;
  priorUserMessages?: string[];
}): AgentPlan | undefined {
  const { question, today, selectedDate, explicitDates = [], exercises = [], doctorNotes = [], priorUserMessages = [] } = context;
  const shortApproval = /^(?:yes[,.! ]*)?(?:do it|do that|go ahead|apply (?:it|that|those)|make (?:it|that) happen|proceed|yes please)\b/i.test(question.trim());
  const instructionQuestion = shortApproval && priorUserMessages.length ? priorUserMessages.at(-1)! : question;
  if (/\b(?:open|go to|take me to|bring me to|show me)\b/i.test(instructionQuestion)) {
    const target = FALLBACK_NAVIGATION_TARGETS.find(item => item.pattern.test(instructionQuestion));
    if (target) {
      return normalizeAgentPlan({
        version: 1,
        summary: `Open ${target.label}`,
        actions: [{ id: 'navigate-1', type: 'navigate', destination: target.destination, reason: `You asked to open ${target.label}.` }],
      });
    }
  }

  const normalizedQuestion = instructionQuestion.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const exercise = [...exercises]
    .filter(item => item.id && item.name && normalizedQuestion.includes(item.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (exercise) {
    const notePattern = /\b(?:add|append|save|record|write|make)\s+(?:a\s+)?note(?:\s+(?:to|for)\s+.{1,180}?)?\s*(?:(?:that|saying|reading)\s+|:\s*)["“]?(.+?)["”]?[.!?]*$/i;
    const noteMatch = instructionQuestion.match(notePattern);
    const beforeNote = noteMatch?.index === undefined ? instructionQuestion : instructionQuestion.slice(0, noteMatch.index);
    const completionRequested = /\bcheck(?:ed)?\s+(?:it\s+)?off\b|\bmark(?:ed)?\b.{0,28}\b(?:complete|completed|done)\b|\b(?:i|we)\s+(?:did|completed|finished|performed)\b/i.test(beforeNote);
    const currentNoteText = noteMatch?.[1]?.trim().replace(/[.!?]+$/, '').slice(0, 8_000) ?? '';
    const priorNoteText = priorUserMessages.toReversed().flatMap(message => {
      const normalizedMessage = message.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!normalizedMessage.includes(exercise.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())) return [];
      const match = message.match(notePattern);
      return match?.[1] ? [match[1].trim().replace(/[.!?]+$/, '').slice(0, 8_000)] : [];
    })[0] ?? '';
    const asksForNote = /\b(?:add|append|save|record|write|make)\s+(?:a\s+)?note\b/i.test(instructionQuestion);
    const noteText = currentNoteText || (asksForNote ? priorNoteText : '');
    const metricsClearRequested = /\b(?:clear|remove|reset|delete)\b.{0,32}\b(?:metrics?|sets?|reps?|weight|duration)\b/i.test(instructionQuestion);
    const setsValue = modelNumber(instructionQuestion.match(/\b(\d+)\s*sets?\b/i)?.[1] ?? instructionQuestion.match(/\b(\d+)\s*[x×]\s*\d+\b/i)?.[1]);
    const repsValue = modelNumber(instructionQuestion.match(/\b(\d+)\s*reps?\b/i)?.[1] ?? instructionQuestion.match(/\b\d+\s*sets?\s+(?:of\s+)?(\d+)\b/i)?.[1] ?? instructionQuestion.match(/\b\d+\s*[x×]\s*(\d+)\b/i)?.[1]);
    const durationMatch = instructionQuestion.match(/\b(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?)\b/i);
    const durationSeconds = durationMatch ? Number(durationMatch[1]) * (/min/i.test(durationMatch[2]) ? 60 : 1) : null;
    const weightMatch = instructionQuestion.match(/\b(\d+(?:\.\d+)?)\s*(lb|lbs|pounds?|kg|kgs|kilograms?)\b/i);
    const scopeMatch = instructionQuestion.match(/\b(?:x|times?)\s*([124])\b/i);
    const hasMetricValues = Boolean(repsValue) !== Boolean(durationSeconds);
    if (completionRequested || noteText || metricsClearRequested || hasMetricValues) {
      const actionDate = explicitDates.at(-1) ?? selectedDate ?? today;
      const actions: Array<Record<string, unknown>> = [];
      if (completionRequested) actions.push({
        id: 'completion-1',
        type: 'completion_set',
        date: actionDate,
        exerciseId: exercise.id,
        completed: true,
        reason: `You asked to mark ${exercise.name} complete.`,
      });
      if (noteText) actions.push({
        id: 'exercise-note-1',
        type: 'exercise_note_change',
        date: actionDate,
        exerciseId: exercise.id,
        mode: 'append',
        text: noteText,
        reason: `You asked to add a note to ${exercise.name}.`,
      });
      if (metricsClearRequested) actions.push({
        id: 'metrics-clear-1',
        type: 'metrics_clear',
        date: actionDate,
        exerciseId: exercise.id,
        reason: `You asked to clear ${exercise.name} metrics.`,
      });
      else if (hasMetricValues) actions.push({
        id: 'metrics-1',
        type: 'metrics_set',
        date: actionDate,
        exerciseId: exercise.id,
        sets: setsValue ?? 1,
        reps: repsValue,
        durationSeconds,
        weight: weightMatch ? Number(weightMatch[1]) : null,
        weightUnit: weightMatch && /kg/i.test(weightMatch[2]) ? 'kg' : 'lb',
        scopeMultiplier: scopeMatch?.[1] === '2' ? 2 : scopeMatch?.[1] === '4' ? 4 : 1,
        reason: `You asked to update ${exercise.name} metrics.`,
      });
      return normalizeAgentPlan({
        version: 1,
        summary: `${actions.length === 1 ? 'Prepare 1 update' : `Prepare ${actions.length} updates`} for ${exercise.name} on ${actionDate}`,
        actions,
      });
    }
  }

  const normalizedInstruction = instructionQuestion.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const doctorNote = [...doctorNotes]
    .filter(item => item.id && item.title && normalizedInstruction.includes(item.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()))
    .sort((a, b) => (b.title?.length ?? 0) - (a.title?.length ?? 0))[0];
  if (doctorNote && /\b(?:add|append|record|save|write|update)\b.{0,24}\b(?:follow[- ]?up|response|next steps?|note)\b/i.test(instructionQuestion)) {
    const followUpText = instructionQuestion.match(/\b(?:follow[- ]?up|response|next steps?|note)\b[\s\S]*?\b(?:that|saying|reading|as)\b\s*["“]?(.+?)["”]?[.!?]*$/i)?.[1]?.trim()
      ?? instructionQuestion.match(/:\s*["“]?(.+?)["”]?[.!?]*$/)?.[1]?.trim()
      ?? '';
    if (followUpText) return normalizeAgentPlan({
      version: 1,
      summary: `Append a follow-up to ${doctorNote.title || 'doctor note'}`,
      actions: [{
        id: 'doctor-follow-up-1', type: 'doctor_note_upsert', noteId: doctorNote.id, mode: 'append',
        patch: { body: followUpText }, reason: `You asked to append a follow-up to ${doctorNote.title || 'this doctor note'}.`,
      }],
    });
  }

  const doctorQuestionMatch = instructionQuestion.match(/\b(?:ask|remind me to ask)\s+(?:my\s+)?(doctor|pt|provider)\s+(.+?)[.!?]*$/i);
  if (doctorQuestionMatch) {
    const provider = doctorQuestionMatch[1].toUpperCase() === 'PT' ? 'PT' : doctorQuestionMatch[1];
    const questionText = doctorQuestionMatch[2].trim().replace(/[.!?]+$/, '');
    if (questionText) return normalizeAgentPlan({
      version: 1,
      summary: `Add a question for ${provider}`,
      actions: [{
        id: 'doctor-question-1', type: 'doctor_note_upsert', mode: 'create',
        patch: { kind: 'question', title: `Question for ${provider}`, provider, body: `Ask ${questionText}` },
        reason: `You asked to save a question for ${provider}.`,
      }],
    });
  }

  const sessionKind = /\btraining(?: session| appointment)?\b/i.test(instructionQuestion) ? 'training'
    : /\b(?:pt|physical therapy)(?: session| appointment)?\b/i.test(instructionQuestion) ? 'pt'
      : null;
  const sessionRequested = sessionKind && (/\b(?:add|schedule|log|record|mark|save|update|remove|delete|cancel|unmark)\b/i.test(instructionQuestion)
    || /\b(?:i (?:have|had)|there(?:'s| is)|my)\s+(?:a\s+)?(?:pt|physical therapy|training)\b/i.test(instructionQuestion));
  if (sessionKind && sessionRequested) {
    const actionDate = explicitDates.at(-1) ?? selectedDate ?? today;
    const removing = /\b(?:remove|delete|cancel|unmark)\b/i.test(instructionQuestion);
    const sessionNote = instructionQuestion.match(/\b(?:with|add|include)\s+(?:a\s+)?note\s*(?:(?:that|saying|reading)\s+|:\s*)["“]?(.+?)["”]?[.!?]*$/i)?.[1]?.trim();
    return normalizeAgentPlan({
      version: 1,
      summary: `${removing ? 'Remove' : 'Add or update'} ${sessionKind === 'pt' ? 'PT' : 'training'} session for ${actionDate}`,
      actions: [{
        id: 'session-1',
        type: removing ? 'pt_session_remove' : 'pt_session_upsert',
        date: actionDate,
        kind: sessionKind,
        note: removing ? undefined : sessionNote,
        reason: `You asked to ${removing ? 'remove' : 'record'} this ${sessionKind === 'pt' ? 'PT' : 'training'} session.`,
      }],
    });
  }

  const healthNoteMatch = instructionQuestion.match(/\b(pain|general|health|treatment|sleep quality|sleep|energy|mood)\s+notes?\b/i);
  if (healthNoteMatch && /\b(?:add|append|record|write|save|update|change|replace|rewrite|clear|overwrite)\b/i.test(instructionQuestion)) {
    const key = healthNoteMatch[1].toLowerCase();
    const field = key === 'pain' ? 'pain_notes'
      : key === 'treatment' ? 'treatment_notes'
        : key === 'sleep quality' ? 'sleep_quality_notes'
          : key === 'sleep' ? 'sleep_notes'
            : key === 'energy' ? 'energy_notes'
              : key === 'mood' ? 'mood_notes'
                : 'general_notes';
    const afterField = instructionQuestion.slice((healthNoteMatch.index ?? 0) + healthNoteMatch[0].length)
      .replace(/^\s*(?:to|with|that|saying|reading|as|:|-)+\s*/i, '')
      .trim()
      .replace(/[.!?]+$/, '');
    const replacing = /\b(?:replace|rewrite|clear|overwrite)\b/i.test(instructionQuestion);
    if (afterField || replacing) {
      const actionDate = explicitDates.at(-1) ?? selectedDate ?? today;
      return normalizeAgentPlan({
        version: 1,
        summary: `${replacing ? 'Replace' : 'Append to'} ${key} note for ${actionDate}`,
        actions: [{
          id: 'health-note-1', type: 'health_change', date: actionDate, field,
          mode: replacing ? 'replace' : 'append', value: replacing && /\bclear\b/i.test(instructionQuestion) ? '' : afterField,
          reason: `You asked to ${replacing ? 'replace' : 'append to'} the ${key} note.`,
        }],
      });
    }
  }

  const directMetricStatement = /\b(?:pain|energy|mood|sleep quality)\b\s*(?:is|was|at|=)\s*\d+(?:\.\d+)?\b|\bi slept\s+\d+(?:\.\d+)?\b/i.test(instructionQuestion);
  if (!directMetricStatement && !/\b(?:set|record|log|change|update|put|save|track|mark)\b/i.test(instructionQuestion)) return undefined;
  const metric = instructionQuestion.match(/\b(sleep quality|sleep hours?|hours slept|slept|pain|energy|mood)\b/i)?.[1]?.toLowerCase();
  if (!metric) return undefined;
  const metricPattern = metric.replace(/\s+/g, '\\s+');
  const afterMetric = instructionQuestion.match(new RegExp(`${metricPattern}[^0-9-]{0,32}(-?\\d+(?:\\.\\d+)?)`, 'i'))?.[1];
  const beforeMetric = instructionQuestion.match(new RegExp(`(-?\\d+(?:\\.\\d+)?)[^a-z0-9]{0,18}${metricPattern}`, 'i'))?.[1];
  const value = Number(afterMetric ?? beforeMetric);
  if (!Number.isFinite(value)) return undefined;

  const field = metric === 'sleep quality' ? 'sleep_quality'
    : metric === 'sleep hours' || metric === 'sleep hour' || metric === 'hours slept' || metric === 'slept' ? 'sleep_hours'
      : metric;
  const metricLabel = field === 'sleep_hours' ? 'sleep hours' : metric;
  const actionDate = explicitDates.at(-1) ?? selectedDate ?? today;
  return normalizeAgentPlan({
    version: 1,
    summary: `Set ${metricLabel} for ${actionDate}`,
    actions: [{ id: 'health-1', type: 'health_change', date: actionDate, field, mode: 'replace', value, reason: `You asked to record ${metricLabel} as ${value}.` }],
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
