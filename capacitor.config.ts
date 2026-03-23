import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bertoldo.physiqcalc',
  appName: 'PhysiqCalc',
  webDir: 'dist',
  android: {
    // Mantém dados do WebView (localStorage, cookies) entre reinícios do app
    webContentsDebuggingEnabled: false,
    allowMixedContent: true,
  },
  server: {
    // Garante que o WebView não limpa dados ao reiniciar
    cleartext: true,
    androidScheme: 'https',
  },
};

export default config;
