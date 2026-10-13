import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MinhasRotinas, Rotina } from "@/aluno-dia/tipos";
import { matricula, situacao } from "@/test/fixturesNucleo";

const h = vi.hoisted(() => ({
  sessao: {} as Record<string, unknown>,
  dados: null as null | Record<string, unknown>,
  falha: false,
  ler: vi.fn(),
  marcar: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));
vi.mock("@/aluno-dia/api", async (orig) => ({
  ...(await orig<typeof import("@/aluno-dia/api")>()),
  lerMinhasRotinas: (...a: unknown[]) => h.ler(...a),
  marcarRotina: (...a: unknown[]) => h.marcar(...a),
}));
vi.mock("sonner", () => ({ toast: h.toast }));

import CardRotinasHoje from "./CardRotinasHoje";

let n = 0;
const rotina = (o: Partial<Rotina> = {}): Rotina => {
  n += 1;
  return {
    id: `r${n}`, origem: "aluno", paciente_id: null, nome: `Rotina ${n}`, detalhe: null, tipo: "habito", horario: "08:00", dias_semana: [1, 2, 3, 4, 5, 6, 7],
    lembrete: false, ordem: 0, criada_em: `2026-09-01T12:0${n % 10}:00Z`, alterada_em: "2026-09-01T12:00:00Z", arquivada_em: null, ...o,
  };
};

function Onde() {
  const l = useLocation();
  return <div data-testid="rota">{l.pathname + l.search}</div>;
}
function abrir() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter useTransitions={false} initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<CardRotinasHoje />} />
          <Route path="*" element={<Onde />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const card = () => document.querySelector("[data-card-rotinas-hoje]") as HTMLElement | null;

beforeEach(() => {
  n = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 30, 9, 30, 0)); // quarta 30/09/2026
  h.sessao = { usuario: { id: "u1" }, situacao: situacao({ matriculas: [matricula()] }) };
  h.dados = { ok: true, hoje: "2026-09-30", rotinas: [], feitas: [] };
  h.falha = false;
  h.ler.mockReset();
  h.ler.mockImplementation(async () => {
    if (h.falha) throw new Error("Failed to fetch");
    return h.dados;
  });
  h.marcar.mockReset();
  for (const f of [h.toast, h.toast.success, h.toast.error]) f.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("W-A P3 — Início › Rotinas de hoje", () => {
  it("lê ontem e hoje (dia de São Paulo) pela função; vazio → 'Crie a sua 1ª rotina…' e 'Criar rotina' abre a página já com a folha", async () => {
    abrir();
    await waitFor(() => expect(card()?.getAttribute("data-card-rotinas-hoje")).toBe("vazio"));
    expect(h.ler).toHaveBeenCalledWith("2026-09-29", "2026-09-30");
    expect(screen.getByText("Crie a sua 1ª rotina (creatina, remédio, água…)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Criar rotina/ }));
    expect(screen.getByTestId("rota").textContent).toBe("/perfil/rotinas?nova=1");
  });

  it("6 de hoje (1 feita) e 1 só de sábado: as 4 que faltam pela hora + '+2'; o selo na do profissional", async () => {
    const lista = [
      rotina({ nome: "Creatina", detalhe: "5 g", horario: "07:00", tipo: "suplemento" }),
      rotina({ nome: "Água 2 L", horario: "10:00", origem: "profissional", paciente_id: "p1" }),
      rotina({ nome: "Alongar", horario: "12:00" }),
      rotina({ nome: "Ômega 3", horario: "13:00" }),
      rotina({ nome: "Caminhar", horario: "18:00" }),
      rotina({ nome: "Ler", horario: "22:00" }),
      rotina({ nome: "Só sábado", horario: "09:00", dias_semana: [6] }),
    ];
    h.dados = { ok: true, hoje: "2026-09-30", rotinas: lista, feitas: [{ rotina_id: lista[0].id, dia: "2026-09-30", feita_em: "x" }] };
    abrir();
    await waitFor(() => expect(card()?.getAttribute("data-card-rotinas-hoje")).toBe("lista"));
    const ul = card()!.querySelector("[data-rotinas-hoje]")!;
    expect(ul.getAttribute("data-rotinas-hoje")).toBe("6");
    expect(ul.getAttribute("data-rotinas-hoje-feitas")).toBe("1");
    const linhas = [...card()!.querySelectorAll("[data-rotina-hoje]")].map((li) => li.textContent);
    expect(linhas).toHaveLength(4);
    expect(linhas[0]).toContain("Água 2 L");
    expect(linhas[0]).toContain("do seu profissional");
    expect(card()!.textContent).not.toContain("Só sábado");
    expect(card()!.textContent).not.toContain("Creatina"); // a feita foi para o fim (fora das 4)
    expect(card()!.querySelector("[data-rotinas-mais]")?.textContent).toBe("+2 rotinas");
  });

  it("✓ otimista: marca na hora e chama a função com hoje; a função recusa → volta e avisa com a frase fixa", async () => {
    const r = rotina({ nome: "Creatina" });
    h.dados = { ok: true, hoje: "2026-09-30", rotinas: [r], feitas: [] };
    let soltar: (v: unknown) => void = () => {};
    h.marcar.mockImplementation(() => new Promise((ok) => (soltar = ok)));
    abrir();
    const botao = await waitFor(() => {
      const b = card()?.querySelector(`[data-rotina-marcar="${r.id}"]`) as HTMLButtonElement | null;
      expect(b).not.toBeNull();
      return b!;
    });
    fireEvent.click(botao);
    await waitFor(() => expect(card()!.querySelector(`[data-rotina-hoje="${r.id}"]`)?.getAttribute("data-rotina-feita")).toBe("1"));
    expect(h.marcar).toHaveBeenCalledWith(r.id, "2026-09-30", true);
    // a releitura depois do ✓ já traz a feita
    h.dados = { ok: true, hoje: "2026-09-30", rotinas: [r], feitas: [{ rotina_id: r.id, dia: "2026-09-30", feita_em: "x" }] };
    soltar({ ok: true, feita: true });
    await waitFor(() => expect(h.ler).toHaveBeenCalledTimes(2));

    const { ErroAlunoDia } = await import("@/aluno-dia/api");
    h.marcar.mockRejectedValueOnce(new ErroAlunoDia("nao_encontrado"));
    h.dados = { ok: true, hoje: "2026-09-30", rotinas: [r], feitas: [{ rotina_id: r.id, dia: "2026-09-30", feita_em: "x" }] };
    fireEvent.click(card()!.querySelector(`[data-rotina-marcar="${r.id}"]`)!);
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith("Não encontrado: foi apagado ou não é seu."));
    await waitFor(() => expect(card()!.querySelector(`[data-rotina-hoje="${r.id}"]`)?.getAttribute("data-rotina-feita")).toBe("1"));
  });

  it("só rotinas de outros dias → 'Nenhuma rotina hoje'", async () => {
    h.dados = { ok: true, hoje: "2026-09-30", rotinas: [rotina({ dias_semana: [6, 7] })], feitas: [] } satisfies MinhasRotinas & { ok: true };
    abrir();
    await waitFor(() => expect(card()?.getAttribute("data-card-rotinas-hoje")).toBe("nenhuma-hoje"));
    expect(screen.getByText("Nenhuma rotina hoje")).toBeInTheDocument();
  });

  it("a leitura falhou → o aviso com 'Tentar de novo' (relê)", async () => {
    h.falha = true;
    abrir();
    await waitFor(() => expect(card()?.getAttribute("data-card-rotinas-hoje")).toBe("erro"));
    h.falha = false;
    fireEvent.click(screen.getByRole("button", { name: /Tentar de novo/ }));
    await waitFor(() => expect(card()?.getAttribute("data-card-rotinas-hoje")).toBe("vazio"));
  });

  it("quem não tem matrícula (o profissional que abriu o app) não vê o card nem lê", async () => {
    h.sessao = { usuario: { id: "u1" }, situacao: situacao({ matriculas: [] }) };
    abrir();
    await new Promise((ok) => setTimeout(ok, 20));
    expect(card()).toBeNull();
    expect(h.ler).not.toHaveBeenCalled();
  });
});
