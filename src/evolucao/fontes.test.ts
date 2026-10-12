// Physiq hml-14d (B21 · D30): a Evolução do app lê as 200 avaliações MAIS NOVAS (antes, as 200 mais antigas — acima de 200 a
// avaliação nova sumia do gráfico) e as devolve em ordem crescente, como antes; as fotos mensais também param em 200 (as mais
// novas). O banco do Treino é falso: aplica o eq, a ordem e o limite da consulta sobre as linhas do teste.
// hml-20a (H-42 · jeito 2, etapa 2): a parte do PRINCIPAL sai do servidor (nutricao › ler, aluno_evolucao: a tela não lê direto na RPC
// nem no Storage do principal); a parte do TREINO FICA no navegador, igual ao 637363f (o desvio 23 do docs/desvios.md — o gate J): as 3
// leituras pelo REST do Treino e a assinatura do `registros` em lote, sem chamar a admin-avaliacoes.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Linha = Record<string, unknown>;
interface Consulta {
  tabela: string;
  filtros: Array<[string, unknown]>;
  ordem: Array<[string, boolean]>;
  limite: number | null;
  unico: boolean;
}

const h = vi.hoisted(() => ({
  tabelas: {} as Record<string, Array<Record<string, unknown>>>,
  consultas: [] as Consulta[],
  erro: null as null | { message: string },
  assinaturas: [] as Array<{ bucket: string; caminhos: string[]; validade: number }>,
  principal: vi.fn(),
  /** o que não pode acontecer: a função do Treino (o desvio) e a leitura direta no principal */
  proibido: (onde: string) => () => {
    throw new Error(`proibido: ${onde}`);
  },
}));

vi.mock("@/integrations/supabase/client", () => {
  const executar = (c: Consulta) => {
    if (h.erro && c.tabela === "physiq_avaliacoes") return { data: null, error: h.erro };
    let linhas = (h.tabelas[c.tabela] ?? []).filter((l) => c.filtros.every(([col, v]) => l[col] === v));
    linhas = [...linhas].sort((a, b) => {
      for (const [col, asc] of c.ordem) {
        const x = String(a[col]);
        const y = String(b[col]);
        if (x !== y) return (x < y ? -1 : 1) * (asc ? 1 : -1);
      }
      return 0;
    });
    // o PostgREST corta em 1000 sem avisar (max_rows)
    linhas = linhas.slice(0, Math.min(c.limite ?? Infinity, 1000));
    return { data: c.unico ? (linhas[0] ?? null) : linhas, error: null };
  };
  const from = (tabela: string) => {
    const c: Consulta = { tabela, filtros: [], ordem: [], limite: null, unico: false };
    h.consultas.push(c);
    const b = {
      select: () => b,
      eq: (col: string, v: unknown) => (c.filtros.push([col, v]), b),
      order: (col: string, o?: { ascending?: boolean }) => (c.ordem.push([col, o?.ascending !== false]), b),
      limit: (n: number) => ((c.limite = n), b),
      maybeSingle: () => ((c.unico = true), b),
      then: (ok: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) => Promise.resolve(executar(c)).then(ok, falhou),
    };
    return b;
  };
  const storage = {
    from: (bucket: string) => ({
      createSignedUrls: async (caminhos: string[], validade: number) => {
        h.assinaturas.push({ bucket, caminhos, validade });
        return { data: caminhos.map((p) => ({ path: p, error: null, signedUrl: `https://treino.teste.invalid/storage/v1/object/sign/${bucket}/${p}?token=t` })), error: null };
      },
    }),
  };
  return { DB_SCHEMA: "staging", supabase: { from, storage, functions: { invoke: h.proibido("função do Treino (a admin-avaliacoes › minha_evolucao)") } } };
});
vi.mock("@/integrations/principal/client", () => ({
  PRINCIPAL_SCHEMA: "staging",
  PRINCIPAL_URL: "https://principal.teste.invalid",
  principalConfigurado: true,
  principal: {
    functions: { invoke: (...a: unknown[]) => h.principal(...a) },
    from: h.proibido("tabela do principal"),
    rpc: h.proibido("RPC do principal"),
    storage: { from: h.proibido("Storage do principal") },
  },
}));

import { carregarPrincipal, carregarTreino, ErroFonte, MAX_AVALIACOES, MAX_FOTOS } from "./fontes";
// hml-20c (H-106): a montagem da URL relativa é UMA só (src/nutricao/leitura.ts) — o fontes.ts a importa; os mesmos casos de antes
import { urlAssinadaDoServidor } from "@/nutricao/leitura";
const urlDoServidor = (base: string, relativa: unknown) => urlAssinadaDoServidor(relativa, base);

const semAssinar = async () => ({});
const recusa = (status: number, corpo: unknown) => ({
  data: null,
  error: { name: "FunctionsHttpError", context: new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } }) },
});
const dataDe = (i: number) => {
  const d = new Date(Date.UTC(2009, 0, 1) + i * 20 * 86_400_000);
  return d.toISOString().slice(0, 10);
};
const avaliacao = (i: number, uid = "t1"): Linha => ({
  id: `av-${String(i).padStart(4, "0")}`, user_id: uid, data_avaliacao: dataDe(i), peso: 80 - i * 0.01,
});

beforeEach(() => {
  h.tabelas = { physiq_profiles: [{ id: "t1", peso: 78 }], physiq_avaliacoes: [], physiq_registros_fotos: [] };
  h.consultas = [];
  h.erro = null;
  h.assinaturas = [];
  h.principal.mockReset();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

describe("Evolução do app — as avaliações mais novas (hml-14d, D30)", () => {
  it("com 201 avaliações, a mais nova fica (sai a mais antiga) e a lista volta em ordem crescente", async () => {
    h.tabelas.physiq_avaliacoes = [...Array.from({ length: 201 }, (_, i) => avaliacao(i)), avaliacao(500, "outro")];
    const parte = await carregarTreino("t1", semAssinar);
    const ids = parte.avaliacoes.map((a) => a.id);
    expect(MAX_AVALIACOES).toBe(200);
    expect(ids).toHaveLength(200);
    expect(ids).toContain("av-0200"); // a mais nova
    expect(ids).not.toContain("av-0000"); // a mais antiga sai
    expect(ids[0]).toBe("av-0001");
    expect(ids.at(-1)).toBe("av-0200");
    const datas = parte.avaliacoes.map((a) => String(a.data_avaliacao));
    expect([...datas].sort()).toEqual(datas);
    expect(parte.perfil).toEqual({ id: "t1", peso: 78 });
  });

  it("o pedido: data desc + id desc (desempate), limite 200; no mesmo dia, o id decide (crescente na resposta)", async () => {
    h.tabelas.physiq_avaliacoes = [
      { id: "av-b", user_id: "t1", data_avaliacao: "2026-10-01" },
      { id: "av-a", user_id: "t1", data_avaliacao: "2026-10-01" },
      { id: "av-c", user_id: "t1", data_avaliacao: "2026-09-01" },
    ];
    const parte = await carregarTreino("t1", semAssinar);
    expect(parte.avaliacoes.map((a) => a.id)).toEqual(["av-c", "av-a", "av-b"]);
    const pedido = h.consultas.find((c) => c.tabela === "physiq_avaliacoes")!;
    expect(pedido.filtros).toEqual([["user_id", "t1"]]);
    expect(pedido.ordem).toEqual([["data_avaliacao", false], ["id", false]]);
    expect(pedido.limite).toBe(200);
  });

  it("as fotos mensais: as 200 mais novas (antes, sem limite — o PostgREST cortava em 1000 as mais novas primeiro)", async () => {
    h.tabelas.physiq_registros_fotos = Array.from({ length: 230 }, (_, i) => ({
      id: `f${i}`, user_id: "t1", mes_ref: `${2000 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`, tipo: "frente",
      storage_path: `t1/${i}.jpg`, created_at: "2026-01-01T00:00:00Z",
    }));
    const parte = await carregarTreino("t1", semAssinar);
    expect(MAX_FOTOS).toBe(200);
    expect(parte.fotos).toHaveLength(200);
    expect(parte.fotos[0].id).toBe("f229");
    const pedido = h.consultas.find((c) => c.tabela === "physiq_registros_fotos")!;
    expect(pedido.ordem).toEqual([["mes_ref", false]]);
    expect(pedido.limite).toBe(200);
  });

  it("erro do banco nas avaliações → ErroFonte do Treino (a tela mostra o erro, nunca a lista vazia)", async () => {
    h.erro = { message: "statement timeout" };
    await expect(carregarTreino("t1", semAssinar)).rejects.toBeInstanceOf(ErroFonte);
  });
});

describe("hml-20a — o desvio do gate J: a parte do Treino segue no navegador, igual ao 637363f", () => {
  it("as 3 leituras pelo REST do Treino (o perfil pelo id; as avaliações e as fotos pelo user_id) e a assinatura do registros em 1 lote, 1 h", async () => {
    h.tabelas.physiq_registros_fotos = [
      { id: "f1", user_id: "t1", mes_ref: "2026-10-01", tipo: "frente", storage_path: "t1/2026-10/frente.jpg", created_at: "x" },
      { id: "f2", user_id: "t1", mes_ref: "2026-09-01", tipo: "costas", storage_path: "t1/2026-09/costas.jpg", created_at: "x" },
      { id: "f3", user_id: "outro", mes_ref: "2026-10-01", tipo: "frente", storage_path: "outro/2026-10/frente.jpg", created_at: "x" },
    ];
    const parte = await carregarTreino("t1"); // o assinador padrão (o Storage do Treino)
    expect(h.consultas.map((c) => [c.tabela, c.filtros])).toEqual([
      ["physiq_profiles", [["id", "t1"]]], ["physiq_avaliacoes", [["user_id", "t1"]]], ["physiq_registros_fotos", [["user_id", "t1"]]],
    ]);
    expect(h.assinaturas).toEqual([{ bucket: "registros-staging", caminhos: ["t1/2026-10/frente.jpg", "t1/2026-09/costas.jpg"], validade: 3600 }]);
    expect(parte.fotos.map((f) => [f.id, f.url])).toEqual([
      ["f1", "https://treino.teste.invalid/storage/v1/object/sign/registros-staging/t1/2026-10/frente.jpg?token=t"],
      ["f2", "https://treino.teste.invalid/storage/v1/object/sign/registros-staging/t1/2026-09/costas.jpg?token=t"],
    ]);
    // a admin-avaliacoes › minha_evolucao não é chamada (o mock quebra se for) e nada do principal entra na parte do Treino
    expect(h.principal).not.toHaveBeenCalled();
  });

  it("sem foto, nenhuma assinatura (0 pedido ao Storage)", async () => {
    await carregarTreino("t1");
    expect(h.assinaturas).toEqual([]);
  });
});

describe("hml-20a — a parte do principal pela nutricao › ler (aluno_evolucao)", () => {
  it("1 chamada `ler` com a consulta aluno_evolucao (sem id: a RPC usa o auth.uid()); a PartePrincipal de antes; URL com o domínio do principal", async () => {
    h.principal.mockResolvedValue({
      data: {
        ok: true,
        itens: [{
          ok: true,
          valor: {
            objetivo: "emagrecer",
            antropometrias: [{ id: "a1", data: "2026-10-01" }],
            fotos: [
              { id: "f1", data: "2026-10-01", posicao: "frente", path: "n/p/1.jpg", url: "/storage/v1/object/sign/evolucao-staging/n/p/1.jpg?token=t" },
              { id: "f2", data: "2026-10-01", posicao: "costas", path: "n/p/2.jpg", url: null },
            ],
          },
        }],
      },
      error: null,
    });
    const parte = await carregarPrincipal();
    expect(h.principal.mock.calls).toEqual([["nutricao", { body: { acao: "ler", itens: [{ q: "aluno_evolucao" }] } }]]);
    expect(parte).toEqual({
      objetivo: "emagrecer",
      antropometrias: [{ id: "a1", data: "2026-10-01" }],
      fotos: [
        { id: "f1", data: "2026-10-01", posicao: "frente", path: "n/p/1.jpg", url: "https://principal.teste.invalid/storage/v1/object/sign/evolucao-staging/n/p/1.jpg?token=t" },
        { id: "f2", data: "2026-10-01", posicao: "costas", path: "n/p/2.jpg", url: null },
      ],
    });
  });

  it("valor torto não quebra (listas vazias); o erro vira ErroFonte do principal com o código", async () => {
    h.principal.mockResolvedValueOnce({ data: { ok: true, itens: [{ ok: true, valor: null }] }, error: null });
    expect(await carregarPrincipal()).toEqual({ objetivo: null, antropometrias: [], fotos: [] });
    h.principal.mockResolvedValueOnce({ data: { ok: true, itens: [{ ok: false, erro: "tempo_esgotado" }] }, error: null });
    await expect(carregarPrincipal()).rejects.toMatchObject({ parte: "principal", message: "tempo_esgotado" });
    h.principal.mockResolvedValueOnce(recusa(429, { ok: false, erro: "muitas_acoes" }));
    await expect(carregarPrincipal()).rejects.toMatchObject({ parte: "principal", message: "muitas_acoes" });
  });

  it("revisão: o PRAZO da nutricao (o AbortError do fetch) chega ao principal como tempo_esgotado", async () => {
    h.principal.mockResolvedValueOnce({ data: null, error: { name: "FunctionsFetchError", context: new DOMException("aborted", "AbortError") } });
    await expect(carregarPrincipal()).rejects.toMatchObject({ parte: "principal", message: "tempo_esgotado" });
  });

  it("sem internet: o principal recusa com sem_internet sem chamar a função", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await expect(carregarPrincipal()).rejects.toMatchObject({ parte: "principal", message: "sem_internet" });
    expect(h.principal).not.toHaveBeenCalled();
  });
});

describe("hml-20a — a URL assinada que o servidor devolve (relativa) montada com o domínio do cliente", () => {
  it("só o link de leitura do Storage; outra coisa → null", () => {
    expect(urlDoServidor("https://api.x.br/", "/storage/v1/object/sign/registros/a.jpg?token=t")).toBe("https://api.x.br/storage/v1/object/sign/registros/a.jpg?token=t");
    for (const r of ["https://outro.site/x.jpg", "/storage/v1/object/public/a.jpg", "storage/v1/object/sign/a.jpg", null, 3]) expect(urlDoServidor("https://api.x.br", r), String(r)).toBeNull();
    expect(urlDoServidor("", "/storage/v1/object/sign/a.jpg")).toBeNull();
  });
});
