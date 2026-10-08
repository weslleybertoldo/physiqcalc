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
    // hml-08: o build:loja também é build do app (VITE_APP_NATIVO=1: sem o painel master — src/lib/plataforma.test.ts)
    expect(pkg.scripts["build:loja"]).toBe("VITE_DISTRIBUICAO=play VITE_APP_NATIVO=1 vite build");
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

describe("W4 da loja — o AAB da Google Play (chave de upload)", () => {
  const impressao = (nome: string) => ler("scripts/ci/aab-loja.sh").match(new RegExp(`^${nome}="([0-9A-F:]+)"`, "m"))?.[1];

  it("o playRelease assina SÓ com a chave de upload: zera o signingConfig que o initWith copia do release (a chave do site)", () => {
    const gradle = ler("android/app/build.gradle");
    const play = gradle.slice(gradle.indexOf("playRelease {"), gradle.indexOf("buildFeatures"));
    expect(play).toMatch(/initWith release[\s\S]*signingConfig = null\s+def lojaKeystoreFile = System\.getenv\("PLAY_UPLOAD_KEYSTORE_FILE"\)\s+if \(lojaKeystoreFile\) \{\s*signingConfig = signingConfigs\.loja\s*\}/);
    expect(play).not.toMatch(/signingConfigs\.release|getenv\("KEYSTORE_FILE"\)/);
    const loja = gradle.slice(gradle.indexOf("        loja {"), gradle.indexOf("    buildTypes {"));
    for (const v of ["PLAY_UPLOAD_KEYSTORE_FILE", "PLAY_UPLOAD_KEYSTORE_PASSWORD", "PLAY_UPLOAD_KEY_ALIAS", "PLAY_UPLOAD_KEY_PASSWORD"]) {
      expect(loja).toContain(`System.getenv("${v}")`);
    }
    // o release (o APK do site) continua como antes: KEYSTORE_*, minify e shrink
    const release = gradle.slice(gradle.indexOf("    buildTypes {"), gradle.indexOf("playRelease {"));
    expect(release).toMatch(/minifyEnabled true\s+shrinkResources true[\s\S]*if \(keystoreFile\) \{\s*signingConfig signingConfigs\.release\s*\}/);
    expect(gradle).toMatch(/release \{\s*def keystoreFile = System\.getenv\("KEYSTORE_FILE"\)/);
  });

  it("a conferência espera a impressão digital da chave de upload — a mesma do assetlinks.json, ao lado da do site e da do Google", () => {
    const upload = impressao("SHA256_UPLOAD");
    const site = impressao("SHA256_SITE");
    // W5: a chave de assinatura do app no Google (Play App Signing) — é ela que assina o app instalado pela loja
    const google = "9D:E1:9B:D4:45:6C:33:A6:43:D9:10:F4:0D:99:13:6D:34:6C:9E:92:95:9F:F3:9A:6E:4C:07:F5:04:D9:2C:76";
    for (const sha of [upload, site, google]) expect(sha).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    expect(new Set([upload, site, google]).size).toBe(3);
    const assetlinks = JSON.parse(ler("public/.well-known/assetlinks.json"));
    expect(assetlinks[0].target.sha256_cert_fingerprints).toEqual([site, upload, google]);
  });

  it("os 2 workflows geram o AAB pelo mesmo script, em paralelo ao APK e fora da release", () => {
    const casos: [string, string, number][] = [
      [".github/workflows/build-apk.yml", "-loja", 90],
      [".github/workflows/build-apk-check.yml", "-loja-check", 7],
    ];
    for (const [arquivo, sufixo, dias] of casos) {
      const wf = ler(arquivo);
      const inicio = wf.indexOf("\n  aab-loja:");
      expect(inicio, arquivo).toBeGreaterThan(0);
      const job = wf.slice(inicio);
      expect(job).not.toMatch(/^\s+needs:/m);
      for (const passo of ["versao", "firebase", "web", "gradle", "conferir"]) expect(job).toContain(`bash scripts/ci/aab-loja.sh ${passo}`);
      expect(job).toContain(`name: Physiq-v\${{ steps.version.outputs.current }}${sufixo}\n`);
      expect(job).toContain(`retention-days: ${dias}`);
      expect(job).not.toContain("action-gh-release");
      // o job do APK (o que cria a release) não toca no AAB: a release continua só com o APK (os comentários não contam)
      const semComentarios = wf.slice(0, inicio).split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
      expect(semComentarios).not.toMatch(/\.aab|aab-loja\.sh/);
    }
    const principal = ler(".github/workflows/build-apk.yml");
    expect(principal.slice(principal.indexOf("\n  aab-loja:"))).toMatch(/permissions:\s+contents: read/);
    expect(ler(".github/workflows/build-apk-check.yml")).toMatch(/paths:[\s\S]*- "scripts\/ci\/\*\*"/);
  });

  it("npm run build:aab gera o AAB no notebook pelo mesmo script", () => {
    expect(JSON.parse(ler("package.json")).scripts["build:aab"]).toBe("bash scripts/ci/aab-loja.sh local");
  });
});
