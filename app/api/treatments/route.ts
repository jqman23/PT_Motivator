import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

function pad(n: number) { return String(n).padStart(2, '0'); }
function offsetDate(base: string, days: number): string {
  const d = new Date(base + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function datesInRange(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = start;
  while (cur <= end) { out.push(cur); cur = offsetDate(cur, 1); }
  return out;
}

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const start = params.get('start');
  const end = params.get('end');
  const date = params.get('date');

  try {
    if (start && end) {
      const rows = await sql`
        SELECT date, treatment_notes
        FROM health_log
        WHERE date >= ${start}::date AND date <= ${end}::date
        ORDER BY date
      `;
      return NextResponse.json({ rows });
    }
    if (!date) return NextResponse.json({ error: 'date or start+end required' }, { status: 400 });
    const rows = await sql`SELECT date, treatment_notes FROM health_log WHERE date = ${date}::date`;
    return NextResponse.json({ row: rows[0] ?? null });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { date, dates, treatment_notes } = await req.json();
    const targetDates: string[] = Array.isArray(dates) ? dates : date ? [date] : [];
    if (!targetDates.length) return NextResponse.json({ error: 'date or dates required' }, { status: 400 });

    for (const d of targetDates) {
      await sql`
        INSERT INTO health_log (date, treatment_notes, updated_at)
        VALUES (${d}::date, ${treatment_notes ?? null}, NOW())
        ON CONFLICT (date) DO UPDATE SET
          treatment_notes = ${treatment_notes ?? null},
          updated_at = NOW()
      `;
    }
    return NextResponse.json({ ok: true, count: targetDates.length });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const date = params.get('date');
  const start = params.get('start');
  const end = params.get('end');

  try {
    const targetDates = start && end ? datesInRange(start, end) : date ? [date] : [];
    if (!targetDates.length) return NextResponse.json({ error: 'date or start+end required' }, { status: 400 });

    for (const d of targetDates) {
      await sql`
        INSERT INTO health_log (date, treatment_notes, updated_at)
        VALUES (${d}::date, null, NOW())
        ON CONFLICT (date) DO UPDATE SET
          treatment_notes = null,
          updated_at = NOW()
      `;
    }
    return NextResponse.json({ ok: true, count: targetDates.length });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
