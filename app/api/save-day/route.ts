import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

// Bulk save all exercise + notes data for one day — last-write-wins override.
export async function POST(req: NextRequest) {
  try {
    const { date, log, notes } = await req.json() as {
      date: string;
      log: { exerciseId: string; completed: boolean }[];
      notes: { exerciseId: string; note: string }[];
    };
    if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 });

    // Wipe existing data for the day
    await sql`DELETE FROM workout_log WHERE date = ${date}::date`;
    await sql`DELETE FROM exercise_notes WHERE date = ${date}::date`;

    // Re-insert all log entries
    for (const entry of log) {
      await sql`
        INSERT INTO workout_log (date, exercise_id, completed, updated_at)
        VALUES (${date}::date, ${entry.exerciseId}, ${entry.completed}, NOW())
      `;
    }

    // Re-insert non-empty notes
    for (const n of notes) {
      if (n.note) {
        await sql`
          INSERT INTO exercise_notes (date, exercise_id, note, updated_at)
          VALUES (${date}::date, ${n.exerciseId}, ${n.note}, NOW())
        `;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
