// Physiq W-A P2 — as regras PURAS do front das rotinas e da dieta livre (src/aluno-dia/regras.ts): as datas de São Paulo, as rotinas de um dia
// (o dia da semana, a ordem da tela, o ✓ daquele dia, sem as arquivadas) e o dia aplicado sobre o plano (riscado, posto, extras; o plano × o
// comido: só as refeições com ✓ e as extras com "Já comi"; item tirado que saiu do plano não conta; outro dia não entra).
import { describe, expect, it } from "vitest";
import type { ItemDaRefeicao, RefeicaoDoPlano } from "@/nutricao/app/tipos";
import { diaAplicado, diaDaSemanaISO, diaGravavel, hojeSP, ontemSP, rotinasDoDia } from "./regras";
import type { ItemDoDia, Rotina } from "./tipos";

const SEG = "2026-10-12"; // segunda-feira (ISO 1)
const AGORA = new Date("2026-10-13T02:30:00Z"); // 23:30 de segunda em São Paulo

const alimento = (id: string, kcal: number) => ({ id, nome: id, fonte: "taco", energia_kcal: kcal, proteina_g: 1, carboidrato_g: 1, lipidio_g: 1, fibra_g: 1, sodio_mg: 0, medidas_caseiras: [] });
const item = (id: string, kcal: number, ordem = 0): ItemDaRefeicao => ({
  id, alimento_id: `al-${id}`, quantidade_g: 100, medida_caseira_id: null, quantidade_medida: null, ordem, substitutos: null, observacao: null,
  created_at: "2026-10-01T00:00:00Z", alimento: alimento(`al-${id}`, kcal),
});
const refeicao = (id: string, ordem: number, itens: ItemDaRefeicao[], dias: number[] = []): RefeicaoDoPlano => ({ id, nome: id, horario: null, ordem, observacao: null, dias_semana: dias, itens });
const doDia = (o: Partial<ItemDoDia> & Pick<ItemDoDia, "id" | "tipo">): ItemDoDia => ({
  paciente_id: "p", dia: SEG, refeicao_id: null, extra_id: null, item_refeicao_id: null, alimento_id: null, aluno_alimento_id: null, aluno_receita_id: null,
  quantidade_g: 100, porcoes: null, refeicao_nome: null, nome: "x", energia_kcal: 0, proteina_g: 0, carboidrato_g: 0, lipidio_g: 0, fibra_g: 0,
  criado_em: "2026-10-12T12:00:00Z", ...o,
});
const rotina = (o: Partial<Rotina> & Pick<Rotina, "id">): Rotina => ({
  origem: "aluno", paciente_id: null, nome: o.id, detalhe: null, tipo: "outro", horario: null, dias_semana: [1, 2, 3, 4, 5, 6, 7], lembrete: false,
  ordem: 0, criada_em: "2026-10-01T10:00:00Z", alterada_em: "2026-10-01T10:00:00Z", arquivada_em: null, ...o,
});

describe("W-A P2: as datas de São Paulo", () => {
  it("23:30 de segunda em SP (02:30Z de terça) ainda é segunda; ontem = domingo; grava só hoje e ontem", () => {
    expect(hojeSP(AGORA)).toBe(SEG);
    expect(ontemSP(AGORA)).toBe("2026-10-11");
    expect([SEG, "2026-10-11", "2026-10-10", "2026-10-13"].map((d) => diaGravavel(d, AGORA))).toEqual([true, true, false, false]);
    expect(diaDaSemanaISO(SEG)).toBe(1);
    expect(diaDaSemanaISO("2026-10-18")).toBe(7);
  });
});

describe("W-A P2: as rotinas de um dia", () => {
  it("as do dia da semana, vivas, na ordem da tela (horário; sem horário por último; ordem), com o ✓ só daquele dia", () => {
    const lista = rotinasDoDia([
      rotina({ id: "noite", horario: "20:00" }),
      rotina({ id: "manha", horario: "08:00", dias_semana: [1], ordem: 1 }),
      rotina({ id: "sem-hora", dias_semana: [1] }),
      rotina({ id: "terca", horario: "07:00", dias_semana: [2] }),
      rotina({ id: "apagada", horario: "06:00", arquivada_em: "2026-10-11T10:00:00Z" }),
    ], [
      { rotina_id: "manha", dia: SEG, feita_em: "2026-10-12T08:05:00Z" },
      { rotina_id: "noite", dia: "2026-10-11", feita_em: "2026-10-11T20:01:00Z" },
    ], SEG);
    expect(lista.map((r) => [r.id, r.feita])).toEqual([["manha", true], ["noite", false], ["sem-hora", false]]);
    expect(lista[0].feita_em).toBe("2026-10-12T08:05:00Z");
  });
});

describe("W-A P2: o dia aplicado sobre o plano", () => {
  const plano = { refeicoes: [
    refeicao("cafe", 1, [item("i1", 124), item("i2", 76, 1)]),
    refeicao("almoco", 2, [item("i3", 159)]),
    refeicao("jantar-de-terca", 3, [item("i4", 300)], [2]),
  ] };
  const meuDia = {
    dia: SEG,
    extras: [
      { id: "e1", paciente_id: "p", nome: "lanche", horario: "16:00", concluida_em: "2026-10-12T16:10:00Z" },
      { id: "e2", paciente_id: "p", nome: "ceia", horario: null, concluida_em: null },
    ],
    itens: [
      doDia({ id: "t1", tipo: "tirado", refeicao_id: "cafe", item_refeicao_id: "i2", energia_kcal: 76 }),
      doDia({ id: "a1", tipo: "adicionado", refeicao_id: "cafe", energia_kcal: 80 }),
      doDia({ id: "a2", tipo: "adicionado", refeicao_id: "almoco", energia_kcal: 50 }),
      doDia({ id: "a3", tipo: "adicionado", extra_id: "e1", energia_kcal: 200 }),
      doDia({ id: "a4", tipo: "adicionado", extra_id: "e2", energia_kcal: 999 }),
      doDia({ id: "t2", tipo: "tirado", refeicao_id: null, item_refeicao_id: null, energia_kcal: 500 }),
      doDia({ id: "a5", tipo: "adicionado", refeicao_id: "cafe", energia_kcal: 1000, dia: "2026-10-11" }),
    ],
  };

  it("as refeições do dia (a de terça fica de fora), o item tirado riscado e o que ele pôs em cada refeição e extra", () => {
    const d = diaAplicado(plano, meuDia, new Set(["cafe"]));
    expect(d.refeicoes.map((r) => r.refeicao.id)).toEqual(["cafe", "almoco"]);
    expect(d.refeicoes[0].itens.map((x) => [x.item.id, x.tirado?.id ?? null])).toEqual([["i1", null], ["i2", "t1"]]);
    expect(d.refeicoes[0].adicionados.map((x) => x.id)).toEqual(["a1"]);
    expect(d.refeicoes[1].adicionados.map((x) => x.id)).toEqual(["a2"]);
    expect(d.extras.map((e) => [e.extra.id, e.concluida, e.adicionados.map((x) => x.id)])).toEqual([["e1", true, ["a3"]], ["e2", false, ["a4"]]]);
  });

  it("os totais: o plano = as refeições com alimento do dia; o comido = as com ✓ (sem o tirado, com o posto) + as extras com 'Já comi'", () => {
    const d = diaAplicado(plano, meuDia, new Set(["cafe"]));
    expect(d.totais.plano.energia_kcal).toBe(124 + 76 + 159);
    expect(d.totais.comido.energia_kcal).toBe(124 + 80 + 200);
    const semMarcar = diaAplicado(plano, meuDia, new Set());
    expect(semMarcar.totais.comido.energia_kcal).toBe(200); // só a extra com "Já comi"
    const tudo = diaAplicado(plano, meuDia, new Set(["cafe", "almoco"]));
    expect(tudo.totais.comido.energia_kcal).toBe(124 + 80 + 159 + 50 + 200);
  });

  it("sem plano: só as extras; o plano zerado", () => {
    const d = diaAplicado(null, meuDia, new Set());
    expect(d.refeicoes).toEqual([]);
    expect(d.totais.plano.energia_kcal).toBe(0);
    expect(d.totais.comido.energia_kcal).toBe(200);
  });
});
