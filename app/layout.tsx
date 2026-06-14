import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PT Motivator — Ankle Recovery",
  description: "Track your physical therapy exercises and progress",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" style={{ colorScheme: 'light' }}>
      <head>
        <meta name="color-scheme" content="light" />
        <meta name="theme-color" content="#F6F1E7" />
      </head>
      <body className="min-h-full flex flex-col" style={{ colorScheme: 'light', background: '#F6F1E7', color: '#353B33' }}>{children}</body>
    </html>
  );
}
