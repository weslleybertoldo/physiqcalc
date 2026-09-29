import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bertoldo.physiqcalc',
  appName: 'Physiq',
  webDir: 'dist',
  // fundo da WebView enquanto a tela carrega (sem o clarão branco entre a abertura e o app — W1)
  backgroundColor: '#09090B',
  android: {
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
