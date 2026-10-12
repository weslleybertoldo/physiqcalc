// Physiq hml-20c (H-42 · série = 1 ida — a decisão da sessão principal sobre o "TEMPO calculo_energetico série"): a seção Cálculo energético
// lia os cálculos e DEPOIS as antropometrias (2 idas em série — pela função, 2 `ler` em série estourariam a folga de +0,3 s). As 2 leituras
// não dependem uma da outra (só usam o aluno): saem JUNTAS, no MESMO lote da nutricao (1 chamada `ler` com os 2 itens), e cada resultado tem
// o MESMO tratamento de antes — o erro de uma não derruba a outra (os cálculos com a frase do erro e a lista vazia; a última antropometria
// null). Nada mais muda na seção (estados, efeitos, JSX).
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Item = { q: string } & Record<string, unknown>;
const h = vi.hoisted(() => ({ corpos: [] as Array<{ acao: string; itens: Item[] }>, falhar: new Set<string>() }));
vi.mock("@/nutricao/editor/lib/banco", () => ({
  supabase: {
    functions: {
      invoke: async (_f: string, o: { body: { acao: string; itens: Item[] } }) => {
        h.corpos.push(JSON.parse(JSON.stringify(o.body)));
        const itens = o.body.itens.map((i) => {
          if (h.falhar.has(i.q)) return { ok: false, erro: "erro_interno" };
          if (i.q === "calculos_do_aluno") return { ok: true, linhas: [{ id: "c1", data: "2026-10-01T10:00:00Z", formula: "harris_benedict", vet: 2100, tmb: 1500, get: 2000, atividades: [] }] };
          if (i.q === "antropometrias_do_aluno") return { ok: true, linhas: [{ id: "an-mais-nova" }, { id: "an-antiga" }] };
          if (i.q === "profissional") return { ok: true, linhas: [{ nome: "Camila", dados_profissionais: null }] };
          return { ok: false, erro: "consulta_invalida" };
        });
        return { data: { ok: true, itens }, error: null };
      },
    },
    from: (t: string) => {
      throw new Error(`leitura direta na tabela ${t}`);
    },
  },
}));
vi.mock("@/integrations/principal/client", () => ({ PRINCIPAL_URL: "https://principal.teste.invalid", principal: {} }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: { id: "u2", email: "camila@teste.com" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// o diálogo recebe a última antropometria (o prefill); aqui só mostra qual chegou
vi.mock("@/nutricao/editor/ui/CalculoDialog", () => ({
  default: (p: { ultimaAntropometria: { id: string } | null }) => <div data-ultima-antro={p.ultimaAntropometria?.id ?? "nenhuma"} />,
}));

import { PacienteProvider } from "@/nutricao/editor/ui/contexto";
import CalculoEnergetico from "./CalculoEnergetico";

const montar = () =>
  render(
    <MemoryRouter useTransitions={false}>
      <PacienteProvider value={{ paciente: { id: "aluno-1", nome: "Rafael Moura", nascimento: null, genero: null }, recarregar: async () => {}, podeEditar: true }}>
        <CalculoEnergetico />
      </PacienteProvider>
    </MemoryRouter>,
  );
const ultimaAntro = () => document.querySelector("[data-ultima-antro]")?.getAttribute("data-ultima-antro");
const qsDoLote = (i: number) => h.corpos[i].itens.map((x) => x.q).sort();

beforeEach(() => {
  h.corpos = [];
  h.falhar = new Set();
});

describe("Cálculo energético — os cálculos e as antropometrias numa ida só (hml-20c)", () => {
  it("abrir a seção = 1 chamada `ler` com os cálculos E as antropometrias do aluno (antes: 2 idas em série)", async () => {
    montar();
    await waitFor(() => expect(document.querySelector("[data-ultimo-calculo]")?.getAttribute("data-ultimo-calculo")).toBe("c1"));
    await waitFor(() => expect(ultimaAntro()).toBe("an-mais-nova"));
    const comAsLeituras = h.corpos.filter((c) => c.itens.some((i) => i.q === "calculos_do_aluno" || i.q === "antropometrias_do_aluno"));
    expect(comAsLeituras).toHaveLength(1);
    expect(comAsLeituras[0].acao).toBe("ler");
    expect(comAsLeituras[0].itens.filter((i) => i.q !== "profissional").map((i) => i.q).sort()).toEqual(["antropometrias_do_aluno", "calculos_do_aluno"]);
    // (o nome da nutricionista do PDF sai no mesmo lote, quando cai na mesma volta)
    expect(qsDoLote(0)).toContain("calculos_do_aluno");
  });

  it("os cálculos falham: a frase do erro e a lista vazia (como antes) — a última antropometria chega igual", async () => {
    h.falhar.add("calculos_do_aluno");
    montar();
    await waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toBe("Não deu para carregar agora. Tente de novo."));
    expect(document.querySelector("[data-lista-calculos]")).toBeNull();
    await waitFor(() => expect(ultimaAntro()).toBe("an-mais-nova"));
  });

  it("as antropometrias falham: a última antropometria fica null (como antes) — os cálculos chegam iguais, sem aviso de erro", async () => {
    h.falhar.add("antropometrias_do_aluno");
    montar();
    await waitFor(() => expect(document.querySelector("[data-ultimo-calculo]")?.getAttribute("data-ultimo-calculo")).toBe("c1"));
    expect(ultimaAntro()).toBe("nenhuma");
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });
});
