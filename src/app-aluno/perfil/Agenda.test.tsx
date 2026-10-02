import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ agenda: [] as Array<Record<string, unknown>> }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: { id: "u1", email: "aluno@teste.com" } }) }));
vi.mock("./pecas/api", async (orig) => ({ ...(await orig<typeof import("./pecas/api")>()), minhaAgenda: async () => h.agenda }));
vi.mock("./agenda/api", async (orig) => ({ ...(await orig<typeof import("./agenda/api")>()), minhasRegrasAgenda: async () => [] }));

import Agenda from "./Agenda";

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/perfil/agenda"]}><Agenda /></MemoryRouter>
    </QueryClientProvider>,
  );
}

const consulta = (id: string, dias: number, extra: Record<string, unknown>) => {
  const inicio = new Date(Date.now() + dias * 86_400_000);
  return {
    id, inicio: inicio.toISOString(), fim: new Date(inicio.getTime() + 1_800_000).toISOString(), status: "confirmado", titulo: "Consulta",
    profissional: "Weslley Bertoldo", profissional_id: "p1", reagendamentos: 0, ...extra,
  };
};

const linha = (id: string) => document.querySelector(`[data-agendamento="${id}"]`);
const icone = (id: string) => linha(id)?.querySelector("[data-icone-area] svg")?.getAttribute("class") ?? "";

describe("Perfil › Agenda — o ícone da consulta (H1: a ÁREA vence o papel)", () => {
  beforeEach(() => {
    // o MESMO profissional como personal e nutri: o banco antigo devolvia papel "personal" em todas as consultas dele
    h.agenda = [
      consulta("nutri", 2, { modulo: "nutricao", papel: "personal", titulo: "Consulta de nutrição" }),
      consulta("treino", 3, { modulo: "treino", papel: "personal", titulo: "Consulta de treino" }),
      consulta("geral", 4, { modulo: "geral", papel: "personal", titulo: "Reunião" }),
      consulta("sem-area", 5, { modulo: null, papel: "nutricionista", titulo: "Retorno" }),
      consulta("passada", -3, { modulo: "nutricao", papel: "personal", titulo: "Consulta de nutrição" }),
    ];
  });

  it("nutrição → prato, treino → halter, geral → calendário; sem a área, o papel decide", async () => {
    montar();
    await waitFor(() => expect(linha("nutri")).not.toBeNull());
    expect(linha("nutri")?.getAttribute("data-agendamento-area")).toBe("nutricao");
    expect(icone("nutri")).toContain("lucide-salad");
    expect(linha("treino")?.getAttribute("data-agendamento-area")).toBe("treino");
    expect(icone("treino")).toContain("lucide-dumbbell");
    expect(linha("geral")?.getAttribute("data-agendamento-area")).toBe("geral");
    expect(icone("geral")).toContain("lucide-calendar-days");
    expect(linha("sem-area")?.getAttribute("data-agendamento-area")).toBe("nutricao");
    expect(icone("sem-area")).toContain("lucide-salad");
    // a das "Anteriores" segue a mesma regra (o print de produção da W2: o halter na consulta de nutrição de 01/10)
    expect(linha("passada")?.closest("[data-agenda-lista]")?.getAttribute("data-agenda-lista")).toBe("anteriores");
    expect(icone("passada")).toContain("lucide-salad");
  });

  it("o aluno não vê tag nenhuma (D4)", async () => {
    montar();
    await waitFor(() => expect(linha("nutri")).not.toBeNull());
    expect(document.querySelector("[data-tag-pilula]")).toBeNull();
  });
});
