import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ResumoAgenda from "./ResumoAgenda";
import type { EventoPainel } from "./visao";

const evento = (inicio: Date, extra: Partial<EventoPainel> = {}): EventoPainel => ({
  id: `e-${inicio.getTime()}`, calendarioId: "c1", titulo: "Retorno", inicio, fim: new Date(inicio.getTime() + 3600_000), diaInteiro: false,
  status: "confirmado", confirmacao: "confirmado", modulo: "nutricao", pacienteId: "p1", aluno: "Marina Alves", foto: null, cor: "#8B5CF6",
  observacao: null, profissionalId: "u1", reagendamentos: 0, origem: "profissional", ...extra,
}) as EventoPainel;

describe("Agenda › Consultas por semana (W25 — herdado da W20)", () => {
  it("sem nenhuma consulta nas 8 semanas, o card mostra o estado vazio com texto (não o gráfico em branco)", () => {
    render(<ResumoAgenda eventos={[]} carregando={false} aoAbrir={() => {}} aoVerHoje={() => {}} />);
    const vazio = document.querySelector("[data-consultas-semana-vazio]");
    expect(vazio).not.toBeNull();
    expect(screen.getByText("Nenhuma consulta nas últimas 8 semanas")).toBeTruthy();
    expect(document.querySelector("[data-grafico-semanas]")).toBeNull();
  });
  it("com consulta na semana, volta o gráfico de barras", () => {
    render(<ResumoAgenda eventos={[evento(new Date())]} carregando={false} aoAbrir={() => {}} aoVerHoje={() => {}} />);
    expect(document.querySelector("[data-grafico-semanas]")).not.toBeNull();
    expect(document.querySelector("[data-consultas-semana-vazio]")).toBeNull();
  });
});
