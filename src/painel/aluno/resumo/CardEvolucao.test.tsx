// Physiq hml-26 (H-128, a ampliação da sessão principal): o card Evolução do Resumo do aluno com a série INCOMPLETA — a mesma regra dos
// números Peso e Gordura do cabeçalho (src/painel/aluno/kpis/KpiPesoGordura.test.tsx). Antes, com UMA parte da série em erro (a do Treino,
// pela treino-leitura, ou a do principal, pela aluno_evolucao_painel), o Peso, o Músculo, o chip da última avaliação e o gráfico do peso
// saíam da parte que veio, sem aviso. Agora: "—" no Peso e no Músculo, sem o chip e sem o gráfico, e "dado parcial" no lugar dele; a
// parte que falhou é buscada de novo sozinha (o hook) e, quando volta, os números e o gráfico da série inteira. As 2 partes em erro: o
// "Não deu para carregar agora." de hoje. O caminho de verdade até a "rede" (o card, o useAvaliacaoDoAluno, o usePerfilAluno, as libs e o
// leitor em lote, com o cliente do React Query do app): só o invoke da função e a parte do Treino são falsos.
import { render, waitFor } from "@testing-library/react";
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

import { ErroFonte } from "@/evolucao/fontes";
import { dataCurta } from "@/evolucao/formato";
import { hojeSP } from "@/evolucao/serie";
import { criarClienteDeConsultas } from "@/integrations/consultas";
import { perfil } from "@/test/fixturesPerfilAluno";
import CardEvolucao from "./CardEvolucao";

/** yyyy-mm-dd de N dias atrás no fuso de São Paulo (o mesmo "hoje" do card): a série cabe nos 6 meses em qualquer dia em que o teste rodar. */
const diasAtras = (n: number) => hojeSP(new Date(Date.now() - n * 86_400_000));

const PERFIL = perfil({ rota_id: ALUNO, modulos: ["treino", "nutricao"] });
const PROXIMA = diasAtras(-30); // a próxima avaliação marcada no perfil do Treino (daqui a 30 dias)
// a série inteira, em ordem de data: Treino 84,0 kg → principal 82,7 → Treino 82,5 → principal 81,8 (a massa magra: 64,0 · 63,9 · 64,6 · 64,3)
//   · inteira: Peso 81,8 kg · M. magra 64,3 kg · o gráfico com os 4 pesos (o certo);
//   · só o principal (o Treino falhou): 81,8 kg · 64,3 kg · o gráfico com 2; só o Treino (o principal falhou): 82,5 kg · 64,6 kg · 2
const TREINO = {
  parte: {
    perfil: null,
    fotos: [],
    avaliacoes: [
      { id: "t1", data_avaliacao: diasAtras(150), created_at: null, peso: 84.0, percentual_gordura: 22.0, massa_magra: 64.0 },
      { id: "t2", data_avaliacao: diasAtras(60), created_at: null, peso: 82.5, percentual_gordura: 20.6, massa_magra: 64.6 },
    ],
  },
  treinoUserId: "t-user",
  proxima: PROXIMA,
};
const PRINCIPAL = {
  paciente_id: "p1",
  objetivo: "emagrecer",
  fotos: [],
  antropometrias: [
    { id: "an1", data: diasAtras(100), peso: 82.7, resultados: { percentual_gordura: 20.3, massa_magra: 63.9 } },
    { id: "an2", data: diasAtras(20), peso: 81.8, resultados: { percentual_gordura: 19.3, massa_magra: 64.3 } },
  ],
};

type Item = { ok: true; valor: unknown } | { ok: false; erro: string };
/** As respostas de cada consulta do `ler`, em fila: cada ida usa a 1ª; a última fica (repete nas idas seguintes). */
let respostas: Record<string, Item[]>;
const responder = (q: string): Item => {
  const fila = respostas[q];
  if (!fila?.length) return { ok: false, erro: "consulta_invalida" };
  return fila.length > 1 ? (fila.shift() as Item) : fila[0];
};
const okDe = (valor: unknown): Item => ({ ok: true, valor });
const FALHA: Item = { ok: false, erro: "erro_interno" };
const erroDoTreino = () => new ErroFonte("treino", "erro_interno");

function adiado<T>() {
  let soltar!: (v: T) => void;
  const promessa = new Promise<T>((ok) => {
    soltar = ok;
  });
  return { promessa, soltar };
}

function montar() {
  return render(
    <QueryClientProvider client={criarClienteDeConsultas()}>
      <MemoryRouter useTransitions={false}>
        <CardEvolucao alunoId={ALUNO} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const texto = (sel: string) => document.querySelector(sel)?.textContent ?? null;
/** O que o card mostra agora: os números (o valor de cada um), o chip da última avaliação, o gráfico (quantos pesos) e o "dado parcial". */
const tela = () => ({
  peso: texto('[data-card-evolucao-numero="peso"] b'),
  musculo: texto('[data-card-evolucao-numero="musculo"] b'),
  proxima: texto('[data-card-evolucao-numero="proxima"] b'),
  chip: !!document.querySelector("[data-card-evolucao-ultima]"),
  grafico: document.querySelector("[data-card-evolucao-grafico]")?.getAttribute("data-card-evolucao-grafico") ?? null,
  parcial: texto("[data-card-evolucao-parcial]"),
});
/** A série inteira na tela: os números certos, o chip e o gráfico dos 4 pesos, sem "dado parcial". */
const INTEIRA = { peso: "81,8 kg", musculo: "64,3 kg", proxima: dataCurta(PROXIMA), chip: true, grafico: "4", parcial: null };
/** A série incompleta: nenhum número nem gráfico da metade dela — o "—" e o "dado parcial"; a Próxima (do perfil do Treino) quando ele veio. */
const parcialCom = (proxima: string) => ({ peso: "—", musculo: "—", proxima, chip: false, grafico: null, parcial: "dado parcial" });

let avisos: ReturnType<typeof vi.spyOn> | undefined;
beforeEach(() => {
  respostas = { aluno_perfil: [okDe(PERFIL)], aluno_evolucao_painel: [okDe(PRINCIPAL)] };
  h.corpos = [];
  h.invoke.mockReset().mockImplementation(async (funcao: string, o: { body: { acao?: unknown; itens?: Array<Record<string, unknown>> } }) => {
    expect(funcao).toBe("nutricao");
    const corpo = JSON.parse(JSON.stringify(o.body)) as { acao?: unknown; itens?: Array<Record<string, unknown>> };
    h.corpos.push(corpo);
    return { data: { ok: true, itens: (corpo.itens ?? []).map((i) => responder(String(i.q))) }, error: null };
  });
  h.treino.mockReset().mockResolvedValue(TREINO);
  avisos?.mockRestore();
  avisos = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("hml-26 (H-128) — o card Evolução do Resumo com uma parte da série em erro", () => {
  it("as 2 partes ok: os números de hoje (Peso 81,8 kg · M. magra 64,3 kg · a Próxima), o chip da última avaliação e o gráfico com os 4 pesos", async () => {
    montar();
    await waitFor(() => expect(tela()).toEqual(INTEIRA));
    expect(document.querySelector("[data-card-evolucao-numeros]")).not.toBeNull();
  });

  it("a parte do Treino em erro: nenhum número nem gráfico da metade da série — '—' no Peso e no Músculo, sem o chip, 'dado parcial' no lugar do gráfico", async () => {
    h.treino.mockRejectedValue(erroDoTreino());
    montar();
    await waitFor(() => expect(tela()).toEqual(parcialCom("—")));
    expect(document.querySelector("[data-card-evolucao-numeros]")).toBeNull();
    // ela é buscada de novo sozinha (a nova tentativa do hook, até 3 vezes) e, sem voltar, o card segue sem número
    await waitFor(() => expect(h.treino).toHaveBeenCalledTimes(4), { timeout: 6000 });
    expect(tela()).toEqual(parcialCom("—"));
  }, 10_000);

  it("a parte do principal em erro: o mesmo — nenhum número nem gráfico; a Próxima (a data do perfil do Treino, que veio) fica", async () => {
    respostas.aluno_evolucao_painel = [FALHA];
    montar();
    await waitFor(() => expect(tela()).toEqual(parcialCom(dataCurta(PROXIMA))));
    expect(document.querySelector("[data-card-evolucao-numeros]")).toBeNull();
  });

  it("a parte que falhou volta na nova tentativa: '—' + 'dado parcial' enquanto ela está no ar, depois os números e o gráfico da série inteira", async () => {
    const segunda = adiado<typeof TREINO>();
    h.treino.mockRejectedValueOnce(erroDoTreino()).mockImplementationOnce(() => segunda.promessa);
    montar();
    await waitFor(() => expect(tela()).toEqual(parcialCom("—")));
    await waitFor(() => expect(h.treino).toHaveBeenCalledTimes(2));
    expect(tela()).toEqual(parcialCom("—"));
    segunda.soltar(TREINO);
    await waitFor(() => expect(tela()).toEqual(INTEIRA));
  });

  it("as 2 partes em erro: o 'Não deu para carregar agora.' de hoje (sem número, sem gráfico)", async () => {
    h.treino.mockRejectedValue(erroDoTreino());
    respostas.aluno_evolucao_painel = [FALHA];
    montar();
    await waitFor(() => expect(texto("[data-card-evolucao]")).toContain("Não deu para carregar agora."), { timeout: 4000 });
    expect(tela()).toEqual({ peso: null, musculo: null, proxima: null, chip: false, grafico: null, parcial: null });
  });
});
