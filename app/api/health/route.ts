import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

const hasOwn = (body: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(body, key);

const MAX_GENERAL_NOTE_PHOTOS = 5;
const MAX_PHOTO_DATA_URL_LENGTH = 2_000_000;

type GeneralNotePhoto = {
  id: string;
  name: string;
  type: string;
  dataUrl: string;
  createdAt: string;
};

function normalizeGeneralNotePhotos(value: unknown): GeneralNotePhoto[] {
  if (!Array.isArray(value)) return [];

  const photos: GeneralNotePhoto[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Partial<GeneralNotePhoto>;
    if (typeof raw.dataUrl !== 'string') continue;
    if (!raw.dataUrl.startsWith('data:image/')) continue;
    if (raw.dataUrl.length > MAX_PHOTO_DATA_URL_LENGTH) continue;

    photos.push({
      id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 80) : `photo-${Date.now()}-${photos.length}`,
      name: typeof raw.name === 'string' && raw.name ? raw.name.slice(0, 160) : 'Daily note photo',
      type: typeof raw.type === 'string' && raw.type ? raw.type.slice(0, 80) : 'image/jpeg',
      dataUrl: raw.dataUrl,
      createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : new Date().toISOString(),
    });

    if (photos.length >= MAX_GENERAL_NOTE_PHOTOS) break;
  }

  return photos;
}

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
  await sql`ALTER TABLE health_log ADD COLUMN IF NOT EXISTS general_note_photos JSONB NOT NULL DEFAULT '[]'::jsonb`;
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
    const body = await req.json() as Record<string, unknown>;
    const {
      date, sleep_hours, sleep_quality, energy, mood, pain,
      sleep_notes, sleep_quality_notes, energy_notes, mood_notes, pain_notes, general_notes, treatment_notes,
      general_note_photos,
    } = body;
    if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 });

    const hasSleepHours = hasOwn(body, 'sleep_hours');
    const hasSleepQuality = hasOwn(body, 'sleep_quality');
    const hasEnergy = hasOwn(body, 'energy');
    const hasMood = hasOwn(body, 'mood');
    const hasPain = hasOwn(body, 'pain');
    const hasSleepNotes = hasOwn(body, 'sleep_notes');
    const hasSleepQualityNotes = hasOwn(body, 'sleep_quality_notes');
    const hasEnergyNotes = hasOwn(body, 'energy_notes');
    const hasMoodNotes = hasOwn(body, 'mood_notes');
    const hasPainNotes = hasOwn(body, 'pain_notes');
    const hasGeneralNotes = hasOwn(body, 'general_notes');
    const hasTreatmentNotes = hasOwn(body, 'treatment_notes');
    const hasGeneralNotePhotos = hasOwn(body, 'general_note_photos');
    const cleanGeneralNotePhotos = hasGeneralNotePhotos ? normalizeGeneralNotePhotos(general_note_photos) : [];

    await ensureTable();
    await sql`
      INSERT INTO health_log (date, sleep_hours, sleep_quality, energy, mood, pain,
        sleep_notes, sleep_quality_notes, energy_notes, mood_notes, pain_notes, general_notes, treatment_notes,
        general_note_photos, updated_at)
      VALUES (${date}::date, ${hasSleepHours ? sleep_hours : null}, ${hasSleepQuality ? sleep_quality : null},
        ${hasEnergy ? energy : null}, ${hasMood ? mood : null}, ${hasPain ? pain : null},
        ${hasSleepNotes ? sleep_notes ?? null : null}, ${hasSleepQualityNotes ? sleep_quality_notes ?? null : null},
        ${hasEnergyNotes ? energy_notes ?? null : null}, ${hasMoodNotes ? mood_notes ?? null : null},
        ${hasPainNotes ? pain_notes ?? null : null}, ${hasGeneralNotes ? general_notes ?? null : null},
        ${hasTreatmentNotes ? treatment_notes ?? null : null}, ${JSON.stringify(cleanGeneralNotePhotos)}::jsonb, NOW())
      ON CONFLICT (date) DO UPDATE SET
        sleep_hours = CASE WHEN ${hasSleepHours} THEN EXCLUDED.sleep_hours ELSE health_log.sleep_hours END,
        sleep_quality = CASE WHEN ${hasSleepQuality} THEN EXCLUDED.sleep_quality ELSE health_log.sleep_quality END,
        energy = CASE WHEN ${hasEnergy} THEN EXCLUDED.energy ELSE health_log.energy END,
        mood = CASE WHEN ${hasMood} THEN EXCLUDED.mood ELSE health_log.mood END,
        pain = CASE WHEN ${hasPain} THEN EXCLUDED.pain ELSE health_log.pain END,
        sleep_notes = CASE WHEN ${hasSleepNotes} THEN EXCLUDED.sleep_notes ELSE health_log.sleep_notes END,
        sleep_quality_notes = CASE WHEN ${hasSleepQualityNotes} THEN EXCLUDED.sleep_quality_notes ELSE health_log.sleep_quality_notes END,
        energy_notes = CASE WHEN ${hasEnergyNotes} THEN EXCLUDED.energy_notes ELSE health_log.energy_notes END,
        mood_notes = CASE WHEN ${hasMoodNotes} THEN EXCLUDED.mood_notes ELSE health_log.mood_notes END,
        pain_notes = CASE WHEN ${hasPainNotes} THEN EXCLUDED.pain_notes ELSE health_log.pain_notes END,
        general_notes = CASE WHEN ${hasGeneralNotes} THEN EXCLUDED.general_notes ELSE health_log.general_notes END,
        treatment_notes = CASE WHEN ${hasTreatmentNotes} THEN EXCLUDED.treatment_notes ELSE health_log.treatment_notes END,
        general_note_photos = CASE WHEN ${hasGeneralNotePhotos} THEN EXCLUDED.general_note_photos ELSE health_log.general_note_photos END,
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
