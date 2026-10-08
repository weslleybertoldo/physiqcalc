import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// hml-11 (H-28, D4) — o texto legal novo fica SÓ no build de staging até o advogado: a condição do Vite direto no código (o Rollup
// corta o import() na produção) e a guarda de CI (scripts/ci/sem-texto-legal-novo.sh) que confere o dist/ do APK e do AAB.

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ler = (caminho: string) => readFileSync(resolve(RAIZ, caminho), "utf8");
const GUARDA = resolve(RAIZ, "scripts/ci/sem-texto-legal-novo.sh");
const guarda = (pasta: string) => spawnSync("bash", [GUARDA, pasta], { encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "" } });

describe("a condição do Vite fica direto no código (o Rollup corta o texto novo da produção)", () => {
  it("Rotas.tsx: a PaginaLegal só no staging, com a expressão direto no lazy (sem função no meio)", () => {
    expect(ler("src/rotas/Rotas.tsx")).toContain(
      'const PaginaLegal = import.meta.env.VITE_DB_SCHEMA === "staging" ? lazy(() => import("@/publico/legal/PaginaLegal")) : null;',
    );
  });

  it.each([
    "src/painel/configuracoes/plano/PlanoContaNova.tsx",
    "src/entrada/onboarding/TreinarSemProfissional.tsx",
    "src/app-aluno/perfil/MeuPlano.tsx",
  ])("%s: o resumo antes de pagar só no staging, com a expressão direto no lazy", (arquivo) => {
    expect(ler(arquivo)).toContain(
      'const ResumoAntesDePagar = import.meta.env.VITE_DB_SCHEMA === "staging" ? lazy(() => import("@/publico/legal/ResumoAntesDePagar")) : null;',
    );
  });

  it("nenhum arquivo fora de src/publico/legal importa o texto novo de forma estática (ele entraria no bundle da produção)", () => {
    const arquivos = (readdirSync(resolve(RAIZ, "src"), { recursive: true }) as string[]).filter(
      (c) => /\.tsx?$/.test(c) && !/\.test\.tsx?$/.test(c) && !c.startsWith(join("publico", "legal")),
    );
    const estaticos = arquivos.filter((c) => /(^|\n)\s*import\s[^;]*?from\s+["']@\/publico\/legal\//.test(readFileSync(resolve(RAIZ, "src", c), "utf8")));
    expect(estaticos).toEqual([]);
  });
});

describe("a guarda de CI: scripts/ci/sem-texto-legal-novo.sh", () => {
  it("é executável, e as marcas dela existem no src/ (o controle positivo: senão ela ficaria oca)", () => {
    expect(statSync(GUARDA).mode & 0o111).not.toBe(0);
    const script = ler("scripts/ci/sem-texto-legal-novo.sh");
    for (const marca of ["Termos de assinatura do Physiq", "data-pagina-legal", "data-texto-em-revisao", "data-resumo-antes-de-pagar"]) {
      expect(script).toContain(`"${marca}"`);
    }
  });

  it("pasta de build sem o texto novo → passa; com uma marca dele → falha e diz qual", () => {
    const pasta = mkdtempSync(join(tmpdir(), "guarda-texto-legal-"));
    try {
      writeFileSync(join(pasta, "index-abc123.js"), 'console.log("Política de Privacidade e Termos", "sem reembolso do que já foi pago")');
      const limpa = guarda(pasta);
      expect(limpa.stderr).toBe("");
      expect(limpa.status).toBe(0);
      expect(limpa.stdout).toMatch(/^OK sem-texto-legal-novo/);

      writeFileSync(join(pasta, "PaginaLegal-xyz789.js"), 'jsx("div",{"data-pagina-legal":"termos",children:"Termos de assinatura do Physiq"})');
      const suja = guarda(pasta);
      expect(suja.status).toBe(1);
      expect(suja.stderr).toContain('"data-pagina-legal" está em');
      expect(suja.stderr).toContain('"Termos de assinatura do Physiq" está em');
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  it("pasta sem .js (o build não rodou) → erro de uso (2), nunca um 'passou' oco", () => {
    const pasta = mkdtempSync(join(tmpdir(), "guarda-texto-legal-"));
    try {
      expect(guarda(pasta).status).toBe(2);
      expect(guarda(join(pasta, "nao-existe")).status).toBe(2);
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  it("os 2 workflows do APK rodam a guarda depois do build:apk e do sem-master, antes do Capacitor", () => {
    for (const arquivo of [".github/workflows/build-apk.yml", ".github/workflows/build-apk-check.yml"]) {
      const wf = ler(arquivo);
      const job = wf.slice(0, wf.indexOf("\n  aab-loja:"));
      const build = job.indexOf("run: npm run build:apk\n");
      const semMaster = job.indexOf("run: bash scripts/ci/sem-master.sh dist\n");
      const conferir = job.indexOf("run: bash scripts/ci/sem-texto-legal-novo.sh dist\n");
      const sync = job.indexOf("run: npx cap sync android");
      expect(build, arquivo).toBeGreaterThan(0);
      expect(semMaster, arquivo).toBeGreaterThan(build);
      expect(conferir, arquivo).toBeGreaterThan(semMaster);
      expect(sync, arquivo).toBeGreaterThan(conferir);
      // o build do APK é o de produção
      expect(job.slice(build, semMaster), arquivo).toMatch(/VITE_DB_SCHEMA: public\n/);
    }
  });

  it("o AAB da Google Play (aab-loja.sh web, nos 2 workflows) roda a guarda no build de produção, antes do Capacitor", () => {
    const aab = ler("scripts/ci/aab-loja.sh");
    const web = aab.slice(aab.indexOf("passo_web() {"), aab.indexOf("passo_gradle() {"));
    expect(web).toMatch(/npm run build:loja[\s\S]*sem-master\.sh" dist[\s\S]*bash "\$RAIZ\/scripts\/ci\/sem-texto-legal-novo\.sh" dist[\s\S]*npx cap sync android/);
    // só o AAB de teste do notebook (build de staging, o .env.local) pula a conferência; o CI builda com VITE_DB_SCHEMA=public
    expect(web).toContain(`if grep -qF '"schema":"staging"' dist/health.json`);
    for (const arquivo of [".github/workflows/build-apk.yml", ".github/workflows/build-apk-check.yml"]) {
      const wf = ler(arquivo);
      const passo = wf.slice(wf.indexOf("run: bash scripts/ci/aab-loja.sh web"));
      expect(passo.slice(0, passo.indexOf("- name:")), arquivo).toMatch(/VITE_DB_SCHEMA: public\n/);
    }
  });
});
