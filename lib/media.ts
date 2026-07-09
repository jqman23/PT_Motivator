export function youtubeIdFromUrl(url?: string) {
  const raw = String(url ?? '').trim();
  if (!raw) return '';
  const direct = raw.match(/^[a-zA-Z0-9_-]{11}$/)?.[0];
  if (direct) return direct;
  try {
    const parsed = new URL(raw);
    if (parsed.hostname.includes('youtu.be')) return parsed.pathname.split('/').filter(Boolean)[0] ?? '';
    if (parsed.searchParams.get('v')) return parsed.searchParams.get('v') ?? '';
    const parts = parsed.pathname.split('/').filter(Boolean);
    const marker = parts.findIndex(part => ['embed', 'shorts', 'live'].includes(part));
    return marker >= 0 ? parts[marker + 1] ?? '' : '';
  } catch {
    return '';
  }
}

export function youtubeEmbedUrl(url?: string) {
  const id = youtubeIdFromUrl(url);
  return id ? `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&playsinline=1` : '';
}

export function youtubeThumbnailUrl(url?: string) {
  const id = youtubeIdFromUrl(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : '';
}
