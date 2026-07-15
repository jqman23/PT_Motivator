import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);
const RUN_ID_PATTERN = /^agent-[A-Za-z0-9_-]{12,100}$/;

type Row = Record<string, unknown>;
type UndoPayload = {
  logs?: Array<{ date: string; exerciseId: string; existed: boolean; completed: boolean }>;
  notes?: Array<{ date: string; exerciseId: string; existed: boolean; note?: string; restoreNote: boolean; removePhotoIds: string[] }>;
  health?: Array<{ date: string; existed: boolean; fields: Record<string, unknown>; removePhotoIds: string[] }>;
  metrics?: Array<{ date: string; exerciseId: string; existed: boolean; row?: Record<string, unknown> }>;
  doctorNotes?: Array<{ noteId: string; existed: boolean; fields: Record<string, unknown>; restoreDeleted?: boolean; removePhotoIds: string[] }>;
  configs?: Array<{ key: string; value: unknown }>;
  chat?: { sessionId?: string; messageId?: string };
};

const HEALTH_COLUMNS = [
  'sleep_hours', 'sleep_quality', 'energy', 'mood', 'pain', 'sleep_notes', 'sleep_quality_notes',
  'energy_notes', 'mood_notes', 'pain_notes', 'general_notes', 'treatment_notes',
] as const;

function rowKey(date: string, exerciseId: string) {
  return `${date}|${exerciseId}`;
}

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function withoutPhotoIds(value: unknown, ids: string[]) {
  if (!Array.isArray(value) || !ids.length) return Array.isArray(value) ? value : [];
  const removed = new Set(ids);
  return value.filter(item => !item || typeof item !== 'object' || !removed.has(String((item as Record<string, unknown>).id ?? '')));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const runId = typeof body.runId === 'string' ? body.runId.trim().slice(0, 120) : '';
    if (!RUN_ID_PATTERN.test(runId)) return NextResponse.json({ error: 'A valid agent run is required.' }, { status: 400 });
    const rows = await sql`SELECT label, undo_payload, status FROM ai_agent_runs WHERE id = ${runId} LIMIT 1`;
    if (!rows.length) return NextResponse.json({ error: 'That AI action can no longer be found.' }, { status: 404 });
    if (rows[0].status === 'undone') return NextResponse.json({ ok: true, alreadyUndone: true, label: rows[0].label });
    if (rows[0].status !== 'applied') return NextResponse.json({ error: 'That AI action is not available to undo.' }, { status: 409 });

    const undo = (rows[0].undo_payload && typeof rows[0].undo_payload === 'object' ? rows[0].undo_payload : {}) as UndoPayload;
    const noteUndo = list<NonNullable<UndoPayload['notes']>[number]>(undo.notes);
    const healthUndo = list<NonNullable<UndoPayload['health']>[number]>(undo.health);
    const doctorUndo = list<NonNullable<UndoPayload['doctorNotes']>[number]>(undo.doctorNotes);
    const needsNotePhotos = noteUndo.some(item => item.removePhotoIds?.length);
    const needsHealthPhotos = healthUndo.some(item => item.removePhotoIds?.length);
    const needsDoctorPhotos = doctorUndo.some(item => item.removePhotoIds?.length);
    const noteTargets = noteUndo.map(item => ({ date: item.date, exercise_id: item.exerciseId }));
    const healthTargets = healthUndo.map(item => ({ date: item.date }));
    const doctorTargets = doctorUndo.map(item => ({ note_id: item.noteId }));

    const preReadQueries: Array<ReturnType<typeof sql>> = [];
    const preReadKinds: string[] = [];
    const addPreRead = (kind: string, query: ReturnType<typeof sql>) => {
      preReadKinds.push(kind);
      preReadQueries.push(query);
    };
    if (needsNotePhotos) addPreRead('notes', sql`SELECT target.date::text, target.exercise_id, notes.note, COALESCE(notes.photo_attachments, '[]'::jsonb) AS photo_attachments
            FROM jsonb_to_recordset(${JSON.stringify(noteTargets)}::jsonb) AS target(date DATE, exercise_id TEXT)
            LEFT JOIN exercise_notes notes ON notes.date = target.date AND notes.exercise_id = target.exercise_id`);
    if (healthTargets.length) addPreRead('health', needsHealthPhotos
      ? sql`SELECT target.date::text, health.sleep_hours, health.sleep_quality, health.energy, health.mood, health.pain,
                health.sleep_notes, health.sleep_quality_notes, health.energy_notes, health.mood_notes, health.pain_notes,
                health.general_notes, health.treatment_notes, COALESCE(health.general_note_photos, '[]'::jsonb) AS general_note_photos
              FROM jsonb_to_recordset(${JSON.stringify(healthTargets)}::jsonb) AS target(date DATE)
              LEFT JOIN health_log health ON health.date = target.date`
      : sql`SELECT target.date::text, health.sleep_hours, health.sleep_quality, health.energy, health.mood, health.pain,
                health.sleep_notes, health.sleep_quality_notes, health.energy_notes, health.mood_notes, health.pain_notes,
                health.general_notes, health.treatment_notes, '[]'::jsonb AS general_note_photos
              FROM jsonb_to_recordset(${JSON.stringify(healthTargets)}::jsonb) AS target(date DATE)
              LEFT JOIN health_log health ON health.date = target.date`);
    if (doctorTargets.length) addPreRead('doctors', needsDoctorPhotos
      ? sql`SELECT target.note_id, notes.kind, notes.title, notes.provider, notes.reference_text, notes.body, notes.note_color,
                notes.linked_dates, notes.pinned, COALESCE(notes.photo_attachments, '[]'::jsonb) AS photo_attachments
              FROM jsonb_to_recordset(${JSON.stringify(doctorTargets)}::jsonb) AS target(note_id TEXT)
              LEFT JOIN doctor_notes notes ON notes.id = target.note_id`
      : sql`SELECT target.note_id, notes.kind, notes.title, notes.provider, notes.reference_text, notes.body, notes.note_color,
                notes.linked_dates, notes.pinned, '[]'::jsonb AS photo_attachments
              FROM jsonb_to_recordset(${JSON.stringify(doctorTargets)}::jsonb) AS target(note_id TEXT)
              LEFT JOIN doctor_notes notes ON notes.id = target.note_id`);
    const preReadResults = preReadQueries.length ? await sql.transaction(preReadQueries) : [];
    const rowsFor = (kind: string) => preReadResults[preReadKinds.indexOf(kind)] ?? [];
    const noteRows = rowsFor('notes');
    const healthRows = rowsFor('health');
    const doctorRows = rowsFor('doctors');
    const notesByKey = new Map((noteRows as Row[]).map(row => [rowKey(String(row.date), String(row.exercise_id)), row]));
    const healthByDate = new Map((healthRows as Row[]).map(row => [String(row.date), row]));
    const doctorsById = new Map((doctorRows as Row[]).map(row => [String(row.note_id), row]));

    const logsToRestore = list<NonNullable<UndoPayload['logs']>[number]>(undo.logs).filter(item => item.existed).map(item => ({ date: item.date, exercise_id: item.exerciseId, completed: item.completed }));
    const logsToDelete = list<NonNullable<UndoPayload['logs']>[number]>(undo.logs).filter(item => !item.existed).map(item => ({ date: item.date, exercise_id: item.exerciseId }));
    const notesToRestore = noteUndo.filter(item => item.existed).map(item => {
      const current = notesByKey.get(rowKey(item.date, item.exerciseId));
      return {
        date: item.date,
        exercise_id: item.exerciseId,
        note: item.restoreNote ? item.note ?? '' : String(current?.note ?? ''),
        photo_attachments: withoutPhotoIds(current?.photo_attachments, item.removePhotoIds ?? []),
        restore_photos: Boolean(item.removePhotoIds?.length),
      };
    });
    const notesToDelete = noteUndo.filter(item => !item.existed).map(item => ({ date: item.date, exercise_id: item.exerciseId }));

    const healthToRestore = healthUndo.filter(item => item.existed).map(item => {
      const current = healthByDate.get(item.date) ?? {};
      const next: Row = { date: item.date, general_note_photos: withoutPhotoIds(current.general_note_photos, item.removePhotoIds ?? []) };
      for (const field of HEALTH_COLUMNS) next[field] = Object.prototype.hasOwnProperty.call(item.fields ?? {}, field) ? item.fields[field] : current[field] ?? null;
      return next;
    });
    const healthPhotoRestores = healthUndo.filter(item => item.existed && item.removePhotoIds?.length).map(item => ({
      date: item.date,
      general_note_photos: withoutPhotoIds(healthByDate.get(item.date)?.general_note_photos, item.removePhotoIds),
    }));
    const healthToDelete = healthUndo.filter(item => !item.existed).map(item => ({ date: item.date }));

    const metricsToRestore = list<NonNullable<UndoPayload['metrics']>[number]>(undo.metrics).filter(item => item.existed && item.row).map(item => ({
      date: item.date,
      exercise_id: item.exerciseId,
      sets_count: item.row!.sets_count,
      reps_count: item.row!.reps_count,
      duration_seconds: item.row!.duration_seconds,
      weight_value: item.row!.weight_value,
      weight_unit: item.row!.weight_unit,
      scope_multiplier: item.row!.scope_multiplier,
    }));
    const metricsToDelete = list<NonNullable<UndoPayload['metrics']>[number]>(undo.metrics).filter(item => !item.existed).map(item => ({ date: item.date, exercise_id: item.exerciseId }));

    const doctorsToRestore = doctorUndo.filter(item => item.existed).map(item => {
      const current = doctorsById.get(item.noteId) ?? {};
      const field = (name: string, dbName = name) => Object.prototype.hasOwnProperty.call(item.fields ?? {}, name) ? item.fields[name] : current[dbName];
      return {
        note_id: item.noteId,
        kind: field('kind') ?? 'question',
        title: field('title') ?? '',
        provider: field('provider') ?? '',
        reference_text: field('referenceText', 'reference_text') ?? '',
        body: field('body') ?? '',
        linked_dates: field('linkedDates', 'linked_dates') ?? [],
        pinned: field('pinned') === true,
        note_color: field('noteColor', 'note_color') ?? 'none',
      };
    });
    const doctorsToDelete = doctorUndo.filter(item => !item.existed).map(item => ({ note_id: item.noteId }));
    const doctorPhotoRemovals = doctorUndo.filter(item => item.existed && item.removePhotoIds?.length).map(item => ({ note_id: item.noteId, photo_attachments: withoutPhotoIds(doctorsById.get(item.noteId)?.photo_attachments, item.removePhotoIds) }));
    const configPayload = list<NonNullable<UndoPayload['configs']>[number]>(undo.configs).map(item => ({ key: item.key, value: item.value }));

    const transaction = [];
    if (logsToRestore.length) transaction.push(sql`INSERT INTO workout_log (date, exercise_id, completed, updated_at)
      SELECT item.date, item.exercise_id, item.completed, NOW() FROM jsonb_to_recordset(${JSON.stringify(logsToRestore)}::jsonb) AS item(date DATE, exercise_id TEXT, completed BOOLEAN)
      WHERE EXISTS (SELECT 1 FROM ai_agent_runs WHERE id = ${runId} AND status = 'applied')
      ON CONFLICT (date, exercise_id) DO UPDATE SET completed = EXCLUDED.completed, updated_at = NOW()`);
    if (logsToDelete.length) transaction.push(sql`DELETE FROM workout_log USING jsonb_to_recordset(${JSON.stringify(logsToDelete)}::jsonb) AS item(date DATE, exercise_id TEXT)
      WHERE workout_log.date = item.date AND workout_log.exercise_id = item.exercise_id AND EXISTS (SELECT 1 FROM ai_agent_runs WHERE id = ${runId} AND status = 'applied')`);
    if (notesToRestore.length) transaction.push(sql`INSERT INTO exercise_notes (date, exercise_id, note, photo_attachments, updated_at)
      SELECT item.date, item.exercise_id, item.note, CASE WHEN item.restore_photos THEN item.photo_attachments ELSE COALESCE(existing.photo_attachments, '[]'::jsonb) END, NOW()
      FROM jsonb_to_recordset(${JSON.stringify(notesToRestore)}::jsonb) AS item(date DATE, exercise_id TEXT, note TEXT, photo_attachments JSONB, restore_photos BOOLEAN)
      LEFT JOIN exercise_notes existing ON existing.date = item.date AND existing.exercise_id = item.exercise_id
      WHERE EXISTS (SELECT 1 FROM ai_agent_runs WHERE id = ${runId} AND status = 'applied')
      ON CONFLICT (date, exercise_id) DO UPDATE SET note = EXCLUDED.note, photo_attachments = EXCLUDED.photo_attachments, updated_at = NOW()`);
    if (notesToDelete.length) transaction.push(sql`DELETE FROM exercise_notes USING jsonb_to_recordset(${JSON.stringify(notesToDelete)}::jsonb) AS item(date DATE, exercise_id TEXT)
      WHERE exercise_notes.date = item.date AND exercise_notes.exercise_id = item.exercise_id AND EXISTS (SELECT 1 FROM ai_agent_runs WHERE id = ${runId} AND status = 'applied')`);
    if (healthToRestore.length) transaction.push(sql`INSERT INTO health_log (date, sleep_hours, sleep_quality, energy, mood, pain, sleep_notes, sleep_quality_notes, energy_notes, mood_notes, pain_notes, general_notes, treatment_notes, updated_at)
      SELECT item.date, item.sleep_hours, item.sleep_quality, item.energy, item.mood, item.pain, item.sleep_notes, item.sleep_quality_notes, item.energy_notes, item.mood_notes, item.pain_notes, item.general_notes, item.treatment_notes, NOW()
      FROM jsonb_to_recordset(${JSON.stringify(healthToRestore)}::jsonb) AS item(date DATE, sleep_hours NUMERIC, sleep_quality NUMERIC, energy NUMERIC, mood NUMERIC, pain NUMERIC, sleep_notes TEXT, sleep_quality_notes TEXT, energy_notes TEXT, mood_notes TEXT, pain_notes TEXT, general_notes TEXT, treatment_notes TEXT, general_note_photos JSONB)
      WHERE EXISTS (SELECT 1 FROM ai_agent_runs WHERE id = ${runId} AND status = 'applied')
      ON CONFLICT (date) DO UPDATE SET sleep_hours = EXCLUDED.sleep_hours, sleep_quality = EXCLUDED.sleep_quality, energy = EXCLUDED.energy, mood = EXCLUDED.mood, pain = EXCLUDED.pain, sleep_notes = EXCLUDED.sleep_notes, sleep_quality_notes = EXCLUDED.sleep_quality_notes, energy_notes = EXCLUDED.energy_notes, mood_notes = EXCLUDED.mood_notes, pain_notes = EXCLUDED.pain_notes, general_notes = EXCLUDED.general_notes, treatment_notes = EXCLUDED.treatment_notes, updated_at = NOW()`);
    if (healthPhotoRestores.length) transaction.push(sql`UPDATE health_log SET general_note_photos = item.general_note_photos, updated_at = NOW()
      FROM jsonb_to_recordset(${JSON.stringify(healthPhotoRestores)}::jsonb) AS item(date DATE, general_note_photos JSONB)
      WHERE health_log.date = item.date AND EXISTS (SELECT 1 FROM ai_agent_runs WHERE id = ${runId} AND status = 'applied')`);
    if (healthToDelete.length) transaction.push(sql`DELETE FROM health_log USING jsonb_to_recordset(${JSON.stringify(healthToDelete)}::jsonb) AS item(date DATE)
      WHERE health_log.date = item.date AND EXISTS (SELECT 1 FROM ai_agent_runs WHERE id = ${runId} AND status = 'applied')`);
    if (metricsToRestore.length) transaction.push(sql`INSERT INTO exercise_metrics (date, exercise_id, sets_count, reps_count, duration_seconds, weight_value, weight_unit, scope_multiplier, updated_at)
      SELECT item.date, item.exercise_id, item.sets_count, item.reps_count, item.duration_seconds, item.weight_value, item.weight_unit, item.scope_multiplier, NOW()
      FROM jsonb_to_recordset(${JSON.stringify(metricsToRestore)}::jsonb) AS item(date DATE, exercise_id TEXT, sets_count INTEGER, reps_count INTEGER, duration_seconds INTEGER, weight_value NUMERIC, weight_unit TEXT, scope_multiplier INTEGER)
      WHERE EXISTS (SELECT 1 FROM ai_agent_runs WHERE id = ${runId} AND status = 'applied')
      ON CONFLICT (date, exercise_id) DO UPDATE SET sets_count = EXCLUDED.sets_count, reps_count = EXCLUDED.reps_count, duration_seconds = EXCLUDED.duration_seconds, weight_value = EXCLUDED.weight_value, weight_unit = EXCLUDED.weight_unit, scope_multiplier = EXCLUDED.scope_multiplier, updated_at = NOW()`);
    if (metricsToDelete.length) transaction.push(sql`DELETE FROM exercise_metrics USING jsonb_to_recordset(${JSON.stringify(metricsToDelete)}::jsonb) AS item(date DATE, exercise_id TEXT)
      WHERE exercise_metrics.date = item.date AND exercise_metrics.exercise_id = item.exercise_id AND EXISTS (SELECT 1 FROM ai_agent_runs WHERE id = ${runId} AND status = 'applied')`);
    if (doctorsToRestore.length) transaction.push(sql`INSERT INTO doctor_notes (id, kind, title, provider, reference_text, body, linked_dates, photo_attachments, response_transcripts, pinned, note_color, created_at, updated_at)
      SELECT item.note_id, item.kind, item.title, item.provider, item.reference_text, item.body, item.linked_dates, '[]'::jsonb, '[]'::jsonb, item.pinned, item.note_color, NOW(), NOW()
      FROM jsonb_to_recordset(${JSON.stringify(doctorsToRestore)}::jsonb) AS item(note_id TEXT, kind TEXT, title TEXT, provider TEXT, reference_text TEXT, body TEXT, linked_dates JSONB, pinned BOOLEAN, note_color TEXT)
      WHERE EXISTS (SELECT 1 FROM ai_agent_runs WHERE id = ${runId} AND status = 'applied')
      ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, title = EXCLUDED.title, provider = EXCLUDED.provider, reference_text = EXCLUDED.reference_text, body = EXCLUDED.body, linked_dates = EXCLUDED.linked_dates, pinned = EXCLUDED.pinned, note_color = EXCLUDED.note_color, updated_at = NOW()`);
    if (doctorPhotoRemovals.length) transaction.push(sql`UPDATE doctor_notes SET photo_attachments = item.photo_attachments, updated_at = NOW()
      FROM jsonb_to_recordset(${JSON.stringify(doctorPhotoRemovals)}::jsonb) AS item(note_id TEXT, photo_attachments JSONB)
      WHERE doctor_notes.id = item.note_id AND EXISTS (SELECT 1 FROM ai_agent_runs WHERE id = ${runId} AND status = 'applied')`);
    if (doctorsToDelete.length) transaction.push(sql`DELETE FROM doctor_notes USING jsonb_to_recordset(${JSON.stringify(doctorsToDelete)}::jsonb) AS item(note_id TEXT)
      WHERE doctor_notes.id = item.note_id AND EXISTS (SELECT 1 FROM ai_agent_runs WHERE id = ${runId} AND status = 'applied')`);
    if (configPayload.length) transaction.push(sql`INSERT INTO user_config (key, value, updated_at)
      SELECT item.key, item.value, NOW() FROM jsonb_to_recordset(${JSON.stringify(configPayload)}::jsonb) AS item(key TEXT, value JSONB)
      WHERE EXISTS (SELECT 1 FROM ai_agent_runs WHERE id = ${runId} AND status = 'applied')
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`);
    if (undo.chat?.sessionId && undo.chat.messageId) transaction.push(sql`
      UPDATE ai_chat_sessions AS session
      SET messages = updated.messages, updated_at = NOW()
      FROM (
        SELECT jsonb_agg(
          CASE WHEN entry.message->>'id' = ${undo.chat.messageId}
            THEN jsonb_set(entry.message, '{reply,agentPlan,undoneAt}', to_jsonb(NOW()::text), true)
            ELSE entry.message
          END
          ORDER BY entry.ordinality
        ) AS messages
        FROM ai_chat_sessions AS source
        CROSS JOIN LATERAL jsonb_array_elements(source.messages) WITH ORDINALITY AS entry(message, ordinality)
        WHERE source.id = ${undo.chat.sessionId}
      ) AS updated
      WHERE session.id = ${undo.chat.sessionId} AND updated.messages IS NOT NULL
        AND EXISTS (SELECT 1 FROM ai_agent_runs WHERE id = ${runId} AND status = 'applied')`);
    transaction.push(sql`UPDATE ai_agent_runs SET status = 'undone', undone_at = NOW() WHERE id = ${runId} AND status = 'applied'`);
    await sql.transaction(transaction, { isolationLevel: 'Serializable' });

    const affectedDates = Array.from(new Set([
      ...list<NonNullable<UndoPayload['logs']>[number]>(undo.logs).map(item => item.date),
      ...noteUndo.map(item => item.date), ...healthUndo.map(item => item.date),
      ...list<NonNullable<UndoPayload['metrics']>[number]>(undo.metrics).map(item => item.date),
    ])).sort();
    return NextResponse.json({ ok: true, label: rows[0].label, affectedDates, changedConfig: Object.fromEntries(configPayload.map(item => [item.key, item.value])) });
  } catch (error) {
    console.error('[ai-agent undo POST]', error);
    return NextResponse.json({ error: 'Could not undo the AI changes.' }, { status: 500 });
  }
}
