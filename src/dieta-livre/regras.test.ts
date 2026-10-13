import { describe, expect, it } from "vitest";
import { LIMITES } from "../../supabase-principal/functions/_shared/aluno-dia-regras";
import { diaAplicado } from "@/aluno-dia/regras";
import type { ItemDaBusca, ItemDoDia, MeuDia, MinhaReceita } from "@/aluno-dia/tipos";
import { resumoDaRefeicao } from "@/nutricao/app/dietaUtil";
import type { ItemDaRefeicao, PlanoAlimentar, RefeicaoDoPlano } from "@/nutricao/app/tipos";
import {
  LIMITES_DO_DIA, dadosDaEscolha, dadosDaExtra, dadosDaReceita, dadosDoAlimento, diaDaMatricula, escolhaInicial, estadoDaDietaLivre, formularioDaExtra,
  formularioDaReceita, formularioDoAlimento, gramasDaEscolha, ingredienteDaBusca, linhaDaExtra, linhaDaRefeicaoNoDia, macrosDaEscolha,
  macrosDaReceitaNoFormulario, quantidadeDoItemDoDia, resumoDoDiaLivre, totaisDaRefeicaoNoDia, unidadesDe, validarAlimento, validarExtra, validarReceita,
} from "./regras";

// ─── massa: o café da manhã (3 ovos + aveia) e o almoço (frango + arroz) do plano da tela 3 ───
const alimento = (id: string, nome: string, kcal: number, p: number, c: number, l: number) => ({
  id, nome, fonte: "taco", energia_kcal: kcal, proteina_g: p, carboidrato_g: c, lipidio_g: l, fibra_g: 1, sodio_mg: 1, medidas_caseiras: [],
});
const OVO = { ...alimento("ovo", "Ovo, de galinha, inteiro, cozido/10minutos", 145.7, 13.29, 0.61, 9.48), medidas_caseiras: [{ id: "un", descricao: "1 unidade", gramas: 50, ordem: 0 }] };
const AVEIA = alimento("aveia", "Aveia, flocos, crua", 393.82, 13.92, 66.64, 8.5);
const FRANGO = alimento("frango", "Frango, peito, sem pele, grelhado", 159.19, 32.03, 0, 2.48);
const ARROZ = alimento("arroz", "Arroz, integral, cozido", 123.53, 2.59, 25.81, 1);
const it0 = (id: string, a: ReturnType<typeof alimento>, g: number, extra: Partial<ItemDaRefeicao> = {}): ItemDaRefeicao => ({
  id, alimento_id: a.id, quantidade_g: g, medida_caseira_id: null, quantidade_medida: null, ordem: 0, substitutos: [], observacao: null,
  created_at: "2026-09-01T10:00:00Z", alimento: a, ...extra,
});
const ref = (id: string, nome: string, horario: string, ordem: number, itens: ItemDaRefeicao[]): RefeicaoDoPlano => ({
  id, nome, horario, ordem, observacao: null, dias_semana: [], itens,
});
const CAFE = ref("cafe", "Café da manhã", "07:00:00", 0, [it0("i-ovo", OVO, 150, { medida_caseira_id: "un", quantidade_medida: 3 }), it0("i-aveia", AVEIA, 50)]);
const ALMOCO = ref("almoco", "Almoço", "13:00:00", 1, [it0("i-frango", FRANGO, 150), it0("i-arroz", ARROZ, 150)]);
const VAZIA = ref("ceia", "Ceia", "22:00:00", 2, []);
const PLANO: Pick<PlanoAlimentar, "refeicoes"> = { refeicoes: [CAFE, ALMOCO, VAZIA] };
const item = (o: Partial<ItemDoDia>): ItemDoDia => ({
  id: "d1", paciente_id: "pac-1", dia: "2026-09-30", tipo: "adicionado", refeicao_id: null, extra_id: null, item_refeicao_id: null, alimento_id: null,
  aluno_alimento_id: null, aluno_receita_id: null, quantidade_g: 100, porcoes: null, refeicao_nome: "Café da manhã", nome: "Banana, prata, crua",
  energia_kcal: 98.25, proteina_g: 1.27, carboidrato_g: 25.96, lipidio_g: 0.07, fibra_g: 2, criado_em: "2026-09-30T10:00:00Z", ...o,
});
const MEU_DIA = (o: Partial<MeuDia> = {}): MeuDia => ({
  dia: "2026-09-30", hoje: "2026-09-30", pode_gravar: true, matriculas: [{ paciente_id: "pac-1", liberada: true }],
  plano_ativo: { plano_id: "plano-atual", paciente_id: "pac-1" }, extras: [], itens: [], ...o,
});
const BUSCA = (o: Partial<ItemDaBusca>): ItemDaBusca => ({
  tipo: "taco", id: "taco-arroz", nome: "Arroz, tipo 1, cozido", porcao_g: 100, energia_kcal: 128.26, proteina_g: 2.52, carboidrato_g: 28.06,
  lipidio_g: 0.23, fibra_g: 1.56, ...o,
});

describe("W-A P5 — regras da dieta liberada (puras)", () => {
  it("os limites são os do servidor (uma fonte só)", () => {
    expect(LIMITES_DO_DIA.extraNome).toBe(LIMITES.extraNome[1]);
    expect(LIMITES_DO_DIA.alimentoNome).toBe(LIMITES.alimentoNome[1]);
    expect(LIMITES_DO_DIA.receitaNome).toBe(LIMITES.receitaNome[1]);
    for (const k of ["gramas", "porcoesDoDia", "porcoesDaReceita", "porcaoG", "kcal", "macro", "itensDaReceita"] as const) {
      expect([...LIMITES_DO_DIA[k]], k).toEqual([...LIMITES[k]]);
    }
    expect(LIMITES_DO_DIA.termo).toBe(LIMITES.termo);
  });

  it("liberada = o dia de HOJE com a matrícula do plano da tela liberada; sem o meu_dia, travada", () => {
    expect(estadoDaDietaLivre(MEU_DIA(), "pac-1", "2026-09-30")).toEqual({ liberada: true, extra: true });
    expect(estadoDaDietaLivre(null, "pac-1", "2026-09-30")).toEqual({ liberada: false, extra: false });
    expect(estadoDaDietaLivre(MEU_DIA({ matriculas: [{ paciente_id: "pac-1", liberada: false }] }), "pac-1", "2026-09-30").liberada).toBe(false);
    expect(estadoDaDietaLivre(MEU_DIA({ pode_gravar: false }), "pac-1", "2026-09-30").liberada).toBe(false);
    // o dia virou só no aparelho (ou o servidor ainda está no de ontem): travada até reler
    expect(estadoDaDietaLivre(MEU_DIA(), "pac-1", "2026-10-01").liberada).toBe(false);
    expect(estadoDaDietaLivre(MEU_DIA(), null, "2026-09-30").liberada).toBe(false);
  });

  it("2 matrículas: segue a do plano ativo — a outra liberada não libera; a extra só quando o plano ativo é o da tela", () => {
    const dois = MEU_DIA({ matriculas: [{ paciente_id: "pac-1", liberada: false }, { paciente_id: "pac-2", liberada: true }] });
    expect(estadoDaDietaLivre(dois, "pac-1", "2026-09-30")).toEqual({ liberada: false, extra: false });
    const inverso = MEU_DIA({ matriculas: [{ paciente_id: "pac-1", liberada: true }, { paciente_id: "pac-2", liberada: false }] });
    expect(estadoDaDietaLivre(inverso, "pac-1", "2026-09-30")).toEqual({ liberada: true, extra: true });
    expect(estadoDaDietaLivre(MEU_DIA({ plano_ativo: { plano_id: "x", paciente_id: "pac-2" } }), "pac-1", "2026-09-30")).toEqual({ liberada: true, extra: false });
    const misturado = MEU_DIA({
      extras: [{ id: "e1", paciente_id: "pac-1", nome: "Lanche", horario: null, concluida_em: null }, { id: "e2", paciente_id: "pac-2", nome: "Outro", horario: null, concluida_em: null }],
      itens: [item({ id: "a" }), item({ id: "b", paciente_id: "pac-2" })],
    });
    const so = diaDaMatricula(misturado, "pac-1");
    expect(so.extras.map((e) => e.id)).toEqual(["e1"]);
    expect(so.itens.map((i) => i.id)).toEqual(["a"]);
  });

  it("o anel conta o que ele comeu: as refeições com ✓ (sem o que tirou, com o que pôs) e as extras com 'Já comi'", () => {
    const dia = MEU_DIA({
      extras: [{ id: "e1", paciente_id: "pac-1", nome: "Lanche", horario: "16:00", concluida_em: "2026-09-30T19:00:00Z" },
        { id: "e2", paciente_id: "pac-1", nome: "Ceia extra", horario: null, concluida_em: null }],
      itens: [
        item({ id: "t-aveia", tipo: "tirado", refeicao_id: "cafe", item_refeicao_id: "i-aveia", nome: "Aveia", energia_kcal: 196.91 }),
        item({ id: "p-banana", refeicao_id: "cafe" }),
        item({ id: "p-almoco", refeicao_id: "almoco", energia_kcal: 50 }),
        item({ id: "p-extra", extra_id: "e1", energia_kcal: 200, proteina_g: 10 }),
        item({ id: "p-extra2", extra_id: "e2", energia_kcal: 999 }),
      ],
    });
    const a = diaAplicado(PLANO, dia, new Set(["cafe"]));
    const r = resumoDoDiaLivre(a);
    // o plano do dia: café 218,55 + 196,91 · almoço 238,79 + 185,3 = 839,55 (a ceia sem alimento não conta)
    expect(r.total.energia_kcal).toBe(839.55);
    // o comido: café com ✓ = 218,55 (ovos; a aveia tirada) + 98,25 (a banana) · o almoço sem ✓ não conta · o lanche com "Já comi" = 200
    expect(r.marcado.energia_kcal).toBe(516.8);
    expect([r.concluidas, r.marcaveis]).toEqual([1, 2]);
    const cafe = a.refeicoes.find((x) => x.refeicao.id === "cafe")!;
    expect(totaisDaRefeicaoNoDia(cafe).energia_kcal).toBe(316.8);
    expect(linhaDaRefeicaoNoDia(cafe)).toEqual({ linha: "07:00 · Ovo · Banana", kcal: "317", mudou: true });
    expect(linhaDaExtra(a.extras[0])).toEqual({ linha: "16:00 · Banana", kcal: "200" });
    expect(linhaDaExtra({ extra: { id: "e3", nome: "Vazia", horario: null, concluida_em: null }, adicionados: [], concluida: false })).toEqual({ linha: "Nada ainda", kcal: "—" });
  });

  it("sem nada mudado, a linha da refeição é a de hoje (os mesmos nomes e kcal do plano)", () => {
    const a = diaAplicado(PLANO, MEU_DIA(), new Set());
    const almoco = a.refeicoes.find((x) => x.refeicao.id === "almoco")!;
    expect(linhaDaRefeicaoNoDia(almoco)).toEqual({ linha: `13:00 · ${resumoDaRefeicao(ALMOCO.itens)}`, kcal: "424", mudou: false });
    expect(linhaDaRefeicaoNoDia(a.refeicoes.find((x) => x.refeicao.id === "ceia")!)).toEqual({ linha: "22:00 · Sem alimentos", kcal: "—", mudou: false });
  });

  it("a quantidade do que ele põe: o alimento em gramas ou porções (a porção dele); a receita em porções", () => {
    const arroz = BUSCA({});
    expect(unidadesDe(arroz)).toEqual(["g", "porcao"]);
    expect(unidadesDe(BUSCA({ porcao_g: null }))).toEqual(["g"]);
    expect(unidadesDe(BUSCA({ tipo: "receita", porcao_g: null }))).toEqual(["porcao"]);
    expect(escolhaInicial(arroz)).toEqual({ item: arroz, quantidade: "100", unidade: "g" });
    expect(escolhaInicial(BUSCA({ tipo: "receita", id: "rc", porcao_g: null })).quantidade).toBe("1");
    const lugar = { tipo: "refeicao" as const, id: "cafe", nome: "Café da manhã" };
    expect(dadosDaEscolha(lugar, { item: arroz, quantidade: "150", unidade: "g" })).toEqual({ ok: true, dados: { refeicao_id: "cafe", alimento_id: "taco-arroz", quantidade_g: 150 } });
    expect(gramasDaEscolha({ item: BUSCA({ porcao_g: 30 }), quantidade: "1,5", unidade: "porcao" })).toBe(45);
    const meu = BUSCA({ tipo: "meu", id: "meu-pao", porcao_g: 50 });
    expect(dadosDaEscolha({ tipo: "extra", id: "e1", nome: "Lanche" }, { item: meu, quantidade: "2", unidade: "porcao" }))
      .toEqual({ ok: true, dados: { extra_id: "e1", aluno_alimento_id: "meu-pao", quantidade_g: 100 } });
    const receita = BUSCA({ tipo: "receita", id: "rc", porcao_g: null, energia_kcal: 350 });
    expect(dadosDaEscolha(lugar, { item: receita, quantidade: "0,5", unidade: "porcao" })).toEqual({ ok: true, dados: { refeicao_id: "cafe", aluno_receita_id: "rc", porcoes: 0.5 } });
    expect(dadosDaEscolha(lugar, { item: receita, quantidade: "21", unidade: "porcao" })).toEqual({ ok: false, erro: "De 0,01 a 20 porções." });
    expect(dadosDaEscolha(lugar, { item: arroz, quantidade: "0", unidade: "g" })).toEqual({ ok: false, erro: "Informe a quantidade." });
    expect(dadosDaEscolha(lugar, { item: arroz, quantidade: "10000", unidade: "g" })).toEqual({ ok: false, erro: "De 0,01 a 9.999,99 g." });
    expect(macrosDaEscolha({ item: arroz, quantidade: "200", unidade: "g" })?.energia_kcal).toBe(256.52);
    expect(macrosDaEscolha({ item: receita, quantidade: "2", unidade: "porcao" })?.energia_kcal).toBe(700);
    expect(quantidadeDoItemDoDia({ quantidade_g: 150, porcoes: null })).toBe("150 g");
    expect(quantidadeDoItemDoDia({ quantidade_g: null, porcoes: 1 })).toBe("1 porção");
    expect(quantidadeDoItemDoDia({ quantidade_g: null, porcoes: 1.5 })).toBe("1,5 porções");
  });

  it("a refeição extra: nome 1–40, horário HH:MM ou vazio, 'Já comi' ligado por padrão; criar leva o dia, mudar não", () => {
    const f = formularioDaExtra(null, new Date("2026-09-30T16:05:00-03:00"));
    expect(f).toEqual({ nome: "", horario: "16:05", ja_comi: true });
    expect(validarExtra(f)).toEqual({ campo: "nome", mensagem: "Dê um nome à refeição." });
    expect(validarExtra({ ...f, nome: "x".repeat(41) })?.campo).toBe("nome");
    expect(validarExtra({ ...f, nome: "Lanche", horario: "25:00" })?.campo).toBe("horario");
    expect(validarExtra({ ...f, nome: "  Lanche   da tarde " })).toBeNull();
    expect(dadosDaExtra({ ...f, nome: "  Lanche   da tarde " }, "2026-09-30")).toEqual({ dia: "2026-09-30", nome: "Lanche da tarde", horario: "16:05", ja_comi: true });
    expect(dadosDaExtra({ nome: "Ceia", horario: "", ja_comi: false }, null)).toEqual({ nome: "Ceia", horario: null });
    expect(formularioDaExtra({ nome: "Ceia", horario: "22:00", concluida_em: null })).toEqual({ nome: "Ceia", horario: "22:00", ja_comi: false });
  });

  it("o alimento dele: por 100 g, com a porção; vazio = 0; fora da faixa = o erro do campo", () => {
    const f = { ...formularioDoAlimento(null), nome: "Pão da padaria", energia_kcal: "280", proteina_g: "9,5" };
    expect(validarAlimento({ ...f, nome: " " })?.campo).toBe("nome");
    expect(validarAlimento({ ...f, porcao_g: "0" })?.campo).toBe("porcao_g");
    expect(validarAlimento({ ...f, energia_kcal: "1001" })).toEqual({ campo: "energia_kcal", mensagem: "De 0 a 1000 em 100 g." });
    expect(validarAlimento({ ...f, proteina_g: "101" })?.campo).toBe("proteina_g");
    expect(validarAlimento(f)).toBeNull();
    expect(dadosDoAlimento(f)).toEqual({ nome: "Pão da padaria", porcao_g: 100, energia_kcal: 280, proteina_g: 9.5, carboidrato_g: 0, lipidio_g: 0, fibra_g: 0 });
    expect(formularioDoAlimento({ id: "a", nome: "Whey", porcao_g: 30, energia_kcal: 400, proteina_g: 80, carboidrato_g: 8.5, lipidio_g: 6, fibra_g: 0,
      criado_em: "", alterado_em: "" })).toEqual({ nome: "Whey", porcao_g: "30", energia_kcal: "400", proteina_g: "80", carboidrato_g: "8,5", lipidio_g: "6", fibra_g: "0" });
  });

  it("a receita dele: ingredientes da busca (em gramas) e as porções; os macros de 1 porção; a lista só vai quando muda", () => {
    const vazia = formularioDaReceita(null);
    expect(validarReceita({ ...vazia, nome: "Vitamina" })).toEqual({ campo: "itens", mensagem: "Adicione pelo menos 1 ingrediente." });
    const banana = ingredienteDaBusca(BUSCA({ id: "taco-banana", nome: "Banana", porcao_g: 100, energia_kcal: 98, proteina_g: 1.3, carboidrato_g: 26, lipidio_g: 0.1, fibra_g: 2 }), "n0");
    const leite = { ...ingredienteDaBusca(BUSCA({ tipo: "meu", id: "meu-leite", nome: "Leite", porcao_g: 200, energia_kcal: 60, proteina_g: 3, carboidrato_g: 5, lipidio_g: 3, fibra_g: 0 }), "n1") };
    expect(leite.origem).toEqual({ aluno_alimento_id: "meu-leite" });
    expect(leite.quantidade_g).toBe("200");
    const f = { nome: "Vitamina", porcoes: "2", itens: [banana, leite], itensMudaram: true };
    expect(validarReceita({ ...f, porcoes: "1,5" })?.campo).toBe("porcoes");
    expect(validarReceita({ ...f, itens: [{ ...banana, quantidade_g: "0" }] })?.campo).toBe("itens");
    expect(validarReceita(f)).toBeNull();
    // (98 + 120) / 2 = 109 kcal a porção
    expect(macrosDaReceitaNoFormulario(f, null)?.energia_kcal).toBe(109);
    expect(dadosDaReceita(f, true)).toEqual({ nome: "Vitamina", porcoes: 2, itens: [{ alimento_id: "taco-banana", quantidade_g: 100 }, { aluno_alimento_id: "meu-leite", quantidade_g: 200 }] });
    const salva: MinhaReceita = { id: "rc", nome: "Vitamina", porcoes: 2, por_porcao: { energia_kcal: 109, proteina_g: 3.65, carboidrato_g: 18, lipidio_g: 3.05, fibra_g: 1 },
      itens: [{ id: "x1", alimento_id: "taco-banana", aluno_alimento_id: null, nome: "Banana", quantidade_g: 100 },
        { id: "x2", alimento_id: null, aluno_alimento_id: null, nome: "Leite (apagado)", quantidade_g: 200 }] };
    const ed = formularioDaReceita(salva);
    expect(ed.itens.map((i) => i.origem)).toEqual([{ alimento_id: "taco-banana" }, null]);
    // sem mexer nos ingredientes: só o nome e as porções (o servidor guarda a lista); o preview é o da receita salva
    expect(dadosDaReceita({ ...ed, nome: "Vitamina boa" }, false)).toEqual({ nome: "Vitamina boa", porcoes: 2 });
    expect(macrosDaReceitaNoFormulario(ed, salva)?.energia_kcal).toBe(109);
    expect(macrosDaReceitaNoFormulario({ ...ed, porcoes: "4" }, salva)).toBeNull();
    // mexeu: a lista inteira vai, sem o ingrediente apagado
    expect(dadosDaReceita({ ...ed, itensMudaram: true }, false)).toEqual({ nome: "Vitamina", porcoes: 2, itens: [{ alimento_id: "taco-banana", quantidade_g: 100 }] });
  });
});
