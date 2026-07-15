import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { aiChatPreview, aiChatTitle, normalizeAiChatMessages } from '@/lib/aiChatHistory';

const sql = neon(process.env.DATABASE_URL!);
const DEFAULT_PAGE_SIZE = 30;

function cleanText(value: unknown, limit: number) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function sessionSummary(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    preview: String(row.preview ?? ''),
    messageCount: Number(row.message_count ?? 0),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function parseCursor(value: string) {
  const separator = value.lastIndexOf('|');
  if (separator < 1) return null;
  const updatedAt = value.slice(0, separator);
  const id = cleanText(value.slice(separator + 1), 100);
  return id && !Number.isNaN(Date.parse(updatedAt)) ? { updatedAt, id } : null;
}

export async function GET(req: NextRequest) {
  try {
    const params = new URL(req.url).searchParams;
    const id = cleanText(params.get('id'), 100);
    if (id) {
      const rows = await sql`
        SELECT id, title, preview, messages, message_count, created_at, updated_at
        FROM ai_chat_sessions
        WHERE id = ${id}
        LIMIT 1
      `;
      if (!rows.length) return NextResponse.json({ error: 'Chat not found.' }, { status: 404 });
      return NextResponse.json({
        session: {
          ...sessionSummary(rows[0]),
          messages: normalizeAiChatMessages(rows[0].messages),
        },
      });
    }

    const requestedLimit = Number(params.get('limit') ?? DEFAULT_PAGE_SIZE);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 1), 50) : DEFAULT_PAGE_SIZE;
    const cursor = parseCursor(params.get('cursor') ?? '');
    const rows = cursor
      ? await sql`
          SELECT id, title, preview, message_count, created_at, updated_at
          FROM ai_chat_sessions
          WHERE (updated_at, id) < (${cursor.updatedAt}::timestamptz, ${cursor.id})
          ORDER BY updated_at DESC, id DESC
          LIMIT ${limit + 1}
        `
      : await sql`
          SELECT id, title, preview, message_count, created_at, updated_at
          FROM ai_chat_sessions
          ORDER BY updated_at DESC, id DESC
          LIMIT ${limit + 1}
        `;
    const hasMore = rows.length > limit;
    const visibleRows = rows.slice(0, limit);
    const last = visibleRows.at(-1);
    return NextResponse.json({
      sessions: visibleRows.map(row => sessionSummary(row)),
      nextCursor: hasMore && last ? `${new Date(String(last.updated_at)).toISOString()}|${String(last.id)}` : null,
    });
  } catch (error) {
    console.error('[ai-chat-sessions GET]', error);
    return NextResponse.json({ error: 'Could not load AI chat history.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const id = cleanText(body.id, 100);
    const messages = normalizeAiChatMessages(body.messages);
    if (!id || !messages.length) return NextResponse.json({ error: 'Chat id and messages are required.' }, { status: 400 });

    const title = aiChatTitle(messages);
    const preview = aiChatPreview(messages);
    const rows = await sql`
      INSERT INTO ai_chat_sessions (id, title, preview, messages, message_count, created_at, updated_at)
      VALUES (${id}, ${title}, ${preview}, ${JSON.stringify(messages)}::jsonb, ${messages.length}, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        preview = EXCLUDED.preview,
        messages = EXCLUDED.messages,
        message_count = EXCLUDED.message_count,
        updated_at = NOW()
      RETURNING id, title, preview, message_count, created_at, updated_at
    `;
    return NextResponse.json({ session: sessionSummary(rows[0]) });
  } catch (error) {
    console.error('[ai-chat-sessions POST]', error);
    return NextResponse.json({ error: 'Could not save AI chat history.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = cleanText(new URL(req.url).searchParams.get('id'), 100);
  if (!id) return NextResponse.json({ error: 'Chat id is required.' }, { status: 400 });
  try {
    await sql`DELETE FROM ai_chat_sessions WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[ai-chat-sessions DELETE]', error);
    return NextResponse.json({ error: 'Could not delete AI chat.' }, { status: 500 });
  }
}
