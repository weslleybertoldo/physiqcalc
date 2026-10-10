import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ModuloForaDoPlano } from "./ModuloForaDoPlano";

describe("casca: módulo fora do plano (spec §9 — herdado da W26 na W27)", () => {
  it("mostra a frase da spec e, para o dono, o caminho para mudar o plano", () => {
    render(<MemoryRouter useTransitions={false}><ModuloForaDoPlano modulo="nutricao" ehDono /></MemoryRouter>);
    expect(screen.getByText("Este módulo não está no plano da conta")).toBeInTheDocument();
    expect(screen.getByText("Nutrição")).toBeInTheDocument();
    expect(screen.getByText("Mudar o plano").getAttribute("href")).toBe("/painel/configuracoes/plano");
  });
  it("quem não é dono vê que o dono muda o plano", () => {
    render(<MemoryRouter useTransitions={false}><ModuloForaDoPlano modulo="treino" /></MemoryRouter>);
    expect(screen.queryByText("Mudar o plano")).toBeNull();
    expect(screen.getByText("Quem muda o plano é o dono da conta.")).toBeInTheDocument();
  });
});
