import type { Metadata } from "next";
import SmartAddPortal from "@/components/SmartAddPortal";
import "./globals.css";

export const metadata: Metadata = {
  title: "PT Motivator — Ankle Recovery",
  description: "Track your physical therapy exercises and progress",
  applicationName: "PT Motivator",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "PT Motivator",
    statusBarStyle: "default",
  },
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
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="PT Motivator" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className="min-h-full flex flex-col" style={{ colorScheme: 'light', background: '#F6F1E7', color: '#353B33' }}>
        {children}
        <SmartAddPortal />
      </body>
    </html>
  );
}
