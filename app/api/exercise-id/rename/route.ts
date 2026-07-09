import { NextRequest, NextResponse } from 'next/server';
import { renameExerciseId } from '@/lib/db';

const VALID_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{1,120}$/;

export async function POST(req: NextRequest) {
  try {
    const { oldId, newId } = await req.json();
    if (typeof oldId !== 'string' || typeof newId !== 'string') {
      return NextResponse.json({ error: 'oldId and newId required' }, { status: 400 });
    }

    const cleanOldId = oldId.trim();
    const cleanNewId = newId.trim();
    if (!VALID_ID.test(cleanOldId) || !VALID_ID.test(cleanNewId)) {
      return NextResponse.json({ error: 'IDs must use letters, numbers, dashes, or underscores only.' }, { status: 400 });
    }
    if (cleanOldId === cleanNewId) {
      return NextResponse.json({ ok: true, unchanged: true });
    }

    await renameExerciseId(cleanOldId, cleanNewId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Could not rename exercise ID' }, { status: 500 });
  }
}
