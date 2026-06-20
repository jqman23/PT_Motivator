import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

// Bulk save all exercise completion data for one day.
// Notes are merged individually so stale client state cannot wipe stored notes.
export async function POST(req: NextRequest) {
  try {
    const { date, log, notes } = await req.json() as {
      date: string;
      log: { exerciseId: string; completed: boolean }[];
      notes?: { exerciseId: string; note: string }[];
    };
    if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 });

    // Completion state is an intentional full-day override.
    await sql`DELETE FROM workout_log WHERE date = ${date}::date`;

    for (const entry of log ?? []) {
      await sql`
        INSERT INTO workout_log (date, exercise_id, completed, updated_at)
        VALUES (${date}::date, ${entry.exerciseId}, ${entry.completed}, NOW())
      `;
    }

    // Do not blanket-clear notes. Only notes included in this request are changed;
    // missing notes stay preserved in the database.
    for (const n of notes ?? []) {
      const clean = typeof n.note === 'string' ? n.note.trim() : '';
      if (!clean) continue;
      await sql`
        INSERT INTO exercise_notes (date, exercise_id, note, updated_at)
        VALUES (${date}::date, ${n.exerciseId}, ${clean}, NOW())
        ON CONFLICT (date, exercise_id)
        DO UPDATE SET note = ${clean}, updated_at = NOW()
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
