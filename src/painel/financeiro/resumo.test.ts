import { describe, expect, it } from "vitest";
import type { AlunoResumo, PendenteResumo } from "@/financeiro/tipos";
import {
  aReceber,
  cobrancasDoMes,
  entradasPorCategoria,
  fimDoMes,
  fracaoPaga,
  kpis,
  mesesAte,
  nomeDoMesLongo,
  precisamDeAtencao,
  recebimentos,
  rotuloMesCurto,
  serieReceita,
  somarDias,
  somarMeses,
  variacao,
  comparacaoDoMes,
  type CobrancaDoResumo,
  type EntradaDoDia,
} from "./resumo";

// a quinta-feira da tela 6: 16/07/2026, meio-dia em São Paulo
const HOJE = "2026-07-16";
const AGORA = new Date("2026-07-16T15:00:00Z");

// hml-14b (D14): as entradas chegam do banco já somadas por dia e categoria (financeiro_resumo_periodo — a saída e a estornada ficam
// fora lá; a prova da regra é a da migration, ~/projetos/physiqcalc-scratch/hml/hml14b/A/pglite/sql_test.mjs)
const ent = (dia: string, valor: number | string, categoria: string | null = null): EntradaDoDia => ({ dia, valor, categoria });
let n = 0;
const cob = (p: Partial<CobrancaDoResumo>): CobrancaDoResumo => ({
  id: `c${++n}`, paciente_id: "p1", tipo: "avulsa", descricao: "Consulta", valor: 100, vencimento: HOJE, status: "aberta", pago_em: null, transacao_id: null,
  reembolsado_em: null, paciente: { nome: "Rafael Moura" }, ...p,
});
const aluno = (p: Partial<AlunoResumo>): AlunoResumo => ({
  paciente_id: "a1", treino_user_id: null, nome: "Marina Alves", email: null, ativo: true, mensalidade_valor: 249, plano: null, pausada: false, pago_ate: null,
  desde: null, aguardando: null, abertas: 0, ...p,
});

describe("datas do resumo", () => {
  it("mês, dias e rótulos", () => {
    expect(fimDoMes("2026-02-10")).toBe("2026-02-28");
    expect(fimDoMes("2028-02-10")).toBe("2028-02-29");
    expect(somarMeses("2026-01-31", -1)).toBe("2025-12-01");
    expect(somarDias("2026-07-16", -29)).toBe("2026-06-17");
    expect(mesesAte(HOJE, 6)).toEqual(["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"]);
    expect(rotuloMesCurto("2026-07")).toBe("Jul");
    expect(nomeDoMesLongo(HOJE)).toBe("julho");
    expect(variacao(115, 100)).toBe(15);
    expect(variacao(10, 0)).toBeNull();
  });
});

describe("recebido: lançamentos + cobranças pagas, sem contar em dobro (somados no banco por dia)", () => {
  it("as entradas do mesmo dia (de categorias diferentes) viram 1 recebimento; as cobranças pagas sem lançamento entram pelo dia delas", () => {
    const recs = recebimentos({
      entradasPorDia: [ent("2026-07-02", 180, "Consulta"), ent("2026-07-02", "20.50", null), ent("2026-07-03", 90, "Retorno")],
      cobrancasPorDia: [{ dia: "2026-06-30", valor: "249.00" }],
    });
    expect(recs).toEqual([
      { dia: "2026-07-02", valor: 200.5, origem: "lancamento" },
      { dia: "2026-07-03", valor: 90, origem: "lancamento" },
      { dia: "2026-06-30", valor: 249, origem: "cobranca" },
    ]);
    expect(recebimentos({ entradasPorDia: [], cobrancasPorDia: [] })).toEqual([]);
  });
});

describe("a receber: cobranças abertas e a régua das mensalidades (W6)", () => {
  it("avulsa no prazo, vencida, aguardando; mensalidade vencida, a vencer no mês, fora do mês, parada e com comprovante aguardando", () => {
    const lista = aReceber(
      [
        cob({ id: "no-prazo", vencimento: "2026-07-20", valor: 120 }),
        cob({ id: "vencida", vencimento: "2026-07-10", valor: 80 }),
        cob({ id: "pix", status: "aguardando_confirmacao", tipo: "mensalidade", paciente_id: "a5", valor: 249 }),
        cob({ id: "paga", status: "paga", pago_em: "2026-07-02T12:00:00Z" }),
      ],
      [
        aluno({ paciente_id: "a1", nome: "Vencida", pago_ate: "2026-07-10T12:00:00Z" }),
        aluno({ paciente_id: "a2", nome: "Vence dia 25", pago_ate: "2026-07-25T12:00:00Z" }),
        aluno({ paciente_id: "a3", nome: "Agosto", pago_ate: "2026-08-20T12:00:00Z" }),
        aluno({ paciente_id: "a4", nome: "Parada", pago_ate: "2026-07-01T12:00:00Z", pausada: true }),
        aluno({ paciente_id: "a5", nome: "Mandou o Pix", pago_ate: "2026-07-01T12:00:00Z", aguardando: "pix" }),
        aluno({ paciente_id: "a6", nome: "Primeira dia 20", desde: "2026-07-20T12:00:00Z" }),
        aluno({ paciente_id: "a7", nome: "Sem mensalidade", mensalidade_valor: null }),
      ],
      HOJE,
      AGORA,
    );
    const resumo = lista.map((x) => `${x.chave}:${x.situacao}:${x.vence}:${x.valor}`);
    expect(resumo).toEqual([
      "c:no-prazo:aberta:2026-07-20:120",
      "c:vencida:vencida:2026-07-10:80",
      "c:pix:aguardando:2026-07-16:249",
      "m:a1:vencida:2026-07-10:249",
      "m:a2:aberta:2026-07-25:249",
      "m:a6:aberta:2026-07-20:249",
    ]);
  });
});

describe("os 4 cartões da tela 6", () => {
  const entradas = [ent("2026-07-02", 180), ent("2026-07-10", 320), ent("2026-06-15", 300), ent("2026-06-20", 100)];
  const cobs = [
    cob({ id: "pago", status: "paga", valor: 249, vencimento: "2026-07-05", pago_em: "2026-07-05T15:00:00Z" }),
    cob({ id: "aberta", vencimento: "2026-07-28", valor: 150 }),
    cob({ id: "depois", vencimento: "2026-08-03", valor: 90 }),
    cob({ id: "atrasada", vencimento: "2026-07-01", valor: 60 }),
  ];
  const alunos = [aluno({ paciente_id: "a2", pago_ate: "2026-07-25T12:00:00Z" }), aluno({ paciente_id: "a1", pago_ate: "2026-06-30T12:00:00Z" })];
  // o Pix confirmado (a cobrança "pago", sem lançamento) chega somado no dia dele
  const recs = recebimentos({ entradasPorDia: entradas, cobrancasPorDia: [{ dia: "2026-07-05", valor: 249 }] });
  const lista = aReceber(cobs, alunos, HOJE, AGORA);
  const k = kpis(recs, lista, HOJE);

  it("recebido do mês (lançamentos + Pix confirmado) e a variação sobre o MESMO período do mês passado (W25: 1º–16/06, não junho inteiro)", () => {
    expect(k.recebidoMes).toBe(749);
    // 1º–16/06: só o lançamento de 15/06 (o de 20/06 é depois do dia 16)
    expect(k.recebidoMesAnterior).toBe(300);
    expect(k.variacaoMes).toBe(150);
    expect(k.comparacao).toMatchObject({ de: "2026-06-01", ate: "2026-06-16", rotulo: "1–16 jun", rotuloLongo: "1º a 16 de junho" });
  });
  it("previsto até o fim do mês = recebido + o que vence até o fim do mês (a de agosto fica de fora)", () => {
    expect(k.aReceberMes).toBe(399);
    expect(k.previstoMes).toBe(1148);
  });
  it("em aberto (no prazo, qualquer data) e vencido (avulsa + mensalidade)", () => {
    expect(k.emAberto).toEqual({ qtd: 3, valor: 489, aguardando: 0 });
    expect(k.vencido).toEqual({ qtd: 2, valor: 309 });
  });
  it("séries dos mini gráficos", () => {
    expect(k.series.recebido6m).toEqual([0, 0, 0, 0, 400, 749]);
    expect(k.series.previstoMes).toHaveLength(31);
    expect(k.series.previstoMes[30]).toBe(1148);
    expect(k.series.previstoMes[0]).toBe(0);
    expect(k.series.vencido6m).toEqual([0, 0, 0, 0, 249, 60]);
    expect(k.series.aReceber30d[k.series.aReceber30d.length - 1]).toBe(489);
  });
});

describe("gráfico Receita (30D · 6M · Ano)", () => {
  const recs = recebimentos({
    entradasPorDia: [ent("2026-01-10", 100), ent("2026-05-10", 200), ent("2026-07-02", 300), ent("2026-07-16", 50), ent("2025-03-01", 125), ent("2026-06-20", 10)],
    cobrancasPorDia: [],
  });
  it("6M: por mês, rótulos dos meses e variação contra os 6 anteriores", () => {
    const s = serieReceita(recs, HOJE, "6m");
    expect(s.rotulos).toEqual(["Fev", "Mar", "Abr", "Mai", "Jun", "Jul"]);
    expect(s.pontos).toEqual([0, 0, 0, 200, 10, 350]);
    expect(s.total).toBe(560);
    expect(s.totalAnterior).toBe(100);
    expect(s.textoVariacao).toBe("+460% em 6 meses");
  });
  it("Ano: janeiro até o mês de hoje, comparado com o mesmo pedaço do ano passado", () => {
    const s = serieReceita(recs, HOJE, "ano");
    expect(s.rotulos).toEqual(["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul"]);
    expect(s.total).toBe(660);
    expect(s.totalAnterior).toBe(125);
    expect(s.textoVariacao).toBe("+428% no ano");
  });
  it("30D: acumulado dia a dia, 30 pontos, 6 rótulos", () => {
    const s = serieReceita(recs, HOJE, "30d");
    expect(s.pontos).toHaveLength(30);
    expect(s.pontos[s.pontos.length - 1]).toBe(360);
    expect(s.rotulos).toEqual(["17/06", "23/06", "29/06", "05/07", "11/07", "16/07"]);
    expect(s.textoVariacao).toBeNull();
  });
});

describe("Cobranças do mês (rosca)", () => {
  it("pagas, aguardando, em aberto e vencidas pelo vencimento no mês; canceladas e estornadas fora; mensalidades do mês sem linha entram", () => {
    const cobs = [
      cob({ status: "paga", vencimento: "2026-07-05", valor: 249, pago_em: "2026-07-05T12:00:00Z" }),
      cob({ status: "aguardando_confirmacao", vencimento: "2026-07-14", valor: 249 }),
      cob({ status: "aberta", vencimento: "2026-07-28", valor: 150 }),
      cob({ status: "aberta", vencimento: "2026-07-02", valor: 60 }),
      cob({ status: "cancelada", vencimento: "2026-07-03", valor: 999 }),
      cob({ status: "paga", vencimento: "2026-07-04", valor: 50, reembolsado_em: "2026-07-05T10:00:00Z" }),
      cob({ status: "aberta", vencimento: "2026-08-02", valor: 77 }),
    ];
    const alunos = [aluno({ paciente_id: "a9", pago_ate: "2026-07-12T12:00:00Z" }), aluno({ paciente_id: "a8", pago_ate: "2026-07-30T12:00:00Z" })];
    const f = cobrancasDoMes(cobs, aReceber(cobs, alunos, HOJE, AGORA), HOJE);
    expect(f.map((x) => `${x.chave}:${x.qtd}:${x.valor}`)).toEqual(["pagas:1:249", "aguardando:1:249", "abertas:2:399", "vencidas:2:309"]);
    expect(Math.round(fracaoPaga(f) * 100)).toBe(21);
    expect(fracaoPaga([])).toBe(0);
  });
});

describe("Precisam de atenção (tela 6)", () => {
  it("Pix aguardando primeiro; depois as vencidas da mais antiga para a mais nova", () => {
    const pendentes = [{ id: "x1", paciente_id: "p1", enviado_em: "2026-07-15T12:00:00Z", created_at: "2026-07-15T12:00:00Z",
      aluno: { paciente_id: "p1", treino_user_id: null, nome: "João Pedro", email: null } } as unknown as PendenteResumo];
    const lista = aReceber([cob({ id: "v1", vencimento: "2026-07-08", descricao: "Consulta de retorno", paciente: { nome: "Carlos Souza" } })],
      [aluno({ paciente_id: "a1", nome: "Marina Alves", pago_ate: "2026-07-04T12:00:00Z" })], HOJE, AGORA);
    expect(precisamDeAtencao(pendentes, lista).map((i) => `${i.chip}|${i.nome}|${i.texto}`)).toEqual([
      "PIX|João Pedro|Pix aguardando sua confirmação",
      "VENCIDA|Marina Alves|Mensalidade vencida desde 04/07",
      "VENCIDA|Carlos Souza|Consulta de retorno venceu em 08/07",
    ]);
  });
});

describe("Entradas do mês por categoria", () => {
  it("agrupa pela categoria; as cobranças pagas sem lançamento viram \"Mensalidades e cobranças\"", () => {
    const b = entradasPorCategoria({
      entradasPorDia: [ent("2026-07-02", 180, "Consulta"), ent("2026-07-09", 120, "Consulta"), ent("2026-07-10", 90, null), ent("2026-06-30", 999, "Consulta")],
      cobrancasPorDia: [{ dia: "2026-07-05", valor: 249 }, { dia: "2026-06-29", valor: 70 }],
    }, HOJE);
    expect(b).toEqual([{ nome: "Consulta", valor: 300 }, { nome: "Mensalidades e cobranças", valor: 249 }, { nome: "Sem categoria", valor: 90 }]);
  });
});

describe("comparação do mês: o MESMO período do mês anterior (W25 — herdado da W19)", () => {
  const recs = (l: [string, number][]) => l.map(([dia, valor]) => ({ dia, valor, origem: "lancamento" as const }));
  it("no dia 1º compara 1º contra 1º (não o mês parcial contra o mês cheio)", () => {
    const c = comparacaoDoMes(recs([["2026-09-01", 100], ["2026-09-15", 900], ["2026-09-30", 500], ["2026-10-01", 130]]), "2026-10-01");
    expect(c).toMatchObject({ atual: 130, anterior: 100, variacao: 30, de: "2026-09-01", ate: "2026-09-01", rotulo: "1º set", rotuloLongo: "1º de setembro" });
  });
  it("sem nada no mesmo período do mês anterior não há variação (nada para comparar)", () => {
    const c = comparacaoDoMes(recs([["2026-09-02", 900], ["2026-10-01", 130]]), "2026-10-01");
    expect(c.anterior).toBe(0);
    expect(c.variacao).toBeNull();
  });
  it("dia 31 num mês de 31 contra um mês de 30: o mês anterior inteiro", () => {
    const c = comparacaoDoMes(recs([["2026-09-30", 200], ["2026-10-31", 300], ["2026-10-02", 100]]), "2026-10-31");
    expect(c).toMatchObject({ atual: 400, anterior: 200, variacao: 100, de: "2026-09-01", ate: "2026-09-30", rotulo: "1–30 set" });
  });
  it("março contra fevereiro: até o dia 28 (ou 29 no bissexto)", () => {
    expect(comparacaoDoMes([], "2026-03-30")).toMatchObject({ de: "2026-02-01", ate: "2026-02-28", rotulo: "1–28 fev" });
    expect(comparacaoDoMes([], "2028-03-30")).toMatchObject({ de: "2028-02-01", ate: "2028-02-29", rotulo: "1–29 fev" });
    expect(comparacaoDoMes([], "2026-03-15")).toMatchObject({ de: "2026-02-01", ate: "2026-02-15" });
  });
  it("janeiro compara com dezembro do ano anterior; o que entra depois de hoje no mês não entra na conta", () => {
    const c = comparacaoDoMes(recs([["2025-12-10", 50], ["2025-12-20", 70], ["2026-01-05", 80], ["2026-01-25", 999]]), "2026-01-10");
    expect(c).toMatchObject({ atual: 80, anterior: 50, variacao: 60, de: "2025-12-01", ate: "2025-12-10", rotulo: "1–10 dez" });
  });
});
