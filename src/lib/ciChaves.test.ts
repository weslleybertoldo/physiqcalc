import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// hml-16b (H-45) — as chaves que o GitHub guarda só chegam a quem precisa: a do APK do site e a de upload da Play moram no
// environment "assinatura" (só a main), a cópia do APK do site para o aparelho no "assinatura-aparelho" (aprovação do dono) e o PAT
// do PowerSync no "powersync" (só a main). O check da branch assina com chaves DESCARTÁVEIS geradas no próprio job.
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ler = (caminho: string) => readFileSync(resolve(RAIZ, caminho), "utf8");

/** Os jobs do workflow pelo texto: do "  nome:" (2 espaços, logo abaixo de "jobs:") até o próximo job. */
function jobs(arquivo: string): Record<string, string> {
  const wf = ler(arquivo);
  const corpo = wf.slice(wf.indexOf("\njobs:\n") + 7);
  const saida: Record<string, string> = {};
  let nome = "";
  for (const linha of corpo.split("\n")) {
    const m = linha.match(/^ {2}([a-z0-9-]+):\s*$/);
    if (m) nome = m[1];
    else if (nome) saida[nome] = (saida[nome] ?? "") + linha + "\n";
  }
  return saida;
}

const semComentarios = (texto: string) =>
  texto
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");

const CHAVE_DE_ASSINATURA = /secrets\.(KEYSTORE_|KEY_ALIAS|KEY_PASSWORD|PLAY_UPLOAD_)/;

describe("hml-16b (H-45): segredos do GitHub por environment", () => {
  it("as chaves de assinatura só aparecem em job com o environment delas", () => {
    const esperado: Record<string, Record<string, string>> = {
      ".github/workflows/build-apk.yml": { build: "assinatura", "aab-loja": "assinatura" },
      ".github/workflows/build-apk-check.yml": { "apk-aparelho": "assinatura-aparelho" },
      ".github/workflows/keep-alive.yml": {},
      ".github/workflows/ci-pr.yml": {},
    };
    for (const [arquivo, comChave] of Object.entries(esperado)) {
      for (const [nome, job] of Object.entries(jobs(arquivo))) {
        const codigo = semComentarios(job);
        if (comChave[nome]) {
          expect(codigo, `${arquivo} › ${nome}`).toMatch(CHAVE_DE_ASSINATURA);
          expect(codigo, `${arquivo} › ${nome}`).toMatch(new RegExp(`^ {4}environment: ${comChave[nome]}$`, "m"));
        } else {
          expect(codigo, `${arquivo} › ${nome}`).not.toMatch(CHAVE_DE_ASSINATURA);
        }
      }
    }
  });

  it("o PAT do PowerSync só chega ao job do PowerSync, no environment powersync", () => {
    for (const arquivo of [".github/workflows/build-apk.yml", ".github/workflows/build-apk-check.yml", ".github/workflows/ci-pr.yml"]) {
      expect(ler(arquivo), arquivo).not.toContain("POWERSYNC_PAT");
    }
    const keepAlive = jobs(".github/workflows/keep-alive.yml");
    for (const [nome, job] of Object.entries(keepAlive)) {
      if (nome === "keep-alive-powersync") {
        expect(job).toContain("secrets.POWERSYNC_PAT");
        expect(job).toMatch(/^ {4}environment: powersync$/m);
      } else {
        expect(job, nome).not.toContain("POWERSYNC_PAT");
      }
    }
  });

  it("o check da branch (push) assina com chaves descartáveis e confere que não é chave real", () => {
    const check = jobs(".github/workflows/build-apk-check.yml");
    expect(Object.keys(check)).toEqual(["build", "aab-loja", "apk-aparelho"]);
    for (const nome of ["build", "aab-loja"]) {
      expect(check[nome], nome).toMatch(/^ {4}if: \$\{\{ !inputs\.chave_real \}\}$/m);
      expect(check[nome], nome).not.toMatch(/^ {4}environment:/m);
      expect(check[nome], nome).toContain("keytool -genkeypair -noprompt -storetype PKCS12");
      expect(check[nome], nome).toContain("-validity 2");
      expect(check[nome], nome).toContain('echo "::add-mask::$');
    }
    expect(check.build).toContain('bash scripts/ci/apk-assinatura.sh descartavel "$APK" "$APK_SHA256_DESCARTAVEL"');
    expect(check.build).toContain("-check-descartavel\n");
    expect(check["aab-loja"]).toContain('CHECK_DESCARTAVEL: "1"');
    expect(check["aab-loja"]).toContain('echo "SHA256_UPLOAD_ESPERADO=$FP" >> "$GITHUB_ENV"');
    // o job do aparelho: só à mão, com aprovação, artefato de 1 dia, e o APK confere que saiu com a chave do site
    expect(check["apk-aparelho"]).toMatch(/^ {4}if: \$\{\{ inputs\.chave_real \}\}$/m);
    expect(check["apk-aparelho"]).toContain("retention-days: 1\n");
    expect(check["apk-aparelho"]).toContain('bash scripts/ci/apk-assinatura.sh site "$APK"');
    expect(ler(".github/workflows/build-apk-check.yml")).toMatch(/workflow_dispatch:\n {4}inputs:\n {6}chave_real:\n[\s\S]*?type: boolean\n {8}default: false/);
  });

  it("a chave do APK do site só existe no disco durante o Gradle (depois do npm ci, dos testes e do build)", () => {
    const casos: [string, string][] = [
      [".github/workflows/build-apk.yml", "build"],
      [".github/workflows/build-apk-check.yml", "apk-aparelho"],
    ];
    for (const [arquivo, nome] of casos) {
      const job = semComentarios(jobs(arquivo)[nome]);
      expect(job, `${arquivo} › ${nome}`).not.toContain("Decode keystore");
      const chave = job.indexOf("secrets.KEYSTORE_BASE64");
      for (const antes of ["run: npm ci", "run: npm test", "run: npm run build:apk", "run: npx cap sync android"]) {
        expect(job.indexOf(antes), `${arquivo} › ${nome}: ${antes}`).toBeGreaterThan(0);
        expect(job.indexOf(antes), `${arquivo} › ${nome}: ${antes} antes da chave`).toBeLessThan(chave);
      }
      // o mesmo passo decodifica, roda o Gradle sem daemon e apaga a pasta da chave
      const passo = job.slice(job.lastIndexOf("- name:", chave));
      expect(passo).toContain("./gradlew --no-daemon assembleRelease");
      expect(passo).toContain('rm -rf "$D"');
      expect(passo).toContain("unset KEYSTORE_BASE64");
    }
  });

  it("o APK do aparelho passa pelas mesmas guardas do APK do check (master e textos legais novos)", () => {
    const check = jobs(".github/workflows/build-apk-check.yml");
    for (const guarda of ["run: npm run build:apk", "run: bash scripts/ci/sem-master.sh dist", "run: bash scripts/ci/sem-texto-legal-novo.sh dist"]) {
      expect(check.build, guarda).toContain(guarda);
      expect(check["apk-aparelho"], guarda).toContain(guarda);
    }
  });

  it("as impressões do site e do upload do apk-assinatura.sh são as mesmas do aab-loja.sh", () => {
    const impressao = (arquivo: string, nome: string) => ler(arquivo).match(new RegExp(`^${nome}="([0-9A-F:]+)"`, "m"))?.[1];
    for (const nome of ["SHA256_SITE", "SHA256_UPLOAD"]) {
      const valor = impressao("scripts/ci/aab-loja.sh", nome);
      expect(valor, nome).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
      expect(impressao("scripts/ci/apk-assinatura.sh", nome), nome).toBe(valor);
    }
  });

  it("o apk-assinatura.sh recusa chave real no modo descartável e pede a do site no modo site", () => {
    const script = ler("scripts/ci/apk-assinatura.sh");
    expect(script).toContain('if [ "$esperado" = "$site" ] || [ "$esperado" = "$upload" ]; then');
    expect(script).toContain('if [ "$dig" = "$site" ] || [ "$dig" = "$upload" ]; then');
    expect(script).toContain('if [ "$dig" != "$esperado" ]; then');
    expect(script).toContain('if [ "$dig" != "$(printf \'%s\' "$SHA256_SITE" | norm)" ]; then');
    // a leitura que falha mostra a saída do apksigner (só certificado e impressões) em vez de sair calada
    expect(script).toContain("a saída do apksigner não tem a impressão SHA-256 do certificado:");
  });
});
