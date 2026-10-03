import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOGO_81, exercicio81 } from "@/test/catalogoEquivalencia";

// O "Trocar" (W9) sobre um SQLite falso do PowerSync: o catálogo dos 81 classificados, os exercícios próprios e a academia.
const h = vi.hoisted(() => ({
  proprios: [] as unknown[],
  equipamentos: null as string | null,
  feitos: [] as { sql: string; params: unknown[] }[],
  respostasSelect: [] as unknown[][],
}));
const db = {
  getAll: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("FROM tb_exercicios ORDER BY nome")) return CATALOGO_81;
    if (sql.includes("FROM tb_exercicios_usuario")) return h.proprios;
    if (sql.includes("FROM tb_academias")) return [{ equipamentos: h.equipamentos }];
    h.feitos.push({ sql, params });
    return h.respostasSelect.shift() ?? [];
  }),
  execute: vi.fn(async (sql: string, params: unknown[] = []) => {
    h.feitos.push({ sql, params });
  }),
};
vi.mock("@powersync/react", () => ({ usePowerSync: () => db }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { TrocarExercicio, type AlvoTrocarExercicio } from "./TrocarExercicio";

function alvoDe(nome: string, extra: Partial<AlvoTrocarExercicio> = {}): AlvoTrocarExercicio {
  const e = exercicio81(nome);
  return {
    userId: "u1",
    exercicio: { id: e.id, nome: e.nome, grupo_muscular: e.grupo_muscular, subgrupo: e.subgrupo, imagem_url: null },
    pessoal: false,
    origemId: e.id,
    substituindo: null,
    idsNoTreino: [e.id],
    grupoId: "g1",
    grupoNome: "Peito + tríceps",
    grupoPessoal: false,
    slotIdx: 0,
    dateKey: "2026-09-30",
    dateLabel: "Qua 30/09",
    academia: null,
    ...extra,
  };
}

const opcoes = () => [...document.querySelectorAll("[data-trocar-opcao]")].map((b) => b.querySelector("[data-trocar-nome]")?.textContent);
const opcao = (nome: string) => document.querySelector(`[data-trocar-opcao="${exercicio81(nome).id}"]`) as HTMLButtonElement;

beforeEach(() => {
  h.proprios = [];
  h.equipamentos = null;
  h.feitos = [];
  h.respostasSelect = [];
  vi.clearAllMocks();
});

describe("Trocar exercício (tela 2 · W9)", () => {
  it("rosca martelo na polia: abre em Equivalentes com a rosca martelo com halteres; conta os 3 grupos", async () => {
    render(<TrocarExercicio alvo={alvoDe("Rosca Martelo na Polia")} aoFechar={vi.fn()} />);
    await waitFor(() => expect(opcoes()).toEqual(["Rosca Martelo com Halteres"]));
    expect(document.querySelector("[data-trocar-exercicio]")?.getAttribute("data-trocar-aba-atual")).toBe("equivalentes");
    expect(document.querySelector('[data-trocar-contagem="equivalentes"]')?.textContent).toBe("1");
    expect(Number(document.querySelector('[data-trocar-contagem="mesmo"]')?.textContent)).toBeGreaterThan(3);
    expect(screen.getByText(/Sai Rosca Martelo na Polia/)).toBeInTheDocument();
    expect(document.querySelector("[data-trocar-academia]")?.getAttribute("data-trocar-academia")).toBe("sem-academia");
  });

  it("academia sem polia: a opção com polia vai para o fim, apagada, com 'não tem na sua academia'", async () => {
    h.equipamentos = '["barra","halteres","maquina","peso_corporal"]';
    render(<TrocarExercicio alvo={alvoDe("Crucifixo na Máquina", { academia: { id: "a1", nome: "Smart Fit" } })} aoFechar={vi.fn()} />);
    await waitFor(() => expect(opcoes()).toEqual(["Crucifixo com Halteres", "Cross-over na Polia"]));
    expect(opcao("Cross-over na Polia").getAttribute("data-sem-academia")).toBe("1");
    expect(within(opcao("Cross-over na Polia")).getByText("não tem na sua academia")).toBeInTheDocument();
    expect(opcao("Crucifixo com Halteres").getAttribute("data-sem-academia")).toBeNull();
    expect(screen.getByText("Smart Fit: 4 equipamentos marcados")).toBeInTheDocument();
  });

  it("só hoje: escolhe, confirma e grava a troca do dia; fecha avisando que trocou", async () => {
    const aoFechar = vi.fn();
    render(<TrocarExercicio alvo={alvoDe("Rosca Martelo na Polia")} aoFechar={aoFechar} />);
    await waitFor(() => expect(opcoes()).toHaveLength(1));
    fireEvent.click(opcao("Rosca Martelo com Halteres"));
    expect(document.querySelector("[data-trocar-entra]")?.textContent).toBe("Rosca Martelo com Halteres");
    fireEvent.click(screen.getByRole("button", { name: "Trocar só hoje" }));
    await waitFor(() => expect(aoFechar).toHaveBeenCalledWith(true));
    const ins = h.feitos.find((f) => f.sql.includes("INSERT INTO exercicio_substituicao_usuario"))!;
    expect(ins.params.slice(0, 7)).toEqual(["u1", "g1", 0, exercicio81("Rosca Martelo na Polia").id, exercicio81("Rosca Martelo com Halteres").id, null, "2026-09-30"]);
  });

  it("de vez: apaga as trocas desse exercício de hoje em diante e grava a de vez (sem data)", async () => {
    const aoFechar = vi.fn();
    render(<TrocarExercicio alvo={alvoDe("Crucifixo na Máquina")} aoFechar={aoFechar} />);
    await waitFor(() => expect(opcoes().length).toBe(2));
    fireEvent.click(opcao("Crucifixo com Halteres"));
    fireEvent.click(document.querySelector('[data-trocar-escopo="definitiva"]')!);
    expect(document.querySelector("[data-trocar-explicacao]")?.textContent).toContain("próximos treinos de Peito + tríceps");
    fireEvent.click(screen.getByRole("button", { name: "Trocar de vez" }));
    await waitFor(() => expect(aoFechar).toHaveBeenCalledWith(true));
    expect(h.feitos.find((f) => f.sql.includes("DELETE FROM exercicio_substituicao_usuario"))?.params).toEqual(["u1", "g1", exercicio81("Crucifixo na Máquina").id, "2026-09-30"]);
    expect(h.feitos.find((f) => f.sql.includes("INSERT INTO"))?.params[6]).toBeNull();
  });

  it("trocado: mostra 'no lugar de' com Restaurar; restaurar apaga a troca do dia; o original é opção 'Voltar para'", async () => {
    const orig = exercicio81("Tríceps Francês Unilateral na Polia Baixa");
    const alvo = alvoDe("Tríceps Francês com Halter", { origemId: orig.id, substituindo: { id: orig.id, nome: orig.nome, escopo: "dia", trocadoEm: "2026-09-30" } });
    const aoFechar = vi.fn();
    const { unmount } = render(<TrocarExercicio alvo={alvo} aoFechar={aoFechar} />);
    await waitFor(() => expect(document.querySelector("[data-trocado]")).not.toBeNull());
    expect(document.querySelector("[data-trocado]")?.textContent).toContain(`No lugar de ${orig.nome}`);
    expect(opcao(orig.nome).textContent).toContain("ORIGINAL");
    fireEvent.click(opcao(orig.nome));
    expect(screen.getByRole("button", { name: `Voltar para ${orig.nome}` })).toBeInTheDocument();
    expect(document.querySelector("[data-trocar-escopo]")).toBeNull();
    fireEvent.click(document.querySelector("[data-trocar-restaurar]")!);
    await waitFor(() => expect(aoFechar).toHaveBeenCalledWith(true));
    const del = h.feitos.find((f) => f.sql.includes("DELETE FROM exercicio_substituicao_usuario"))!;
    expect(del.sql).toContain("slot_idx = ?");
    expect(del.params).toEqual(["u1", "g1", 0, orig.id, "2026-09-30"]);
    unmount();
  });

  it("negativo: quem já está no treino não pode entrar; sem equivalente abre no Mesmo músculo; sem nenhum dos dois, em Todos com busca", async () => {
    const { unmount } = render(
      <TrocarExercicio alvo={alvoDe("Supino Reto na Máquina Sentado", { idsNoTreino: [exercicio81("Supino Reto na Máquina Sentado").id, exercicio81("Supino Reto na Máquina Deitado").id] })} aoFechar={vi.fn()} />,
    );
    await waitFor(() => expect(opcoes().length).toBe(4));
    const deitado = opcao("Supino Reto na Máquina Deitado");
    expect(deitado.disabled).toBe(true);
    expect(deitado.textContent).toContain("NO TREINO");
    unmount();

    const r2 = render(<TrocarExercicio alvo={alvoDe("Supino Inclinado com Barra")} aoFechar={vi.fn()} />);
    await waitFor(() => expect(document.querySelector("[data-trocar-exercicio]")?.getAttribute("data-trocar-aba-atual")).toBe("mesmo"));
    r2.unmount();

    render(<TrocarExercicio alvo={alvoDe("Cadeira Adutora")} aoFechar={vi.fn()} />);
    await waitFor(() => expect(document.querySelector("[data-trocar-exercicio]")?.getAttribute("data-trocar-aba-atual")).toBe("todos"));
    fireEvent.change(document.querySelector("[data-trocar-busca]")!, { target: { value: "martelo" } });
    expect(opcoes()).toEqual(["Rosca Martelo com Halteres", "Rosca Martelo na Polia"]);
    fireEvent.change(document.querySelector("[data-trocar-busca]")!, { target: { value: "zzz" } });
    expect(screen.getByText("Nenhum exercício encontrado.")).toBeInTheDocument();
  });

  it("Equivalentes vazio mostra o aviso; exercício próprio do aluno aparece em Mesmo músculo e em Todos", async () => {
    h.proprios = [{ id: "meu1", nome: "Flexão com pausa", grupo_muscular: "Peitoral", tipo: null, padrao_movimento: null, equipamento: null, variacao: null }];
    render(<TrocarExercicio alvo={alvoDe("Supino Inclinado com Barra")} aoFechar={vi.fn()} />);
    await waitFor(() => expect(opcoes().length).toBeGreaterThan(0));
    expect(opcoes()).toContain("Flexão com pausa");
    fireEvent.click(document.querySelector('[data-trocar-aba="equivalentes"]')!);
    expect(screen.getByText("Ainda não há equivalente cadastrado para Supino Inclinado com Barra.")).toBeInTheDocument();
    fireEvent.click(document.querySelector('[data-trocar-aba="todos"]')!);
    fireEvent.click(document.querySelector('[data-trocar-bloco="peito"]')!);
    expect(opcoes()).toContain("Flexão com pausa");
  });
});
