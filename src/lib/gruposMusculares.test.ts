import { describe, it, expect } from "vitest";
import {
  agruparPorBloco,
  blocoDoGrupoMuscular,
  combinaBusca,
  musculoPrimario,
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
