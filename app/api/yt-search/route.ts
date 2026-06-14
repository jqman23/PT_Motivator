import { NextRequest, NextResponse } from 'next/server';

export interface VideoResult {
  id: string;
  title: string;
  thumbnail: string;
  channel: string;
}

type YTItem = {
  id: { videoId: string };
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails: {
      high?: { url: string };
      medium?: { url: string };
      default?: { url: string };
      maxres?: { url: string };
    };
  };
};

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  if (!q.trim()) return NextResponse.json({ videos: [] });

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ videos: [], noKey: true });
  }

  try {
    const params = new URLSearchParams({
      part: 'snippet',
      q,
      type: 'video',
      videoEmbeddable: 'true',   // ← only returns videos with embedding enabled
      maxResults: '8',
      relevanceLanguage: 'en',
      safeSearch: 'moderate',
      key: apiKey,
    });

    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params}`,
      // Cache in Next.js Data Cache for 24 hours — avoids burning quota on repeated searches
      { next: { revalidate: 86400 } }
    );

    const data = await res.json();

    if (data.error) {
      console.error('[yt-search] YouTube API error:', data.error.message);
      return NextResponse.json(
        { videos: [], error: data.error.message },
        { status: 500 }
      );
    }

    const videos: VideoResult[] = (data.items ?? []).map((item: YTItem) => {
      const t = item.snippet.thumbnails;
      return {
        id: item.id.videoId,
        title: item.snippet.title,
        // prefer the highest resolution thumbnail available
        thumbnail:
          t.maxres?.url ??
          t.high?.url ??
          t.medium?.url ??
          t.default?.url ??
          `https://img.youtube.com/vi/${item.id.videoId}/hqdefault.jpg`,
        channel: item.snippet.channelTitle,
      };
    });

    return NextResponse.json({ videos });
  } catch (err) {
    console.error('[yt-search] fetch failed:', err);
    return NextResponse.json({ videos: [], error: 'fetch failed' }, { status: 500 });
  }
}
