// Physiq hml-14d (B21 · D30): a Evolução do app lê as 200 avaliações MAIS NOVAS (antes, as 200 mais antigas — acima de 200 a
// avaliação nova sumia do gráfico) e as devolve em ordem crescente; as fotos mensais também param em 200 (as mais novas).
// hml-20a (H-42 · jeito 2, etapa 2): as 2 partes saem do SERVIDOR com a sessão do aluno — o Treino pela admin-avaliacoes › minha_evolucao
// (1 ida; a ordem, o teto e a assinatura moram lá: supabase/functions/admin-avaliacoes/regras.ts, testados no adminAvaliacoesRegras.test)
// e o principal pela nutricao › ler (aluno_evolucao). Aqui: a tela chama as funções certas (nada direto no REST, na RPC ou no Storage),
// devolve as MESMAS formas de antes (ParteTreino, PartePrincipal), monta a URL assinada com o domínio do cliente e o erro vira
// ErroFonte da parte. O hml-14d segue provado de ponta a ponta: o "servidor" falso aplica a ordem e o teto declarados e a resposta
// passa pela parteDaEvolucao de verdade.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_AVALIACOES_EVOLUCAO, MAX_FOTOS_EVOLUCAO, parteDaEvolucao } from "../../supabase/functions/admin-avaliacoes/regras";

const h = vi.hoisted(() => ({
  treino: vi.fn(),
  principal: vi.fn(),
  /** o que não pode mais acontecer: leitura direta no REST, na RPC ou no Storage */
  proibido: (onde: string) => () => {
    throw new Error(`leitura direta: ${onde}`);
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  DB_SCHEMA: "staging",
  supabase: {
    functions: { invoke: (...a: unknown[]) => h.treino(...a) },
    from: h.proibido("tabela do Treino"),
    rpc: h.proibido("RPC do Treino"),
    storage: { from: h.proibido("Storage do Treino") },
  },
}));
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

import { carregarPrincipal, carregarTreino, ErroFonte, urlDoServidor } from "./fontes";

type Linha = Record<string, unknown>;
const recusa = (status: number, corpo: unknown) => ({
  data: null,
  error: { name: "FunctionsHttpError", context: new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } }) },
});
const dataDe = (i: number) => new Date(Date.UTC(2009, 0, 1) + i * 20 * 86_400_000).toISOString().slice(0, 10);
const avaliacao = (i: number, uid = "t1"): Linha => ({ id: `av-${String(i).padStart(4, "0")}`, user_id: uid, data_avaliacao: dataDe(i), peso: 80 - i * 0.01 });

/** O "servidor" da minha_evolucao: o RLS (só as linhas do sub), a ordem e o teto declarados e a parteDaEvolucao de verdade. */
function servidorDoTreino(sub: string, tabelas: { perfil?: Linha | null; avaliacoes?: Linha[]; fotos?: Linha[] }, urls = new Map<string, string>()) {
  const desc = (col: string, b?: string) => (x: Linha, y: Linha) => String(y[col]).localeCompare(String(x[col])) || (b ? String(y[b]).localeCompare(String(x[b])) : 0);
  const avaliacoes = (tabelas.avaliacoes ?? []).filter((a) => a.user_id === sub).sort(desc("data_avaliacao", "id")).slice(0, MAX_AVALIACOES_EVOLUCAO);
  const fotos = (tabelas.fotos ?? []).filter((f) => f.user_id === sub).sort(desc("mes_ref")).slice(0, MAX_FOTOS_EVOLUCAO);
  return { data: parteDaEvolucao(tabelas.perfil ?? null, avaliacoes, fotos, urls), error: null };
}

beforeEach(() => {
  h.treino.mockReset();
  h.principal.mockReset();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

describe("hml-20a — a parte do Treino pela admin-avaliacoes › minha_evolucao", () => {
  it("1 chamada, sem id nenhum no corpo (o dono é o sub do token); as formas de antes; a URL montada com o domínio do Treino", async () => {
    const caminho = "t1/2026-10/frente.jpg";
    h.treino.mockResolvedValue(servidorDoTreino("t1", {
      perfil: { id: "t1", peso: 78 },
      avaliacoes: [avaliacao(1), avaliacao(2), avaliacao(3, "outro")],
      fotos: [{ id: "f1", user_id: "t1", mes_ref: "2026-10-01", tipo: "frente", storage_path: caminho, created_at: "x" }],
    }, new Map([[caminho, `/storage/v1/object/sign/registros-staging/${caminho}?token=t`]])));
    const parte = await carregarTreino("t1");
    expect(h.treino).toHaveBeenCalledTimes(1);
    expect(h.treino.mock.calls[0]).toEqual(["admin-avaliacoes", { body: { action: "minha_evolucao" } }]);
    expect(parte.perfil).toEqual({ id: "t1", peso: 78 });
    expect(parte.avaliacoes.map((a) => a.id)).toEqual(["av-0001", "av-0002"]);
    expect(parte.fotos).toEqual([{
      id: "f1", user_id: "t1", mes_ref: "2026-10-01", tipo: "frente", storage_path: caminho, created_at: "x",
      url: `https://treino.teste.invalid/storage/v1/object/sign/registros-staging/${caminho}?token=t`,
    }]);
  });

  it("hml-14d de ponta a ponta: com 201 avaliações, a mais nova fica (sai a mais antiga) e a lista chega em ordem crescente", async () => {
    h.treino.mockResolvedValue(servidorDoTreino("t1", { perfil: { id: "t1" }, avaliacoes: [...Array.from({ length: 201 }, (_, i) => avaliacao(i)), avaliacao(500, "outro")] }));
    const ids = (await carregarTreino("t1")).avaliacoes.map((a) => a.id);
    expect(MAX_AVALIACOES_EVOLUCAO).toBe(200);
    expect(ids).toHaveLength(200);
    expect(ids[0]).toBe("av-0001");
    expect(ids.at(-1)).toBe("av-0200");
    expect(ids).not.toContain("av-0000");
  });

  it("as fotos mensais: as 200 mais novas; a que o servidor não assinou fica sem URL (a tela mostra \"Foto indisponível\")", async () => {
    const fotos = Array.from({ length: 230 }, (_, i) => ({
      id: `f${i}`, user_id: "t1", mes_ref: `${2000 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`, tipo: "frente", storage_path: `t1/${i}.jpg`,
    }));
    h.treino.mockResolvedValue(servidorDoTreino("t1", { perfil: null, fotos }));
    const parte = await carregarTreino("t1");
    expect(MAX_FOTOS_EVOLUCAO).toBe(200);
    expect(parte.fotos).toHaveLength(200);
    expect(parte.fotos[0].id).toBe("f229");
    expect(parte.fotos.every((f) => f.url === null)).toBe(true);
    expect(parte.perfil).toBeNull();
  });

  it("o erro vira ErroFonte do Treino com o código (a tela avisa a parte, nunca a lista vazia)", async () => {
    const casos: Array<[unknown, string]> = [
      [recusa(500, { error: "internal" }), "internal"],
      [recusa(401, { error: "invalid_token" }), "invalid_token"],
      [recusa(429, { error: "rate_limited" }), "rate_limited"],
      [{ data: null, error: { name: "FunctionsFetchError", context: new TypeError("Failed to fetch") } }, "rede"],
      [{ data: { perfil: null }, error: null }, "resposta_invalida"],
      [{ data: null, error: null }, "resposta_invalida"],
    ];
    for (const [resposta, codigo] of casos) {
      h.treino.mockResolvedValueOnce(resposta);
      const e = await carregarTreino("t1").catch((x) => x);
      expect(e, codigo).toBeInstanceOf(ErroFonte);
      expect(e).toMatchObject({ parte: "treino", message: codigo });
    }
  });

  it("a resposta de OUTRA pessoa (a sessão do Treino trocou no meio) não entra na tela nem no aparelho", async () => {
    h.treino.mockResolvedValue(servidorDoTreino("t2", { perfil: { id: "t2", peso: 50 } }));
    await expect(carregarTreino("t1")).rejects.toMatchObject({ parte: "treino", message: "sessao_trocada" });
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
