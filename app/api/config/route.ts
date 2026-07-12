import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const key = params.get('key') ?? '';
  const keys = (params.get('keys') ?? '').split(',').map(value => value.trim()).filter(Boolean).slice(0, 20);
  if (keys.length) {
    try {
      const rows = await sql`
        SELECT key, value
        FROM user_config
        WHERE key IN (SELECT jsonb_array_elements_text(${JSON.stringify(keys)}::jsonb))
      `;
      return NextResponse.json({ values: Object.fromEntries(rows.map(row => [row.key, row.value])) });
    } catch (err) {
      console.error('[config GET batch]', err);
      return NextResponse.json({ values: {} });
    }
  }
  if (!key) return NextResponse.json({ value: null });
  try {
    const rows = await sql`SELECT value FROM user_config WHERE key = ${key}`;
    return NextResponse.json({ value: rows.length > 0 ? rows[0].value : null });
  } catch (err) {
    console.error('[config GET]', err);
    return NextResponse.json({ value: null });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { key, value } = await req.json() as { key: string; value: unknown };
    if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });
    await sql`
      INSERT INTO user_config (key, value, updated_at)
      VALUES (${key}, ${JSON.stringify(value)}::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[config POST]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
