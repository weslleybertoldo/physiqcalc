/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** "play" no build da Google Play (`npm run build:loja`); ausente (ou outro valor) no site e no APK do site. Ver src/lib/distribuicao.ts. */
  readonly VITE_DISTRIBUICAO?: string;
  /** "1" nos builds do app (`npm run build:apk` e `npm run build:loja`): o painel master fica fora. Ver src/lib/plataforma.ts. */
  readonly VITE_APP_NATIVO?: string;
}
