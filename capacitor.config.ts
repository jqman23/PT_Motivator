import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ptmotivator.app',
  appName: 'PT Motivator',
  webDir: 'public',
  server: {
    url: process.env.CAPACITOR_SERVER_URL || 'https://pt-motivator.vercel.app',
    cleartext: false,
  },
};

export default config;
