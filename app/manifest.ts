import type { MetadataRoute } from 'next';

const DRIVE_FILE_ID = '1PFb1U9txQRO4tPzQepBWkbEChoKPNeYD';
const DRIVE_ICON_URL = `https://drive.google.com/thumbnail?id=${DRIVE_FILE_ID}&sz=w512`;

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
        src: DRIVE_ICON_URL,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
