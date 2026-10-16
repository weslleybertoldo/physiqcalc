import { readFileSync, readdirSync, statSync } from "node:fs";
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
