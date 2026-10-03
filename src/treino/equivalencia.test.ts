import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BLOCOS_MUSCULARES } from "@/lib/gruposMusculares";
import { CABECALHO_CSV, CATALOGO_81, RAIZ_REPO, exercicio81 } from "@/test/catalogoEquivalencia";
import {
  EQUIPAMENTOS,
  PADROES,
  descricaoCurta,
  ehEquivalente,
  ehMesmoMusculo,
  gravarEquipamentos,
  lerEquipamentos,
  montarGruposTroca,
  musculosDoSubgrupo,
  temNaAcademia,
  type ExercicioEquivalencia,
} from "./equivalencia";

const raiz = RAIZ_REPO;
const CABECALHO = CABECALHO_CSV;
/** Os 81 globais como o app os lê do SQLite (grupo_muscular/subgrupo do banco + a classificação da W9). */
const CATALOGO: ExercicioEquivalencia[] = CATALOGO_81;
const ex = exercicio81;
const nomes = (lista: { exercicio: { nome: string } }[]) => lista.map((o) => o.exercicio.nome);

describe("listas fixas (spec §8)", () => {
  it("os 11 equipamentos da spec, nessa ordem", () => {
    expect(EQUIPAMENTOS.map((e) => e.rotulo)).toEqual([
      "Barra", "Halteres", "Polia (cabo)", "Máquina", "Smith", "Peso corporal", "Elástico", "Kettlebell", "Anilha", "Suspensão", "Cardio",
    ]);
    expect(new Set(EQUIPAMENTOS.map((e) => e.chave)).size).toBe(11);
  });

  it("movimentos com chave única e grupo muscular que existe no app", () => {
    const chaves = PADROES.map((p) => p.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    const blocos = new Set(BLOCOS_MUSCULARES.map((b) => b.key));
    for (const p of PADROES) expect(blocos.has(p.bloco), p.chave).toBe(true);
  });
});

describe("equipamentos da academia (text[] no Postgres, JSON no SQLite)", () => {
  it("lê JSON, o literal do Postgres e a lista; ignora lixo, repetição e chave desconhecida", () => {
    expect(lerEquipamentos('["barra","halteres"]')).toEqual(["barra", "halteres"]);
    expect(lerEquipamentos("{polia,maquina}")).toEqual(["polia", "maquina"]);
    expect(lerEquipamentos('{"peso_corporal"}')).toEqual(["peso_corporal"]);
    expect(lerEquipamentos(["smith", "smith", "trampolim"])).toEqual(["smith"]);
    expect(lerEquipamentos(null)).toEqual([]);
    expect(lerEquipamentos("")).toEqual([]);
    expect(lerEquipamentos("[quebrado")).toEqual([]);
    expect(lerEquipamentos("[]")).toEqual([]);
  });

  it("grava JSON na ordem da lista fixa; nada marcado = NULL (sem filtro)", () => {
    expect(gravarEquipamentos(["polia", "barra"])).toBe('["barra","polia"]');
    expect(gravarEquipamentos([])).toBeNull();
    expect(lerEquipamentos(gravarEquipamentos(["cardio", "halteres"]))).toEqual(["halteres", "cardio"]);
  });

  it("sem filtro (ou exercício sem equipamento cadastrado) nunca fica de fora", () => {
    expect(temNaAcademia(ex("Cross-over na Polia"), [])).toBe(true);
    expect(temNaAcademia(ex("Cross-over na Polia"), null)).toBe(true);
    expect(temNaAcademia(ex("Cross-over na Polia"), ["halteres"])).toBe(false);
    expect(temNaAcademia({ id: "p1", nome: "Meu", grupo_muscular: "Peitoral", isPessoal: true }, ["halteres"])).toBe(true);
  });
});

describe("músculo principal do subgrupo", () => {
  it("1º músculo citado, sem os parênteses, com os nomes do catálogo", () => {
    expect(musculosDoSubgrupo("Peitoral médio (esternal) · tríceps · deltoide anterior")).toEqual(["peitoral", "triceps", "deltoide"]);
    expect(musculosDoSubgrupo("Latíssimo do dorso · romboides · bíceps")).toEqual(["dorsal", "costas_media", "biceps"]);
    expect(musculosDoSubgrupo("Trapézio superior · elevador da escápula")).toEqual(["trapezio_superior"]);
    expect(musculosDoSubgrupo("Isquiotibiais (semitendíneo · semimembranáceo · bíceps femoral)")).toEqual(["isquiotibiais"]);
    expect(musculosDoSubgrupo("Braquial · braquiorradial · bíceps")).toEqual(["biceps"]);
    expect(musculosDoSubgrupo(null)).toEqual([]);
  });
});

describe("a regra da troca (os 81 de verdade, classificados no CSV)", () => {
  it("o exemplo do pedido: rosca martelo na polia sugere rosca martelo com halteres (e o contrário)", () => {
    const g = montarGruposTroca(ex("Rosca Martelo na Polia"), CATALOGO);
    expect(nomes(g.equivalentes)[0]).toBe("Rosca Martelo com Halteres");
    expect(ehEquivalente(ex("Rosca Martelo com Halteres"), ex("Rosca Martelo na Polia"))).toBe(true);
    // outra rosca é "mesmo músculo", não equivalente
    expect(nomes(g.equivalentes)).not.toContain("Rosca Direta com Barra");
    expect(nomes(g.mesmoMusculo)).toContain("Rosca Direta com Barra");
  });

  it("com 'polia' desmarcada na academia, a opção com polia vai para o fim, marcada 'não tem na sua academia'", () => {
    const semPolia = ["barra", "halteres", "maquina", "peso_corporal"];
    const g = montarGruposTroca(ex("Crucifixo na Máquina"), CATALOGO, { equipamentosAcademia: semPolia });
    expect(nomes(g.equivalentes)).toEqual(["Crucifixo com Halteres", "Cross-over na Polia"]);
    expect(g.equivalentes.map((o) => o.semNaAcademia)).toEqual([false, true]);

    const martelo = montarGruposTroca(ex("Rosca Martelo com Halteres"), CATALOGO, { equipamentosAcademia: semPolia });
    expect(martelo.equivalentes.at(-1)).toMatchObject({ exercicio: { nome: "Rosca Martelo na Polia" }, semNaAcademia: true });

    // sem marcar nada = sem filtro: ninguém apagado
    const livre = montarGruposTroca(ex("Crucifixo na Máquina"), CATALOGO, { equipamentosAcademia: [] });
    expect(livre.equivalentes.every((o) => !o.semNaAcademia)).toBe(true);
    expect(nomes(livre.equivalentes)).toEqual(["Cross-over na Polia", "Crucifixo com Halteres"]);
  });

  it("equivalentes de outro equipamento primeiro; a outra variação no mesmo equipamento depois", () => {
    const g = montarGruposTroca(ex("Supino Reto na Máquina Sentado"), CATALOGO);
    expect(nomes(g.equivalentes)).toEqual(["Flexão de Braço", "Supino Reto com Barra", "Supino Reto com Halteres", "Supino Reto na Máquina Deitado"]);
    expect(g.equivalentes.at(-1)?.mesmoEquipamento).toBe(true);
  });

  it("grupo muscular = o bloco do app ('Costas' × 'Dorsal / Bíceps'): puxada ≈ barra fixa", () => {
    expect(ehEquivalente(ex("Puxada Frontal"), ex("Barra Fixa"))).toBe(true);
    const g = montarGruposTroca(ex("Barra Fixa"), CATALOGO);
    expect(g.equivalentes.every((o) => o.exercicio.padrao_movimento === "puxada_vertical")).toBe(true);
    expect(nomes(g.mesmoMusculo)).toContain("Remada Curvada com Barra");
    // encolhimento (trapézio superior) não é "mesmo músculo" da puxada
    expect(nomes(g.mesmoMusculo)).not.toContain("Encolhimento com Halteres");
  });

  it("mesmo músculo: mesmo grupo e subgrupo, outro movimento; quem sai e os equivalentes não entram", () => {
    const g = montarGruposTroca(ex("Supino Reto com Barra"), CATALOGO);
    const mm = nomes(g.mesmoMusculo);
    expect(mm).toEqual(expect.arrayContaining(["Crucifixo com Halteres", "Cross-over na Polia", "Supino Inclinado com Barra", "Supino Declinado na Máquina"]));
    expect(mm).not.toContain("Supino Reto com Barra");
    for (const n of nomes(g.equivalentes)) expect(mm).not.toContain(n);
    expect(mm.some((n) => n.startsWith("Tríceps"))).toBe(false);
    expect(ehMesmoMusculo(ex("Agachamento Sumô com Halteres"), ex("Afundo com Halteres"))).toBe(true);
  });

  it("todos = a lista inteira (os 81), em ordem alfabética", () => {
    const g = montarGruposTroca(ex("Leg Press 45°"), CATALOGO);
    expect(g.todos).toHaveLength(81);
    expect(g.todos[0].nome.localeCompare(g.todos[1].nome, "pt-BR")).toBeLessThan(0);
  });

  it("exercício próprio sem classificação: sem equivalentes, mas aparece em 'mesmo músculo' do grupo; e vale o original como referência", () => {
    const meu: ExercicioEquivalencia = { id: "meu1", nome: "Flexão com pausa", grupo_muscular: "Peitoral", isPessoal: true };
    const catalogo = [...CATALOGO, meu];
    expect(montarGruposTroca(meu, catalogo).equivalentes).toHaveLength(0);
    expect(nomes(montarGruposTroca(ex("Crucifixo com Halteres"), catalogo).mesmoMusculo)).toContain("Flexão com pausa");
    // o da tela (próprio) entrou no lugar do supino: a troca usa o original para sugerir
    const g = montarGruposTroca(meu, catalogo, { origem: ex("Supino Reto com Barra") });
    expect(g.referencia.nome).toBe("Supino Reto com Barra");
    expect(nomes(g.equivalentes)).toContain("Supino Reto com Halteres");
    expect(nomes(g.equivalentes)).toContain("Supino Reto com Barra"); // voltar ao original também é opção
  });

  it("id igual em tabelas diferentes (global × próprio) não se confunde; o grupo 'Outros' não gera equivalente", () => {
    const a: ExercicioEquivalencia = { id: "x", nome: "A", grupo_muscular: "Peitoral", padrao_movimento: "crucifixo", equipamento: "polia" };
    const b: ExercicioEquivalencia = { ...a, nome: "B", isPessoal: true, equipamento: "elastico" };
    expect(ehEquivalente(a, b)).toBe(true);
    const c: ExercicioEquivalencia = { id: "c", nome: "C", grupo_muscular: "Qualquer coisa", padrao_movimento: "crucifixo" };
    expect(ehEquivalente(c, { ...c, id: "d", nome: "D" })).toBe(false);
  });

  it("descrição curta: equipamento e variação (com o movimento na lista do mesmo músculo)", () => {
    expect(descricaoCurta(ex("Rosca Martelo com Halteres"))).toBe("Halteres · pegada neutra");
    expect(descricaoCurta(ex("Crucifixo na Máquina"), true)).toBe("Crucifixo e cross-over · Máquina · voador, sentado");
  });
});

describe("a classificação dos 81 (docs/exercicios-equivalencia.csv) e a migração", () => {
  const padroes = new Set<string>(PADROES.map((p) => p.chave));
  const equipamentos = new Set<string>(EQUIPAMENTOS.map((e) => e.chave));
  const migracao = readFileSync(resolve(raiz, "supabase/migrations/20260930060000_w09_classificacao_81.sql"), "utf8");

  it("81 linhas, ids únicos, movimento e equipamento preenchidos e das listas fixas", () => {
    expect(CABECALHO).toEqual(["id", "nome", "grupo", "subgrupo", "padrao_movimento", "equipamento", "variacao"]);
    expect(CATALOGO).toHaveLength(81);
    expect(new Set(CATALOGO.map((e) => e.id)).size).toBe(81);
    for (const e of CATALOGO) {
      expect(padroes.has(e.padrao_movimento!), `${e.nome}: ${e.padrao_movimento}`).toBe(true);
      expect(equipamentos.has(e.equipamento!), `${e.nome}: ${e.equipamento}`).toBe(true);
    }
  });

  it("a migração é a do CSV (mesmos valores), idempotente e só mexe nas 3 colunas dos globais", () => {
    for (const e of CATALOGO) {
      const tupla = `('${e.id}', '${e.padrao_movimento}', '${e.equipamento}', ${e.variacao ? `'${e.variacao.replace(/'/g, "''")}'` : "null"})`;
      expect(migracao, e.nome).toContain(tupla);
    }
    expect(migracao).toContain("SET padrao_movimento = v.padrao, equipamento = v.equipamento, variacao = v.variacao");
    expect(migracao).toContain("AND e.professor_id IS NULL");
    expect(migracao).toContain("IS DISTINCT FROM");
    expect(migracao).toContain("ARRAY['public','staging']");
    expect(migracao).not.toMatch(/SET[^;]*\b(nome|grupo_muscular|subgrupo|imagem_url)\s*=/);
  });

  it("os 9 treinos prontos da W7b só usam exercícios classificados", () => {
    const prontos = JSON.parse(readFileSync(resolve(raiz, "scripts/conteudo/treinos_prontos.json"), "utf8")) as {
      treinos: { grupos: { exercicios: { exercicio: string }[] }[] }[];
    };
    const usados = new Set(prontos.treinos.flatMap((t) => t.grupos.flatMap((g) => g.exercicios.map((x) => x.exercicio))));
    expect(usados.size).toBe(65);
    const classificados = new Set(CATALOGO.map((e) => e.nome));
    expect([...usados].filter((n) => !classificados.has(n))).toEqual([]);
  });
});
