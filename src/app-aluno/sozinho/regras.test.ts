import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { estadoDaMensalidade, faixaDoAluno, inadimplente, travaDoInadimplente } from "@/financeiro/regras";
import type { ResumoMatricula } from "@/financeiro/tipos";
import { assinaturaSoNoBanco, assinaturaViva } from "../../../supabase-principal/functions/_shared/app-sem-profissional-regras";
import {
  agruparPorRefeicao,
  DIAS_SEMANA,
  diasDoGrupo,
  filtrarTreinos,
  gramas,
  grupoPrincipal,
  kcalTexto,
  linhaDoExercicio,
  mensagemApp,
  normalizarMeuPlano,
  normalizarPratos,
  OBJETIVOS,
  planoDeEscrita,
  resumoDoTreino,
  resumoDosItens,
  situacaoDoPlano,
  ultimoDiaGratis,
  type MatriculaApp,
  type TreinoPronto,
} from "./regras";

// "agora" fixo: 29/09/2026 12:00 em São Paulo (15:00 UTC); o teste grátis de quem entra hoje vai até 06/10 23:59:59 (SP)
const AGORA = new Date("2026-09-29T15:00:00Z");
const FIM_TESTE = "2026-10-07T02:59:59Z";

function matricula(p: Partial<MatriculaApp> = {}): MatriculaApp {
  return {
    paciente_id: "p1", ativo: true, plano: "app_treino", plano_nome: "Treino", valor: 29.9, modulos: ["treino"], objetivo: "emagrecer",
    teste_de: "2026-09-29T15:00:00Z", teste_ate: FIM_TESTE, pago_ate: FIM_TESTE, pausada: false, encerrada_em: null, encerrada_motivo: null,
    aguardando: false, assinatura: null, ...p,
  };
}

function resumo(p: Partial<ResumoMatricula> = {}): ResumoMatricula {
  return {
    paciente_id: "p1", conta_id: "app", conta_nome: "Physiq", recebimento_modo: "mercadopago", bloquear_inadimplente: true, tem_chave: false,
    profissional: "Physiq", mensalidade_valor: 29.9, plano_nome: "Treino", pausada: false, pago_ate: FIM_TESTE, desde: FIM_TESTE, aguardando: false,
    assinatura_ativa: false, abertas: [], aguardando_avulsas: 0, app: true, teste_ate: FIM_TESTE, plano_codigo: "app_treino", ...p,
  };
}

describe("objetivos e planos do app", () => {
  it("a lista de objetivos é a mesma dos treinos, dos pratos e do banco", () => {
    expect(OBJETIVOS.map((o) => o.id)).toEqual(["emagrecer", "manter", "ganhar_massa"]);
  });
  it("normaliza o meu_plano_app (planos com preço, matrícula e com_profissional)", () => {
    const r = normalizarMeuPlano({
      teste_dias: 7,
      planos: [{ codigo: "app_treino", nome: "Treino", valor: "29.90", modulos: ["treino"] }, { codigo: "x" }],
      matricula: { paciente_id: "p1", ativo: true, plano: "app_treino", valor: 29.9, modulos: ["treino", "lixo"], objetivo: "emagrecer", assinatura: { status: "authorized", valor: "29.9" } },
      com_profissional: false,
    });
    expect(r.planos).toEqual([{ codigo: "app_treino", nome: "Treino", valor: 29.9, modulos: ["treino"], descricao: null }]);
    expect(r.matricula?.modulos).toEqual(["treino"]);
    expect(r.matricula?.assinatura).toEqual({ status: "authorized", valor: 29.9, proximo_vencimento: null });
    expect(normalizarMeuPlano(null)).toEqual({ teste_dias: 7, planos: [], matricula: null, com_profissional: false });
  });
  it("último dia grátis de quem entra hoje = hoje + N (São Paulo)", () => {
    expect(ultimoDiaGratis(7, AGORA)).toBe("2026-10-06");
    // 23:30 em São Paulo ainda é o dia 29
    expect(ultimoDiaGratis(7, new Date("2026-09-30T02:30:00Z"))).toBe("2026-10-06");
  });
});

describe("situação do plano do app", () => {
  it("nos dias grátis: 'Grátis até 06/10'", () => {
    expect(situacaoDoPlano(matricula(), AGORA)).toMatchObject({ tipo: "teste", texto: "Grátis até 06/10", tom: "n" });
    expect(situacaoDoPlano(matricula(), new Date("2026-10-06T15:00:00Z"))).toMatchObject({ tipo: "teste", texto: "Grátis até hoje" });
  });
  it("acabou o teste sem pagar: vencido", () => {
    expect(situacaoDoPlano(matricula(), new Date("2026-10-07T15:00:00Z"))).toMatchObject({ tipo: "vencida", texto: "Teste grátis acabou", tom: "r" });
  });
  it("pagou no teste: a cobertura vai 1 mês depois do fim do teste", () => {
    expect(situacaoDoPlano(matricula({ pago_ate: "2026-11-07T02:59:59Z" }), AGORA)).toMatchObject({ tipo: "em_dia", texto: "Em dia até 06/11" });
  });
  it("isento (o master), encerrado (foi para um profissional) e aguardando", () => {
    expect(situacaoDoPlano(matricula({ pausada: true }), AGORA)?.tipo).toBe("isento");
    expect(situacaoDoPlano(matricula({ ativo: false, encerrada_motivo: "vinculou_profissional" }), AGORA)).toMatchObject({ tipo: "encerrada", texto: "Com o seu profissional" });
    expect(situacaoDoPlano(matricula({ aguardando: true }), AGORA)?.tipo).toBe("aguardando");
    expect(situacaoDoPlano(null)).toBeNull();
  });
});

describe("mensalidade do app na cobrança da W6 (faixa, trava e chip)", () => {
  it("nos dias grátis é 'teste' (não é inadimplente) e a faixa é a violeta com Assinar", () => {
    const e = estadoDaMensalidade({ valor: 29.9, pausada: false, pago_ate: FIM_TESTE, desde: FIM_TESTE, teste_ate: FIM_TESTE }, AGORA);
    expect(e.situacao).toBe("teste");
    expect(inadimplente(resumo(), AGORA)).toBe(false);
    const f = faixaDoAluno([resumo()], AGORA);
    expect(f).toMatchObject({ tom: "t", titulo: "Seus dias grátis vão até 06/10", subtitulo: "Depois, R$ 29,90/mês · Pix ou cartão", acao: "Assinar", podePagar: true });
    expect(faixaDoAluno([resumo()], new Date("2026-10-06T15:00:00Z"))?.titulo).toBe("Seu teste grátis termina hoje");
  });
  it("acabou o teste sem pagar: vencida → a conta do app bloqueia (R15) e a faixa fica vermelha", () => {
    const depois = new Date("2026-10-07T12:00:00Z");
    expect(inadimplente(resumo(), depois)).toBe(true);
    expect(travaDoInadimplente(resumo(), depois)).toBe(true);
    expect(faixaDoAluno([resumo()], depois)?.tom).toBe("r");
    // o último dia grátis ainda não trava
    expect(travaDoInadimplente(resumo(), new Date("2026-10-07T02:30:00Z"))).toBe(false);
  });
  it("pagou: em dia, sem trava", () => {
    const r = resumo({ pago_ate: "2026-11-07T02:59:59Z" });
    expect(estadoDaMensalidade({ valor: 29.9, pausada: false, pago_ate: r.pago_ate, desde: r.desde, teste_ate: r.teste_ate }, AGORA).situacao).toBe("em_dia");
    expect(travaDoInadimplente(r, new Date("2026-10-20T12:00:00Z"))).toBe(false);
  });
  it("matrícula de profissional (sem teste) segue a régua da W6", () => {
    const e = estadoDaMensalidade({ valor: 249, pausada: false, pago_ate: "2026-10-02T12:00:00Z", desde: null }, AGORA);
    expect(e.situacao).toBe("vence_em_breve");
  });
});

// ───────────────────────── treinos prontos ─────────────────────────

const EX = (id: string, nome: string, gm: string, tipo = "musculacao") => ({ id, nome, grupo_muscular: gm, imagem_url: null, tipo });

function treino(p: Partial<TreinoPronto> = {}): TreinoPronto {
  return {
    id: "t1", codigo: "emagrecer-iniciante", nome: "Primeiros passos", objetivo: "emagrecer", nivel: "iniciante", dias_por_semana: 3,
    divisao: "A · B · C", descricao: null, ordem: 1,
    grupos: [
      {
        id: "gB", letra: "B", nome: "Treino B · Corpo todo", dias: ["QUA"], ordem: 2,
        exercicios: [{ exercicio_id: "e3", ordem: 1, series: 3, reps: "12", descanso_segundos: 45, observacao: null, exercicio: EX("e3", "Remada", "Dorsal") }],
      },
      {
        id: "gA", letra: "A", nome: "Treino A · Corpo todo", dias: ["SEX", "SEG"], ordem: 1,
        exercicios: [
          { exercicio_id: "e2", ordem: 2, series: 3, reps: "12", descanso_segundos: 45, observacao: null, exercicio: EX("e2", "Supino", "Peitoral") },
          { exercicio_id: "e1", ordem: 1, series: 3, reps: "15", descanso_segundos: 45, observacao: null, exercicio: EX("e1", "Leg Press", "Quadríceps / Glúteo") },
          { exercicio_id: "e9", ordem: 3, series: 1, reps: "20 min", descanso_segundos: null, observacao: "Ritmo leve", exercicio: EX("e9", "Corrida", "Corrida", "corrida") },
        ],
      },
    ],
    ...p,
  };
}

describe("treinos prontos", () => {
  it("filtra pelo objetivo e nível e ordena por nível", () => {
    const l = [treino({ codigo: "a", nivel: "avancado", ordem: 3 }), treino({ codigo: "b", nivel: "iniciante" }), treino({ codigo: "c", objetivo: "manter" })];
    expect(filtrarTreinos(l, "emagrecer").map((t) => t.codigo)).toEqual(["b", "a"]);
    expect(filtrarTreinos(l, "emagrecer", "avancado").map((t) => t.codigo)).toEqual(["a"]);
  });
  it("textos: dias, resumo, linha do exercício (corrida = o tempo) e o grupo principal (foto)", () => {
    expect(diasDoGrupo(["SEX", "SEG"])).toBe("Seg · Sex");
    expect(resumoDoTreino(treino())).toBe("3x por semana · A · B · C");
    expect(linhaDoExercicio(treino().grupos[1].exercicios[1])).toBe("3 × 15 · 45 s");
    expect(linhaDoExercicio(treino().grupos[1].exercicios[2])).toBe("20 min");
    expect(grupoPrincipal(treino().grupos[1])).toBe("Quadríceps");
  });
  it("vira o treino do aluno: a semana antiga sai; treinos próprios, exercícios, séries e dias entram (1 treino por dia, extra = 0)", () => {
    let n = 0;
    const { operacoes, grupos } = planoDeEscrita(treino(), "u1", [{ id: "s-antiga" }], { novoId: () => `id${++n}`, agora: "2026-09-29T15:00:00Z" });
    expect(operacoes[0]).toEqual({ sql: "DELETE FROM tb_semana_treinos WHERE id = ? AND user_id = ?", params: ["s-antiga", "u1"] });
    // A primeiro (ordem), com os exercícios na ordem
    expect(grupos.map((g) => g.nome)).toEqual(["Treino A · Corpo todo", "Treino B · Corpo todo"]);
    const insercoes = operacoes.filter((o) => o.sql.startsWith("INSERT INTO tb_grupos_exercicios_usuario")).map((o) => o.params[3]);
    expect(insercoes).toEqual(["e1", "e2", "e9", "e3"]);
    const series = operacoes.filter((o) => o.sql.startsWith("INSERT INTO tb_series_padrao_usuario"));
    expect(series[0].params.slice(4, 8)).toEqual([3, "15", 45, null]);
    expect(series.every((o) => o.params[0] && o.params[1] === "u1")).toBe(true);
    const semana = operacoes.filter((o) => o.sql.startsWith("INSERT INTO tb_semana_treinos"));
    expect(semana.map((o) => o.params[2])).toEqual(["SEG", "SEX", "QUA"]);
    expect(semana.every((o) => o.sql.includes("extra") && o.sql.endsWith("0, 0)"))).toBe(true);
    expect(operacoes.every((o) => o.params.includes("u1"))).toBe(true);
  });
  it("séries fora de 1..10 são ajustadas (a regra do banco)", () => {
    const t = treino({ grupos: [{ id: "g", letra: "A", nome: "Treino A", dias: ["SEG"], ordem: 1, exercicios: [{ exercicio_id: "e", ordem: 1, series: 14, reps: "10", descanso_segundos: 60, observacao: null, exercicio: null }] }] });
    const { operacoes } = planoDeEscrita(t, "u", [], { novoId: () => "x", agora: "a" });
    expect(operacoes.find((o) => o.sql.startsWith("INSERT INTO tb_series_padrao_usuario"))?.params[4]).toBe(10);
  });
});

// ───────────────────────── pratos prontos ─────────────────────────

describe("pratos prontos", () => {
  const bruto = {
    ok: true, objetivo: "emagrecer", objetivo_do_aluno: "emagrecer",
    pratos: [
      { id: "1", codigo: "j", nome: "Jantar leve", refeicao: "jantar", objetivos: ["emagrecer"], itens: [{ nome: "Ovo", quantidade_g: "100", kcal: "143.1" }], kcal: 289, proteina_g: 15.7 },
      { id: "2", codigo: "c", nome: "Café", refeicao: "cafe_da_manha", objetivos: ["emagrecer", "x"], itens: [{ nome: "Ovo" }, { nome: "Pão" }, { nome: "Mamão" }, { nome: "Café" }], kcal: 269 },
    ],
  };
  it("normaliza e agrupa por refeição na ordem do dia", () => {
    const r = normalizarPratos(bruto);
    expect(r.ok).toBe(true);
    expect(r.pratos[1].objetivos).toEqual(["emagrecer"]);
    expect(r.pratos[0].itens[0]).toMatchObject({ nome: "Ovo", quantidade_g: 100, kcal: 143.1 });
    expect(agruparPorRefeicao(r.pratos).map((g) => g.rotulo)).toEqual(["Café da manhã", "Jantar"]);
  });
  it("erro do banco vira a frase da tela", () => {
    const r = normalizarPratos({ ok: false, erro: "sem_plano_alimentacao" });
    expect(r.ok).toBe(false);
    expect(mensagemApp(r.erro)).toBe("Os pratos prontos estão no plano Treino + Alimentação.");
    expect(mensagemApp("nao_existe")).toBe("Não deu certo agora. Tente de novo.");
  });
  it("textos: itens resumidos, gramas e kcal", () => {
    const r = normalizarPratos(bruto);
    expect(resumoDosItens(r.pratos[1].itens)).toBe("Ovo · Pão · Mamão · +1");
    expect(gramas(12)).toBe("12 g");
    expect(gramas(12.46)).toBe("12,5 g");
    expect(kcalTexto(1480.4)).toBe("1.480");
  });
});

// ───────────────────────── servidor (_shared/app-sem-profissional-regras.ts) ─────────────────────────

describe("assinatura do app quando o aluno vai para um profissional", () => {
  it("assinatura simulada do staging cancela só no banco; as vivas são authorized/pending/paused", () => {
    expect(assinaturaSoNoBanco({ mp_preapproval_id: "sim-1", payload: null })).toBe(true);
    expect(assinaturaSoNoBanco({ mp_preapproval_id: "abc", payload: { simulada: true } })).toBe(true);
    expect(assinaturaSoNoBanco({ mp_preapproval_id: "abc", payload: {} })).toBe(false);
    expect(["authorized", "pending", "paused", "cancelled", null].map(assinaturaViva)).toEqual([true, true, true, false, false]);
  });
});

// ───────────────────────── conteúdo (os arquivos de carga) ─────────────────────────

describe("conteúdo dos treinos e pratos prontos (scripts/conteudo)", () => {
  const raiz = resolve(__dirname, "../../../scripts/conteudo");
  const treinos = JSON.parse(readFileSync(resolve(raiz, "treinos_prontos.json"), "utf-8")) as { treinos: Array<{ codigo: string; objetivo: string; nivel: string; dias_por_semana: number; grupos: Array<{ letra: string; dias: string[]; exercicios: Array<{ exercicio: string; series: number; reps: string }> }> }> };
  const pratos = JSON.parse(readFileSync(resolve(raiz, "pratos_prontos.json"), "utf-8")) as { pratos: Array<{ codigo: string; refeicao: string; objetivos: string[]; itens: Array<{ taco: string; gramas: number }> }> };
  it("9 treinos: 3 objetivos × 3 níveis, dias da semana batendo com os dias por semana", () => {
    expect(treinos.treinos).toHaveLength(9);
    for (const o of OBJETIVOS) for (const n of ["iniciante", "intermediario", "avancado"]) expect(treinos.treinos.filter((t) => t.objetivo === o.id && t.nivel === n)).toHaveLength(1);
    for (const t of treinos.treinos) {
      const dias = t.grupos.flatMap((g) => g.dias);
      expect(dias.length, t.codigo).toBe(t.dias_por_semana);
      expect(new Set(dias).size, t.codigo).toBe(dias.length);
      expect(dias.every((d) => (DIAS_SEMANA as readonly string[]).includes(d)), t.codigo).toBe(true);
      expect(t.grupos.every((g) => g.exercicios.length >= 4 && g.exercicios.every((e) => e.series >= 1 && e.series <= 10 && e.reps)), t.codigo).toBe(true);
    }
    expect(new Set(treinos.treinos.map((t) => t.codigo)).size).toBe(9);
  });
  it("24 pratos: 2 por refeição (café, almoço, lanche, jantar) para cada objetivo, itens da TACO", () => {
    expect(pratos.pratos).toHaveLength(24);
    for (const o of OBJETIVOS) {
      for (const r of ["cafe_da_manha", "almoco", "lanche", "jantar"]) {
        expect(pratos.pratos.filter((p) => p.objetivos.includes(o.id) && p.refeicao === r), `${o.id}/${r}`).toHaveLength(2);
      }
    }
    expect(pratos.pratos.every((p) => p.itens.length >= 3 && p.itens.every((i) => /^taco:\d+$/.test(i.taco) && i.gramas > 0))).toBe(true);
    expect(new Set(pratos.pratos.map((p) => p.codigo)).size).toBe(24);
  });
});
