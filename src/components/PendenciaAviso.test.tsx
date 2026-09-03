import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, navigateMock } = vi.hoisted(() => ({ getSessionMock: vi.fn(), navigateMock: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: getSessionMock } },
  DB_SCHEMA: "public",
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("react-router-dom", () => ({ useNavigate: () => navigateMock }));

import { gravarStatusCache, type MpStatusLeve } from "@/lib/mpClient";
import PendenciaAviso from "./PendenciaAviso";

const STORAGE_KEY = "physiq_pendencia_avisada_em";
const leve: MpStatusLeve = { mensalidade: 150, emDia: false, pagoAte: null, mesRef: "2026-09-01", mesLabel: "Setembro/2026" };
const hoje = () => new Date().toLocaleDateString("pt-BR");

beforeEach(() => {
  localStorage.clear();
  navigateMock.mockClear();
  vi.stubGlobal("fetch", vi.fn());
});

describe("PendenciaAviso", () => {
  it("pendente (cache) → mostra o aviso com o valor; 'Mais tarde' silencia até amanhã", () => {
    gravarStatusCache("u1", leve);
    render(<PendenciaAviso />);
    expect(screen.getByText("Parcela pendente")).toBeInTheDocument();
    expect(screen.getByText(/R\$\s150,00/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Mais tarde"));
    expect(screen.queryByText("Parcela pendente")).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(hoje());
  });

  it("já avisado hoje → não incomoda de novo", () => {
    localStorage.setItem(STORAGE_KEY, hoje());
    gravarStatusCache("u1", leve);
    const { container } = render(<PendenciaAviso />);
    expect(container).toBeEmptyDOMElement();
  });

  it("em dia → nada", () => {
    gravarStatusCache("u1", { ...leve, emDia: true });
    const { container } = render(<PendenciaAviso />);
    expect(container).toBeEmptyDOMElement();
  });

  it("sem mensalidade configurada → nada", () => {
    gravarStatusCache("u1", { ...leve, mensalidade: null });
    const { container } = render(<PendenciaAviso />);
    expect(container).toBeEmptyDOMElement();
  });

  it("'Regularizar agora' silencia hoje e vai pra /pagamentos", () => {
    gravarStatusCache("u1", leve);
    render(<PendenciaAviso />);
    fireEvent.click(screen.getByText("Regularizar agora"));
    expect(navigateMock).toHaveBeenCalledWith("/pagamentos");
    expect(localStorage.getItem(STORAGE_KEY)).toBe(hoje());
    expect(screen.queryByText("Parcela pendente")).toBeNull();
  });
});
