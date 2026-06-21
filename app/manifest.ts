import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PT Motivator — Ankle Recovery',
    short_name: 'PT Motivator',
    description: 'Track physical therapy exercises, notes, and progress.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#F6F1E7',
    theme_color: '#7E9B86',
    icons: [
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
