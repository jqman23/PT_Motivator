import { NextRequest, NextResponse } from 'next/server';
import { getNotesForDate, upsertNote, deleteNotesForDate } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  if (!date) {
    return NextResponse.json({ error: 'date required' }, { status: 400 });
  }
  try {
    const rows = await getNotesForDate(date);
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
    if (!date || !exerciseId || note === undefined) {
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
