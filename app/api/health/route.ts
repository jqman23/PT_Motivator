import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS health_log (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL UNIQUE,
      sleep_hours NUMERIC(4,1),
      sleep_quality INTEGER,
      energy INTEGER,
      mood INTEGER,
      pain INTEGER,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const date = params.get('date');
  const start = params.get('start');
  const end = params.get('end');

  try {
    await ensureTable();
    if (start && end) {
      const rows = await sql`SELECT * FROM health_log WHERE date >= ${start}::date AND date <= ${end}::date ORDER BY date`;
      return NextResponse.json({ rows });
    }
    if (!date) return NextResponse.json({ error: 'date or start+end required' }, { status: 400 });
    const rows = await sql`SELECT * FROM health_log WHERE date = ${date}::date`;
    return NextResponse.json({ row: rows[0] ?? null });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { date, sleep_hours, sleep_quality, energy, mood, pain } = await req.json();
    if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 });
    await ensureTable();
    await sql`
      INSERT INTO health_log (date, sleep_hours, sleep_quality, energy, mood, pain, updated_at)
      VALUES (${date}::date, ${sleep_hours}, ${sleep_quality}, ${energy}, ${mood}, ${pain}, NOW())
      ON CONFLICT (date)
      DO UPDATE SET
        sleep_hours = ${sleep_hours},
        sleep_quality = ${sleep_quality},
        energy = ${energy},
        mood = ${mood},
        pain = ${pain},
        updated_at = NOW()
    `;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
