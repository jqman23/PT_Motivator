import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

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
      SELECT
        COALESCE(l.date, n.date)::text AS date,
        COALESCE(l.completed, false) AS completed,
        COALESCE(n.note, '') AS note
      FROM workout_log l
      FULL OUTER JOIN exercise_notes n
        ON l.date = n.date AND l.exercise_id = n.exercise_id
      WHERE COALESCE(l.exercise_id, n.exercise_id) = ${exerciseId}
        AND (
          COALESCE(l.completed, false) = true
          OR COALESCE(NULLIF(TRIM(n.note), ''), '') <> ''
        )
      ORDER BY COALESCE(l.date, n.date) DESC
      LIMIT ${limit}
    `;

    return NextResponse.json({ rows });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
