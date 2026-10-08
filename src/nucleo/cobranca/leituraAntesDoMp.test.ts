import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Homologação hml-06 (H-20) — a cobrança não cria assinatura (nem Pix) sem ler a atual. A leitura que falhava virava "não tem":
// o aluno_mp_assinar criava outra assinatura sem cancelar a atual (o aluno pagava 2×) e o assinar da conta sobrescrevia o id da
// atual no upsert (ela seguia cobrando sem rastro). Agora o erro sobe e o catch final devolve 500 ANTES de qualquer POST ao MP.
// As funções rodam no Deno: aqui só se confere o código delas.
const FUNCOES = resolve(__dirname, "../../../supabase-principal/functions");
const codigo = (arq: string) => readFileSync(resolve(FUNCOES, arq), "utf-8");
const ALUNO = codigo("pagamentos-aluno/index.ts");
const CONTA = codigo("cobranca-conta/index.ts");

/** O texto de cada leitura de uma tabela: do `const { … } =` até o fim do comando seguinte (a checagem do erro). */
function leituras(fonte: string, tabela: string): string[] {
  const re = new RegExp(`const \\{[^}]*\\} = await db\\.from\\("${tabela}"\\)\\.select\\(`, "g");
  return [...fonte.matchAll(re)].map((m) => {
    const fim = fonte.indexOf(";", fonte.indexOf(";", m.index!) + 1);
    return fonte.slice(m.index!, fim + 1);
  });
}
const confereErro = (trecho: string) => /const \{[^}]*\berror\b[^}]*\} = /.test(trecho) && /if \(error\) throw error;/.test(trecho);

/** O corpo de uma ação: de `if (acao === "<x>"` (no nível das ações, 4 espaços) até a próxima ação do mesmo nível. */
function acao(fonte: string, nome: string): string {
  const i = fonte.indexOf(`\n    if (acao === "${nome}"`);
  expect(i, nome).toBeGreaterThan(-1);
  const j = fonte.indexOf("\n    if (acao === ", i + 1);
  return fonte.slice(i, j > -1 ? j : undefined);
}

describe("hml-06: leituras da assinatura atual olham o erro (todas)", () => {
  it("pagamentos-aluno: toda leitura de aluno_assinaturas", () => {
    const l = leituras(ALUNO, "aluno_assinaturas");
    expect(l.length).toBeGreaterThan(0);
    for (const t of l) expect(confereErro(t), t).toBe(true);
    expect(ALUNO).not.toMatch(/\(await db\.from\("aluno_assinaturas"\)\.select\(/);
  });
  it("cobranca-conta: toda leitura de conta_assinaturas", () => {
    const l = leituras(CONTA, "conta_assinaturas");
    expect(l.length).toBeGreaterThan(0);
    for (const t of l) expect(confereErro(t), t).toBe(true);
    expect(CONTA).not.toMatch(/\(await db\.from\("conta_assinaturas"\)\.select\(/);
  });
});

describe("hml-06: Pix aberto e fatura olham o erro", () => {
  it("pagamentos-aluno: o Pix aberto do aluno_mp_pix", () => {
    const pix = leituras(ALUNO, "cobrancas").filter((t) => t.includes('.eq("metodo", "pix").eq("status", "aguardando_confirmacao")'));
    expect(pix).toHaveLength(1);
    expect(confereErro(pix[0])).toBe(true);
  });
  it("cobranca-conta: buscarFatura e o Pix aberto do pix_criar", () => {
    const fatura = CONTA.slice(CONTA.indexOf("const buscarFatura = async"), CONTA.indexOf("const simulado ="));
    expect(confereErro(fatura)).toBe(true);
    const pix = leituras(CONTA, "conta_faturas").filter((t) => t.includes('.order("criado_em", { ascending: false });') && t.includes('.eq("forma", "pix")'));
    expect(pix).toHaveLength(1);
    expect(confereErro(pix[0])).toBe(true);
  });
});

describe("hml-06: a leitura vem ANTES do POST ao MP", () => {
  it("aluno_mp_assinar: assinaturaDe (que lança) antes do POST /preapproval", () => {
    const corpo = acao(ALUNO, "aluno_mp_assinar");
    expect(corpo.indexOf("await assinaturaDe(m.id)")).toBeGreaterThan(-1);
    expect(corpo.indexOf("await assinaturaDe(m.id)")).toBeLessThan(corpo.indexOf('"/preapproval", { method: "POST"'));
    const helper = ALUNO.slice(ALUNO.indexOf("const assinaturaDe = async"), ALUNO.indexOf("const nomeDe = async"));
    expect(confereErro(helper)).toBe(true);
  });
  it("aluno_mp_pix/cartao: assinatura e Pix aberto lidos antes do POST /v1/payments", () => {
    const corpo = acao(ALUNO, "aluno_mp_pix");
    const post = corpo.indexOf('"/v1/payments", {');
    expect(post).toBeGreaterThan(-1);
    expect(corpo.indexOf("await assinaturaDe(m.id)")).toBeLessThan(post);
    expect(corpo.indexOf("if (error) throw error;")).toBeGreaterThan(-1);
    expect(corpo.indexOf("if (error) throw error;")).toBeLessThan(post);
  });
  it("cobranca-conta assinar: buscarAssinatura (que lança) antes do POST /preapproval", () => {
    const corpo = acao(CONTA, "assinar");
    expect(corpo.indexOf("await buscarAssinatura()")).toBeGreaterThan(-1);
    expect(corpo.indexOf("await buscarAssinatura()")).toBeLessThan(corpo.indexOf('mpFetch<AssinaturaMp>(credencial, "/preapproval", {'));
    const helper = CONTA.slice(CONTA.indexOf("const buscarAssinatura = async"), CONTA.indexOf("const buscarFatura = async"));
    expect(confereErro(helper)).toBe(true);
  });
  it("cobranca-conta pix_criar/cartao_pagar: assinatura e Pix aberto lidos antes do POST /v1/payments", () => {
    const corpo = acao(CONTA, "pix_criar");
    const post = corpo.indexOf('"/v1/payments", {');
    expect(post).toBeGreaterThan(-1);
    expect(corpo.indexOf("await buscarAssinatura()")).toBeLessThan(post);
    expect(corpo.indexOf("if (error) throw error;")).toBeGreaterThan(-1);
    expect(corpo.indexOf("if (error) throw error;")).toBeLessThan(post);
  });
  it("o catch final das 2 devolve 500 erro_interno", () => {
    for (const fonte of [ALUNO, CONTA]) expect(fonte.slice(fonte.lastIndexOf("} catch (e) {"))).toContain('erro("erro_interno", 500, origin)');
  });
});
