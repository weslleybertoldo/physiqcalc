import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { MpIndisponivel, type CredencialConta, type RespostaMp } from "../../supabase-principal/functions/_shared/cobranca-mp";
import { lerReferencia as lerReferenciaConta, referenciaConta } from "../../supabase-principal/functions/_shared/cobranca-regras";
import { MpContaSemAcesso } from "../../supabase-principal/functions/_shared/mp-conta";
import { notificacaoDaConta } from "../../supabase-principal/functions/_shared/mp-conta-regras";
import {
  desligarAntiga, notificacaoDe, recebedorConfere, semDerrubar, type ChamarMp,
} from "../../supabase-principal/functions/pagamentos-aluno/mp-credencial";
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
  it("I1 da revisão: o Calc COPIADO pelo script 05 para a matrícula sem treino_user_id (a conta do app) passa pela origem 'migrado_calc'", () => {
    const semTreino = { ...ctx, treinoUserId: null };
    const copiada = { ...c, origem: "migrado_calc" };
    // passa: o Pix e o cartão do Calc "sem professor" (as 4 linhas MP do public na matrícula da conta do app)
    expect(pagamentoEDaCobranca(pay(`staging:${T}:2026-07-01`), copiada, semTreino)).toBe(true);
    expect(pagamentoEDaCobranca(pay(`staging:${T}::aluno:mensal`), copiada, semTreino)).toBe(true);
    // não passa: a mesma referência numa linha que o script não copiou (o caso de antes continua: sem treino_user_id e sem a origem)
    expect(pagamentoEDaCobranca(pay(`staging:${T}:2026-07-01`), { ...c, origem: "app" }, semTreino)).toBe(false);
    expect(pagamentoEDaCobranca(pay(`staging:${T}:2026-07-01`), { ...c, origem: null }, semTreino)).toBe(false);
    expect(pagamentoEDaCobranca(pay(`staging:${T}:2026-07-01`), { ...c, origem: "webhook_calc" }, semTreino)).toBe(false);
    // não passa, nem copiada: o professor do Calc, outro schema, o plano da conta, outra cobrança, sem referência, lixo, outro id
    expect(pagamentoEDaCobranca(pay(`staging:${T}::plano_professor:mensal`), copiada, semTreino)).toBe(false);
    expect(pagamentoEDaCobranca(pay(`public:${T}:2026-07-01`), copiada, semTreino)).toBe(false);
    expect(pagamentoEDaCobranca(pay(referenciaConta("staging", C, "mensal")), copiada, semTreino)).toBe(false);
    expect(pagamentoEDaCobranca(pay(referenciaConta("staging", C, "recorrente")), copiada, { ...semTreino, preapproval: "pre-1", preapprovals: ["pre-1"] })).toBe(false);
    expect(pagamentoEDaCobranca(pay(referenciaAluno("staging", P, "avulsa", OUTRO)), copiada, semTreino)).toBe(false);
    expect(pagamentoEDaCobranca(pay(null), copiada, semTreino)).toBe(false);
    expect(pagamentoEDaCobranca(pay("qualquer coisa"), copiada, semTreino)).toBe(false);
    expect(pagamentoEDaCobranca(pay(`staging:${T}:2026-07-01`, 999), copiada, semTreino)).toBe(false);
    // com treino_user_id na matrícula, a origem não abre nada: o Calc tem de ser do MESMO aluno do Treino
    expect(pagamentoEDaCobranca(pay(`staging:${OUTRO}::aluno:mensal`), copiada, ctx)).toBe(false);
  });
  it("I1 da revisão: a automática que o SERVIDOR gravou na própria linha passa (a de aluno_assinaturas pode ter sido trocada pelo aluno_mp_assinar)", () => {
    expect(pagamentoEDaCobranca(pay(null), { ...c, mp_preapproval_id: "pre-7" }, { ...ctx, preapproval: "pre-7" })).toBe(true);
    expect(pagamentoEDaCobranca(pay(`staging:${OUTRO}::aluno:mensal`), { ...c, mp_preapproval_id: "pre-7" }, { ...ctx, preapproval: "pre-7" })).toBe(true);
    // não passa: outra automática na linha, o pagamento sem automática, a linha sem automática, a referência do plano ou do Nutri
    expect(pagamentoEDaCobranca(pay(null), { ...c, mp_preapproval_id: "pre-8" }, { ...ctx, preapproval: "pre-7" })).toBe(false);
    expect(pagamentoEDaCobranca(pay(null), { ...c, mp_preapproval_id: "pre-7" }, ctx)).toBe(false);
    expect(pagamentoEDaCobranca(pay(null), { ...c, mp_preapproval_id: null }, { ...ctx, preapproval: "pre-7" })).toBe(false);
    expect(pagamentoEDaCobranca(pay(referenciaConta("staging", C, "recorrente")), { ...c, mp_preapproval_id: "pre-7" }, { ...ctx, preapproval: "pre-7" })).toBe(false);
    expect(pagamentoEDaCobranca(pay(`physiqnutri:staging:${U}`), { ...c, mp_preapproval_id: "pre-7" }, { ...ctx, preapproval: "pre-7" })).toBe(false);
    // a referência nova decide sozinha: outra cobrança não passa nem com a automática gravada na linha
    expect(pagamentoEDaCobranca(pay(referenciaAluno("staging", P, "avulsa", OUTRO)), { ...c, mp_preapproval_id: "pre-7" }, { ...ctx, preapproval: "pre-7" })).toBe(false);
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
  it("o ajudante lê o pagamento com a credencial escolhida (W2: a do schema ou a da conta) e decide pelo pagamentoEDaCobranca; o diferente é 409 cobranca_de_outro_pagamento e vai ao log", () => {
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
    // W2 (Task 9): o mesmo ajudante, agora com a credencial DESTA cobrança (credencialDaCobranca — o collector)
    expect(b.indexOf("pagamentoDaLinha(c, m, cred")).toBeGreaterThan(-1);
    expect(b.indexOf("pagamentoDaLinha(c, m, cred")).toBeLessThan(b.indexOf("exigirDaCobranca("));
    expect(b.indexOf("exigirDaCobranca(")).toBeLessThan(b.indexOf("/refunds"));
    const semResposta = b.slice(b.indexOf("if (!conferido.pay) {"), b.indexOf("\n      }", b.indexOf("if (!conferido.pay) {")));
    expect(semResposta).toContain('falhar("mp_error", 502');
  });
  it("prof_cobranca_cancelar: o PUT só pelo cancelarNoMp; o pagamento de outra coisa é 409 e a linha não muda", () => {
    const b = bloco("prof_cobranca_cancelar");
    expect(b).toContain("const { m, p } = await matriculaDoPainel(c.paciente_id);");
    expect(b).toContain("cancelarNoMp(c, m, cred)");
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
    expect(conf).toContain("pagamentoDaLinha(c, m, cred)");
    expect(conf.indexOf("daCobranca")).toBeLessThan(conf.indexOf("aplicarPagamentoMp("));
    expect(conf).not.toContain("exigirDaCobranca(");
    expect(conf).not.toContain("mpFetch(");
  });
  it("aluno_mp_pix e simular_aprovacao: o Pix antigo só é cancelado no MP pelo cancelarNoMp", () => {
    const pix = f.slice(f.indexOf('acao === "aluno_mp_pix" || acao === "aluno_mp_cartao"'), f.indexOf('acao === "aluno_mp_assinar"'));
    // W2 (Task 9): pelo fecharNoMp — a credencial DELE (escrita) e o cancelarNoMp, por melhor esforço
    expect(pix).toContain("fecharNoMp(atual, m)");
    const fechar = f.slice(f.indexOf("const fecharNoMp = async"), f.indexOf("const conferir = async"));
    expect(fechar).toContain("cancelarNoMp(c, m, cred)");
    expect(pix).not.toMatch(/JSON\.stringify\(\{ status: "cancelled" \}\)/);   // o PUT no MP; o mp_status "cancelled" da LINHA continua
    const sim = bloco("simular_aprovacao");
    expect(sim).toContain("cancelarNoMp(c, m!, cred)");
    expect(sim).not.toContain("mpFetch(");
  });
});

describe("W2 (Task 7) — o Recebimento com o Mercado Pago da conta: conectar, confirmar, desconectar, salvar e simular (guarda de fonte)", () => {
  const f = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../supabase-principal/functions/pagamentos-aluno/index.ts"), "utf8");
  /** O corpo de uma ação: de `if (acao === "<x>"` (no nível das ações, 4 espaços) até a próxima do mesmo nível. */
  const bloco = (acao: string) => {
    const i = f.indexOf(`\n    if (acao === "${acao}"`);
    expect(i, acao).toBeGreaterThan(-1);
    const j = f.indexOf("\n    if (acao === ", i + 1);
    return f.slice(i, j > -1 ? j : undefined);
  };
  /** Um ajudante do pedido: de `const <nome> = ` (2 espaços) até o próximo comando do mesmo nível. */
  const ajudante = (nome: string) => {
    const i = f.indexOf(`\n  const ${nome} = `);
    expect(i, nome).toBeGreaterThan(-1);
    const fim = f.slice(i + 1).search(/\n {2}(?:const |let |type |\/\*\*|\/\/ )/);
    return f.slice(i, fim > -1 ? i + 1 + fim : undefined);
  };
  /** Os trechos existem e aparecem nesta ordem. */
  const ordem = (texto: string, ...trechos: string[]) => {
    const pos = trechos.map((t) => texto.indexOf(t));
    pos.forEach((p, k) => expect(p, trechos[k]).toBeGreaterThan(-1));
    for (let k = 1; k < pos.length; k++) expect(pos[k - 1], `${trechos[k - 1]} → antes de → ${trechos[k]}`).toBeLessThan(pos[k]);
  };

  it("o contexto do MP da conta: a chave e o client do ambiente; sem a chave, o getter lança MpContaSemAcesso (nunca um 503 no meio de um cancelamento) e avisa 1× por pedido", () => {
    expect(f).toContain("const chaveMp = await chaveDoAmbiente();");
    const ctx = ajudante("ctxMp");
    expect(ctx).toContain('throw new MpContaSemAcesso("-", "nao_configurado")');
    expect(ctx).toContain("oauth: oauthDoAmbiente(schema)");
    expect(ctx).toMatch(/log\.erro\(\{ codigo: "mp_tokens_chave_ausente"/);
    expect(ctx).not.toContain("falhar(");
    const flag = ajudante("mpContaLiberada");
    expect(flag).toContain("if (ehMaster) return true;");
    expect(flag).toContain('.eq("chave", "mercadopago_conta")');
    expect(flag).toContain("if (error) throw error;");
  });

  it("as automáticas vivas pelo mp-conta.ts (o automaticasVivasDaConta local saiu) e o cancelamento SÓ pelo cancelarAssinaturasPorCredencial; o aviso só a quem ficou sem a automática", () => {
    expect(f).not.toContain("automaticasVivasDaConta");
    expect(f).not.toContain("cancelarAssinaturasDasMatriculas(");
    const desligar = ajudante("desligarAutomaticas");
    expect(desligar).toContain("cancelarAssinaturasPorCredencial(db, { schema, log, prazo: prazoDoPedido }, ctxMp, credencial, ids, motivo)");
    // com recusa, o 2º olhar no banco tira do aviso quem segue com a automática viva
    ordem(desligar, "cancelarAssinaturasPorCredencial(", "pacientesComAutomaticaViva(db, contaId)", "ids.filter((id) => !vivas.has(id))", "await avisar(");
    expect(desligar).toContain("Seu profissional mudou a forma de receber: a cobrança automática no cartão foi desligada.");
    const naConta = ajudante("automaticasNaContaDoMp");
    expect(naConta).toContain('.eq("mp_collector_id", collector) // W2: depois do schemaTemW2');
    expect(naConta).toContain('.in("status", ["authorized", "pending", "paused"])');
  });

  it("prof_mp_conectar (MENOR 19 e I8): só o dono DE VERDADE, nunca a conta do app, só com a W2 e a flag; no APK, o SITE e nada criado; o state só em hash, o verifier cifrado; o redirect de teste só no staging; sem o id da conexão na resposta", () => {
    const b = bloco("prof_mp_conectar");
    ordem(b, "contaDoRecebimento(body.conta_id)", "donoDeVerdade(conta.id)", 'falhar("so_o_dono", 403)', 'falhar("conta_do_app", 403)',
      'falhar("w2_indisponivel", 409)', 'falhar("mp_conta_em_teste", 403)', 'body.origem === "apk"', 'falhar("mp_oauth_nao_configurado", 503)',
      'falhar("rate_limited", 429)', '.from("mp_conexoes").insert(', "urlDeAutorizacao(");
    expect(b).not.toContain("papelNaConta(");   // o papelNaConta dá dono: true ao master — aqui o master só na conta em que é dono
    const dono = ajudante("donoDeVerdade");
    expect(dono).toContain('.from("conta_membros").select("papeis")');
    expect(dono).toContain('.includes("dono")');
    expect(dono).not.toContain("ehMaster");
    const apk = b.slice(b.indexOf('body.origem === "apk"'), b.indexOf("\n", b.indexOf('body.origem === "apk"')));
    expect(apk).toContain("${SITE[schema]}/painel/configuracoes/recebimento?mp=conectar");
    expect(apk).toContain("no_site: true");
    const insert = b.slice(b.indexOf('.from("mp_conexoes").insert('), b.indexOf("});", b.indexOf('.from("mp_conexoes").insert(')));
    expect(insert).toContain("estado_hash: await sha256Hex(estado)");
    expect(insert.match(/\bestado\b/g)).toHaveLength(1);   // o state em si nunca vai ao banco
    expect(insert).toContain('verificador: await cifrar(verificador, dadoAssociado(schema, conta.id, "pkce"), chaveMp)');
    expect(insert).toContain("user_id: user.id");
    expect(b).not.toMatch(/\.insert\([\s\S]*?\)\s*\.select\(/);   // o id da conexão nem é lido (I8)
    expect(b).toContain('body.redirect_teste === true && schema === "staging" ? REDIRECT_TESTE_MP : redirectDoSchema(schema)');
    expect(b).toContain("desafio: pkceLigado() ? await desafioPkce(verificador) : null");
    expect(b).toContain("permitido(`mp-conectar:${user.id}`, 10, 3_600_000)");
    expect(b).toContain("return json({ ok: true, url, expira_em: new Date(Date.now() + ESTADO_MS).toISOString() }, 200, origin);");
  });

  it("prof_mp_confirmar (I8): a pergunta só para quem começou e só o apelido; a gravação COMO A PESSOA (dbPessoa.rpc), nunca o service_role; a recusa pelo erroDaConfirmacao", () => {
    const b = bloco("prof_mp_confirmar");
    ordem(b, "ehUuidMp(body.conexao_id)", 'falhar("w2_indisponivel", 409)', "body.confirmar !== true", 'dbPessoa.rpc("recebimento_mp_confirmar"',
      "erroDaConfirmacao(r)", "recebimentoVista(");
    const pergunta = b.slice(b.indexOf("body.confirmar !== true"), b.indexOf('dbPessoa.rpc("recebimento_mp_confirmar"'));
    expect(pergunta).toContain('.select("user_id, resultado, usado_em, mp_apelido, live")');
    ordem(pergunta, 'falhar("mp_invalido", 409)', 'falhar("mp_outra_pessoa", 403)', 'falhar("mp_vencido", 409)');
    expect(pergunta).toContain("c.user_id !== user.id");
    expect(pergunta).toContain("15 * 60_000");
    expect(pergunta).toContain("return json({ ok: true, apelido: c.mp_apelido, teste: c.live === false }, 200, origin);");
    expect(b).not.toMatch(/from\("recebimento_integracoes"\)/);
    expect(f).not.toMatch(/\bdb\.rpc\("recebimento_mp_confirmar"/);
    expect(ajudante("contaDaConexao")).toContain("if (error) throw error;");
  });

  it("prof_mp_desconectar: sem o OK, 409 antes de cancelar; cancela ANTES de trocar o modo e a recusa não muda nada; o modo COMO A PESSOA (o gatilho marca desconectada); fora do modo do MP da conta só marca (MENOR 10) e só olha as automáticas DESTA conta do MP", () => {
    const b = bloco("prof_mp_desconectar");
    ordem(b, "contaDoRecebimento(body.conta_id)", 'falhar("w2_indisponivel", 409)', 'falhar("mp_nao_conectado", 409)', 'falhar("automaticas_ativas", 409',
      'desligarAutomaticas(conta.id, ids, "personal_desconectou_o_mp")', "recusaDoCancelamento(r)", 'dbPessoa.from("contas").update(',
      'db.from("conta_eventos").insert(', "recebimentoVista(");
    expect(b).toContain("noModo ? await pacientesComAutomaticaViva(db, conta.id) : await automaticasNaContaDoMp(conta.id, integ.mp_user_id)");
    expect(b).toContain("modoDepoisDeDesconectar(!!(await chaveAtiva(conta.id)))");
    expect(b).toContain("erroDaGuardaDoModo(error)");
    const menor10 = b.slice(b.indexOf("} else {", b.indexOf('dbPessoa.from("contas").update(')));
    expect(menor10).toMatch(/db\.from\("recebimento_integracoes"\)\.update\(\{ status: "desconectada", desconectada_em: /);
    expect(menor10).toContain('.neq("status", "desconectada")');
    expect(b).toContain('w2: "mp_desconectado"');
  });

  it("prof_recebimento_salvar: o MP da conta só com a W2, a flag e a conexão ativa; sair de QUALQUER MP com automática viva pede o OK e desliga cada uma pela credencial dela (a recusa: 409/502 e nada muda); a guarda do modo vira 409, nunca 500", () => {
    const b = bloco("prof_recebimento_salvar");
    ordem(b.slice(b.indexOf('if (pedido.modo === "mercadopago_conta") {')), 'falhar("w2_indisponivel", 409)', 'falhar("mp_conta_em_teste", 403)',
      'falhar("mp_nao_conectado", 409)');
    expect(b).toContain("if (ehModoMp(conta.modo)) {");
    expect(b).not.toContain('if (conta.modo === "mercadopago") {');
    ordem(b, "pacientesComAutomaticaViva(db, conta.id)", 'falhar("automaticas_ativas", 409', 'desligarAutomaticas(conta.id, ids, "trocou_a_forma")',
      "recusaDoCancelamento(r)", 'dbPessoa.from("contas").update({ recebimento_modo: pedido.modo })', "erroDaGuardaDoModo(error)");
    expect(b).toContain("automaticas_falhas: 0");   // o campo da W1 fica para o APK antigo (a falha agora é 502 — MENOR 11)
  });

  it("prof_mp_simular_conexao (decisão 12): SÓ staging e SÓ master antes de qualquer leitura; o token do ambiente, nada do navegador além da chave pública TEST-; nunca a conta do app", () => {
    const b = bloco("prof_mp_simular_conexao");
    ordem(b, 'schema !== "staging"', "!ehMaster", 'falhar("w2_indisponivel", 409)', "contaDoRecebimento(body.conta_id)", 'falhar("conta_do_app", 403)',
      'tokenMp("test")', 'falhar("mp_conta_nao_configurado", 503)', '"/users/me"', '.from("recebimento_integracoes").upsert(');
    expect(b).toContain('mp_access_token: await cifrar(token, dadoAssociado(schema, conta.id, "access"), chaveMp)');
    expect(b).toContain('mp_origem: "teste_sem_oauth"');
    expect(b).toContain("/^TEST-[A-Za-z0-9-]{8,72}$/.test(body.chave_publica)");
    expect(b).not.toMatch(/body\.(token|access_token|refresh_token|mp_access_token|mp_refresh_token|collector|mp_user_id)\b/);
  });

  it("a vista do Recebimento: o MP da conta pela integracaoMp (sem token), indisponível sem a W2 e na conta do app; nenhum token sai numa resposta", () => {
    const v = ajudante("recebimentoVista");
    expect(v).toContain("const w2 = await schemaTemW2(db, schema);");
    expect(v).toContain("w2 ? await integracaoMp(db, c.id) : null");
    expect(v).toMatch(/disponivel: w2 && c\.origem !== "app" && \(await mpContaLiberada\(\)\)/);
    expect(v).toContain("chave_publica: !!mp?.mp_public_key");
    expect(v).not.toMatch(/mp_access_token|mp_refresh_token|tem_acesso/);
    for (const m of f.matchAll(/\bjson\(([\s\S]*?)\);/g)) {
      expect(m[1], m[1].slice(0, 80)).not.toMatch(/mp_access_token|mp_refresh_token|token_access|token_refresh|verificador|\bestado\b/);
    }
  });

  it("o log das ações novas não leva url, state, verifier, token, code, a chave pública nem o apelido do MP", () => {
    for (const nome of ["prof_mp_conectar", "prof_mp_confirmar", "prof_mp_desconectar", "prof_mp_simular_conexao"]) {
      const b = bloco(nome);
      const chamadas = [...b.matchAll(/\blog\.(?:info|aviso|erro|excecao)\s*\(([\s\S]*?)\);/g)];
      expect(chamadas.length, nome).toBeGreaterThan(0);
      for (const m of chamadas) {
        expect(m[1], `${nome}: ${m[1]}`).not.toMatch(/\b(url|estado|verificador|token|code|chavePublica|chave_publica|public_key|apelido|mp_apelido)\b/);
      }
    }
  });

  it("o cabeçalho da função documenta as 4 ações novas e os segredos da W2", () => {
    const cabecalho = f.slice(0, f.indexOf("\nimport "));
    for (const a of ["prof_mp_conectar", "prof_mp_confirmar", "prof_mp_desconectar", "prof_mp_simular_conexao"]) expect(cabecalho, a).toContain(a);
    for (const s of ["MP_TOKENS_CHAVE", "MP_CLIENT_ID", "MP_CLIENT_SECRET", "MP_AUTH_BASE"]) expect(cabecalho, s).toContain(s);
  });
});

describe("W2 (Task 9) — as peças da pagamentos-aluno para o token da conta em todas as chamadas (pagamentos-aluno/mp-credencial.ts)", () => {
  const CONTA_ID = "c0a1b2c3-d4e5-4f60-8a7b-9c0d1e2f3a4b";
  const daConta = (collectorId = 777_001): CredencialConta =>
    ({ tipo: "conta", schema: "staging", contaId: CONTA_ID, collectorId, token: "TOKEN-DE-TESTE-DA-CONTA" });

  /** O MP falso de UMA ação (o `chamar` já é o da credencial escolhida): as respostas em ordem (ou o erro que a ida lança) e os pedidos. */
  const mpFalso = (...respostas: Array<RespostaMp<unknown> | Error>) => {
    const pedidos: Array<{ caminho: string; metodo: string; corpo: unknown }> = [];
    const chamar: ChamarMp = async <T,>(caminho: string, init?: RequestInit) => {
      pedidos.push({ caminho, metodo: init?.method ?? "GET", corpo: init?.body ? JSON.parse(String(init.body)) : null });
      const r = respostas.shift();
      if (r === undefined) throw new Error(`pedido a mais: ${caminho}`);
      if (r instanceof Error) throw r;
      return r as RespostaMp<T>;
    };
    return { chamar, pedidos };
  };

  describe("semDerrubar (I3: a conferência de leitura e o melhor esforço não derrubam a resposta)", () => {
    it("o que deu certo passa direto e o aoFalhar nem é chamado", async () => {
      const aoFalhar = vi.fn();
      expect(await semDerrubar(async () => "do MP", "do banco", aoFalhar)).toBe("do MP");
      expect(aoFalhar).not.toHaveBeenCalled();
    });
    it("a conexão do personal caída (MpContaSemAcesso — inclusive sem a MP_TOKENS_CHAVE) → a linha do banco + o motivo", async () => {
      const aoFalhar = vi.fn();
      expect(await semDerrubar(async () => { throw new MpContaSemAcesso(CONTA_ID, "erro"); }, "do banco", aoFalhar)).toBe("do banco");
      expect(aoFalhar).toHaveBeenCalledWith("erro");
      const semChave = vi.fn();
      expect(await semDerrubar(async () => { throw new MpContaSemAcesso("-", "nao_configurado"); }, 0, semChave)).toBe(0);
      expect(semChave).toHaveBeenCalledWith("nao_configurado");
    });
    it("o MP fora (MpIndisponivel — o /users/me ou a renovação sem resposta) → a linha do banco + mp_fora", async () => {
      const aoFalhar = vi.fn();
      expect(await semDerrubar(async () => { throw new MpIndisponivel(599); }, null, aoFalhar)).toBeNull();
      expect(aoFalhar).toHaveBeenCalledWith("mp_fora");
    });
    it("erro do banco (ou qualquer outro) LANÇA — o 500 de sempre, nunca a linha velha calada", async () => {
      const aoFalhar = vi.fn();
      await expect(semDerrubar(async () => { throw { code: "57014", message: "canceling statement" }; }, "x", aoFalhar)).rejects.toMatchObject({ code: "57014" });
      await expect(semDerrubar(async () => { throw new Error("rede"); }, "x", aoFalhar)).rejects.toThrow("rede");
      expect(aoFalhar).not.toHaveBeenCalled();
    });
  });

  describe("recebedorConfere (C1 da W1b + I8: na conta do personal o pagamento tem de ter caído NELA)", () => {
    it("o MP do Physiq: o GET 200 com o token do schema já prova a conta", () => {
      expect(recebedorConfere("prod", { collector_id: 1 })).toBe(true);
      expect(recebedorConfere("test", null)).toBe(true);
    });
    it("a conta do personal: só o collector dela (número ou texto); outro, nulo ou ausente não passa", () => {
      expect(recebedorConfere(daConta(777_001), { collector_id: 777_001 })).toBe(true);
      expect(recebedorConfere(daConta(777_001), { collector_id: "777001" })).toBe(true);
      expect(recebedorConfere(daConta(777_001), { collector_id: 888_002 })).toBe(false);
      expect(recebedorConfere(daConta(777_001), { collector_id: null })).toBe(false);
      expect(recebedorConfere(daConta(777_001), {})).toBe(false);
      expect(recebedorConfere(daConta(777_001), null)).toBe(false);
    });
  });

  it("notificacaoDe: o MP do Physiq volta pela URL de sempre (o projeto, ?schema=); a conta, pelo domínio próprio com &conta=", () => {
    const base = "https://projeto.supabase.co";
    expect(notificacaoDe("test", "staging", base)).toBe(`${base}/functions/v1/mp-webhook-aluno?schema=staging`);
    expect(notificacaoDe("prod", "public", base)).toBe(`${base}/functions/v1/mp-webhook-aluno?schema=public`);
    expect(notificacaoDe(daConta(), "staging", base)).toBe(notificacaoDaConta("staging", CONTA_ID));
    expect(notificacaoDe(daConta(), "staging", base)).toContain(`schema=staging&conta=${CONTA_ID}`);
    expect(notificacaoDe(daConta(), "staging", base)).not.toContain(base);
  });

  describe("desligarAntiga (I11: a automática antiga viva é cancelada com a credencial DELA e CONFERIDA antes da nova)", () => {
    const antiga = { mp_preapproval_id: "preAntiga1", payload: null };
    const caminho = "/preapproval/preAntiga1";
    const GET = { caminho, metodo: "GET", corpo: null };
    const PUT = { caminho, metodo: "PUT", corpo: { status: "cancelled" } };

    it("viva no MP → PUT cancelled e o GET de conferência em cancelled → segue (o POST novo pode ir)", async () => {
      const { chamar, pedidos } = mpFalso({ status: 200, body: { id: "preAntiga1", status: "pending" } }, { status: 200, body: { id: "preAntiga1" } },
        { status: 200, body: { id: "preAntiga1", status: "cancelled" } });
      expect(await desligarAntiga(async () => chamar, antiga)).toEqual({ resultado: "seguir", motivo: "cancelada", status: 200 });
      expect(pedidos).toEqual([GET, PUT, GET]);
    });
    it("o MP aceitou (ou recusou) o PUT, mas a conferência não diz cancelled → assinatura_antiga_viva (nao_cancelou)", async () => {
      const segue = mpFalso({ status: 200, body: { status: "paused" } }, { status: 200, body: { id: "preAntiga1" } }, { status: 200, body: { status: "paused" } });
      expect(await desligarAntiga(async () => segue.chamar, antiga)).toEqual({ resultado: "assinatura_antiga_viva", motivo: "nao_cancelou", status: 200 });
      expect(segue.pedidos).toEqual([GET, PUT, GET]);
      const fora = mpFalso({ status: 200, body: { status: "pending" } }, { status: 500, body: null }, { status: 500, body: null });
      expect(await desligarAntiga(async () => fora.chamar, antiga)).toEqual({ resultado: "assinatura_antiga_viva", motivo: "nao_cancelou", status: 500 });
    });
    it("autorizada de verdade → assinatura_ja_ativa sem PUT; a do sandbox (nasceu pendente) é cancelada e segue", async () => {
      const ativa = mpFalso({ status: 200, body: { status: "authorized" } });
      expect(await desligarAntiga(async () => ativa.chamar, antiga)).toEqual({ resultado: "assinatura_ja_ativa", motivo: "ativa", status: 200 });
      expect(ativa.pedidos).toEqual([GET]);
      const sandbox = mpFalso({ status: 200, body: { status: "authorized" } }, { status: 200, body: {} }, { status: 200, body: { status: "cancelled" } });
      expect((await desligarAntiga(async () => sandbox.chamar, { ...antiga, payload: { sandbox: true } })).resultado).toBe("seguir");
      expect(sandbox.pedidos).toEqual([GET, PUT, GET]);
    });
    it("já cancelada ou não achada (404) nesta conta → segue sem PUT", async () => {
      const cancelada = mpFalso({ status: 200, body: { status: "cancelled" } });
      expect(await desligarAntiga(async () => cancelada.chamar, antiga)).toEqual({ resultado: "seguir", motivo: "ja_cancelada", status: 200 });
      expect(cancelada.pedidos).toEqual([GET]);
      const sumiu = mpFalso({ status: 404, body: null });
      expect(await desligarAntiga(async () => sumiu.chamar, antiga)).toEqual({ resultado: "seguir", motivo: "nao_achada", status: 404 });
      expect(sumiu.pedidos).toEqual([GET]);
    });
    it("sem resposta que decida (5xx, o 401 de recurso de outra conta — I2) → assinatura_antiga_viva sem PUT: não cria outra por cima", async () => {
      for (const status of [500, 401, 429, 599]) {
        const { chamar, pedidos } = mpFalso({ status, body: null });
        expect(await desligarAntiga(async () => chamar, antiga), String(status)).toEqual({ resultado: "assinatura_antiga_viva", motivo: "sem_resposta", status });
        expect(pedidos).toEqual([GET]);
      }
    });
    it("sem a credencial dela (outra conta do MP, desconectada) → assinatura_antiga_viva sem ir ao MP", async () => {
      expect(await desligarAntiga(async () => null, antiga)).toEqual({ resultado: "assinatura_antiga_viva", motivo: "sem_credencial", status: null });
    });
    it("a conexão caiu (na credencial ou no meio) ou o MP sumiu (MpIndisponivel) → assinatura_antiga_viva com o motivo", async () => {
      expect(await desligarAntiga(async () => { throw new MpContaSemAcesso(CONTA_ID, "erro"); }, antiga))
        .toEqual({ resultado: "assinatura_antiga_viva", motivo: "erro", status: null });
      const meio = mpFalso({ status: 200, body: { status: "pending" } }, new MpContaSemAcesso(CONTA_ID, "acesso_recusado"));
      expect(await desligarAntiga(async () => meio.chamar, antiga)).toEqual({ resultado: "assinatura_antiga_viva", motivo: "acesso_recusado", status: null });
      const fora = mpFalso(new MpIndisponivel(503));
      expect(await desligarAntiga(async () => fora.chamar, antiga)).toEqual({ resultado: "assinatura_antiga_viva", motivo: "mp_fora", status: 503 });
    });
    it("erro do banco (ou qualquer outro) lança: o 500 antes de qualquer POST", async () => {
      await expect(desligarAntiga(async () => { throw { code: "57014", message: "canceling statement" }; }, antiga)).rejects.toMatchObject({ code: "57014" });
      const rede = mpFalso(new Error("bug"));
      await expect(desligarAntiga(async () => rede.chamar, antiga)).rejects.toThrow("bug");
    });
    it("o id vai codificado no caminho (nada de ../ na API do MP)", async () => {
      const { chamar, pedidos } = mpFalso({ status: 404, body: null });
      await desligarAntiga(async () => chamar, { mp_preapproval_id: "a/../users/me", payload: null });
      expect(pedidos[0].caminho).toBe("/preapproval/a%2F..%2Fusers%2Fme");
    });
  });

  describe("collectorDaLinha (C2: a regra da coluna nova na linha que vai ao MP)", () => {
    const dbFalso = (temW2: boolean, erro?: { code: string; message: string }) => ({
      from: (tabela: string) => ({
        select: () => ({
          limit: async () => {
            if (tabela !== "mp_conexoes") throw new Error(`tabela inesperada: ${tabela}`);
            if (erro) return { data: null, error: erro };
            return temW2 ? { data: [], error: null } : { data: null, error: { code: "42P01", message: 'relation "x.mp_conexoes" does not exist' } };
          },
        }),
      }),
    }) as unknown as SupabaseClient;
    /** o schemaTemW2 guarda 60 s por schema: cada caso importa de novo */
    const carregar = async () => {
      vi.resetModules();
      return await import("../../supabase-principal/functions/pagamentos-aluno/mp-credencial");
    };
    it("com a W2: a conta leva o collector dela; o MP do Physiq, NULO (a avulsa reaproveitada não fica com o collector de outra conta)", async () => {
      const m = await carregar();
      expect(await m.collectorDaLinha(dbFalso(true), "staging", daConta(777_001))).toEqual({ mp_collector_id: 777_001 });
      expect(await m.collectorDaLinha(dbFalso(true), "staging", "test")).toEqual({ mp_collector_id: null });
    });
    it("sem a W2 no schema (o public antes da Task 22): nada — o select/insert com a coluna daria 42703/PGRST204 (depois do POST!)", async () => {
      expect(await (await carregar()).collectorDaLinha(dbFalso(false), "public", "prod")).toEqual({});
      expect(await (await carregar()).collectorDaLinha(dbFalso(false), "public", daConta())).toEqual({});
    });
    it("erro do banco que não é 'tabela ausente' lança", async () => {
      const m = await carregar();
      await expect(m.collectorDaLinha(dbFalso(true, { code: "57014", message: "canceling statement due to statement timeout" }), "staging", "test"))
        .rejects.toMatchObject({ code: "57014" });
    });
  });
});

describe("W2 (Task 9) — o token da conta em TODAS as chamadas do MP da pagamentos-aluno (guarda de fonte)", () => {
  const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../../supabase-principal/functions/pagamentos-aluno");
  const f = readFileSync(resolve(RAIZ, "index.ts"), "utf8");
  const pecas = readFileSync(resolve(RAIZ, "mp-credencial.ts"), "utf8");
  /** O corpo de uma ação: de `if (acao === "<x>"` (no nível das ações, 4 espaços) até a próxima do mesmo nível. */
  const bloco = (acao: string) => {
    const i = f.indexOf(`\n    if (acao === "${acao}"`);
    expect(i, acao).toBeGreaterThan(-1);
    const j = f.indexOf("\n    if (acao === ", i + 1);
    return f.slice(i, j > -1 ? j : undefined);
  };
  /** Um ajudante do pedido: de `const <nome> = ` (2 espaços) até o próximo comando do mesmo nível. */
  const ajudante = (nome: string) => {
    const i = f.indexOf(`\n  const ${nome} = `);
    expect(i, nome).toBeGreaterThan(-1);
    const fim = f.slice(i + 1).search(/\n {2}(?:const |let |type |\/\*\*|\/\/ )/);
    return f.slice(i, fim > -1 ? i + 1 + fim : undefined);
  };
  /** Os trechos existem e aparecem nesta ordem. */
  const ordem = (texto: string, ...trechos: string[]) => {
    let de = -1;
    for (const t of trechos) {
      const p = texto.indexOf(t, de + 1);
      expect(p, `${t} (depois do anterior)`).toBeGreaterThan(de);
      de = p;
    }
  };

  it("toda ida ao MP passa pelo `mp` com a credencial escolhida: o mpFetch só no `mp`, no aluno_app_plano (a conta do app = o MP do Physiq) e no /users/me do prof_mp_simular_conexao", () => {
    const mp = ajudante("mp");
    expect(mp).toContain('typeof cred === "string" ? mpFetch<T>(cred, caminho, init, { prazo: prazoDoPedido }) : mpContaFetch<T>(db, ctxMp(), cred, caminho, init)');
    const permitidos = [mp, bloco("aluno_app_plano"), bloco("prof_mp_simular_conexao")].map((t) => [f.indexOf(t), f.indexOf(t) + t.length]);
    const idas = [...f.matchAll(/\bmpFetch\s*[<(]/g)].map((m) => m.index!);
    expect(idas.length).toBeGreaterThanOrEqual(3);
    for (const i of idas) expect(permitidos.some(([a, b]) => i >= a && i < b), f.slice(i - 100, i + 80)).toBe(true);
    // e o `mp` nunca recebe a credencial do Physiq fixa: cada ida leva a escolhida (a de pagar, a da linha, a da assinatura)
    expect(f).not.toMatch(/\bmp(?:<[^>()]*>)?\(credencial\b/);
    expect([...f.matchAll(/\bmp(?:<[^>()]*>)?\((cred!?|dela),/g)].length).toBeGreaterThanOrEqual(12);
    // a conta do app segue no MP do Physiq (não muda): o PUT do valor e o cancelamento do app encerrado
    expect(bloco("aluno_app_plano")).toContain("mpFetch<AssinaturaMp>(credencial, `/preapproval/");
    expect(bloco("aluno_status")).toContain("cancelarAssinaturasDoAppEncerrado(db, credencial, ");
  });

  it("credencialParaPagar: o MP do Physiq (com o token no ambiente) ou o da conta (credencialDaConta: só a ativa); o exigirMp saiu", () => {
    ordem(ajudante("credencialParaPagar"), 'modo === "mercadopago"', "tokenMp(credencial)", 'falhar("mp_nao_configurado", 500)', "return credencial;",
      'modo === "mercadopago_conta"', "credencialDaConta(db, ctxMp(), m.conta_id)", 'falhar("modo_nao_mercadopago")');
    expect(f).not.toContain("exigirMp");
    for (const a of ["aluno_mp_pix", "aluno_mp_assinar"]) ordem(bloco(a), "await minhaMatricula(body.paciente_id)", "const cred = await credencialParaPagar(m);");
  });

  it("o catch final: a conexão do personal caída (MpContaSemAcesso) → 409 mp_conta_indisponivel; o MP sem decisão (MpIndisponivel) → 502 mp_error; nunca 500", () => {
    const fim = f.slice(f.lastIndexOf("} catch (e) {"));
    ordem(fim, "if (e instanceof ErroAcao)", "if (e instanceof MpContaSemAcesso)", 'erro("mp_conta_indisponivel", 409, origin)',
      "if (e instanceof MpIndisponivel)", 'erro("mp_error", 502, origin', "log.excecao(e", 'erro("erro_interno", 500, origin)');
  });

  it("I3: as conferências de LEITURA não derrubam a resposta — conferir e conferirAssinatura pela credencial DA LINHA (leitura) dentro do lerSemDerrubar", () => {
    const ler = ajudante("lerSemDerrubar");
    expect(ler).toContain("semDerrubar(ler, doBanco, (resultado) => log.aviso({ codigo, schema, acao, ref, resultado }))");
    const conf = f.slice(f.indexOf("const conferir = async"), f.indexOf("const conferirAssinatura = async"));
    ordem(conf, "lerSemDerrubar(c.id, async () => {", "credencialDaCobranca(db, ctxMp, c, credencial, { leitura: true })", "if (!cred) return c;",
      "pagamentoDaLinha(c, m, cred)", "aplicarPagamentoMp(", "}, c);");
    const ass = ajudante("conferirAssinatura");
    ordem(ass, "lerSemDerrubar(a.id, async () => {", "credencialDaAssinatura(db, ctxMp, a, credencial, { leitura: true })", "if (!cred) return a;",
      "mp<AssinaturaMp>(cred, `/preapproval/", "espelhoAssinaturaAluno(", "comCollector(db, schema, collectorDe(cred))",
      "registrarCobrancasDaAutomatica(db, schema, log, chamar, m, depois, colunasW2)");
    expect(ass).toMatch(/const chamar = <T,?>\(caminho: string\) => mp<T>\(cred, caminho\);/);   // genérico: o T4 pediu (o MESMO objeto cred)
    // I1: a rede da automática também não derruba (a busca das cobranças com o MP fora só vai ao log)
    ordem(ass, "lerSemDerrubar(a.id, () => registrarCobrancasDaAutomatica(");
    for (const a of ["aluno_status", "prof_aluno"]) expect(bloco(a), a).toContain("ehModoMp(m.conta?.recebimento_modo)");
    expect(bloco("aluno_status")).toContain("ehModoMp(m.conta?.recebimento_modo) ? await conferirAssinatura(m) : await assinaturaDe(m.id)");
    expect(bloco("prof_aluno")).toContain("veMensalidade && ehModoMp(m.conta?.recebimento_modo) ? await conferirAssinatura(m) : await assinaturaDe(m.id)");
    expect(f).not.toMatch(/recebimento_modo === "mercadopago"/);   // os 2 MPs (ehModoMp)
  });

  it("aluno_status: mp { disponivel, chave_publica } na matrícula do MP da conta (a integração SEM token: a chave é pública)", () => {
    const st = bloco("aluno_status");
    ordem(st, 'modo === "mercadopago_conta" && atual.conta_id ? await integracaoMp(db, atual.conta_id) : null', "matriculas.push(",
      'mp: modo === "mercadopago_conta"', 'disponivel: mpDaConta?.status === "ativa"', 'chave_publica: mpDaConta?.status === "ativa" ? mpDaConta.mp_public_key : null');
  });

  it("W1b + C1 na conta: o pagamentoDaLinha lê com a credencial escolhida (o `mp`) e soma o recebedor (recebedorConfere); o cancelarNoMp usa a MESMA", () => {
    const pdl = f.slice(f.indexOf("const pagamentoDaLinha = async"), f.indexOf("const outroPagamento = "));
    expect(pdl).toContain("(c: Cobranca, m: Matricula, cred: CredencialMp)");
    expect(pdl).toContain("await mp<T & { collector_id?: number | string | null }>(cred, `/v1/payments/");
    ordem(pdl, "recebedorConfere(cred, pay)", "&& pagamentoEDaCobranca(pay, c, {");
    const cancelar = f.slice(f.indexOf("const cancelarNoMp = async"), f.indexOf("const fecharNoMp = async"));
    expect(cancelar).toContain("(c: Cobranca, m: Matricula, cred: CredencialMp)");
    ordem(cancelar, "pagamentoDaLinha(c, m, cred)", "r.daCobranca", "await mp(cred, `/v1/payments/");
    expect(pecas).toContain("typeof cred === \"string\" || Number(pay?.collector_id) === cred.collectorId");
  });

  it("o melhor esforço (fecharNoMp): a credencial DA LINHA (escrita) → o cancelarNoMp; a conexão caída ou o MP fora só vão ao log", () => {
    // revisão I-3: e diz o que houve — fechado, sem_escrita (outra conta do MP ou a desconectada: o Physiq não fecha) ou falhou (só o log)
    ordem(ajudante("fecharNoMp"), "lerSemDerrubar(c.id, async (): Promise<Fechamento> => {", "credencialDaCobranca(db, ctxMp, c, credencial, { escrita: true })",
      'if (!cred) return "sem_escrita";', "await cancelarNoMp(c, m, cred);", 'return "fechado";', '"falhou", "mp_fechar_sem_mp"');
  });

  it("revisão I-3: antes de um pagamento novo (Pix OU cartão), TODO Pix aberto que não é reaproveitado é fechado no MP — inclusive o da própria avulsa; a condição da avulsa fica só no UPDATE da linha", () => {
    const b = bloco("aluno_mp_pix");
    const antes = b.slice(b.indexOf('const metodo = acao === "aluno_mp_pix" ? "pix" : "cartao";'), b.indexOf("const linha = await linhaParaMp("));
    expect(antes.length).toBeGreaterThan(100);
    expect(antes).not.toMatch(/if \(metodo === "pix"\) \{/);                // o laço roda nos 2: o cartão também fecha o Pix aberto
    ordem(antes, '.eq("metodo", "pix").eq("status", "aguardando_confirmacao").is("deleted_at", null);', "const atual = await conferir(aberto, m);",
      'if (metodo === "pix" && valida && mesmoAlvo && mesmaConta && ', "reutilizada: true",
      'const fechou = atual.mp_payment_id && !simulado(atual.mp_payment_id) ? await fecharNoMp(atual, m) : "fechado";',
      'if (fechou === "sem_escrita" && ', "if (!mesmoAlvo) continue;",
      'if (metodo === "pix" && atual.pix_copia_cola) return json({ ok: true, cobranca: vista(atual, true), reutilizada: true }, 200, origin);',
      'return falhar("mp_conta_indisponivel", 409);', "if (!alvo.avulsa || atual.id !== alvo.avulsa.id) {", 'update({ status: "aberta"');
    // o fechamento no MP NÃO depende de ser outra cobrança: nenhum fecharNoMp dentro do `if (!alvo.avulsa || atual.id !== alvo.avulsa.id)`
    const daLinha = antes.slice(antes.indexOf("if (!alvo.avulsa || atual.id !== alvo.avulsa.id) {"));
    expect(daLinha.slice(0, daLinha.indexOf("if (erroFechar) throw erroFechar;"))).not.toContain("fecharNoMp(");
    // o cartão que acha o Pix do MESMO alvo já pago não cobra de novo; o Pix pago de outra coisa não para o cartão
    ordem(antes, 'if (atual.status === "paga") {', 'if (metodo === "pix") return json({ ok: true, cobranca: vista(atual), aprovada: true }, 200, origin);',
      'if (mesmoAlvo) return json({ ok: true, cobranca: vista(atual), status: "paga", aprovada: true }, 200, origin);', "continue;");
  });

  it("aluno_mp_pix/cartão: a credencial de pagar em tudo; o Pix aberto só se reaproveita NA MESMA conta do MP; a linha nasce com o collector; o aviso volta pela conta", () => {
    const b = bloco("aluno_mp_pix");
    ordem(b, "const cred = await credencialParaPagar(m);", ".select(await colunasCobranca()).eq(\"paciente_id\", m.id).eq(\"forma\", \"mp\")",
      "const mesmaConta = Number(atual.mp_collector_id ?? 0) === Number(collectorDe(cred) ?? 0);", "&& mesmaConta &&", "fecharNoMp(atual, m)",
      "linhaParaMp(m, alvo, metodo, expira, cred)", "const notificacao = notificacaoDe(cred, schema, SUPABASE_URL);", "const pagador = pagadorDe(cred);");
    // a conexão cai (ou o MP some) no meio do POST: a linha é desfeita antes de o erro subir (nunca "aguardando" sem pagamento por trás)
    expect(b.match(/\} catch \(e\) \{\s*await desfazerLinha\(linha\);[^\n]*\n\s*throw e;/g)?.length).toBe(2);
    expect(b).toContain('await mp<PagamentoMp>(cred, "/v1/payments", {');
    // decisão 16: a conta do personal sem chave Pix → o aluno usa o cartão e o dono é avisado (1 por dia); a linha é desfeita
    ordem(b, 'if (typeof cred !== "string" && erroPixSemChave(pay)) {', "await desfazerLinha(linha);", "avisarDonoDaConexao(db, ctxMp(), cred.contaId, ",
      'erro("mp_conta_sem_chave_pix", 400, origin)', 'log.erro({ codigo: "mp_pix_falhou"');
    // MENOR 20: o pagamento do cartão tem de ser do mundo do schema ANTES de qualquer gravação
    const cartao = b.slice(b.indexOf("const cardToken"));
    ordem(cartao, "if (!modoConfere(credencialDoSchema(schemaDaCredencialMp(cred)), pay)) {", 'log.erro({ codigo: "mp_cartao_modo_errado"',
      "await desfazerLinha(linha);", 'erro("mp_error", 502, origin)', 'update({ mp_payment_id: String(pay.id) })', "aplicarPagamentoMp(");
  });

  it("aluno_mp_assinar (I11 + C2 + MENOR 28): a antiga viva é desligada com a credencial DELA e conferida ANTES do POST; a linha pelo collectorDaLinha; a rede do sandbox pela credencial", () => {
    const b = bloco("aluno_mp_assinar");
    ordem(b, "const cred = await credencialParaPagar(m);", "const atual = await assinaturaDe(m.id);", "desligarAntiga(async () => {",
      "credencialDaAssinatura(db, ctxMp, atual, credencial, { escrita: true })", "mp<T>(dela, caminho, init)", 'antiga.resultado === "assinatura_ja_ativa"',
      'falhar("assinatura_ja_ativa")', 'antiga.resultado === "assinatura_antiga_viva"', 'falhar("assinatura_antiga_viva", 409)', '"/preapproval", { method: "POST"');
    expect(b).toContain('const pendente = () => mp<AssinaturaMp>(cred, "/preapproval", { method: "POST"');
    expect(b).toContain(': await mp<AssinaturaMp>(cred, "/preapproval", { method: "POST", body: JSON.stringify({ ...base, card_token_id: cardToken');
    expect(b).toContain("payer_email: pagadorDe(cred)");
    expect(b).toContain("notification_url: notificacaoDe(cred, schema, SUPABASE_URL)");
    expect(b).toContain('schemaDaCredencialMp(cred) === "staging" && recusaDoSandbox(st, pre)');
    expect(b).toContain("...(await collectorDaLinha(db, schema, cred))");
    expect(b).not.toMatch(/mpFetch|credencial === "test"/);
  });

  it("revisão M-9: aluno_mp_assinar devolve a VISTA da automática (assinaturaVista) — nunca a linha crua (o mp_collector_id e o payload)", () => {
    const b = bloco("aluno_mp_assinar");
    ordem(b, "if (es) throw es;", "return json({ ok: true, assinatura: assinaturaVista(salva), primeira_cobranca: inicio, sandbox, init_point:");
    expect(b).not.toMatch(/assinatura: salva\b/);
    // a vista tem o que a tela e os E2E leem da resposta (o status e o valor; a tela, só primeira_cobranca/sandbox/init_point de fora) e nada
    // do MP além do init_point
    const vista = ajudante("assinaturaVista");
    for (const campo of ["id: a.id", "status: a.status", "valor: a.valor === null ? null : Number(a.valor)", "proximo_vencimento: a.proximo_vencimento",
      "init_point:"]) expect(vista, campo).toContain(campo);
    expect(vista).not.toMatch(/mp_collector_id|mp_preapproval_id|payload:/);
  });

  it("cancelar e trocar o valor da automática: a credencial DESTA assinatura (escrita); outra conta do MP → 409 mp_outra_conta antes do PUT", () => {
    for (const nome of ["aluno_mp_cancelar"]) {
      ordem(bloco(nome), "credencialDaAssinatura(db, ctxMp, a!, credencial, { escrita: true })", 'falhar("mp_outra_conta", 409)', "await mp<AssinaturaMp>(cred!, `/preapproval/");
    }
    expect(bloco("aluno_mp_cancelar")).toContain('acao === "aluno_mp_cancelar" || acao === "prof_cancelar_assinatura"');
    ordem(ajudante("cancelarAutomatica"), "credencialDaAssinatura(db, ctxMp, a, credencial, { escrita: true })", 'falhar("mp_outra_conta", 409)',
      "await mp<AssinaturaMp>(cred!, `/preapproval/");
    // o PUT do valor só quando a automática vai ao MP (o corte do novoValorDaAutomatica); sem acesso a ela = o "falhou" de sempre (a fila)
    ordem(ajudante("sincronizarAutomatica"), 'a?.status === "authorized" && !!a.mp_preapproval_id && !simulado(a.mp_preapproval_id) && a.payload?.simulada !== true',
      "credencialDaAssinatura(db, ctxMp, a!, credencial, { escrita: true })", "if (e instanceof MpContaSemAcesso) return null;",
      "trocarValorDaAutomatica(db, cred, a, ", 'resultado: "falhou", status: null, externo: {}');
  });

  it("detalhe_mp (leitura — I3): a credencial DESTA cobrança; a de outra conta do MP → mp null + motivo; a conexão caída → mp null; a W1b fica", () => {
    ordem(bloco("detalhe_mp"), "lerSemDerrubar<CredencialMp | null | undefined>(c.id, () => credencialDaCobranca(db, ctxMp, c, credencial, { leitura: true }), undefined)",
      'if (cred === null) return json({ ok: true, mp: null, motivo: "outra_conta_mp" }, 200, origin);',
      "lerSemDerrubar(c.id, () => pagamentoDaLinha<PagamentoMpDetalhe & PagamentoMp>(c, m!, cred), semResposta)", "exigirDaCobranca(conferido, c);", "mp: {");
  });

  it("prof_cobranca_cancelar, prof_reembolsar e simular_aprovacao: a credencial DESTA cobrança; o reembolso sem ela → 409 mp_reembolso_pelo_app_do_mp ANTES do MP", () => {
    ordem(bloco("prof_cobranca_cancelar"), "credencialDaCobranca(db, ctxMp, c, credencial, { escrita: true })", "cred && (await cancelarNoMp(c, m, cred)) === \"outro\"",
      'falhar("cobranca_de_outro_pagamento", 409)', 'update({ status: "cancelada" })');
    const re = bloco("prof_reembolsar");
    ordem(re, "const cred = await credencialDaCobranca(db, ctxMp, c, credencial, { escrita: true });", 'if (!cred) falhar("mp_reembolso_pelo_app_do_mp", 409);',
      "pagamentoDaLinha(c, m, cred!)", "exigirDaCobranca(conferido, c);", "await mp<{ id?: number | string }>(cred!, `/v1/payments/", "/refunds",
      "await mp<PagamentoMp>(cred!, `/v1/payments/");
    ordem(bloco("simular_aprovacao"), "credencialDaCobranca(db, ctxMp, c, credencial)", "cred && (await cancelarNoMp(c, m!, cred)) === \"outro\"",
      'falhar("cobranca_de_outro_pagamento", 409)');
  });

  it("C2 — a regra da coluna nova: assinatura por colunasAssinatura, cobrança por COLUNAS_COBRANCA_W2 (com a W2), a linha do MP pelo collectorDaLinha; toda linha com mp_collector_id leva a marca", () => {
    expect(ajudante("assinaturaDe")).toContain(".select(await colunasAssinatura(db, schema))");
    expect(ajudante("colunasCobranca")).toContain("(await schemaTemW2(db, schema)) ? COLUNAS_COBRANCA_W2 : (await schemaTemW1(db, schema)) ? COLUNAS_COBRANCA_IP : COLUNAS_COBRANCA");
    const lpm = ajudante("linhaParaMp");
    expect(lpm).toContain("cred: CredencialMp");
    expect(lpm).toContain("const colunas = await colunasCobranca();");
    expect(lpm).toContain("const conta = await collectorDaLinha(db, schema, cred);");
    expect(lpm.match(/\.\.\.conta/g)?.length).toBe(2);   // a avulsa reaproveitada (update) e a mensalidade nova (insert)
    expect(lpm).not.toContain("COLUNAS_COBRANCA");
    expect(pecas).toContain("return await comCollector(db, schema, collectorDe(cred));");
    for (const [nome, fonte] of [["index.ts", f], ["mp-credencial.ts", pecas]] as const) {
      fonte.split("\n").forEach((linha, n) => {
        const t = linha.trim();
        if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;   // comentário
        if (/mp_collector_id/.test(linha.replace(/\/\/.*$/, ""))) expect(linha, `${nome}:${n + 1}`).toContain("// W2: depois do schemaTemW2");
      });
    }
  });

  it("I5 da W1 no MP (decisão 15): a mensalidade do MP aguardando (Pix que não venceu, cartão em análise) vira a MESMA linha paga e é fechada no MP por melhor esforço", () => {
    const reg = bloco("prof_registrar");
    ordem(reg, '.eq("forma", "infinitepay")', "const mpAguardando = ip ? null : await mensalidadeMpAguardando(m.id);", "const mesma = ip ?? mpAguardando;",
      ".update(linhaManual).eq(\"id\", mesma.id).eq(\"status\", \"aguardando_confirmacao\")", "if (error) throw error;",
      "if (mpAguardando?.mp_payment_id && !simulado(mpAguardando.mp_payment_id)) await fecharNoMp(mpAguardando, m);");
    // a avulsa aguardando no MP que o personal registra por fora (a mesma linha, como antes) também tem o pagamento fechado no MP
    ordem(reg, 'if (alvo.tipo !== "avulsa" || !["aberta", "aguardando_confirmacao"].includes(alvo.status)) falhar("cobranca_nao_aberta");',
      "if (error) throw error;", 'if (alvo.forma === "mp" && alvo.mp_payment_id && !simulado(alvo.mp_payment_id)) await fecharNoMp(alvo, m);');
    const mma = ajudante("mensalidadeMpAguardando");
    ordem(mma, ".select(await colunasCobranca())", '.eq("tipo", "mensalidade")', '.eq("forma", "mp")', '.eq("status", "aguardando_confirmacao")',
      '.is("deleted_at", null)', "if (error) throw error;", "!c.pix_expira_em || Date.parse(c.pix_expira_em) > Date.now()");
  });

  it("nada de credencial fixa: o pagador pela credencial (MENOR 28); nenhum `credencial === \"test\"|\"prod\"` sobrou", () => {
    expect(f).not.toMatch(/credencial === "(test|prod)"/);
    expect(ajudante("pagadorDe")).toContain('schemaDaCredencialMp(cred) === "staging" ? (Deno.env.get("MP_TEST_PAYER_EMAIL") || email) : email');
    expect(f).not.toMatch(/\bconst (notificacao|pagador) = (`|credencial)/);   // as fixas do topo saíram
  });

  it("o log da pagamentos-aluno (e das peças) não leva token, code, state, verifier, chave pública, collector, e-mail nem corpo", () => {
    for (const fonte of [f, pecas]) {
      for (const m of fonte.matchAll(/\blog\.(?:info|aviso|erro|excecao)\s*\(([\s\S]*?)\);/g)) {
        expect(m[1], m[1].slice(0, 100)).not.toMatch(/\b(token|code|state|estado|verificador|public_key|chave_publica|chavePublica|collector|collectorId|mp_collector_id|email|pagador)\b/);
      }
    }
    expect(pecas.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")).not.toMatch(/\blog\./);   // as peças não logam: quem chama loga
  });

  it("o cabeçalho documenta a Task 9 (o token da conta em todas as chamadas) e o mp do aluno_status", () => {
    const cabecalho = f.slice(0, f.indexOf("\nimport "));
    expect(cabecalho).toContain("W2 Task 9");
    expect(cabecalho).toContain("mp { disponivel, chave_publica }");
    expect(cabecalho).toContain("mp_conta_indisponivel");
  });
});
