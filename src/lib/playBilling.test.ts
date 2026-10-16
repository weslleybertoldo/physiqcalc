import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

// play-W6 — a ponte com o plugin nativo da cobrança da Google Play. Fora da loja nativa tudo é "indisponível" (nunca uma compra
// falsa); o plugin só existe no playRelease e nunca reconhece a compra (o servidor reconhece).
const h = vi.hoisted(() => ({
  loja: true,
  plataforma: "android",
  pluginPresente: true,
  nativo: {
    disponivel: vi.fn(),
    produtos: vi.fn(),
    comprar: vi.fn(),
    compras: vi.fn(),
    gerenciar: vi.fn(),
    addListener: vi.fn(),
  },
}));
vi.mock("./distribuicao", () => ({
  get ehLoja() {
    return h.loja;
  },
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => h.plataforma, isPluginAvailable: (nome: string) => nome === "PlayBilling" && h.pluginPresente },
  registerPlugin: () => h.nativo,
}));

import {
  _esquecerDisponivelParaTestes,
  comprarNaPlay,
  comprasDaPlay,
  gerenciarNaPlay,
  ouvirComprasDaPlay,
  playDisponivel,
  pluginDaPlayPresente,
  produtosDaPlay,
  urlGerenciarNaPlay,
} from "./playBilling";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ler = (caminho: string) => readFileSync(resolve(RAIZ, caminho), "utf8");
const JAVA = "android/app/src";
const PACOTE_JAVA = "java/com/bertoldo/physiqcalc";

function arquivosJava(pasta: string): string[] {
  const raiz = resolve(RAIZ, pasta);
  const saida: string[] = [];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const p = join(dir, nome);
      if (statSync(p).isDirectory()) andar(p);
      else if (p.endsWith(".java")) saida.push(p);
    }
  };
  andar(raiz);
  return saida;
}

const produto = {
  id: "app_treino",
  nome: "Treino",
  titulo: "Treino (Physiq)",
  ofertas: [{ planoBase: "mensal", oferta: null, token: "tok-oferta", tags: [], fases: [{ precoFormatado: "R$ 29,90", precoMicros: 29_900_000, moeda: "BRL", periodo: "P1M", ciclos: 0, recorrencia: 1 }] }],
};

beforeEach(() => {
  h.loja = true;
  h.plataforma = "android";
  h.pluginPresente = true;
  for (const f of Object.values(h.nativo)) f.mockReset();
  _esquecerDisponivelParaTestes();
});

describe("fora da loja nativa = indisponível (nunca compra falsa)", () => {
  const casos: [string, () => void][] = [
    ["o site (sem a flag da loja)", () => (h.loja = false)],
    ["o build:loja aberto no navegador", () => (h.plataforma = "web")],
    ["a loja sem o plugin (build que não é o playRelease)", () => (h.pluginPresente = false)],
  ];
  for (const [nome, preparar] of casos) {
    it(nome, async () => {
      preparar();
      expect(pluginDaPlayPresente()).toBe(false);
      expect(await playDisponivel()).toBe(false);
      expect(await produtosDaPlay(["app_treino", "app_treino_alimentacao"])).toEqual({ produtos: [], naoAchados: ["app_treino", "app_treino_alimentacao"] });
      expect(await comprarNaPlay({ produto: "app_treino", oferta: "tok", conta: "m1" })).toEqual({ resultado: "indisponivel" });
      expect(await comprasDaPlay()).toEqual([]);
      const parar = await ouvirComprasDaPlay(() => {});
      parar();
      for (const f of Object.values(h.nativo)) expect(f).not.toHaveBeenCalled();
    });
  }
});

describe("na loja nativa, com o plugin", () => {
  it("disponível só com o sim da Play; o não pergunta de novo da próxima vez", async () => {
    h.nativo.disponivel.mockResolvedValueOnce({ disponivel: false, codigo: 3 }).mockResolvedValueOnce({ disponivel: true, codigo: 0 });
    expect(await playDisponivel()).toBe(false);
    expect(await playDisponivel()).toBe(true);
    expect(await playDisponivel()).toBe(true);
    expect(h.nativo.disponivel).toHaveBeenCalledTimes(2);
  });

  it("o plugin que falha = indisponível", async () => {
    h.nativo.disponivel.mockRejectedValue(new Error("x"));
    expect(await playDisponivel()).toBe(false);
  });

  it("os produtos: só os pedidos voltam; os que a Play não achou ficam em naoAchados", async () => {
    h.nativo.produtos.mockResolvedValue({ codigo: 0, produtos: [produto, { ...produto, id: "intruso" }], naoAchados: ["app_treino_alimentacao"] });
    const r = await produtosDaPlay(["app_treino", "app_treino_alimentacao", "app_treino"]);
    expect(h.nativo.produtos).toHaveBeenCalledWith({ ids: ["app_treino", "app_treino_alimentacao"] });
    expect(r.produtos.map((p) => p.id)).toEqual(["app_treino"]);
    expect(r.naoAchados).toEqual(["app_treino_alimentacao"]);
  });

  it("a compra repassa a oferta, a matrícula e, na troca, o token antigo + o modo", async () => {
    h.nativo.comprar.mockResolvedValue({ codigo: 0, resultado: "comprado", compras: [{ token: "t1", produtos: ["app_treino"], estado: "comprada", reconhecida: false, renova: true, conta: "m1" }] });
    const r = await comprarNaPlay({ produto: "app_treino_alimentacao", oferta: "tok", conta: "m1", troca: { tokenAntigo: "t0", produtoAntigo: "app_treino", modo: "na_hora" } });
    expect(h.nativo.comprar).toHaveBeenCalledWith({ produto: "app_treino_alimentacao", oferta: "tok", conta: "m1", tokenAntigo: "t0", produtoAntigo: "app_treino", modo: "na_hora" });
    expect(r).toEqual({ resultado: "comprado", compras: [expect.objectContaining({ token: "t1", reconhecida: false })] });
  });

  it("cancelado, já tem, indisponível e erro voltam como são; o plugin que lança vira erro (nunca comprado)", async () => {
    h.nativo.comprar
      .mockResolvedValueOnce({ codigo: 1, resultado: "cancelado" })
      .mockResolvedValueOnce({ codigo: 7, resultado: "ja_tem" })
      .mockResolvedValueOnce({ codigo: 3, resultado: "indisponivel" })
      .mockResolvedValueOnce({ codigo: 6, resultado: "erro" })
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("produto_nao_carregado"));
    const pedido = { produto: "app_treino", oferta: "tok", conta: "m1" };
    expect(await comprarNaPlay(pedido)).toEqual({ resultado: "cancelado" });
    expect(await comprarNaPlay(pedido)).toEqual({ resultado: "ja_tem" });
    expect(await comprarNaPlay(pedido)).toEqual({ resultado: "indisponivel" });
    expect(await comprarNaPlay(pedido)).toEqual({ resultado: "erro", codigo: 6 });
    expect(await comprarNaPlay(pedido)).toEqual({ resultado: "erro", codigo: -99 });
    expect(await comprarNaPlay(pedido)).toEqual({ resultado: "erro", codigo: -98 });
  });

  it("as compras do aparelho e o evento das compras que chegam por fora da folha", async () => {
    h.nativo.compras.mockResolvedValue({ codigo: 0, compras: [{ token: "t1", produtos: ["app_treino"], estado: "comprada", reconhecida: false, renova: true, conta: "m1" }] });
    expect((await comprasDaPlay()).map((c) => c.token)).toEqual(["t1"]);
    let ouvinte: ((d: unknown) => void) | null = null;
    const remover = vi.fn();
    h.nativo.addListener.mockImplementation(async (_e: string, f: (d: unknown) => void) => {
      ouvinte = f;
      return { remove: remover };
    });
    const recebidas: string[][] = [];
    const parar = await ouvirComprasDaPlay((c) => recebidas.push(c.map((x) => x.token)));
    ouvinte!({ resultado: "comprado", compras: [{ token: "t2" }] });
    ouvinte!({ resultado: "erro" });
    expect(recebidas).toEqual([["t2"]]);
    parar();
    expect(remover).toHaveBeenCalled();
  });

  it("gerenciar abre pelo plugin; fora da loja nativa, o link da Central de assinaturas", async () => {
    await gerenciarNaPlay("app_treino");
    expect(h.nativo.gerenciar).toHaveBeenCalledWith({ produto: "app_treino" });
    h.loja = false;
    const abrir = vi.spyOn(window, "open").mockReturnValue(null);
    await gerenciarNaPlay("app_treino");
    expect(abrir).toHaveBeenCalledWith(urlGerenciarNaPlay("app_treino"), "_blank", "noopener,noreferrer");
    abrir.mockRestore();
  });
});

describe("o link da Central de assinaturas", () => {
  it("com o produto: o sku e o pacote; sem: a lista", () => {
    expect(urlGerenciarNaPlay("app_treino")).toBe("https://play.google.com/store/account/subscriptions?sku=app_treino&package=com.bertoldo.physiqcalc");
    expect(urlGerenciarNaPlay()).toBe("https://play.google.com/store/account/subscriptions");
  });
});

describe("o Android: a cobrança só no playRelease", () => {
  it("a biblioteca 9.1.0 só no playReleaseImplementation", () => {
    const gradle = ler("android/app/build.gradle");
    expect(gradle).toContain('playReleaseImplementation "com.android.billingclient:billing:9.1.0"');
    const linhas = gradle.split("\n").filter((l) => l.includes("com.android.billingclient"));
    expect(linhas.map((l) => l.trim())).toEqual(['playReleaseImplementation "com.android.billingclient:billing:9.1.0"']);
  });

  it("o plugin mora só em src/playRelease; o main, o release e o debug não falam com a Play", () => {
    expect(ler(`${JAVA}/playRelease/${PACOTE_JAVA}/PlayBillingPlugin.java`)).toContain('@CapacitorPlugin(name = "PlayBilling")');
    expect(ler(`${JAVA}/playRelease/${PACOTE_JAVA}/PlataformaLoja.java`)).toContain("atividade.registerPlugin(PlayBillingPlugin.class);");
    for (const tipo of ["main", "release", "debug"]) {
      for (const arq of arquivosJava(`${JAVA}/${tipo}`)) {
        // só o código (os comentários podem citar a Play)
        const codigo = readFileSync(arq, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
        expect(codigo, arq).not.toMatch(/billingclient|PlayBillingPlugin/);
      }
    }
    for (const tipo of ["release", "debug"]) {
      expect(ler(`${JAVA}/${tipo}/${PACOTE_JAVA}/PlataformaLoja.java`)).toMatch(/static void registrar\(BridgeActivity atividade\) \{\s*\/\/[^\n]*\n\s*\}/);
    }
  });

  it("o MainActivity registra a PlataformaLoja antes do super.onCreate", () => {
    const main = ler(`${JAVA}/main/${PACOTE_JAVA}/MainActivity.java`);
    const registrar = main.indexOf("PlataformaLoja.registrar(this);");
    expect(registrar).toBeGreaterThan(0);
    expect(registrar).toBeLessThan(main.indexOf("super.onCreate(savedInstanceState);"));
  });

  it("o plugin NUNCA reconhece nem consome a compra (quem reconhece é o servidor)", () => {
    const plugin = ler(`${JAVA}/playRelease/${PACOTE_JAVA}/PlayBillingPlugin.java`);
    expect(plugin).not.toMatch(/acknowledgePurchase|AcknowledgePurchaseParams|consumeAsync|ConsumeParams/);
    expect(plugin).toContain("setObfuscatedAccountId(conta)");
  });

  it("a revisão ⚪19: o comprar confere a matrícula opaca no formato de uuid; os callbacks da Play rodam protegidos (exceção não derruba o app)", () => {
    const plugin = ler(`${JAVA}/playRelease/${PACOTE_JAVA}/PlayBillingPlugin.java`);
    expect(plugin).toMatch(/CONTA_UUID\.matcher\(conta\)\.matches\(\)/);
    expect(plugin).toContain('call.reject("conta_invalida")');
    // as idas que voltam pela thread da Play (os 2 queries) e o resultado da compra: dentro do protegido(…) / try-catch
    expect(plugin).toMatch(/queryProductDetailsAsync\(params, \(r, resultado\) -> protegido\(call, \(\) -> \{/);
    expect(plugin).toMatch(/queryPurchasesAsync\(params, \(r, lista\) -> protegido\(call, \(\) -> \{/);
    const atualizadas = plugin.slice(plugin.indexOf("public void onPurchasesUpdated"), plugin.indexOf("public void compras(") );
    expect(atualizadas).toMatch(/try \{[\s\S]*\} catch \(RuntimeException e\) \{/);
    // o pronta() da compra (os builders do BillingFlowParams) e o launchBillingFlow na thread da tela
    const comprar = plugin.slice(plugin.indexOf("public void comprar("), plugin.indexOf("public void onPurchasesUpdated"));
    expect(comprar).toMatch(/public void pronta\(\) \{\s*protegido\(call, \(\) -> \{/);
    expect(comprar).toMatch(/runOnUiThread\(\(\) -> protegido\(call, \(\) -> \{/);
  });

  it("a revisão 🟡7: o AAB local de STAGING nunca sai com o nome do de produção (-loja-staging); o de produção e o do check, iguais", () => {
    const script = ler("scripts/ci/aab-loja.sh");
    const fn = script.match(/^sufixo_do_aab\(\) \{[\s\S]*?^\}/m)?.[0] ?? "";
    expect(fn, "a função sufixo_do_aab no aab-loja.sh").not.toBe("");
    expect(script).toContain('final="$SAIDA/Physiq-v$v$(sufixo_do_aab "$aab").aab"');
    const pasta = mkdtempSync(join(tmpdir(), "aab-nome-"));
    try {
      const aab = (nome: string, schema: string) => {
        const d = join(pasta, nome, "base/assets/public");
        mkdirSync(d, { recursive: true });
        writeFileSync(join(d, "health.json"), JSON.stringify({ ok: true, schema, distribuicao: "play" }));
        spawnSync("zip", ["-qr", `../${nome}.aab`, "base"], { cwd: join(pasta, nome) });
        return join(pasta, `${nome}.aab`);
      };
      const sufixo = (arq: string, env: Record<string, string> = {}) =>
        spawnSync("bash", ["-c", `${fn}\nsufixo_do_aab "$1"`, "x", arq], { encoding: "utf8", env: { ...process.env, SUFIXO_AAB: "", ...env } }).stdout;
      const staging = aab("st", "staging");
      const producao = aab("pr", "public");
      expect(sufixo(staging)).toBe("-loja-staging");
      expect(sufixo(staging, { SUFIXO_AAB: "-loja" })).toBe("-loja-staging");
      expect(sufixo(producao)).toBe("-loja");
      expect(sufixo(producao, { SUFIXO_AAB: "-loja-check" })).toBe("-loja-check");
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
    // e a doc: à Google Play sobe SÓ o AAB do CI
    expect(ler("docs/loja-google-play.md")).toMatch(/À Google Play sobe SÓ o AAB do CI/);
  });

  it("a revisão ⚪19: o cobranca-play.sh confere o código de saída do dexdump (o dex que falha não passa calado — o multidex)", () => {
    const pasta = mkdtempSync(join(tmpdir(), "dex-play-"));
    try {
      const bt = join(pasta, "android/build-tools/35.0.0");
      mkdirSync(bt, { recursive: true });
      writeFileSync(join(bt, "aapt2"), "#!/usr/bin/env bash\necho \"uses-permission: name='android.permission.INTERNET'\"\n");
      // o 1º dex responde 150 classes; o 2º (onde estaria o plugin) falha
      writeFileSync(join(bt, "dexdump"), "#!/usr/bin/env bash\ncase \"$1\" in *classes2.dex) exit 1 ;; esac\nfor i in $(seq 1 150); do echo \"  Class descriptor  : 'Lx/C$i;'\"; done\n");
      chmodSync(join(bt, "aapt2"), 0o755);
      chmodSync(join(bt, "dexdump"), 0o755);
      const apk = join(pasta, "site.apk");
      writeFileSync(join(pasta, "classes.dex"), "dex");
      writeFileSync(join(pasta, "classes2.dex"), "dex");
      spawnSync("zip", ["-q", apk, "classes.dex", "classes2.dex"], { cwd: pasta });
      const r = spawnSync("bash", [resolve(RAIZ, "scripts/ci/cobranca-play.sh"), "sem", apk],
        { encoding: "utf8", env: { ...process.env, ANDROID_HOME: join(pasta, "android"), GITHUB_ACTIONS: "", TMPDIR: pasta } });
      expect(r.status, r.stdout + r.stderr).not.toBe(0);
      expect(r.stderr).toMatch(/dexdump falhou/);
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  it("a revisão ⚪19: o modo teste do apk-assinatura.sh prova que a chave é a de DEBUG (CN=Android Debug)", () => {
    const pasta = mkdtempSync(join(tmpdir(), "apk-debug-"));
    try {
      const bt = join(pasta, "android/build-tools/35.0.0");
      mkdirSync(bt, { recursive: true });
      const apk = join(pasta, "loja-staging.apk");
      writeFileSync(apk, "apk");
      const assinar = (dn: string) => {
        writeFileSync(join(bt, "apksigner"), `#!/usr/bin/env bash\n[ "$1" = version ] && { echo 0.9; exit 0; }\necho "Signer #1 certificate DN: ${dn}"\necho "Signer #1 certificate SHA-256 digest: aa11bb22cc33dd44ee55ff66aa11bb22cc33dd44ee55ff66aa11bb22cc33dd44"\n`);
        chmodSync(join(bt, "apksigner"), 0o755);
        return spawnSync("bash", [resolve(RAIZ, "scripts/ci/apk-assinatura.sh"), "teste", apk],
          { encoding: "utf8", env: { ...process.env, ANDROID_HOME: join(pasta, "android"), GITHUB_ACTIONS: "" } });
      };
      expect(assinar("C=US, O=Android, CN=Android Debug").status).toBe(0);
      const outra = assinar("CN=Fulano, O=Outra Empresa, C=BR");
      expect(outra.status, outra.stdout + outra.stderr).not.toBe(0);
      expect(outra.stderr).toMatch(/Android Debug/);
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  it("a revisão 🟡8: a VOLTA com assinante vivo — o roteiro no cabeçalho da reversa e no docs/loja-google-play.md (com a Play viva, só a trava)", () => {
    const reversa = ler("supabase-principal/reversas/20261016010000_playw6_play_billing_reversa.sql");
    const cabecalho = reversa.slice(0, reversa.indexOf("select set_config"));
    expect(cabecalho).toMatch(/COM ASSINATURA DA PLAY VIVA, A VOLTA É SÓ A TRAVA/);
    expect(cabecalho).toMatch(/só com 0 assinatura viva/);
    const doc = ler("docs/loja-google-play.md");
    expect(doc).toMatch(/### A volta com assinante vivo/);
    expect(doc).toMatch(/com assinatura viva, a volta é SÓ a trava/);
    expect(doc).toMatch(/cancelar \(ou devolver\) as vivas pela API/);
    // ⚪9: a cobrança da troca na hora é uma estimativa (o preço cheio; o Google cobra o rateio)
    expect(doc).toMatch(/troca na hora[^\n]*estimativa/);
  });

  it("a conferência das 2 saídas: o AAB tem a cobrança (g) e o APK do site, não", () => {
    const aab = ler("scripts/ci/aab-loja.sh");
    const conferir = aab.slice(aab.indexOf("passo_conferir() {"), aab.indexOf("passo_local() {"));
    expect(conferir).toContain('BUNDLETOOL_JAR="$bt" bash "$RAIZ/scripts/ci/cobranca-play.sh" tem "$aab" || falhas=$((falhas + 1))');
    expect(statSync(resolve(RAIZ, "scripts/ci/cobranca-play.sh")).mode & 0o111).not.toBe(0);
    for (const arquivo of [".github/workflows/build-apk.yml", ".github/workflows/build-apk-check.yml"]) {
      const wf = ler(arquivo);
      const apk = wf.slice(0, wf.indexOf("\n  aab-loja:"));
      expect(apk, arquivo).toContain('bash scripts/ci/cobranca-play.sh sem "$APK"');
      expect(apk.indexOf('bash scripts/ci/cobranca-play.sh sem "$APK"'), arquivo).toBeGreaterThan(apk.indexOf("assembleRelease"));
    }
  });
});
