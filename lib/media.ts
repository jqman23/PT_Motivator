export function youtubeIdFromUrl(url?: string) {
  const raw = String(url ?? '').trim();
  if (!raw) return '';
  const direct = raw.match(/^[a-zA-Z0-9_-]{11}$/)?.[0];
  if (direct) return direct;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] ?? '';
    if (!['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'].includes(host)) return '';
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

export type ExerciseVideoSource = {
  kind: 'youtube' | 'instagram' | 'vimeo' | 'direct' | 'external';
  url: string;
  embedUrl?: string;
  label: string;
};

function safeHttpUrl(value?: string) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(candidate);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
}

export function exerciseVideoSource(value?: string): ExerciseVideoSource | null {
  const url = safeHttpUrl(value);
  if (!url) return null;

  const youtubeEmbed = youtubeEmbedUrl(url);
  if (youtubeEmbed) return { kind: 'youtube', url, embedUrl: youtubeEmbed, label: 'YouTube' };

  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const parts = parsed.pathname.split('/').filter(Boolean);

  if (host === 'instagram.com' && ['p', 'reel', 'tv'].includes(parts[0]) && parts[1]) {
    return {
      kind: 'instagram',
      url,
      embedUrl: `https://www.instagram.com/${parts[0]}/${parts[1]}/embed/`,
      label: 'Instagram',
    };
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = [...parts].reverse().find(part => /^\d+$/.test(part));
    if (id) return { kind: 'vimeo', url, embedUrl: `https://player.vimeo.com/video/${id}`, label: 'Vimeo' };
  }

  if (/\.(?:mp4|webm|mov|m4v)(?:$|[?#])/i.test(url)) {
    return { kind: 'direct', url, label: 'Video' };
  }

  return { kind: 'external', url, label: host || 'Video link' };
}
