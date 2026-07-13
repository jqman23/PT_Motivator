import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

const MAX_PHOTOS = 5;
const MAX_PHOTO_DATA_URL_LENGTH = 2_000_000;
const MAX_TRANSCRIPTS = 20;
const MAX_TRANSCRIPT_TEXT_LENGTH = 8_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const NOTE_COLORS = new Set(['none', 'green', 'orange', 'blue', 'purple']);

type DoctorNotePhoto = {
  id: string;
  name: string;
  type: string;
  dataUrl: string;
  createdAt: string;
};

type ResponseTranscript = {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
};

function cleanText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeDates(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && DATE_PATTERN.test(item)))).slice(0, 20).sort();
}

function normalizePhotos(value: unknown): DoctorNotePhoto[] {
  if (!Array.isArray(value)) return [];
  const photos: DoctorNotePhoto[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Partial<DoctorNotePhoto>;
    if (typeof raw.dataUrl !== 'string' || !raw.dataUrl.startsWith('data:image/')) continue;
    if (raw.dataUrl.length > MAX_PHOTO_DATA_URL_LENGTH) continue;

    photos.push({
      id: cleanText(raw.id, 80) || `photo-${Date.now()}-${photos.length}`,
      name: cleanText(raw.name, 160) || 'Doctor note photo',
      type: cleanText(raw.type, 80) || 'image/jpeg',
      dataUrl: raw.dataUrl,
      createdAt: cleanText(raw.createdAt, 60) || new Date().toISOString(),
    });

    if (photos.length >= MAX_PHOTOS) break;
  }

  return photos;
}

function normalizeTranscripts(value: unknown): ResponseTranscript[] {
  if (!Array.isArray(value)) return [];
  const transcripts: ResponseTranscript[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Partial<ResponseTranscript>;
    const text = cleanText(raw.text, MAX_TRANSCRIPT_TEXT_LENGTH);
    if (!text) continue;

    transcripts.push({
      id: cleanText(raw.id, 80) || `transcript-${Date.now()}-${transcripts.length}`,
      text,
      createdAt: cleanText(raw.createdAt, 60) || new Date().toISOString(),
      updatedAt: cleanText(raw.updatedAt, 60) || new Date().toISOString(),
    });

    if (transcripts.length >= MAX_TRANSCRIPTS) break;
  }

  return transcripts;
}

export async function GET(req: NextRequest) {
  try {
    const id = cleanText(new URL(req.url).searchParams.get('id'), 100);
    if (id) {
      const rows = await sql`
        SELECT id, kind, title, provider, reference_text, body, note_color,
          COALESCE(linked_dates, '[]'::jsonb) AS linked_dates,
          COALESCE(photo_attachments, '[]'::jsonb) AS photo_attachments,
          COALESCE(response_transcripts, '[]'::jsonb) AS response_transcripts,
          pinned, created_at, updated_at
        FROM doctor_notes WHERE id = ${id} LIMIT 1
      `;
      return NextResponse.json({ row: rows[0] ?? null });
    }
    const rows = await sql`
      SELECT id, kind, title, provider, reference_text, body, note_color,
        COALESCE(linked_dates, '[]'::jsonb) AS linked_dates,
        COALESCE(photo_attachments, '[]'::jsonb) AS photo_attachments,
        COALESCE(response_transcripts, '[]'::jsonb) AS response_transcripts,
        pinned, created_at, updated_at
      FROM doctor_notes
      ORDER BY pinned DESC, updated_at DESC
      LIMIT 100
    `;
    return NextResponse.json({ rows });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Could not load doctor notes.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const id = cleanText(body.id, 100);
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const kind = cleanText(body.kind, 40) || 'question';
    const title = cleanText(body.title, 180);
    const provider = cleanText(body.provider, 180);
    const referenceText = cleanText(body.referenceText, 300);
    const noteBody = typeof body.body === 'string' ? body.body.trim().slice(0, 12_000) : '';
    const linkedDates = normalizeDates(body.linkedDates);
    const photoAttachments = normalizePhotos(body.photoAttachments);
    const responseTranscripts = normalizeTranscripts(body.responseTranscripts);
    const pinned = body.pinned === true;
    const noteColor = NOTE_COLORS.has(cleanText(body.noteColor, 20)) ? cleanText(body.noteColor, 20) : 'none';

    if (!title && !noteBody && photoAttachments.length === 0) {
      return NextResponse.json({ error: 'Add a title, note, or photo before saving.' }, { status: 400 });
    }

    await sql`
      INSERT INTO doctor_notes (
        id, kind, title, provider, reference_text, body,
        linked_dates, photo_attachments, response_transcripts, pinned, note_color, created_at, updated_at
      ) VALUES (
        ${id}, ${kind}, ${title}, ${provider}, ${referenceText}, ${noteBody},
        ${JSON.stringify(linkedDates)}::jsonb,
        ${JSON.stringify(photoAttachments)}::jsonb,
        ${JSON.stringify(responseTranscripts)}::jsonb,
        ${pinned}, ${noteColor}, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        kind = EXCLUDED.kind,
        title = EXCLUDED.title,
        provider = EXCLUDED.provider,
        reference_text = EXCLUDED.reference_text,
        body = EXCLUDED.body,
        linked_dates = EXCLUDED.linked_dates,
        photo_attachments = EXCLUDED.photo_attachments,
        response_transcripts = EXCLUDED.response_transcripts,
        pinned = EXCLUDED.pinned,
        note_color = EXCLUDED.note_color,
        updated_at = NOW()
    `;

    const rows = await sql`
      SELECT id, kind, title, provider, reference_text, body, note_color,
        COALESCE(linked_dates, '[]'::jsonb) AS linked_dates,
        COALESCE(photo_attachments, '[]'::jsonb) AS photo_attachments,
        COALESCE(response_transcripts, '[]'::jsonb) AS response_transcripts,
        pinned, created_at, updated_at
      FROM doctor_notes
      WHERE id = ${id}
      LIMIT 1
    `;

    return NextResponse.json({ row: rows[0] ?? null });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Could not save doctor note.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = cleanText(new URL(req.url).searchParams.get('id'), 100);
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  try {
    await sql`DELETE FROM doctor_notes WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Could not delete doctor note.' }, { status: 500 });
  }
}
