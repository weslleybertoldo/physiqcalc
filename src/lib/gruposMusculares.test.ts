import { describe, it, expect } from "vitest";
import {
  BLOCOS_MUSCULARES,
  MUSCULOS_PRIMARIOS_CONHECIDOS,
  agruparPorBloco,
  blocoDoGrupoMuscular,
  combinaBusca,
  getBloco,
  musculoPrimario,
  musculosDosBlocos,
  nomeDoBloco,
} from "./gruposMusculares";

describe("musculoPrimario", () => {
  it("pega o trecho antes da barra", () => {
    expect(musculoPrimario("Dorsal / Rombóide")).toBe("Dorsal");
    expect(musculoPrimario("Quadríceps / Glúteo")).toBe("Quadríceps");
  });
  it("mantém o valor quando não há barra", () => {
    expect(musculoPrimario("Peitoral")).toBe("Peitoral");
  });
});

describe("blocoDoGrupoMuscular", () => {
  it("usa só o músculo primário", () => {
    expect(blocoDoGrupoMuscular("Dorsal / Bíceps")).toBe("costas");
    expect(blocoDoGrupoMuscular("Quadríceps / Glúteo")).toBe("quadriceps");
    expect(blocoDoGrupoMuscular("Bíceps / Braquial")).toBe("biceps");
  });
  it("junta as variações de deltóide em Ombro", () => {
    expect(blocoDoGrupoMuscular("Deltóide")).toBe("ombro");
    expect(blocoDoGrupoMuscular("Deltóide Lateral")).toBe("ombro");
    expect(blocoDoGrupoMuscular("Deltóide Posterior")).toBe("ombro");
    expect(blocoDoGrupoMuscular("Ombro")).toBe("ombro");
  });
  it("junta isquiotibiais e posterior de coxa", () => {
    expect(blocoDoGrupoMuscular("Isquiotibiais")).toBe("posterior");
    expect(blocoDoGrupoMuscular("Posterior de Coxa")).toBe("posterior");
  });
  it("põe adutores/abdutores em Glúteo", () => {
    expect(blocoDoGrupoMuscular("Adutores da Coxa")).toBe("gluteo");
    expect(blocoDoGrupoMuscular("Abdutores da Coxa / Glúteo")).toBe("gluteo");
  });
  it("põe corrida em Cardio", () => {
    expect(blocoDoGrupoMuscular("Corrida")).toBe("cardio");
  });
  it("ignora acento, caixa e espaço extra", () => {
    expect(blocoDoGrupoMuscular("  peitoral  ")).toBe("peito");
    expect(blocoDoGrupoMuscular("TRICEPS")).toBe("triceps");
  });
  it("cai em Outros quando não reconhece", () => {
    expect(blocoDoGrupoMuscular("Xablau")).toBe("outros");
    expect(blocoDoGrupoMuscular("")).toBe("outros");
  });
});

describe("agruparPorBloco", () => {
  const exs = [
    { nome: "Supino Reto", grupo_muscular: "Peitoral" },
    { nome: "Remada", grupo_muscular: "Dorsal / Rombóide" },
    { nome: "Puxada", grupo_muscular: "Dorsal / Bíceps" },
    { nome: "Corrida", grupo_muscular: "Corrida" },
  ];

  it("agrupa pelo bloco do primário", () => {
    const grupos = agruparPorBloco(exs);
    expect(grupos.map((g) => g.bloco.key)).toEqual(["peito", "costas", "cardio"]);
    expect(grupos[1].exercicios.map((e) => e.nome)).toEqual(["Remada", "Puxada"]);
  });
  it("omite blocos vazios e respeita a ordem canônica", () => {
    const grupos = agruparPorBloco([{ nome: "Corrida", grupo_muscular: "Corrida" }]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].bloco.nome).toBe("Cardio");
  });
});

describe("Alongamento e mobilidade (12/10/2026)", () => {
  // os 9 globais da migration 20261012150000 (nome e grupo_muscular do DESENHO): nenhum cai em Costas, Pernas ou "Outros"
  const NOVE = [
    { nome: "Alongamento Abraçando os Joelhos", grupo_muscular: "Alongamento" },
    { nome: "Alongamento de Extensão da Coluna", grupo_muscular: "Alongamento" },
    { nome: "Alongamento de Posterior em Pé", grupo_muscular: "Alongamento" },
    { nome: "Alongamento de Punho (flexores)", grupo_muscular: "Alongamento" },
    { nome: "Alongamento de Punho (extensores)", grupo_muscular: "Alongamento" },
    { nome: "Mobilidade Cervical", grupo_muscular: "Mobilidade" },
    { nome: "Mobilidade de Coluna Deitado", grupo_muscular: "Mobilidade" },
    { nome: "Mobilidade de Ombro com Bastão", grupo_muscular: "Mobilidade" },
    { nome: "Alongamento Borboleta", grupo_muscular: "Alongamento" },
  ];

  it("o bloco novo entra logo antes de 'Outros' (que continua o último: a reserva do getBloco)", () => {
    const chaves = BLOCOS_MUSCULARES.map((b) => b.key);
    expect(chaves.slice(-3)).toEqual(["cardio", "alongamento", "outros"]);
    expect(getBloco("alongamento")).toMatchObject({ key: "alongamento", nome: "Alongamento e mobilidade", grupoPadrao: "Alongamento" });
    expect(getBloco("nao-existe").key).toBe("outros");
  });

  it("'Alongamento' e 'Mobilidade' (sem acento, caixa ou espaço sobrando) → o bloco novo", () => {
    expect(blocoDoGrupoMuscular("Alongamento")).toBe("alongamento");
    expect(blocoDoGrupoMuscular("Mobilidade")).toBe("alongamento");
    expect(blocoDoGrupoMuscular("  MOBILIDADE ")).toBe("alongamento");
    expect(blocoDoGrupoMuscular("Alongamentos")).toBe("alongamento");
    expect(blocoDoGrupoMuscular("Alongamento e mobilidade")).toBe("alongamento");
    expect(nomeDoBloco("Mobilidade")).toBe("Alongamento e mobilidade");
    for (const e of NOVE) expect(blocoDoGrupoMuscular(e.grupo_muscular), e.nome).toBe("alongamento");
  });

  it("os músculos que vão ao banco no grupo novo (e que saem de 'Outros')", () => {
    expect(musculosDosBlocos(["alongamento"])).toEqual(expect.arrayContaining(["alongamento", "mobilidade"]));
    expect(musculosDosBlocos(["alongamento"]).every((m) => blocoDoGrupoMuscular(m) === "alongamento")).toBe(true);
    expect(MUSCULOS_PRIMARIOS_CONHECIDOS).toEqual(expect.arrayContaining(["alongamento", "mobilidade"]));
  });

  it("agrupa os 9 num bloco só, depois do Cardio e antes de 'Outros'", () => {
    const grupos = agruparPorBloco([{ nome: "Xablau", grupo_muscular: "Xablau" }, ...NOVE, { nome: "Corrida", grupo_muscular: "Corrida" }]);
    expect(grupos.map((g) => g.bloco.key)).toEqual(["cardio", "alongamento", "outros"]);
    expect(grupos[1].exercicios).toHaveLength(9);
    expect(grupos[2].exercicios.map((e) => e.nome)).toEqual(["Xablau"]);
  });
});

describe("combinaBusca", () => {
  const ex = { nome: "Elevação Lateral com Halteres", grupo_muscular: "Deltóide Lateral" };

  it("acha por nome sem acento", () => {
    expect(combinaBusca(ex, "elevacao")).toBe(true);
    expect(combinaBusca(ex, "HALTER")).toBe(true);
  });
  it("acha pelo grupo muscular cadastrado", () => {
    expect(combinaBusca(ex, "deltoide")).toBe(true);
  });
  it("não acha o que não existe", () => {
    expect(combinaBusca(ex, "supino")).toBe(false);
  });
  it("termo vazio passa tudo", () => {
    expect(combinaBusca(ex, "  ")).toBe(true);
  });
});
