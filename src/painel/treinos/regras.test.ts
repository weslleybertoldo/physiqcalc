import { describe, expect, it } from "vitest";
import {
  abaDaUrl,
  classificado,
  donoAoCriar,
  erroDoNome,
  exercicioDoModelo,
  filtrarExercicios,
  filtrarModelos,
  grupoDaTela,
  linhaDaBiblioteca,
  montarModelos,
  montarPastas,
  podeCriar,
  podeEditar,
  camposEditados,
  colunasDaPrescricao,
  resumoDoMes,
  textoAlunos,
  visivel,
} from "./regras";
import { montarGruposTroca } from "@/treino/equivalencia";
import type { Catalogo, ExercicioCatalogo, LinhaModelo, QuemMexe } from "./tipos";

const LUCAS = "u-lucas";
const BRUNO = "u-bruno";
const MASTER = "u-master";
const personal: QuemMexe = { meuId: LUCAS, master: false, staff: true };
const master: QuemMexe = { meuId: MASTER, master: true, staff: true };
const leitor: QuemMexe = { meuId: "u-dono", master: false, staff: false };

function ex(o: Partial<ExercicioCatalogo>): ExercicioCatalogo {
  return {
    id: "e1", nome: "Supino Reto com Barra", grupo_muscular: "Peitoral", emoji: null, tipo: "musculacao", imagem_url: "https://x/supino.webp",
    subgrupo: "Peitoral médio (esternal) · tríceps", dica: null, professor_id: null, padrao_movimento: "supino_reto", equipamento: "barra", variacao: null, ...o,
  };
}
function linha(o: Partial<LinhaModelo>): LinhaModelo {
  return { grupo_id: "g1", exercicio_id: "e1", ordem: 0, num_series: null, reps_alvo: null, descanso_segundos: null, carga_sugerida_kg: null, ...o };
}

const catalogo: Catalogo = {
  modelos: [
    { id: "g1", nome: "Peito e tríceps", professor_id: LUCAS },
    { id: "g2", nome: "Costas (global)", professor_id: null },
    { id: "g3", nome: "Treino do Bruno", professor_id: BRUNO },
  ],
  pastas: [
    { id: "p1", nome: "Hipertrofia", professor_id: LUCAS },
    { id: "p2", nome: "Iniciante (global)", professor_id: null },
    { id: "p3", nome: "Pasta do Bruno", professor_id: BRUNO },
  ],
  vinculos: [
    { pasta_id: "p1", grupo_id: "g1" },
    { pasta_id: "p2", grupo_id: "g2" },
    { pasta_id: "p3", grupo_id: "g1" },
  ],
  linhas: [
    linha({ exercicio_id: "e2", ordem: 1, num_series: 4, reps_alvo: "10", descanso_segundos: 60, carga_sugerida_kg: 24 }),
    linha({ exercicio_id: "e1", ordem: 0 }),
    linha({ exercicio_id: "e1", ordem: 2 }), // linha repetida do mesmo par: aparece 1 vez
    linha({ grupo_id: "g2", exercicio_id: "e3", ordem: 0 }),
  ],
  exercicios: [
    ex({}),
    ex({ id: "e2", nome: "Supino Inclinado", subgrupo: "Peitoral superior (clavicular)", padrao_movimento: "supino_inclinado" }),
    ex({ id: "e3", nome: "Puxada Aberta Frontal", grupo_muscular: "Costas", subgrupo: null, padrao_movimento: "puxada_vertical", equipamento: "polia" }),
    ex({ id: "e4", nome: "Rosca Martelo no Cross", grupo_muscular: "Bíceps / Braquial", professor_id: LUCAS, padrao_movimento: "rosca_martelo", equipamento: "polia" }),
    ex({ id: "e5", nome: "Exercício do Bruno", professor_id: BRUNO }),
  ],
  musculos: [],
};

describe("W23 — aba da URL (links antigos do /admin/treinos)", () => {
  it.each([
    ["", "treinos"],
    ["aba=biblioteca", "biblioteca"],
    ["aba=historico", "historico"],
    ["aba=relatorio", "relatorio"],
    ["t=grupos&pasta=p1", "treinos"],
    ["t=biblioteca&b=minha", "biblioteca"],
    ["t=historico", "historico"],
    ["t=relatorio", "relatorio"],
    ["aba=xyz", "treinos"],
  ])("?%s → %s", (q, aba) => {
    expect(abaDaUrl(new URLSearchParams(q))).toBe(aba);
  });
});

describe("W23 — de quem é e quem muda (a regra do admin antigo)", () => {
  it("o personal vê o global e o dele; o de outro profissional fica fora", () => {
    expect(visivel({ professor_id: null }, LUCAS)).toBe(true);
    expect(visivel({ professor_id: LUCAS }, LUCAS)).toBe(true);
    expect(visivel({ professor_id: BRUNO }, LUCAS)).toBe(false);
  });
  it("personal muda só o dele; o master muda o global (e o dele); quem não tem papel no Treino só lê", () => {
    expect(podeEditar({ professor_id: LUCAS }, personal)).toBe(true);
    expect(podeEditar({ professor_id: null }, personal)).toBe(false);
    expect(podeEditar({ professor_id: null }, master)).toBe(true);
    expect(podeEditar({ professor_id: BRUNO }, master)).toBe(false);
    expect(podeEditar({ professor_id: "u-dono" }, leitor)).toBe(false);
    expect(podeCriar(leitor)).toBe(false);
    expect(podeCriar(personal)).toBe(true);
  });
  it("o master cria no catálogo GLOBAL (professor_id null, como antes); o personal, para ele", () => {
    expect(donoAoCriar(master)).toBeNull();
    expect(donoAoCriar(personal)).toBe(LUCAS);
  });
});

describe("W23 — prescrição do modelo (séries, repetições, descanso e carga)", () => {
  it("sem prescrição: as 3 séries de sempre e o resto vazio (como hoje)", () => {
    const e = exercicioDoModelo(linha({}), ex({}));
    expect(e).toMatchObject({ chave: "ex:e1", series: 3, seriesProprias: false, reps: null, descanso: null, carga: null, corrida: false });
    expect(e.subtitulo).toBe("Peito · peitoral médio (esternal)");
  });
  it("com prescrição: o que o modelo tem (a carga em número)", () => {
    const e = exercicioDoModelo(linha({ num_series: 4, reps_alvo: " 8-12 ", descanso_segundos: 60, carga_sugerida_kg: "22.5" as unknown as number }), ex({}));
    expect(e).toMatchObject({ series: 4, seriesProprias: true, reps: "8-12", descanso: 60, carga: 22.5 });
  });
  it("só a coluna do campo editado (digitar em sequência não perde campo); as séries só entram quando mudaram", () => {
    const mostrado = { series: 3, reps: null, descanso: null, carga: null };
    expect(camposEditados(mostrado, { series: 3, reps: "10", descanso: null, carga: null })).toEqual({ reps: "10" });
    expect(colunasDaPrescricao({ num_series: null }, { reps: " 10 " })).toEqual({ reps_alvo: "10" });
    expect(colunasDaPrescricao({ num_series: null }, { series: 3 })).toEqual({ num_series: null });
    expect(colunasDaPrescricao({ num_series: null }, { series: 4 })).toEqual({ num_series: 4 });
    // já tinha séries: 3 é uma escolha (fica gravado)
    expect(colunasDaPrescricao({ num_series: 4 }, { series: 3 })).toEqual({ num_series: 3 });
    expect(colunasDaPrescricao({ num_series: 4 }, { descanso: 90, carga: 40 })).toEqual({ descanso_segundos: 90, carga_sugerida_kg: 40 });
    expect(colunasDaPrescricao({ num_series: 4 }, { reps: "" })).toEqual({ reps_alvo: null });
    // a folha "Editar" manda os 4: só os que mudaram entram
    expect(camposEditados({ series: 4, reps: "10", descanso: 60, carga: 60 }, { series: 4, reps: "12", descanso: 60, carga: 62.5 })).toEqual({ reps: "12", carga: 62.5 });
  });
});

describe("W23 — modelos e pastas da tela", () => {
  const perfis = [
    { grupo_id: "g1", user_id: "a1" },
    { grupo_id: "g1", user_id: "a2" },
    { grupo_id: "g1", user_id: "de-outro" }, // não é aluno meu: não conta
    { grupo_id: "g2", user_id: "a1" },
  ];
  const meus = new Set(["a1", "a2"]);
  const modelos = montarModelos(catalogo, personal, perfis, meus);

  it("só o global e o meu, em ordem de nome; o de outro profissional não aparece", () => {
    expect(modelos.map((m) => m.nome)).toEqual(["Costas (global)", "Peito e tríceps"]);
  });
  it("exercícios na ordem do modelo, sem repetir; séries somadas, duração e quantos alunos MEUS recebem", () => {
    const g1 = modelos.find((m) => m.id === "g1")!;
    expect(g1.exercicios.map((e) => e.nome)).toEqual(["Supino Reto com Barra", "Supino Inclinado"]);
    expect(g1.totalSeries).toBe(3 + 4);
    expect(g1.minutos).toBeGreaterThan(0);
    expect(g1.alunos).toBe(2);
    expect(g1.temPrescricao).toBe(true);
    expect(g1.editavel).toBe(true);
    expect(g1.global).toBe(false);
  });
  it("as pastas do modelo são só as visíveis (a do outro profissional fica fora)", () => {
    expect(modelos.find((m) => m.id === "g1")!.pastas).toEqual(["p1"]);
    const pastas = montarPastas(catalogo, personal);
    expect(pastas.map((p) => [p.nome, p.editavel, p.modelos])).toEqual([
      ["Hipertrofia", true, ["g1"]],
      ["Iniciante (global)", false, ["g2"]],
    ]);
  });
  it("o global é só leitura para o personal e editável para o master", () => {
    expect(modelos.find((m) => m.id === "g2")!.editavel).toBe(false);
    expect(montarModelos(catalogo, master, [], new Set()).find((m) => m.id === "g2")!.editavel).toBe(true);
  });
  it("filtro: pela pasta aberta e pela busca (nome do treino ou de um exercício, sem acento)", () => {
    const pastas = montarPastas(catalogo, personal);
    expect(filtrarModelos(modelos, pastas[0], "").map((m) => m.id)).toEqual(["g1"]);
    expect(filtrarModelos(modelos, null, "puxada").map((m) => m.id)).toEqual(["g2"]);
    expect(filtrarModelos(modelos, null, "TRICEPS").map((m) => m.id)).toEqual(["g1"]);
  });
  it("nome obrigatório e com limite", () => {
    expect(erroDoNome("   ")).toBe("Dê um nome.");
    expect(erroDoNome("x".repeat(61))).toBe("Até 60 letras.");
    expect(erroDoNome("A · Peito")).toBeNull();
    expect(textoAlunos(0)).toBe("Nenhum aluno");
    expect(textoAlunos(1)).toBe("1 aluno");
    expect(textoAlunos(3)).toBe("3 alunos");
  });
});

describe("W23 — biblioteca (global só leitura + a própria)", () => {
  it("Global = os do master; Minha = os meus (o de outro profissional não aparece em nenhuma)", () => {
    expect(filtrarExercicios(catalogo.exercicios, "global", LUCAS, "todos", "").map((e) => e.id)).toEqual(["e3", "e2", "e1"]);
    expect(filtrarExercicios(catalogo.exercicios, "minha", LUCAS, "todos", "").map((e) => e.id)).toEqual(["e4"]);
  });
  it("filtro por grupo da tela e busca pelo equipamento/movimento", () => {
    expect(filtrarExercicios(catalogo.exercicios, "global", LUCAS, "costas", "").map((e) => e.id)).toEqual(["e3"]);
    expect(filtrarExercicios(catalogo.exercicios, "minha", LUCAS, "bracos", "polia").map((e) => e.id)).toEqual(["e4"]);
    expect(grupoDaTela("Bíceps / Braquial")).toBe("bracos");
  });
  it("a linha da biblioteca: grupo · movimento · equipamento (o que a troca por equivalente usa)", () => {
    expect(linhaDaBiblioteca(catalogo.exercicios[3])).toBe("Bíceps / Braquial · Rosca martelo · Polia (cabo)");
    expect(classificado(catalogo.exercicios[3])).toBe(true);
    expect(classificado({ padrao_movimento: null, equipamento: "barra" })).toBe(false);
  });
});

describe("W23 — relatório: resumo do mês (a conta do Relatório antigo)", () => {
  it("treinos, volume e média por semana", () => {
    expect(resumoDoMes([{ totalTreinos: 3, volumeTotal: 1000 }, { totalTreinos: 2, volumeTotal: 500 }])).toEqual({ treinos: 5, volume: 1500, mediaSemana: "2,5" });
    expect(resumoDoMes([])).toEqual({ treinos: 0, volume: 0, mediaSemana: "0" });
  });
});

describe("W23 — pronto quando: o exercício próprio novo aparece na troca por equivalente do aluno (a regra da W9)", () => {
  // o catálogo que o app do aluno tem (PowerSync: os globais + os do professor dele) — o próprio do personal é só mais um da lista
  const halteres = ex({ id: "g1", nome: "Rosca Martelo com Halteres", grupo_muscular: "Bíceps / Braquial", subgrupo: "Braquial · braquiorradial · bíceps", padrao_movimento: "rosca_martelo", equipamento: "halteres" });
  const polia = ex({ id: "g2", nome: "Rosca Martelo na Polia", grupo_muscular: "Bíceps / Braquial", subgrupo: "Braquial · braquiorradial · bíceps", padrao_movimento: "rosca_martelo", equipamento: "polia" });
  const direta = ex({ id: "g3", nome: "Rosca Direta com Barra", grupo_muscular: "Bíceps", subgrupo: "Bíceps", padrao_movimento: "rosca_direta", equipamento: "barra" });
  const proprio = ex({ id: "p1", nome: "Rosca Martelo com Kettlebell W23", grupo_muscular: "Bíceps / Braquial", subgrupo: "Braquial · braquiorradial · bíceps", professor_id: LUCAS, padrao_movimento: "rosca_martelo", equipamento: "kettlebell" });
  it("com movimento e equipamento: entra em Equivalentes (outro equipamento, mesmo movimento e músculo)", () => {
    const g = montarGruposTroca(halteres, [halteres, polia, direta, proprio]);
    expect(g.equivalentes.map((o) => o.exercicio.nome)).toEqual(["Rosca Martelo com Kettlebell W23", "Rosca Martelo na Polia"]);
  });
  it("com o kettlebell desmarcado na academia do aluno, vai para o fim (apagado), como os globais", () => {
    const g = montarGruposTroca(halteres, [halteres, polia, direta, proprio], { equipamentosAcademia: ["halteres", "polia", "barra"] });
    expect(g.equivalentes.map((o) => [o.exercicio.nome, o.semNaAcademia])).toEqual([["Rosca Martelo na Polia", false], ["Rosca Martelo com Kettlebell W23", true]]);
  });
  it("sem movimento cadastrado, o próprio fica fora dos Equivalentes (só em Mesmo músculo/Todos)", () => {
    const semMovimento = { ...proprio, padrao_movimento: null };
    const g = montarGruposTroca(halteres, [halteres, polia, semMovimento]);
    expect(g.equivalentes.map((o) => o.exercicio.id)).toEqual(["g2"]);
    expect(g.mesmoMusculo.map((o) => o.exercicio.id)).toContain("p1");
  });
});
