// Physiq hml-21c (H-43 · jeito 2, etapa 3) — a função conta no Vitest, parte 4: o Aluno › Resumo (o login do aluno — a aba Acessos —, as
// "Mensagens automáticas", os dados, o link, o responsável, a reserva do envio), as Configurações (Perfil, Conta, Equipe, Convite, o ZIP), a
// Mensagens (+ o número do menu e a faixa da casca) e a Lixeira. O CATÁLOGO 21c (supabase-principal/functions/_shared/conta-leituras.ts:
// CONSULTAS_21C) rodado pelo motor comum (_shared/leitura-servidor.ts) e as GRAVAÇÕES (conta/{aluno,configuracoes,mensagens,lixeira}.ts, com
// as regras de _shared/conta-regras.ts), com um cliente falso que faz o papel do PostgREST e das RPCs COMO A PESSOA (os módulos não importam
// a porta: o contexto é estrutural). Por ACRÉSCIMO: a 21a, a 21b e a 21d não mudam (os testes delas seguem verdes).
// Positivo: cada `q` e cada ação com os params/args certos — os MESMOS que a lib mandava no c6e795b (fixos aqui, DA_LIB: nunca lidos do
// próprio catálogo); as colunas = o select da lib (nenhum "*"); o teto; o dono das "minhas" (o profiles: id = o user do token).
// Negativo: q/ação desconhecida; uuid/instante/enum/texto/inteiro ruins → dados_invalidos (nada roda); o dono do corpo ignorado; a chave de
// fora: no corpo CAI, num objeto fechado (ajustes, dados, whatsapp, momentos, textos) é RECUSA; as 3 chaves da W-A no ajuste → recusa; a
// aluno_acesso como `q` do `ler` → consulta_invalida; cada raise conhecido (a varredura da decisão B) → o código, SEM log.excecao; o
// inesperado → erro_interno sem a mensagem; a senha e o e-mail nunca no log.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ehRpc, type CatalogoLeitura, type FonteRpc, type FonteTabela, type RespostaDeItem } from "../../supabase-principal/functions/_shared/leitura-lote";
import { atenderLeitura } from "../../supabase-principal/functions/_shared/leitura-servidor";
import { limparMensagem } from "../../supabase-principal/functions/_shared/erros";
import {
  CATALOGO_CONTA, COLUNAS_DO_PERFIL, CONSULTAS_21C, CONSULTAS_DA_21C, ERROS_DA_MATRICULA_DA_ROTA, TODAS_AS_CONSULTAS, consultaDaConta,
} from "../../supabase-principal/functions/_shared/conta-leituras";
import {
  ACOES_DA_21C, ACOES_DA_CONTA, ACOES_DA_LIXEIRA, ACOES_DAS_CONFIGURACOES, ACOES_DAS_MENSAGENS, ACOES_DO_ALUNO, CORPOS_DA_21C, CORPOS_DAS_ACOES,
  ERROS_DO_ACESSO, ERROS_DO_CRIAR_ACESSO, ERROS_DO_REDEFINIR_SENHA, ERROS_DOS_DADOS_DO_ALUNO, FAIXA_IDS_MAX, MOMENTOS_WHATSAPP, ZIP_PACIENTES_MAX,
  lerCorpoDaAcao, moduloDoPedido, statusDoErroConta, type AcaoDa21c,
} from "../../supabase-principal/functions/_shared/conta-regras";
import { atenderAluno } from "../../supabase-principal/functions/conta/aluno";
import { atenderConfiguracoes } from "../../supabase-principal/functions/conta/configuracoes";
import { atenderLixeira } from "../../supabase-principal/functions/conta/lixeira";
import { atenderMensagens } from "../../supabase-principal/functions/conta/mensagens";

const RAIZ = resolve(__dirname, "../..");
const EU = "33333333-3333-4333-8333-333333333333";
const OUTRA = "99999999-9999-4999-8999-999999999999";
const CONTA = "c0c0c0c0-0000-4000-8000-000000000001";
const A1 = "a1111111-1111-4111-8111-111111111111";
const M1 = "b2222222-2222-4222-8222-222222222222";
const EMAIL = "aluno.secreto@exemplo.com";
const SENHA = "Senha-Muito-Secreta-123";

// ───────────────────────── o cliente falso (grava cada pedido; o RLS de quem chama é o "banco" do teste) ─────────────────────────
type Resposta = { data: unknown; error: unknown; count?: number | null };
interface Pedido {
  tipo: "select" | "update";
  tabela: string;
  colunas?: string;
  valores?: Record<string, unknown>;
  passos: unknown[][];
}
interface Banco {
  rpc?: (nome: string, args: Record<string, unknown>) => Resposta;
  tabela?: (p: Pedido) => Resposta;
}
function clienteFalso(banco: Banco) {
  const pedidos: Pedido[] = [];
  const rpcs: Array<{ nome: string; args: Record<string, unknown> }> = [];
  const resolver = (p: Pedido) => (banco.tabela ? banco.tabela(p) : { data: p.tipo === "select" ? [] : null, error: null });
  const cadeia = (p: Pedido) => {
    const b: Record<string, unknown> = {};
    for (const op of ["in", "eq", "is", "gte", "lte", "lt", "gt", "ilike", "or", "order", "limit", "range"]) b[op] = (...a: unknown[]) => (p.passos.push([op, ...a]), b);
    b.select = (colunas: string) => (p.passos.push(["select", colunas]), b);
    b.maybeSingle = () => {
      p.passos.push(["maybeSingle"]);
      const r = resolver(p);
      return Promise.resolve({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data });
    };
    b.then = (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) => Promise.resolve(resolver(p)).then(ok, falhou);
    return b;
  };
  const novo = (p: Pedido) => (pedidos.push(p), cadeia(p));
  const cliente = {
    rpc: (nome: string, args: Record<string, unknown> = {}) => {
      rpcs.push({ nome, args });
      return Promise.resolve(banco.rpc ? banco.rpc(nome, args) : { data: null, error: null });
    },
    from: (tabela: string) => ({
      select: (colunas: string) => novo({ tipo: "select", tabela, colunas, passos: [] }),
      update: (valores: Record<string, unknown>) => novo({ tipo: "update", tabela, valores, passos: [] }),
      insert: () => {
        throw new Error("a 21c não insere direto");
      },
      upsert: () => {
        throw new Error("a 21c não faz upsert direto");
      },
      delete: () => {
        throw new Error("a 21c não apaga direto");
      },
    }),
    storage: {
      from: () => {
        throw new Error("a 21c não usa o Storage (a foto do profissional vai pelas ações da 21a)");
      },
    },
  };
  return { cliente, pedidos, rpcs };
}
function contexto(corpo: Record<string, unknown>, banco: Banco = {}) {
  const f = clienteFalso(banco);
  const log = { info: vi.fn(), aviso: vi.fn(), erro: vi.fn(), excecao: vi.fn() };
  return { c: { schema: "staging" as const, origin: null, corpo, userId: EU, comoPessoa: f.cliente, log }, log, ...f };
}
async function ler(itens: unknown[], banco: Banco = {}) {
  const k = contexto({ acao: "ler", itens }, banco);
  const r = await atenderLeitura(k.c as never, CATALOGO_CONTA);
  return { r, itens: r.ok ? (r as { itens: RespostaDeItem[] }).itens : [], ...k };
}
/** Uma ação da 21c no módulo que o moduloDoPedido escolhe (o mesmo despacho do index.ts). */
async function acao(nome: AcaoDa21c, corpo: Record<string, unknown> = {}, banco: Banco = {}) {
  const k = contexto({ ...corpo, acao: nome }, banco);
  const pedido = moduloDoPedido(k.c.corpo);
  let r: unknown;
  if (pedido?.modulo === "aluno") r = await atenderAluno(k.c as never, pedido.acao);
  else if (pedido?.modulo === "configuracoes") r = await atenderConfiguracoes(k.c as never, pedido.acao);
  else if (pedido?.modulo === "mensagens") r = await atenderMensagens(k.c as never, pedido.acao);
  else if (pedido?.modulo === "lixeira") r = await atenderLixeira(k.c as never, pedido.acao);
  else throw new Error(`ação fora da 21c: ${nome}`);
  return { r: r as { ok: boolean; erro?: string; resultado?: unknown }, ...k };
}
const tudoDoLog = (log: Record<string, ReturnType<typeof vi.fn>>, sem: string[] = []) =>
  JSON.stringify(Object.entries(log).filter(([n]) => !sem.includes(n)).map(([n, f]) => [n, f.mock.calls]));
const semEspacos = (s: string) => s.replace(/\s+/g, "");

/**
 * O que a lib do c6e795b mandava ao banco (FIXO — nunca o próprio catálogo): o select do profiles próprio de cada tela e os args de cada
 * RPC de leitura (o null que ela mandava = o arg que o servidor deixa de fora: a RPC tem DEFAULT null nele — catálogo vivo, hml21/medicao/
 * rpcs_21c_defs.txt; a lixeira_da_conta, a whatsapp_fila, a whatsapp_resumo e a paciente_dado_livre).
 */
const DA_LIB = {
  perfil_profissional: { origem: "src/painel/configuracoes/Perfil.tsx:52 buscarPerfil", select: "nome, email, tipo_perfil, area_outra, dados_profissionais" },
  perfil_mensagens: { origem: "src/painel/mensagens/api.ts:137 lerPerfilWhatsapp", select: "nome, dados_profissionais, config" },
  rpcs: {
    dado_livre: { origem: "src/nucleo/dadoLivre.ts:22", rpc: "paciente_dado_livre", args: ["p_email", "p_cpf", "p_paciente"] },
    aluno_responsavel: { origem: "src/publico/legal/responsavel/api.ts:30 (buscarResponsavel)", rpc: "aluno_responsavel", args: ["p_aluno"] },
    whatsapp_resumo: { origem: "src/painel/mensagens/api.ts:91 buscarResumo", rpc: "whatsapp_resumo", args: ["p_conta"] },
    whatsapp_fila: { origem: "src/painel/mensagens/api.ts:106 listarFila", rpc: "whatsapp_fila", args: ["p_conta", "p_escopo", "p_filtro", "p_limite", "p_antes", "p_antes_id"] },
    mensagens_desligadas: { origem: "src/painel/aluno/dados/api.ts:78 buscarMensagensDesligadas", rpc: "mensagens_desligadas", args: [] },
    lixeira: { origem: "src/ferramentas/lixeira/dados.ts:34 listarLixeira", rpc: "lixeira_da_conta", args: ["p_conta", "p_tipo", "p_busca", "p_offset", "p_limite"] },
  },
} as const;

// ───────────────────────── o catálogo ─────────────────────────
describe("hml-21c — o catálogo da conta (as consultas do bloco 21c da §2.2)", () => {
  it("as 8 consultas da 21c (os nomes da §2.2; o profiles próprio em 2 — PADRÃO); por acréscimo, no fim; nenhuma repete um nome", () => {
    expect(Object.keys(CONSULTAS_21C)).toEqual([
      "dado_livre", "aluno_responsavel", "perfil_profissional", "perfil_mensagens", "whatsapp_resumo", "whatsapp_fila", "mensagens_desligadas", "lixeira",
    ]);
    expect(CONSULTAS_DA_21C).toEqual(Object.keys(CONSULTAS_21C));
    expect(TODAS_AS_CONSULTAS.slice(-CONSULTAS_DA_21C.length)).toEqual(CONSULTAS_DA_21C);
    expect(new Set(TODAS_AS_CONSULTAS).size).toBe(TODAS_AS_CONSULTAS.length);
    for (const q of CONSULTAS_DA_21C) expect(consultaDaConta(q), q).toBe((CATALOGO_CONTA.consultas as CatalogoLeitura)[q]);
    // o login do aluno (aluno_acesso: lê e confere quem pode) e o ZIP são AÇÃO — fora do `ler` (decisão 13; PADRÃO do ZIP)
    for (const q of ["aluno_acesso", "acesso_ler", "prontuarios_para_baixar", "w2l_prontuarios_para_baixar", "lixeira_da_conta", "paciente_dado_livre"]) {
      expect(consultaDaConta(q), q).toBeNull();
    }
  });

  it("o profiles próprio: as colunas do select de cada tela no c6e795b (nenhum '*'), teto 1, o dono = o id (o user do token)", () => {
    for (const q of ["perfil_profissional", "perfil_mensagens"] as const) {
      const c = CONSULTAS_21C[q];
      const f = c.fonte as FonteTabela;
      expect(f.tabela, q).toBe("profiles");
      expect(semEspacos(f.colunas.join(",")), `${q} × ${DA_LIB[q].origem}`).toBe(semEspacos(DA_LIB[q].select));
      expect(f.colunas.join(","), q).not.toContain("*");
      expect([f.teto, c.dono, Object.keys(c.params)], q).toEqual([1, "id", []]);
      expect(f.colunas, q).toEqual(COLUNAS_DO_PERFIL[q]);
    }
  });

  it("as RPCs: a MESMA de hoje com os MESMOS args que a lib mandava (fixos do c6e795b); nenhuma com `erros` (nenhuma levanta de propósito)", () => {
    for (const [q, lib] of Object.entries(DA_LIB.rpcs)) {
      const f = (CONSULTAS_21C as unknown as Record<string, { fonte: FonteRpc }>)[q].fonte;
      expect(ehRpc(f), q).toBe(true);
      expect(f.rpc, `${q} × ${lib.origem}`).toBe(lib.rpc);
      expect(Object.keys(f.args ?? {}), `${q} × ${lib.origem}`).toEqual(lib.args);
      expect(f.erros, q).toBeUndefined();
    }
    // a Lixeira é a pesada: num lote só dela (§2.6); as outras não
    expect(CONSULTAS_21C.lixeira.sozinha).toBe(true);
    expect(CONSULTAS_DA_21C.filter((q) => (CONSULTAS_21C as Record<string, { sozinha?: boolean }>)[q].sozinha)).toEqual(["lixeira"]);
  });
});

// ───────────────────────── o `ler` ─────────────────────────
describe("hml-21c — o `ler`: as consultas como a pessoa, os args montados aqui, o dono do token", () => {
  it("o profiles próprio: o select da lib + o id = quem chama (o id/user_id/dono do corpo CAEM) + o teto 1", async () => {
    const linha = { nome: "Nutri", email: "n@x.com", tipo_perfil: "nutricionista", area_outra: null, dados_profissionais: { crn: "1" } };
    const { itens, pedidos } = await ler(
      [{ q: "perfil_profissional", id: OUTRA, user_id: OUTRA, dono: OUTRA }, { q: "perfil_mensagens", id: OUTRA }],
      { tabela: () => ({ data: [linha], error: null }) },
    );
    expect(itens).toEqual([{ ok: true, linhas: [linha] }, { ok: true, linhas: [linha] }]);
    expect(pedidos.map((p) => [p.tabela, p.colunas, p.passos])).toEqual([
      ["profiles", "nome, email, tipo_perfil, area_outra, dados_profissionais", [["eq", "id", EU], ["limit", 1]]],
      ["profiles", "nome, dados_profissionais, config", [["eq", "id", EU], ["limit", 1]]],
    ]);
    expect(JSON.stringify(pedidos)).not.toContain(OUTRA);
  });

  it("as RPCs: os args que a lib mandava (o null = o arg de fora — DEFAULT null na RPC); a chave do corpo que não é param CAI; o valor como veio", async () => {
    const valor = { ok: true, x: 1 };
    const { itens, rpcs } = await ler(
      [
        { q: "dado_livre", email: "a@b.com", cpf: "12345678901", paciente: A1.toUpperCase(), p_email: "outro@x.com", user_id: OUTRA },
        { q: "dado_livre", email: "a@b.com", cpf: null, paciente: null },
        { q: "aluno_responsavel", aluno: A1, p_aluno: OUTRA },
        { q: "whatsapp_resumo", conta: CONTA },
        { q: "whatsapp_resumo", conta: null },
        { q: "whatsapp_fila", conta: CONTA, escopo: "conta", filtro: "falhas", limite: 30, antes: "2026-10-13T12:34:56.123456+00:00", antes_id: M1 },
        { q: "whatsapp_fila", conta: null, escopo: "meus", filtro: "todas", limite: 30, antes: null, antes_id: null },
        { q: "mensagens_desligadas", ids: [OUTRA] },
        { q: "lixeira", conta: CONTA, tipo: "anamnese", busca: "maria", offset: 20, limite: 20, nutricionista_id: OUTRA },
        { q: "lixeira", conta: CONTA, tipo: null, busca: null, offset: 0, limite: 20 },
      ],
      { rpc: () => ({ data: valor, error: null }) },
    );
    expect(itens.every((i) => i.ok === true && JSON.stringify((i as { valor: unknown }).valor) === JSON.stringify(valor))).toBe(true);
    expect(rpcs).toEqual([
      { nome: "paciente_dado_livre", args: { p_email: "a@b.com", p_cpf: "12345678901", p_paciente: A1 } },
      { nome: "paciente_dado_livre", args: { p_email: "a@b.com" } },
      { nome: "aluno_responsavel", args: { p_aluno: A1 } },
      { nome: "whatsapp_resumo", args: { p_conta: CONTA } },
      { nome: "whatsapp_resumo", args: {} },
      { nome: "whatsapp_fila", args: { p_conta: CONTA, p_escopo: "conta", p_filtro: "falhas", p_limite: 30, p_antes: "2026-10-13T12:34:56.123456+00:00", p_antes_id: M1 } },
      { nome: "whatsapp_fila", args: { p_escopo: "meus", p_filtro: "todas", p_limite: 30 } },
      { nome: "mensagens_desligadas", args: {} },
      { nome: "lixeira_da_conta", args: { p_conta: CONTA, p_tipo: "anamnese", p_busca: "maria", p_offset: 20, p_limite: 20 } },
      { nome: "lixeira_da_conta", args: { p_conta: CONTA, p_offset: 0, p_limite: 20 } },
    ]);
    expect(JSON.stringify(rpcs)).not.toContain(OUTRA);
  });

  it("o { ok: false, erro } das RPCs volta como VALOR (a lib confere como hoje); o RLS recusa → sem_acesso; o inesperado → erro_interno sem a mensagem", async () => {
    const recusada = await ler([{ q: "lixeira", conta: CONTA, offset: 0, limite: 20 }], { rpc: () => ({ data: { ok: false, erro: "sem_acesso" }, error: null }) });
    expect(recusada.itens).toEqual([{ ok: true, valor: { ok: false, erro: "sem_acesso" } }]);
    const negado = await ler([{ q: "perfil_profissional" }], { tabela: () => ({ data: null, error: { code: "42501", message: "permission denied for table profiles" } }) });
    expect(negado.itens).toEqual([{ ok: false, erro: "sem_acesso" }]);
    expect(negado.log.excecao).not.toHaveBeenCalled();
    const quebrou = await ler([{ q: "whatsapp_fila" }], { rpc: () => ({ data: null, error: { code: "XX000", message: "detalhe interno do banco" } }) });
    expect(quebrou.itens).toEqual([{ ok: false, erro: "erro_interno" }]);
    expect(JSON.stringify(quebrou.r)).not.toContain("detalhe");
    expect(quebrou.log.excecao).toHaveBeenCalledTimes(1);
  });

  it("os params fora da forma → dados_invalidos SÓ naquele item, e nada vai ao banco; a aluno_acesso como q → consulta_invalida", async () => {
    const ruins = [
      { q: "aluno_responsavel", aluno: "a1" },
      { q: "aluno_responsavel" },
      { q: "dado_livre", paciente: "nao-e-uuid" },
      { q: "dado_livre", email: "x".repeat(321) },
      { q: "whatsapp_fila", escopo: "todos" },
      { q: "whatsapp_fila", filtro: "lidas" },
      { q: "whatsapp_fila", limite: 0 },
      { q: "whatsapp_fila", limite: 101 },
      { q: "whatsapp_fila", antes: "ontem" },
      { q: "whatsapp_fila", antes_id: "x" },
      { q: "whatsapp_resumo", conta: "conta-1" },
      { q: "lixeira", conta: CONTA, offset: -1, limite: 20 },
      { q: "lixeira", conta: CONTA, offset: 0, limite: 101 },
      { q: "lixeira", conta: CONTA, offset: 0 },
      { q: "lixeira", offset: 0, limite: 20 },
      { q: "lixeira", conta: CONTA, offset: 0, limite: 20, busca: "x".repeat(501) },
      { q: "lixeira", conta: CONTA, offset: 0, limite: 20, tipo: "x".repeat(41) },
    ];
    // em 2 lotes (o teto do motor: 16 itens por pedido)
    const a = await ler(ruins.slice(0, 9));
    const b = await ler([...ruins.slice(9), { q: "aluno_acesso", aluno: A1 }, { q: "prontuarios_para_baixar", pacientes: [A1] }]);
    expect([...a.itens, ...b.itens.slice(0, ruins.length - 9)]).toEqual(ruins.map(() => ({ ok: false, erro: "dados_invalidos" })));
    expect(b.itens.slice(ruins.length - 9)).toEqual([{ ok: false, erro: "consulta_invalida" }, { ok: false, erro: "consulta_invalida" }]);
    expect([a.rpcs, a.pedidos, b.rpcs, b.pedidos]).toEqual([[], [], [], []]);
  });
});

// ───────────────────────── as ações: o despacho e o corpo ─────────────────────────
describe("hml-21c — o despacho e as listas fechadas das ações do Resumo, das Configurações, da Mensagens e da Lixeira", () => {
  it("as 21 ações (os nomes da §2.2 + o ZIP como ação, PADRÃO); nenhuma cruza com a 21a/21b; o corpo de cada uma é fechado e sem dono", () => {
    expect([...ACOES_DO_ALUNO]).toEqual([
      "acesso_ler", "acesso_criar", "acesso_redefinir_senha", "aluno_ajustes_salvar", "aluno_dados_salvar", "aluno_link_novo", "aluno_responsavel_registrar",
      "aluno_avisar_plano",
    ]);
    expect([...ACOES_DAS_CONFIGURACOES]).toEqual(["perfil_salvar", "conta_salvar", "equipe_papeis", "equipe_remover", "meu_codigo_garantir", "prontuarios_para_baixar"]);
    expect([...ACOES_DAS_MENSAGENS]).toEqual(["whatsapp_config_salvar", "whatsapp_reenviar", "whatsapp_limpar_falhas", "faixa_ligar_para_todos", "faixa_fechar"]);
    expect([...ACOES_DA_LIXEIRA]).toEqual(["lixeira_restaurar", "lixeira_apagar"]);
    expect(ACOES_DA_21C).toEqual([...ACOES_DO_ALUNO, ...ACOES_DAS_CONFIGURACOES, ...ACOES_DAS_MENSAGENS, ...ACOES_DA_LIXEIRA]);
    const antes = ACOES_DA_CONTA.slice(0, -ACOES_DA_21C.length) as string[];
    expect(ACOES_DA_21C.filter((a) => antes.includes(a))).toEqual([]);
    expect(new Set(ACOES_DA_CONTA).size).toBe(ACOES_DA_CONTA.length);
    expect(Object.keys(CORPOS_DA_21C).sort()).toEqual([...ACOES_DA_21C].sort());
    for (const a of ACOES_DA_21C) expect(CORPOS_DAS_ACOES[a], a).toBe(CORPOS_DA_21C[a]);
    const chaves = (o: unknown): string[] =>
      Object.entries(o as Record<string, { tipo: string; campos?: unknown }>).flatMap(([k, c]) => [k, ...(c.tipo === "fechado" ? chaves(c.campos) : [])]);
    for (const [a, corpo] of Object.entries(CORPOS_DA_21C)) {
      for (const dono of ["user_id", "destino_user_id", "nutricionista_id", "profissional_id", "dono_id", "id_usuario", "foto_url", "deleted_at", "created_at"]) {
        expect(chaves(corpo), `${a}.${dono}`).not.toContain(dono);
      }
    }
  });

  it("moduloDoPedido: cada ação ao módulo dela; a 21a e a 21b como antes; o `ler` ao motor; desconhecida → null", () => {
    for (const a of ACOES_DO_ALUNO) expect(moduloDoPedido({ acao: a })).toEqual({ modulo: "aluno", acao: a });
    for (const a of ACOES_DAS_CONFIGURACOES) expect(moduloDoPedido({ acao: a })).toEqual({ modulo: "configuracoes", acao: a });
    for (const a of ACOES_DAS_MENSAGENS) expect(moduloDoPedido({ acao: a })).toEqual({ modulo: "mensagens", acao: a });
    for (const a of ACOES_DA_LIXEIRA) expect(moduloDoPedido({ acao: a })).toEqual({ modulo: "lixeira", acao: a });
    expect(moduloDoPedido({ acao: "pacote_definir" })).toEqual({ modulo: "alunos", acao: "pacote_definir" });
    expect(moduloDoPedido({ acao: "perfil_nome" })).toEqual({ modulo: "app", acao: "perfil_nome" });
    expect(moduloDoPedido({ acao: "ler" })).toEqual({ modulo: "leitura", acao: "ler" });
    for (const a of ["aluno_acesso", "paciente_criar_acesso", "whatsapp_salvar_config", "lixeira_da_conta", "acesso", "", null, 3]) {
      expect(moduloDoPedido({ acao: a }), String(a)).toBeNull();
    }
    expect(statusDoErroConta("sem_acesso")).toBe(403);
    expect(statusDoErroConta("ja_tem_acesso")).toBe(400);
  });
});

// ───────────────────────── o Aluno › Resumo ─────────────────────────
describe("hml-21c — o Aluno › Resumo: o login do aluno, os ajustes, os dados, o link, o responsável e o envio", () => {
  it("cada ação chama a MESMA RPC com os MESMOS args da lib do c6e795b (a do aluno na rota; o dono nunca vem do corpo); o valor no `resultado`", async () => {
    const casos: Array<[AcaoDa21c, Record<string, unknown>, string, Record<string, unknown>]> = [
      ["acesso_ler", { aluno: A1 }, "aluno_acesso", { p_aluno: A1 }],
      ["acesso_criar", { aluno: A1, email: EMAIL, senha: SENHA }, "paciente_criar_acesso", { p_paciente_id: A1, p_email: EMAIL, p_senha: SENHA }],
      ["acesso_redefinir_senha", { aluno: A1, senha: SENHA }, "paciente_redefinir_senha", { p_paciente_id: A1, p_senha: SENHA }],
      ["aluno_ajustes_salvar", { aluno: A1, ajustes: { mensagens_automaticas: true } }, "aluno_salvar_ajustes", { p_aluno: A1, p_ajustes: { mensagens_automaticas: true } }],
      ["aluno_dados_salvar", { aluno: A1, dados: { apelido: "Ju", resumo: "" } }, "aluno_salvar_dados", { p_aluno: A1, p_dados: { apelido: "Ju", resumo: "" } }],
      ["aluno_link_novo", { aluno: A1 }, "aluno_novo_link", { p_aluno: A1 }],
      [
        "aluno_responsavel_registrar", { aluno: A1, dados: { acao: "registrar", nome: "Ana", vinculo: "mae", forma: "presencial", confirmo: true, origem: "site" } },
        "aluno_responsavel_registrar", { p_aluno: A1, p_dados: { acao: "registrar", nome: "Ana", vinculo: "mae", forma: "presencial", confirmo: true, origem: "site" } },
      ],
      ["aluno_responsavel_registrar", { aluno: A1, dados: { acao: "retirar", origem: "apk" } }, "aluno_responsavel_registrar", { p_aluno: A1, p_dados: { acao: "retirar", origem: "apk" } }],
      ["aluno_avisar_plano", { aluno: A1, modulos: ["treino", "dieta"] }, "aluno_avisar_plano", { p_aluno: A1, p_modulos: ["treino", "dieta"] }],
    ];
    for (const [a, corpo, rpc, args] of casos) {
      const valor = { ok: true, de: rpc };
      const { r, rpcs, pedidos } = await acao(a, { ...corpo, user_id: OUTRA, nutricionista_id: OUTRA, p_aluno: OUTRA, p_paciente_id: OUTRA, p_dados: { x: 1 } }, {
        rpc: () => ({ data: valor, error: null }),
      });
      expect(r, a).toEqual({ ok: true, resultado: valor });
      expect(rpcs, a).toEqual([{ nome: rpc, args }]);
      expect(pedidos, a).toEqual([]);
      expect(JSON.stringify(rpcs), a).not.toContain(OUTRA);
    }
    // o criar devolve o user_id novo (a RPC devolve o uuid) e o redefinir, nada (void) — como vieram
    expect((await acao("acesso_criar", { aluno: A1, email: EMAIL, senha: SENHA }, { rpc: () => ({ data: M1, error: null }) })).r).toEqual({ ok: true, resultado: M1 });
    expect((await acao("acesso_redefinir_senha", { aluno: A1, senha: SENHA }, { rpc: () => ({ data: null, error: null }) })).r).toEqual({ ok: true, resultado: null });
    // o { ok: false, erro } da RPC volta como valor (a lib confere: ajuste_invalido, nome_invalido, falta_confirmar, sem_modulo…)
    for (const erro of ["ajuste_invalido", "nome_invalido", "falta_confirmar", "sem_modulo", "conta_real_no_staging", "email_repetido"]) {
      const { r } = await acao("aluno_dados_salvar", { aluno: A1, dados: { nome: "x" } }, { rpc: () => ({ data: { ok: false, erro }, error: null }) });
      expect(r, erro).toEqual({ ok: true, resultado: { ok: false, erro } });
    }
  });

  it("o card \"Mensagens automáticas\": SÓ a mensagens_automaticas (booleano); as 3 da W-A, outra chave, vazio ou fora da forma → RECUSA, nada roda", async () => {
    const ruins: unknown[] = [
      { acesso_app: true }, { diario_alimentar: false }, { acesso_link: true }, { mensagens_automaticas: true, acesso_app: true },
      { mensagens_automaticas: true, qualquer: 1 }, {}, { mensagens_automaticas: "true" }, { mensagens_automaticas: null }, null, [true], "mensagens_automaticas",
      { __proto__: null, constructor: true }, JSON.parse('{"__proto__": {"x": 1}, "mensagens_automaticas": true}'),
    ];
    for (const ajustes of ruins) {
      const { r, rpcs, log } = await acao("aluno_ajustes_salvar", { aluno: A1, ajustes }, { rpc: () => ({ data: { ok: true }, error: null }) });
      expect(r, JSON.stringify(ajustes)).toEqual({ ok: false, erro: "dados_invalidos" });
      expect(rpcs, JSON.stringify(ajustes)).toEqual([]);
      expect(log.aviso).toHaveBeenCalledWith(expect.objectContaining({ codigo: "dados_invalidos", acao: "aluno_ajustes_salvar", resultado: "ajustes" }));
    }
    expect((await acao("aluno_ajustes_salvar", { aluno: A1 })).r).toEqual({ ok: false, erro: "dados_invalidos" });
    expect((await acao("aluno_ajustes_salvar", { aluno: A1, ajustes: { mensagens_automaticas: false } }, { rpc: () => ({ data: { ok: true }, error: null }) })).rpcs)
      .toEqual([{ nome: "aluno_salvar_ajustes", args: { p_aluno: A1, p_ajustes: { mensagens_automaticas: false } } }]);
  });

  it("os dados do aluno: as 9 chaves que a RPC lê; a vazia LIMPA (vai como veio); o null só onde limpa (o nome não); chave de fora → RECUSA", async () => {
    const todos = { nome: "Maria Silva", apelido: "", nascimento: "2000-01-31", genero: "feminino", cpf: "123.456.789-01", telefone: "", email: "m@x.com", objetivo: "", resumo: "texto" };
    const ok = await acao("aluno_dados_salvar", { aluno: A1, dados: todos }, { rpc: () => ({ data: { ok: true }, error: null }) });
    expect(ok.rpcs).toEqual([{ nome: "aluno_salvar_dados", args: { p_aluno: A1, p_dados: todos } }]);
    const nulos = { apelido: null, nascimento: null, genero: null, cpf: null, telefone: null, email: null, objetivo: null, resumo: null };
    expect((await acao("aluno_dados_salvar", { aluno: A1, dados: nulos }, { rpc: () => ({ data: { ok: true }, error: null }) })).rpcs)
      .toEqual([{ nome: "aluno_salvar_dados", args: { p_aluno: A1, p_dados: nulos } }]);
    for (const dados of [{ nome: null }, { user_id: OUTRA }, { nome: "x", conta_id: CONTA }, { treino_user_id: A1 }, { altura: 170 }, { nome: 3 }, { resumo: "x".repeat(10_001) }, null, []]) {
      const { r, rpcs } = await acao("aluno_dados_salvar", { aluno: A1, dados });
      expect([r, rpcs], JSON.stringify(dados)).toEqual([{ ok: false, erro: "dados_invalidos" }, []]);
    }
  });

  it("o responsável: as chaves do dadosDoRegistro/dadosDaRetirada (os valores a RPC confere); chave de fora → RECUSA; sem a ação → RECUSA", async () => {
    for (const dados of [{ acao: "registrar", nome: "Ana", extra: 1 }, { nome: "Ana" }, { acao: "retirar", origem: "site", registrado_por: OUTRA }, { acao: 3 }]) {
      const { r, rpcs } = await acao("aluno_responsavel_registrar", { aluno: A1, dados });
      expect([r, rpcs], JSON.stringify(dados)).toEqual([{ ok: false, erro: "dados_invalidos" }, []]);
    }
    // os valores que a RPC recusa passam por aqui (a recusa é DELA — o mesmo código de hoje: vinculo_invalido, forma_invalida…)
    const { rpcs } = await acao("aluno_responsavel_registrar", { aluno: A1, dados: { acao: "registrar", nome: "A", vinculo: "tio", forma: "fax", confirmo: false, origem: "x" } });
    expect(rpcs).toEqual([{ nome: "aluno_responsavel_registrar", args: { p_aluno: A1, p_dados: { acao: "registrar", nome: "A", vinculo: "tio", forma: "fax", confirmo: false, origem: "x" } } }]);
  });

  it("uuid ruim, campo obrigatório que falta ou fora da forma → dados_invalidos e nada roda (o nome do CAMPO no log, nunca o valor)", async () => {
    const ruins: Array<[AcaoDa21c, Record<string, unknown>, string]> = [
      ["acesso_ler", { aluno: "a1" }, "aluno"],
      ["acesso_ler", {}, "aluno"],
      ["acesso_criar", { aluno: A1, senha: SENHA }, "email"],
      ["acesso_criar", { aluno: A1, email: EMAIL }, "senha"],
      ["acesso_criar", { aluno: A1, email: EMAIL, senha: "x".repeat(1001) }, "senha"],
      ["acesso_criar", { aluno: A1, email: "x".repeat(321), senha: SENHA }, "email"],
      ["acesso_redefinir_senha", { aluno: A1, senha: 12345678 }, "senha"],
      ["aluno_link_novo", { aluno: 3 }, "aluno"],
      ["aluno_avisar_plano", { aluno: A1 }, "modulos"],
      ["aluno_avisar_plano", { aluno: A1, modulos: "treino" }, "modulos"],
      ["aluno_avisar_plano", { aluno: A1, modulos: [""] }, "modulos"],
    ];
    for (const [a, corpo, campo] of ruins) {
      const { r, rpcs, log } = await acao(a, corpo);
      expect([r, rpcs], a).toEqual([{ ok: false, erro: "dados_invalidos" }, []]);
      expect(log.aviso, a).toHaveBeenCalledWith(expect.objectContaining({ codigo: "dados_invalidos", acao: a, resultado: campo }));
    }
    // o servidor NÃO confere o tamanho mínimo da senha (o senha_curta é da RPC, o mesmo código de hoje) nem o formato do e-mail
    expect((await acao("acesso_criar", { aluno: A1, email: "nao-e-email", senha: "abc" })).rpcs).toEqual([
      { nome: "paciente_criar_acesso", args: { p_paciente_id: A1, p_email: "nao-e-email", p_senha: "abc" } },
    ]);
  });

  it("a varredura dos raise (decisão B): cada código de propósito → o código, SEM log.excecao; o inesperado → erro_interno + excecao", async () => {
    const porAcao: Array<[AcaoDa21c, Record<string, unknown>, readonly string[]]> = [
      ["acesso_ler", { aluno: A1 }, ERROS_DO_ACESSO],
      ["acesso_criar", { aluno: A1, email: EMAIL, senha: SENHA }, ERROS_DO_CRIAR_ACESSO],
      ["acesso_redefinir_senha", { aluno: A1, senha: SENHA }, ERROS_DO_REDEFINIR_SENHA],
      ["aluno_ajustes_salvar", { aluno: A1, ajustes: { mensagens_automaticas: true } }, ERROS_DA_MATRICULA_DA_ROTA],
      ["aluno_dados_salvar", { aluno: A1, dados: { nome: "Maria" } }, ERROS_DOS_DADOS_DO_ALUNO],
      ["aluno_link_novo", { aluno: A1 }, ERROS_DA_MATRICULA_DA_ROTA],
      ["aluno_avisar_plano", { aluno: A1, modulos: ["dieta"] }, ERROS_DA_MATRICULA_DA_ROTA],
    ];
    for (const [a, corpo, codigos] of porAcao) {
      for (const erro of codigos) {
        const { r, log } = await acao(a, corpo, { rpc: () => ({ data: null, error: { code: "P0001", message: erro } }) });
        expect(r, `${a} ${erro}`).toEqual({ ok: false, erro });
        expect(log.excecao, `${a} ${erro}`).not.toHaveBeenCalled();
      }
      const x = await acao(a, corpo, { rpc: () => ({ data: null, error: { code: "P0001", message: "codigo_que_ninguem_conhece" } }) });
      expect(x.r, a).toEqual({ ok: false, erro: "erro_interno" });
      expect(x.log.excecao, a).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(x.r), a).not.toContain("codigo_que_ninguem_conhece");
    }
    // as listas = o que o catálogo VIVO levanta (os 2 schemas — hml21/medicao/rpcs_21c_*.txt), com o conta_real_no_staging da versão do staging
    expect([...ERROS_DO_ACESSO]).toEqual(["sem_acesso", "aluno_inexistente"]);
    expect([...ERROS_DO_CRIAR_ACESSO]).toEqual([
      "sem_acesso", "ja_tem_acesso", "email_invalido", "conta_real_no_staging", "senha_curta", "email_em_uso", "paciente_email_repetido", "paciente_cpf_repetido",
    ]);
    expect([...ERROS_DO_REDEFINIR_SENHA]).toEqual(["sem_acesso", "sem_conta", "conta_real_no_staging", "senha_curta"]);
    expect([...ERROS_DOS_DADOS_DO_ALUNO]).toEqual(["sem_login", "sem_acesso", "aluno_inexistente", "menor_de_16", "menor_de_18", "paciente_email_repetido", "paciente_cpf_repetido"]);
    // o responsável não levanta (a RPC pega o raise da w14_matricula_da_rota): um "sem_acesso" levantado seria INESPERADO
    const resp = await acao("aluno_responsavel_registrar", { aluno: A1, dados: { acao: "retirar", origem: "site" } }, { rpc: () => ({ data: null, error: { code: "P0001", message: "sem_acesso" } }) });
    expect(resp.r).toEqual({ ok: false, erro: "erro_interno" });
  });

  it("a senha e o e-mail NUNCA no log: na recusa (só o nome do campo), no código conhecido, no inesperado (a mensagem do banco limpa no log.excecao)", async () => {
    const recusa = await acao("acesso_criar", { aluno: "x", email: EMAIL, senha: SENHA });
    expect(recusa.r).toEqual({ ok: false, erro: "dados_invalidos" });
    const conhecido = await acao("acesso_criar", { aluno: A1, email: EMAIL, senha: SENHA }, { rpc: () => ({ data: null, error: { code: "P0001", message: "email_em_uso" } }) });
    const ecoado = `duplicate key value violates unique constraint "users_email_key" Key (email)=(${EMAIL}) senha=${SENHA}`;
    const inesperado = await acao("acesso_criar", { aluno: A1, email: EMAIL, senha: SENHA }, { rpc: () => ({ data: null, error: { code: "23000", message: ecoado } }) });
    const redefinir = await acao("acesso_redefinir_senha", { aluno: A1, senha: SENHA }, { rpc: () => ({ data: null, error: { code: "P0001", message: "senha_curta" } }) });
    for (const k of [recusa, conhecido, inesperado, redefinir]) {
      // aviso/info/erro e os CAMPOS do excecao: nada da senha nem do e-mail
      const campos = JSON.stringify([tudoDoLog(k.log, ["excecao"]), k.log.excecao.mock.calls.map((c) => c[1])]);
      expect(campos).not.toContain(SENHA);
      expect(campos).not.toContain("aluno.secreto");
      expect(JSON.stringify(k.r)).not.toMatch(/aluno\.secreto|Senha-Muito/);
    }
    // o log.excecao recebe o erro e o _shared/log.ts o limpa: a mensagem limpa não leva o e-mail nem a senha
    expect(inesperado.log.excecao).toHaveBeenCalledTimes(1);
    const limpa = limparMensagem((inesperado.log.excecao.mock.calls[0][0] as { message: string }).message);
    expect(limpa).not.toContain("aluno.secreto");
    expect(limpa).not.toContain(SENHA);
  });
});

// ───────────────────────── as Configurações ─────────────────────────
describe("hml-21c — as Configurações: o Perfil, a Conta, a Equipe, o Convite e o ZIP", () => {
  const ATUAL = { foto_url: "https://api-principal.physiqcalc.com.br/storage/v1/object/public/fotos-perfil-staging/x/foto-1.jpg", plano_nutri: { a: 1 }, crn: "VELHO", registro: "VELHO" };
  const DADOS_DA_TELA = { registro: "CREF 1", whatsapp_e164: "+5511999998888", telefone: "(11) 99999-8888", endereco: null, cidade: "SP", uf: "SP", cref: "CREF 1" };

  it("perfil_salvar: lê o dados_profissionais ATUAL como a pessoa e põe por cima SÓ as chaves do form (o resto — a foto, o plano — fica); o profiles DE QUEM CHAMA", async () => {
    const { r, pedidos } = await acao(
      "perfil_salvar",
      { nome: "Pat", tipo_perfil: "personal", area_outra: null, dados: DADOS_DA_TELA, id: OUTRA, user_id: OUTRA, dados_profissionais: { foto_url: "https://mal" } },
      { tabela: (p) => (p.tipo === "select" ? { data: [{ dados_profissionais: ATUAL }], error: null } : { data: [{ id: EU }], error: null }) },
    );
    expect(r).toEqual({ ok: true });
    expect(pedidos).toEqual([
      { tipo: "select", tabela: "profiles", colunas: "dados_profissionais", passos: [["eq", "id", EU], ["maybeSingle"]] },
      {
        tipo: "update", tabela: "profiles",
        valores: { nome: "Pat", dados_profissionais: { ...ATUAL, ...DADOS_DA_TELA }, tipo_perfil: "personal", area_outra: null },
        passos: [["eq", "id", EU], ["select", "id"]],
      },
    ]);
    // o MESMO efeito do dadosParaGravar(form, atual) de hoje: o JSON de antes + as chaves do form (o crn de antes fica; o registro troca)
    expect((pedidos[1].valores as { dados_profissionais: Record<string, unknown> }).dados_profissionais).toMatchObject({ foto_url: ATUAL.foto_url, crn: "VELHO", registro: "CREF 1" });
    expect(JSON.stringify(pedidos)).not.toContain(OUTRA);
    expect(JSON.stringify(pedidos)).not.toContain("https://mal");
  });

  it("perfil_salvar: o foto_url (ou outra chave) no dados → RECUSA; tipo fora da lista → RECUSA; sem o tipo/área no corpo, eles não mudam", async () => {
    for (const corpo of [
      { nome: "Pat", dados: { ...DADOS_DA_TELA, foto_url: "https://x" } }, { nome: "Pat", dados: { plano_nutri: 1 } }, { nome: "Pat", dados: { cref: 3 } },
      { nome: "Pat", tipo_perfil: "master", dados: {} }, { dados: {} }, { nome: "Pat" }, { nome: "Pat", dados: [] },
    ]) {
      const { r, pedidos } = await acao("perfil_salvar", corpo, { tabela: () => ({ data: [{ id: EU }], error: null }) });
      expect([r, pedidos], JSON.stringify(corpo)).toEqual([{ ok: false, erro: "dados_invalidos" }, []]);
    }
    const so = await acao("perfil_salvar", { nome: "Pat", dados: {} }, {
      tabela: (p) => (p.tipo === "select" ? { data: [{ dados_profissionais: ATUAL }], error: null } : { data: [{ id: EU }], error: null }),
    });
    expect(so.pedidos[1].valores).toEqual({ nome: "Pat", dados_profissionais: ATUAL });
  });

  it("perfil_salvar: sem o perfil ou 0 linha no update → nao_encontrado; o erro do banco vira o código (a mensagem nunca)", async () => {
    expect((await acao("perfil_salvar", { nome: "Pat", dados: {} }, { tabela: () => ({ data: [], error: null }) })).r).toEqual({ ok: false, erro: "nao_encontrado" });
    const zero = await acao("perfil_salvar", { nome: "Pat", dados: {} }, { tabela: (p) => (p.tipo === "select" ? { data: [{ dados_profissionais: null }], error: null } : { data: [], error: null }) });
    expect(zero.r).toEqual({ ok: false, erro: "nao_encontrado" });
    expect(zero.pedidos[1].valores).toEqual({ nome: "Pat", dados_profissionais: {} });
    const negado = await acao("perfil_salvar", { nome: "Pat", dados: {} }, { tabela: () => ({ data: null, error: { code: "42501", message: "permission denied for table profiles" } }) });
    expect(negado.r).toEqual({ ok: false, erro: "sem_acesso" });
    expect(JSON.stringify(negado.r)).not.toContain("permission");
  });

  it("conta_salvar: o update do nome pelo id da conta (o RLS decide — só o dono); 0 linha → nao_encontrado; o dono/outra coluna do corpo cai", async () => {
    const ok = await acao("conta_salvar", { conta: CONTA, nome: "Consultoria X", dono_id: OUTRA, plano: "pro", situacao: "ativa" }, { tabela: () => ({ data: [{ id: CONTA, nome: "Consultoria X" }], error: null }) });
    expect(ok.r).toEqual({ ok: true });
    expect(ok.pedidos).toEqual([{ tipo: "update", tabela: "contas", valores: { nome: "Consultoria X" }, passos: [["eq", "id", CONTA], ["select", "id, nome"]] }]);
    expect((await acao("conta_salvar", { conta: CONTA, nome: "X" }, { tabela: () => ({ data: [], error: null }) })).r).toEqual({ ok: false, erro: "nao_encontrado" });
    for (const corpo of [{ conta: "c1", nome: "X" }, { conta: CONTA }, { conta: CONTA, nome: "x".repeat(201) }]) {
      expect((await acao("conta_salvar", corpo)).r, JSON.stringify(corpo)).toEqual({ ok: false, erro: "dados_invalidos" });
    }
  });

  it("a Equipe, o Convite e o ZIP: as MESMAS RPCs com os MESMOS args (os 2 do remover; o p_conta null EXPLÍCITO no ZIP — a RPC não tem DEFAULT)", async () => {
    const casos: Array<[AcaoDa21c, Record<string, unknown>, string, Record<string, unknown>]> = [
      ["equipe_papeis", { membro: M1, papeis: ["personal", "nutricionista"] }, "alterar_papeis_membro", { p_membro: M1, p_papeis: ["personal", "nutricionista"] }],
      ["equipe_remover", { membro: M1, novo_personal: A1, novo_nutri: null }, "remover_membro", { p_membro: M1, p_novo_personal: A1, p_novo_nutri: null }],
      ["equipe_remover", { membro: M1 }, "remover_membro", { p_membro: M1, p_novo_personal: null, p_novo_nutri: null }],
      ["meu_codigo_garantir", { conta: CONTA }, "garantir_meu_codigo", { p_conta: CONTA }],
      ["prontuarios_para_baixar", { conta: CONTA, pacientes: [A1, M1] }, "w2l_prontuarios_para_baixar", { p_conta: CONTA, p_pacientes: [A1, M1] }],
      ["prontuarios_para_baixar", { conta: null, pacientes: [A1] }, "w2l_prontuarios_para_baixar", { p_conta: null, p_pacientes: [A1] }],
      ["prontuarios_para_baixar", { pacientes: [A1] }, "w2l_prontuarios_para_baixar", { p_conta: null, p_pacientes: [A1] }],
    ];
    for (const [a, corpo, rpc, args] of casos) {
      const valor = { ok: true, codigo: "abc" };
      const { r, rpcs } = await acao(a, { ...corpo, dono_id: OUTRA, p_conta: OUTRA, user_id: OUTRA }, { rpc: () => ({ data: valor, error: null }) });
      expect([r, rpcs], a).toEqual([{ ok: true, resultado: valor }, [{ nome: rpc, args }]]);
    }
    const ruins: Array<[AcaoDa21c, Record<string, unknown>]> = [
      ["equipe_papeis", { membro: M1 }], ["equipe_papeis", { membro: M1, papeis: Array.from({ length: 11 }, () => "x") }], ["equipe_remover", { membro: "m1" }],
      ["equipe_remover", { membro: M1, novo_personal: "x" }], ["meu_codigo_garantir", {}], ["prontuarios_para_baixar", { conta: CONTA }],
      ["prontuarios_para_baixar", { conta: CONTA, pacientes: [] }], ["prontuarios_para_baixar", { conta: CONTA, pacientes: Array.from({ length: ZIP_PACIENTES_MAX + 1 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`) }],
    ];
    for (const [a, corpo] of ruins) expect((await acao(a, corpo)).rpcs, `${a} ${JSON.stringify(corpo).slice(0, 60)}`).toEqual([]);
    // nenhuma delas levanta de propósito: o raise vira erro_interno (com o aviso); o RLS → sem_acesso; o { ok: false } volta como valor
    expect((await acao("equipe_papeis", { membro: M1, papeis: [] }, { rpc: () => ({ data: { ok: false, erro: "papeis_invalidos" }, error: null }) })).r)
      .toEqual({ ok: true, resultado: { ok: false, erro: "papeis_invalidos" } });
    expect((await acao("meu_codigo_garantir", { conta: CONTA }, { rpc: () => ({ data: null, error: { code: "42501", message: "x" } }) })).r).toEqual({ ok: false, erro: "sem_acesso" });
  });
});

// ───────────────────────── a Mensagens e a faixa ─────────────────────────
describe("hml-21c — a Mensagens (o WhatsApp) e a faixa da casca", () => {
  const CONFIG = {
    ativo: false, horario: "09:00", momentos: { aniversario: true, lembrete_dia: false },
    textos: { lembrete_vespera: "Oi {nome}, amanhã às {hora}." },
  };

  it("whatsapp_config_salvar: o paraGravar da tela vai INTEIRO à RPC (o objeto fechado à mão); chave de fora em qualquer nível → RECUSA", async () => {
    const ok = await acao("whatsapp_config_salvar", { whatsapp: CONFIG, user_id: OUTRA }, { rpc: () => ({ data: { ok: true, whatsapp: CONFIG }, error: null }) });
    expect(ok.r).toEqual({ ok: true, resultado: { ok: true, whatsapp: CONFIG } });
    expect(ok.rpcs).toEqual([{ nome: "whatsapp_salvar_config", args: { p_whatsapp: CONFIG } }]);
    const completo = { ...CONFIG, momentos: Object.fromEntries(MOMENTOS_WHATSAPP.map((m) => [m, true])), textos: Object.fromEntries(MOMENTOS_WHATSAPP.map((m) => [m, "t".repeat(400)])) };
    expect((await acao("whatsapp_config_salvar", { whatsapp: completo })).rpcs).toEqual([{ nome: "whatsapp_salvar_config", args: { p_whatsapp: completo } }]);
    const ruins: unknown[] = [
      { ...CONFIG, outra: 1 }, { ...CONFIG, momentos: { aniversario: true, natal: true } }, { ...CONFIG, textos: { pix: "x" } },
      { ...CONFIG, momentos: { aniversario: "sim" } }, { ...CONFIG, textos: { aniversario: "x".repeat(2001) } }, { ...CONFIG, ativo: "true" },
      { ...CONFIG, momentos: [] }, null, [], "config",
    ];
    for (const whatsapp of ruins) {
      const { r, rpcs } = await acao("whatsapp_config_salvar", { whatsapp });
      expect([r, rpcs], JSON.stringify(whatsapp).slice(0, 80)).toEqual([{ ok: false, erro: "dados_invalidos" }, []]);
    }
    // o que a RPC confere (o texto acima de 400, o horário fora da lista) passa por aqui: a recusa é dela (texto_longo; 09:00), como hoje
    const longo = { ...CONFIG, horario: "03:00", textos: { aniversario: "x".repeat(401) } };
    expect((await acao("whatsapp_config_salvar", { whatsapp: longo })).rpcs).toEqual([{ nome: "whatsapp_salvar_config", args: { p_whatsapp: longo } }]);
  });

  it("o reenviar, o \"Limpar\", a faixa (até 500 ids, em minúsculas) e o fechar: as MESMAS RPCs com os MESMOS args", async () => {
    const casos: Array<[AcaoDa21c, Record<string, unknown>, string, Record<string, unknown>]> = [
      ["whatsapp_reenviar", { id: M1 }, "whatsapp_reenviar", { p_id: M1 }],
      ["whatsapp_limpar_falhas", { conta: CONTA }, "whatsapp_limpar_falhas", {}],
      ["faixa_ligar_para_todos", { ids: [A1.toUpperCase(), M1] }, "mensagens_ligar_para_todos", { p_ids: [A1, M1] }],
      ["faixa_fechar", {}, "mensagens_aviso_fechar", {}],
    ];
    for (const [a, corpo, rpc, args] of casos) {
      const { r, rpcs } = await acao(a, { ...corpo, user_id: OUTRA, p_ids: [OUTRA] }, { rpc: () => ({ data: { ok: true }, error: null }) });
      expect([r, rpcs], a).toEqual([{ ok: true, resultado: { ok: true } }, [{ nome: rpc, args }]]);
    }
    const quinhentos = Array.from({ length: FAIXA_IDS_MAX }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect((await acao("faixa_ligar_para_todos", { ids: quinhentos })).rpcs).toEqual([{ nome: "mensagens_ligar_para_todos", args: { p_ids: quinhentos } }]);
    for (const ids of [[...quinhentos, A1], [], [A1, "x"], A1, null]) {
      const { r, rpcs } = await acao("faixa_ligar_para_todos", { ids });
      expect([r, rpcs], `${Array.isArray(ids) ? ids.length : String(ids)}`).toEqual([{ ok: false, erro: "dados_invalidos" }, []]);
    }
    expect((await acao("whatsapp_reenviar", { id: "m1" })).rpcs).toEqual([]);
    // o { ok: false } da RPC (nao_conectado, nao_encontrada…) volta como valor — a lib confere, como hoje
    for (const erro of ["nao_conectado", "nao_encontrada", "antiga", "selecao_invalida"]) {
      expect((await acao("whatsapp_reenviar", { id: M1 }, { rpc: () => ({ data: { ok: false, erro }, error: null }) })).r).toEqual({ ok: true, resultado: { ok: false, erro } });
    }
  });
});

// ───────────────────────── a Lixeira ─────────────────────────
describe("hml-21c — a Lixeira: restaurar e apagar de vez", () => {
  it("as MESMAS RPCs com o tipo (texto: a RPC decide) e o id; uuid ruim/sem o tipo → dados_invalidos; o { ok: false } volta como valor", async () => {
    for (const a of ACOES_DA_LIXEIRA) {
      const { r, rpcs } = await acao(a, { tipo: "anamnese", id: A1, conta: CONTA, user_id: OUTRA }, { rpc: () => ({ data: { ok: true, tipo: "anamnese" }, error: null }) });
      expect([r, rpcs], a).toEqual([{ ok: true, resultado: { ok: true, tipo: "anamnese" } }, [{ nome: a, args: { p_tipo: "anamnese", p_id: A1 } }]]);
      for (const corpo of [{ tipo: "anamnese", id: "x" }, { id: A1 }, { tipo: 3, id: A1 }, { tipo: "x".repeat(41), id: A1 }]) {
        expect((await acao(a, corpo)).rpcs, `${a} ${JSON.stringify(corpo).slice(0, 40)}`).toEqual([]);
      }
      expect((await acao(a, { tipo: "paciente", id: A1 }, { rpc: () => ({ data: { ok: false, erro: "aluno_nao_apaga" }, error: null }) })).r)
        .toEqual({ ok: true, resultado: { ok: false, erro: "aluno_nao_apaga" } });
    }
  });
});

// ───────────────────────── a fonte ─────────────────────────
describe("hml-21c — a fonte dos 4 módulos: como a pessoa, sem chave secreta, sem a porta; o lerCorpoDaAcao em toda ação", () => {
  const fonte = (rel: string) => readFileSync(resolve(RAIZ, "supabase-principal/functions", rel), "utf-8");
  it("os 4 módulos: nenhuma chave secreta/cliente de serviço/Deno; não importam a porta; leem o corpo pela lista fechada antes de tudo", () => {
    for (const m of ["aluno", "configuracoes", "mensagens", "lixeira"]) {
      const f = fonte(`conta/${m}.ts`);
      expect(f, m).not.toMatch(/service_?role|SERVICE_ROLE|sb_secret|createClient|Deno\.env/);
      expect(f, m).not.toMatch(/from "[^"]*porta-pessoa/);
      expect(f, m).toMatch(/const p = lerCorpoDaAcao\(acao, c\.corpo\);\n {2}if \(p\.ok === false\) return recusa\(c, acao, p\.erro, p\.campo\);/);
      // nenhum módulo usa o corpo cru (só os valores conferidos): c.corpo só no lerCorpoDaAcao
      expect(f.match(/c\.corpo/g), m).toHaveLength(1);
    }
    // o index roteia os 4 (o despacho fechado)
    const index = fonte("conta/index.ts");
    for (const [modulo, funcao] of [["aluno", "atenderAluno"], ["configuracoes", "atenderConfiguracoes"], ["mensagens", "atenderMensagens"], ["lixeira", "atenderLixeira"]]) {
      expect(index).toContain(`case "${modulo}":\n      return ${funcao}(c, pedido.acao);`);
    }
  });

  it("o lerCorpoDaAcao das 21c: o formato da 21b (o null só onde o campo aceita) — a chave de fora do CORPO cai; a de um objeto fechado é recusa", () => {
    expect(lerCorpoDaAcao("conta_salvar", { conta: CONTA, nome: "X", qualquer: 1 })).toEqual({ ok: true, valores: { conta: CONTA, nome: "X" } });
    expect(lerCorpoDaAcao("conta_salvar", { conta: CONTA, nome: null })).toEqual({ ok: false, erro: "dados_invalidos", campo: "nome" });
    expect(lerCorpoDaAcao("aluno_ajustes_salvar", { aluno: A1, ajustes: { mensagens_automaticas: true, x: 1 } })).toEqual({ ok: false, erro: "dados_invalidos", campo: "ajustes" });
    expect(lerCorpoDaAcao("perfil_salvar", { nome: "P", dados: { cidade: null } })).toEqual({ ok: true, valores: { nome: "P", dados: { cidade: null } } });
  });
});
