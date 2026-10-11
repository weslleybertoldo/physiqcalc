// Physiq hml-19a (H-81) — Prontuário › Anamnese: o modelo padrão do 1º acesso é 1 chamada só por abertura (nutricao › padroes_garantir,
// no servidor) e só para quem muda o clínico. Com o garantir falhando: 1 chamada em 2 s de renders, 1 aviso com "Tentar de novo" e
// nenhum toast repetido (antes: o laço — 227 POST em ~10 s e um toast a cada volta, hml-18).
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AcessoProntuario } from "@/nutricao/prontuario/lib/acesso";

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  from: vi.fn(),
  toastErro: vi.fn(),
  usuario: { id: "u2", email: "camila@teste.com" },
}));

/** cadeia do supabase-js que termina em { data: [], error: null } (as leituras: anamneses, modelos, o nome da nutri) */
function cadeia(): unknown {
  const alvo = () => undefined;
  const p: unknown = new Proxy(alvo, {
    get: (_t, k) => (k === "then" ? (ok: (v: unknown) => void) => ok({ data: [], error: null }) : () => p),
    apply: () => p,
  });
  return p;
}

vi.mock("@/nutricao/editor/lib/banco", () => ({
  supabase: {
    from: (t: string) => {
      h.from(t);
      return cadeia();
    },
    functions: { invoke: (...a: unknown[]) => h.invoke(...a) },
  },
}));
// a sessão devolve um objeto NOVO a cada render (como o refresh do token faria): o useAuth() tem de segurar o mesmo
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: { ...h.usuario } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: (...a: unknown[]) => h.toastErro(...a) } }));

import Anamnese from "./Anamnese";
import { ProntuarioProvider } from "@/nutricao/prontuario/ui/contexto";

const PADRAO = {
  id: "m1", nutricionista_id: "u2", codigo: null, titulo: "Anamnese geral (padrão)", perguntas: ["Queixa principal / motivo da consulta"], favorito: true,
  created_at: "2026-10-11T00:00:00Z", updated_at: "2026-10-11T00:00:00Z", deleted_at: null,
};
const EDITA: AcessoProntuario = { clinico: true, editarClinico: true, visibilidades: ["nutricionistas", "equipe"] };
const SO_LE: AcessoProntuario = { clinico: true, editarClinico: false, visibilidades: ["nutricionistas", "equipe"] };
const recusa = (status: number, erro: string) => ({
  data: null,
  error: { name: "FunctionsHttpError", context: new Response(JSON.stringify({ ok: false, erro }), { status, headers: { "Content-Type": "application/json" } }) },
});

function Tela({ acesso, n }: { acesso: AcessoProntuario; n: number }) {
  return (
    <ProntuarioProvider value={{ paciente: { id: "p1", nome: "Ana W5P", nascimento: null, genero: null, cpf: null }, recarregar: async () => {}, acesso }}>
      <span data-render={n} />
      <Anamnese />
    </ProntuarioProvider>
  );
}
const montar = (acesso: AcessoProntuario) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const envolver = (n: number) => (
    <MemoryRouter useTransitions={false} initialEntries={["/painel/alunos/p1/prontuario?secao=anamnese"]}>
      <QueryClientProvider client={qc}>
        <Tela acesso={acesso} n={n} />
      </QueryClientProvider>
    </MemoryRouter>
  );
  const r = render(envolver(0));
  return { ...r, rerenderizar: (n: number) => r.rerender(envolver(n)) };
};
const garantias = () => h.invoke.mock.calls.filter(([nome, o]) => nome === "nutricao" && (o as { body: { acao?: string } }).body.acao === "padroes_garantir");
const esperar = (ms: number) => act(() => new Promise((ok) => setTimeout(ok, ms)));

beforeEach(() => {
  h.invoke.mockReset();
  h.from.mockReset();
  h.toastErro.mockReset();
});

describe("hml-19a (H-81) — Anamnese: o padrão do 1º acesso", () => {
  it("abre → padroes_garantir 1 vez (a seção da anamnese) → a lista dos modelos; renders seguidos não chamam de novo", async () => {
    h.invoke.mockResolvedValue({ data: { ok: true, criados: 1, lista: [PADRAO] }, error: null });
    const t = montar(EDITA);
    await waitFor(() => expect(garantias()).toHaveLength(1));
    expect(garantias()[0][1]).toEqual({ body: { secao: "anamnese", acao: "padroes_garantir" } });
    for (let i = 1; i <= 8; i++) {
      t.rerenderizar(i);
      await esperar(25);
    }
    expect(garantias()).toHaveLength(1);
    // a lista que voltou é a dos modelos da tela
    fireEvent.click(document.querySelector("[data-btn-modelos]")!);
    await waitFor(() => expect(document.querySelector('[data-modelo="m1"] [data-modelo-titulo]')?.textContent).toBe("Anamnese geral (padrão)"));
    expect(document.querySelector("[data-aviso-modelos]")).toBeNull();
    // e a leitura dos modelos não foi direto ao banco (veio do garantir)
    expect(h.from.mock.calls.filter(([t]) => t === "modelos_anamnese")).toHaveLength(0);
  });

  it("com o garantir falhando: 1 chamada em 2 s de renders, 1 aviso com \"Tentar de novo\" e 0 toast; o Tentar de novo pede de novo", async () => {
    h.invoke.mockResolvedValue(recusa(500, "erro_interno"));
    const t = montar(EDITA);
    await waitFor(() => expect(document.querySelector("[data-aviso-modelos]")).not.toBeNull());
    for (let i = 1; i <= 8; i++) {
      t.rerenderizar(i);
      await esperar(250);
    }
    expect(garantias()).toHaveLength(1);
    expect(document.querySelectorAll("[data-aviso-modelos]")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeTruthy();
    expect(h.toastErro).not.toHaveBeenCalled();
    // "Tentar de novo": a 2ª chamada (agora dá certo) e o aviso some
    h.invoke.mockResolvedValue({ data: { ok: true, criados: 1, lista: [PADRAO] }, error: null });
    fireEvent.click(document.querySelector("[data-btn-tentar-modelos]")!);
    await waitFor(() => expect(document.querySelector("[data-aviso-modelos]")).toBeNull());
    expect(garantias()).toHaveLength(2);
    expect(h.toastErro).not.toHaveBeenCalled();
  });

  it("quem só lê o clínico: nenhum padroes_garantir — só a lista (o padrão não nasce para quem não muda)", async () => {
    const t = montar(SO_LE);
    await waitFor(() => expect(h.from.mock.calls.some(([t]) => t === "modelos_anamnese")).toBe(true));
    t.rerenderizar(1);
    await esperar(50);
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.from.mock.calls.filter(([t]) => t === "modelos_anamnese")).toHaveLength(1);
  });
});
