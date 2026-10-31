import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Alertas do Dependabot (31/10/2026): zod 3.25 → 4.6.6 (GHSA-mrhx-c7xc-m3w5) e @hookform/resolvers 3.10 → 5.9.2. As circunferências e as
// dobras são um z.record: no zod 4 ele declara a chave (z.record(z.string(), …)). A medida fora da faixa segue barrada, com a mensagem
// no campo dela (o caminho circunferencias.<chave> / dobras.<chave>), e a válida grava.
const h = vi.hoisted(() => ({ criar: vi.fn(), atualizar: vi.fn(), auth: { user: { id: "u1", email: null } } }));
vi.mock("@/nutricao/editor/ui/contexto", () => ({ useAuth: () => h.auth }));
vi.mock("@/nutricao/editor/lib/antropometrias", () => ({ criarAntropometria: h.criar, atualizarAntropometria: h.atualizar }));

import AntropometriaDialog from "./AntropometriaDialog";

const montar = () =>
  render(<AntropometriaDialog open onOpenChange={vi.fn()} paciente={{ id: "p1", genero: "masculino", nascimento: "1990-05-01" }} onSalvo={vi.fn()} />);
const preencher = (seletor: string, valor: string) => fireEvent.change(document.querySelector(seletor)!, { target: { value: valor } });
const enviar = () => fireEvent.click(document.querySelector("[data-btn-salvar-antropometria]")!);

beforeEach(() => {
  h.criar.mockReset();
  h.atualizar.mockReset();
  h.criar.mockImplementation(async (_n: string, p: string, reg: Record<string, unknown>) => ({ id: "a1", paciente_id: p, ...reg }));
});

describe("Antropometria — o z.record das medidas no zod 4", () => {
  it("circunferência e dobra fora da faixa: a mensagem no campo de cada uma e nada grava", async () => {
    montar();
    preencher("[data-campo-peso]", "72,5");
    preencher('[data-campo-circ="cintura"]', "5000");
    const dobra = document.querySelector("[data-campo-dobra]")!;
    fireEvent.change(dobra, { target: { value: "999" } });
    enviar();
    expect(await screen.findByText("Medida em cm")).toBeTruthy();
    expect(screen.getByText("Dobra em mm")).toBeTruthy();
    expect(h.criar).not.toHaveBeenCalled();
  });

  it("sem o peso: 'Informe o peso em kg' e nada grava", async () => {
    montar();
    enviar();
    expect(await screen.findByText("Informe o peso em kg")).toBeTruthy();
    expect(h.criar).not.toHaveBeenCalled();
  });

  it("válido: grava o peso, a altura e a circunferência digitados", async () => {
    montar();
    preencher("[data-campo-peso]", "72,5");
    preencher("[data-campo-altura]", "172");
    preencher('[data-campo-circ="cintura"]', "80,5");
    enviar();
    await waitFor(() => expect(h.criar).toHaveBeenCalledTimes(1));
    const [nutri, paciente, reg] = h.criar.mock.calls[0];
    expect([nutri, paciente]).toEqual(["u1", "p1"]);
    expect(reg).toMatchObject({ peso: 72.5, altura: 172, circunferencias: { cintura: 80.5 } });
    expect(screen.queryByText("Medida em cm")).toBeNull();
  });
});
