import type { Metadata } from "next";
import SmartAddPortal from "@/components/SmartAddPortal";
import SavingStatusPortal from "@/components/SavingStatusPortal";
import ExerciseCardMobileEnhancer from "@/components/ExerciseCardMobileEnhancer";
import FloatingWidgetDockToggle from "@/components/FloatingWidgetDockToggle";
import TextareaSpacebarFix from "@/components/TextareaSpacebarFix";
import TimerBackgroundNotifications from "@/components/TimerBackgroundNotifications";
import DoctorNotesReorderEnhancer from "@/components/DoctorNotesReorderEnhancer";
import HealthSectionJumpEnhancer from "@/components/HealthSectionJumpEnhancer";
import WeekGoalInputEnhancer from "@/components/WeekGoalInputEnhancer";
import ExerciseNotePhotoButtonCleanup from "@/components/ExerciseNotePhotoButtonCleanup";
import ExerciseGestureEnhancer from "@/components/ExerciseGestureEnhancer";
import ExerciseMoveHandleCompatibility from "@/components/ExerciseMoveHandleCompatibility";
import DurationTypeAutofillEnhancer from "@/components/DurationTypeAutofillEnhancer";
import ExerciseTileMetadataEnhancer from "@/components/ExerciseTileMetadataEnhancer";
import "./globals.css";
import "./widget-rescue.css";
import "./quick-log-polish.css";

// Deployment marker: rollback state confirmed.
const DRIVE_FILE_ID = "1PFb1U9txQRO4tPzQepBWkbEChoKPNeYD";
const DRIVE_ICON_URL = `https://drive.google.com/thumbnail?id=${DRIVE_FILE_ID}&sz=w512`;

export const metadata: Metadata = {
  title: "PT Motivator — Ankle Recovery",
  description: "Track your physical therapy exercises and progress",
  applicationName: "PT Motivator",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: DRIVE_ICON_URL, sizes: "512x512", type: "image/png" }],
    apple: [{ url: DRIVE_ICON_URL, sizes: "512x512", type: "image/png" }],
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
        <SavingStatusPortal />
        <ExerciseCardMobileEnhancer />
        <FloatingWidgetDockToggle />
        <TextareaSpacebarFix />
        <TimerBackgroundNotifications />
        <DoctorNotesReorderEnhancer />
        <HealthSectionJumpEnhancer />
        <WeekGoalInputEnhancer />
        <ExerciseNotePhotoButtonCleanup />
        <ExerciseGestureEnhancer />
        <ExerciseMoveHandleCompatibility />
        <DurationTypeAutofillEnhancer />
        <ExerciseTileMetadataEnhancer />
      </body>
    </html>
  );
}
