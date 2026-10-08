import { Capacitor } from "@capacitor/core";

/**
 * hml-08 (H-22): o painel master fica só no site (decisão do dono, 07/10/2026) — fora do APK e do AAB da Google Play.
 * - Build do app (`npm run build:apk` e `npm run build:loja`, VITE_APP_NATIVO=1): o Vite troca a flag pelo valor e o Rollup corta
 *   o master do bundle. Por isso o Rotas.tsx e o registro.ts põem a expressão direto na condição (o CI confere: sem-master.sh).
 * - Runtime (`Capacitor.isNativePlatform()`): cobre o build feito à mão (`npm run build` + `npx cap sync`), que leva o código.
 */
export const BUILD_DO_APP: boolean = import.meta.env.VITE_APP_NATIVO === "1";

/** O painel master abre neste aparelho? Só no site (navegador), nunca no app. */
export function masterNesteAparelho(): boolean {
  return !BUILD_DO_APP && !Capacitor.isNativePlatform();
}
