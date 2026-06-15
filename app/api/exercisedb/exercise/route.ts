import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const exerciseId = req.nextUrl.searchParams.get('id')?.trim();

  if (!exerciseId) {
    return NextResponse.json({ success: false, error: 'Missing exercise id' }, { status: 400 });
  }

  try {
    const res = await fetch(`https://oss.exercisedb.dev/api/v1/exercises/${encodeURIComponent(exerciseId)}`, {
      headers: { accept: 'application/json' },
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      return NextResponse.json({ success: false, error: 'ExerciseDB exercise lookup failed' }, { status: 502 });
    }

    const json = await res.json();
    const data = json.data ?? json;

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, error: 'Unable to reach ExerciseDB' }, { status: 502 });
  }
}
