import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/principal/client", () => ({ principal: {}, PRINCIPAL_SCHEMA: "staging" }));

import type { EventoPainel } from "./visao";
import VisaoLista, { AvisoLimiteAgenda } from "./VisaoLista";

// hml-14b (D18): a lista do mês é uma janela de datas (fica fora da paginação); quando a leitura chega ao teto, o aviso aparece.
const evento = (id: string, inicio: Date): EventoPainel => ({
  id, titulo: "Consulta", inicio, fim: new Date(inicio.getTime() + 3_600_000), diaInteiro: false, status: "agendado", confirmacao: "a_confirmar",
  calendarioId: "cal1", profissionalId: "u1", pacienteId: null, aluno: "Rafael Moura", foto: null, observacao: null, modulo: "treino",
  tag: { id: null, nome: "Treino", cor: "#10b981" }, reagendamentos: 0, origem: "painel", cor: "#10b981",
} as EventoPainel);

describe("VisaoLista — o aviso do teto da janela (hml-14b, D18)", () => {
  const ancora = new Date(2026, 9, 9, 12);
  const props = { ancora, hoje: ancora, onAbrir: vi.fn(), onNovo: vi.fn() };

  it("sem chegar ao teto: sem aviso", () => {
    render(<VisaoLista {...props} eventos={[evento("e1", new Date(2026, 9, 9, 9))]} />);
    expect(document.querySelector("[data-evento=\"e1\"]")).not.toBeNull();
    expect(document.querySelector("[data-aviso-limite-agenda]")).toBeNull();
  });

  it("no teto: o aviso diz que pode faltar agendamento e pede um período menor (também com a lista vazia)", () => {
    const r = render(<VisaoLista {...props} eventos={[evento("e1", new Date(2026, 9, 9, 9))]} noLimite />);
    expect(screen.getByRole("status")).toHaveTextContent("Mostrando os 1000 mais recentes — encurte o período.");
    r.unmount();
    render(<VisaoLista {...props} eventos={[]} noLimite />);
    expect(document.querySelector("[data-lista-vazia] [data-aviso-limite-agenda]")).not.toBeNull();
  });

  it("o mesmo aviso sai sozinho para a Semana e o Mês (a página Agenda o põe em cima da visão)", () => {
    render(<AvisoLimiteAgenda />);
    expect(screen.getByRole("status")).toHaveTextContent("Mostrando os 1000 mais recentes — encurte o período.");
    expect(document.querySelector("[data-aviso-limite-agenda]")).not.toBeNull();
  });
});
