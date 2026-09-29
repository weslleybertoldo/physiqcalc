import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ avisos: [] as unknown[], lidos: [] as unknown[] }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: { id: "u2" } }) }));
vi.mock("@/integrations/principal/client", () => {
  const cadeia = () => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "order"]) c[m] = () => c;
    c.limit = async () => ({ data: h.avisos, error: null });
    c.update = (v: unknown) => ({ eq: (_k: string, id: string) => { h.lidos.push({ ...(v as object), id }); return Promise.resolve({ error: null }); } });
    return c;
  };
  return { principal: { from: () => cadeia() } };
});

import AvisoMembroRemovido from "./AvisoMembroRemovido";

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AvisoMembroRemovido />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.avisos = [];
  h.lidos = [];
});

describe("AvisoMembroRemovido (W5, spec 9)", () => {
  it("removido da equipe: 'Você não faz mais parte desta conta' uma vez; 'Entendi' marca como lido", async () => {
    h.avisos = [{ id: "a1", titulo: "Você não faz mais parte da equipe de Consultoria Ferreira", criado_em: "2026-09-29T12:00:00Z" }];
    montar();
    expect(await screen.findByText("Você não faz mais parte desta conta")).toBeInTheDocument();
    expect(screen.getByText(/Consultoria Ferreira/)).toBeInTheDocument();
    fireEvent.click(document.querySelector("[data-aviso-removido-ok]")!);
    await waitFor(() => expect(h.lidos).toHaveLength(1));
    expect(h.lidos[0]).toMatchObject({ id: "a1" });
    expect(screen.queryByText("Você não faz mais parte desta conta")).toBeNull();
  });
  it("sem aviso: nada aparece", async () => {
    const { container } = montar();
    await new Promise((r) => setTimeout(r, 30));
    expect(container.textContent).toBe("");
  });
});
