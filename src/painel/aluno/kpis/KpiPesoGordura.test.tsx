// Physiq hml-26 (H-128): os números Peso e Gordura do cabeçalho do aluno (KpiPeso e KpiGordura) com a série INCOMPLETA. A série junta a
// parte do Treino (a treino-leitura) e a do principal (a aluno_evolucao_painel, pela nutricao); antes, com UMA parte em erro, o número saía
// da parte que veio, sem aviso (medido na w5p-aluna: 2,2 kg e 2,7 pontos com a série inteira × 0,9 kg e 1,0 ponto só com o principal).
// Agora: "—" no lugar do valor e "dado parcial" embaixo (nunca a conta com metade da série) e a parte que falhou é buscada de novo sozinha
// (até 3 vezes, com espera curta; depois o "—" fica até a próxima abertura ou o foco); voltou → o número da série inteira.
// A revisão (achado 1): o Treino de OUTRA conta (a treino-leitura responde 403 sem_acesso de propósito) NÃO é queda — a série visível por
// essa conta É a do principal: o número dela, sem "dado parcial" e sem pedir o Treino de novo.
// O caminho de verdade até a "rede" (os 2 KPIs, o useAvaliacaoDoAluno, o usePerfilAluno, as libs e o leitor em lote, com o cliente do React
// Query do app): só o invoke da função e a parte do Treino são falsos, como em src/painel/aluno/avaliacao/useAvaliacaoDoAluno.test.tsx.
import { act, render, waitFor, within } from "@testing-library/react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
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
import { hojeSP } from "@/evolucao/serie";
import { criarClienteDeConsultas } from "@/integrations/consultas";
import { perfil } from "@/test/fixturesPerfilAluno";
import { chaveAvaliacao } from "../avaliacao/useAvaliacaoDoAluno";
import KpiGordura from "./KpiGordura";
import KpiPeso from "./KpiPeso";

/** yyyy-mm-dd de N dias atrás no fuso de São Paulo (o mesmo "hoje" do KPI): a série cabe nos 6 meses em qualquer dia em que o teste rodar. */
const diasAtras = (n: number) => hojeSP(new Date(Date.now() - n * 86_400_000));

const PERFIL = perfil({ rota_id: ALUNO, modulos: ["treino", "nutricao"] });
// a série inteira, em ordem de data: Treino 84,0 kg/22,0% → principal 82,7/20,3 → Treino 82,5/20,6 → principal 81,8/19,3
//   · inteira: 81,8 kg · 2,2 kg em 6 meses · 19,3% · 2,7 pontos (o certo);
//   · só o principal (o Treino falhou — o caso medido): 0,9 kg e 1,0 ponto; só o Treino (o principal falhou): 82,5 kg · 1,5 kg e 1,4 pontos
const TREINO = {
  parte: {
    perfil: null,
    fotos: [],
    avaliacoes: [
      { id: "t1", data_avaliacao: diasAtras(150), created_at: null, peso: 84.0, percentual_gordura: 22.0 },
      { id: "t2", data_avaliacao: diasAtras(60), created_at: null, peso: 82.5, percentual_gordura: 20.6 },
    ],
  },
  treinoUserId: "t-user",
  proxima: null,
};
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
/** As respostas de cada consulta do `ler`, em fila: cada ida usa a 1ª; a última fica (repete nas idas seguintes). */
let respostas: Record<string, Item[]>;
const responder = (q: string): Item => {
  const fila = respostas[q];
  if (!fila?.length) return { ok: false, erro: "consulta_invalida" };
  return fila.length > 1 ? (fila.shift() as Item) : fila[0];
};
/** As consultas de cada ida à nutricao, na ordem. */
const idas = () => h.corpos.map((c) => (c.itens ?? []).map((i) => String(i.q)));
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

function montar(qc: QueryClient = criarClienteDeConsultas()) {
  const tela = render(
    <QueryClientProvider client={qc}>
      <KpiPeso alunoId={ALUNO} />
      <KpiGordura alunoId={ALUNO} />
    </QueryClientProvider>,
  );
  return { qc, ...tela };
}

const kpi = (rotulo: "Peso" | "Gordura") => document.querySelector<HTMLElement>(`[data-kpi-compacto="${rotulo}"]`);
/** Os KPIs que mostram "—" + "dado parcial" (e nenhum número). */
const parciais = () =>
  (["Peso", "Gordura"] as const).filter((r) => {
    const k = kpi(r);
    return !!k && within(k).queryByText("—") !== null && within(k).queryByText("dado parcial") !== null && !/\d/.test(k.textContent ?? "");
  });
const numeros = () => document.querySelectorAll("[data-kpi-peso], [data-kpi-gordura]").length;

/** A série inteira na tela: os 2 números com a variação certa (2,2 kg e 2,7 pontos), sem "dado parcial". */
async function esperarSerieInteira() {
  await waitFor(() => {
    expect(kpi("Peso")?.textContent).toBe("Peso81,8 kg2,2 kg em 6 meses");
    expect(kpi("Gordura")?.textContent).toBe("Gordura19,3%2,7 pontos");
  });
  expect(document.querySelector("[data-kpi-peso]")?.getAttribute("data-kpi-peso")).toBe("81.8");
  expect(document.querySelector("[data-kpi-gordura]")?.getAttribute("data-kpi-gordura")).toBe("19.3");
  expect(document.body.textContent).not.toContain("dado parcial");
}

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

describe("hml-26 (H-128) — Peso e Gordura do cabeçalho com uma parte da série em erro", () => {
  it("(a) as 2 partes ok: o número de hoje (a série inteira — 81,8 kg · 2,2 kg em 6 meses; 19,3% · 2,7 pontos); nada buscado de novo", async () => {
    montar();
    await esperarSerieInteira();
    expect(parciais()).toEqual([]);
    expect(h.treino).toHaveBeenCalledTimes(1);
    expect(idas()).toHaveLength(1);
  });

  it("(b) a parte do Treino em erro: '—' + 'dado parcial' nos 2, nenhum número; ela é buscada de novo sozinha até 3 vezes e para", async () => {
    h.treino.mockRejectedValue(erroDoTreino());
    montar();
    await waitFor(() => expect(parciais()).toEqual(["Peso", "Gordura"]));
    expect(numeros()).toBe(0);
    // a nova tentativa é SÓ da parte do Treino (o principal que veio fica): 1 + 3 = 4 pedidos, e nenhum depois
    await waitFor(() => expect(h.treino).toHaveBeenCalledTimes(4), { timeout: 6000 });
    await new Promise((r) => setTimeout(r, 1600));
    expect(h.treino).toHaveBeenCalledTimes(4);
    expect(idas()).toHaveLength(1);
    expect(parciais()).toEqual(["Peso", "Gordura"]);
    expect(numeros()).toBe(0);
  }, 12_000);

  it("(c) a parte do principal em erro: '—' + 'dado parcial' nos 2, nenhum número; só a aluno_evolucao_painel é pedida de novo (3 vezes)", async () => {
    respostas.aluno_evolucao_painel = [FALHA];
    montar();
    await waitFor(() => expect(parciais()).toEqual(["Peso", "Gordura"]));
    expect(numeros()).toBe(0);
    await waitFor(() => expect(idas()).toHaveLength(4), { timeout: 6000 });
    await new Promise((r) => setTimeout(r, 1600));
    expect(idas()).toEqual([
      expect.arrayContaining(["aluno_perfil", "aluno_evolucao_painel"]),
      ["aluno_evolucao_painel"],
      ["aluno_evolucao_painel"],
      ["aluno_evolucao_painel"],
    ]);
    expect(h.treino).toHaveBeenCalledTimes(1);
    expect(parciais()).toEqual(["Peso", "Gordura"]);
    expect(numeros()).toBe(0);
  }, 12_000);

  it("(d) a parte do Treino falha e volta na nova tentativa: '—' + 'dado parcial' enquanto ela está no ar, depois o número da série inteira", async () => {
    const segunda = adiado<typeof TREINO>();
    h.treino.mockRejectedValueOnce(erroDoTreino()).mockImplementationOnce(() => segunda.promessa);
    montar();
    await waitFor(() => expect(parciais()).toEqual(["Peso", "Gordura"]));
    await waitFor(() => expect(h.treino).toHaveBeenCalledTimes(2));
    expect(parciais()).toEqual(["Peso", "Gordura"]); // a nova tentativa no ar: ainda sem número
    expect(numeros()).toBe(0);
    segunda.soltar(TREINO);
    await esperarSerieInteira();
    expect(h.treino).toHaveBeenCalledTimes(2);
    expect(idas()).toHaveLength(1); // o principal que veio não é pedido de novo
  });

  it("(d) a parte do principal falha e volta na nova tentativa: o número da série inteira (o Treino não é pedido de novo)", async () => {
    respostas.aluno_evolucao_painel = [FALHA, okDe(PRINCIPAL)];
    montar();
    await waitFor(() => expect(parciais()).toEqual(["Peso", "Gordura"]));
    await esperarSerieInteira();
    expect(idas()).toEqual([expect.arrayContaining(["aluno_perfil", "aluno_evolucao_painel"]), ["aluno_evolucao_painel"]]);
    expect(h.treino).toHaveBeenCalledTimes(1);
  });

  it("(e) as 2 partes em erro (a consulta em erro, depois da 1 nova tentativa dela): '—' + 'dado parcial' nos 2, nenhum número", async () => {
    h.treino.mockRejectedValue(erroDoTreino());
    respostas.aluno_evolucao_painel = [FALHA];
    const { qc } = montar();
    await waitFor(() => expect(qc.getQueryState(chaveAvaliacao(ALUNO))?.status).toBe("error"), { timeout: 4000 });
    await waitFor(() => expect(parciais()).toEqual(["Peso", "Gordura"]));
    expect(numeros()).toBe(0);
    expect(h.treino).toHaveBeenCalledTimes(2); // o retry de hoje da consulta (1 vez); nada a mais
  });

  it("(f) sem avaliação nenhuma (as 2 partes ok e vazias): como hoje — os 2 não aparecem", async () => {
    h.treino.mockResolvedValue({ ...TREINO, parte: { perfil: null, fotos: [], avaliacoes: [] } });
    respostas.aluno_evolucao_painel = [okDe({ ...PRINCIPAL, antropometrias: [] })];
    const { qc, container } = montar();
    await waitFor(() => expect(qc.getQueryState(chaveAvaliacao(ALUNO))?.status).toBe("success"));
    await new Promise((r) => setTimeout(r, 50));
    expect(container.innerHTML).toBe("");
    expect(h.treino).toHaveBeenCalledTimes(1);
    expect(idas()).toHaveLength(1);
  });

  it("depois das 3 novas tentativas, o '—' fica até o foco: a tela volta ao foco, a parte é buscada de novo e o número certo aparece", async () => {
    h.treino.mockRejectedValue(erroDoTreino());
    montar();
    await waitFor(() => expect(h.treino).toHaveBeenCalledTimes(4), { timeout: 6000 });
    await new Promise((r) => setTimeout(r, 300));
    expect(parciais()).toEqual(["Peso", "Gordura"]);
    h.treino.mockResolvedValue(TREINO);
    window.dispatchEvent(new Event("visibilitychange"));
    await esperarSerieInteira();
    expect(h.treino).toHaveBeenCalledTimes(5);
    expect(idas()).toHaveLength(1);
  }, 12_000);

  it("o Treino de OUTRA conta (403 sem_acesso, de propósito): não é queda — o número da série do principal, sem 'dado parcial'; 1 pedido do Treino só, nem no foco", async () => {
    h.treino.mockRejectedValue(new ErroFonte("treino", "sem_acesso"));
    montar();
    // a série visível por esta conta É a do principal (82,7 → 81,8 kg; 20,3 → 19,3%): o número de antes da hml-26
    await waitFor(() => {
      expect(kpi("Peso")?.textContent).toBe("Peso81,8 kg0,9 kg em 6 meses");
      expect(kpi("Gordura")?.textContent).toBe("Gordura19,3%1,0 ponto");
    });
    expect(parciais()).toEqual([]);
    expect(document.body.textContent).not.toContain("dado parcial");
    await new Promise((r) => setTimeout(r, 1200)); // a nova tentativa sairia logo (e a seguinte em 1 s): nenhuma
    expect(h.treino).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("visibilitychange")); // o mesmo foco do caso de cima
    await new Promise((r) => setTimeout(r, 300));
    expect(h.treino).toHaveBeenCalledTimes(1);
    expect(idas()).toHaveLength(1);
    expect(kpi("Peso")?.textContent).toBe("Peso81,8 kg0,9 kg em 6 meses");
  }, 10_000);

  it("a releitura começa do zero (a nova tentativa é por leitura): o Treino cai 1× e volta → o número; recarregar com o principal caindo 1× → '—' + 'dado parcial' e, com a nova tentativa da leitura NOVA, o número", async () => {
    h.treino.mockRejectedValueOnce(erroDoTreino()).mockResolvedValue(TREINO);
    const { qc } = montar();
    await esperarSerieInteira(); // a 1ª leitura: o Treino voltou na nova tentativa dela
    expect(h.treino).toHaveBeenCalledTimes(2);
    // a releitura (o que o recarregar faz): o principal cai 1× e a nova tentativa DESTA leitura fica no ar até o teste soltar
    respostas.aluno_evolucao_painel = [FALHA, okDe(PRINCIPAL)];
    const noAr = adiado<void>();
    const responderJa = h.invoke.getMockImplementation()!;
    h.invoke.mockImplementation(async (f: string, o: { body: Record<string, unknown> }) => {
      if (h.corpos.length >= 2) await noAr.promessa;
      return responderJa(f, o);
    });
    await act(async () => {
      await qc.invalidateQueries({ queryKey: chaveAvaliacao(ALUNO) });
    });
    await waitFor(() => expect(parciais()).toEqual(["Peso", "Gordura"]));
    expect(numeros()).toBe(0);
    // a leitura nova busca o principal de novo (a da 1ª leitura, que trouxe o Treino, não serve para ela)
    await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(3));
    noAr.soltar();
    await esperarSerieInteira();
    expect(idas()).toEqual([expect.arrayContaining(["aluno_perfil", "aluno_evolucao_painel"]), ["aluno_evolucao_painel"], ["aluno_evolucao_painel"]]);
    expect(h.treino).toHaveBeenCalledTimes(3);
  });

  it("a nova tentativa não repete o que não adianta: a 1ª carga do Treino cai na rede e a nova tentativa volta aluno_inexistente → para nela (2 pedidos do Treino, não 4); '—' + 'dado parcial'", async () => {
    // o aluno_inexistente é o 404 da treino-leitura (o sem_acesso e o sem_login também não se repetem)
    h.treino.mockRejectedValueOnce(new ErroFonte("treino", "sem_internet")).mockRejectedValue(new ErroFonte("treino", "aluno_inexistente"));
    montar();
    await waitFor(() => expect(parciais()).toEqual(["Peso", "Gordura"]));
    await waitFor(() => expect(h.treino).toHaveBeenCalledTimes(2)); // a carga + a 1ª nova tentativa
    await new Promise((r) => setTimeout(r, 2800)); // as 2 seguintes sairiam com 1 s entre elas: nenhuma
    expect(h.treino).toHaveBeenCalledTimes(2);
    expect(idas()).toHaveLength(1);
    expect(parciais()).toEqual(["Peso", "Gordura"]);
    expect(numeros()).toBe(0);
  }, 10_000);
});
