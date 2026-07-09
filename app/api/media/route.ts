import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS user_config (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return new NextResponse('Not found', { status: 404 });

  try {
    await ensureTable();
    const rows = await sql`SELECT value FROM user_config WHERE key = ${`media:${id}`}`;
    const value = rows[0]?.value as { dataUrl?: string } | undefined;
    const dataUrl = value?.dataUrl ?? '';
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return new NextResponse('Not found', { status: 404 });

    const body = Buffer.from(match[2], 'base64');
    return new NextResponse(body, {
      headers: {
        'Content-Type': match[1],
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    console.error('[media GET]', err);
    return new NextResponse('Not found', { status: 404 });
  }
}
