// Physiq hml-21a (H-43 · jeito 2, etapa 3) — a função conta no Vitest: o CATÁLOGO das leituras (supabase-principal/functions/_shared/
// conta-leituras.ts) rodado pelo motor comum (_shared/leitura-servidor.ts) e as GRAVAÇÕES (conta/casca.ts e conta/app.ts, com as regras de
// _shared/conta-regras.ts), com um cliente falso que faz o papel do PostgREST, das RPCs e do Storage COMO A PESSOA (os módulos não importam
// a porta: o contexto é estrutural; o deno check confere que o da porta encaixa).
// Positivo: cada `q` e cada ação com os params certos; as colunas = o select das libs do 53f2583 (nenhum "*"); o teto; a ordem; o dono das
// "minhas" e das gravações = quem chama; as RPCs com os MESMOS argumentos de hoje; a foto pelo link assinado (o caminho na pasta de quem
// chama, a URL pública como o getPublicUrl, a anterior apagada).
// Negativo: q/ação desconhecida; uuid/data/texto/inteiro ruins → dados_invalidos (nada roda); destino_user_id/user_id/nutricionista_id/
// dono_id/id do corpo ignorados (nunca chegam ao banco); a chave fora da lista cai; o caminho da foto fora da pasta → dados_invalidos (N8)
// sem tocar no Storage; o erro do banco vira o código (a mensagem nunca vai na resposta); o log nunca leva os valores.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ehRpc, type FonteRpc, type FonteTabela, type RespostaDeItem } from "../../supabase-principal/functions/_shared/leitura-lote";
import { atenderLeitura } from "../../supabase-principal/functions/_shared/leitura-servidor";
import {
  AVISOS_MAX, CATALOGO_CONTA, COLUNAS_DA_CONTA, CONSULTAS_CONTA, CONSULTAS_DA_CONTA, LIMITE_AGENDA_MAX, TIPO_MEMBRO_REMOVIDO, consultaDaConta,
} from "../../supabase-principal/functions/_shared/conta-leituras";
import {
  ACOES_DA_CASCA, ACOES_DA_CONTA, ACOES_DO_APP, CORPOS_DAS_ACOES, FOTO_MAX_BYTES, STATUS_DO_ERRO_CONTA, URL_API_PROPRIA, argsSemProfissional,
  bucketDasFotos, caminhoDaFoto, caminhoDaFotoAnterior, caminhoDaPropriaPasta, dadosComFoto, moduloDoPedido, statusDoErroConta, urlPublicaDaFoto,
  type AcaoDaCasca, type AcaoDoApp,
} from "../../supabase-principal/functions/_shared/conta-regras";
import { atenderCasca } from "../../supabase-principal/functions/conta/casca";
import { atenderApp } from "../../supabase-principal/functions/conta/app";
import { comFoto } from "@/painel/configuracoes/perfil/regras";

const RAIZ = resolve(__dirname, "../..");
const EU = "33333333-3333-4333-8333-333333333333";
const OUTRA = "99999999-9999-4999-8999-999999999999";
const A1 = "a1111111-1111-4111-8111-111111111111";
const A2 = "a2222222-2222-4222-8222-222222222222";
const AGORA = new Date("2026-10-12T22:00:00.000Z");

// ───────────────────────── o cliente falso (grava cada pedido; o RLS de quem chama é o "banco" do teste) ─────────────────────────
type Resposta = { data: unknown; error: unknown; count?: number | null };
interface Banco {
  rpc?: (nome: string, args: Record<string, unknown>) => Resposta;
  tabela?: (p: Pedido) => Resposta;
  storage?: {
    assinarUpload?: (bucket: string, caminho: string) => { data: { token?: string } | null; error: unknown };
    listar?: (bucket: string, pasta: string, busca: string) => { data: Array<{ name: string }> | null; error: unknown };
    remover?: (bucket: string, caminhos: string[]) => { data: unknown[] | null; error: unknown };
  };
}
interface Pedido {
  tipo: "select" | "update";
  tabela: string;
  colunas?: string;
  opcoes?: unknown;
  valores?: Record<string, unknown>;
  passos: unknown[][];
}
function clienteFalso(banco: Banco) {
  const pedidos: Pedido[] = [];
  const rpcs: Array<{ nome: string; args: Record<string, unknown> }> = [];
  const storage: unknown[][] = [];
  const cadeia = (p: Pedido) => {
    const b: Record<string, unknown> = {};
    for (const op of ["in", "eq", "is", "gte", "lte", "lt", "ilike", "or", "order", "limit", "range"]) b[op] = (...a: unknown[]) => (p.passos.push([op, ...a]), b);
    b.select = (colunas: string) => (p.passos.push(["select", colunas]), b);
    b.maybeSingle = () => {
      p.passos.push(["maybeSingle"]);
      const r = banco.tabela ? banco.tabela(p) : { data: null, error: null };
      return Promise.resolve({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data });
    };
    b.then = (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) =>
      Promise.resolve(banco.tabela ? banco.tabela(p) : { data: [], error: null }).then(ok, falhou);
    return b;
  };
  const cliente = {
    rpc: (nome: string, args: Record<string, unknown> = {}) => {
      rpcs.push({ nome, args });
      return Promise.resolve(banco.rpc ? banco.rpc(nome, args) : { data: null, error: null });
    },
    from: (tabela: string) => ({
      select: (colunas: string, opcoes?: unknown) => {
        const p: Pedido = { tipo: "select", tabela, colunas, ...(opcoes ? { opcoes } : {}), passos: [] };
        pedidos.push(p);
        return cadeia(p);
      },
      update: (valores: Record<string, unknown>) => {
        const p: Pedido = { tipo: "update", tabela, valores, passos: [] };
        pedidos.push(p);
        return cadeia(p);
      },
    }),
    storage: {
      from: (bucket: string) => ({
        createSignedUploadUrl: (caminho: string) => {
          storage.push(["assinar_upload", bucket, caminho]);
          return Promise.resolve(banco.storage?.assinarUpload ? banco.storage.assinarUpload(bucket, caminho) : { data: { token: "token-de-upload" }, error: null });
        },
        list: (pasta: string, o: { search: string; limit: number }) => {
          storage.push(["listar", bucket, pasta, o]);
          return Promise.resolve(banco.storage?.listar ? banco.storage.listar(bucket, pasta, o.search) : { data: [{ name: o.search }], error: null });
        },
        remove: (caminhos: string[]) => {
          storage.push(["remover", bucket, [...caminhos]]);
          return Promise.resolve(banco.storage?.remover ? banco.storage.remover(bucket, caminhos) : { data: caminhos.map((name) => ({ name })), error: null });
        },
        createSignedUrls: () => Promise.resolve({ data: null, error: { status: 400 } }),
        createSignedUrl: () => Promise.resolve({ data: null, error: { status: 400 } }),
      }),
    },
  };
  return { cliente, pedidos, rpcs, storage };
}
function contexto(corpo: Record<string, unknown>, banco: Banco = {}, schema: "public" | "staging" = "staging") {
  const f = clienteFalso(banco);
  const log = { info: vi.fn(), aviso: vi.fn(), erro: vi.fn(), excecao: vi.fn() };
  return { c: { schema, origin: null, corpo, userId: EU, comoPessoa: f.cliente, log }, log, ...f };
}
async function ler(itens: unknown[], banco: Banco = {}, schema: "public" | "staging" = "staging") {
  const k = contexto({ acao: "ler", itens }, banco, schema);
  const r = await atenderLeitura(k.c as never, CATALOGO_CONTA);
  return { r, itens: r.ok ? (r as { itens: RespostaDeItem[] }).itens : [], ...k };
}
async function casca(acao: AcaoDaCasca, corpo: Record<string, unknown>, banco: Banco = {}) {
  const k = contexto({ ...corpo, acao }, banco);
  return { r: await atenderCasca(k.c as never, acao), ...k };
}
async function app(acao: AcaoDoApp, corpo: Record<string, unknown>, banco: Banco = {}, schema: "public" | "staging" = "staging") {
  const k = contexto({ ...corpo, acao }, banco, schema);
  return { r: await atenderApp(k.c as never, acao), ...k };
}
const semEspacos = (s: string) => s.replace(/\s+/g, "");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
});
afterEach(() => vi.useRealTimers());

/**
 * O SELECT FIXO das libs do 53f2583 (o que o navegador lia hoje), com a origem — o servidor tem de mandar o MESMO. A foto do perfil é a
 * exceção da spec (§2.2: "só a chave da foto" — a lib lia o dados_profissionais inteiro para montar a gravação, que agora é do servidor).
 */
const DA_LIB = {
  avisos: { origem: "src/ui/premium/useAvisos.ts:63 buscarAvisos", select: "id,tipo,titulo,link,lido_em,criado_em" },
  aviso_membro_removido: { origem: "src/ui/avisos/AvisoMembroRemovido.tsx:37", select: "id, titulo, criado_em" },
} as const;

// ───────────────────────── o catálogo ─────────────────────────
describe("hml-21a — o catálogo da conta (as consultas do bloco 21a da §2.2)", () => {
  it("as 9 consultas (os nomes da decisão B; o tipo da lista da agenda e o offset/limite vão como a lib manda — PADRÃO)", () => {
    expect(CONSULTAS_DA_CONTA).toEqual([
      "avisos", "aviso_membro_removido", "situacao", "meu_perfil_aluno", "minha_agenda", "minha_agenda_lista", "meu_plano_app", "pratos_prontos_do_app",
      "perfil_foto",
    ]);
    expect(consultaDaConta("avisos")).toBe(CONSULTAS_CONTA.avisos);
    for (const q of ["nao_existe", "__proto__", "constructor", "aluno_dieta", "fin_do_aluno", 3, null]) expect(consultaDaConta(q), String(q)).toBeNull();
  });

  it("cada tabela: colunas explícitas (nenhum '*') = o select FIXO da lib do 53f2583; a foto = só a chave dela; teto ≤ 30", () => {
    for (const [q, lib] of Object.entries(DA_LIB)) {
      const f = (CONSULTAS_CONTA as unknown as Record<string, { fonte: FonteTabela }>)[q].fonte;
      expect(semEspacos(f.colunas.join(",")), `${q} × ${lib.origem}`).toBe(semEspacos(lib.select));
    }
    expect(COLUNAS_DA_CONTA.perfil_foto).toEqual(["foto_url:dados_profissionais->>foto_url"]);
    for (const [q, c] of Object.entries(CONSULTAS_CONTA)) {
      if (ehRpc(c.fonte)) continue;
      const f = c.fonte as FonteTabela;
      expect(f.colunas.join(","), q).not.toContain("*");
      expect(f.teto, q).toBeLessThanOrEqual(AVISOS_MAX);
    }
  });

  it("'minha' = SÓ a foto do perfil (a lib filtrava pelo id de quem está logado); o sino e o aviso de membro: o RLS decide (a lib não filtrava)", () => {
    const minhas = Object.entries(CONSULTAS_CONTA).filter(([, c]) => "dono" in c).map(([q, c]) => [q, (c as { dono: string }).dono]);
    expect(minhas).toEqual([["perfil_foto", "id"]]);
  });

  it("as RPCs: os args que a lib mandava, montados aqui (o corpo nunca vira arg)", () => {
    const rpcs = Object.entries(CONSULTAS_CONTA).filter(([, c]) => ehRpc(c.fonte)).map(([q, c]) => [q, (c.fonte as FonteRpc).rpc, (c.fonte as FonteRpc).args ?? {}]);
    expect(rpcs).toEqual([
      ["situacao", "minha_situacao", {}],
      ["meu_perfil_aluno", "meu_perfil_aluno", {}],
      ["minha_agenda", "minha_agenda", { p_desde: "desde" }],
      ["minha_agenda_lista", "minha_agenda_lista", { p_tipo: "tipo", p_offset: "offset", p_limite: "limite" }],
      ["meu_plano_app", "meu_plano_app", {}],
      ["pratos_prontos_do_app", "pratos_prontos_do_app", { p_objetivo: "objetivo" }],
    ]);
  });

  it("o catálogo só usa o básico do motor (nada de Storage, laço, página, HEAD, ★); o motor recebe o catálogo sem opções", () => {
    for (const [q, c] of Object.entries(CONSULTAS_CONTA)) {
      expect((c as { assinar?: unknown }).assinar, q).toBeUndefined();
      if (!ehRpc(c.fonte)) {
        const f = c.fonte as FonteTabela;
        expect([f.laco, f.pagina, f.soContar, f.porDia, f.recorte, f.embutidos], q).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
      }
    }
    expect(Object.keys(CATALOGO_CONTA)).toEqual(["consultas"]);
  });
});

describe("hml-21a — as leituras da conta no motor (como a pessoa): o pedido = o da lib de hoje", () => {
  it("avisos: os 30 mais novos, SEM filtro de dono (o RLS: os de quem chama); destino_user_id/user_id do corpo ignorados", async () => {
    const linhas = [{ id: A1, tipo: "plano_atualizado", titulo: "Seu plano", link: "/dieta", lido_em: null, criado_em: "2026-10-12T10:00:00Z" }];
    const { itens, pedidos } = await ler([{ q: "avisos", destino_user_id: OUTRA, user_id: OUTRA }], { tabela: () => ({ data: linhas, error: null }) });
    expect(itens).toEqual([{ ok: true, linhas }]);
    expect(pedidos).toEqual([{ tipo: "select", tabela: "avisos", colunas: "id, tipo, titulo, link, lido_em, criado_em", passos: [["order", "criado_em", { ascending: false }], ["limit", 30]] }]);
  });

  it("aviso_membro_removido: o tipo (só 'membro_removido'), os não lidos, o mais novo, 1 linha; outro tipo ou sem tipo → dados_invalidos", async () => {
    const { itens, pedidos } = await ler([{ q: "aviso_membro_removido", tipo: TIPO_MEMBRO_REMOVIDO }]);
    expect(itens).toEqual([{ ok: true, linhas: [] }]);
    expect(pedidos[0]).toEqual({
      tipo: "select", tabela: "avisos", colunas: "id, titulo, criado_em",
      passos: [["eq", "tipo", "membro_removido"], ["is", "lido_em", null], ["order", "criado_em", { ascending: false }], ["limit", 1]],
    });
    const ruins = await ler([{ q: "aviso_membro_removido", tipo: "plano_atualizado" }, { q: "aviso_membro_removido" }]);
    expect(ruins.itens).toEqual([{ ok: false, erro: "dados_invalidos" }, { ok: false, erro: "dados_invalidos" }]);
    expect(ruins.pedidos).toEqual([]);
  });

  it("as RPCs sem params (situacao, meu_perfil_aluno, meu_plano_app): args vazios mesmo com lixo no corpo; o valor volta como veio", async () => {
    const valores: Record<string, unknown> = { minha_situacao: { matriculas: [] }, meu_perfil_aluno: { nome: "Aluna" }, meu_plano_app: { planos: [] } };
    const { itens, rpcs } = await ler(
      [{ q: "situacao", p_uid: OUTRA }, { q: "meu_perfil_aluno", user_id: OUTRA }, { q: "meu_plano_app", conta: OUTRA }],
      { rpc: (nome) => ({ data: valores[nome], error: null }) },
    );
    expect(itens).toEqual([{ ok: true, valor: valores.minha_situacao }, { ok: true, valor: valores.meu_perfil_aluno }, { ok: true, valor: valores.meu_plano_app }]);
    expect(rpcs).toEqual([{ nome: "minha_situacao", args: {} }, { nome: "meu_perfil_aluno", args: {} }, { nome: "meu_plano_app", args: {} }]);
  });

  it("minha_agenda: o desde (o ISO que a tela calcula) vira o p_desde; sem ele, o padrão da RPC; instante ruim → dados_invalidos", async () => {
    const { itens, rpcs } = await ler([{ q: "minha_agenda", desde: "2026-07-14T03:00:00.000Z" }, { q: "minha_agenda" }, { q: "minha_agenda", desde: "ontem" }], {
      rpc: () => ({ data: [{ id: A1 }], error: null }),
    });
    expect(itens).toEqual([{ ok: true, valor: [{ id: A1 }] }, { ok: true, valor: [{ id: A1 }] }, { ok: false, erro: "dados_invalidos" }]);
    expect(rpcs).toEqual([{ nome: "minha_agenda", args: { p_desde: "2026-07-14T03:00:00.000Z" } }, { nome: "minha_agenda", args: {} }]);
  });

  it("minha_agenda_lista: o tipo, o offset e o limite da lib; limite fora de 1..100, offset negativo ou sem o tipo → dados_invalidos", async () => {
    const { itens, rpcs } = await ler([
      { q: "minha_agenda_lista", tipo: "proximas", offset: 20, limite: 20 },
      { q: "minha_agenda_lista", tipo: "proximas", offset: 0, limite: LIMITE_AGENDA_MAX + 1 },
      { q: "minha_agenda_lista", tipo: "proximas", offset: -1, limite: 20 },
      { q: "minha_agenda_lista", offset: 0, limite: 20 },
    ], { rpc: () => ({ data: { ok: true, total: 21, itens: [] }, error: null }) });
    expect(itens.map((i) => (i.ok === false ? i.erro : "ok"))).toEqual(["ok", "dados_invalidos", "dados_invalidos", "dados_invalidos"]);
    expect(rpcs).toEqual([{ nome: "minha_agenda_lista", args: { p_tipo: "proximas", p_offset: 20, p_limite: 20 } }]);
  });

  it("pratos_prontos_do_app: o objetivo da tela (ou nenhum — o do aluno); o { ok: false, erro } da RPC volta como valor (a lib confere)", async () => {
    const { itens, rpcs } = await ler([{ q: "pratos_prontos_do_app", objetivo: "emagrecer" }, { q: "pratos_prontos_do_app" }], {
      rpc: () => ({ data: { ok: false, erro: "sem_plano_alimentacao" }, error: null }),
    });
    expect(itens).toEqual([{ ok: true, valor: { ok: false, erro: "sem_plano_alimentacao" } }, { ok: true, valor: { ok: false, erro: "sem_plano_alimentacao" } }]);
    expect(rpcs).toEqual([{ nome: "pratos_prontos_do_app", args: { p_objetivo: "emagrecer" } }, { nome: "pratos_prontos_do_app", args: {} }]);
  });

  it("perfil_foto: o profiles de QUEM CHAMA (id = o user do token), só a chave da foto, 1 linha; o id do corpo ignorado", async () => {
    const { itens, pedidos } = await ler([{ q: "perfil_foto", id: OUTRA }], { tabela: () => ({ data: [{ foto_url: "https://x/f.jpg" }], error: null }) });
    expect(itens).toEqual([{ ok: true, linhas: [{ foto_url: "https://x/f.jpg" }] }]);
    expect(pedidos[0]).toEqual({ tipo: "select", tabela: "profiles", colunas: "foto_url:dados_profissionais->>foto_url", passos: [["eq", "id", EU], ["limit", 1]] });
  });

  it("a tela inteira numa ida (o Início do aluno): o sino + o perfil + a agenda = 1 lote; q desconhecida → consulta_invalida só nela", async () => {
    const { itens, pedidos, rpcs } = await ler([{ q: "avisos" }, { q: "meu_perfil_aluno" }, { q: "minha_agenda", desde: "2026-07-14T03:00:00.000Z" }, { q: "fin_do_aluno" }], {
      rpc: () => ({ data: {}, error: null }), tabela: () => ({ data: [], error: null }),
    });
    expect(itens.map((i) => (i.ok === false ? i.erro : "ok"))).toEqual(["ok", "ok", "ok", "consulta_invalida"]);
    expect(pedidos).toHaveLength(1);
    expect(rpcs.map((r) => r.nome)).toEqual(["meu_perfil_aluno", "minha_agenda"]);
  });

  it("N1 (o RLS): outra conta → lista vazia / o valor da RPC dela; o erro do banco vira o código (42501 → sem_acesso), nunca a mensagem", async () => {
    const vazio = await ler([{ q: "avisos" }, { q: "perfil_foto" }], { tabela: () => ({ data: [], error: null }) });
    expect(vazio.itens).toEqual([{ ok: true, linhas: [] }, { ok: true, linhas: [] }]);
    const negado = await ler([{ q: "avisos" }], { tabela: () => ({ data: null, error: { code: "42501", message: "permission denied for table avisos" } }) });
    expect(negado.itens).toEqual([{ ok: false, erro: "sem_acesso" }]);
    expect(JSON.stringify(negado.r)).not.toContain("permission");
  });
});

// ───────────────────────── as ações ─────────────────────────
describe("hml-21a — o despacho e as listas fechadas das ações", () => {
  it("as 14 ações (9 da casca, 5 do app); as listas não se cruzam; o `ler` não está em nenhuma; o corpo de cada uma é fechado", () => {
    expect([...ACOES_DA_CASCA]).toEqual([
      "avisos_marcar_lidos", "aviso_membro_ok", "aviso_mudanca_marcar", "senha_definida", "push_registrar", "push_esquecer", "aceitar_textos",
      "criar_minha_conta", "entrar_sem_profissional",
    ]);
    expect([...ACOES_DO_APP]).toEqual(["perfil_nome", "perfil_foto_preparar", "perfil_foto_salvar", "perfil_foto_tirar", "mudar_objetivo_app"]);
    expect(ACOES_DA_CASCA.filter((a) => (ACOES_DO_APP as readonly string[]).includes(a))).toEqual([]);
    expect(ACOES_DA_CONTA).not.toContain("ler");
    expect(Object.keys(CORPOS_DAS_ACOES).sort()).toEqual([...ACOES_DA_CONTA].sort());
    // nenhuma ação aceita o dono no corpo
    for (const [acao, corpo] of Object.entries(CORPOS_DAS_ACOES)) {
      for (const dono of ["user_id", "destino_user_id", "nutricionista_id", "profissional_id", "dono_id", "id_usuario", "dados_profissionais"]) {
        expect(Object.keys(corpo), `${acao}.${dono}`).not.toContain(dono);
      }
    }
  });

  it("moduloDoPedido: o `ler` ao motor; cada ação ao seu módulo; o resto (desconhecida, lista, número, o nome com outro caixa) → null", () => {
    expect(moduloDoPedido({ acao: "ler" })).toEqual({ modulo: "leitura", acao: "ler" });
    for (const a of ACOES_DA_CASCA) expect(moduloDoPedido({ acao: a })).toEqual({ modulo: "casca", acao: a });
    for (const a of ACOES_DO_APP) expect(moduloDoPedido({ acao: a })).toEqual({ modulo: "app", acao: a });
    for (const v of ["nao_existe", "LER", ["ler"], 3, null, undefined, "anamnese_criar", "transacao_criar", "constructor"]) {
      expect(moduloDoPedido({ acao: v }), String(v)).toBeNull();
    }
    expect(moduloDoPedido({ action: "ler" })).toBeNull();
  });

  it("os status: sem_login 401, sem_acesso 403, nao_encontrado 404, conflito 409, muitas_acoes 429, erro_interno 500, storage_falhou 502, tempo 504; o resto 400", () => {
    expect(STATUS_DO_ERRO_CONTA).toMatchObject({ sem_login: 401, sem_acesso: 403, nao_encontrado: 404, conflito: 409, muitas_acoes: 429, erro_interno: 500, storage_falhou: 502, tempo_esgotado: 504 });
    for (const e of ["acao_invalida", "dados_invalidos", "consulta_invalida", "lote_grande", "schema_invalido", undefined]) expect(statusDoErroConta(e)).toBe(400);
  });
});

describe("hml-21a — as gravações da casca (como a pessoa, o dono do token)", () => {
  it("avisos_marcar_lidos: SÓ o lido_em (o agora do servidor), SÓ os ids pedidos E da pessoa (destino_user_id = quem chama); volta quantos", async () => {
    const { r, pedidos } = await casca("avisos_marcar_lidos", { ids: [A1, A2.toUpperCase(), A1], destino_user_id: OUTRA, user_id: OUTRA, lido_em: "1999-01-01" }, {
      tabela: () => ({ data: [{ id: A1 }], error: null }),
    });
    expect(r).toEqual({ ok: true, marcados: 1 });
    expect(pedidos).toEqual([{
      tipo: "update", tabela: "avisos", valores: { lido_em: AGORA.toISOString() },
      passos: [["in", "id", [A1, A2]], ["eq", "destino_user_id", EU], ["select", "id"]],
    }]);
    expect(JSON.stringify(pedidos)).not.toContain(OUTRA);
  });

  it("avisos_marcar_lidos: sem ids, ids vazios, mais de 30 ou não uuid → dados_invalidos (nada grava)", async () => {
    const muitos = Array.from({ length: AVISOS_MAX + 1 }, (_, i) => `a${String(i).padStart(7, "0")}-1111-4111-8111-111111111111`);
    for (const corpo of [{}, { ids: [] }, { ids: muitos }, { ids: ["nao-uuid"] }, { ids: A1 }]) {
      const { r, pedidos } = await casca("avisos_marcar_lidos", corpo);
      expect(r, JSON.stringify(corpo).slice(0, 40)).toEqual({ ok: false, erro: "dados_invalidos" });
      expect(pedidos).toEqual([]);
    }
  });

  it("aviso_membro_ok: o lido_em daquela linha, se é da pessoa; 0 linha (outra conta, não existe) → nao_encontrado", async () => {
    const ok = await casca("aviso_membro_ok", { id: A1, destino_user_id: OUTRA }, { tabela: () => ({ data: [{ id: A1 }], error: null }) });
    expect(ok.r).toEqual({ ok: true });
    expect(ok.pedidos[0]).toEqual({ tipo: "update", tabela: "avisos", valores: { lido_em: AGORA.toISOString() }, passos: [["eq", "id", A1], ["eq", "destino_user_id", EU], ["select", "id"]] });
    expect((await casca("aviso_membro_ok", { id: A1 }, { tabela: () => ({ data: [], error: null }) })).r).toEqual({ ok: false, erro: "nao_encontrado" });
    expect((await casca("aviso_membro_ok", { id: "x" })).r).toEqual({ ok: false, erro: "dados_invalidos" });
  });

  it("as RPCs da casca com os MESMOS argumentos de hoje (o corpo extra cai); o valor volta no `resultado` (a lib confere o ok/erro dela)", async () => {
    const casos: Array<[AcaoDaCasca, Record<string, unknown>, string, Record<string, unknown>]> = [
      ["aviso_mudanca_marcar", { versao: "1", p_versao: "9" }, "marcar_aviso_mudanca", { p_versao: "1" }],
      ["aviso_mudanca_marcar", {}, "marcar_aviso_mudanca", {}],
      ["senha_definida", { user_id: OUTRA }, "minha_senha_definida", {}],
      ["push_registrar", { token: "fcm-token-de-teste-0123456789", plataforma: "android", versao: "3.111" }, "push_registrar", { p_token: "fcm-token-de-teste-0123456789", p_plataforma: "android", p_versao: "3.111" }],
      ["push_registrar", { token: "fcm-token-de-teste-0123456789", versao: null }, "push_registrar", { p_token: "fcm-token-de-teste-0123456789", p_plataforma: "android", p_versao: null }],
      ["push_esquecer", { token: "fcm-token-de-teste-0123456789", user_id: OUTRA }, "push_esquecer", { p_token: "fcm-token-de-teste-0123456789" }],
      ["aceitar_textos", { versao: "2026-10-08", origem: "site", saude: true, nascimento: "1990-05-20", versao_app: "3.111" }, "aceitar_no_acesso",
        { p_versao: "2026-10-08", p_origem: "site", p_saude: true, p_nascimento: "1990-05-20", p_versao_app: "3.111" }],
      ["aceitar_textos", { versao: "2026-10-08", origem: "apk", saude: false, nascimento: null, versao_app: null }, "aceitar_no_acesso",
        { p_versao: "2026-10-08", p_origem: "apk", p_saude: false, p_nascimento: null, p_versao_app: null }],
      ["criar_minha_conta", { nome: "Consultoria Teste", tipo: "personal", registro: "123", dono_id: OUTRA }, "criar_minha_conta", { p_nome: "Consultoria Teste", p_tipo: "personal", p_registro: "123" }],
      ["criar_minha_conta", { nome: "Consultoria Teste", tipo: "nutricionista", registro: null }, "criar_minha_conta", { p_nome: "Consultoria Teste", p_tipo: "nutricionista", p_registro: null }],
      ["entrar_sem_profissional", { objetivo: "emagrecer", plano: "treino" }, "entrar_sem_profissional", { p_objetivo: "emagrecer", p_plano: "treino" }],
      ["entrar_sem_profissional", { objetivo: "manter", plano: "treino_alimentacao", nascimento: "1990-05-20", consentimento: "2026-10-08", origem: "site" }, "entrar_sem_profissional",
        { p_objetivo: "manter", p_plano: "treino_alimentacao", p_nascimento: "1990-05-20", p_consentimento: "2026-10-08", p_origem: "site" }],
    ];
    for (const [acao, corpo, rpc, args] of casos) {
      const { r, rpcs } = await casca(acao, corpo, { rpc: () => ({ data: { ok: false, erro: "o_codigo_da_rpc" }, error: null }) });
      expect(rpcs, acao).toEqual([{ nome: rpc, args }]);
      if (acao === "aviso_mudanca_marcar") expect(r).toEqual({ ok: true });
      else if (acao === "senha_definida") expect(r).toEqual({ ok: true, definida: false });
      else expect(r, acao).toEqual({ ok: true, resultado: { ok: false, erro: "o_codigo_da_rpc" } });
    }
  });

  it("os corpos ruins das RPCs → dados_invalidos (nada roda): token sem/longo, data que não existe, extras pela metade, texto acima do teto", async () => {
    const casos: Array<[AcaoDaCasca, Record<string, unknown>]> = [
      ["push_registrar", {}], ["push_registrar", { token: "x".repeat(4097) }], ["push_esquecer", { token: 7 }],
      ["aceitar_textos", { origem: "site" }], ["aceitar_textos", { versao: "1", origem: "site", nascimento: "2026-02-31" }], ["aceitar_textos", { versao: "1", origem: "site", saude: "sim" }],
      ["criar_minha_conta", { tipo: "personal" }], ["criar_minha_conta", { nome: "x".repeat(201), tipo: "personal" }],
      ["entrar_sem_profissional", { objetivo: "manter", plano: "treino", nascimento: "1990-05-20" }], ["entrar_sem_profissional", { plano: "treino" }],
      ["aviso_mudanca_marcar", { versao: "v".repeat(41) }],
    ];
    for (const [acao, corpo] of casos) {
      const { r, rpcs } = await casca(acao, corpo);
      expect(r, `${acao} ${JSON.stringify(corpo).slice(0, 40)}`).toEqual({ ok: false, erro: "dados_invalidos" });
      expect(rpcs).toEqual([]);
    }
    expect(argsSemProfissional({ objetivo: "a", plano: "b", origem: "site" })).toBeNull();
  });

  it("o erro da RPC vira o código: o raise de propósito (sem_login) como ele; 42501 → sem_acesso; o inesperado → erro_interno + aviso ao Weslley", async () => {
    const a = await casca("senha_definida", {}, { rpc: () => ({ data: null, error: { code: "P0001", message: "sem_login" } }) });
    expect(a.r).toEqual({ ok: false, erro: "sem_login" });
    expect(a.log.excecao).not.toHaveBeenCalled();
    const b = await casca("push_esquecer", { token: "fcm-token-de-teste-0123456789" }, { rpc: () => ({ data: null, error: { code: "42501", message: "permission denied for function push_esquecer" } }) });
    expect(b.r).toEqual({ ok: false, erro: "sem_acesso" });
    const c = await casca("criar_minha_conta", { nome: "Conta", tipo: "personal" }, { rpc: () => ({ data: null, error: { code: "XX000", message: "boom com detalhe do banco" } }) });
    expect(c.r).toEqual({ ok: false, erro: "erro_interno" });
    expect(c.log.excecao).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(c.r)).not.toContain("boom");
  });
});

describe("hml-21a — as gravações do app do aluno (o perfil e a foto pelo link assinado)", () => {
  it("perfil_nome: SÓ o nome, no profiles de quem chama (id = user); o id/dados do corpo caem; 0 linha → nao_encontrado; sem nome → dados_invalidos", async () => {
    const ok = await app("perfil_nome", { nome: "Aluna Teste", id: OUTRA, dados_profissionais: { foto_url: "x" }, email: "x@y" }, { tabela: () => ({ data: [{ id: EU }], error: null }) });
    expect(ok.r).toEqual({ ok: true });
    expect(ok.pedidos).toEqual([{ tipo: "update", tabela: "profiles", valores: { nome: "Aluna Teste" }, passos: [["eq", "id", EU], ["select", "id"]] }]);
    expect((await app("perfil_nome", { nome: "Aluna" }, { tabela: () => ({ data: [], error: null }) })).r).toEqual({ ok: false, erro: "nao_encontrado" });
    for (const corpo of [{}, { nome: 3 }, { nome: "n".repeat(201) }]) expect((await app("perfil_nome", corpo)).r).toEqual({ ok: false, erro: "dados_invalidos" });
  });

  it("perfil_foto_preparar: o caminho NASCE aqui, na pasta de quem chama (<user>/foto-<agora>.<ext>), no bucket do ambiente; volta o token do link", async () => {
    for (const [tipo, ext] of [["image/png", "png"], ["image/jpeg", "jpg"], ["image/webp", "webp"]] as const) {
      for (const schema of ["staging", "public"] as const) {
        const { r, storage } = await app("perfil_foto_preparar", { tipo, tamanho: 1234, caminho: `${OUTRA}/x.png`, user_id: OUTRA }, {}, schema);
        const bucket = schema === "staging" ? "fotos-perfil-staging" : "fotos-perfil";
        const caminho = `${EU}/foto-${AGORA.getTime()}.${ext}`;
        expect(r).toEqual({ ok: true, bucket, caminho, token: "token-de-upload" });
        expect(storage).toEqual([["assinar_upload", bucket, caminho]]);
      }
    }
  });

  it("perfil_foto_preparar: os limites da tela — só JPG/PNG/WebP, até 5 MB (outro tipo, 0 byte, acima de 5 MB → dados_invalidos); o Storage fora → storage_falhou", async () => {
    for (const corpo of [{ tipo: "image/gif", tamanho: 10 }, { tipo: "application/pdf", tamanho: 10 }, { tipo: "image/png", tamanho: FOTO_MAX_BYTES + 1 }, { tipo: "image/png", tamanho: 0 }, { tipo: "image/png" }]) {
      const { r, storage } = await app("perfil_foto_preparar", corpo);
      expect(r, JSON.stringify(corpo)).toEqual({ ok: false, erro: "dados_invalidos" });
      expect(storage).toEqual([]);
    }
    expect((await app("perfil_foto_preparar", { tipo: "image/png", tamanho: FOTO_MAX_BYTES })).r).toMatchObject({ ok: true });
    const fora = await app("perfil_foto_preparar", { tipo: "image/png", tamanho: 10 }, { storage: { assinarUpload: () => ({ data: null, error: { statusCode: "403" } }) } });
    expect(fora.r).toEqual({ ok: false, erro: "storage_falhou" });
    expect(fora.log.erro).toHaveBeenCalledWith(expect.objectContaining({ codigo: "storage_falhou", status: 403 }));
  });

  it("N8 perfil_foto_salvar: o caminho fora da pasta de quem chama (outra pessoa, ../, subpasta, outro nome/extensão) → dados_invalidos SEM tocar no Storage nem no perfil", async () => {
    const ruins = [
      `${OUTRA}/foto-1.png`, `${EU}/../${OUTRA}/foto-1.png`, `${EU}/sub/foto-1.png`, `${EU}/foto-1.gif`, `${EU}/outro-1.png`, `${EU}/foto-.png`, `/${EU}/foto-1.png`,
      `${EU}/FOTO-1.png`, `${EU}/foto-1.PNG`, `${EU}/foto-1.png/..`, "foto-1.png", "",
    ];
    for (const caminho of ruins) {
      const { r, storage, pedidos } = await app("perfil_foto_salvar", { caminho });
      expect(r, caminho).toEqual({ ok: false, erro: "dados_invalidos" });
      expect(storage, caminho).toEqual([]);
      expect(pedidos, caminho).toEqual([]);
    }
  });

  it("perfil_foto_salvar: o arquivo tem de ESTAR lá; grava a URL pública (o domínio próprio) no dados_profissionais (o resto fica) e apaga a foto ANTERIOR da pasta", async () => {
    const caminho = `${EU}/foto-1760000000000.png`;
    const anterior = `https://api-principal.physiqcalc.com.br/storage/v1/object/public/fotos-perfil-staging/${EU}/foto-1700000000000.jpg`;
    const dados = { registro: "CRN 1", whatsapp_e164: "+5582999999999", foto_url: anterior };
    const { r, pedidos, storage } = await app("perfil_foto_salvar", { caminho, dados_profissionais: { foto_url: "https://outro/x.png" } }, {
      tabela: (p) => (p.tipo === "select" ? { data: [{ dados_profissionais: dados }], error: null } : { data: [{ id: EU }], error: null }),
    });
    const url = `${URL_API_PROPRIA}/storage/v1/object/public/fotos-perfil-staging/${caminho}`;
    expect(r).toEqual({ ok: true, url });
    expect(storage).toEqual([
      ["listar", "fotos-perfil-staging", EU, { search: "foto-1760000000000.png", limit: 10 }],
      ["remover", "fotos-perfil-staging", [`${EU}/foto-1700000000000.jpg`]],
    ]);
    expect(pedidos).toEqual([
      { tipo: "select", tabela: "profiles", colunas: "dados_profissionais", passos: [["eq", "id", EU], ["maybeSingle"]] },
      { tipo: "update", tabela: "profiles", valores: { dados_profissionais: { registro: "CRN 1", whatsapp_e164: "+5582999999999", foto_url: url } }, passos: [["eq", "id", EU], ["select", "id"]] },
    ]);
  });

  it("perfil_foto_salvar: o arquivo que não chegou → nao_encontrado (o perfil não muda); a lista que falha → storage_falhou", async () => {
    const caminho = `${EU}/foto-1760000000000.png`;
    const nao = await app("perfil_foto_salvar", { caminho }, { storage: { listar: () => ({ data: [{ name: "foto-1.png" }], error: null }) } });
    expect(nao.r).toEqual({ ok: false, erro: "nao_encontrado" });
    expect(nao.pedidos).toEqual([]);
    const falhou = await app("perfil_foto_salvar", { caminho }, { storage: { listar: () => ({ data: null, error: { status: 500 } }) } });
    expect(falhou.r).toEqual({ ok: false, erro: "storage_falhou" });
  });

  it("a foto anterior SÓ sai quando é desta pasta e deste bucket: a do Google, a de outra pessoa, a de outro bucket e a mesma ficam", async () => {
    const caminho = `${EU}/foto-1760000000000.png`;
    const ficam = [
      "https://lh3.googleusercontent.com/a/foto=s96-c",
      `https://api-principal.physiqcalc.com.br/storage/v1/object/public/fotos-perfil-staging/${OUTRA}/foto-1.png`,
      `https://api-principal.physiqcalc.com.br/storage/v1/object/public/fotos-perfil/${EU}/foto-1.png`,
      `https://api-principal.physiqcalc.com.br/storage/v1/object/public/fotos-perfil-staging/${caminho}`,
      `https://api-principal.physiqcalc.com.br/storage/v1/object/sign/fotos-perfil-staging/${EU}/foto-1.png?token=x`,
      "nao e url", null,
    ];
    for (const fotoAntes of ficam) {
      const { r, storage } = await app("perfil_foto_salvar", { caminho }, {
        tabela: (p) => (p.tipo === "select" ? { data: [{ dados_profissionais: { foto_url: fotoAntes } }], error: null } : { data: [{ id: EU }], error: null }),
      });
      expect(r, String(fotoAntes)).toMatchObject({ ok: true });
      expect(storage.filter((s) => s[0] === "remover"), String(fotoAntes)).toEqual([]);
    }
    // a de antes pelo host do projeto (as URLs antigas) também é da pasta: sai
    const doProjeto = await app("perfil_foto_salvar", { caminho }, {
      tabela: (p) => (p.tipo === "select"
        ? { data: [{ dados_profissionais: { foto_url: `https://ref.supabase.co/storage/v1/object/public/fotos-perfil-staging/${EU}/foto-5.webp` } }], error: null }
        : { data: [{ id: EU }], error: null }),
    });
    expect(doProjeto.storage.at(-1)).toEqual(["remover", "fotos-perfil-staging", [`${EU}/foto-5.webp`]]);
  });

  it("apagar a anterior é o melhor esforço: não saiu → o perfil fica gravado (ok) e o log avisa arquivo_orfao (sem o caminho)", async () => {
    const { r, log } = await app("perfil_foto_salvar", { caminho: `${EU}/foto-1760000000000.png` }, {
      tabela: (p) => (p.tipo === "select"
        ? { data: [{ dados_profissionais: { foto_url: `https://api-principal.physiqcalc.com.br/storage/v1/object/public/fotos-perfil-staging/${EU}/foto-1.png` } }], error: null }
        : { data: [{ id: EU }], error: null }),
      storage: { remover: () => ({ data: [], error: null }) },
    });
    expect(r).toMatchObject({ ok: true });
    expect(log.aviso).toHaveBeenCalledWith({ codigo: "arquivo_orfao", schema: "staging", acao: "perfil_foto_salvar" });
  });

  it("perfil_foto_tirar: o foto_url sai do dados_profissionais (o resto fica) e o arquivo de antes sai do bucket; sem perfil → nao_encontrado", async () => {
    const anterior = `https://api-principal.physiqcalc.com.br/storage/v1/object/public/fotos-perfil/${EU}/foto-1.jpg`;
    const { r, pedidos, storage } = await app("perfil_foto_tirar", { foto_url: "https://outro/x.png" }, {
      tabela: (p) => (p.tipo === "select" ? { data: [{ dados_profissionais: { crn: "1", foto_url: anterior } }], error: null } : { data: [{ id: EU }], error: null }),
    }, "public");
    expect(r).toEqual({ ok: true });
    expect(pedidos[1]).toEqual({ tipo: "update", tabela: "profiles", valores: { dados_profissionais: { crn: "1", foto_url: null } }, passos: [["eq", "id", EU], ["select", "id"]] });
    expect(storage).toEqual([["remover", "fotos-perfil", [`${EU}/foto-1.jpg`]]]);
    expect((await app("perfil_foto_tirar", {}, { tabela: () => ({ data: [], error: null }) })).r).toEqual({ ok: false, erro: "nao_encontrado" });
  });

  it("mudar_objetivo_app: a RPC de hoje com o objetivo (a RPC confere: objetivo_invalido volta no resultado); sem objetivo → dados_invalidos", async () => {
    const { r, rpcs } = await app("mudar_objetivo_app", { objetivo: "ganhar_massa", p_objetivo: "x" }, { rpc: () => ({ data: { ok: true }, error: null }) });
    expect(r).toEqual({ ok: true, resultado: { ok: true } });
    expect(rpcs).toEqual([{ nome: "mudar_objetivo_app", args: { p_objetivo: "ganhar_massa" } }]);
    expect((await app("mudar_objetivo_app", {})).r).toEqual({ ok: false, erro: "dados_invalidos" });
  });

  it("o erro do banco nas gravações do perfil vira o código (42501 → sem_acesso; o tempo → tempo_esgotado com aviso); nunca a mensagem", async () => {
    const a = await app("perfil_nome", { nome: "x" }, { tabela: () => ({ data: null, error: { code: "42501", message: "new row violates row-level security policy" } }) });
    expect(a.r).toEqual({ ok: false, erro: "sem_acesso" });
    const b = await app("perfil_foto_tirar", {}, { tabela: () => ({ data: null, error: { message: "TimeoutError: signal timed out" } }) });
    expect(b.r).toEqual({ ok: false, erro: "tempo_esgotado" });
    expect(b.log.excecao).toHaveBeenCalledTimes(1);
  });

  it("o log das gravações nunca leva os valores (ids, nome, token, caminho, URL): só código, schema, ação, campo, pg e status", async () => {
    const k = [
      await casca("avisos_marcar_lidos", { ids: ["ruim"] }),
      await app("perfil_nome", { nome: "Maria da Silva" }, { tabela: () => ({ data: null, error: { code: "23505", message: "dup Maria da Silva" } }) }),
      await app("perfil_foto_salvar", { caminho: `${OUTRA}/foto-1.png` }),
      await casca("push_registrar", { token: "fcm-token-secreto-0123456789" }, { rpc: () => ({ data: null, error: { code: "P0001", message: "sem_login" } }) }),
    ];
    const tudo = JSON.stringify(k.map((x) => [x.log.aviso.mock.calls, x.log.erro.mock.calls, x.log.info.mock.calls]));
    for (const proibido of ["Maria", "fcm-token", OUTRA, "ruim", "foto-1"]) expect(tudo, proibido).not.toContain(proibido);
  });
});

describe("hml-21a — as regras puras da foto (= o que a tela fazia)", () => {
  it("o caminho: <user>/foto-<agora em ms>.<ext> — o formato do caminhoFoto da tela; o salvar aceita exatamente esse formato na própria pasta", () => {
    expect(caminhoDaFoto(EU, "image/png", 123)).toBe(`${EU}/foto-123.png`);
    expect(caminhoDaFoto(EU, "image/jpeg", 5)).toBe(`${EU}/foto-5.jpg`);
    expect(caminhoDaFoto(EU, "image/webp", 1760000000000)).toBe(`${EU}/foto-1760000000000.webp`);
    expect(caminhoDaPropriaPasta(`${EU}/foto-123.png`, EU)).toBe(true);
    expect(caminhoDaPropriaPasta(`${EU}/foto-123.png`, OUTRA)).toBe(false);
    expect(caminhoDaPropriaPasta(`${EU}/foto-123.png`, "nao-uuid")).toBe(false);
    expect([bucketDasFotos("staging"), bucketDasFotos("public")]).toEqual(["fotos-perfil-staging", "fotos-perfil"]);
  });

  it("a URL pública = a do getPublicUrl do supabase-js (o mesmo endereço que a tela gravava, no domínio próprio)", () => {
    const cliente = createClient(URL_API_PROPRIA, "anon-de-teste", { auth: { persistSession: false } });
    for (const [bucket, caminho] of [["fotos-perfil", `${EU}/foto-1.png`], ["fotos-perfil-staging", `${EU}/foto-1760000000000.webp`], ["fotos-perfil", "a b/ç.png"]]) {
      expect(urlPublicaDaFoto(bucket, caminho)).toBe(cliente.storage.from(bucket).getPublicUrl(caminho).data.publicUrl);
    }
  });

  it("o dados_profissionais com a foto = o comFoto da tela (o resto do JSON fica; lixo vira objeto novo)", () => {
    for (const dados of [null, undefined, "texto", [1], { crn: "1" }, { crn: "1", foto_url: "https://a/b.png" }]) {
      for (const url of ["https://x/y.png", null]) expect(dadosComFoto(dados, url)).toEqual(comFoto(dados, url));
    }
  });

  it("a foto anterior: só o arquivo direto da pasta de quem chama neste bucket (qualquer host), com o nome seguro", () => {
    const pub = (b: string, c: string) => `https://h.x/storage/v1/object/public/${b}/${c}`;
    expect(caminhoDaFotoAnterior(pub("fotos-perfil", `${EU}/foto-1.png`), "fotos-perfil", EU)).toBe(`${EU}/foto-1.png`);
    expect(caminhoDaFotoAnterior(pub("fotos-perfil", `${EU}/foto-1.png`) + "?v=2", "fotos-perfil", EU)).toBe(`${EU}/foto-1.png`);
    for (const url of [pub("fotos-perfil", `${OUTRA}/foto-1.png`), pub("fotos-perfil", `${EU}/a/b.png`), pub("outro", `${EU}/foto-1.png`), pub("fotos-perfil", `${EU}/..`), "x", ""]) {
      expect(caminhoDaFotoAnterior(url, "fotos-perfil", EU), url).toBeNull();
    }
  });
});

describe("hml-21a — a fonte da função conta: como a pessoa, a porta com o JWKS só no `ler`, sem chave secreta", () => {
  const ler = (rel: string) => readFileSync(resolve(RAIZ, "supabase-principal/functions", rel), "utf-8");
  it("index.ts: servirComoPessoa(\"conta\", { freio: 240, jwtLeitura: \"jwks\" }); o `ler` ao motor comum com o catálogo da conta; o resto pelo moduloDoPedido", () => {
    const fonte = ler("conta/index.ts");
    expect(fonte).toContain('servirComoPessoa("conta", { freio: 240, jwtLeitura: "jwks" }, async (c) => {');
    expect(fonte).toContain("return atenderLeitura(c, CATALOGO_CONTA);");
    expect(fonte).toContain("const pedido = moduloDoPedido(c.corpo);");
    expect(fonte).toMatch(/return json\(r, r\.ok \? 200 : statusDoErroConta\(r\.erro\), c\.origin\);/);
  });
  it("os módulos e as regras: nenhuma chave secreta, cliente de serviço ou Deno; os módulos não importam a porta (o contexto é estrutural)", () => {
    const arquivos = [
      ...readdirSync(resolve(RAIZ, "supabase-principal/functions/conta")).map((f) => `conta/${f}`),
      "_shared/conta-leituras.ts", "_shared/conta-regras.ts",
    ];
    for (const rel of arquivos) {
      const fonte = ler(rel);
      expect(fonte, rel).not.toMatch(/service_?role|SERVICE_ROLE|sb_secret|createClient|Deno\.env/);
      if (rel !== "conta/index.ts") expect(fonte, rel).not.toMatch(/from "[^"]*porta-pessoa/);
    }
    expect(arquivos.sort()).toEqual(["_shared/conta-leituras.ts", "_shared/conta-regras.ts", "conta/app.ts", "conta/casca.ts", "conta/comum.ts", "conta/index.ts"]);
  });
});
