import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// restaurar-login (30/10/2026) — o lado Android da chave de volta (RestaurarLoginPlugin), conferido no código: nos 2 builds (D2), a
// biblioteca 1.6.0, a consulta do Play services, o allowBackup que NÃO muda (a segurança P0), nada de regra nova no R8, erros reconhecidos
// por instanceof/getType() (o R8 renomeia as classes — fase 0) e o log só com códigos.
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ler = (caminho: string) => readFileSync(resolve(RAIZ, caminho), "utf8");
const PLUGIN = "android/app/src/main/java/com/bertoldo/physiqcalc/RestaurarLoginPlugin.java";
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("restaurar-login no Android", () => {
  it("a biblioteca androidx.credentials 1.6.0 (+ o provedor do Play services) nos 2 builds: implementation, não playReleaseImplementation", () => {
    const linhas = ler("android/app/build.gradle").split("\n").map((l) => l.trim()).filter((l) => l.includes("androidx.credentials"));
    expect(linhas.filter((l) => !l.startsWith("//"))).toEqual([
      'implementation "androidx.credentials:credentials:1.6.0"',
      'implementation "androidx.credentials:credentials-play-services-auth:1.6.0"',
    ]);
  });

  it("o MainActivity registra o plugin para todo build (fora do if da loja), antes do super.onCreate", () => {
    const main = semComentarios(ler("android/app/src/main/java/com/bertoldo/physiqcalc/MainActivity.java"));
    const i = main.indexOf("registerPlugin(RestaurarLoginPlugin.class);");
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(main.indexOf("super.onCreate(savedInstanceState);"));
    const blocoDaLoja = main.slice(main.indexOf("if (!BuildConfig.LOJA)"), main.indexOf("}", main.indexOf("if (!BuildConfig.LOJA)")));
    expect(blocoDaLoja).not.toContain("RestaurarLoginPlugin");
    expect(ler(PLUGIN)).toContain('@CapacitorPlugin(name = "RestaurarLogin")');
  });

  it("o manifesto: a consulta SÓ do Play services (sem QUERY_ALL_PACKAGES) e o allowBackup continua false", () => {
    const manifesto = ler("android/app/src/main/AndroidManifest.xml");
    expect(manifesto).toMatch(/<queries>\s*<package android:name="com\.google\.android\.gms" \/>\s*<\/queries>/);
    expect(manifesto).not.toMatch(/<uses-permission[^>]*QUERY_ALL_PACKAGES/);
    expect(manifesto).toContain('android:allowBackup="false"');
    // o androidx.biometric (dependência do credentials 1.6.0) não traz permissão nova: o app não usa biometria
    expect(manifesto).toMatch(/<uses-permission android:name="android\.permission\.USE_BIOMETRIC" tools:node="remove" \/>/);
    expect(manifesto).toMatch(/<uses-permission android:name="android\.permission\.USE_FINGERPRINT" tools:node="remove" \/>/);
  });

  it("nada de regra nova no R8 (a do AAR basta — fase 0)", () => {
    expect(ler("android/app/proguard-rules.pro")).not.toMatch(/credentials|RestaurarLogin|blockstore/i);
  });

  it("o plugin reconhece os erros por instanceof / getType(), nunca pelo nome da classe (o R8 renomeia)", () => {
    const codigo = semComentarios(ler(PLUGIN));
    expect(codigo).not.toMatch(/getClass\(\)|getSimpleName\(\)|getName\(\)/);
    for (const classe of ["E2eeUnavailableException", "NoCredentialException", "CreateCredentialProviderConfigurationException",
      "GetCredentialProviderConfigurationException", "ClearCredentialProviderConfigurationException"]) {
      expect(codigo).toContain(`instanceof ${classe}`);
    }
    // o Play services 24.22+ LIGADO (o spike da fase 0 só via se existia)
    expect(codigo).toContain("GMS_MINIMO = 242200000L");
    expect(codigo).toMatch(/!info\.enabled/);
    expect(codigo).toContain("Build.VERSION_CODES.P");
  });

  it("o log do plugin leva SÓ códigos (nunca o JSON, a chave, o token, o e-mail ou a mensagem do erro)", () => {
    const codigo = semComentarios(ler(PLUGIN));
    const chamadas = [...codigo.matchAll(/Log\.[a-z]\(TAG, ([^;]+)\);/g)].map((m) => m[1].trim());
    expect(chamadas.length).toBeGreaterThan(8);
    const permitidas = [
      /^"[a-z0-9_]+"$/,
      /^"indisponivel_" \+ motivo$/,
      /^nuvem \? "criada_nuvem" : "criada_local"$/,
      /^semProvedor \? "[a-z0-9_]+" : "[a-z0-9_]+"$/,
      /^codigo\)?$/,
    ];
    for (const c of chamadas) expect(permitidas.some((p) => p.test(c)), c).toBe(true);
    // o log({ codigo }) do JS só aceita código
    expect(codigo).toContain('Pattern.compile("^[a-z0-9_]{1,40}$")');
    expect(codigo).not.toMatch(/Log\.[a-z]\([^;]*(getMessage|responseJson|requestJson|json)/i);
  });
});
