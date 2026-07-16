import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { AgentAction, redactAgentActions } from '@/lib/aiAgent';
import { AgentValidationError, applyAgentConfigActions, validateAndExpandAgentActions } from '@/lib/aiAgentServer';
import { domainCommandsForAgentActions } from '@/lib/domainCommands';

const sql = neon(process.env.DATABASE_URL!);
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{12,100}$/;
const MAX_PHOTO_DATA_URL_LENGTH = 2_000_000;

type PhotoAttachment = { id: string; name: string; type: string; dataUrl: string; createdAt: string; note: string };
type Row = Record<string, unknown>;

type UndoPayload = {
  logs: Array<{ date: string; exerciseId: string; existed: boolean; completed: boolean }>;
  notes: Array<{ date: string; exerciseId: string; existed: boolean; note?: string; restoreNote: boolean; removePhotoIds: string[] }>;
  health: Array<{ date: string; existed: boolean; fields: Record<string, unknown>; removePhotoIds: string[] }>;
  metrics: Array<{ date: string; exerciseId: string; existed: boolean; row?: Record<string, unknown> }>;
  doctorNotes: Array<{ noteId: string; existed: boolean; fields: Record<string, unknown>; restoreDeleted?: boolean; removePhotoIds: string[] }>;
  configs: Array<{ key: string; value: unknown }>;
  chat?: { sessionId: string; messageId: string };
};

const HEALTH_COLUMNS = [
  'sleep_hours', 'sleep_quality', 'energy', 'mood', 'pain', 'sleep_notes', 'sleep_quality_notes',
  'energy_notes', 'mood_notes', 'pain_notes', 'general_notes', 'treatment_notes',
] as const;

function cleanText(value: unknown, limit: number) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function normalizePhoto(value: unknown): PhotoAttachment | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const dataUrl = typeof raw.dataUrl === 'string' ? raw.dataUrl : '';
  if (!dataUrl.startsWith('data:image/') || dataUrl.length > MAX_PHOTO_DATA_URL_LENGTH) return null;
  return {
    id: cleanText(raw.id, 80) || `agent-photo-${Date.now()}`,
    name: cleanText(raw.name, 160) || 'AI chat photo',
    type: cleanText(raw.type, 80) || 'image/jpeg',
    dataUrl,
    createdAt: cleanText(raw.createdAt, 60) || new Date().toISOString(),
    note: cleanText(raw.note, 500),
  };
}

function rowKey(date: string, exerciseId: string) {
  return `${date}|${exerciseId}`;
}

function appendText(previous: unknown, next: string) {
  const before = String(previous ?? '').trim();
  const addition = next.trim();
  if (!before) return addition;
  if (!addition || before.includes(addition)) return before;
  return `${before}\n${addition}`;
}

function jsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function doctorPatchColumns(action: Extract<AgentAction, { type: 'doctor_note_upsert' }>) {
  return Object.keys(action.patch);
}

function hasConfigAction(action: AgentAction) {
  return ['exercise_add', 'exercise_update', 'exercise_move', 'exercise_remove', 'category_upsert', 'category_remove', 'pt_session_upsert', 'pt_session_remove', 'widget_set', 'app_title_set'].includes(action.type);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const requestId = cleanText(body.requestId, 100);
    if (!REQUEST_ID_PATTERN.test(requestId)) return NextResponse.json({ error: 'A valid request id is required.' }, { status: 400 });
    const attachment = normalizePhoto(body.attachment);
    const { actions, config } = await validateAndExpandAgentActions(body.actions);
    const writeActions = actions.filter(action => action.type !== 'navigate');
    if (!writeActions.length) return NextResponse.json({ error: 'There are no selected changes to apply.' }, { status: 400 });
    if (writeActions.some(action => action.type === 'photo_attach') && !attachment) {
      return NextResponse.json({ error: 'Choose a photo before applying this plan.' }, { status: 400 });
    }

    const runId = `agent-${requestId}`;
    const chatSessionId = cleanText(body.chatSessionId, 100);
    const chatMessageId = cleanText(body.chatMessageId, 100);
    const label = cleanText(body.label, 180) || `AI applied ${writeActions.length} change${writeActions.length === 1 ? '' : 's'}`;
    const logTargets = Array.from(new Map(writeActions.flatMap(action => action.type === 'completion_set' ? [[rowKey(action.date, action.exerciseId), { date: action.date, exercise_id: action.exerciseId }]] : [])).values());
    const noteTargets = Array.from(new Map(writeActions.flatMap(action => action.type === 'exercise_note_change' || (action.type === 'photo_attach' && action.target === 'exercise_note') ? [[rowKey(action.date!, action.exerciseId!), { date: action.date!, exercise_id: action.exerciseId! }]] : [])).values());
    const healthDates = Array.from(new Set(writeActions.flatMap(action => action.type === 'health_change' ? [action.date] : action.type === 'photo_attach' && action.target === 'health_general' ? [action.date!] : [])));
    const metricTargets = Array.from(new Map(writeActions.flatMap(action => action.type === 'metrics_set' || action.type === 'metrics_clear' ? [[rowKey(action.date, action.exerciseId), { date: action.date, exercise_id: action.exerciseId }]] : [])).values());
    const doctorIds = Array.from(new Set(writeActions.flatMap(action => action.type === 'doctor_note_upsert' && action.noteId ? [action.noteId] : action.type === 'doctor_note_remove' ? [action.noteId] : action.type === 'photo_attach' && action.target === 'doctor_note' ? [action.noteId!] : [])));
    const needsExercisePhotos = writeActions.some(action => action.type === 'photo_attach' && action.target === 'exercise_note');
    const needsHealthPhotos = writeActions.some(action => action.type === 'photo_attach' && action.target === 'health_general');

    const preReadQueries: Array<ReturnType<typeof sql>> = [];
    const preReadKinds: string[] = [];
    const addPreRead = (kind: string, query: ReturnType<typeof sql>) => {
      preReadKinds.push(kind);
      preReadQueries.push(query);
    };
    if (logTargets.length) addPreRead('logs', sql`SELECT target.date::text, target.exercise_id, log.completed
          FROM jsonb_to_recordset(${JSON.stringify(logTargets)}::jsonb) AS target(date DATE, exercise_id TEXT)
          LEFT JOIN workout_log log ON log.date = target.date AND log.exercise_id = target.exercise_id`);
    if (noteTargets.length) addPreRead('notes', needsExercisePhotos
      ? sql`SELECT target.date::text, target.exercise_id, notes.note, COALESCE(notes.photo_attachments, '[]'::jsonb) AS photo_attachments
              FROM jsonb_to_recordset(${JSON.stringify(noteTargets)}::jsonb) AS target(date DATE, exercise_id TEXT)
              LEFT JOIN exercise_notes notes ON notes.date = target.date AND notes.exercise_id = target.exercise_id`
      : sql`SELECT target.date::text, target.exercise_id, notes.note, '[]'::jsonb AS photo_attachments
              FROM jsonb_to_recordset(${JSON.stringify(noteTargets)}::jsonb) AS target(date DATE, exercise_id TEXT)
              LEFT JOIN exercise_notes notes ON notes.date = target.date AND notes.exercise_id = target.exercise_id`);
    if (healthDates.length) addPreRead('health', needsHealthPhotos
      ? sql`SELECT target.date::text, health.id, health.sleep_hours, health.sleep_quality, health.energy, health.mood, health.pain,
                health.sleep_notes, health.sleep_quality_notes, health.energy_notes, health.mood_notes, health.pain_notes,
                health.general_notes, health.treatment_notes, COALESCE(health.general_note_photos, '[]'::jsonb) AS general_note_photos
              FROM jsonb_to_recordset(${JSON.stringify(healthDates.map(date => ({ date })))}::jsonb) AS target(date DATE)
              LEFT JOIN health_log health ON health.date = target.date`
      : sql`SELECT target.date::text, health.id, health.sleep_hours, health.sleep_quality, health.energy, health.mood, health.pain,
                health.sleep_notes, health.sleep_quality_notes, health.energy_notes, health.mood_notes, health.pain_notes,
                health.general_notes, health.treatment_notes, '[]'::jsonb AS general_note_photos
              FROM jsonb_to_recordset(${JSON.stringify(healthDates.map(date => ({ date })))}::jsonb) AS target(date DATE)
              LEFT JOIN health_log health ON health.date = target.date`);
    if (metricTargets.length) addPreRead('metrics', sql`SELECT target.date::text, target.exercise_id, metrics.id, metrics.sets_count, metrics.reps_count, metrics.duration_seconds,
            metrics.weight_value, metrics.weight_unit, metrics.scope_multiplier
          FROM jsonb_to_recordset(${JSON.stringify(metricTargets)}::jsonb) AS target(date DATE, exercise_id TEXT)
          LEFT JOIN exercise_metrics metrics ON metrics.date = target.date AND metrics.exercise_id = target.exercise_id`);
    if (doctorIds.length) addPreRead('doctors', sql`SELECT target.note_id, notes.id, notes.kind, notes.title, notes.provider, notes.reference_text, notes.body, notes.note_color,
            notes.linked_dates, notes.pinned, jsonb_array_length(COALESCE(notes.photo_attachments, '[]'::jsonb))::int AS photo_count
          FROM jsonb_to_recordset(${JSON.stringify(doctorIds.map(noteId => ({ note_id: noteId })))}::jsonb) AS target(note_id TEXT)
          LEFT JOIN doctor_notes notes ON notes.id = target.note_id`);
    const preReadResults = preReadQueries.length ? await sql.transaction(preReadQueries) : [];
    const rowsFor = (kind: string) => preReadResults[preReadKinds.indexOf(kind)] ?? [];
    const logRows = rowsFor('logs');
    const noteRows = rowsFor('notes');
    const healthRows = rowsFor('health');
    const metricRows = rowsFor('metrics');
    const doctorRows = rowsFor('doctors');

    const logsByKey = new Map((logRows as Row[]).map(row => [rowKey(String(row.date), String(row.exercise_id)), row]));
    const notesByKey = new Map((noteRows as Row[]).map(row => [rowKey(String(row.date), String(row.exercise_id)), row]));
    const healthByDate = new Map((healthRows as Row[]).map(row => [String(row.date), row]));
    const metricsByKey = new Map((metricRows as Row[]).map(row => [rowKey(String(row.date), String(row.exercise_id)), row]));
    const doctorsById = new Map((doctorRows as Row[]).map(row => [String(row.note_id), row]));

    for (const action of writeActions) {
      if (action.type === 'doctor_note_remove' && Number(doctorsById.get(action.noteId)?.photo_count ?? 0) > 0) {
        return NextResponse.json({ error: 'Open the doctor note to delete it because it contains photos.' }, { status: 409 });
      }
      if ((action.type === 'doctor_note_upsert' && action.mode !== 'create' && !doctorsById.get(action.noteId!)?.id)
        || (action.type === 'photo_attach' && action.target === 'doctor_note' && !doctorsById.get(action.noteId!)?.id)) {
        return NextResponse.json({ error: 'The selected doctor note no longer exists.' }, { status: 409 });
      }
      if (action.type === 'photo_attach') {
        const count = action.target === 'exercise_note'
          ? jsonArray(notesByKey.get(rowKey(action.date!, action.exerciseId!))?.photo_attachments).length
          : action.target === 'health_general'
            ? jsonArray(healthByDate.get(action.date!)?.general_note_photos).length
            : Number(doctorsById.get(action.noteId!)?.photo_count ?? 0);
        if (count >= 5) return NextResponse.json({ error: 'That destination already has the maximum of five photos.' }, { status: 409 });
      }
    }

    const undo: UndoPayload = {
      logs: [], notes: [], health: [], metrics: [], doctorNotes: [], configs: [],
      chat: chatSessionId && chatMessageId ? { sessionId: chatSessionId, messageId: chatMessageId } : undefined,
    };

    const completionPayload = writeActions.filter((action): action is Extract<AgentAction, { type: 'completion_set' }> => action.type === 'completion_set').map(action => {
      const previous = logsByKey.get(rowKey(action.date, action.exerciseId));
      undo.logs.push({ date: action.date, exerciseId: action.exerciseId, existed: previous?.completed !== null && previous?.completed !== undefined, completed: previous?.completed === true });
      return { date: action.date, exercise_id: action.exerciseId, completed: action.completed };
    });

    const notePayloadByKey = new Map<string, { date: string; exercise_id: string; note: string; photo_attachments: unknown[]; update_photos: boolean }>();
    for (const target of noteTargets) {
      const key = rowKey(target.date, target.exercise_id);
      const previous = notesByKey.get(key);
      notePayloadByKey.set(key, { date: target.date, exercise_id: target.exercise_id, note: String(previous?.note ?? ''), photo_attachments: jsonArray(previous?.photo_attachments), update_photos: false });
      undo.notes.push({ date: target.date, exerciseId: target.exercise_id, existed: previous?.note !== null && previous?.note !== undefined, note: previous?.note === null || previous?.note === undefined ? undefined : String(previous.note), restoreNote: false, removePhotoIds: [] });
    }
    for (const action of writeActions) {
      if (action.type === 'exercise_note_change') {
        const target = notePayloadByKey.get(rowKey(action.date, action.exerciseId))!;
        target.note = action.mode === 'append' ? appendText(target.note, action.text) : action.text;
        const inverse = undo.notes.find(item => item.date === action.date && item.exerciseId === action.exerciseId)!;
        inverse.restoreNote = true;
      } else if (action.type === 'photo_attach' && action.target === 'exercise_note' && attachment) {
        const target = notePayloadByKey.get(rowKey(action.date!, action.exerciseId!))!;
        target.photo_attachments = [...target.photo_attachments, attachment];
        target.update_photos = true;
        const inverse = undo.notes.find(item => item.date === action.date && item.exerciseId === action.exerciseId)!;
        inverse.removePhotoIds.push(attachment.id);
      }
    }
    const notePayload = Array.from(notePayloadByKey.values());

    const healthPayloadByDate = new Map<string, Row>();
    for (const targetDate of healthDates) {
      const previous = healthByDate.get(targetDate);
      const next: Row = { date: targetDate, general_note_photos: jsonArray(previous?.general_note_photos) };
      for (const column of HEALTH_COLUMNS) next[column] = previous?.[column] ?? null;
      healthPayloadByDate.set(targetDate, next);
      undo.health.push({ date: targetDate, existed: previous?.id !== null && previous?.id !== undefined, fields: {}, removePhotoIds: [] });
    }
    for (const action of writeActions) {
      if (action.type === 'health_change') {
        const next = healthPayloadByDate.get(action.date)!;
        const inverse = undo.health.find(item => item.date === action.date)!;
        if (!Object.prototype.hasOwnProperty.call(inverse.fields, action.field)) inverse.fields[action.field] = healthByDate.get(action.date)?.[action.field] ?? null;
        next[action.field] = action.mode === 'append' ? appendText(next[action.field], String(action.value ?? '')) : action.value;
      } else if (action.type === 'photo_attach' && action.target === 'health_general' && attachment) {
        const next = healthPayloadByDate.get(action.date!)!;
        next.general_note_photos = [...jsonArray(next.general_note_photos), attachment];
        undo.health.find(item => item.date === action.date)!.removePhotoIds.push(attachment.id);
      }
    }
    const healthPayload = Array.from(healthPayloadByDate.values());
    const healthPhotoPayload = attachment ? writeActions.flatMap(action => action.type === 'photo_attach' && action.target === 'health_general'
      ? [{ date: action.date!, general_note_photos: healthPayloadByDate.get(action.date!)!.general_note_photos }]
      : []) : [];

    const metricSetPayload = writeActions.filter((action): action is Extract<AgentAction, { type: 'metrics_set' }> => action.type === 'metrics_set').map(action => {
      const previous = metricsByKey.get(rowKey(action.date, action.exerciseId));
      undo.metrics.push({ date: action.date, exerciseId: action.exerciseId, existed: previous?.id !== null && previous?.id !== undefined, row: previous?.id !== null && previous?.id !== undefined ? previous : undefined });
      return { date: action.date, exercise_id: action.exerciseId, sets_count: action.sets, reps_count: action.reps, duration_seconds: action.durationSeconds, weight_value: action.weight, weight_unit: action.weightUnit, scope_multiplier: action.scopeMultiplier };
    });
    const metricClearPayload = writeActions.filter((action): action is Extract<AgentAction, { type: 'metrics_clear' }> => action.type === 'metrics_clear').map(action => {
      const previous = metricsByKey.get(rowKey(action.date, action.exerciseId));
      undo.metrics.push({ date: action.date, exerciseId: action.exerciseId, existed: previous?.id !== null && previous?.id !== undefined, row: previous?.id !== null && previous?.id !== undefined ? previous : undefined });
      return { date: action.date, exercise_id: action.exerciseId };
    });

    const doctorUpsertPayload: Row[] = [];
    const doctorDeletePayload: Array<{ note_id: string }> = [];
    for (const action of writeActions) {
      if (action.type === 'doctor_note_upsert') {
        const noteId = action.noteId || `doctor-agent-${Date.now()}-${action.id.slice(-12)}`;
        const previous = doctorsById.get(noteId);
        const changedFields = doctorPatchColumns(action);
        const beforeFields = Object.fromEntries(changedFields.map(field => {
          const dbField = field === 'referenceText' ? 'reference_text' : field === 'linkedDates' ? 'linked_dates' : field === 'noteColor' ? 'note_color' : field;
          return [field, previous?.[dbField] ?? null];
        }));
        undo.doctorNotes.push({ noteId, existed: Boolean(previous?.id), fields: beforeFields, removePhotoIds: [] });
        const next = {
          note_id: noteId,
          kind: String(previous?.kind ?? 'question'),
          title: String(previous?.title ?? ''),
          provider: String(previous?.provider ?? ''),
          reference_text: String(previous?.reference_text ?? ''),
          body: String(previous?.body ?? ''),
          linked_dates: jsonArray(previous?.linked_dates),
          pinned: previous?.pinned === true,
          note_color: String(previous?.note_color ?? 'none'),
        };
        if (action.patch.kind !== undefined) next.kind = action.patch.kind;
        if (action.patch.title !== undefined) next.title = action.patch.title;
        if (action.patch.provider !== undefined) next.provider = action.patch.provider;
        if (action.patch.referenceText !== undefined) next.reference_text = action.patch.referenceText;
        if (action.patch.body !== undefined) next.body = action.mode === 'append' ? appendText(next.body, action.patch.body) : action.patch.body;
        if (action.patch.linkedDates !== undefined) next.linked_dates = action.patch.linkedDates;
        if (action.patch.pinned !== undefined) next.pinned = action.patch.pinned;
        if (action.patch.noteColor !== undefined) next.note_color = action.patch.noteColor;
        doctorUpsertPayload.push(next);
      } else if (action.type === 'doctor_note_remove') {
        const previous = doctorsById.get(action.noteId);
        if (previous?.id) {
          undo.doctorNotes.push({ noteId: action.noteId, existed: true, fields: { kind: previous.kind, title: previous.title, provider: previous.provider, referenceText: previous.reference_text, body: previous.body, noteColor: previous.note_color, linkedDates: previous.linked_dates, pinned: previous.pinned }, restoreDeleted: true, removePhotoIds: [] });
          doctorDeletePayload.push({ note_id: action.noteId });
        }
      } else if (action.type === 'photo_attach' && action.target === 'doctor_note' && attachment) {
        const previous = doctorsById.get(action.noteId!);
        let inverse = undo.doctorNotes.find(item => item.noteId === action.noteId);
        if (!inverse) {
          inverse = { noteId: action.noteId!, existed: Boolean(previous?.id), fields: {}, removePhotoIds: [] };
          undo.doctorNotes.push(inverse);
        }
        inverse.removePhotoIds.push(attachment.id);
      }
    }
    const doctorPhotoPayload = attachment ? writeActions.flatMap(action => action.type === 'photo_attach' && action.target === 'doctor_note' ? [{ note_id: action.noteId!, photo: attachment }] : []) : [];

    const configActions = writeActions.filter(hasConfigAction);
    const nextConfig = applyAgentConfigActions(config, configActions);
    for (const key of nextConfig.changed) undo.configs.push({ key, value: config[key as keyof typeof config] });
    const configPayload = nextConfig.changed.map(key => ({ key, value: nextConfig.values[key as keyof typeof nextConfig.values] }));

    const transaction = [
      sql`INSERT INTO ai_agent_runs (id, request_id, label, actions, undo_payload, status, created_at)
          VALUES (${runId}, ${requestId}, ${label}, ${JSON.stringify(redactAgentActions(writeActions))}::jsonb, ${JSON.stringify(undo)}::jsonb, 'applying', NOW())
          ON CONFLICT (request_id) DO NOTHING`,
    ];
    if (completionPayload.length) transaction.push(sql`
      INSERT INTO workout_log (date, exercise_id, completed, updated_at)
      SELECT item.date, item.exercise_id, item.completed, NOW()
      FROM jsonb_to_recordset(${JSON.stringify(completionPayload)}::jsonb) AS item(date DATE, exercise_id TEXT, completed BOOLEAN)
      WHERE EXISTS (SELECT 1 FROM ai_agent_runs WHERE id = ${runId} AND status = 'applying')
      ON CONFLICT (date, exercise_id) DO UPDATE SET completed = EXCLUDED.completed, updated_at = NOW()`);
    if (notePayload.length) transaction.push(sql`
      INSERT INTO exercise_notes (date, exercise_id, note, photo_attachments, updated_at)
      SELECT item.date, item.exercise_id, item.note, CASE WHEN item.update_photos THEN item.photo_attachments ELSE COALESCE(existing.photo_attachments, '[]'::jsonb) END, NOW()
      FROM jsonb_to_recordset(${JSON.stringify(notePayload)}::jsonb) AS item(date DATE, exercise_id TEXT, note TEXT, photo_attachments JSONB, update_photos BOOLEAN)
      LEFT JOIN exercise_notes existing ON existing.date = item.date AND existing.exercise_id = item.exercise_id
      WHERE EXISTS (SELECT 1 FROM ai_agent_runs WHERE id = ${runId} AND status = 'applying')
      ON CONFLICT (date, exercise_id) DO UPDATE SET note = EXCLUDED.note, photo_attachments = EXCLUDED.photo_attachments, updated_at = NOW()`);
    if (healthPayload.length) transaction.push(sql`
      INSERT INTO health_log (date, sleep_hours, sleep_quality, energy, mood, pain, sleep_notes, sleep_quality_notes, energy_notes, mood_notes, pain_notes, general_notes, treatment_notes, updated_at)
      SELECT item.date, item.sleep_hours, item.sleep_quality, item.energy, item.mood, item.pain, item.sleep_notes, item.sleep_quality_notes, item.energy_notes, item.mood_notes, item.pain_notes, item.general_notes, item.treatment_notes, NOW()
      FROM jsonb_to_recordset(${JSON.stringify(healthPayload)}::jsonb) AS item(date DATE, sleep_hours NUMERIC, sleep_quality NUMERIC, energy NUMERIC, mood NUMERIC, pain NUMERIC, sleep_notes TEXT, sleep_quality_notes TEXT, energy_notes TEXT, mood_notes TEXT, pain_notes TEXT, general_notes TEXT, treatment_notes TEXT, general_note_photos JSONB)
      WHERE EXISTS (SELECT 1 FROM ai_agent_runs WHERE id = ${runId} AND status = 'applying')
      ON CONFLICT (date) DO UPDATE SET sleep_hours = EXCLUDED.sleep_hours, sleep_quality = EXCLUDED.sleep_quality, energy = EXCLUDED.energy, mood = EXCLUDED.mood, pain = EXCLUDED.pain, sleep_notes = EXCLUDED.sleep_notes, sleep_quality_notes = EXCLUDED.sleep_quality_notes, energy_notes = EXCLUDED.energy_notes, mood_notes = EXCLUDED.mood_notes, pain_notes = EXCLUDED.pain_notes, general_notes = EXCLUDED.general_notes, treatment_notes = EXCLUDED.treatment_notes, updated_at = NOW()`);
    if (healthPhotoPayload.length) transaction.push(sql`
      UPDATE health_log SET general_note_photos = item.general_note_photos, updated_at = NOW()
      FROM jsonb_to_recordset(${JSON.stringify(healthPhotoPayload)}::jsonb) AS item(date DATE, general_note_photos JSONB)
      WHERE health_log.date = item.date AND EXISTS (SELECT 1 FROM ai_agent_runs WHERE id = ${runId} AND status = 'applying')`);
    if (metricSetPayload.length) transaction.push(sql`
      INSERT INTO exercise_metrics (date, exercise_id, sets_count, reps_count, duration_seconds, weight_value, weight_unit, scope_multiplier, updated_at)
      SELECT item.date, item.exercise_id, item.sets_count, item.reps_count, item.duration_seconds, item.weight_value, item.weight_unit, item.scope_multiplier, NOW()
      FROM jsonb_to_recordset(${JSON.stringify(metricSetPayload)}::jsonb) AS item(date DATE, exercise_id TEXT, sets_count INTEGER, reps_count INTEGER, duration_seconds INTEGER, weight_value NUMERIC, weight_unit TEXT, scope_multiplier INTEGER)
      WHERE EXISTS (SELECT 1 FROM ai_agent_runs WHERE id = ${runId} AND status = 'applying')
      ON CONFLICT (date, exercise_id) DO UPDATE SET sets_count = EXCLUDED.sets_count, reps_count = EXCLUDED.reps_count, duration_seconds = EXCLUDED.duration_seconds, weight_value = EXCLUDED.weight_value, weight_unit = EXCLUDED.weight_unit, scope_multiplier = EXCLUDED.scope_multiplier, updated_at = NOW()`);
    if (metricClearPayload.length) transaction.push(sql`
      DELETE FROM exercise_metrics USING jsonb_to_recordset(${JSON.stringify(metricClearPayload)}::jsonb) AS item(date DATE, exercise_id TEXT)
      WHERE exercise_metrics.date = item.date AND exercise_metrics.exercise_id = item.exercise_id
        AND EXISTS (SELECT 1 FROM ai_agent_runs WHERE id = ${runId} AND status = 'applying')`);
    if (doctorUpsertPayload.length) transaction.push(sql`
      INSERT INTO doctor_notes (id, kind, title, provider, reference_text, body, linked_dates, photo_attachments, response_transcripts, pinned, note_color, created_at, updated_at)
      SELECT item.note_id, item.kind, item.title, item.provider, item.reference_text, item.body, item.linked_dates,
        '[]'::jsonb, '[]'::jsonb, item.pinned, item.note_color, NOW(), NOW()
      FROM jsonb_to_recordset(${JSON.stringify(doctorUpsertPayload)}::jsonb) AS item(note_id TEXT, kind TEXT, title TEXT, provider TEXT, reference_text TEXT, body TEXT, linked_dates JSONB, pinned BOOLEAN, note_color TEXT)
      WHERE EXISTS (SELECT 1 FROM ai_agent_runs WHERE id = ${runId} AND status = 'applying')
      ON CONFLICT (id) DO UPDATE SET
        kind = EXCLUDED.kind, title = EXCLUDED.title, provider = EXCLUDED.provider, reference_text = EXCLUDED.reference_text,
        body = EXCLUDED.body, linked_dates = EXCLUDED.linked_dates, pinned = EXCLUDED.pinned, note_color = EXCLUDED.note_color,
        updated_at = NOW()`);
    if (doctorPhotoPayload.length) transaction.push(sql`
      UPDATE doctor_notes SET photo_attachments = (COALESCE(photo_attachments, '[]'::jsonb) || payload.photo)::jsonb, updated_at = NOW()
      FROM jsonb_to_recordset(${JSON.stringify(doctorPhotoPayload)}::jsonb) AS payload(note_id TEXT, photo JSONB)
      WHERE doctor_notes.id = payload.note_id AND jsonb_array_length(COALESCE(doctor_notes.photo_attachments, '[]'::jsonb)) < 5
        AND EXISTS (SELECT 1 FROM ai_agent_runs WHERE id = ${runId} AND status = 'applying')`);
    if (doctorDeletePayload.length) transaction.push(sql`
      DELETE FROM doctor_notes USING jsonb_to_recordset(${JSON.stringify(doctorDeletePayload)}::jsonb) AS item(note_id TEXT)
      WHERE doctor_notes.id = item.note_id AND jsonb_array_length(COALESCE(doctor_notes.photo_attachments, '[]'::jsonb)) = 0
        AND EXISTS (SELECT 1 FROM ai_agent_runs WHERE id = ${runId} AND status = 'applying')`);
    if (configPayload.length) transaction.push(sql`
      INSERT INTO user_config (key, value, updated_at)
      SELECT item.key, item.value, NOW()
      FROM jsonb_to_recordset(${JSON.stringify(configPayload)}::jsonb) AS item(key TEXT, value JSONB)
      WHERE EXISTS (SELECT 1 FROM ai_agent_runs WHERE id = ${runId} AND status = 'applying')
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`);
    transaction.push(sql`UPDATE ai_agent_runs SET status = 'applied' WHERE id = ${runId} AND status = 'applying'`);
    await sql.transaction(transaction, { isolationLevel: 'Serializable' });

    const affectedDates = Array.from(new Set(writeActions.flatMap(action => 'date' in action && action.date ? [action.date] : []))).sort();
    const domainCommands = domainCommandsForAgentActions(writeActions);
    return NextResponse.json({
      ok: true,
      runId,
      label,
      affectedDates,
      changedConfig: Object.fromEntries(configPayload.map(item => [item.key, item.value])),
      actionCount: writeActions.length,
      domainCommands,
    });
  } catch (error) {
    console.error('[ai-agent POST]', error);
    if (error instanceof AgentValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: 'Could not apply these changes.' }, { status: 500 });
  }
}
