import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { stripSecretNotes } from '@/lib/secretNotes';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const exerciseId = searchParams.get('exerciseId');
  const limitRaw = Number(searchParams.get('limit') ?? 120);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 365) : 120;

  if (!exerciseId) {
    return NextResponse.json({ error: 'exerciseId required' }, { status: 400 });
  }

  try {
    const rows = await sql`
      WITH tracked_dates AS (
        SELECT date FROM workout_log WHERE exercise_id = ${exerciseId}
        UNION
        SELECT date FROM exercise_notes WHERE exercise_id = ${exerciseId}
        UNION
        SELECT date FROM exercise_metrics WHERE exercise_id = ${exerciseId}
      )
      SELECT
        d.date::text AS date,
        COALESCE(l.completed, false) AS completed,
        COALESCE(n.note, '') AS note,
        m.sets_count,
        m.reps_count,
        m.duration_seconds,
        m.weight_value,
        m.weight_unit,
        m.scope_multiplier
      FROM tracked_dates d
      LEFT JOIN workout_log l ON l.date = d.date AND l.exercise_id = ${exerciseId}
      LEFT JOIN exercise_notes n ON n.date = d.date AND n.exercise_id = ${exerciseId}
      LEFT JOIN exercise_metrics m ON m.date = d.date AND m.exercise_id = ${exerciseId}
      WHERE (
          COALESCE(l.completed, false) = true
          OR COALESCE(NULLIF(TRIM(n.note), ''), '') <> ''
          OR m.id IS NOT NULL
        )
      ORDER BY d.date DESC
      LIMIT ${limit}
    `;

    return NextResponse.json({
      rows: rows.map(row => ({ ...row, note: stripSecretNotes(String(row.note ?? '')) })),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
