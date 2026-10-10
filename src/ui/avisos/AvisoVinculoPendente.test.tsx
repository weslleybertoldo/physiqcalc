import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  sessao: {} as Record<string, unknown>,
  previa: vi.fn(),
  vincular: vi.fn(),
}));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));
vi.mock("@/nucleo/vinculo", async (orig) => ({ ...(await orig<typeof import("@/nucleo/vinculo")>()), previaDoCodigo: (c: string) => h.previa(c) }));

import AvisoVinculoPendente from "./AvisoVinculoPendente";

const CAMILA = { nome: "Camila Rocha", foto_url: null, tipo_perfil: "nutricionista", papeis: ["nutricionista"] };
const montar = () => render(<MemoryRouter useTransitions={false}><AvisoVinculoPendente /></MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  h.previa.mockReset();
  h.vincular.mockReset();
  h.sessao = { usuario: { id: "u1" }, situacao: { user_id: "u1" }, vincularCodigo: h.vincular };
  h.previa.mockResolvedValue({ ok: true, erro: null, jaEra: false, contaNome: "Nutri Camila", modulos: ["nutricao"], profissional: CAMILA });
});

describe("W7 — o link ?prof= abre o popup assim que a pessoa está no app", () => {
  it("logado com código guardado: popup com nome e tipo; Cancelar fecha, não vincula e descarta o código", async () => {
    localStorage.setItem("physiq_prof_pendente", "PROF-CAMILA-ROCHA");
    montar();
    expect(await screen.findByText("Camila Rocha")).toBeInTheDocument();
    expect(screen.getByText("NUTRICIONISTA")).toBeInTheDocument();
    expect(h.previa).toHaveBeenCalledWith("PROF-CAMILA-ROCHA");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByText("Camila Rocha")).toBeNull());
    expect(h.vincular).not.toHaveBeenCalled();
    expect(localStorage.getItem("physiq_prof_pendente")).toBeNull();
  });
  it("Confirmar vincula com o código guardado", async () => {
    localStorage.setItem("physiq_prof_pendente", "PROF-CAMILA-ROCHA");
    h.vincular.mockResolvedValue({ ok: true, profissional: "Camila Rocha" });
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(h.vincular).toHaveBeenCalledWith("PROF-CAMILA-ROCHA"));
    await waitFor(() => expect(screen.queryByText("NUTRICIONISTA")).toBeNull());
  });
  it("sem login ou sem código: nada aparece (o código espera o login)", () => {
    localStorage.setItem("physiq_prof_pendente", "PROF-CAMILA-ROCHA");
    h.sessao = { usuario: null, situacao: null, vincularCodigo: h.vincular };
    const r = montar();
    expect(r.container.textContent).toBe("");
    r.unmount();
    localStorage.clear();
    h.sessao = { usuario: { id: "u1" }, situacao: { user_id: "u1" }, vincularCodigo: h.vincular };
    const r2 = montar();
    expect(r2.container.textContent).toBe("");
    expect(h.previa).not.toHaveBeenCalled();
  });
});
