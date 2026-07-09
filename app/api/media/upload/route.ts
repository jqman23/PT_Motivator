import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);
const MAX_DATA_URL_LENGTH = 2_800_000;

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS user_config (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

export async function POST(req: NextRequest) {
  try {
    const { dataUrl, name } = await req.json() as { dataUrl?: string; name?: string };
    if (!dataUrl?.startsWith('data:image/')) return NextResponse.json({ error: 'Image data required' }, { status: 400 });
    if (dataUrl.length > MAX_DATA_URL_LENGTH) return NextResponse.json({ error: 'Image is too large after compression' }, { status: 413 });

    const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await ensureTable();
    await sql`
      INSERT INTO user_config (key, value, updated_at)
      VALUES (${`media:${id}`}, ${JSON.stringify({ dataUrl, name: name ?? '', kind: 'exercise-image' })}::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
    return NextResponse.json({ url: `/api/media?id=${id}`, id });
  } catch (err) {
    console.error('[media upload]', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
