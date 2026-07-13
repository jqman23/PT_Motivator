import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type MetricInput = {
  date?: unknown;
  exerciseId?: unknown;
  sets?: unknown;
  reps?: unknown;
  durationSeconds?: unknown;
  weight?: unknown;
  weightUnit?: unknown;
  scopeMultiplier?: unknown;
  add?: unknown;
};

function validDate(value: unknown): value is string {
  return typeof value === 'string' && DATE_PATTERN.test(value);
}

function validExerciseId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 180;
}

function nullableInteger(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function nullableDecimal(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(min, Math.min(max, Math.round(parsed * 100) / 100));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  const exerciseId = searchParams.get('exerciseId');

  if (!validDate(date)) {
    return NextResponse.json({ error: 'A valid date is required.' }, { status: 400 });
  }

  try {
    if (!exerciseId) {
      const rows = await sql`
        SELECT exercise_id, sets_count, reps_count, duration_seconds, weight_value, weight_unit, scope_multiplier
        FROM exercise_metrics
        WHERE date = ${date}::date
      `;
      return NextResponse.json({ rows });
    }
    if (!validExerciseId(exerciseId)) {
      return NextResponse.json({ error: 'A valid exerciseId is required.' }, { status: 400 });
    }
    const currentRows = await sql`
      SELECT date::text, exercise_id, sets_count, reps_count, duration_seconds, weight_value, weight_unit, scope_multiplier
      FROM exercise_metrics
      WHERE date = ${date}::date AND exercise_id = ${exerciseId}
      LIMIT 1
    `;
    const previousRows = await sql`
      SELECT date::text, exercise_id, sets_count, reps_count, duration_seconds, weight_value, weight_unit, scope_multiplier
      FROM exercise_metrics
      WHERE date < ${date}::date AND exercise_id = ${exerciseId}
      ORDER BY date DESC
      LIMIT 1
    `;
    return NextResponse.json({ current: currentRows[0] ?? null, previous: previousRows[0] ?? null });
  } catch (error) {
    console.error('Exercise metrics GET failed', error);
    return NextResponse.json({ error: 'Could not load exercise metrics.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: MetricInput;
  try {
    body = await req.json() as MetricInput;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { date, exerciseId } = body;
  if (!validDate(date) || !validExerciseId(exerciseId)) {
    return NextResponse.json({ error: 'A valid date and exerciseId are required.' }, { status: 400 });
  }

  const sets = nullableInteger(body.sets, 1, 99);
  const reps = nullableInteger(body.reps, 1, 9999);
  const durationSeconds = nullableInteger(body.durationSeconds, 1, 86400);
  const weight = nullableDecimal(body.weight, 0, 9999.99);
  const weightUnit = body.weightUnit === 'kg' ? 'kg' : 'lb';
  const scopeMultiplier = body.scopeMultiplier === 2 || body.scopeMultiplier === 4 ? body.scopeMultiplier : 1;
  const add = body.add === true;

  try {
    const rows = await sql`
      INSERT INTO exercise_metrics (
        date, exercise_id, sets_count, reps_count, duration_seconds, weight_value, weight_unit, scope_multiplier, updated_at
      )
      VALUES (
        ${date}::date, ${exerciseId}, ${sets}, ${reps}, ${durationSeconds}, ${weight}, ${weightUnit}, ${scopeMultiplier}, NOW()
      )
      ON CONFLICT (date, exercise_id)
      DO UPDATE SET
        sets_count = CASE
          WHEN ${add}
            AND exercise_metrics.reps_count IS NOT DISTINCT FROM EXCLUDED.reps_count
            AND exercise_metrics.duration_seconds IS NOT DISTINCT FROM EXCLUDED.duration_seconds
            AND exercise_metrics.scope_multiplier = EXCLUDED.scope_multiplier
          THEN LEAST(99, COALESCE(exercise_metrics.sets_count, 0) + COALESCE(EXCLUDED.sets_count, 0))
          ELSE EXCLUDED.sets_count
        END,
        reps_count = EXCLUDED.reps_count,
        duration_seconds = EXCLUDED.duration_seconds,
        weight_value = CASE
          WHEN ${add} AND EXCLUDED.weight_value IS NULL THEN exercise_metrics.weight_value
          ELSE EXCLUDED.weight_value
        END,
        weight_unit = CASE
          WHEN ${add} AND EXCLUDED.weight_value IS NULL THEN exercise_metrics.weight_unit
          ELSE EXCLUDED.weight_unit
        END,
        scope_multiplier = EXCLUDED.scope_multiplier,
        updated_at = NOW()
      WHERE NOT ${add}
        OR (
          exercise_metrics.reps_count IS NOT DISTINCT FROM EXCLUDED.reps_count
          AND exercise_metrics.duration_seconds IS NOT DISTINCT FROM EXCLUDED.duration_seconds
          AND exercise_metrics.scope_multiplier = EXCLUDED.scope_multiplier
        )
      RETURNING date::text, exercise_id, sets_count, reps_count, duration_seconds, weight_value, weight_unit, scope_multiplier
    `;
    if (!rows[0]) {
      return NextResponse.json({
        error: 'Today already has a different metric for this exercise. Edit it with double tap before adding this timer result.',
      }, { status: 409 });
    }
    return NextResponse.json({ ok: true, metric: rows[0] });
  } catch (error) {
    console.error('Exercise metrics POST failed', error);
    return NextResponse.json({ error: 'Could not save exercise metrics.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  const exerciseId = searchParams.get('exerciseId');

  if (!validDate(date) || !validExerciseId(exerciseId)) {
    return NextResponse.json({ error: 'A valid date and exerciseId are required.' }, { status: 400 });
  }

  try {
    await sql`
      DELETE FROM exercise_metrics
      WHERE date = ${date}::date AND exercise_id = ${exerciseId}
    `;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Exercise metrics DELETE failed', error);
    return NextResponse.json({ error: 'Could not clear exercise metrics.' }, { status: 500 });
  }
}
