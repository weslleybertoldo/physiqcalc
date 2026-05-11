import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bertoldo.physiqcalc',
  appName: 'PhysiqCalc',
  webDir: 'dist',
  android: {
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
