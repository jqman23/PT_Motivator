import 'server-only';

import { neon } from '@neondatabase/serverless';
import { AgentAction, AgentPreviewItem, MAX_AGENT_ACTIONS, normalizeAgentActions } from '@/lib/aiAgent';
import { EXERCISES, Exercise } from '@/lib/exercises';
import { CategoryConfig, COLOR_KEYS } from '@/lib/layout';

const sql = neon(process.env.DATABASE_URL!);

export const AGENT_CONFIG_KEYS = ['exerciseLibrary', 'layout', 'ptSessions', 'widgetPrefs', 'appTitle'] as const;

type AppAgentConfig = {
  exerciseLibrary: Exercise[];
  layout: CategoryConfig[];
  ptSessions: Array<{ date: string; kind?: 'pt' | 'training'; note?: string }>;
  widgetPrefs: Record<string, boolean>;
  appTitle: string;
};

type BulkMatchRow = { action_id: string; date: string };

export class AgentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentValidationError';
  }
}

function text(value: unknown, limit: number) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function defaultLayout(): CategoryConfig[] {
  return [
    { id: 'daily-mobility', name: 'Daily mobility & balance', color: 'green', exerciseIds: EXERCISES.filter(exercise => exercise.cat === 'mobility').map(exercise => exercise.id) },
    { id: 'strength-day', name: 'Strength day', color: 'orange', exerciseIds: EXERCISES.filter(exercise => exercise.cat === 'strength').map(exercise => exercise.id) },
  ];
}

function configKeysForActions(actions: AgentAction[]) {
  const keys = new Set<typeof AGENT_CONFIG_KEYS[number]>();
  for (const action of actions) {
    if ('exerciseId' in action && action.exerciseId) keys.add('exerciseLibrary');
    if (action.type === 'exercise_add' || action.type === 'exercise_update' || action.type === 'exercise_remove') keys.add('exerciseLibrary');
    if (action.type === 'exercise_add' || action.type === 'exercise_move' || action.type === 'exercise_remove' || action.type === 'category_upsert' || action.type === 'category_remove') keys.add('layout');
    if (action.type === 'pt_session_upsert' || action.type === 'pt_session_remove') keys.add('ptSessions');
    if (action.type === 'widget_set') keys.add('widgetPrefs');
    if (action.type === 'app_title_set') keys.add('appTitle');
  }
  return Array.from(keys);
}

export async function loadAgentConfig(actions: AgentAction[]): Promise<AppAgentConfig> {
  const keys = configKeysForActions(actions);
  const rows = keys.length ? await sql`
    SELECT key, value
    FROM user_config
    WHERE key IN (SELECT jsonb_array_elements_text(${JSON.stringify(keys)}::jsonb))
  ` : [];
  const values = Object.fromEntries(rows.map(row => [String(row.key), row.value]));
  return {
    exerciseLibrary: Array.isArray(values.exerciseLibrary) && values.exerciseLibrary.length ? values.exerciseLibrary as Exercise[] : EXERCISES,
    layout: Array.isArray(values.layout) && values.layout.length ? values.layout as CategoryConfig[] : defaultLayout(),
    ptSessions: Array.isArray(values.ptSessions) ? values.ptSessions as AppAgentConfig['ptSessions'] : [],
    widgetPrefs: values.widgetPrefs && typeof values.widgetPrefs === 'object' && !Array.isArray(values.widgetPrefs) ? values.widgetPrefs as Record<string, boolean> : {},
    appTitle: text(values.appTitle, 80) || 'PT Motivator',
  };
}

function actionTargetKey(action: AgentAction) {
  switch (action.type) {
    case 'completion_set': return `completion:${action.date}:${action.exerciseId}`;
    case 'health_change': return `health:${action.date}:${action.field}`;
    case 'metrics_set':
    case 'metrics_clear': return `metrics:${action.date}:${action.exerciseId}`;
    case 'exercise_update':
    case 'exercise_move':
    case 'exercise_remove': return `${action.type}:${action.exerciseId}`;
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

function removeConflictingActions(actions: AgentAction[]) {
  const lastIndexByTarget = new Map<string, number>();
  actions.forEach((action, index) => {
    const key = actionTargetKey(action);
    if (key) lastIndexByTarget.set(key, index);
  });
  return actions.filter((action, index) => {
    const key = actionTargetKey(action);
    return !key || lastIndexByTarget.get(key) === index;
  });
}

async function expandBulkActions(actions: AgentAction[]) {
  const bulk = actions.filter(action => action.type === 'bulk_completion_from_note');
  if (!bulk.length) return actions;
  const payload = bulk.map(action => ({
    action_id: action.id,
    field_name: action.field,
    phrase: action.phrase,
    start_date: action.startDate,
    end_date: action.endDate,
  }));
  const rows = await sql`
    WITH rules AS (
      SELECT action_id, field_name, phrase, start_date, end_date
      FROM jsonb_to_recordset(${JSON.stringify(payload)}::jsonb) AS rule(
        action_id TEXT,
        field_name TEXT,
        phrase TEXT,
        start_date DATE,
        end_date DATE
      )
    )
    SELECT rules.action_id, health_log.date::text
    FROM rules
    JOIN health_log ON health_log.date >= rules.start_date AND health_log.date <= rules.end_date
    WHERE STRPOS(LOWER(CASE rules.field_name
        WHEN 'general_notes' THEN COALESCE(health_log.general_notes, '')
        WHEN 'pain_notes' THEN COALESCE(health_log.pain_notes, '')
        WHEN 'treatment_notes' THEN COALESCE(health_log.treatment_notes, '')
        WHEN 'sleep_notes' THEN COALESCE(health_log.sleep_notes, '')
        WHEN 'sleep_quality_notes' THEN COALESCE(health_log.sleep_quality_notes, '')
        WHEN 'energy_notes' THEN COALESCE(health_log.energy_notes, '')
        WHEN 'mood_notes' THEN COALESCE(health_log.mood_notes, '')
        ELSE ''
      END), LOWER(rules.phrase)) > 0
    ORDER BY health_log.date, rules.action_id
    LIMIT ${MAX_AGENT_ACTIONS + 1}
  ` as BulkMatchRow[];
  if (rows.length > MAX_AGENT_ACTIONS) throw new AgentValidationError(`That bulk rule matches more than ${MAX_AGENT_ACTIONS} days. Use a narrower date range.`);
  const matches = new Map<string, string[]>();
  for (const row of rows) {
    const dates = matches.get(String(row.action_id)) ?? [];
    dates.push(String(row.date));
    matches.set(String(row.action_id), dates);
  }
  const expanded: AgentAction[] = [];
  for (const action of actions) {
    if (action.type !== 'bulk_completion_from_note') {
      expanded.push(action);
      continue;
    }
    for (const date of matches.get(action.id) ?? []) {
      expanded.push({
        id: `${action.id}-${date}`,
        type: 'completion_set',
        date,
        exerciseId: action.exerciseId,
        completed: action.completed,
        reason: `Matched “${action.phrase}” in ${action.field.replaceAll('_', ' ')}`,
      });
    }
  }
  if (expanded.length > MAX_AGENT_ACTIONS) throw new AgentValidationError(`This plan expands to more than ${MAX_AGENT_ACTIONS} changes. Use a narrower request.`);
  return expanded;
}

export async function validateAndExpandAgentActions(value: unknown) {
  const rawActions = normalizeAgentActions(value);
  if (!rawActions.length) throw new AgentValidationError('No valid app actions were proposed.');
  const config = await loadAgentConfig(rawActions);
  const exerciseIds = new Set(config.exerciseLibrary.map(exercise => exercise.id));
  const categoryById = new Map(config.layout.map(category => [category.id, category]));
  for (const action of rawActions) {
    if ('exerciseId' in action && action.exerciseId && !exerciseIds.has(action.exerciseId)) {
      throw new AgentValidationError(`Exercise ${action.exerciseId} no longer exists.`);
    }
    if (action.type === 'category_upsert' && action.categoryId && !categoryById.has(action.categoryId)) {
      throw new AgentValidationError('The category to update no longer exists.');
    }
    if (action.type === 'category_remove') {
      const category = categoryById.get(action.categoryId);
      if (!category) throw new AgentValidationError('The category to remove no longer exists.');
      if (category.exerciseIds.length > 0) throw new AgentValidationError('Move or remove every exercise before deleting that category.');
    }
  }
  const expanded = removeConflictingActions(await expandBulkActions(rawActions));
  if (!expanded.length) throw new AgentValidationError('No applicable changes were found.');
  if (expanded.filter(action => action.type === 'photo_attach').length > 1) {
    throw new AgentValidationError('Choose one photo destination at a time.');
  }
  const removedDoctorIds = new Set(expanded.flatMap(action => action.type === 'doctor_note_remove' ? [action.noteId] : []));
  if (expanded.some(action => action.type === 'photo_attach' && action.target === 'doctor_note' && removedDoctorIds.has(action.noteId!))) {
    throw new AgentValidationError('A plan cannot attach a photo to a doctor note it deletes.');
  }
  return { actions: expanded, config };
}

function displayDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
}

function exerciseName(id: string, config: AppAgentConfig) {
  return config.exerciseLibrary.find(exercise => exercise.id === id)?.name ?? id;
}

export function previewItemForAction(action: AgentAction, config: AppAgentConfig): AgentPreviewItem {
  const name = 'exerciseId' in action && action.exerciseId ? exerciseName(action.exerciseId, config) : '';
  switch (action.type) {
    case 'completion_set': return { actionId: action.id, title: `${action.completed ? 'Complete' : 'Uncheck'} ${name}`, detail: displayDate(action.date), risk: 'change' };
    case 'exercise_note_change': return { actionId: action.id, title: `${action.mode === 'append' ? 'Append to' : 'Replace'} ${name} note`, detail: `${displayDate(action.date)} · ${action.text || 'Clear note'}`, risk: action.mode === 'replace' ? 'destructive' : 'change' };
    case 'health_change': return { actionId: action.id, title: `${action.mode === 'append' ? 'Append to' : 'Set'} ${action.field.replaceAll('_', ' ')}`, detail: `${displayDate(action.date)} · ${action.value ?? 'Clear value'}`, risk: action.mode === 'replace' && typeof action.value === 'string' ? 'destructive' : 'change' };
    case 'metrics_set': return { actionId: action.id, title: `Update ${name} metrics`, detail: `${displayDate(action.date)} · ${action.sets} sets × ${action.reps ? `${action.reps} reps` : `${action.durationSeconds}s`}${action.weight !== null ? ` · ${action.weight} ${action.weightUnit}` : ''}`, risk: 'change' };
    case 'metrics_clear': return { actionId: action.id, title: `Clear ${name} metrics`, detail: displayDate(action.date), risk: 'destructive' };
    case 'exercise_add': return { actionId: action.id, title: `Add ${action.exercise.name}`, detail: action.categoryName || action.exercise.cat, risk: 'change' };
    case 'exercise_update': return { actionId: action.id, title: `Update ${name}`, detail: Object.keys(action.patch).join(', '), risk: 'change' };
    case 'exercise_move': return { actionId: action.id, title: `Move ${name}`, detail: `To ${action.categoryName}`, risk: 'change' };
    case 'exercise_remove': return { actionId: action.id, title: `Remove ${name}`, detail: 'Removes it from the library and categories', risk: 'destructive' };
    case 'category_upsert': return { actionId: action.id, title: action.categoryId ? `Rename or recolor ${action.name}` : `Add category ${action.name}`, detail: action.color || 'Use the next available color', risk: 'change' };
    case 'category_remove': return { actionId: action.id, title: 'Remove empty category', detail: config.layout.find(category => category.id === action.categoryId)?.name || action.categoryId, risk: 'destructive' };
    case 'doctor_note_upsert': return { actionId: action.id, title: `${action.mode === 'create' ? 'Create' : action.mode === 'append' ? 'Append to' : 'Update'} doctor note`, detail: action.patch.title || action.patch.body || action.noteId || '', risk: action.mode === 'update' ? 'change' : 'change' };
    case 'doctor_note_remove': return { actionId: action.id, title: 'Delete doctor note', detail: action.noteId, risk: 'destructive' };
    case 'pt_session_upsert': return { actionId: action.id, title: `Add or update ${action.kind === 'pt' ? 'PT' : 'training'} session`, detail: `${displayDate(action.date)}${action.note ? ` · ${action.note}` : ''}`, risk: 'change' };
    case 'pt_session_remove': return { actionId: action.id, title: `Remove ${action.kind === 'pt' ? 'PT' : 'training'} session`, detail: displayDate(action.date), risk: 'destructive' };
    case 'widget_set': return { actionId: action.id, title: `${action.enabled ? 'Show' : 'Hide'} ${action.key}`, detail: 'App control setting', risk: 'change' };
    case 'app_title_set': return { actionId: action.id, title: 'Change app title', detail: action.title, risk: 'change' };
    case 'photo_attach': return { actionId: action.id, title: 'Attach a selected photo', detail: action.target === 'exercise_note' ? `${name} · ${displayDate(action.date!)}` : action.target === 'health_general' ? displayDate(action.date!) : 'Doctor note', risk: 'change' };
    case 'navigate': return { actionId: action.id, title: `Open ${action.destination.replaceAll(/([A-Z])/g, ' $1').toLowerCase()}`, detail: action.date ? displayDate(action.date) : '', risk: 'navigation' };
    case 'bulk_completion_from_note': return { actionId: action.id, title: `Bulk update ${name}`, detail: `Match “${action.phrase}”`, risk: 'bulk' };
  }
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';
}

export function applyAgentConfigActions(config: AppAgentConfig, actions: AgentAction[]) {
  let library = config.exerciseLibrary.map(exercise => ({ ...exercise }));
  let layout = config.layout.map(category => ({ ...category, exerciseIds: [...category.exerciseIds] }));
  let ptSessions = config.ptSessions.map(session => ({ ...session }));
  const widgetPrefs = { ...config.widgetPrefs };
  let appTitle = config.appTitle;
  const changed = new Set<string>();

  const ensureCategory = (name: string) => {
    let index = layout.findIndex(category => category.name.toLowerCase() === name.toLowerCase());
    if (index >= 0) return index;
    index = layout.length;
    layout.push({ id: `cat-${slug(name)}-${Date.now()}-${index}`, name, color: COLOR_KEYS[index % COLOR_KEYS.length], exerciseIds: [] });
    changed.add('layout');
    return index;
  };

  for (const action of actions) {
    if (action.type === 'exercise_add') {
      const id = `ai-${Date.now()}-${slug(action.exercise.name)}-${action.id.slice(-8)}`;
      library.push({
        id,
        cat: action.exercise.cat,
        name: action.exercise.name,
        cue: action.exercise.cue,
        sets: action.exercise.sets || undefined,
        tips: action.exercise.tips ?? [],
        optional: action.exercise.optional,
        programs: action.exercise.programs,
        imageSearch: action.exercise.imageSearch || action.exercise.name,
        mainImageUrl: action.exercise.mainImageUrl,
        mainImageUrls: action.exercise.mainImageUrls,
        mainVideoUrl: action.exercise.mainVideoUrl,
        videoIds: [],
        videoTitles: [],
        origin: 'patient_added',
        sourceId: 'ai-agent',
      });
      const categoryIndex = ensureCategory(action.categoryName || layout[0]?.name || 'Exercises');
      layout[categoryIndex].exerciseIds.push(id);
      changed.add('exerciseLibrary');
      changed.add('layout');
    } else if (action.type === 'exercise_update') {
      library = library.map(exercise => exercise.id === action.exerciseId ? { ...exercise, ...action.patch } : exercise);
      changed.add('exerciseLibrary');
    } else if (action.type === 'exercise_move') {
      layout = layout.map(category => ({ ...category, exerciseIds: category.exerciseIds.filter(id => id !== action.exerciseId) }));
      const categoryIndex = ensureCategory(action.categoryName);
      layout[categoryIndex].exerciseIds.push(action.exerciseId);
      changed.add('layout');
    } else if (action.type === 'exercise_remove') {
      library = library.filter(exercise => exercise.id !== action.exerciseId);
      layout = layout.map(category => ({ ...category, exerciseIds: category.exerciseIds.filter(id => id !== action.exerciseId) }));
      changed.add('exerciseLibrary');
      changed.add('layout');
    } else if (action.type === 'category_upsert') {
      const existingIndex = action.categoryId ? layout.findIndex(category => category.id === action.categoryId) : -1;
      if (existingIndex >= 0) layout[existingIndex] = { ...layout[existingIndex], name: action.name, color: action.color || layout[existingIndex].color };
      else ensureCategory(action.name);
      changed.add('layout');
    } else if (action.type === 'category_remove') {
      layout = layout.filter(category => category.id !== action.categoryId || category.exerciseIds.length > 0);
      changed.add('layout');
    } else if (action.type === 'pt_session_upsert') {
      const index = ptSessions.findIndex(session => session.date === action.date && (session.kind || 'pt') === action.kind);
      const session = { date: action.date, kind: action.kind, note: action.note || '' };
      if (index >= 0) ptSessions[index] = session;
      else ptSessions.push(session);
      changed.add('ptSessions');
    } else if (action.type === 'pt_session_remove') {
      ptSessions = ptSessions.filter(session => !(session.date === action.date && (session.kind || 'pt') === action.kind));
      changed.add('ptSessions');
    } else if (action.type === 'widget_set') {
      widgetPrefs[action.key] = action.enabled;
      changed.add('widgetPrefs');
    } else if (action.type === 'app_title_set') {
      appTitle = action.title;
      changed.add('appTitle');
    }
  }

  return {
    changed: Array.from(changed),
    values: { exerciseLibrary: library, layout, ptSessions, widgetPrefs, appTitle },
  };
}
