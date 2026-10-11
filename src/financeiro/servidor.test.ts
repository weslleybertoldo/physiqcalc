import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lerReferencia as lerReferenciaConta, referenciaConta } from "../../supabase-principal/functions/_shared/cobranca-regras";
import {
  bucketComprovantes,
  caminhoComprovante,
  cobrancaDoStatusMp,
  coberto,
  comprovanteDaMatricula,
  descricaoMensalidade,
  diaSP as diaSPServidor,
  ehMetodoPorFora,
  extensaoComprovante,
  lerReferenciaAluno,
  lerReferenciaCalc,
  mesPorExtenso,
  mesRefDe,
  mpEmAberto,
  pagamentoEDaCobranca,
  podeMexerNaCobranca,
  podeMexerNaMensalidade,
  podeVerCobranca,
  referenciaAluno,
  valorValido,
  vencimentoAPagar,
  type PapelNaMatricula,
} from "../../supabase-principal/functions/_shared/financeiro-regras";
import { diaSP, estadoDaMensalidade, lerValor, ROTULO_METODO } from "./regras";

const P = "11111111-2222-4333-8444-555555555555";
const C = "99999999-8888-4777-8666-555555555555";
const U = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("referência externa das cobranças de aluno no Mercado Pago", () => {
  it("ida e volta; o webhook da conta (W4) e o antigo do Calc não leem a do aluno", () => {
    const ref = referenciaAluno("staging", P, "avulsa", C);
    expect(ref).toBe(`physiq:staging:aluno:${P}:avulsa:${C}`);
    expect(lerReferenciaAluno(ref)).toEqual({ schema: "staging", pacienteId: P, tipo: "avulsa", cobrancaId: C });
    expect(lerReferenciaAluno(referenciaAluno("public", P, "recorrente"))).toEqual({ schema: "public", pacienteId: P, tipo: "recorrente", cobrancaId: null });
    expect(lerReferenciaConta(ref)).toBeNull();
    expect(lerReferenciaCalc(ref)).toBeNull();
  });
  it("recusa o que não é dela (conta, Calc, Nutri, lixo)", () => {
    expect(lerReferenciaAluno(referenciaConta("public", C, "mensal"))).toBeNull();
    expect(lerReferenciaAluno(`public:${U}:2026-09-01`)).toBeNull();
    expect(lerReferenciaAluno("physiqnutri:abc")).toBeNull();
    expect(lerReferenciaAluno(`physiq:prod:aluno:${P}:mensalidade`)).toBeNull();
    expect(lerReferenciaAluno(`physiq:public:aluno:nao-uuid:mensalidade`)).toBeNull();
    expect(lerReferenciaAluno(`physiq:public:aluno:${P}:plano`)).toBeNull();
    expect(lerReferenciaAluno(`physiq:public:aluno:${P}:avulsa:../x`)).toBeNull();
    expect(lerReferenciaAluno(null)).toBeNull();
  });
  it("referência antiga do Calc: a mesma leitura do parseRef do mp-webhook do Treino", () => {
    expect(lerReferenciaCalc(`staging:${U}:2026-09:aluno:mensal`)).toEqual({ schema: "staging", treinoUserId: U, mesRef: "2026-09", contexto: "aluno", tipoCobranca: "mensal" });
    expect(lerReferenciaCalc(`public:${U}`)).toEqual({ schema: "public", treinoUserId: U, mesRef: null, contexto: "aluno", tipoCobranca: "mensal" });
    expect(lerReferenciaCalc(`public:${U}::plano_professor:adesao`)).toMatchObject({ contexto: "plano_professor", tipoCobranca: "adesao" });
    expect(lerReferenciaCalc(`prod:${U}`)).toBeNull();
    expect(lerReferenciaCalc(`public:nao-uuid`)).toBeNull();
  });
});

describe("status do Mercado Pago → cobrança", () => {
  it.each([
    ["approved", "paga", false, false],
    ["pending", "aguardando_confirmacao", false, false],
    ["in_process", "aguardando_confirmacao", false, false],
    ["authorized", "aguardando_confirmacao", false, false],
    ["rejected", "cancelada", false, true],
    ["cancelled", "cancelada", false, true],
    ["expired", "cancelada", false, true],
    ["refunded", "cancelada", true, true],
    ["charged_back", "cancelada", true, true],
  ])("%s → %s", (mp, status, reembolso, final) => {
    expect(cobrancaDoStatusMp(mp)).toEqual({ status, reembolso, final });
  });
  it("nada do MP fica 'aberta' (a trava e o WhatsApp do Nutri só olham 'aberta'); em aberto = pode mudar", () => {
    for (const s of ["approved", "pending", "rejected", "refunded", "", null]) expect(cobrancaDoStatusMp(s).status).not.toBe("aberta");
    expect(mpEmAberto("pending")).toBe(true);
    expect(mpEmAberto(null)).toBe(true);
    expect(mpEmAberto("approved")).toBe(false);
  });
});

describe("mensalidade no servidor x na tela", () => {
  it("descrição e mês de referência", () => {
    expect(mesRefDe("2026-09-29")).toBe("2026-09-01");
    expect(mesPorExtenso("2026-09-01")).toBe("Setembro/2026");
    expect(descricaoMensalidade("Amigos+Nutritrack", "2026-09-01")).toBe("Mensalidade · Amigos+Nutritrack · Setembro/2026");
    expect(descricaoMensalidade(null, "2026-09-01")).toBe("Mensalidade · Setembro/2026");
  });
  it("vencimento da linha nova: fim da cobertura, senão o 1º vencimento, senão hoje", () => {
    expect(vencimentoAPagar({ pago_ate: "2026-10-19T15:00:00Z", desde: null }, "2026-09-29")).toBe("2026-10-19");
    expect(vencimentoAPagar({ pago_ate: null, desde: "2026-09-10T12:00:00Z" }, "2026-09-29")).toBe("2026-09-10");
    expect(vencimentoAPagar({ pago_ate: null, desde: null }, "2026-09-29")).toBe("2026-09-29");
  });
  it("'coberto' do servidor = 'coberta' da tela; os dias em São Paulo iguais", () => {
    const agora = new Date("2026-09-29T15:00:00Z");
    for (const pagoAte of ["2026-09-29T14:59:59Z", "2026-09-29T15:00:01Z", "2026-10-20T00:00:00Z", null]) {
      expect(coberto(pagoAte, agora)).toBe(estadoDaMensalidade({ valor: 249, pausada: false, pago_ate: pagoAte, desde: null }, agora).coberta);
    }
    for (const iso of ["2026-07-20T02:00:00Z", "2026-07-20T03:00:00Z", "2026-12-31T23:30:00Z"]) expect(diaSPServidor(iso)).toBe(diaSP(iso));
  });
  it("valor: o servidor aceita o que a tela manda", () => {
    for (const t of ["249", "249,90", "R$ 1.234,56", "0,01"]) expect(valorValido(lerValor(t))).toBe(lerValor(t));
    expect(valorValido(0)).toBeNull();
    expect(valorValido(-1)).toBeNull();
    expect(valorValido("abc")).toBeNull();
    expect(valorValido(100_000_000)).toBeNull();
  });
  it("métodos do 'pago por fora': os mesmos na tela e no servidor", () => {
    for (const m of Object.keys(ROTULO_METODO)) expect(ehMetodoPorFora(m)).toBe(true);
    expect(ehMetodoPorFora("boleto")).toBe(false);
  });
});

describe("comprovante no Storage", () => {
  it("tipos aceitos e caminho escolhido pelo servidor (pasta da matrícula)", () => {
    expect(extensaoComprovante("image/jpeg")).toBe("jpg");
    expect(extensaoComprovante("application/pdf")).toBe("pdf");
    expect(extensaoComprovante("image/gif")).toBeNull();
    const cam = caminhoComprovante(C, P, "png", new Date("2026-09-29T15:00:00Z"));
    expect(cam).toBe(`conta/${C}/${P}/2026-09-${new Date("2026-09-29T15:00:00Z").getTime()}.png`);
    expect(comprovanteDaMatricula(cam, C, P)).toBe(true);
  });
  it("não aceita comprovante de outra matrícula, fora da pasta ou com '..'", () => {
    expect(comprovanteDaMatricula(`conta/${C}/${U}/2026-09-1.png`, C, P)).toBe(false);
    expect(comprovanteDaMatricula(`conta/${C}/${P}/../${U}/x.png`, C, P)).toBe(false);
    expect(comprovanteDaMatricula(`conta/${C}/${P}/x.exe`, C, P)).toBe(false);
    expect(comprovanteDaMatricula(`${P}/x.png`, C, P)).toBe(false);
  });
  it("bucket por ambiente", () => {
    expect(bucketComprovantes("public")).toBe("comprovantes");
    expect(bucketComprovantes("staging")).toBe("comprovantes-staging");
  });
});

describe("quem vê e quem mexe (spec 4.1 — P6)", () => {
  const papel = (p: Partial<PapelNaMatricula>): PapelNaMatricula => ({ master: false, dono: false, responsavel: false, userId: U, ...p });
  const minha = { tipo: "avulsa", criado_por: U, nutricionista_id: null };
  const deOutro = { tipo: "avulsa", criado_por: C, nutricionista_id: C };
  const mensalidade = { tipo: "mensalidade", criado_por: null, nutricionista_id: null };
  it("dono e master: tudo", () => {
    for (const p of [papel({ dono: true }), papel({ master: true })]) {
      expect(podeVerCobranca(p, deOutro)).toBe(true);
      expect(podeMexerNaMensalidade(p)).toBe(true);
      expect(podeMexerNaCobranca(p, mensalidade)).toBe(true);
      expect(podeMexerNaCobranca(p, deOutro)).toBe(true);
    }
  });
  it("responsável: só as cobranças dele; a mensalidade é do dono", () => {
    const r = papel({ responsavel: true });
    expect(podeVerCobranca(r, minha)).toBe(true);
    expect(podeVerCobranca(r, { ...deOutro, nutricionista_id: U })).toBe(true);
    expect(podeVerCobranca(r, deOutro)).toBe(false);
    expect(podeMexerNaCobranca(r, minha)).toBe(true);
    expect(podeMexerNaCobranca(r, deOutro)).toBe(false);
    expect(podeMexerNaMensalidade(r)).toBe(false);
    expect(podeMexerNaCobranca(r, mensalidade)).toBe(false);
  });
  it("quem não é da matrícula: nada", () => {
    const n = papel({});
    expect(podeVerCobranca(n, minha)).toBe(false);
    expect(podeMexerNaMensalidade(n)).toBe(false);
  });
});

import { retratoDoPlano as retratoServidor } from "../../supabase-principal/functions/_shared/planos-regras";
import type { Matricula } from "../../supabase-principal/functions/_shared/financeiro-mp";

describe("W-P: a matrícula carrega o plano com período", () => {
  it("o retrato sai da matrícula como o servidor a carrega", () => {
    const m = { plano_modalidade: "mensal", plano: { id: "p", nome: "Anual", meses: 12 } } as Pick<Matricula, "plano_modalidade" | "plano">;
    expect(retratoServidor(m)).toEqual({ meses_cobertos: 1, parcelas_total: 12 });
  });
});

it("P-A '1': a assinatura do aluno não manda data de fim (renova)", () => {
  // Caminho pelo fileURLToPath, como nos outros testes de fonte: o Vite reescreve o new URL("…", import.meta.url) e o arquivo não abre.
  const fonte = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../supabase-principal/functions/pagamentos-aluno/index.ts"), "utf8");
  expect(fonte).not.toMatch(/end_date/);
});

it("hml-19 (H-55): o detalhe do pagamento no MP só mostra e-mail, nome no cartão e banco de quem pagou ao próprio aluno", () => {
  const fonte = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../supabase-principal/functions/pagamentos-aluno/index.ts"), "utf8");
  const trecho = fonte.slice(fonte.indexOf('acao === "detalhe_mp"'), fonte.indexOf("PROFISSIONAL ═"));
  expect(trecho).toMatch(/const souOAluno = m!\.user_id === user\.id;/);
  expect(trecho).toMatch(/payer_email: souOAluno && /);
  expect(trecho).toMatch(/payer_nome: souOAluno \?/);
  expect(trecho).toMatch(/banco_pagador: souOAluno \?/);
  expect(trecho).toMatch(/e2e_id: souOAluno \?/);
  expect(trecho).toMatch(/card_last4: pay\.card\?\.last_four_digits/);
});

describe("W1 — a baixa da InfinitePay só depois do payment_check (guarda de fonte)", () => {
  const FUNCOES = resolve(dirname(fileURLToPath(import.meta.url)), "../../supabase-principal/functions");
  const ler = (rel: string) => readFileSync(resolve(FUNCOES, rel), "utf8");
  it("jeito 2: o Recebimento grava COMO A PESSOA (dbPessoa) — recebimento_chaves e contas nunca com o service_role", () => {
    const f = ler("pagamentos-aluno/index.ts");
    expect(f).toContain("createClient(SUPABASE_URL, ANON,");
    expect(f).not.toMatch(/\bdb\.from\("recebimento_chaves"\)\s*\.\s*(insert|update|upsert|delete)/);
    expect(f).not.toMatch(/\bdb\.from\("contas"\)\s*\.\s*(insert|update|upsert|delete)/);
    expect(f).toMatch(/dbPessoa\.from\("recebimento_chaves"\)\s*\.\s*insert/);
    expect(f).toMatch(/dbPessoa\.rpc\("recebimento_infinitepay_salvar"/);
    expect(f).toMatch(/dbPessoa\.rpc\("recebimento_chave_ligar"/);
  });
  it("conferirAviso chama o payment_check (a tag e o pedido do LINK) antes de aplicar; 'paga' só no 'baixar'; nenhuma cobrança nasce aqui (C1)", () => {
    const b = ler("_shared/infinitepay-baixa.ts");
    const conferir = b.slice(b.indexOf("export async function conferirAviso"), b.indexOf("export async function conferirAvisosPendentes"));
    expect(conferir).toContain("conferirPagamento(link.handle, link.pedido");
    expect(conferir.indexOf("conferirPagamento(")).toBeLessThan(conferir.indexOf("aplicar("));
    expect(b.match(/status: "paga"/g)?.length).toBe(1);
    expect(b).not.toMatch(/from\("cobrancas"\)\s*\.\s*(insert|upsert)/);
    const aplicar = b.slice(b.indexOf("async function aplicar("), b.indexOf("async function avisarPago("));
    expect(aplicar).toContain("conf: ConferenciaIp");
    expect(aplicar).not.toMatch(/ip_transaction_nsu: a\.transaction_nsu/); // o NSU gravado sai do nsuDaBaixa
  });
  it("I4: o link nasce com o pedidoDoLink (<cobranca_id>-<n>) — o webhook e a volta recusam o id puro da cobrança", () => {
    const b = ler("_shared/infinitepay-baixa.ts");
    const novo = b.slice(b.indexOf("export async function novoLink"), b.indexOf("export async function registrarAviso"));
    expect(novo).toContain("const pedido = pedidoDoLink(cobrancaId, n);");
    expect(novo).toContain(".insert({ pedido, cobranca_id: cobrancaId, n, handle, centavos })");
  });
  it("só pelo pedido SÓ na tentativa ainda NÃO paga: numa cobrança já paga o NSU do pedido daria 'ja_feito' de qualquer link (revisão da 1b)", () => {
    const b = ler("_shared/infinitepay-baixa.ts");
    const pp = b.slice(b.indexOf("export async function conferirPeloPedido"), b.indexOf("export async function fecharVencidas"));
    const pega = pp.indexOf('.eq("status", "aguardando_confirmacao")');
    expect(pega).toBeGreaterThan(-1);
    expect(pega).toBeLessThan(pp.indexOf("conferirPagamento("));
    expect(pp).not.toMatch(/\.(in|neq)\("status"/);
  });
  it("o 'desistiu' avisa o personal ANTES de fechar (fechado antes, o próprio aviso contava no teto de 1 por 24 h e o sino calava)", () => {
    const b = ler("_shared/infinitepay-baixa.ts");
    const sem = b.slice(b.indexOf("async function semBaixa("), b.indexOf("async function fechar("));
    expect(sem.indexOf("avisarUmaVez(")).toBeGreaterThan(-1);
    expect(sem.indexOf("avisarUmaVez(")).toBeLessThan(sem.indexOf('fechar(db, a, "desistiu"'));
    const aplicar = b.slice(b.indexOf("async function aplicar("), b.indexOf("async function avisarPago("));
    expect(aplicar.lastIndexOf("avisarUmaVez(")).toBeLessThan(aplicar.lastIndexOf("await fechar(db, a, resultadoDaDecisao(d));"));
  });
  it("o webhook só registra o aviso: não grava cobrança nem diz 'paga'; responde 200/429/413/400 (nunca 5xx)", () => {
    const w = ler("infinitepay-webhook-aluno/index.ts");
    expect(w).not.toMatch(/from\("cobrancas"\)\s*\.\s*(update|insert|upsert|delete)/);
    expect(w).not.toMatch(/"paga"/);
    expect(w).toContain("emSegundoPlano(");
    expect(w).not.toMatch(/responder\(5\d\d/);
  });
  it("I6: o IP pelo ipDoPedido (nunca o cabeçalho de encaminhamento cru), o corpo com teto e o pedido do LINK (I4)", () => {
    const w = ler("infinitepay-webhook-aluno/index.ts");
    expect(w).toContain("ipDoPedido(req.headers, null)");
    expect(w).not.toMatch(/x-forwarded-for/i);
    expect(w).toContain("IP_LIMITE_CORPO");
    expect(w).toContain("linkDoPedido(db, aviso.pedido)");
  });
  it("o aluno_ip_link cria um pedido por link (I4) e desfaz a tentativa quando a InfinitePay não cria o link; a conferência usa a caixa", () => {
    const f = ler("pagamentos-aluno/index.ts");
    const link = f.slice(f.indexOf('acao === "aluno_ip_link"'), f.indexOf('acao === "aluno_ip_volta"'));
    expect(link).toContain("novoLink(db, linha.id, handle");
    expect(link).toContain("desfazerTentativa(linha, pedido)");
    const ip = f.slice(f.indexOf("W1 — O ALUNO PAGA PELA INFINITEPAY"), f.indexOf("════ PROFISSIONAL ════"));
    expect(ip).not.toMatch(/status: "paga"/);
    expect(ip).toContain('conferirAviso(db, reg.id, ctxIp(), "tela")');
  });
  it("I3: o aluno_status e o prof_aluno conferem em 2º plano, como a tela (sem gastar tentativa); I2: só na conta InfinitePay", () => {
    const f = ler("pagamentos-aluno/index.ts");
    const cuidar = f.slice(f.indexOf("const cuidarDaInfinitePay"), f.indexOf("const ehTentativaIp"));
    expect(cuidar).toContain('emSegundoPlano(conferirAvisosPendentes(db, { pacienteId: m.id }, ctx, 2, "tela")');
    const status = f.slice(f.indexOf('acao === "aluno_status"'), f.indexOf("matriculas.push("));
    expect(status).toMatch(/recebimento_modo === "infinitepay" \|\| cobs0\.some\(ehTentativaIp\)\) await cuidarDaInfinitePay/);
  });
  it("I5: o prof_registrar da mensalidade usa a tentativa da InfinitePay aguardando (a mesma linha), em vez de criar outra", () => {
    const f = ler("pagamentos-aluno/index.ts");
    const reg = f.slice(f.indexOf('acao === "prof_registrar"'), f.indexOf('acao === "prof_remover"'));
    expect(reg).toMatch(/\.eq\("forma", "infinitepay"\)[\s\S]*\.update\(linhaManual\)/);
  });
  it("P-B: o prof_plano_salvar valida com modalidadesPermitidasNoPlano (o plano antigo não trava o personal)", () => {
    const f = ler("pagamentos-aluno/index.ts");
    const salvar = f.slice(f.indexOf('acao === "prof_plano_salvar"'), f.indexOf('acao === "prof_plano_ativo"'));
    expect(salvar).toContain("modalidadesPermitidasNoPlano(conta.modo");
  });
  it("nada da InfinitePay vai ao log: InfiniteTag, url, recibo, NSU, slug", () => {
    for (const rel of ["infinitepay-webhook-aluno/index.ts", "_shared/infinitepay-baixa.ts", "_shared/infinitepay.ts", "pagamentos-aluno/index.ts"]) {
      const f = ler(rel);
      for (const m of f.matchAll(/\blog\.(?:info|aviso|erro|excecao)\s*\(([\s\S]*?)\);/g)) {
        expect(m[1], `${rel}: ${m[1].slice(0, 80)}`).not.toMatch(/\b(handle|ip_handle|url|recibo|recibo_url|transaction_nsu|nsu|slug)\b/);
      }
    }
  });
});

describe("W1b (C1) — o pagamento do Mercado Pago é DESTA cobrança (pagamentoEDaCobranca)", () => {
  const T = "33333333-4444-4555-8666-777777777777"; // o aluno no Treino (as cobranças "migrado_calc")
  const OUTRO = "dddddddd-eeee-4fff-8aaa-bbbbbbbbbbbb";
  const c = { id: C, paciente_id: P, mp_payment_id: "123456" };
  const ctx = { schema: "staging" as const, treinoUserId: T, preapproval: null as string | null, preapprovals: [] as string[] };
  const pay = (external_reference: string | null, id: unknown = 123456) => ({ id, external_reference });
  it("passa: a referência desta cobrança, a recorrente da MESMA matrícula, o Calc antigo do mesmo aluno e a automática da matrícula", () => {
    expect(pagamentoEDaCobranca(pay(referenciaAluno("staging", P, "avulsa", C)), c, ctx)).toBe(true);
    expect(pagamentoEDaCobranca(pay(referenciaAluno("staging", P, "mensalidade", C)), c, ctx)).toBe(true);
    expect(pagamentoEDaCobranca(pay(referenciaAluno("staging", P, "avulsa", C), "123456"), c, ctx)).toBe(true); // o id em texto
    expect(pagamentoEDaCobranca(pay(referenciaAluno("staging", P, "recorrente")), c, ctx)).toBe(true);
    expect(pagamentoEDaCobranca(pay(`staging:${T}:2026-09-01:aluno:mensal`), c, ctx)).toBe(true);
    expect(pagamentoEDaCobranca(pay(`staging:${T}::aluno:mensal`), c, ctx)).toBe(true);
    expect(pagamentoEDaCobranca(pay(null), c, { ...ctx, preapproval: "pre-1", preapprovals: ["pre-0", "pre-1"] })).toBe(true);
    // o Calc de outro aluno do Treino, mas a automática É desta matrícula (aluno_assinaturas, só o servidor grava)
    expect(pagamentoEDaCobranca(pay(`staging:${OUTRO}::aluno:mensal`), c, { ...ctx, preapproval: "pre-1", preapprovals: ["pre-1"] })).toBe(true);
  });
  it("não passa: o pagamento do PLANO da conta (o ataque do C1), outra cobrança, outro aluno, outro schema e a referência sem a cobrança", () => {
    expect(pagamentoEDaCobranca(pay(referenciaConta("staging", C, "mensal")), c, ctx)).toBe(false);
    expect(pagamentoEDaCobranca(pay(referenciaConta("staging", C, "anual", P)), c, ctx)).toBe(false);
    // a automática do plano: nem com o preapproval dela na lista da matrícula (a referência diz que não é de aluno)
    expect(pagamentoEDaCobranca(pay(referenciaConta("staging", C, "recorrente")), c, { ...ctx, preapproval: "pre-1", preapprovals: ["pre-1"] })).toBe(false);
    expect(pagamentoEDaCobranca(pay(`physiqnutri:staging:${U}`), c, { ...ctx, preapproval: "pre-1", preapprovals: ["pre-1"] })).toBe(false);
    expect(pagamentoEDaCobranca(pay(referenciaAluno("staging", P, "avulsa", OUTRO)), c, ctx)).toBe(false);
    expect(pagamentoEDaCobranca(pay(referenciaAluno("staging", OUTRO, "avulsa", C)), c, ctx)).toBe(false);
    expect(pagamentoEDaCobranca(pay(referenciaAluno("staging", OUTRO, "recorrente")), c, ctx)).toBe(false);
    expect(pagamentoEDaCobranca(pay(referenciaAluno("public", P, "avulsa", C)), c, ctx)).toBe(false);
    expect(pagamentoEDaCobranca(pay(referenciaAluno("staging", P, "mensalidade")), c, ctx)).toBe(false);
  });
  it("não passa: o Calc do professor, o Calc de outro aluno ou de outro schema, sem referência nem automática da matrícula, outro id", () => {
    expect(pagamentoEDaCobranca(pay(`staging:${T}:2026-09-01:plano_professor:mensal`), c, ctx)).toBe(false);
    expect(pagamentoEDaCobranca(pay(`staging:${T}:2026-09-01:plano_professor:mensal`), c, { ...ctx, preapproval: "pre-1", preapprovals: ["pre-1"] })).toBe(false);
    expect(pagamentoEDaCobranca(pay(`staging:${OUTRO}::aluno:mensal`), c, ctx)).toBe(false);
    expect(pagamentoEDaCobranca(pay(`public:${T}::aluno:mensal`), c, ctx)).toBe(false);
    expect(pagamentoEDaCobranca(pay(`staging:${T}::aluno:mensal`), c, { ...ctx, treinoUserId: null })).toBe(false);
    expect(pagamentoEDaCobranca(pay(null), c, ctx)).toBe(false);
    expect(pagamentoEDaCobranca(pay("qualquer coisa"), c, ctx)).toBe(false);
    expect(pagamentoEDaCobranca(pay(null), c, { ...ctx, preapproval: "pre-9", preapprovals: ["pre-1"] })).toBe(false);
    expect(pagamentoEDaCobranca(pay(referenciaAluno("staging", P, "avulsa", C), 999), c, ctx)).toBe(false);
    expect(pagamentoEDaCobranca(pay(referenciaAluno("staging", P, "avulsa", C), null), c, ctx)).toBe(false);
    expect(pagamentoEDaCobranca(pay(referenciaAluno("staging", P, "avulsa", C)), { ...c, mp_payment_id: null }, ctx)).toBe(false);
    expect(pagamentoEDaCobranca(null, c, ctx)).toBe(false);
  });
});

describe("W1b (C1) — estornar, cancelar, detalhar e aplicar SÓ o pagamento desta cobrança (guarda de fonte)", () => {
  const f = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../supabase-principal/functions/pagamentos-aluno/index.ts"), "utf8");
  const bloco = (acao: string) => {
    const i = f.indexOf(`acao === "${acao}"`);
    return f.slice(i, f.indexOf("\n    if (acao === ", i + 1));
  };
  it("toda ida ao MP com o id de um pagamento passa pela conferência: o pagamentoDaLinha e o cancelarNoMp, ou o prof_reembolsar já conferido", () => {
    const de = f.indexOf("const pagamentoDaLinha = async");
    const ate = f.indexOf("const conferir = async");
    const reembolso = f.indexOf('acao === "prof_reembolsar"');
    const conferido = f.indexOf("exigirDaCobranca(", reembolso);
    const fim = f.indexOf('acao === "prof_comprovante"');
    expect(de).toBeGreaterThan(-1);
    expect(de).toBeLessThan(ate);
    const idas = [...f.matchAll(/`\/v1\/payments\/\$\{/g)].map((m) => m.index!);
    expect(idas.length).toBeGreaterThanOrEqual(4);
    for (const i of idas) {
      const noAjudante = i > de && i < ate;
      const noReembolsoConferido = conferido > reembolso && i > conferido && i < fim;
      expect(noAjudante || noReembolsoConferido, f.slice(i - 120, i + 60)).toBe(true);
    }
  });
  it("o ajudante lê o pagamento com a credencial do schema e decide pelo pagamentoEDaCobranca; o diferente é 409 cobranca_de_outro_pagamento e vai ao log", () => {
    const ajud = f.slice(f.indexOf("const pagamentoDaLinha = async"), f.indexOf("const conferir = async"));
    expect(ajud).toContain("pagamentoEDaCobranca(");
    expect(ajud).toContain("treinoUserId: m.treino_user_id");
    expect(ajud).toMatch(/falhar\("cobranca_de_outro_pagamento", 409\)/);
    expect(ajud).toMatch(/log\.erro\(\{ codigo: "cobranca_de_outro_pagamento"/);
    // o cancelarNoMp só dá o PUT no pagamento conferido desta cobrança
    const cancelar = ajud.slice(ajud.indexOf("const cancelarNoMp = async"));
    expect(cancelar.indexOf("daCobranca")).toBeGreaterThan(-1);
    expect(cancelar.indexOf("daCobranca")).toBeLessThan(cancelar.indexOf('"cancelled"'));
  });
  it("prof_reembolsar: confere ANTES do /refunds; o MP sem resposta não estorna (502)", () => {
    const b = bloco("prof_reembolsar");
    expect(b.indexOf("pagamentoDaLinha(c, m)")).toBeGreaterThan(-1);
    expect(b.indexOf("pagamentoDaLinha(c, m)")).toBeLessThan(b.indexOf("exigirDaCobranca("));
    expect(b.indexOf("exigirDaCobranca(")).toBeLessThan(b.indexOf("/refunds"));
    const semResposta = b.slice(b.indexOf("if (!conferido.pay) {"), b.indexOf("\n      }", b.indexOf("if (!conferido.pay) {")));
    expect(semResposta).toContain('falhar("mp_error", 502');
  });
  it("prof_cobranca_cancelar: o PUT só pelo cancelarNoMp; o pagamento de outra coisa é 409 e a linha não muda", () => {
    const b = bloco("prof_cobranca_cancelar");
    expect(b).toContain("const { m, p } = await matriculaDoPainel(c.paciente_id);");
    expect(b).toContain("cancelarNoMp(c, m)");
    expect(b.indexOf('falhar("cobranca_de_outro_pagamento", 409)')).toBeGreaterThan(-1);
    expect(b.indexOf('falhar("cobranca_de_outro_pagamento", 409)')).toBeLessThan(b.indexOf('update({ status: "cancelada" })'));
    expect(b).not.toContain("mpFetch(");
  });
  it("detalhe_mp: o pagamento passa pelo pagamentoDaLinha e o de outra coisa é 409 antes de devolver qualquer dado", () => {
    const b = bloco("detalhe_mp");
    expect(b).toContain("pagamentoDaLinha<");
    expect(b.indexOf("exigirDaCobranca(")).toBeGreaterThan(-1);
    expect(b.indexOf("exigirDaCobranca(")).toBeLessThan(b.indexOf("mp: {"));
    expect(b).not.toContain("mpFetch(");
  });
  it("conferir (aluno_status, prof_aluno, aluno_mp_conferir) não aplica nem lança: o pagamento de outra coisa só vai ao log (o aluno_status não cai)", () => {
    const conf = f.slice(f.indexOf("const conferir = async"), f.indexOf("const conferirAssinatura = async"));
    expect(conf).toContain("pagamentoDaLinha(c, m)");
    expect(conf.indexOf("daCobranca")).toBeLessThan(conf.indexOf("aplicarPagamentoMp("));
    expect(conf).not.toContain("exigirDaCobranca(");
    expect(conf).not.toContain("mpFetch(");
  });
  it("aluno_mp_pix e simular_aprovacao: o Pix antigo só é cancelado no MP pelo cancelarNoMp", () => {
    const pix = f.slice(f.indexOf('acao === "aluno_mp_pix" || acao === "aluno_mp_cartao"'), f.indexOf('acao === "aluno_mp_assinar"'));
    expect(pix).toContain("cancelarNoMp(atual, m)");
    expect(pix).not.toMatch(/JSON\.stringify\(\{ status: "cancelled" \}\)/);   // o PUT no MP; o mp_status "cancelled" da LINHA continua
    const sim = bloco("simular_aprovacao");
    expect(sim).toContain("cancelarNoMp(c, m!)");
    expect(sim).not.toContain("mpFetch(");
  });
});
