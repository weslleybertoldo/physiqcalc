import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { distribuicaoDe } from "./distribuicao";

// W1 da loja — o canal do build: VITE_DISTRIBUICAO=play é a versão da Google Play; sem ela (o site, o APK do site e o CI) tudo
// fica como sempre. Os arquivos do Android da loja (build type playRelease) são conferidos aqui também, como o androidManifest.test.
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ler = (caminho: string) => readFileSync(resolve(RAIZ, caminho), "utf8");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("distribuicao (W1 da loja)", () => {
  it("'play' é a versão da Google Play; qualquer outra coisa (ou nada) é o site — nunca esconde nada do site por engano", () => {
    expect(distribuicaoDe("play")).toBe("play");
    for (const v of [undefined, null, "", "site", "loja", "PLAY", " play", "google", true]) expect(distribuicaoDe(v)).toBe("site");
  });

  it("sem VITE_DISTRIBUICAO: DISTRIBUICAO = site e ehLoja = false", async () => {
    vi.stubEnv("VITE_DISTRIBUICAO", "");
    const m = await import("./distribuicao");
    expect(m.DISTRIBUICAO).toBe("site");
    expect(m.ehLoja).toBe(false);
  });

  it("VITE_DISTRIBUICAO=play: DISTRIBUICAO = play e ehLoja = true", async () => {
    vi.stubEnv("VITE_DISTRIBUICAO", "play");
    const m = await import("./distribuicao");
    expect(m.DISTRIBUICAO).toBe("play");
    expect(m.ehLoja).toBe(true);
  });

  it("npm run build:loja liga a flag; o npm run build (site, Vercel e CI) continua sem ela", () => {
    const pkg = JSON.parse(ler("package.json"));
    expect(pkg.scripts["build:loja"]).toBe("VITE_DISTRIBUICAO=play vite build");
    expect(pkg.scripts.build).toBe("vite build");
  });
});

describe("Android da loja (build type playRelease)", () => {
  it("o manifesto do playRelease tira a permissão de instalar APK; o do site continua com ela", () => {
    expect(ler("android/app/src/playRelease/AndroidManifest.xml")).toMatch(
      /<uses-permission\s+android:name="android\.permission\.REQUEST_INSTALL_PACKAGES"\s+tools:node="remove"\s*\/>/,
    );
    expect(ler("android/app/src/main/AndroidManifest.xml")).toMatch(
      /<uses-permission\s+android:name="android\.permission\.REQUEST_INSTALL_PACKAGES"\s*\/>/,
    );
  });

  it("playRelease = release (initWith) com LOJA = true; o resto do app com LOJA = false", () => {
    const gradle = ler("android/app/build.gradle");
    expect(gradle).toMatch(/defaultConfig\s*\{[\s\S]*buildConfigField "boolean", "LOJA", "false"/);
    const play = gradle.slice(gradle.indexOf("playRelease {"));
    expect(play).toMatch(/initWith release/);
    expect(play).toMatch(/matchingFallbacks = \['release'\]/);
    expect(play).toMatch(/buildConfigField "boolean", "LOJA", "true"/);
    expect(gradle).toMatch(/buildFeatures\s*\{\s*buildConfig true\s*\}/);
    // o CI troca a versão por sed (versionCode N / versionName "x"): só pode haver 1 de cada
    expect(gradle.match(/versionCode \d+/g)).toHaveLength(1);
    expect(gradle.match(/versionName "[^"]*"/g)).toHaveLength(1);
  });

  it("o MainActivity só registra o instalador de APK fora da loja", () => {
    const main = ler("android/app/src/main/java/com/bertoldo/physiqcalc/MainActivity.java");
    expect(main).toMatch(/if \(!BuildConfig\.LOJA\) \{\s*registerPlugin\(ApkInstallerPlugin\.class\);\s*\}/);
    expect(main.match(/registerPlugin\(ApkInstallerPlugin\.class\)/g)).toHaveLength(1);
  });
});
