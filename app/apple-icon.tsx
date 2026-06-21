import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'PT Motivator ankle recovery icon';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(145deg, #F6F1E7 0%, #E4ECE6 100%)',
          borderRadius: 40,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: 150,
            height: 150,
            borderRadius: 34,
            background: 'rgba(255,255,255,0.64)',
            border: '4px solid rgba(126,155,134,0.28)',
          }}
        />
        <svg width="138" height="138" viewBox="0 0 512 512" style={{ position: 'relative' }}>
          <path
            d="M304 76c-25 3-43 24-45 51l-11 126c-1 15-10 28-24 34l-73 31c-36 15-57 43-52 71 6 32 40 49 84 42l151-24c51-8 84-38 88-80 3-35-17-64-55-82l-38-18c-16-8-24-23-23-40l6-92c1-11-1-20-8-19z"
            fill="#FFF8EE"
            stroke="#12324A"
            strokeWidth="24"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M257 269c23 20 57 32 101 34"
            fill="none"
            stroke="#7E9B86"
            strokeWidth="20"
            strokeLinecap="round"
          />
          <circle cx="312" cy="132" r="34" fill="#E4ECE6" stroke="#7E9B86" strokeWidth="18" />
          <circle cx="174" cy="381" r="13" fill="#C17B4F" />
          <circle cx="220" cy="380" r="12" fill="#C17B4F" />
          <circle cx="266" cy="372" r="11" fill="#C17B4F" />
          <circle cx="310" cy="359" r="10" fill="#C17B4F" />
        </svg>
        <div
          style={{
            position: 'absolute',
            bottom: 18,
            right: 18,
            width: 40,
            height: 26,
            borderRadius: 11,
            background: '#12324A',
            color: '#F6F1E7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: -0.4,
          }}
        >
          PT
        </div>
      </div>
    ),
    size,
  );
}
