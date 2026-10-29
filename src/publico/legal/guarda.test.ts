import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// A virada (hml-11 D12 + hml-12 §10; 29/10/2026, decisão do dono: os textos publicados como estão, sem advogado): a Política de
// Privacidade, os Termos de Uso e os Termos de assinatura novos, o resumo antes de pagar, a porta do aceite, o consentimento de saúde e
// a regra de idade valem também na produção — sem a condição de staging. A faixa "Versão em revisão" saiu (também do staging). A
// guarda de CI (scripts/ci/sem-texto-legal-novo.sh) passa a conferir só a faixa "em revisão" e, de controle positivo, que o build TEM
// o texto legal (a virada não volta atrás sem querer).

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ler = (caminho: string) => readFileSync(resolve(RAIZ, caminho), "utf8");
const GUARDA = resolve(RAIZ, "scripts/ci/sem-texto-legal-novo.sh");
const guarda = (pasta: string) => spawnSync("bash", [GUARDA, pasta], { encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "" } });
const CONDICAO_DE_STAGING = 'import.meta.env.VITE_DB_SCHEMA === "staging"';
/** Os arquivos do src/ que vão para o build (sem os testes), relativos ao src/. */
const codigoDoSrc = () =>
  (readdirSync(resolve(RAIZ, "src"), { recursive: true }) as string[]).filter((c) => /\.tsx?$/.test(c) && !/\.(test|spec)\.tsx?$/.test(c));

describe("a virada: as peças dos textos legais sem a condição de staging", () => {
  // as telas que tinham a condição até a virada (hml-11: as rotas, o rodapé e as telas que vendem; hml-12: a porta, o consentimento,
  // a idade e as frases da exclusão; play-W6: a folha da Google Play)
  const DA_VIRADA = [
    "src/App.tsx",
    "src/rotas/Rotas.tsx",
    "src/publico/PublicoLayout.tsx",
    "src/painel/configuracoes/plano/PlanoContaNova.tsx",
    "src/entrada/onboarding/TreinarSemProfissional.tsx",
    "src/app-aluno/perfil/MeuPlano.tsx",
    "src/app-aluno/sozinho/pecas/AssinaturaPlay.tsx",
    "src/publico/Formulario.tsx",
    "src/painel/aluno/resumo/CardDadosAluno.tsx",
    "src/painel/alunos/Pendentes.tsx",
    "src/painel/alunos/NovoAluno.tsx",
    "src/entrada/onboarding/CriarConta.tsx",
    "src/publico/Cadastro.tsx",
    "src/entrada/pecas/Moldura.tsx",
    "src/publico/ExcluirConta.tsx",
    "src/painel/configuracoes/excluirConta/FluxoExclusao.tsx",
    "src/painel/configuracoes/excluirConta/regras.ts",
  ];

  it.each(DA_VIRADA.filter((a) => a !== "src/rotas/Rotas.tsx"))("%s: sem a condição de staging", (arquivo) => {
    expect(ler(arquivo)).not.toContain(CONDICAO_DE_STAGING);
  });

  it("Rotas.tsx: a condição de staging sobra só na /erro-teste (a página que quebra o app de propósito)", () => {
    const linhas = ler("src/rotas/Rotas.tsx")
      .split("\n")
      .filter((l) => l.includes(CONDICAO_DE_STAGING));
    expect(linhas).toEqual(['const ErroDeTeste = import.meta.env.VITE_DB_SCHEMA === "staging" ? lazy(() => import("@/publico/ErroDeTeste")) : null;']);
  });

  it("no src/ inteiro, a condição de staging só existe na /erro-teste", () => {
    const com = codigoDoSrc().filter((c) => readFileSync(resolve(RAIZ, "src", c), "utf8").includes(CONDICAO_DE_STAGING));
    expect(com.sort()).toEqual([join("publico", "ErroDeTeste.tsx"), join("rotas", "Rotas.tsx")]);
  });

  // os textos continuam carregando sob demanda (o JS inicial não leva ~60 KB de texto legal): o import() direto, sem condição
  it.each([
    ["src/rotas/Rotas.tsx", "PaginaLegal", "PaginaLegal"],
    ["src/painel/configuracoes/plano/PlanoContaNova.tsx", "ResumoAntesDePagar", "ResumoAntesDePagar"],
    ["src/entrada/onboarding/TreinarSemProfissional.tsx", "ResumoAntesDePagar", "ResumoAntesDePagar"],
    ["src/app-aluno/perfil/MeuPlano.tsx", "ResumoAntesDePagar", "ResumoAntesDePagar"],
    ["src/app-aluno/sozinho/pecas/AssinaturaPlay.tsx", "ResumoAntesDePagar", "ResumoAntesDePagar"],
    ["src/App.tsx", "PortaDoAceite", "aceite/PortaDoAceite"],
    ["src/entrada/onboarding/TreinarSemProfissional.tsx", "ConsentimentoSaude", "aceite/ConsentimentoSaude"],
    ["src/entrada/onboarding/TreinarSemProfissional.tsx", "CampoNascimento", "aceite/CampoNascimento"],
    ["src/publico/Formulario.tsx", "ConsentimentoSaude", "aceite/ConsentimentoSaude"],
    ["src/painel/aluno/resumo/CardDadosAluno.tsx", "SecaoResponsavel", "responsavel/SecaoResponsavel"],
  ])("%s: %s carrega por import() direto, em todo build", (arquivo, nome, modulo) => {
    expect(ler(arquivo)).toContain(`const ${nome} = lazy(() => import("@/publico/legal/${modulo}"));`);
  });

  it("nenhum arquivo fora de src/publico/legal importa o texto legal de forma estática (ele iria para o JS inicial)", () => {
    const estaticos = codigoDoSrc()
      .filter((c) => !c.startsWith(join("publico", "legal")))
      .filter((c) => /(^|\n)\s*import\s[^;]*?from\s+["']@\/publico\/legal\//.test(readFileSync(resolve(RAIZ, "src", c), "utf8")));
    expect(estaticos).toEqual([]);
  });

  it("a Política de antes (src/publico/Privacidade.tsx) saiu: /privacidade e /termos são da página legal; o textos.ts fica", () => {
    expect(existsSync(resolve(RAIZ, "src/publico/Privacidade.tsx"))).toBe(false);
    expect(existsSync(resolve(RAIZ, "src/publico/privacidade/textos.ts"))).toBe(true);
    expect(ler("src/rotas/registro.ts")).not.toMatch(/\bPrivacidade:/);
  });

  it("a faixa 'Versão em revisão' saiu do código (também do staging)", () => {
    const com = codigoDoSrc().filter((c) => /data-texto-em-revisao|Versão em revisão/.test(readFileSync(resolve(RAIZ, "src", c), "utf8")));
    expect(com).toEqual([]);
  });
});

describe("a guarda de CI: scripts/ci/sem-texto-legal-novo.sh (depois da virada)", () => {
  const OBRIGATORIAS = ["Termos de assinatura do Physiq", "data-pagina-legal", "data-aceite-no-acesso", "data-resumo-antes-de-pagar"];

  it("é executável; a faixa 'em revisão' é a única marca proibida; as obrigatórias (o texto legal no build) existem no src/", () => {
    expect(statSync(GUARDA).mode & 0o111).not.toBe(0);
    const script = ler("scripts/ci/sem-texto-legal-novo.sh");
    // a lista vai até o ")" sozinho na linha (os comentários das marcas têm parênteses)
    const lista = (nome: string) => script.slice(script.indexOf(`${nome}=(`), script.indexOf("\n)", script.indexOf(`${nome}=(`)));
    const proibidas = lista("PROIBIDAS");
    expect(proibidas).toContain('"data-texto-em-revisao"');
    // as marcas da hml-11 e da hml-12 saíram da lista do que é proibido: agora vão para a produção
    for (const marca of ["data-aceite-no-acesso", "data-consentimento-saude", "data-tela-menor", "data-rodape-aceite", "salvo a desist"]) {
      expect(proibidas, marca).not.toContain(`"${marca}"`);
    }
    const obrigatorias = lista("OBRIGATORIAS");
    const doSrc = codigoDoSrc()
      .map((c) => readFileSync(resolve(RAIZ, "src", c), "utf8"))
      .join("\n");
    for (const marca of OBRIGATORIAS) {
      expect(obrigatorias, marca).toContain(`"${marca}"`);
      expect(doSrc.includes(marca), `${marca} no src/`).toBe(true);
    }
  });

  it("build com o texto legal e sem a faixa → passa", () => {
    const pasta = mkdtempSync(join(tmpdir(), "guarda-texto-legal-"));
    try {
      writeFileSync(join(pasta, "index-abc123.js"), 'console.log("Physiq")');
      writeFileSync(
        join(pasta, "PaginaLegal-xyz789.js"),
        'jsx("div",{"data-pagina-legal":"assinatura",children:"Termos de assinatura do Physiq"}),jsx("section",{"data-resumo-antes-de-pagar":"loja"})',
      );
      writeFileSync(join(pasta, "PortaDoAceite-k1m2n3.js"), 'jsx("div",{"data-aceite-no-acesso":"2026-10-29"})');
      const limpa = guarda(pasta);
      expect(limpa.stderr).toBe("");
      expect(limpa.status).toBe(0);
      expect(limpa.stdout).toMatch(/^OK sem-texto-legal-novo/);
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  it("build com a faixa 'em revisão' → falha e diz qual marca achou", () => {
    const pasta = mkdtempSync(join(tmpdir(), "guarda-texto-legal-"));
    try {
      writeFileSync(
        join(pasta, "PaginaLegal-xyz789.js"),
        'jsx("div",{"data-pagina-legal":"termos",children:"Termos de assinatura do Physiq"}),jsx("p",{"data-texto-em-revisao":!0}),' +
          'jsx("section",{"data-resumo-antes-de-pagar":"loja"}),jsx("div",{"data-aceite-no-acesso":"2026-10-29"})',
      );
      const suja = guarda(pasta);
      expect(suja.status).toBe(1);
      expect(suja.stderr).toContain('"data-texto-em-revisao" está em');
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  it("build SEM o texto legal (ex.: a condição de staging voltou e o Rollup cortou) → falha e diz o que falta (controle positivo)", () => {
    const pasta = mkdtempSync(join(tmpdir(), "guarda-texto-legal-"));
    try {
      writeFileSync(join(pasta, "index-abc123.js"), 'console.log("Política de Privacidade e Termos", "sem reembolso do que já foi pago")');
      const sem = guarda(pasta);
      expect(sem.status).toBe(1);
      for (const marca of OBRIGATORIAS) expect(sem.stderr).toContain(`"${marca}" não está`);
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

  it("o AAB da Google Play (aab-loja.sh web, nos 2 workflows) roda a guarda no build, antes do Capacitor — também no de staging", () => {
    const aab = ler("scripts/ci/aab-loja.sh");
    const web = aab.slice(aab.indexOf("passo_web() {"), aab.indexOf("passo_gradle() {"));
    expect(web).toMatch(/npm run build:loja[\s\S]*sem-master\.sh" dist[\s\S]*bash "\$RAIZ\/scripts\/ci\/sem-texto-legal-novo\.sh" dist[\s\S]*npx cap sync android/);
    // desde a virada o build de staging também sai sem a faixa: o AAB de teste do notebook não pula mais a conferência
    expect(web).not.toContain('"schema":"staging"');
    for (const arquivo of [".github/workflows/build-apk.yml", ".github/workflows/build-apk-check.yml"]) {
      const wf = ler(arquivo);
      const passo = wf.slice(wf.indexOf("run: bash scripts/ci/aab-loja.sh web"));
      expect(passo.slice(0, passo.indexOf("- name:")), arquivo).toMatch(/VITE_DB_SCHEMA: public\n/);
    }
  });
});
