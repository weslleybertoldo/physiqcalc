import { fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ agenda: [] as Array<Record<string, unknown>>, lista: vi.fn() }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: { id: "u1", email: "aluno@teste.com" } }) }));
vi.mock("./pecas/api", async (orig) => ({
  ...(await orig<typeof import("./pecas/api")>()),
  minhaAgenda: async () => h.agenda,
  minhaAgendaLista: (...a: unknown[]) => h.lista(...a),
}));
vi.mock("./agenda/api", async (orig) => ({ ...(await orig<typeof import("./agenda/api")>()), minhasRegrasAgenda: async () => [] }));

import Agenda from "./Agenda";

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter useTransitions={false} initialEntries={["/perfil/agenda"]}><Agenda /></MemoryRouter>
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

describe("Perfil › Agenda — Próximas: as 20 primeiras + 'Ver todas (N)' em páginas do banco (hml-14d, P7)", () => {
  beforeEach(() => {
    h.agenda = [
      ...Array.from({ length: 41 }, (_, i) => consulta(`f${String(i).padStart(2, "0")}`, i + 1, { modulo: "nutricao", papel: "nutricionista" })),
      consulta("passada", -3, { modulo: "nutricao", papel: "nutricionista" }),
    ];
    // o banco (minha_agenda_lista 'proximas'): a mesma regra, em páginas de 20
    h.lista.mockReset();
    h.lista.mockImplementation(async (_tipo: string, pagina: number) => {
      const proximas = h.agenda.filter((a) => a.id !== "passada");
      return { itens: proximas.slice((pagina - 1) * 20, pagina * 20), total: proximas.length };
    });
  });

  it("o cartão mostra 20 de 41 e 'Ver todas (41)'; a folha abre na página 1 com '1–20 de 41' e vai até a 41ª", async () => {
    montar();
    await waitFor(() => expect(linha("f00")).not.toBeNull());
    expect(document.querySelectorAll('[data-agenda-lista="proximas"] [data-agendamento]')).toHaveLength(20);
    expect(document.querySelector("[data-pagina-agenda]")?.getAttribute("data-proximos")).toBe("41");
    const botao = document.querySelector('[data-ver-todos="agenda"]')!;
    expect(botao.textContent).toBe("Ver todas (41)");
    fireEvent.click(botao);
    const folha = () => document.body.querySelector('[data-folha-todos="agenda"]');
    await waitFor(() => expect(folha()?.querySelectorAll('[data-lista="app-agenda"] [data-item]')).toHaveLength(20));
    expect(h.lista).toHaveBeenLastCalledWith("proximas", 1);
    const pag = folha()!.querySelector('[data-paginacao="app-agenda"]')!;
    expect(pag.getAttribute("data-total")).toBe("41");
    expect(pag.querySelector("[data-paginacao-rotulo]")?.textContent).toBe("1–20 de 41");
    fireEvent.click(pag.querySelector("[data-pagina-proxima]")!);
    await waitFor(() => expect(h.lista).toHaveBeenLastCalledWith("proximas", 2));
    fireEvent.click(folha()!.querySelector("[data-pagina-proxima]")!);
    await waitFor(() => expect(folha()?.querySelector('[data-agendamento="f40"]')).not.toBeNull());
  });

  it("com até 20 próximas não há 'Ver todas'", async () => {
    h.agenda = h.agenda.slice(0, 20);
    montar();
    await waitFor(() => expect(linha("f00")).not.toBeNull());
    expect(document.querySelectorAll('[data-agenda-lista="proximas"] [data-agendamento]')).toHaveLength(20);
    expect(document.querySelector('[data-ver-todos="agenda"]')).toBeNull();
  });
});
