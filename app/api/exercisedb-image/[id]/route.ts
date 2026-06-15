import { NextRequest } from 'next/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const apiKey = process.env.EXERCISEDB_RAPIDAPI_KEY;

  if (!apiKey) return new Response('Missing ExerciseDB key', { status: 500 });

  const upstream = await fetch(`https://v2.exercisedb.io/image/${id}`, {
    headers: {
      'x-rapidapi-host': 'exercisedb.p.rapidapi.com',
      'x-rapidapi-key': apiKey,
    },
    cache: 'no-store',
  });

  if (!upstream.ok) return new Response('ExerciseDB image failed', { status: upstream.status });

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/gif',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
