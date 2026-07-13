import { NextRequest, NextResponse } from 'next/server';
import { getNotesForDate, getNotesForRange, upsertNote, deleteNotesForDate } from '@/lib/db';
import { stripSecretNotes } from '@/lib/secretNotes';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  const includePhotos = searchParams.get('includePhotos') !== 'false';
  if (start && end) {
    const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000;
    if (!DATE_PATTERN.test(start) || !DATE_PATTERN.test(end) || start > end || days > 400) {
      return NextResponse.json({ error: 'valid start and end dates required' }, { status: 400 });
    }
    try {
      const rows = await getNotesForRange(start, end) as Array<Record<string, unknown>>;
      return NextResponse.json({
        rows: rows
          .map(row => ({ ...row, note: stripSecretNotes(typeof row.note === 'string' ? row.note : '') }))
          .filter(row => String(row.note ?? '').trim()),
      });
    } catch (err) {
      console.error(err);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }
  }
  if (!date || !DATE_PATTERN.test(date)) {
    return NextResponse.json({ error: 'date required' }, { status: 400 });
  }
  try {
    const rows = await getNotesForDate(date, includePhotos);
    return NextResponse.json({ rows });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const date = new URL(req.url).searchParams.get('date');
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 });
  try {
    await deleteNotesForDate(date);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const { date, exerciseId, note } = payload;
    if (!DATE_PATTERN.test(String(date ?? '')) || !exerciseId || note === undefined) {
      return NextResponse.json({ error: 'date, exerciseId, note required' }, { status: 400 });
    }

    const hasPhotoAttachments = Object.prototype.hasOwnProperty.call(payload, 'photoAttachments');
    await upsertNote(date, exerciseId, note, hasPhotoAttachments ? payload.photoAttachments : undefined);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
