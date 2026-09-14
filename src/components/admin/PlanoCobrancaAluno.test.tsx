import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, fromMock, tagsProps, pagProps } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  fromMock: vi.fn(),
  tagsProps: [] as Record<string, unknown>[],
  pagProps: [] as Record<string, unknown>[],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: invokeMock }, from: fromMock },
  DB_SCHEMA: "public",
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "prof1" }, papel: "professor" }) }));
vi.mock("@/components/AdminTagSelector", () => ({
  default: (p: Record<string, unknown>) => { tagsProps.push(p); return <div data-testid="tags" />; },
}));
vi.mock("@/components/AdminPagamentosStatus", () => ({
  default: (p: Record<string, unknown>) => { pagProps.push(p); return <div data-testid="pagamentos" />; },
}));
vi.mock("@/components/admin/ComprovanteAguardandoAluno", () => ({ default: () => <div data-testid="comprovante" /> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import PlanoCobrancaAluno from "./PlanoCobrancaAluno";

beforeEach(() => {
  invokeMock.mockReset();
  fromMock.mockReset();
  tagsProps.length = 0;
  pagProps.length = 0;
  invokeMock.mockImplementation(async (fn: string) =>
    fn === "admin-get-user"
      ? { data: { profile: { plano_nome: "Amigos", mensalidade_valor: 150 } }, error: null }
      : { data: { profile: {} }, error: null });
  fromMock.mockReturnValue({
    select: () => ({ order: () => Promise.resolve({ data: [{ nome: "Amigos" }, { nome: "Online" }], error: null }) }),
  });
});

describe("PlanoCobrancaAluno", () => {
  it("espelho: plano e mensalidade só leitura, sem Salvar, filhos em modo leitura", async () => {
    const { container } = render(<PlanoCobrancaAluno userId="u1" modo="espelho" />);
    await waitFor(() => expect(container.querySelector("[data-plano-select]")).not.toBeNull());
    const select = container.querySelector("[data-plano-select]") as HTMLSelectElement;
    const input = container.querySelector("[data-mensalidade-input]") as HTMLInputElement;
    expect(select.disabled).toBe(true);
    expect(select.value).toBe("Amigos");
    expect(input).toHaveAttribute("readonly");
    expect(input.value).toBe("150");
    expect(container.querySelector("[data-btn-salvar-cobranca]")).toBeNull();
    expect(screen.queryByText("+ Criar novo plano...")).toBeNull();
    expect(screen.getByText(/Somente leitura/)).toBeInTheDocument();
    expect(tagsProps.at(-1)?.readOnly).toBe(true);
    expect(pagProps.at(-1)?.somenteLeitura).toBe(true);
    expect(screen.queryByTestId("comprovante")).toBeNull();
    expect(invokeMock).toHaveBeenCalledWith("admin-get-user", { body: { userId: "u1" } });
  });

  it("editar: Salvar grava SÓ plano_nome/mensalidade_valor no admin-update-user e avisa onSalvo", async () => {
    const onSalvo = vi.fn();
    const { container } = render(<PlanoCobrancaAluno userId="u1" modo="editar" onSalvo={onSalvo} />);
    await waitFor(() => expect(container.querySelector("[data-plano-select]")).not.toBeNull());
    await waitFor(() => expect(screen.getByText("Online")).toBeInTheDocument());
    const select = container.querySelector("[data-plano-select]") as HTMLSelectElement;
    const input = container.querySelector("[data-mensalidade-input]") as HTMLInputElement;
    expect(select.disabled).toBe(false);
    expect(input).not.toHaveAttribute("readonly");
    expect(screen.getByText("+ Criar novo plano...")).toBeInTheDocument();
    expect(screen.getByTestId("comprovante")).toBeInTheDocument();
    expect(tagsProps.at(-1)?.readOnly).toBe(false);
    expect(pagProps.at(-1)?.somenteLeitura).toBe(false);
    fireEvent.change(select, { target: { value: "Online" } });
    fireEvent.change(input, { target: { value: "200,50" } });
    fireEvent.click(container.querySelector("[data-btn-salvar-cobranca]") as HTMLButtonElement);
    await waitFor(() => expect(onSalvo).toHaveBeenCalledTimes(1));
    expect(invokeMock).toHaveBeenLastCalledWith("admin-update-user", {
      body: { userId: "u1", data: { plano_nome: "Online", mensalidade_valor: 200.5 } },
    });
  });

  it("editar com `inicial` (dados da lista): abre na hora, sem chamar admin-get-user", async () => {
    const { container } = render(<PlanoCobrancaAluno userId="u1" modo="editar" inicial={{ plano_nome: "Amigos", mensalidade_valor: "150" }} />);
    const select = container.querySelector("[data-plano-select]") as HTMLSelectElement;
    const input = container.querySelector("[data-mensalidade-input]") as HTMLInputElement;
    expect(select).not.toBeNull();
    expect(select.value).toBe("Amigos");
    expect(input.value).toBe("150");
    await waitFor(() => expect(screen.getByText("Online")).toBeInTheDocument());
    expect(invokeMock).not.toHaveBeenCalledWith("admin-get-user", expect.anything());
  });
});
