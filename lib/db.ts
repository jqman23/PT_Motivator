import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export type NotePhotoAttachment = {
  id: string;
  name: string;
  type: string;
  dataUrl: string;
  createdAt: string;
};

const MAX_NOTE_PHOTOS = 5;
const MAX_PHOTO_DATA_URL_LENGTH = 2_000_000;

function normalizePhotoAttachments(value: unknown): NotePhotoAttachment[] {
  if (!Array.isArray(value)) return [];

  const photos: NotePhotoAttachment[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Partial<NotePhotoAttachment>;
    if (typeof raw.dataUrl !== 'string') continue;
    if (!raw.dataUrl.startsWith('data:image/')) continue;
    if (raw.dataUrl.length > MAX_PHOTO_DATA_URL_LENGTH) continue;

    photos.push({
      id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 80) : `photo-${Date.now()}-${photos.length}`,
      name: typeof raw.name === 'string' ? raw.name.slice(0, 160) : 'Exercise photo',
      type: typeof raw.type === 'string' ? raw.type.slice(0, 80) : 'image/jpeg',
      dataUrl: raw.dataUrl,
      createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : new Date().toISOString(),
    });

    if (photos.length >= MAX_NOTE_PHOTOS) break;
  }
  return photos;
}

async function ensureExerciseNotesTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS exercise_notes (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      exercise_id TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(date, exercise_id)
    )
  `;
  await sql`ALTER TABLE exercise_notes ADD COLUMN IF NOT EXISTS photo_attachments JSONB NOT NULL DEFAULT '[]'::jsonb`;
}

export async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS user_config (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS workout_log (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      exercise_id TEXT NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(date, exercise_id)
    )
  `;

  await ensureExerciseNotesTable();

  await sql`
    CREATE TABLE IF NOT EXISTS health_log (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL UNIQUE,
      sleep_hours NUMERIC(4,1),
      sleep_quality NUMERIC(4,1),
      energy NUMERIC(4,1),
      mood NUMERIC(4,1),
      pain NUMERIC(4,1),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE health_log ADD COLUMN IF NOT EXISTS sleep_notes TEXT`;
  await sql`ALTER TABLE health_log ADD COLUMN IF NOT EXISTS sleep_quality_notes TEXT`;
  await sql`ALTER TABLE health_log ADD COLUMN IF NOT EXISTS energy_notes TEXT`;
  await sql`ALTER TABLE health_log ADD COLUMN IF NOT EXISTS mood_notes TEXT`;
  await sql`ALTER TABLE health_log ADD COLUMN IF NOT EXISTS pain_notes TEXT`;
  await sql`ALTER TABLE health_log ADD COLUMN IF NOT EXISTS general_notes TEXT`;
  await sql`ALTER TABLE health_log ADD COLUMN IF NOT EXISTS treatment_notes TEXT`;
  await sql`ALTER TABLE health_log ADD COLUMN IF NOT EXISTS general_note_photos JSONB NOT NULL DEFAULT '[]'::jsonb`;
  await sql`ALTER TABLE health_log ALTER COLUMN sleep_quality TYPE NUMERIC(4,1)`;
  await sql`ALTER TABLE health_log ALTER COLUMN energy TYPE NUMERIC(4,1)`;
  await sql`ALTER TABLE health_log ALTER COLUMN mood TYPE NUMERIC(4,1)`;
  await sql`ALTER TABLE health_log ALTER COLUMN pain TYPE NUMERIC(4,1)`;

  await sql`
    CREATE TABLE IF NOT EXISTS exercise_metrics (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      exercise_id TEXT NOT NULL,
      sets_count INTEGER,
      reps_count INTEGER,
      duration_seconds INTEGER,
      weight_value NUMERIC(8,2),
      weight_unit TEXT NOT NULL DEFAULT 'lb',
      scope_multiplier INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(date, exercise_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS doctor_notes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'question',
      title TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT '',
      reference_text TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      linked_dates JSONB NOT NULL DEFAULT '[]'::jsonb,
      photo_attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
      response_transcripts JSONB NOT NULL DEFAULT '[]'::jsonb,
      pinned BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE doctor_notes ADD COLUMN IF NOT EXISTS note_color TEXT NOT NULL DEFAULT 'none'`;

  await sql`
    CREATE TABLE IF NOT EXISTS ai_chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      preview TEXT NOT NULL DEFAULT '',
      messages JSONB NOT NULL DEFAULT '[]'::jsonb,
      message_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS ai_chat_sessions_updated_idx ON ai_chat_sessions (updated_at DESC, id DESC)`;
}

export async function getLogForRange(startDate: string, endDate: string) {
  return sql`
    SELECT date::text, exercise_id, completed
    FROM workout_log
    WHERE date >= ${startDate}::date AND date <= ${endDate}::date
  `;
}

export async function getLogForDate(date: string) {
  return sql`
    SELECT date::text, exercise_id, completed
    FROM workout_log
    WHERE date = ${date}::date
  `;
}

export async function upsertLog(date: string, exerciseId: string, completed: boolean) {
  await sql`
    INSERT INTO workout_log (date, exercise_id, completed, updated_at)
    VALUES (${date}::date, ${exerciseId}, ${completed}, NOW())
    ON CONFLICT (date, exercise_id)
    DO UPDATE SET completed = ${completed}, updated_at = NOW()
  `;
}

export async function getNotesForDate(date: string, includePhotos = true) {
  if (!includePhotos) {
    return sql`
      SELECT exercise_id, note
      FROM exercise_notes
      WHERE date = ${date}::date
    `;
  }
  return sql`
    SELECT exercise_id, note, COALESCE(photo_attachments, '[]'::jsonb) AS photo_attachments
    FROM exercise_notes
    WHERE date = ${date}::date
  `;
}

export async function getNotesForRange(startDate: string, endDate: string) {
  return sql`
    SELECT date::text, exercise_id, note
    FROM exercise_notes
    WHERE date >= ${startDate}::date AND date <= ${endDate}::date
      AND note != ''
    ORDER BY date, exercise_id
  `;
}

export async function getHealthForDate(date: string) {
  return sql`
    SELECT id, date, sleep_hours, sleep_quality, energy, mood, pain,
      sleep_notes, sleep_quality_notes, energy_notes, mood_notes, pain_notes,
      general_notes, treatment_notes, updated_at
    FROM health_log
    WHERE date = ${date}::date
    LIMIT 1
  `;
}

export async function deleteLogForDate(date: string) {
  await sql`DELETE FROM workout_log WHERE date = ${date}::date`;
}

export async function deleteNotesForDate(date: string) {
  await sql`DELETE FROM exercise_notes WHERE date = ${date}::date`;
}

export async function getConfig(key: string): Promise<unknown | null> {
  try {
    const rows = await sql`SELECT value FROM user_config WHERE key = ${key}`;
    return rows.length > 0 ? rows[0].value : null;
  } catch {
    return null;
  }
}

export async function getConfigs(keys: string[]): Promise<Record<string, unknown>> {
  if (!keys.length) return {};
  try {
    const rows = await sql`
      SELECT key, value
      FROM user_config
      WHERE key IN (SELECT jsonb_array_elements_text(${JSON.stringify(keys.slice(0, 20))}::jsonb))
    `;
    return Object.fromEntries(rows.map(row => [String(row.key), row.value]));
  } catch {
    return {};
  }
}

export async function setConfig(key: string, value: unknown) {
  await sql`
    INSERT INTO user_config (key, value, updated_at)
    VALUES (${key}, ${JSON.stringify(value)}::jsonb, NOW())
    ON CONFLICT (key)
    DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
}

export async function setConfigs(values: Record<string, unknown>) {
  const entries = Object.entries(values).slice(0, 20).map(([key, value]) => ({ key, value }));
  if (!entries.length) return;
  await sql`
    INSERT INTO user_config (key, value, updated_at)
    SELECT item.key, item.value, NOW()
    FROM jsonb_to_recordset(${JSON.stringify(entries)}::jsonb) AS item(key TEXT, value JSONB)
    ON CONFLICT (key)
    DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
}

export async function getRecentNotes(exerciseId: string, beforeDate: string): Promise<Array<{ note: string }>> {
  const rows = await sql`
    SELECT note
    FROM exercise_notes
    WHERE exercise_id = ${exerciseId}
      AND date < ${beforeDate}::date
      AND date >= ${beforeDate}::date - INTERVAL '21 days'
      AND note != ''
    GROUP BY note
    ORDER BY MAX(date) DESC
    LIMIT 8
  `;
  return rows as Array<{ note: string }>;
}

export async function upsertNote(date: string, exerciseId: string, note: string, photoAttachments?: unknown) {

  if (photoAttachments === undefined) {
    await sql`
      INSERT INTO exercise_notes (date, exercise_id, note, updated_at)
      VALUES (${date}::date, ${exerciseId}, ${note}, NOW())
      ON CONFLICT (date, exercise_id)
      DO UPDATE SET note = ${note}, updated_at = NOW()
    `;
    return;
  }

  const cleanPhotos = normalizePhotoAttachments(photoAttachments);
  await sql`
    INSERT INTO exercise_notes (date, exercise_id, note, photo_attachments, updated_at)
    VALUES (${date}::date, ${exerciseId}, ${note}, ${JSON.stringify(cleanPhotos)}::jsonb, NOW())
    ON CONFLICT (date, exercise_id)
    DO UPDATE SET note = ${note}, photo_attachments = ${JSON.stringify(cleanPhotos)}::jsonb, updated_at = NOW()
  `;
}

export async function renameExerciseId(oldId: string, newId: string) {
  if (!oldId || !newId || oldId === newId) return;

  await sql`
    INSERT INTO workout_log (date, exercise_id, completed, updated_at)
    SELECT date, ${newId}, completed, NOW()
    FROM workout_log
    WHERE exercise_id = ${oldId}
    ON CONFLICT (date, exercise_id)
    DO UPDATE SET completed = workout_log.completed OR EXCLUDED.completed, updated_at = NOW()
  `;

  await sql`
    INSERT INTO exercise_notes (date, exercise_id, note, photo_attachments, updated_at)
    SELECT date, ${newId}, note, COALESCE(photo_attachments, '[]'::jsonb), NOW()
    FROM exercise_notes
    WHERE exercise_id = ${oldId}
    ON CONFLICT (date, exercise_id)
    DO UPDATE SET
      note = CASE
        WHEN exercise_notes.note = '' THEN EXCLUDED.note
        WHEN EXCLUDED.note = '' THEN exercise_notes.note
        WHEN POSITION(EXCLUDED.note IN exercise_notes.note) > 0 THEN exercise_notes.note
        ELSE exercise_notes.note || E'\n' || EXCLUDED.note
      END,
      photo_attachments = CASE
        WHEN jsonb_array_length(COALESCE(exercise_notes.photo_attachments, '[]'::jsonb)) = 0 THEN EXCLUDED.photo_attachments
        WHEN jsonb_array_length(COALESCE(EXCLUDED.photo_attachments, '[]'::jsonb)) = 0 THEN exercise_notes.photo_attachments
        ELSE exercise_notes.photo_attachments || EXCLUDED.photo_attachments
      END,
      updated_at = NOW()
  `;

  await sql`DELETE FROM workout_log WHERE exercise_id = ${oldId}`;
  await sql`DELETE FROM exercise_notes WHERE exercise_id = ${oldId}`;
}
