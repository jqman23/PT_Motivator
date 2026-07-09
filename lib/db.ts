import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

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
  await sql`ALTER TABLE health_log ALTER COLUMN sleep_quality TYPE NUMERIC(4,1)`;
  await sql`ALTER TABLE health_log ALTER COLUMN energy TYPE NUMERIC(4,1)`;
  await sql`ALTER TABLE health_log ALTER COLUMN mood TYPE NUMERIC(4,1)`;
  await sql`ALTER TABLE health_log ALTER COLUMN pain TYPE NUMERIC(4,1)`;
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

export async function getNotesForDate(date: string) {
  return sql`
    SELECT exercise_id, note
    FROM exercise_notes
    WHERE date = ${date}::date
  `;
}

export async function getHealthForDate(date: string) {
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
  return sql`
    SELECT *
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

export async function setConfig(key: string, value: unknown) {
  await sql`
    INSERT INTO user_config (key, value, updated_at)
    VALUES (${key}, ${JSON.stringify(value)}::jsonb, NOW())
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

export async function upsertNote(date: string, exerciseId: string, note: string) {
  await sql`
    INSERT INTO exercise_notes (date, exercise_id, note, updated_at)
    VALUES (${date}::date, ${exerciseId}, ${note}, NOW())
    ON CONFLICT (date, exercise_id)
    DO UPDATE SET note = ${note}, updated_at = NOW()
  `;
}
