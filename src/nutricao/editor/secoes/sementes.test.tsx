// Physiq hml-19b (H-81 · decisão C) — Dieta › Manipulados, Metas e Orientações: os modelos padrão do 1º acesso são 1 chamada só por
// abertura (nutricao › padroes_garantir, no servidor) e só para quem pode editar. Com o garantir falhando: 1 chamada em 2 s de renders,
// 1 aviso com "Tentar de novo" e nenhum toast (antes: Orientações dava um toast a cada volta do laço [user]; Manipulados e Metas
// repetiam a semente pela nova tentativa do React Query).
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  from: vi.fn(),
  toastErro: vi.fn(),
  usuario: { id: "u2", email: "camila@teste.com" },
}));

/** cadeia do supabase-js que termina em { data: [], error: null } (as leituras: as listas, os modelos, o nome da nutri) */
function cadeia(): unknown {
  const alvo = () => undefined;
  const p: unknown = new Proxy(alvo, {
    get: (_t, k) => (k === "then" ? (ok: (v: unknown) => void) => ok({ data: [], error: null }) : () => p),
    apply: () => p,
  });
  return p;
}

vi.mock("@/integrations/principal/client", () => ({
  PRINCIPAL_SCHEMA: "staging",
  principalConfigurado: true,
  principal: {
    from: (t: string) => {
      h.from(t);
      return cadeia();
    },
    rpc: () => cadeia(),
    functions: { invoke: (...a: unknown[]) => h.invoke(...a) },
  },
}));
// a sessão devolve um objeto NOVO a cada render (como o refresh do token faria): o useAuth() segura o mesmo (hml-19a)
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: { ...h.usuario } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), message: vi.fn(), error: (...a: unknown[]) => h.toastErro(...a) } }));

import Manipulados from "./Manipulados";
import Metas from "./Metas";
import Orientacoes from "./Orientacoes";
import { PacienteProvider } from "@/nutricao/editor/ui/contexto";

type Secao = { nome: string; Tela: ComponentType; secao: string; tabela: string; aviso: string; tentar: string };
const SECOES: Secao[] = [
  { nome: "Manipulados", Tela: Manipulados, secao: "formula", tabela: "modelos_formula", aviso: "[data-erro-formulas]", tentar: "[data-btn-tentar-formulas]" },
  { nome: "Metas", Tela: Metas, secao: "meta", tabela: "modelos_meta", aviso: "[data-erro-metas]", tentar: "[data-btn-tentar-metas]" },
  { nome: "Orientações", Tela: Orientacoes, secao: "orientacao", tabela: "modelos_orientacao", aviso: "[data-aviso-modelos]", tentar: "[data-btn-tentar-modelos]" },
];

const recusa = (status: number, erro: string) => ({
  data: null,
  error: { name: "FunctionsHttpError", context: new Response(JSON.stringify({ ok: false, erro }), { status, headers: { "Content-Type": "application/json" } }) },
});

function montar({ Tela }: Secao, podeEditar: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const envolver = (n: number) => (
    <MemoryRouter useTransitions={false} initialEntries={["/painel/alunos/p1/dieta"]}>
      <QueryClientProvider client={qc}>
        <PacienteProvider value={{ paciente: { id: "p1", nome: "Ana W5P", nascimento: null, genero: null }, recarregar: async () => {}, podeEditar }}>
          <span data-render={n} />
          <Tela />
        </PacienteProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
  const r = render(envolver(0));
  return { ...r, rerenderizar: (n: number) => r.rerender(envolver(n)) };
}
const garantias = () => h.invoke.mock.calls.filter(([nome, o]) => nome === "nutricao" && (o as { body: { acao?: string } }).body.acao === "padroes_garantir");
const esperar = (ms: number) => act(() => new Promise((ok) => setTimeout(ok, ms)));

beforeEach(() => {
  h.invoke.mockReset();
  h.from.mockReset();
  h.toastErro.mockReset();
});

describe.each(SECOES)("hml-19b (H-81) — $nome: os modelos padrão do 1º acesso", (s) => {
  it("abre → padroes_garantir 1 vez (a seção certa); renders seguidos não chamam de novo; os modelos não são lidos à parte", async () => {
    h.invoke.mockResolvedValue({ data: { ok: true, criados: 1, lista: [{ id: "m1", titulo: "Padrão", favorito: true }] }, error: null });
    const t = montar(s, true);
    await waitFor(() => expect(garantias()).toHaveLength(1));
    expect(garantias()[0][1]).toEqual({ body: { secao: s.secao, acao: "padroes_garantir" } });
    for (let i = 1; i <= 8; i++) {
      t.rerenderizar(i);
      await esperar(25);
    }
    expect(garantias()).toHaveLength(1);
    expect(document.querySelector(s.aviso)).toBeNull();
    expect(h.from.mock.calls.filter(([t]) => t === s.tabela)).toHaveLength(0);
  });

  it("com o garantir falhando: 1 chamada em 2 s de renders, 1 aviso com \"Tentar de novo\" e 0 toast; o Tentar de novo pede de novo", async () => {
    h.invoke.mockResolvedValue(recusa(500, "erro_interno"));
    const t = montar(s, true);
    await waitFor(() => expect(document.querySelector(s.aviso)).not.toBeNull());
    for (let i = 1; i <= 8; i++) {
      t.rerenderizar(i);
      await esperar(250);
    }
    expect(garantias()).toHaveLength(1);
    expect(document.querySelectorAll(s.aviso)).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeTruthy();
    expect(h.toastErro).not.toHaveBeenCalled();
    // "Tentar de novo": a 2ª chamada (agora dá certo) e o aviso some
    h.invoke.mockResolvedValue({ data: { ok: true, criados: 1, lista: [] }, error: null });
    fireEvent.click(document.querySelector(s.tentar)!);
    await waitFor(() => expect(document.querySelector(s.aviso)).toBeNull());
    expect(garantias()).toHaveLength(2);
    expect(h.toastErro).not.toHaveBeenCalled();
  });

  it("quem só lê: nenhum padroes_garantir — só a lista (o padrão não nasce para quem não pode editar)", async () => {
    const t = montar(s, false);
    await waitFor(() => expect(h.from.mock.calls.some(([t]) => t === s.tabela)).toBe(true));
    t.rerenderizar(1);
    await esperar(50);
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.from.mock.calls.filter(([t]) => t === s.tabela)).toHaveLength(1);
  });
});
