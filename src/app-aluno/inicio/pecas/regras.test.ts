import { describe, expect, it } from "vitest";
import { planoAtivo, refeicoesDoDia, resumoDoDia, fracao } from "@/nutricao/app/dia";
import { metasDoDia } from "@/nutricao/app/metasUtil";
import type { DadosDieta, Meta, PlanoAlimentar } from "@/nutricao/app/tipos";
import {
  dietaDeHoje,
  estimarDuracaoMin,
  metasDeHoje,
  primeiroNome,
  profissionalDaConsulta,
  resumoDaSemana,
  rotuloDoTreino,
  saudacao,
  textoDoPeriodo,
  tomDaConsulta,
  type DiaDaSemana,
} from "./regras";

const dia = (treinos: number, feitos: number, algumFeito = false): DiaDaSemana => ({
  treinos: Array.from({ length: treinos }, (_, i) => ({ concluido: i < feitos })),
  feito: treinos > 0 && feitos === treinos,
  algumFeito,
});

describe("Início — saudação", () => {
  it("bom dia / boa tarde / boa noite pela hora do aparelho", () => {
    expect(saudacao(new Date(2026, 8, 30, 5, 0))).toBe("Bom dia");
    expect(saudacao(new Date(2026, 8, 30, 11, 59))).toBe("Bom dia");
    expect(saudacao(new Date(2026, 8, 30, 12, 0))).toBe("Boa tarde");
    expect(saudacao(new Date(2026, 8, 30, 17, 59))).toBe("Boa tarde");
    expect(saudacao(new Date(2026, 8, 30, 18, 0))).toBe("Boa noite");
    expect(saudacao(new Date(2026, 8, 30, 4, 59))).toBe("Boa noite");
  });
  it("primeiro nome (e-mail vira a parte antes do @)", () => {
    expect(primeiroNome("Diego Almeida")).toBe("Diego");
    expect(primeiroNome("  rafael moura ")).toBe("Rafael");
    expect(primeiroNome("teste@teste.com")).toBe("Teste");
    expect(primeiroNome(null)).toBe("");
  });
});

describe("Início — treino de hoje (C15)", () => {
  it("'N de M na semana' = os dias feitos da faixa da aba Treino sobre os dias com treino (conta DIAS)", () => {
    // Seg feito · Ter feito (2 treinos, 1 feito → conta como dia feito, a regra do '· N feitos') · Qua hoje · Qui · Sex · Sáb/Dom livres
    const semana = [dia(1, 1), dia(2, 1, true), dia(1, 0), dia(1, 0), dia(1, 0), dia(0, 0), dia(0, 0)];
    expect(resumoDaSemana(semana)).toEqual({ feitos: 2, total: 5 });
    // a MESMA conta do "· N feitos" da FaixaSemana: dias com feito || algumFeito
    expect(semana.filter((d) => d.feito || d.algumFeito).length).toBe(2);
  });
  it("dia feito sem treino marcado (treino tirado depois) conta nos 2 lados; semana vazia = 0 de 0", () => {
    expect(resumoDaSemana([{ treinos: [], feito: false, algumFeito: true }, dia(1, 0)])).toEqual({ feitos: 1, total: 2 });
    expect(resumoDaSemana([dia(0, 0), dia(0, 0)])).toEqual({ feitos: 0, total: 0 });
  });
  it("duração estimada: séries × 45 s + descanso entre as séries + 1 min por exercício, arredondada a 5 min", () => {
    // 5 exercícios × 3 séries, descanso 120 s: 15 × 45 + 14 × 120 + 5 × 60 = 2655 s = 44,25 min → 45
    expect(estimarDuracaoMin(Array.from({ length: 5 }, () => ({ series: 3, descansoSeg: 120 })))).toBe(45);
    // 5 × 4 séries com 90 s (a tela 1): 20 × 45 + 19 × 90 + 300 = 2910 s = 48,5 min → 50
    expect(estimarDuracaoMin(Array.from({ length: 5 }, () => ({ series: 4, descansoSeg: 90 })))).toBe(50);
    expect(estimarDuracaoMin([{ series: 1, descansoSeg: 60 }])).toBe(5);
    expect(estimarDuracaoMin([])).toBeNull();
    expect(estimarDuracaoMin([{ series: 0, descansoSeg: 60 }])).toBeNull();
  });
  it("o chip da aba Treino vira a linha do card", () => {
    expect(rotuloDoTreino("TREINO A")).toBe("Treino A");
    expect(rotuloDoTreino("MEU TREINO")).toBe("Meu treino");
    expect(rotuloDoTreino("TREINO EXTRA")).toBe("Treino extra");
  });
});

// ───────────── dieta: a mesma conta da aba Dieta ─────────────
const alimento = (id: string, kcal: number) => ({ id, nome: id, fonte: "taco", energia_kcal: kcal, proteina_g: 10, carboidrato_g: 20, lipidio_g: 5, fibra_g: 1, sodio_mg: 0 });
const item = (id: string, kcal: number, g = 100) => ({
  id: `i-${id}`, alimento_id: id, quantidade_g: g, medida_caseira_id: null, quantidade_medida: null, ordem: 0, substitutos: [], observacao: null,
  created_at: "2026-09-01T00:00:00Z", alimento: alimento(id, kcal),
});
const refeicao = (id: string, nome: string, ordem: number, itens: ReturnType<typeof item>[], dias: number[] = []) => ({
  id, nome, horario: `0${ordem + 7}:00`, ordem, observacao: null, dias_semana: dias, itens,
});
const plano = (id: string, favorito: boolean, criado: string, refeicoes: ReturnType<typeof refeicao>[]): PlanoAlimentar => ({
  id, paciente_id: "p1", nutricionista_id: "n1", titulo: id, metodo: "alimentos", kcal_alvo: null, observacao: null, favorito,
  created_at: criado, updated_at: criado, refeicoes,
});

describe("Início — dieta de hoje (N-48, NF5)", () => {
  // quarta 30/09/2026 = 3 (ISO)
  const hoje = "2026-09-30";
  const atual = plano("atual", true, "2026-09-20T10:00:00Z", [
    refeicao("r1", "Café da manhã", 0, [item("pao", 300), item("ovo", 150)]),
    refeicao("r2", "Almoço", 1, [item("arroz", 400), item("frango", 300)]),
    refeicao("r3", "Jantar", 2, [item("peixe", 350)]),
    refeicao("r4", "Ceia de sábado", 3, [item("iogurte", 120)], [6]), // não vale na quarta (NF3)
    refeicao("r5", "Lanche sem alimento", 4, []),
  ]);
  const antigo = plano("antigo", false, "2026-09-25T10:00:00Z", [refeicao("x1", "Café antigo", 0, [item("x", 999)])]);
  const dados: Pick<DadosDieta, "planos" | "refeicoes_concluidas"> = { planos: [antigo, atual], refeicoes_concluidas: ["r1", "r3", "x1"] };

  it("kcal marcadas / do dia e 'N de M refeições' iguais ao topo da aba Dieta (plano atual, refeições de hoje, ✓ de hoje)", () => {
    const h = dietaDeHoje(dados, hoje);
    // o que a aba Dieta calcula (Dieta.tsx): planoAtivo → refeicoesDoDia → resumoDoDia com os ✓
    const p = planoAtivo(dados.planos)!;
    const r = resumoDoDia(refeicoesDoDia(p, hoje), new Set(dados.refeicoes_concluidas));
    expect(h.plano?.id).toBe("atual");
    expect(h.resumo).toEqual(r);
    expect(h.refeicoes.map((x) => x.id)).toEqual(["r1", "r2", "r3", "r5"]);
    expect(h.resumo.concluidas).toBe(2);
    expect(h.resumo.marcaveis).toBe(3);
    expect(h.resumo.marcado.energia_kcal).toBe(800);
    expect(h.resumo.total.energia_kcal).toBe(1500);
    expect(h.fracaoKcal).toBe(fracao(800, 1500));
    expect(h.pct).toBe(53);
  });
  it("sem dados / sem plano: zeros (o card mostra o vazio)", () => {
    expect(dietaDeHoje(null, hoje).plano).toBeNull();
    expect(dietaDeHoje({ planos: [], refeicoes_concluidas: [] }, hoje).resumo.marcaveis).toBe(0);
  });
});

describe("Início — metas de hoje (NF4)", () => {
  const meta = (id: string, dias: number[], ativa = true, inicio: string | null = null, criado = "2026-09-01T00:00:00Z"): Meta => ({
    id, paciente_id: "p1", titulo: id, descricao: null, dias_semana: dias, ativa, inicio, created_at: criado,
  });
  it("as metas de hoje = a lista 'Hoje' da folha das metas (ativas, com o dia, já começadas), com o ✓", () => {
    const metas = [
      meta("agua", [1, 2, 3, 4, 5, 6, 7], true, null, "2026-09-01T00:00:01Z"),
      meta("fruta", [3], true, null, "2026-09-01T00:00:02Z"),
      meta("sabado", [6]),
      meta("pausada", [3], false),
      meta("futura", [3], true, "2026-10-05"),
    ];
    const r = metasDeHoje(metas, ["fruta", "sabado"], "2026-09-30");
    expect(r.metas.map((m) => m.id)).toEqual(metasDoDia(metas, "2026-09-30").map((m) => m.id));
    expect(r.metas.map((m) => [m.id, m.feita])).toEqual([["agua", false], ["fruta", true]]);
    expect(r.feitas).toBe(1);
  });
});

describe("Início — próxima consulta e peso", () => {
  it("cor do chip pelo papel (verde nutrição, violeta treino)", () => {
    expect(tomDaConsulta("nutricionista")).toBe("n");
    expect(tomDaConsulta("personal")).toBe("t");
    expect(tomDaConsulta(null)).toBe("c");
  });
  it("a foto do profissional da consulta vem de 'Meus profissionais' (mesmo papel e nome)", () => {
    const profs = [
      { papel: "personal", nome: "Lucas Ferreira", foto_url: "l.jpg" },
      { papel: "nutricionista", nome: "Camila Rocha", foto_url: "c.jpg" },
    ];
    expect(profissionalDaConsulta(profs, { papel: "nutricionista", profissional: "Camila Rocha" })?.foto_url).toBe("c.jpg");
    expect(profissionalDaConsulta(profs, { papel: "personal", profissional: "Outro nome" })?.foto_url).toBe("l.jpg");
    expect(profissionalDaConsulta([...profs, { papel: "personal", nome: "Ana", foto_url: "a.jpg" }], { papel: "personal", profissional: "Zé" })).toBeNull();
    expect(profissionalDaConsulta(null, { papel: "personal", profissional: "x" })).toBeNull();
  });
  it("o período do peso é o de abertura da Evolução", () => {
    expect(textoDoPeriodo("6m")).toBe("em 6 meses");
    expect(textoDoPeriodo("1a")).toBe("em 1 ano");
    expect(textoDoPeriodo("3m")).toBe("em 3 meses");
  });
});
