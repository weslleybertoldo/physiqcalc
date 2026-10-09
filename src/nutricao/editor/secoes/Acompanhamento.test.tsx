// Physiq hml-14d (B21 · D34 · P10): Dieta › Acompanhamento pede ao banco SÓ o período da tela (antes lia todos os registros do aluno,
// cortados calados em 1000, e filtrava aqui) — sem página (a janela é o teto: até 366 dias, 1 por dia) — e o cache é por período.
import { fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Chamada = { tabela: string; metodos: Array<[string, unknown[]]> };
const h = vi.hoisted(() => ({
  chamadas: [] as Array<{ tabela: string; metodos: Array<[string, unknown[]]> }>,
  registros: [] as Array<Record<string, unknown>>,
  erroDia: null as string | null,
}));

/** o pedido é um HEAD (só a contagem)? — o do aviso "dia já registrado" */
const ehHead = (c: Chamada) => c.metodos.some(([m, a]) => m === "select" && (a[1] as { head?: boolean } | undefined)?.head === true);

/** o supabase-js falso: anota cada método da consulta; registros_diarios responde com o que cai no gte/lte pedido (ou, no HEAD, a
 * contagem do dia do eq) */
function consulta(tabela: string): unknown {
  const c: Chamada = { tabela, metodos: [] };
  h.chamadas.push(c);
  const p: unknown = new Proxy(() => undefined, {
    get: (_t, k) => {
      if (k === "then") {
        return (ok: (v: unknown) => void) => {
          if (tabela !== "registros_diarios") return ok({ data: [], error: null });
          if (ehHead(c)) {
            if (h.erroDia) return ok({ data: null, count: null, error: { message: h.erroDia } });
            const dia = c.metodos.find(([m, a]) => m === "eq" && a[0] === "data")?.[1][1];
            return ok({ data: null, count: h.registros.filter((r) => r.data === dia).length, error: null });
          }
          const de = c.metodos.find(([m, a]) => m === "gte" && a[0] === "data")?.[1][1] as string | undefined;
          const ate = c.metodos.find(([m, a]) => m === "lte" && a[0] === "data")?.[1][1] as string | undefined;
          ok({ data: h.registros.filter((r) => (!de || String(r.data) >= de) && (!ate || String(r.data) <= ate)), error: null });
        };
      }
      return (...a: unknown[]) => {
        c.metodos.push([String(k), a]);
        return p;
      };
    },
  });
  return p;
}
vi.mock("@/nutricao/editor/lib/banco", () => ({ supabase: { from: (t: string) => consulta(t), rpc: () => consulta("rpc") } }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: { id: "u2", email: "camila@teste.com" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { hojeISO, intervaloPreset } from "@/nutricao/editor/lib/acompanhamentoUtil";
import { PacienteProvider } from "@/nutricao/editor/ui/contexto";
import Acompanhamento from "./Acompanhamento";

// o ResponsiveContainer do recharts mede o tamanho com o ResizeObserver (o jsdom não tem)
class ObservadorFalso {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = globalThis.ResizeObserver ?? (ObservadorFalso as unknown as typeof ResizeObserver);

const montar = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PacienteProvider value={{ paciente: { id: "p1", nome: "Rafael Moura", nascimento: null, genero: null }, recarregar: async () => {}, podeEditar: true }}>
          <Acompanhamento />
        </PacienteProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );

const pedidosDeRegistros = () => h.chamadas.filter((c) => c.tabela === "registros_diarios" && c.metodos.some(([m]) => m === "gte"));
const registro = (data: string) => ({ id: `r-${data}`, paciente_id: "p1", data, agua_ml: 2000, sintomas: [], observacao: "", created_at: `${data}T10:00:00Z`, deleted_at: null });

beforeEach(() => {
  h.chamadas = [];
  h.erroDia = null;
  h.registros = ["2026-08-31", "2026-09-01", "2026-09-15", "2026-09-30", "2026-10-01"].map(registro);
});

describe("Acompanhamento — o período vai ao banco (hml-14d, D34)", () => {
  it("o pedido leva o período da URL (gte/lte na data) e a ordem estável; a lista é a do período", async () => {
    montar("/painel/alunos/p1/dieta?secao=acompanhamento&de=2026-09-01&ate=2026-09-30");
    await waitFor(() => expect(pedidosDeRegistros()).toHaveLength(1));
    const m = pedidosDeRegistros()[0].metodos;
    expect(m).toContainEqual(["eq", ["paciente_id", "p1"]]);
    expect(m).toContainEqual(["gte", ["data", "2026-09-01"]]);
    expect(m).toContainEqual(["lte", ["data", "2026-09-30"]]);
    expect(m.filter(([k]) => k === "order")).toEqual([["order", ["data", { ascending: false }]], ["order", ["created_at", { ascending: false }]], ["order", ["id", { ascending: false }]]]);
    await waitFor(() => expect(document.querySelector("[data-contagem-registros]")?.getAttribute("data-contagem-registros")).toBe("3"));
    // nenhum pedido de registros sem período
    expect(h.chamadas.filter((c) => c.tabela === "registros_diarios" && !c.metodos.some(([k]) => k === "gte"))).toHaveLength(0);
  });

  it("trocar o período pede o período novo ao banco (o cache é por período)", async () => {
    montar("/painel/alunos/p1/dieta?secao=acompanhamento&de=2026-09-01&ate=2026-09-30");
    await waitFor(() => expect(pedidosDeRegistros()).toHaveLength(1));
    fireEvent.click(document.querySelector('[data-btn-preset="30"]')!);
    const p30 = intervaloPreset(hojeISO(), 30);
    await waitFor(() => expect(pedidosDeRegistros()).toHaveLength(2));
    const m = pedidosDeRegistros()[1].metodos;
    expect(m).toContainEqual(["gte", ["data", p30.de]]);
    expect(m).toContainEqual(["lte", ["data", p30.ate]]);
  });
});

describe("o aviso \"dia já registrado\" com a tela só no período (hml-14d, D34)", () => {
  const headsDoDia = (dia: string) =>
    h.chamadas.filter((c) => c.tabela === "registros_diarios" && ehHead(c) && c.metodos.some(([m, a]) => m === "eq" && a[0] === "data" && a[1] === dia));
  const abrirDialogo = async () => {
    montar("/painel/alunos/p1/dieta?secao=acompanhamento&de=2026-09-01&ate=2026-09-30");
    await waitFor(() => expect(document.querySelector("[data-btn-novo-registro]")?.hasAttribute("disabled")).toBe(false));
    fireEvent.click(document.querySelector("[data-btn-novo-registro]")!);
    return await waitFor(() => {
      const campo = document.querySelector<HTMLInputElement>("[data-campo-data-registro]");
      expect(campo).not.toBeNull();
      return campo!;
    });
  };
  const botaoSalvar = () => document.querySelector("[data-btn-salvar-registro]")?.textContent;

  it("dia FORA do período: 1 HEAD ao banco (o dia e o aluno, só os vivos) e o aviso; DENTRO: o aviso de antes, sem pedido", async () => {
    const campo = await abrirDialogo();
    fireEvent.change(campo, { target: { value: "2026-08-31" } });
    await waitFor(() => expect(document.querySelector('[data-aviso-dia-existente="2026-08-31"][data-aviso-dia-banco]')).not.toBeNull());
    expect(document.querySelector("[data-aviso-dia-banco]")?.textContent).toContain("Já existe registro neste dia — salvar vai atualizar.");
    expect(botaoSalvar()).toBe("Salvar");
    expect(headsDoDia("2026-08-31")).toHaveLength(1);
    const m = headsDoDia("2026-08-31")[0].metodos;
    expect(m).toContainEqual(["select", ["id", { count: "exact", head: true }]]);
    expect(m).toContainEqual(["eq", ["paciente_id", "p1"]]);
    expect(m).toContainEqual(["is", ["deleted_at", null]]);
    // dentro do período: a lista da tela responde (o aviso de antes, com a água e o id), sem pedido novo
    const antes = h.chamadas.filter(ehHead).length;
    fireEvent.change(campo, { target: { value: "2026-09-15" } });
    await waitFor(() => expect(document.querySelector('[data-aviso-dia-existente="r-2026-09-15"]')).not.toBeNull());
    expect(document.querySelector("[data-aviso-dia-banco]")).toBeNull();
    expect(h.chamadas.filter(ehHead)).toHaveLength(antes);
    // fora do período e sem registro: pergunta e não avisa (a resposta do dia anterior não vale para este)
    fireEvent.change(campo, { target: { value: "2026-08-20" } });
    await waitFor(() => expect(headsDoDia("2026-08-20")).toHaveLength(1));
    await waitFor(() => expect(botaoSalvar()).toBe("Registrar"));
    expect(document.querySelector("[data-aviso-dia-existente]")).toBeNull();
  });

  it("erro do banco no HEAD: diz que não deu para conferir (nada de sumir calado)", async () => {
    h.erroDia = "statement timeout";
    const campo = await abrirDialogo();
    fireEvent.change(campo, { target: { value: "2026-08-31" } });
    await waitFor(() => expect(document.querySelector("[data-aviso-dia-erro]")).not.toBeNull());
    expect(document.querySelector("[data-aviso-dia-existente]")).toBeNull();
  });
});
