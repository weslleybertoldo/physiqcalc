// Physiq hml-26 (a revisão, achado 1 — a decisão da sessão principal, 15/10): o Treino de OUTRA conta (a treino-leitura responde 403
// sem_acesso de propósito, supabase/functions/treino-leitura/index.ts) NÃO é queda para os números do cabeçalho nem para o card Evolução
// (src/painel/aluno/kpis/KpiPesoGordura.test.tsx e src/painel/aluno/resumo/CardEvolucao.test.tsx), mas a aba Avaliação fica COMO ESTÁ: ela
// lê a falha do Treino como verdadeira e mostra o aviso de hoje ("As avaliações do treino (personal) não carregaram agora." + Tentar), com
// as avaliações da parte que veio. O caminho de verdade até a "rede" (a aba, o useAvaliacaoDoAluno, o usePerfilAluno, as libs e o leitor em
// lote, com o cliente do React Query do app): só o invoke da função, a parte do Treino e o estado do Treino de quem abre
// (useTreinoDoAlunoPainel, a sessão do Treino) são falsos.
import { fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ALUNO = "a1a1a1a1-0000-4000-8000-0000000000ff"; // o id da rota do painel

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  treino: vi.fn(),
  corpos: [] as Array<{ acao?: unknown; itens?: Array<Record<string, unknown>> }>,
}));
vi.mock("@/integrations/principal/client", () => ({
  PRINCIPAL_SCHEMA: "staging",
  PRINCIPAL_URL: "https://principal.teste.invalid",
  principalConfigurado: true,
  principal: {
    functions: { invoke: (f: string, o: { body: Record<string, unknown> }) => h.invoke(f, o) },
    rpc: (f: string) => {
      throw new Error(`RPC direta ${f}`);
    },
    from: (t: string) => {
      throw new Error(`leitura direta na tabela ${t}`);
    },
    storage: {
      from: () => {
        throw new Error("Storage direto");
      },
    },
    auth: { getSession: async () => ({ data: { session: null } }) },
  },
}));
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "staging", supabase: { functions: { invoke: vi.fn() } } }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ treino: { estado: "pronto", erro: null } }) }));
vi.mock("@/painel/aluno/avaliacao/fontes", async (original) => ({
  ...(await original<typeof import("@/painel/aluno/avaliacao/fontes")>()),
  carregarTreinoDoPainel: (id: string) => h.treino(id),
}));
// quem abre não vê o Treino desse aluno (o perfil do Treino é de outra conta)
vi.mock("@/treino/editor/useTreinoDoAlunoPainel", () => ({ useTreinoDoAlunoPainel: () => ({ tipo: "sem-acesso" }) }));

import { ErroFonte } from "@/evolucao/fontes";
import { hojeSP } from "@/evolucao/serie";
import { criarClienteDeConsultas } from "@/integrations/consultas";
import { perfil } from "@/test/fixturesPerfilAluno";
import Avaliacao from "./Avaliacao";

/** yyyy-mm-dd de N dias atrás no fuso de São Paulo: a série cabe nos 6 meses em qualquer dia em que o teste rodar. */
const diasAtras = (n: number) => hojeSP(new Date(Date.now() - n * 86_400_000));

const PERFIL = perfil({ rota_id: ALUNO, modulos: ["treino", "nutricao"] });
const PRINCIPAL = {
  paciente_id: "p1",
  objetivo: "emagrecer",
  fotos: [],
  antropometrias: [
    { id: "an1", data: diasAtras(100), peso: 82.7, resultados: { percentual_gordura: 20.3 } },
    { id: "an2", data: diasAtras(20), peso: 81.8, resultados: { percentual_gordura: 19.3 } },
  ],
};

type Item = { ok: true; valor: unknown } | { ok: false; erro: string };
let respostas: Record<string, Item>;
const okDe = (valor: unknown): Item => ({ ok: true, valor });

function montar() {
  return render(
    <QueryClientProvider client={criarClienteDeConsultas()}>
      <MemoryRouter initialEntries={[`/painel/alunos/${ALUNO}/avaliacao`]}>
        <Avaliacao alunoId={ALUNO} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

let avisos: ReturnType<typeof vi.spyOn> | undefined;
beforeEach(() => {
  respostas = { aluno_perfil: okDe(PERFIL), aluno_evolucao_painel: okDe(PRINCIPAL) };
  h.corpos = [];
  h.invoke.mockReset().mockImplementation(async (funcao: string, o: { body: { acao?: unknown; itens?: Array<Record<string, unknown>> } }) => {
    expect(funcao).toBe("nutricao");
    const corpo = JSON.parse(JSON.stringify(o.body)) as { acao?: unknown; itens?: Array<Record<string, unknown>> };
    h.corpos.push(corpo);
    return { data: { ok: true, itens: (corpo.itens ?? []).map((i) => respostas[String(i.q)] ?? { ok: false, erro: "consulta_invalida" }) }, error: null };
  });
  h.treino.mockReset();
  avisos?.mockRestore();
  avisos = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("hml-26 (a revisão, achado 1) — a aba Avaliação com o Treino de OUTRA conta (403 sem_acesso)", () => {
  it("fica como está: o aviso 'As avaliações do treino (personal) não carregaram agora.' + Tentar, com as avaliações do principal; o Tentar lê de novo e o aviso fica", async () => {
    h.treino.mockRejectedValue(new ErroFonte("treino", "sem_acesso"));
    montar();
    await waitFor(() => expect(document.querySelector("[data-avaliacao-aviso]")).not.toBeNull());
    expect(document.querySelector("[data-avaliacao-aviso]")?.textContent).toBe("As avaliações do treino (personal) não carregaram agora. Tentar");
    expect(document.querySelector("[data-aba-avaliacao]")?.getAttribute("data-avaliacao-total")).toBe("2"); // as 2 do principal
    const antes = h.treino.mock.calls.length;
    fireEvent.click(document.querySelector<HTMLButtonElement>("[data-avaliacao-tentar]")!);
    await waitFor(() => expect(h.treino.mock.calls.length).toBeGreaterThan(antes)); // o Tentar de hoje: a série lida de novo
    await new Promise((r) => setTimeout(r, 50));
    expect(document.querySelector("[data-avaliacao-aviso]")?.textContent).toBe("As avaliações do treino (personal) não carregaram agora. Tentar");
  });
});
