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
  metrics?: unknown;
  operationId?: unknown;
};

type CleanMetric = {
  exerciseId: string;
  sets: number;
  reps: number | null;
  durationSeconds: number | null;
  weight: number | null;
  weightUnit: 'lb' | 'kg';
  scopeMultiplier: 1 | 2 | 4;
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

function cleanMetric(value: unknown): CleanMetric | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as MetricInput;
  if (!validExerciseId(input.exerciseId)) return null;
  const sets = nullableInteger(input.sets, 1, 99);
  const reps = nullableInteger(input.reps, 1, 9999);
  const durationSeconds = nullableInteger(input.durationSeconds, 1, 86400);
  if (!sets || (!reps && !durationSeconds) || (reps && durationSeconds)) return null;
  return {
    exerciseId: input.exerciseId.trim(),
    sets,
    reps,
    durationSeconds,
    weight: nullableDecimal(input.weight, 0, 9999.99),
    weightUnit: input.weightUnit === 'kg' ? 'kg' : 'lb',
    scopeMultiplier: input.scopeMultiplier === 2 || input.scopeMultiplier === 4 ? input.scopeMultiplier : 1,
  };
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
  if (validDate(date) && Array.isArray(body.metrics)) {
    if (body.metrics.length < 1 || body.metrics.length > 50) {
      return NextResponse.json({ error: 'Provide between 1 and 50 workout metrics.' }, { status: 400 });
    }
    const metrics = body.metrics.map(cleanMetric);
    if (metrics.some(metric => !metric)) {
      return NextResponse.json({ error: 'Each workout metric needs an exercise, sets, and either reps or duration.' }, { status: 400 });
    }
    const cleanMetrics = metrics as CleanMetric[];
    const operationId = typeof body.operationId === 'string' && /^[A-Za-z0-9-]{10,100}$/.test(body.operationId)
      ? body.operationId
      : '';
    if (!operationId) {
      return NextResponse.json({ error: 'A valid workout operationId is required.' }, { status: 400 });
    }
    if (new Set(cleanMetrics.map(metric => metric.exerciseId)).size !== cleanMetrics.length) {
      return NextResponse.json({ error: 'Combine duplicate exercises before saving workout metrics.' }, { status: 400 });
    }

    try {
      const payload = JSON.stringify(cleanMetrics.map(metric => ({
        exercise_id: metric.exerciseId,
        sets_count: metric.sets,
        reps_count: metric.reps,
        duration_seconds: metric.durationSeconds,
        weight_value: metric.weight,
        weight_unit: metric.weightUnit,
        scope_multiplier: metric.scopeMultiplier,
      })));
      const operationKey = `workoutMetricRun:${operationId}`;
      const rows = await sql`
        WITH input AS (
          SELECT exercise_id, sets_count, reps_count, duration_seconds, weight_value, weight_unit, scope_multiplier
          FROM jsonb_to_recordset(${payload}::jsonb) AS metric(
            exercise_id TEXT,
            sets_count INTEGER,
            reps_count INTEGER,
            duration_seconds INTEGER,
            weight_value NUMERIC,
            weight_unit TEXT,
            scope_multiplier INTEGER
          )
        ), conflicts AS (
          SELECT input.exercise_id
          FROM input
          JOIN exercise_metrics existing
            ON existing.date = ${date}::date AND existing.exercise_id = input.exercise_id
          WHERE existing.reps_count IS DISTINCT FROM input.reps_count
             OR existing.duration_seconds IS DISTINCT FROM input.duration_seconds
             OR existing.scope_multiplier IS DISTINCT FROM input.scope_multiplier
        ), operation AS (
          INSERT INTO user_config (key, value, updated_at)
          SELECT ${operationKey}, ${JSON.stringify({ date })}::jsonb, NOW()
          WHERE NOT EXISTS (SELECT 1 FROM conflicts)
          ON CONFLICT (key) DO NOTHING
          RETURNING key
        ), saved AS (
          INSERT INTO exercise_metrics (
            date, exercise_id, sets_count, reps_count, duration_seconds, weight_value, weight_unit, scope_multiplier, updated_at
          )
          SELECT ${date}::date, input.exercise_id, input.sets_count, input.reps_count, input.duration_seconds,
            input.weight_value, input.weight_unit, input.scope_multiplier, NOW()
          FROM input
          WHERE EXISTS (SELECT 1 FROM operation)
          ON CONFLICT (date, exercise_id)
          DO UPDATE SET
            sets_count = LEAST(99, COALESCE(exercise_metrics.sets_count, 0) + COALESCE(EXCLUDED.sets_count, 0)),
            weight_value = COALESCE(EXCLUDED.weight_value, exercise_metrics.weight_value),
            weight_unit = CASE WHEN EXCLUDED.weight_value IS NULL THEN exercise_metrics.weight_unit ELSE EXCLUDED.weight_unit END,
            updated_at = NOW()
          RETURNING exercise_id, sets_count, reps_count, duration_seconds, weight_value, weight_unit, scope_multiplier
        )
        SELECT
          (SELECT COUNT(*)::int FROM conflicts) AS conflict_count,
          (SELECT COUNT(*)::int FROM operation) AS operation_count,
          COALESCE((SELECT jsonb_agg(to_jsonb(saved_row)) FROM saved AS saved_row), '[]'::jsonb) AS metrics
      `;
      const result = rows[0] as { conflict_count?: number; operation_count?: number; metrics?: unknown[] } | undefined;
      if (Number(result?.conflict_count ?? 0) > 0) {
        return NextResponse.json({
          error: 'Today already has a different metric for one of these exercises. Edit it with double tap before retrying the workout save.',
        }, { status: 409 });
      }
      return NextResponse.json({ ok: true, alreadySaved: Number(result?.operation_count ?? 0) === 0, metrics: result?.metrics ?? [] });
    } catch (error) {
      console.error('Exercise metrics batch POST failed', error);
      return NextResponse.json({ error: 'Could not save workout metrics.' }, { status: 500 });
    }
  }

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
