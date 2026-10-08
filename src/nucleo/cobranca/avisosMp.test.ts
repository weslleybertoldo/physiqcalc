import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as principal from "../../../supabase-principal/functions/_shared/cobranca-regras";
import * as treino from "../../../supabase/functions/mp-webhook/regras";

// Homologação hml-06 (H-19) — avisos do Mercado Pago nos webhooks. As regras puras têm 2 cópias (o Treino não enxerga o _shared do
// principal): a tabela roda nas duas e elas têm de dar o mesmo resultado. As funções rodam no Deno: aqui só se confere o código delas.
const raiz = resolve(__dirname, "../../..");
const ler = (caminho: string) => readFileSync(resolve(raiz, caminho), "utf-8");
const COPIAS = [
  ["principal", principal],
  ["Treino", treino],
] as const;

const PAGAMENTO = ["payment", "subscription_authorized_payment", "authorized_payment"];
const ASSINATURA = ["preapproval", "subscription_preapproval"];

// [tópico, id, válido?]
const IDS: Array<[string, string, boolean]> = [
  // formato real (banco, 08/10/2026): pagamento só dígitos (10–12); assinatura hex32 ou 16 letras/dígitos (massa de teste)
  ...PAGAMENTO.map((t) => [t, "1325874455", true] as [string, string, boolean]),
  ["payment", "1", true],
  ["payment", "9".repeat(20), true],
  ["payment", "9".repeat(21), false],
  ["subscription_preapproval", "2c938084726fca480172750000000000", true],
  ["preapproval", "a1b2c3d4e5f6a7b8", true],
  ["preapproval", "A".repeat(64), true],
  ["preapproval", "A".repeat(65), false],
  // caminho e query injetados (a função é pública e chama o MP com o token de produção)
  ...PAGAMENTO.map((t) => [t, "../../users/me", false] as [string, string, boolean]),
  ...ASSINATURA.map((t) => [t, "../../users/me", false] as [string, string, boolean]),
  ["payment", "1?x=y", false],
  ["payment", "1/refunds", false],
  ["payment", "%2e%2e%2fusers%2fme", false],
  ["payment", "1 ", false],
  ["payment", "1\n", false],
  ["payment", "", false],
  ["payment", "abc", false],
  ["preapproval", "2c93-8084", false],
  ["preapproval", "abc_def", false],
  ["preapproval", "", false],
  // tópico que nenhum webhook trata
  ["merchant_order", "123", false],
  ["", "123", false],
];

describe("hml-06: id do aviso só no formato que o MP manda (idDoAvisoValido)", () => {
  for (const [nome, regras] of COPIAS) {
    it.each(IDS)(`${nome}: %s "%s" → %s`, (topico, id, valido) => {
      expect(regras.idDoAvisoValido(topico, id)).toBe(valido);
    });
  }

  it("as 2 cópias dão o mesmo resultado na tabela toda", () => {
    expect(IDS.map(([t, id]) => treino.idDoAvisoValido(t, id))).toEqual(IDS.map(([t, id]) => principal.idDoAvisoValido(t, id)));
  });
});

describe("hml-06: MP sem resposta que permita decidir (mpTransitorio) → o aviso volta 500", () => {
  const TABELA: Array<[number, boolean]> = [
    [500, true], [502, true], [503, true], [504, true], [599, true], // 599 = rede (mpFetch)
    [429, true], [401, true],
    [200, false], [201, false], [400, false], [403, false], [404, false],
  ];
  for (const [nome, regras] of COPIAS) {
    it.each(TABELA)(`${nome}: %i → %s`, (status, transitorio) => {
      expect(regras.mpTransitorio(status)).toBe(transitorio);
    });
  }
  it("as 2 cópias dão o mesmo resultado", () => {
    for (let st = 100; st <= 600; st++) expect(treino.mpTransitorio(st)).toBe(principal.mpTransitorio(st));
  });
});

describe("hml-06: os webhooks usam as regras (contrato do código — os módulos com Deno não rodam no Vitest)", () => {
  const WEBHOOKS = [
    "supabase/functions/mp-webhook/index.ts",
    "supabase-principal/functions/mp-webhook/index.ts",
    "supabase-principal/functions/mp-webhook-conta/index.ts",
    "supabase-principal/functions/mp-webhook-aluno/index.ts",
  ];

  it.each(WEBHOOKS)("%s: todo id que vai ao caminho da API do MP passa pelo encodeURIComponent", (arquivo) => {
    const fonte = ler(arquivo);
    const caminhos = [...fonte.matchAll(/`\/(?:v1\/payments|preapproval|authorized_payments)\/\$\{([^}]*)\}/g)].map((m) => m[1]);
    expect(caminhos.length).toBeGreaterThan(0);
    for (const c of caminhos) expect(c, arquivo).toMatch(/^encodeURIComponent\(/);
  });

  it("os 2 webhooks antigos (Treino e Nutri) conferem o id antes de ir ao MP e buscam pela credencial (sem mpGet)", () => {
    for (const arquivo of WEBHOOKS.slice(0, 2)) {
      const fonte = ler(arquivo);
      expect(fonte, arquivo).not.toMatch(/\bmpGet\(|function tokens\(/);
      const serve = fonte.slice(fonte.indexOf("Deno.serve("));
      expect(serve.indexOf("idDoAvisoValido(topic, id)"), arquivo).toBeGreaterThan(-1);
      expect(serve.indexOf("idDoAvisoValido(topic, id)"), arquivo).toBeLessThan(serve.search(/handlePayment\(|sincronizarPreapproval\(|buscarNoMp/));
      expect(fonte, arquivo).toContain('"outro_ambiente"');
    }
  });

  it("o Treino: o schema vem da credencial (SCHEMA[cred]) e o MP fora volta 500", () => {
    const fonte = ler("supabase/functions/mp-webhook/index.ts");
    expect(fonte).toContain('import { idDoAvisoValido, mpTransitorio } from "./regras.ts"');
    expect(fonte).toContain('const SCHEMA: Record<Cred, string> = { prod: "public", test: "staging" }');
    expect(fonte).not.toMatch(/adminFor\(ref\.schema\)|const schemas = ref \?/);
    expect(fonte).toMatch(/if \(e instanceof MpIndisponivel\) \{[\s\S]{0,160}status: 500/);
    expect(fonte).toMatch(/if \(alvo\.ignorar\) return new Response\("outro_ambiente"/);
  });

  it("Nutri, conta e aluno: buscam pela buscarNoMp e o catch devolve 500", () => {
    for (const arquivo of WEBHOOKS.slice(1)) {
      const fonte = ler(arquivo);
      expect(fonte, arquivo).toMatch(/await buscarNoMp</);
      expect(fonte, arquivo).not.toMatch(/await mpFetch|async function buscar</);
      const pegar = fonte.slice(fonte.lastIndexOf("} catch (e) {"));
      expect(pegar, arquivo).toMatch(/500/);
      expect(pegar, arquivo).not.toMatch(/return ok\("erro"\)|new Response\("ok", \{ status: 200 \}\)/);
    }
  });

  it("conta e aluno: nenhuma gravação do aviso ignora o erro do banco", () => {
    expect(ler("supabase-principal/functions/mp-webhook-conta/index.ts")).not.toMatch(/^\s*await db\.from\("conta_(faturas|assinaturas)"\)\.(update|upsert|insert)\(/m);
    expect(ler("supabase-principal/functions/mp-webhook-aluno/index.ts")).not.toMatch(/^\s*await db\.from\("(cobrancas|aluno_assinaturas)"\)\.(update|insert)\(/m);
  });
});

describe("hml-06 (H-19): mp-assinar desligada (a cobrança da conta é a cobranca-conta desde a W28)", () => {
  const fonte = ler("supabase-principal/functions/mp-assinar/index.ts");
  it("não lê token do MP nem chama a API dele", () => {
    expect(fonte).not.toMatch(/MP_ACCESS_TOKEN|api\.mercadopago\.com|createClient/);
  });
  it("preflight com o CORS de antes; qualquer outro pedido → 410 migrado", () => {
    expect(fonte).toMatch(/if \(req\.method === "OPTIONS"\) return new Response\("ok", \{ headers: cors\(origin\) \}\);/);
    expect(fonte).toMatch(/JSON\.stringify\(\{ error: "migrado" \}\), \{ status: 410/);
    expect(fonte).toContain('"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-schema"');
  });
});
