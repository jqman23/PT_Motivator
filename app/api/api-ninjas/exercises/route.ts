import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get('search')?.trim();
  const apiKey = process.env.API_NINJAS_KEY;

  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'Missing API_NINJAS_KEY', data: [] }, { status: 500 });
  }

  if (!search || search.length < 2) {
    return NextResponse.json({ success: true, data: [] });
  }

  const url = new URL('https://api.api-ninjas.com/v1/exercises');
  url.searchParams.set('name', search);

  try {
    const res = await fetch(url.toString(), {
      headers: { 'X-Api-Key': apiKey, accept: 'application/json' },
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      return NextResponse.json({ success: false, error: 'API Ninjas request failed', data: [] }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json({ success: true, data: Array.isArray(data) ? data.slice(0, 5) : [] });
  } catch {
    return NextResponse.json({ success: false, error: 'Unable to reach API Ninjas', data: [] }, { status: 502 });
  }
}
