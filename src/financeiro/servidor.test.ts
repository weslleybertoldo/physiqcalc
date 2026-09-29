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
