// Physiq hml-14d (B21 · D33): Prontuário › Anotações em páginas de 20 do banco (aluno_anotacoes com p_offset) — "1–20 de 41", a
// página no endereço (?pagina_anotacoes=), os grupos por mês dentro da página, o "última em" de TODAS (vem do banco também na
// página 2) e o PDF com todas (a chamada de antes, sem p_offset). O banco é falso: responde à página pedida sobre 41 anotações.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { perfil } from "@/test/fixturesPerfilAluno";

const h = vi.hoisted(() => ({
  perfil: vi.fn(),
  rpc: vi.fn(),
  pdf: vi.fn((_: unknown) => "prontuario.pdf"),
  erro: false,
  usuario: { id: "u2", email: "camila@teste.com" },
}));

/** cadeia do supabase-js que termina em { data: [], error: null } (o resto da aba lista o que o aluno tem) */
function cadeia(): unknown {
  const alvo = () => undefined;
  const p: unknown = new Proxy(alvo, {
    get: (_t, k) => (k === "then" ? (ok: (v: unknown) => void) => ok({ data: [], error: null }) : () => p),
    apply: () => p,
  });
  return p;
}

vi.mock("@/painel/aluno/dados/api", () => ({ ErroPerfil: class extends Error {}, buscarPerfilAluno: h.perfil, buscarDadosTreino: vi.fn() }));
vi.mock("@/nutricao/editor/lib/banco", () => ({ supabase: { rpc: h.rpc, from: () => cadeia(), storage: { from: () => cadeia() } } }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: h.usuario, treino: { estado: "desnecessario", erro: null } }) }));
vi.mock("@/nutricao/prontuario/lib/prontuarioPdf", () => ({ baixarPDFProntuario: (d: unknown) => h.pdf(d) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import Prontuario from "@/painel/aluno/abas/Prontuario";

const DIA = 86_400_000;
const NOTAS = Array.from({ length: 41 }, (_, i) => {
  const quando = new Date(Date.UTC(2026, 9, 1, 12) - i * 4 * DIA).toISOString();
  return {
    id: `a${i}`, data: quando, texto: `Anotação ${i}`, visibilidade: "equipe", autor_papel: "nutricionista", autor_id: "u2", autor_nome: "Camila Rocha",
    autor_foto: null, minha: true, created_at: quando, updated_at: quando,
  };
});

function Local() {
  const l = useLocation();
  return <span data-testid="url">{l.pathname + l.search}</span>;
}
const montar = (url = "/painel/alunos/p1/prontuario") =>
  render(
    <MemoryRouter useTransitions={false} initialEntries={[url]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Routes>
          <Route path="*" element={<><Prontuario alunoId="p1" /><Local /></>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );

const itens = () => [...document.querySelectorAll('[data-lista="anotacoes"] [data-item]')].map((e) => e.getAttribute("data-anotacao"));
const paginacao = () => document.querySelector('[data-paginacao="anotacoes"]');
const chamadas = () => h.rpc.mock.calls.filter((c) => c[0] === "aluno_anotacoes").map((c) => c[1] as Record<string, unknown>);

beforeEach(() => {
  h.perfil.mockReset();
  h.perfil.mockResolvedValue(perfil({ eu: { id: "u2", dono: false, personal: false, nutricionista: true, master: false } }));
  h.rpc.mockReset();
  h.pdf.mockClear();
  h.erro = false;
  h.rpc.mockImplementation(async (nome: string, a: { p_aluno: string; p_limite: number | null; p_offset?: number }) => {
    if (nome !== "aluno_anotacoes") return { data: null, error: null };
    if (h.erro) return { data: null, error: { message: "statement timeout" } };
    const base = { ok: true, paciente_id: "p1", total: NOTAS.length, clinico: true };
    if (a.p_offset === undefined) return { data: { ...base, anotacoes: a.p_limite ? NOTAS.slice(0, a.p_limite) : NOTAS }, error: null };
    return {
      data: { ...base, anotacoes: NOTAS.slice(a.p_offset, a.p_offset + (a.p_limite ?? 20)), offset: a.p_offset, limite: a.p_limite, ultima: { id: "a0", data: NOTAS[0].data } },
      error: null,
    };
  });
});

describe("Prontuário › Anotações em páginas (hml-14d, D33)", () => {
  it("abre na página 1: 20 de 41 do banco (p_offset 0), o total e o 'última em' de todas; sem ler todas", async () => {
    montar();
    await waitFor(() => expect(itens()).toHaveLength(20));
    expect(chamadas()).toEqual([{ p_aluno: "p1", p_limite: 20, p_offset: 0 }]);
    expect(itens()[0]).toBe("a0");
    expect(paginacao()?.getAttribute("data-total")).toBe("41");
    expect(paginacao()?.querySelector("[data-paginacao-rotulo]")?.textContent).toBe("1–20 de 41");
    expect(document.querySelector("[data-contagem]")?.getAttribute("data-contagem")).toBe("41");
    expect(document.querySelector("[data-ultima-anotacao]")?.getAttribute("data-ultima-anotacao")).toBe("a0");
    // os grupos por mês são da página (out/set/ago… só das 20)
    expect(Number(document.querySelector("[data-lista-anotacoes]")?.getAttribute("data-grupos"))).toBeGreaterThan(1);
  });

  it("Próxima: ?pagina_anotacoes=2 no endereço e a página 2 do banco (p_offset 20); o 'última em' continua o de todas", async () => {
    montar();
    await waitFor(() => expect(itens()).toHaveLength(20));
    fireEvent.click(paginacao()!.querySelector("[data-pagina-proxima]")!);
    await waitFor(() => expect(itens()[0]).toBe("a20"));
    expect(screen.getByTestId("url").textContent).toContain("pagina_anotacoes=2");
    expect(chamadas().at(-1)).toEqual({ p_aluno: "p1", p_limite: 20, p_offset: 20 });
    expect(document.querySelector("[data-ultima-anotacao]")?.getAttribute("data-ultima-anotacao")).toBe("a0");
  });

  it("o endereço com ?pagina_anotacoes=3 abre na 3ª (a 41ª anotação aparece)", async () => {
    montar("/painel/alunos/p1/prontuario?pagina_anotacoes=3");
    await waitFor(() => expect(itens()).toEqual(["a40"]));
    expect(chamadas()).toEqual([{ p_aluno: "p1", p_limite: 20, p_offset: 40 }]);
    expect(paginacao()?.querySelector("[data-paginacao-rotulo]")?.textContent).toBe("41–41 de 41");
  });

  it("o PDF do prontuário leva TODAS (a chamada de antes, sem p_offset)", async () => {
    montar();
    await waitFor(() => expect(itens()).toHaveLength(20));
    fireEvent.click(document.querySelector("[data-btn-pdf-prontuario]")!);
    await waitFor(() => expect(h.pdf).toHaveBeenCalledTimes(1));
    expect(chamadas().at(-1)).toEqual({ p_aluno: "p1", p_limite: null });
    expect((h.pdf.mock.calls[0][0] as { registros: unknown[] }).registros).toHaveLength(41);
  });

  it("erro do banco: o estado de erro da aba (nunca a lista vazia)", async () => {
    h.erro = true;
    montar();
    // a consulta tenta 1 vez a mais (retry 1, como a de antes) antes de mostrar o erro
    expect(await screen.findByText("Não deu para abrir as anotações", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(document.querySelector("[data-anotacoes-vazio]")).toBeNull();
  });
});
