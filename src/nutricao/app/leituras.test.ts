// Physiq hml-20a (H-42 · jeito 2, etapa 2) — o CONTRATO tela × servidor das LEITURAS do app do aluno (Início, Evolução, Dieta/Diário):
// cada função de leitura das libs (minhaDieta e urlsDoDiario de pacienteApp.ts; carregarPrincipal e carregarTreino de evolucao/fontes.ts)
// manda à função certa um corpo que PASSA nos leitores REAIS do servidor (o motor e o catálogo da nutricao; a ACOES_DE_LEITURA da
// admin-avaliacoes), o pedido roda no módulo de verdade (functions/nutricao/leituras.ts, com um banco falso que faz o RLS do aluno) e o
// que volta pela "rede" (JSON) chega à tela no MESMO tipo e com os MESMOS valores de hoje — inclusive a URL assinada, que o navegador
// montava com o domínio dele e agora monta com a parte relativa que o servidor assinou.
import { describe, expect, it, vi } from "vitest";
import { lerPedidoDeLeitura } from "../../../supabase-principal/functions/_shared/leitura-lote";
import { CONSULTAS_NUTRICAO } from "../../../supabase-principal/functions/_shared/nutricao-leituras";
import { atenderLeitura, type ContextoLeitura } from "../../../supabase-principal/functions/nutricao/leituras";
import { ehAcaoDeLeitura, parteDaEvolucao, urlsAssinadas } from "../../../supabase/functions/admin-avaliacoes/regras";

const ALUNA = "a1a1a1a1-0000-4000-8000-000000000001";
const OUTRA = "b2b2b2b2-0000-4000-8000-000000000002";
const NUTRI = "c3c3c3c3-0000-4000-8000-000000000003";
const D1 = "d1d1d1d1-0000-4000-8000-000000000001";
const D2 = "d2d2d2d2-0000-4000-8000-000000000002";
const D3 = "d3d3d3d3-0000-4000-8000-000000000003";

// ───────────────────────── o "banco" (a aluna e uma outra pessoa) ─────────────────────────
const DIETA = {
  hoje: "2026-10-11", dia: "2026-10-11", matriculas: [{ id: "m1" }],
  planos: [{ id: "p1", kcal_alvo: "2000", refeicoes: [{ id: "r1", dias_semana: ["1"], itens: [{ id: "i1", quantidade_g: "100.00", quantidade_medida: null }] }] }],
  orientacoes: [], metas: [], refeicoes_concluidas: [], metas_concluidas: [],
  diario: [{ id: D1, path: `${NUTRI}/${ALUNA}/1.jpg` }, { id: D2, path: `${NUTRI}/${ALUNA}/2.jpg` }],
};
const DIARIO = [
  { id: D1, paciente: ALUNA, path: `${NUTRI}/${ALUNA}/1.jpg`, deleted_at: null },
  { id: D2, paciente: ALUNA, path: `${NUTRI}/${ALUNA}/2.jpg`, deleted_at: null },
  { id: D3, paciente: OUTRA, path: `${NUTRI}/${OUTRA}/3.jpg`, deleted_at: null },
];
const EVOLUCAO = {
  objetivo: "emagrecer",
  antropometrias: [{ id: "an1", data: "2026-10-01", peso: "70.5", altura: "165", sexo: "feminino", idade: 30, circunferencias: {}, dobras: {}, protocolo: "nenhum", resultados: {}, autor_id: NUTRI, autor_nome: "Nutri", criado_em: "x" }],
  fotos: [{ id: "fe1", data: "2026-10-01", posicao: "frente", path: `${NUTRI}/${ALUNA}/evo.jpg`, autor_id: NUTRI, autor_nome: "Nutri", criado_em: "x" }],
};
/** O token que o Storage põe na URL (o mesmo com o domínio de hoje ou da função). */
const token = (p: string) => `tk-${p.length}`;

const h = vi.hoisted(() => ({ principal: vi.fn(), treino: vi.fn(), corpos: [] as Array<{ funcao: string; corpo: Record<string, unknown> }> }));
vi.mock("@/integrations/principal/client", () => ({
  PRINCIPAL_SCHEMA: "staging",
  PRINCIPAL_URL: "https://principal.teste.invalid",
  principalConfigurado: true,
  principal: { functions: { invoke: (f: string, o: { body: Record<string, unknown> }) => h.principal(f, o) } },
}));
vi.mock("@/integrations/supabase/client", () => ({
  DB_SCHEMA: "staging",
  supabase: { functions: { invoke: (f: string, o: { body: Record<string, unknown> }) => h.treino(f, o) } },
}));

import { minhaDieta, normalizarDieta, urlsDoDiario } from "./pacienteApp";
import { carregarPrincipal, carregarTreino } from "@/evolucao/fontes";

/** O cliente "como a aluna" do servidor: as RPCs dela, o RLS do diário (só as linhas dela) e o Storage (assina o que pedirem). */
function comoAluna(): ContextoLeitura["comoPessoa"] {
  return {
    rpc: async (nome: string) => ({ data: nome === "minha_dieta" ? DIETA : nome === "minha_evolucao" ? EVOLUCAO : null, error: null }),
    from: () => {
      const filtros: Array<[string, string, unknown]> = [];
      const b = {
        select: () => b,
        in: (c: string, v: readonly unknown[]) => (filtros.push(["in", c, v]), b),
        eq: (c: string, v: unknown) => (filtros.push(["eq", c, v]), b),
        is: (c: string, v: null) => (filtros.push(["is", c, v]), b),
        order: () => b,
        limit: (n: number) => b,
        then: (ok: (r: { data: unknown; error: unknown }) => unknown) => {
          const ids = (filtros.find((f) => f[0] === "in")?.[2] ?? []) as string[];
          const linhas = DIARIO.filter((d) => d.paciente === ALUNA && ids.includes(d.id) && d.deleted_at === null).map((d) => ({ id: d.id, path: d.path }));
          return Promise.resolve({ data: linhas, error: null }).then(ok);
        },
      };
      return { select: () => b };
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: async (caminhos: string[]) => ({
          data: caminhos.map((p) => ({ path: p, error: null, signedUrl: `https://hkxv.supabase.co/storage/v1/object/sign/${bucket}/${p}?token=${token(p)}` })),
          error: null,
        }),
      }),
    },
  } as unknown as ContextoLeitura["comoPessoa"];
}

/** A função nutricao "de verdade": o corpo do navegador → o módulo → a resposta pela rede (JSON ida e volta). */
h.principal.mockImplementation(async (funcao: string, o: { body: Record<string, unknown> }) => {
  const corpo = JSON.parse(JSON.stringify(o.body)) as Record<string, unknown>;
  h.corpos.push({ funcao, corpo });
  const log = { info: () => undefined, aviso: () => undefined, erro: () => undefined, excecao: () => undefined };
  const r = await atenderLeitura({ schema: "staging", corpo, userId: ALUNA, comoPessoa: comoAluna(), log });
  return { data: JSON.parse(JSON.stringify(r)), error: null };
});

/** A admin-avaliacoes "de verdade" (a parte pura): a ação de leitura → a ParteTreino do sub, com as URLs só do que leu. */
h.treino.mockImplementation(async (funcao: string, o: { body: Record<string, unknown> }) => {
  h.corpos.push({ funcao, corpo: o.body });
  if (!ehAcaoDeLeitura(o.body.action)) return { data: null, error: { name: "FunctionsHttpError" } };
  const fotos = [{ id: "fm1", mes_ref: "2026-10-01", tipo: "frente", storage_path: `t-aluna/2026-10/frente.jpg`, created_at: "x" }];
  const assinadas = fotos.map((f) => ({ path: f.storage_path, error: null, signedUrl: `https://uxwp.supabase.co/storage/v1/object/sign/registros-staging/${f.storage_path}?token=${token(f.storage_path)}` }));
  const parte = parteDaEvolucao({ id: "t-aluna", peso: 70 }, [{ id: "av2" }, { id: "av1" }], fotos, urlsAssinadas(fotos.map((f) => f.storage_path), assinadas, "registros-staging"));
  return { data: JSON.parse(JSON.stringify(parte)), error: null };
});

describe("hml-20a — o contrato tela × servidor das leituras do app do aluno", () => {
  it("Dieta/Início: minhaDieta(dia) → aluno_dieta { dia } (passa no leitor do servidor) → o MESMO DadosDieta de hoje", async () => {
    h.corpos = [];
    const d = await minhaDieta("2026-10-11");
    expect(d).toEqual(normalizarDieta(DIETA, "2026-10-11")); // o que a RPC direta dava, normalizado igual
    const [{ funcao, corpo }] = h.corpos;
    expect(funcao).toBe("nutricao");
    expect(lerPedidoDeLeitura(corpo, CONSULTAS_NUTRICAO)).toMatchObject({ ok: true, itens: [{ ok: true, q: "aluno_dieta", params: { dia: "2026-10-11" } }] });
  });

  it("Diário: urlsDoDiario → aluno_diario_urls { ids } → { id: URL } com o domínio do cliente (a URL de hoje); o registro de OUTRA pessoa não vem", async () => {
    h.corpos = [];
    const urls = await urlsDoDiario([...DIETA.diario, { id: D3, path: `${NUTRI}/${OUTRA}/3.jpg` }]);
    const hoje = (p: string) => `https://principal.teste.invalid/storage/v1/object/sign/diario-staging/${p}?token=${token(p)}`;
    expect(urls).toEqual({ [D1]: hoje(DIETA.diario[0].path), [D2]: hoje(DIETA.diario[1].path) });
    const [{ corpo }] = h.corpos;
    expect(lerPedidoDeLeitura(corpo, CONSULTAS_NUTRICAO)).toMatchObject({ ok: true, itens: [{ ok: true, q: "aluno_diario_urls", params: { ids: [D1, D2, D3] } }] });
    // nenhum caminho vai no corpo: o servidor relê o caminho de cada id como a aluna
    expect(JSON.stringify(corpo)).not.toContain(".jpg");
  });

  it("Evolução/Início (principal): carregarPrincipal → aluno_evolucao (sem params) → a PartePrincipal de hoje, a foto com a URL de hoje", async () => {
    h.corpos = [];
    const parte = await carregarPrincipal();
    const p = EVOLUCAO.fotos[0].path;
    expect(parte).toEqual({
      objetivo: "emagrecer",
      antropometrias: EVOLUCAO.antropometrias,
      fotos: [{ ...EVOLUCAO.fotos[0], url: `https://principal.teste.invalid/storage/v1/object/sign/evolucao-staging/${p}?token=${token(p)}` }],
    });
    const [{ corpo }] = h.corpos;
    expect(corpo).toEqual({ acao: "ler", itens: [{ q: "aluno_evolucao" }] });
    expect(lerPedidoDeLeitura(corpo, CONSULTAS_NUTRICAO)).toMatchObject({ ok: true, itens: [{ ok: true, q: "aluno_evolucao", params: {} }] });
  });

  it("Evolução/Início (Treino): carregarTreino → admin-avaliacoes { action: minha_evolucao } (leitura) → a ParteTreino de hoje", async () => {
    h.corpos = [];
    const parte = await carregarTreino("t-aluna");
    expect(h.corpos).toEqual([{ funcao: "admin-avaliacoes", corpo: { action: "minha_evolucao" } }]);
    expect(ehAcaoDeLeitura(h.corpos[0].corpo.action)).toBe(true);
    const c = "t-aluna/2026-10/frente.jpg";
    expect(parte).toEqual({
      perfil: { id: "t-aluna", peso: 70 },
      avaliacoes: [{ id: "av1" }, { id: "av2" }],
      fotos: [{ id: "fm1", mes_ref: "2026-10-01", tipo: "frente", storage_path: c, created_at: "x", url: `https://treino.teste.invalid/storage/v1/object/sign/registros-staging/${c}?token=${token(c)}` }],
    });
  });

  it("a mesma volta da tela (Início: a dieta + a evolução) vira 1 chamada `ler` com os 2 itens", async () => {
    h.corpos = [];
    await Promise.all([minhaDieta("2026-10-11"), carregarPrincipal()]);
    const doPrincipal = h.corpos.filter((c) => c.funcao === "nutricao");
    expect(doPrincipal).toHaveLength(1);
    expect((doPrincipal[0].corpo.itens as Array<{ q: string }>).map((i) => i.q)).toEqual(["aluno_dieta", "aluno_evolucao"]);
  });
});
