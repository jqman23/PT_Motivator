import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function ensureTable() {
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
    const {
      date, sleep_hours, sleep_quality, energy, mood, pain,
      sleep_notes, sleep_quality_notes, energy_notes, mood_notes, pain_notes, general_notes, treatment_notes,
    } = await req.json();
    if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 });
    await ensureTable();
    await sql`
      INSERT INTO health_log (date, sleep_hours, sleep_quality, energy, mood, pain,
        sleep_notes, sleep_quality_notes, energy_notes, mood_notes, pain_notes, general_notes, treatment_notes, updated_at)
      VALUES (${date}::date, ${sleep_hours}, ${sleep_quality}, ${energy}, ${mood}, ${pain},
        ${sleep_notes ?? null}, ${sleep_quality_notes ?? null}, ${energy_notes ?? null}, ${mood_notes ?? null},
        ${pain_notes ?? null}, ${general_notes ?? null}, ${treatment_notes ?? null}, NOW())
      ON CONFLICT (date) DO UPDATE SET
        sleep_hours = ${sleep_hours},
        sleep_quality = ${sleep_quality},
        energy = ${energy},
        mood = ${mood},
        pain = ${pain},
        sleep_notes = ${sleep_notes ?? null},
        sleep_quality_notes = ${sleep_quality_notes ?? null},
        energy_notes = ${energy_notes ?? null},
        mood_notes = ${mood_notes ?? null},
        pain_notes = ${pain_notes ?? null},
        general_notes = ${general_notes ?? null},
        treatment_notes = ${treatment_notes ?? null},
        updated_at = NOW()
    `;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const date = new URL(req.url).searchParams.get('date');
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 });
  try {
    await sql`DELETE FROM health_log WHERE date = ${date}::date`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
