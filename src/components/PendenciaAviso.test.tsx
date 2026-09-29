import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock, h } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  h: { faixa: false, estado: { status: null as null | { mensalidade: number | null }, pendente: false } },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("react-router-dom", () => ({ useNavigate: () => navigateMock }));
vi.mock("@/hooks/useMensalidadeStatus", () => ({ useMensalidadeStatus: (uid: string | null) => (uid ? h.estado : { status: null, pendente: false }) }));
vi.mock("@/rotas/registro", () => ({ existe: (g: string, n: string) => g === "avisosApp" && n === "FaixaMensalidade" && h.faixa }));

const STORAGE_KEY = "physiq_pendencia_avisada_em";
const hoje = () => new Date().toLocaleDateString("pt-BR");

async function montar() {
  vi.resetModules();
  const { default: PendenciaAviso } = await import("./PendenciaAviso");
  return render(<PendenciaAviso />);
}

beforeEach(() => {
  localStorage.clear();
  navigateMock.mockClear();
  h.faixa = false;
  h.estado = { status: { mensalidade: 150 }, pendente: true };
});

describe("PendenciaAviso (popup diário antigo — A13: some quando a faixa do topo existe)", () => {
  it("com a faixa do topo no app (W6) → nunca aparece", async () => {
    h.faixa = true;
    const { container } = await montar();
    expect(container).toBeEmptyDOMElement();
  });

  it("sem a faixa: pendente → mostra o aviso com o valor; 'Mais tarde' silencia até amanhã", async () => {
    await montar();
    expect(screen.getByText("Parcela pendente")).toBeInTheDocument();
    expect(screen.getByText(/R\$\s150,00/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Mais tarde"));
    expect(screen.queryByText("Parcela pendente")).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(hoje());
  });

  it("já avisado hoje → não incomoda de novo; em dia → nada", async () => {
    localStorage.setItem(STORAGE_KEY, hoje());
    const a = await montar();
    expect(a.container).toBeEmptyDOMElement();
    a.unmount();
    localStorage.clear();
    h.estado = { status: { mensalidade: 150 }, pendente: false };
    const b = await montar();
    expect(b.container).toBeEmptyDOMElement();
  });

  it("'Regularizar agora' silencia hoje e vai para Perfil › Pagamentos", async () => {
    await montar();
    fireEvent.click(screen.getByText("Regularizar agora"));
    expect(navigateMock).toHaveBeenCalledWith("/perfil/pagamentos");
    expect(localStorage.getItem(STORAGE_KEY)).toBe(hoje());
  });
});
