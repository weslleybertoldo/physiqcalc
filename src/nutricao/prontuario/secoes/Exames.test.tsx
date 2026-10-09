// Physiq hml-14d (B21 · D32): Prontuário › Exames em páginas do banco — os resultados POR DATA (exames_do_aluno: 20 datas por página,
// o dia inteiro em cada uma, ?pagina_exames=; o "Ver evolução de" vai ao banco e volta à 1) e os pedidos em páginas de 20
// (?pagina_pedidos=), com os números do topo do banco. O banco é falso: aplica a regra da migration sobre 41 datas e 41 pedidos.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { perfil } from "@/test/fixturesPerfilAluno";

type Linha = Record<string, unknown>;
const h = vi.hoisted(() => ({
  perfil: vi.fn(),
  rpc: vi.fn(),
  resultados: [] as Array<Record<string, unknown>>,
  pedidos: [] as Array<Record<string, unknown>>,
  consultasPedidos: [] as Array<{ range: [number, number] | null; contar: boolean; ordem: Array<[string, boolean]> }>,
  usuario: { id: "u2", email: "camila@teste.com" },
}));

/** cadeia do supabase-js que termina em { data: [], error: null } (o resto do prontuário) */
function cadeia(): unknown {
  const alvo = () => undefined;
  const p: unknown = new Proxy(alvo, {
    get: (_t, k) => (k === "then" ? (ok: (v: unknown) => void) => ok({ data: [], error: null }) : () => p),
    apply: () => p,
  });
  return p;
}
function consultaPedidos(): unknown {
  const c = { range: null as [number, number] | null, contar: false, ordem: [] as Array<[string, boolean]> };
  h.consultasPedidos.push(c);
  const b: Record<string, unknown> = {
    select: (_s: string, o?: { count?: string }) => ((c.contar = o?.count === "exact"), b),
    eq: () => b,
    is: () => b,
    order: (col: string, o?: { ascending?: boolean }) => (c.ordem.push([col, o?.ascending !== false]), b),
    range: (de: number, ate: number) => ((c.range = [de, ate]), b),
    then: (ok: (v: unknown) => unknown) => {
      const [de, ate] = c.range ?? [0, 999];
      return Promise.resolve({ data: h.pedidos.slice(de, ate + 1), error: null, count: c.contar ? h.pedidos.length : null }).then(ok);
    },
  };
  return b;
}

vi.mock("@/painel/aluno/dados/api", () => ({ ErroPerfil: class extends Error {}, buscarPerfilAluno: h.perfil, buscarDadosTreino: vi.fn() }));
vi.mock("@/nutricao/editor/lib/banco", () => ({
  supabase: { rpc: h.rpc, from: (t: string) => (t === "pedidos_exame" ? consultaPedidos() : cadeia()), storage: { from: () => cadeia() } },
}));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: h.usuario, treino: { estado: "desnecessario", erro: null } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import Prontuario from "@/painel/aluno/abas/Prontuario";

const DIA = 86_400_000;
const datas = Array.from({ length: 41 }, (_, i) => new Date(Date.UTC(2026, 0, 1) + i * 5 * DIA).toISOString().slice(0, 10));
const NOMES = ["Glicemia de jejum", "HDL", "Ferritina", "Triglicerídeos", "TSH"];
const chave = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
/** a regra da migration (exames_do_aluno): o filtro sem caixa/acento, 20 datas por página, o dia inteiro, os números do aluno inteiro */
function examesDoAluno(a: { p_exame: string | null; p_offset: number; p_limite: number }) {
  const filtrados = h.resultados.filter((r) => !a.p_exame || chave(r.exame) === chave(a.p_exame));
  const ds = [...new Set(filtrados.map((r) => String(r.data)))].sort().reverse();
  const pagina = ds.slice(a.p_offset, a.p_offset + a.p_limite);
  const fora = (r: Linha) => r.valor !== null && ((r.ref_min !== null && Number(r.valor) < Number(r.ref_min)) || (r.ref_max !== null && Number(r.valor) > Number(r.ref_max)));
  return {
    ok: true, total_datas: ds.length, total_resultados: h.resultados.length, fora_referencia: h.resultados.filter(fora).length,
    exames: [...new Set(h.resultados.map((r) => String(r.exame)))],
    datas: pagina.map((d) => ({ data: d, resultados: filtrados.filter((r) => r.data === d) })),
  };
}

function Local() {
  const l = useLocation();
  return <span data-testid="url">{l.pathname + l.search}</span>;
}
const montar = (url = "/painel/alunos/p1/prontuario?secao=exames") =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Routes>
          <Route path="*" element={<><Prontuario alunoId="p1" /><Local /></>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
const datasNaTela = () => [...document.querySelectorAll('[data-lista="exames"] [data-item]')].map((e) => e.getAttribute("data-grupo-data"));
const pedidosNaTela = () => [...document.querySelectorAll('[data-lista="pedidos-exame"] [data-item]')].map((e) => e.getAttribute("data-pedido"));
const chamadas = () => h.rpc.mock.calls.filter((c) => c[0] === "exames_do_aluno").map((c) => c[1] as Record<string, unknown>);

beforeEach(() => {
  h.perfil.mockReset();
  h.perfil.mockResolvedValue(perfil({ eu: { id: "u2", dono: false, personal: false, nutricionista: true, master: false } }));
  h.rpc.mockReset();
  h.rpc.mockImplementation(async (nome: string, a: never) => {
    if (nome === "exames_do_aluno") return { data: examesDoAluno(a), error: null };
    return { data: { ok: true, paciente_id: "p1", total: 0, clinico: true, anotacoes: [] }, error: null };
  });
  h.consultasPedidos = [];
  h.resultados = [];
  // cada data com 1–3 resultados; a 21ª (a 20ª mais nova — a última da página 1) com 30: a virada da página não parte o dia
  datas.forEach((d, i) => {
    const n = i === 21 ? 30 : 1 + (i % 3);
    for (let j = 0; j < n; j++) {
      const exame = j < 5 ? NOMES[(i + j) % 5] : `Exame ${j}`;
      h.resultados.push({
        id: `r${i}-${j}`, paciente_id: "p1", nutricionista_id: "u2", exame, valor: (i * 7 + j * 13) % 200, valor_texto: "", unidade: "mg/dL",
        ref_min: exame === "HDL" ? 40 : null, ref_max: exame === "Glicemia de jejum" ? 99 : null, referencia_texto: "", data: d, observacao: "",
        created_at: `${d}T10:00:00Z`, updated_at: `${d}T10:00:00Z`, deleted_at: null,
      });
    }
  });
  h.pedidos = [...datas].reverse().map((d, i) => ({
    id: `ped${i}`, paciente_id: "p1", nutricionista_id: "u2", data: d, exames: ["Glicemia de jejum", "HDL"], observacao: "", created_at: `${d}T09:00:00Z`,
    updated_at: `${d}T09:00:00Z`, deleted_at: null,
  }));
});

describe("Prontuário › Exames por página (hml-14d, D32)", () => {
  it("resultados: 20 DATAS por página do banco, com o dia inteiro e os números do topo do banco", async () => {
    montar();
    await waitFor(() => expect(datasNaTela()).toHaveLength(20));
    expect(chamadas()[0]).toEqual({ p_aluno: "p1", p_exame: null, p_offset: 0, p_limite: 20 });
    expect(datasNaTela()).toEqual([...datas].reverse().slice(0, 20));
    // a última data da página 1 é a dos 30 resultados: inteira
    const dia = document.querySelector(`[data-grupo-data="${datas[21]}"]`)!;
    expect(dia.getAttribute("data-grupo-total")).toBe("30");
    expect(dia.querySelectorAll("tr[data-resultado]")).toHaveLength(30);
    const topo = document.querySelector("[data-contagem-resultados]")!;
    expect(topo.getAttribute("data-contagem-resultados")).toBe(String(h.resultados.length));
    expect(Number(topo.getAttribute("data-fora-referencia"))).toBeGreaterThan(0);
    const pag = document.querySelector('[data-paginacao="exames"]')!;
    expect(pag.getAttribute("data-total")).toBe("41");
    expect(pag.querySelector("[data-paginacao-rotulo]")?.textContent).toBe("1–20 de 41");
  });

  it("Próxima nos resultados: ?pagina_exames=2 e o p_offset 20; a 41ª data aparece na 3ª", async () => {
    montar();
    await waitFor(() => expect(datasNaTela()).toHaveLength(20));
    fireEvent.click(document.querySelector('[data-paginacao="exames"] [data-pagina-proxima]')!);
    await waitFor(() => expect(datasNaTela()[0]).toBe([...datas].reverse()[20]));
    expect(screen.getByTestId("url").textContent).toContain("pagina_exames=2");
    expect(chamadas().at(-1)).toMatchObject({ p_offset: 20, p_limite: 20 });
    fireEvent.click(document.querySelector('[data-paginacao="exames"] [data-pagina-proxima]')!);
    await waitFor(() => expect(datasNaTela()).toEqual([datas[0]]));
  });

  it("'Ver evolução de' vai ao banco (p_exame) e volta à 1; só aquele exame em cada data", async () => {
    montar("/painel/alunos/p1/prontuario?secao=exames&pagina_exames=2");
    await waitFor(() => expect(datasNaTela()).toHaveLength(20));
    expect(chamadas()[0]).toMatchObject({ p_offset: 20 });
    fireEvent.change(document.querySelector("[data-filtro-exame]")!, { target: { value: "HDL" } });
    await waitFor(() => expect(chamadas().at(-1)).toEqual({ p_aluno: "p1", p_exame: "HDL", p_offset: 0, p_limite: 20 }));
    await waitFor(() => expect([...document.querySelectorAll("tr[data-resultado]")].every((tr) => tr.getAttribute("data-resultado-exame") === "HDL")).toBe(true));
    expect(screen.getByTestId("url").textContent).not.toContain("pagina_exames");
    const hdl = new Set(h.resultados.filter((r) => r.exame === "HDL").map((r) => r.data)).size;
    expect(document.querySelector('[data-paginacao="exames"]')?.getAttribute("data-total")).toBe(String(hdl));
  });

  it("pedidos: 20 por página do banco (range + count), o total no topo, ?pagina_pedidos= na Próxima", async () => {
    montar();
    await waitFor(() => expect(pedidosNaTela()).toHaveLength(20));
    expect(h.consultasPedidos[0]).toMatchObject({ range: [0, 19], contar: true });
    expect(h.consultasPedidos[0].ordem).toEqual([["data", false], ["created_at", false], ["id", false]]);
    expect(document.querySelector("[data-contagem-pedidos]")?.getAttribute("data-contagem-pedidos")).toBe("41");
    fireEvent.click(document.querySelector('[data-paginacao="pedidos-exame"] [data-pagina-proxima]')!);
    await waitFor(() => expect(pedidosNaTela()[0]).toBe("ped20"));
    expect(h.consultasPedidos.at(-1)?.range).toEqual([20, 39]);
    expect(screen.getByTestId("url").textContent).toContain("pagina_pedidos=2");
  });
});
