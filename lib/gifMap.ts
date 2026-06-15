export const CURATED_GIF_MAP: Record<string, string> = {
  squat: 'https://media.giphy.com/media/3o6Zt6KHxJTbXCnSvu/giphy.gif',
  lunge: 'https://media.giphy.com/media/l0MYy7QpDDVGVfAAw/giphy.gif',
  plank: 'https://media.giphy.com/media/3o7TKtnuHOHHUjR38Y/giphy.gif',
};

export function findCuratedGif(name: string) {
  const q = name.toLowerCase();
  const key = Object.keys(CURATED_GIF_MAP)
    .sort((a, b) => b.length - a.length)
    .find(k => q.includes(k));

  return key ? { gifUrl: CURATED_GIF_MAP[key], source: 'curated', match: key } : null;
}
