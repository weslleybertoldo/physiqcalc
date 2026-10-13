import { describe, expect, it } from "vitest";
import { hojeSP } from "@/aluno-dia/regras";
import type { Rotina, RotinaFeita } from "@/aluno-dia/tipos";
import {
  ACAO_FEITO, CANAL_ROTINAS, FAIXA, JANELA_DO_SITE_MS, acaoDaNotificacao, chaveDoAvisoNoSite, deveLimparAoDesmontar, diferenca, idDoLembrete, instante,
  naFaixa, planoDosLembretes, posicoes, rotinasParaAvisarNoSite, textoDoLembrete, type LembreteNoAparelho,
} from "./lembretes";
import { REMEDIO_SEM_NOME_NA_TELA_BLOQUEADA } from "./textos";

// O relógio dos casos: quarta 30/09/2026 às 9h30 NA HORA LOCAL do aparelho (o alarme usa o relógio do celular — risco 4); o "hoje" do
// plano é o de São Paulo, o mesmo dia para qualquer fuso de UTC−12 a UTC+6 (o CI roda em UTC; o notebook em São Paulo).
const L = (dia: string, hora: string) => instante(dia, hora);
const AGORA = L("2026-09-30", "09:30");
const DONO = "u-aluna";

let n = 0;
function rotina(o: Partial<Rotina> = {}): Rotina {
  n += 1;
  return {
    id: o.id ?? `r${n}`, origem: "aluno", paciente_id: null, nome: "Creatina", detalhe: "5 g", tipo: "suplemento", horario: "10:00",
    dias_semana: [1, 2, 3, 4, 5, 6, 7], lembrete: true, ordem: 0, criada_em: `2026-09-0${Math.min(n, 9)}T12:00:00Z`, alterada_em: "2026-09-01T12:00:00Z",
    arquivada_em: null, ...o,
  };
}
const feita = (rotina_id: string, dia: string): RotinaFeita => ({ rotina_id, dia, feita_em: `${dia}T12:00:00Z` });
const dias = (p: LembreteNoAparelho[]) => p.map((l) => l.extra.dia);

describe("W-A P3 — os ids da faixa própria (40000–40299)", () => {
  it("40000 + posição × 10 + dia da semana: a 1ª rotina na segunda = 40001; a 30ª no domingo = 40297; tudo dentro da faixa", () => {
    expect(idDoLembrete(0, 1)).toBe(40001);
    expect(idDoLembrete(29, 7)).toBe(40297);
    expect(naFaixa(FAIXA.de) && naFaixa(FAIXA.ate)).toBe(true);
    // as outras notificações do app ficam fora: treino 2001, timer 1002, treino longo 1101–1103, consultas 3000–3899 (e 3001/3002 nativos)
    for (const fora of [2001, 1002, 1101, 3000, 3899, 39999, 40300]) expect(naFaixa(fora)).toBe(false);
    expect(naFaixa("40001")).toBe(false);
  });

  it("a posição é a da CRIAÇÃO entre as vivas (a arquivada não ocupa lugar)", () => {
    const a = rotina({ id: "a", criada_em: "2026-09-05T00:00:00Z" });
    const b = rotina({ id: "b", criada_em: "2026-09-01T00:00:00Z" });
    const x = rotina({ id: "x", criada_em: "2026-08-01T00:00:00Z", arquivada_em: "2026-09-10T00:00:00Z" });
    expect([...posicoes([a, b, x]).entries()]).toEqual([["b", 0], ["a", 1]]);
  });
});

describe("W-A P3 — o plano: as próximas 7 ocorrências AVULSAS de cada rotina com lembrete (revisão C3)", () => {
  it("todo dia às 10:00, agora 9h30 de quarta → 7 avisos (qua → ter), 1 por dia da semana, sem `every`, com o dia e o dono no extra", () => {
    const r = rotina({ id: "cre" });
    const p = planoDosLembretes([r], [], DONO, AGORA);
    expect(p).toHaveLength(7);
    expect(dias(p)).toEqual(["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06"]);
    expect(p.map((l) => l.id)).toEqual([40003, 40004, 40005, 40006, 40007, 40001, 40002]);
    expect(new Set(p.map((l) => l.id)).size).toBe(7);
    expect(p[0].at.getTime()).toBe(instante("2026-09-30", "10:00").getTime());
    expect(p[6].at.getTime()).toBe(instante("2026-10-06", "10:00").getTime());
    expect(p[0].extra).toEqual({ rotina_id: "cre", dono: DONO, dia: "2026-09-30", hora: "10:00" });
    for (const l of p) expect(Object.keys(l).sort()).toEqual(["at", "corpo", "extra", "id", "titulo"]);
  });

  it("hoje sai se a hora já passou ou se já foi feita hoje (6 avisos); feita ONTEM não muda nada", () => {
    expect(dias(planoDosLembretes([rotina({ id: "a", horario: "09:00" })], [], DONO, AGORA))).not.toContain("2026-09-30");
    expect(planoDosLembretes([rotina({ id: "a", horario: "09:00" })], [], DONO, AGORA)).toHaveLength(6);
    expect(planoDosLembretes([rotina({ id: "b" })], [feita("b", "2026-09-30")], DONO, AGORA)).toHaveLength(6);
    expect(planoDosLembretes([rotina({ id: "c" })], [feita("c", "2026-09-29")], DONO, AGORA)).toHaveLength(7);
  });

  it("os dias da semana dela: Seg a Sex → 5 nos próximos 7 dias; só sábado → 1", () => {
    expect(dias(planoDosLembretes([rotina({ dias_semana: [1, 2, 3, 4, 5] })], [], DONO, AGORA)))
      .toEqual(["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06"]);
    expect(dias(planoDosLembretes([rotina({ dias_semana: [6] })], [], DONO, AGORA))).toEqual(["2026-10-03"]);
  });

  it("sem lembrete, sem horário, arquivada ou a 31ª viva → nada", () => {
    expect(planoDosLembretes([rotina({ lembrete: false })], [], DONO, AGORA)).toEqual([]);
    expect(planoDosLembretes([rotina({ horario: null, lembrete: true })], [], DONO, AGORA)).toEqual([]);
    expect(planoDosLembretes([rotina({ arquivada_em: "2026-09-29T00:00:00Z" })], [], DONO, AGORA)).toEqual([]);
    const trinta = Array.from({ length: 30 }, (_, i) => rotina({ id: `v${String(i).padStart(2, "0")}`, criada_em: `2026-08-01T00:${String(i).padStart(2, "0")}:00Z`, lembrete: false }));
    const ultima = rotina({ id: "z31", criada_em: "2026-09-29T00:00:00Z" });
    expect(planoDosLembretes([...trinta, ultima], [], DONO, AGORA)).toEqual([]);
  });

  it("2 rotinas: ids que não se cruzam (posição 0 e 1) e a lista pela hora", () => {
    const p = planoDosLembretes([rotina({ id: "b", criada_em: "2026-09-02T00:00:00Z", horario: "08:00" }), rotina({ id: "a", criada_em: "2026-09-01T00:00:00Z" })],
      [], DONO, AGORA);
    expect(p).toHaveLength(13); // a: 7 (10:00 de hoje ainda vem) · b: 6 (8:00 de hoje já passou)
    expect(new Set(p.map((l) => l.id)).size).toBe(13);
    expect(p.filter((l) => l.extra.rotina_id === "a").every((l) => l.id >= 40001 && l.id <= 40007)).toBe(true);
    expect(p.filter((l) => l.extra.rotina_id === "b").every((l) => l.id >= 40011 && l.id <= 40017)).toBe(true);
    expect(p.map((l) => l.at.getTime())).toEqual([...p.map((l) => l.at.getTime())].sort((x, y) => x - y));
  });

  it("o dia é o de São Paulo: às 22h30 de SP (01h30 UTC do dia seguinte) a janela começa no dia de SP (a hora, a do aparelho)", () => {
    const agora = new Date("2026-10-01T01:30:00Z");
    expect(hojeSP(agora)).toBe("2026-09-30");
    const p = planoDosLembretes([rotina({ horario: "23:45" })], [], DONO, agora);
    const primeiro = instante("2026-09-30", "23:45").getTime() > agora.getTime() ? "2026-09-30" : "2026-10-01";
    expect(p[0].extra.dia).toBe(primeiro);
    expect(p.length).toBe(primeiro === "2026-09-30" ? 7 : 6);
  });
});

describe("W-A P3 — o texto (Q3) e o canal", () => {
  it("suplemento: 'Hora da rotina' + 'Creatina · 5 g'; sem detalhe, só o nome", () => {
    expect(textoDoLembrete(rotina())).toEqual({ titulo: "Hora da rotina", corpo: "Creatina · 5 g" });
    expect(textoDoLembrete(rotina({ detalhe: null }))).toEqual({ titulo: "Hora da rotina", corpo: "Creatina" });
  });

  it("remédio (Q3 = 'não', a recomendada): 'Hora do seu remédio · 08:00' e o corpo SEM o nome", () => {
    expect(REMEDIO_SEM_NOME_NA_TELA_BLOQUEADA).toBe(true);
    const t = textoDoLembrete(rotina({ tipo: "remedio", nome: "Losartana", detalhe: "50 mg", horario: "08:00" }));
    expect(t.titulo).toBe("Hora do seu remédio · 08:00");
    expect(`${t.titulo} ${t.corpo}`).not.toMatch(/Losartana|50 mg/);
    expect(CANAL_ROTINAS).toBe("rotinas-v1");
  });
});

describe("W-A P3 — a reconciliação (o que o aparelho tem × o plano)", () => {
  const r = rotina({ id: "cre" });
  const plano = planoDosLembretes([r], [], DONO, AGORA);
  const pendente = (l: LembreteNoAparelho, extra: Record<string, unknown> = {}) => ({ id: l.id, title: l.titulo, body: l.corpo, extra: { ...l.extra, ...extra } });
  const ctx = { rotinas: [r], feitas: [] as RotinaFeita[], dono: DONO, agora: AGORA };

  it("nada agendado → agenda os 7; tudo igual → nada a fazer", () => {
    expect(diferenca([], plano, ctx)).toEqual({ cancelar: [], agendar: plano });
    expect(diferenca(plano.map((l) => pendente(l)), plano, ctx)).toEqual({ cancelar: [], agendar: [] });
  });

  it("o texto ou a hora mudaram → reagenda só o que mudou (o mesmo id troca); fora da faixa (treino 2001, consulta 3123) → nunca mexe", () => {
    const pend = [...plano.map((l) => pendente(l)), { id: 2001, title: "Physiq — Hora do treino!", body: "x" }, { id: 3123, title: "Consulta", body: "y" }];
    pend[0] = { ...pend[0], body: "Creatina · 3 g" };
    const d = diferenca(pend, plano, ctx);
    expect(d.cancelar).toEqual([]);
    expect(d.agendar.map((l) => l.id)).toEqual([plano[0].id]);
  });

  it("de outro login (aparelho compartilhado), de rotina apagada ou de um dia que saiu do plano → cancela", () => {
    const outro = { id: 40011, title: "Hora da rotina", body: "Água", extra: { rotina_id: "x", dono: "outra-pessoa", dia: "2026-10-01", hora: "11:00" } };
    const apagada = { id: 40021, title: "Hora da rotina", body: "Velha", extra: { rotina_id: "sumiu", dono: DONO, dia: "2026-10-05", hora: "07:00" } };
    expect(diferenca([outro, apagada], plano, ctx).cancelar).toEqual([40011, 40021]);
  });

  it("a de HOJE que já venceu e ainda está pendente (alarme inexato atrasando) FICA; se foi feita, ou a hora mudou, sai", () => {
    const venceu = { id: 40003, title: "Hora da rotina", body: "Creatina · 5 g", extra: { rotina_id: "cre", dono: DONO, dia: "2026-09-30", hora: "09:20" } };
    const r920 = rotina({ id: "cre", horario: "09:20" });
    const plano920 = planoDosLembretes([r920], [], DONO, AGORA); // hoje já passou: 6
    expect(plano920.some((l) => l.id === 40003)).toBe(false);
    expect(diferenca([venceu], plano920, { ...ctx, rotinas: [r920] }).cancelar).toEqual([]);
    expect(diferenca([venceu], plano920, { ...ctx, rotinas: [r920], feitas: [feita("cre", "2026-09-30")] }).cancelar).toEqual([40003]);
    expect(diferenca([venceu], plano920, { ...ctx, rotinas: [rotina({ id: "cre", horario: "09:25" })] }).cancelar).toEqual([40003]);
  });
});

describe("W-A P3 — o toque e o 'Feito'", () => {
  const ev = (actionId: string, extra: Record<string, unknown>, id = 40003) => ({ actionId, notification: { id, title: "Hora da rotina", body: "Creatina · 5 g", extra } });
  const extra = { rotina_id: "cre", dono: DONO, dia: "2026-09-30", hora: "10:00" };

  it("'Feito' ou o toque de uma rotina deste login → marcar o dia DAQUELA ocorrência (ontem também)", () => {
    expect(acaoDaNotificacao(ev(ACAO_FEITO, extra), DONO, AGORA)).toEqual({ tipo: "marcar", rotina_id: "cre", dia: "2026-09-30", nome: "Creatina" });
    expect(acaoDaNotificacao(ev("tap", { ...extra, dia: "2026-09-29" }), DONO, AGORA)).toEqual({ tipo: "marcar", rotina_id: "cre", dia: "2026-09-29", nome: "Creatina" });
    // o remédio (Q3) vem sem o nome no corpo: o nome sai da lista quando ela chegar
    const remedio = { actionId: ACAO_FEITO, notification: { id: 40013, title: "Hora do seu remédio · 08:00", body: "Toque para ver e marcar como feito.", extra } };
    expect(acaoDaNotificacao(remedio, DONO, AGORA)).toEqual({ tipo: "marcar", rotina_id: "cre", dia: "2026-09-30", nome: null });
  });

  it("de outro login, sem login ou ação desconhecida → ignorar (ninguém marca)", () => {
    expect(acaoDaNotificacao(ev(ACAO_FEITO, { ...extra, dono: "outra-pessoa" }), DONO, AGORA)).toEqual({ tipo: "ignorar" });
    expect(acaoDaNotificacao(ev(ACAO_FEITO, extra), null, AGORA)).toEqual({ tipo: "ignorar" });
    expect(acaoDaNotificacao(ev("outra", extra), DONO, AGORA)).toEqual({ tipo: "ignorar" });
  });

  it("a consulta nova (extra.rota, id 3000–3899) e o lixo → não é rotina (fica para o outro ouvinte)", () => {
    expect(acaoDaNotificacao(ev("tap", { rota: "/perfil/agenda" }, 3123), DONO, AGORA)).toEqual({ tipo: "nao_e_rotina" });
    expect(acaoDaNotificacao(null, DONO, AGORA)).toEqual({ tipo: "nao_e_rotina" });
    expect(acaoDaNotificacao({ notification: { id: 40003 } }, DONO, AGORA)).toEqual({ tipo: "nao_e_rotina" });
  });
});

describe("W-A P3 — o aviso do site (a página aberta) e o Sair", () => {
  const r = rotina({ id: "cre", horario: "09:25" });
  it("venceu há menos de 10 min, no dia dela, não feita e não avisada → avisa; antes da hora, depois da janela, feita ou já avisada → não", () => {
    expect(rotinasParaAvisarNoSite([r], [], new Set(), AGORA).map((x) => x.id)).toEqual(["cre"]);
    expect(rotinasParaAvisarNoSite([r], [], new Set(), L("2026-09-30", "09:24"))).toEqual([]);
    expect(rotinasParaAvisarNoSite([r], [], new Set(), new Date(instante("2026-09-30", "09:25").getTime() + JANELA_DO_SITE_MS))).toEqual([]);
    expect(rotinasParaAvisarNoSite([r], [feita("cre", "2026-09-30")], new Set(), AGORA)).toEqual([]);
    expect(rotinasParaAvisarNoSite([r], [], new Set([chaveDoAvisoNoSite("cre", "2026-09-30")]), AGORA)).toEqual([]);
    expect(rotinasParaAvisarNoSite([rotina({ id: "sab", horario: "09:25", dias_semana: [6] })], [], new Set(), AGORA)).toEqual([]);
    expect(rotinasParaAvisarNoSite([rotina({ id: "s", horario: "09:25", lembrete: false })], [], new Set(), AGORA)).toEqual([]);
  });

  it("o Sair: desmontou e o login guardado não é mais o dele (saiu, trocou, excluiu) → limpa; o mesmo login guardado (remontou) → não", () => {
    expect(deveLimparAoDesmontar("u1", null)).toBe(true);
    expect(deveLimparAoDesmontar("u1", "u2")).toBe(true);
    expect(deveLimparAoDesmontar("u1", "u1")).toBe(false);
    expect(deveLimparAoDesmontar(null, null)).toBe(false);
  });
});
