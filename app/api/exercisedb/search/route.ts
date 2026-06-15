import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get('search')?.trim();

  if (!search || search.length < 2) {
    return NextResponse.json({ success: true, data: [] });
  }

  const url = new URL('https://oss.exercisedb.dev/api/v1/exercises/search');
  url.searchParams.set('search', search);
  url.searchParams.set('threshold', '0.45');

  try {
    const res = await fetch(url.toString(), {
      headers: { accept: 'application/json' },
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      return NextResponse.json({ success: false, error: 'ExerciseDB search failed', data: [] }, { status: 502 });
    }

    const json = await res.json();
    const data = Array.isArray(json.data) ? json.data.slice(0, 10) : [];

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, error: 'Unable to reach ExerciseDB', data: [] }, { status: 502 });
  }
}
