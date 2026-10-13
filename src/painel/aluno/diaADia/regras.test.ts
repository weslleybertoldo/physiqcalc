// Physiq W-A P6 — as regras PURAS do "Dia a dia" (src/painel/aluno/diaADia/regras.ts): os 14 dias (hoje primeiro), o rótulo do botão, o dia
// montado sobre o plano (o diaAplicado da P2: riscados, postos, ✓, extras, comido × plano), o que ficou FORA do plano (a nutri tirou a refeição
// depois — o retrato, agrupado pelo nome), as rotinas do dia, os dias com registro, a quantidade e os macros do retrato e o estado.
import { describe, expect, it } from "vitest";
import type { ExtraDoDia, ItemDoDia, RotinaDoProfissional } from "@/aluno-dia/tipos";
import type { ItemDaRefeicao, RefeicaoDoPlano } from "@/nutricao/app/tipos";
import {
  TEXTOS_DIA, diaNaFicha, diasComRegistro, diasDaJanela, estadoDoDiaADia, macrosDoPosto, macrosDoTotal, quantidadeDoPosto, rotuloCurto,
} from "./regras";

const TER = "2026-10-13"; // terça-feira (ISO 2)
const SEG = "2026-10-12";

const alimento = (id: string, kcal: number) => ({ id, nome: `alimento ${id}`, fonte: "taco", energia_kcal: kcal, proteina_g: 10, carboidrato_g: 20, lipidio_g: 5, fibra_g: 1, sodio_mg: 0 });
const item = (id: string, kcal: number, ordem = 0): ItemDaRefeicao => ({
  id, alimento_id: `al-${id}`, quantidade_g: 100, medida_caseira_id: null, quantidade_medida: null, ordem, substitutos: null, observacao: null,
  created_at: "2026-10-01T00:00:00Z", alimento: alimento(`al-${id}`, kcal),
});
const refeicao = (id: string, ordem: number, itens: ItemDaRefeicao[], dias: number[] = []): RefeicaoDoPlano => ({
  id, nome: `Refeição ${id}`, horario: `0${ordem + 7}:00`, ordem, observacao: null, dias_semana: dias, itens,
});
const PLANO = { refeicoes: [refeicao("cafe", 0, [item("pao", 200), item("ovo", 100, 1)]), refeicao("almoco", 1, [item("arroz", 300)]), refeicao("sabado", 2, [item("pizza", 800)], [6])] };
const doDia = (o: Partial<ItemDoDia> & Pick<ItemDoDia, "id" | "tipo">): ItemDoDia => ({
  paciente_id: "p1", dia: TER, refeicao_id: null, extra_id: null, item_refeicao_id: null, alimento_id: null, aluno_alimento_id: null, aluno_receita_id: null,
  quantidade_g: 100, porcoes: null, refeicao_nome: null, nome: "x", energia_kcal: 0, proteina_g: 0, carboidrato_g: 0, lipidio_g: 0, fibra_g: 0,
  criado_em: "2026-10-13T12:00:00Z", ...o,
});
const extra = (o: Partial<ExtraDoDia> & Pick<ExtraDoDia, "id">): ExtraDoDia => ({ nome: "Lanche", horario: "16:00", concluida_em: null, dia: TER, ...o });
const rotina = (o: Partial<RotinaDoProfissional> & Pick<RotinaDoProfissional, "id">): RotinaDoProfissional => ({
  origem: "aluno", paciente_id: null, nome: o.id, detalhe: null, tipo: "outro", horario: null, dias_semana: [1, 2, 3, 4, 5, 6, 7], lembrete: false,
  ordem: 0, criada_em: "2026-10-01T10:00:00Z", alterada_em: "2026-10-01T10:00:00Z", arquivada_em: null, pode_editar: false, criada_por_nome: null,
  arquivada_pelo_aluno: false, ...o,
});

describe("W-A P6: os 14 dias e o rótulo do botão", () => {
  it("de hoje para trás (hoje primeiro, à vista no celular); 'Hoje' · 'Ontem' · 'Sáb 10/10'", () => {
    const dias = diasDaJanela(TER);
    expect(dias).toHaveLength(14);
    expect([dias[0], dias[1], dias[13]]).toEqual([TER, SEG, "2026-09-30"]);
    expect([rotuloCurto(TER, TER), rotuloCurto(SEG, TER), rotuloCurto("2026-10-10", TER)]).toEqual(["Hoje", "Ontem", "Sáb 10/10"]);
  });
});

describe("W-A P6: o dia na ficha", () => {
  const itens = [
    doDia({ id: "t1", tipo: "tirado", refeicao_id: "cafe", refeicao_nome: "Refeição cafe", item_refeicao_id: "ovo", nome: "alimento al-ovo", energia_kcal: 100 }),
    doDia({ id: "a1", tipo: "adicionado", refeicao_id: "cafe", refeicao_nome: "Refeição cafe", nome: "Banana", quantidade_g: 120, energia_kcal: 107, proteina_g: 1.4,
      carboidrato_g: 27.4, lipidio_g: 0.1 }),
    doDia({ id: "a2", tipo: "adicionado", extra_id: "e1", nome: "Vitamina", quantidade_g: null, porcoes: 2, energia_kcal: 300 }),
    // a nutri tirou a refeição "Ceia" do plano depois: o item ficou com o retrato (refeicao_id nulo)
    doDia({ id: "a3", tipo: "adicionado", refeicao_nome: "Ceia", nome: "Iogurte", energia_kcal: 90 }),
    // o item que ele tirou saiu do plano depois (item_refeicao_id nulo): fica de fora, com o retrato
    doDia({ id: "t2", tipo: "tirado", refeicao_nome: "Ceia", nome: "Granola", energia_kcal: 50 }),
    doDia({ id: "outro-dia", tipo: "adicionado", refeicao_id: "cafe", dia: SEG, nome: "Bolo", energia_kcal: 400 }),
  ];
  const retratos = { extras: [extra({ id: "e1", concluida_em: "2026-10-13T19:00:00Z" }), extra({ id: "e-seg", dia: SEG })], itens };
  const concluidas = [{ refeicao_id: "cafe", data: TER }, { refeicao_id: "almoco", data: SEG }];
  const rotinas = { rotinas: [rotina({ id: "creatina", horario: "08:00" }), rotina({ id: "agua", horario: "10:00" })], feitas: [{ rotina_id: "creatina", dia: TER, feita_em: "2026-10-13T11:00:00Z" }] };

  it("as refeições do dia da semana com os riscados, os postos e o ✓; as extras do dia; comido = ✓ (sem o tirado, com o posto) + extras com 'Já comi'", () => {
    const d = diaNaFicha(PLANO, TER, retratos, concluidas, rotinas);
    expect(d.refeicoes.map((r) => [r.refeicao.id, r.concluida])).toEqual([["cafe", true], ["almoco", false]]);
    const cafe = d.refeicoes[0];
    expect(cafe.itens.map((x) => [x.item.id, !!x.tirado])).toEqual([["pao", false], ["ovo", true]]);
    expect(cafe.adicionados.map((i) => i.id)).toEqual(["a1"]);
    expect(d.extras.map((e) => [e.extra.id, e.concluida, e.adicionados.map((i) => i.id)])).toEqual([["e1", true, ["a2"]]]);
    expect(d.totais.plano.energia_kcal).toBe(600); // café 300 + almoço 300 (o do sábado não vale na terça)
    expect(d.totais.comido.energia_kcal).toBe(200 + 107 + 300); // o pão (sem o ovo tirado) + a banana + a vitamina da extra
    expect(d.registrou).toBe(true);
  });

  it("fora do plano: o retrato agrupado pelo nome da refeição (o posto e o tirado que perderam o lugar); outro dia não entra", () => {
    const d = diaNaFicha(PLANO, TER, retratos, concluidas, rotinas);
    expect(d.foraDoPlano).toEqual([{ refeicao: "Ceia", itens: [itens[3], itens[4]] }]);
  });

  it("as rotinas que valiam no dia, com o ✓ do aluno; sem plano, as extras e o que ficou fora seguem", () => {
    const d = diaNaFicha(null, TER, retratos, [], rotinas);
    expect(d.rotinas.map((r) => [r.id, r.feita])).toEqual([["creatina", true], ["agua", false]]);
    expect(d.refeicoes).toEqual([]);
    expect(d.extras).toHaveLength(1);
    // sem plano, o que era de refeição fica fora (o retrato), agrupado pelo nome da refeição de quando ele mexeu
    expect(d.foraDoPlano.map((g) => [g.refeicao, g.itens.map((i) => i.id)])).toEqual([["Refeição cafe", ["t1", "a1"]], ["Ceia", ["a3", "t2"]]]);
  });

  it("um dia sem nada registrado: registrou = false", () => {
    const d = diaNaFicha(PLANO, "2026-10-08", retratos, concluidas, rotinas);
    expect(d.registrou).toBe(false);
    expect(d.refeicoes.every((r) => !r.concluida && r.adicionados.length === 0)).toBe(true);
  });

  it("os dias com registro (o ponto no botão): itens, extras, ✓ das refeições e rotinas feitas, só dentro da janela", () => {
    const dias = diasDaJanela(TER);
    const com = diasComRegistro(dias, retratos, [...concluidas, { refeicao_id: "cafe", data: "2026-09-01" }], {
      feitas: [{ rotina_id: "x", dia: "2026-10-05", feita_em: "2026-10-05T10:00:00Z" }],
    });
    expect([...com].sort()).toEqual(["2026-10-05", SEG, TER]);
  });
});

describe("W-A P6: os textos do retrato e o estado", () => {
  it("a quantidade (gramas ou porções) e os macros do retrato; os 3 macros do total", () => {
    expect(quantidadeDoPosto({ quantidade_g: 150, porcoes: null })).toBe("150 g");
    expect(quantidadeDoPosto({ quantidade_g: null, porcoes: 2 })).toBe("2 porções");
    expect(quantidadeDoPosto({ quantidade_g: null, porcoes: 1 })).toBe("1 porção");
    expect(macrosDoPosto({ energia_kcal: 192.4, proteina_g: 3.84, carboidrato_g: 41.2, lipidio_g: 0.36, fibra_g: 1 })).toBe("≈ 192 kcal · P 3,8 g · C 41,2 g · G 0,4 g");
    expect(macrosDoTotal({ proteina_g: 120.4, carboidrato_g: 180.6, lipidio_g: 50 })).toBe("P 120 g · C 181 g · G 50 g");
    expect(TEXTOS_DIA.comido(1480.4, 2353)).toBe("1.480 de 2.353 kcal");
    expect(TEXTOS_DIA.travada).toBe("A dieta está em “Só ver” (Acessos).");
    expect(TEXTOS_DIA.vazio).toBe("Nada registrado pelo aluno nestes dias.");
  });

  it("carregando enquanto o dia ou qualquer outra consulta chega · erro sem o dia · vazio sem registro na janela · pronto", () => {
    const ok = { isLoading: false, isError: false, data: {} };
    expect(estadoDoDiaADia({ isLoading: true, isError: false }, [], new Set())).toBe("carregando");
    expect(estadoDoDiaADia(ok, [{ isLoading: true }], new Set([TER]))).toBe("carregando");
    expect(estadoDoDiaADia({ isLoading: false, isError: false, fetchStatus: "paused" }, [{ isLoading: false }], new Set())).toBe("sem-internet");
    expect(estadoDoDiaADia({ isLoading: false, isError: true }, [{ isLoading: false }], new Set())).toBe("erro");
    expect(estadoDoDiaADia({ isLoading: false, isError: true, data: {} }, [{ isLoading: false }], new Set([TER]))).toBe("pronto"); // releitura que falhou
    expect(estadoDoDiaADia(ok, [{ isLoading: false }], new Set())).toBe("vazio");
    expect(estadoDoDiaADia(ok, [{ isLoading: false }], new Set([TER]))).toBe("pronto");
  });
});
