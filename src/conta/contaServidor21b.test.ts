// Physiq hml-21b (H-43 · jeito 2, etapa 3) — a função conta no Vitest, parte 2: a Agenda (do profissional e do aluno), os Alunos e a parte
// não saúde do Dashboard. O CATÁLOGO 21b (supabase-principal/functions/_shared/conta-leituras.ts: CONSULTAS_AGENDA e CONSULTAS_ALUNOS) rodado
// pelo motor comum (_shared/leitura-servidor.ts) e as GRAVAÇÕES (conta/agenda.ts e conta/alunos.ts, com as regras de _shared/conta-regras.ts),
// com um cliente falso que faz o papel do PostgREST e das RPCs COMO A PESSOA (os módulos não importam a porta: o contexto é estrutural).
// Positivo: cada `q` e cada ação com os params certos; as colunas = o select das libs do d357719 (o select("*") = a linha inteira do tipo
// gerado; os explícitos iguais; nenhum "*"); o teto; a ordem; o "meu" (o recorte minhaOuDaConta com o user do token); as RPCs com os MESMOS
// argumentos de hoje; o dono das gravações = quem chama (e o da consulta = o dono do calendário, lido como a pessoa).
// Negativo: q/ação desconhecida; uuid/instante/data/hora/texto/inteiro ruins → dados_invalidos (nada roda); nutricionista_id/profissional_id/
// user_id/dono do corpo ignorados (nunca chegam ao banco); a chave fora da lista cai; o null só onde a coluna aceita; o erro do banco vira o
// código (a mensagem nunca vai na resposta); 0 linha → nao_encontrado; o log nunca leva os valores. E as 4 capacidades novas do motor
// (gt, recorte meu_ou_da_conta, fixos, colunasSe): só quem declara usa — os catálogos da 20a–21a não mudam de plano.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ehRpc, planoDaTabela, type CatalogoLeitura, type ConsultaLeitura, type FonteRpc, type FonteTabela, type RespostaDeItem } from "../../supabase-principal/functions/_shared/leitura-lote";
import { atenderLeitura } from "../../supabase-principal/functions/_shared/leitura-servidor";
import {
  BLOQUEIOS_FUTUROS_MAX, CATALOGO_CONTA, COLUNAS_DA_AGENDA, COLUNAS_DOS_ALUNOS, CONSULTAS_AGENDA, CONSULTAS_ALUNOS, CONSULTAS_CONTA, CONSULTAS_DA_21B,
  CONSULTAS_DA_21C, CONSULTAS_DA_21D, CONSULTAS_DA_CONTA, ERROS_DA_MATRICULA_DA_ROTA, FILTROS_DOS_ALUNOS, TODAS_AS_CONSULTAS, consultaDaConta,
} from "../../supabase-principal/functions/_shared/conta-leituras";
import {
  ACOES_DA_21C, ACOES_DA_AGENDA, ACOES_DA_CASCA, ACOES_DA_CONTA, ACOES_DO_APP, ACOES_DOS_ALUNOS, CORPOS_DA_21B, CORPOS_DAS_ACOES, ERROS_DAS_TAGS,
  lerCamposDaAcao, lerCorpoDaAcao, moduloDoPedido, statusDoErroConta, type AcaoDaAgenda,
} from "../../supabase-principal/functions/_shared/conta-regras";
import { CONSULTAS_NUTRICAO } from "../../supabase-principal/functions/_shared/nutricao-leituras";
import { CONSULTAS_FINANCEIRO } from "../../supabase-principal/functions/_shared/financeiro-leituras";
import { atenderAgenda } from "../../supabase-principal/functions/conta/agenda";
import { atenderAlunos } from "../../supabase-principal/functions/conta/alunos";

const RAIZ = resolve(__dirname, "../..");
const EU = "33333333-3333-4333-8333-333333333333";
const OUTRA = "99999999-9999-4999-8999-999999999999";
const CONTA = "c0c0c0c0-0000-4000-8000-000000000001";
const CAL = "ca111111-1111-4111-8111-111111111111";
const A1 = "a1111111-1111-4111-8111-111111111111";
const AGORA = new Date("2026-10-13T12:00:00.000Z");
const DE = "2026-10-12T03:00:00.000Z";
const ATE = "2026-10-19T03:00:00.000Z";

// ───────────────────────── o cliente falso (grava cada pedido; o RLS de quem chama é o "banco" do teste) ─────────────────────────
type Resposta = { data: unknown; error: unknown; count?: number | null };
interface Pedido {
  tipo: "select" | "update" | "insert" | "upsert" | "delete";
  tabela: string;
  colunas?: string;
  valores?: Record<string, unknown>;
  opcoes?: unknown;
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
    b.single = () => {
      p.passos.push(["single"]);
      const r = resolver(p);
      return Promise.resolve({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data });
    };
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
      select: (colunas: string, opcoes?: unknown) => novo({ tipo: "select", tabela, colunas, ...(opcoes ? { opcoes } : {}), passos: [] }),
      update: (valores: Record<string, unknown>) => novo({ tipo: "update", tabela, valores, passos: [] }),
      insert: (valores: Record<string, unknown>) => novo({ tipo: "insert", tabela, valores, passos: [] }),
      upsert: (valores: Record<string, unknown>, opcoes: unknown) => novo({ tipo: "upsert", tabela, valores, opcoes, passos: [] }),
      delete: () => novo({ tipo: "delete", tabela, passos: [] }),
    }),
    storage: { from: () => ({}) },
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
async function agenda(acao: AcaoDaAgenda, corpo: Record<string, unknown>, banco: Banco = {}) {
  const k = contexto({ ...corpo, acao }, banco);
  return { r: await atenderAgenda(k.c as never, acao), ...k };
}
const semEspacos = (s: string) => s.replace(/\s+/g, "");

/** As colunas do Row de cada tabela no tipo gerado do principal (src/integrations/principal/types.ts) — o select("*") de hoje. */
function colunasDoTipo(tabela: string): string[] {
  const tipos = readFileSync(resolve(RAIZ, "src/integrations/principal/types.ts"), "utf-8");
  const m = new RegExp(`\\n      ${tabela}: \\{\\n        Row: \\{\\n([\\s\\S]*?)\\n        \\}`).exec(tipos);
  if (!m) throw new Error(`tabela ${tabela} fora do tipo gerado`);
  return [...m[1].matchAll(/^ {10}([a-z_0-9]+)\??: /gm)].map((x) => x[1]).sort();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
});
afterEach(() => vi.useRealTimers());

/**
 * O SELECT FIXO das libs do d357719 (o que o navegador lia hoje), com a origem — o servidor tem de mandar o MESMO. Onde a lib lia
 * select("*"), a linha inteira do tipo gerado (o PADRÃO da 20b); onde ela escrevia as colunas, a string dela.
 */
const DA_LIB = {
  agenda_calendarios: { origem: "src/painel/agenda/dados.ts:95 listarCalendarios", tabela: "calendarios", select: "*" },
  agenda_tags: { origem: "dados.ts:146 listarTags", tabela: "agenda_tags", select: "*" },
  agenda_agendamentos: { origem: "dados.ts:215 listarAgendamentos", tabela: "agendamentos", select: "*" },
  agenda_bloqueios: { origem: "dados.ts:244 listarBloqueios", tabela: "bloqueios_agenda", select: "*" },
  agenda_bloqueios_futuros: { origem: "dados.ts:252 listarBloqueiosFuturos", tabela: "bloqueios_agenda", select: "*" },
  agenda_travas: { origem: "dados.ts:282 listarTravas", tabela: "agenda_travas", select: "*" },
  agenda_regras: { origem: "dados.ts:301 lerRegras", tabela: "agenda_config", select: "*" },
  agenda_alunos: { origem: "dados.ts:334 listarAlunosDaAgenda", tabela: "pacientes", select: "id, nome, apelido, foto_url, personal_id, nutricionista_id, user_id, email" },
  agenda_aluno: { origem: "dados.ts:342 buscarAluno", tabela: "pacientes", select: "id, nome, apelido, foto_url, personal_id, nutricionista_id, user_id, email" },
  aluno_do_seletor: {
    origem: "src/painel/alunos/api.ts:107 alunoDoSeletorPorId (sem o CPF)", tabela: "pacientes",
    select: "id, nome, apelido, email, telefone, foto_url, ativo, acesso_bloqueado_em, user_id, personal_id, nutricionista_id, conta_excluida_em:config->>conta_excluida_em",
  },
} as const;

// ───────────────────────── o catálogo ─────────────────────────
describe("hml-21b — o catálogo da conta (as consultas do bloco 21b da §2.2)", () => {
  it("as 19 consultas da 21b (os nomes da §2.2 + os params que as libs mandam — PADRÃO); a 21a fica como era; o catálogo = as 2", () => {
    expect(Object.keys(CONSULTAS_AGENDA)).toEqual([
      "agenda_calendarios", "agenda_tags", "agenda_agendamentos", "agenda_bloqueios", "agenda_bloqueios_futuros", "agenda_travas", "agenda_regras",
      "agenda_horarios", "agenda_alunos", "agenda_aluno", "aluno_compromissos", "minhas_regras_agenda", "aluno_agenda_horarios",
    ]);
    expect(Object.keys(CONSULTAS_ALUNOS)).toEqual(["alunos_da_conta", "aluno_do_seletor", "aluno_convites", "alunos_pendentes", "alunos_novos_por_mes", "equipe_da_conta"]);
    expect(CONSULTAS_DA_21B).toEqual([...Object.keys(CONSULTAS_AGENDA), ...Object.keys(CONSULTAS_ALUNOS)]);
    expect(CONSULTAS_DA_CONTA).toEqual(Object.keys(CONSULTAS_CONTA));
    // hml-21d (a regra da DECISÃO 03:25: a lista ganha o item novo por acréscimo — o que o caso prova não muda): + o aluno_treino da 21d
    expect(TODAS_AS_CONSULTAS).toEqual([...CONSULTAS_DA_CONTA, ...CONSULTAS_DA_21B, ...CONSULTAS_DA_21D, ...CONSULTAS_DA_21C]);
    // hml-21c (a mesma regra): + as consultas da 21c, no fim
    // nenhum nome da 21b repete um da 21a; o catálogo do motor tem as 28 (e só as consultas — nenhuma opção a mais)
    expect(CONSULTAS_DA_21B.filter((q) => (CONSULTAS_DA_CONTA as string[]).includes(q))).toEqual([]);
    expect(Object.keys(CATALOGO_CONTA.consultas)).toEqual(TODAS_AS_CONSULTAS);
    expect(Object.keys(CATALOGO_CONTA)).toEqual(["consultas"]);
    for (const q of CONSULTAS_DA_21B) expect(consultaDaConta(q), q).toBe((CATALOGO_CONTA.consultas as CatalogoLeitura)[q]);
    expect(consultaDaConta("avisos")).toBe(CONSULTAS_CONTA.avisos);
    for (const q of ["agenda_garantir", "pacotes", "calendarios", "__proto__", "constructor", 3, null]) expect(consultaDaConta(q), String(q)).toBeNull();
  });

  it("cada tabela: colunas explícitas (nenhum '*') = o select da lib do d357719 (select('*') = a linha inteira do tipo gerado); o CPF só com o com_cpf", () => {
    for (const [q, lib] of Object.entries(DA_LIB)) {
      const f = (CATALOGO_CONTA.consultas as Record<string, { fonte: FonteTabela }>)[q].fonte;
      expect(f.tabela, q).toBe(lib.tabela);
      expect(f.colunas.join(","), q).not.toContain("*");
      if (lib.select === "*") expect([...f.colunas].sort(), `${q} × ${lib.origem}`).toEqual(colunasDoTipo(lib.tabela));
      else expect(semEspacos(f.colunas.join(",")), `${q} × ${lib.origem}`).toBe(semEspacos(lib.select));
    }
    // o seletor com o CPF: a string da lib com o "cpf, " no lugar dela (só o Recibo pede)
    const seletor = CONSULTAS_ALUNOS.aluno_do_seletor.fonte;
    expect(seletor.colunasSe).toEqual({ param: "com_cpf", colunas: COLUNAS_DOS_ALUNOS.seletor_com_cpf });
    expect(semEspacos(seletor.colunasSe.colunas.join(","))).toBe(
      semEspacos("id, nome, apelido, email, telefone, cpf, foto_url, ativo, acesso_bloqueado_em, user_id, personal_id, nutricionista_id, conta_excluida_em:config->>conta_excluida_em"),
    );
    for (const cols of Object.values(COLUNAS_DA_AGENDA)) expect(cols.join(",")).not.toContain("*");
  });

  it("o teto de cada leitura de tabela: 1000 onde a lib lia sem limite (o max_rows) ou com 1000; 50 nos bloqueios futuros; 1 nas de 1 linha", () => {
    const tetos = Object.fromEntries(CONSULTAS_DA_21B.filter((q) => !ehRpc((CATALOGO_CONTA.consultas as CatalogoLeitura)[q].fonte))
      .map((q) => [q, ((CATALOGO_CONTA.consultas as CatalogoLeitura)[q].fonte as FonteTabela).teto]));
    expect(tetos).toEqual({
      agenda_calendarios: 1000, agenda_tags: 1000, agenda_agendamentos: 1000, agenda_bloqueios: 1000, agenda_bloqueios_futuros: BLOQUEIOS_FUTUROS_MAX,
      agenda_travas: 1000, agenda_regras: 1, agenda_alunos: 1000, agenda_aluno: 1, aluno_do_seletor: 1,
    });
    expect(BLOQUEIOS_FUTUROS_MAX).toBe(50);
  });

  it("'meu' = o minhaOuDaConta da lib (o uid que a tela passava era o de quem está logado): o recorte com o user do token, nas 6; nenhum `dono` do corpo", () => {
    const recortes = Object.fromEntries(CONSULTAS_DA_21B.map((q) => [q, (CATALOGO_CONTA.consultas as CatalogoLeitura)[q]]).filter(([, c]) => !ehRpc((c as ConsultaLeitura).fonte) && ((c as ConsultaLeitura).fonte as FonteTabela).recorte)
      .map(([q, c]) => [q, ((c as ConsultaLeitura).fonte as FonteTabela).recorte]));
    expect(recortes).toEqual({
      agenda_calendarios: { modelo: "meu_ou_da_conta", param: "conta", coluna: "nutricionista_id" },
      agenda_agendamentos: { modelo: "meu_ou_da_conta", param: "conta", coluna: "nutricionista_id" },
      agenda_bloqueios: { modelo: "meu_ou_da_conta", param: "conta", coluna: "nutricionista_id" },
      agenda_bloqueios_futuros: { modelo: "meu_ou_da_conta", param: "conta", coluna: "nutricionista_id" },
      agenda_travas: { modelo: "meu_ou_da_conta", param: "conta", coluna: "profissional_id" },
      agenda_alunos: { modelo: "meu_ou_da_conta", param: "conta", coluna: "nutricionista_id", contaPrimeiro: true },
    });
    for (const q of CONSULTAS_DA_21B) {
      const c = (CATALOGO_CONTA.consultas as CatalogoLeitura)[q];
      expect("dono" in c, q).toBe(false);
      for (const dono of ["user_id", "nutricionista_id", "profissional_id", "dono_id", "uid"]) expect(Object.keys(c.params), `${q}.${dono}`).not.toContain(dono);
    }
  });

  it("as RPCs: os args que a lib mandava, montados aqui (o corpo nunca vira arg); os códigos que elas levantam de propósito", () => {
    const rpcs = CONSULTAS_DA_21B.map((q) => [q, (CATALOGO_CONTA.consultas as CatalogoLeitura)[q].fonte] as const).filter(([, f]) => ehRpc(f))
      .map(([q, f]) => [q, (f as FonteRpc).rpc, (f as FonteRpc).args ?? {}, (f as FonteRpc).erros ?? []]);
    expect(rpcs).toEqual([
      ["agenda_horarios", "agenda_horarios", { p_calendario: "calendario", p_de: "dia", p_ate: "dia", p_duracao: "duracao", p_ignorar: "ignorar" }, ["sem_login"]],
      ["aluno_compromissos", "aluno_compromissos", { p_aluno: "aluno" }, ["sem_login", "sem_acesso", "aluno_inexistente"]],
      ["minhas_regras_agenda", "minhas_regras_agenda", {}, []],
      ["aluno_agenda_horarios", "aluno_agenda_horarios", { p_agendamento: "agendamento", p_profissional: "profissional", p_de: "de", p_ate: "ate" }, ["agendamento_inexistente", "sem_login"]],
      ["alunos_da_conta", "alunos_da_conta", { p_conta: "conta", p_filtros: "filtros", p_offset: "offset", p_limite: "limite" }, []],
      ["aluno_convites", "aluno_convites", { p_conta: "conta" }, []],
      ["alunos_pendentes", "alunos_pendentes", { p_conta: "conta" }, []],
      ["alunos_novos_por_mes", "alunos_novos_por_mes", { p_conta: "conta", p_meses: "meses" }, []],
      ["equipe_da_conta", "equipe_da_conta", { p_conta: "conta" }, []],
    ]);
    // os filtros da lista de alunos = as chaves que a alunos_da_conta lê (v_f ->> '…', migration 20261009020000) — nenhuma a mais
    const migracao = readFileSync(resolve(RAIZ, "supabase-principal/migrations/20261009020000_hml14b_busca_sem_acento.sql"), "utf-8");
    const corpo = migracao.slice(migracao.indexOf("function {schema}.alunos_da_conta("), migracao.indexOf("function {schema}.master_alunos("));
    expect([...new Set([...corpo.matchAll(/v_f ->> '([a-z_]+)'/g)].map((m) => m[1]))].sort()).toEqual([...FILTROS_DOS_ALUNOS].sort());
  });

  it("as 4 capacidades novas do motor (gt, meu_ou_da_conta, fixos, colunasSe) só na 21b: os catálogos da nutricao, da financeiro e da 21a não usam", () => {
    const usa = (c: ConsultaLeitura) => {
      if (ehRpc(c.fonte)) return false;
      const f = c.fonte as FonteTabela;
      return !!(f.fixos || f.colunasSe || f.recorte?.modelo === "meu_ou_da_conta" || (f.filtros ?? []).some((x) => x.op === "gt"));
    };
    for (const [nome, cat] of [["nutricao", CONSULTAS_NUTRICAO], ["financeiro", CONSULTAS_FINANCEIRO], ["conta 21a", CONSULTAS_CONTA]] as const) {
      for (const [q, c] of Object.entries(cat as CatalogoLeitura)) expect(usa(c), `${nome}.${q}`).toBe(false);
    }
    expect(CONSULTAS_DA_21B.filter((q) => usa((CATALOGO_CONTA.consultas as CatalogoLeitura)[q]))).toEqual([
      "agenda_calendarios", "agenda_agendamentos", "agenda_bloqueios", "agenda_bloqueios_futuros", "agenda_travas", "agenda_alunos", "aluno_do_seletor",
    ]);
  });
});

describe("hml-21b — o plano do motor com as capacidades novas (planoDaTabela, puro)", () => {
  const consulta = (fonte: Partial<FonteTabela>): ConsultaLeitura & { fonte: FonteTabela } => ({ params: {}, fonte: { tabela: "t", colunas: ["a", "b"], teto: 5, ...fonte } });
  it("gt: o .or() de 1 condição `<coluna>.gt.<valor>` (a mesma do .gt() da lib); o valor fora de [0-9A-Za-z:.+-] fecha a consulta (id nulo)", () => {
    const c = consulta({ filtros: [{ param: "de", coluna: "fim", op: "gt" }] });
    expect(planoDaTabela(c, { de: DE }, EU).filtros).toEqual([{ op: "ou", filtro: `fim.gt.${DE}` }]);
    expect(planoDaTabela(c, { de: 7 }, EU).filtros).toEqual([{ op: "ou", filtro: "fim.gt.7" }]);
    for (const ruim of ["a,b", "x)", "1 2", "", "x".repeat(41), "a(", 'a"b']) expect(planoDaTabela(c, { de: ruim }, EU).filtros, ruim).toEqual([{ op: "is_null", coluna: "id" }]);
    expect(planoDaTabela(c, {}, EU).filtros).toEqual([]);
  });
  it("meu_ou_da_conta: com a conta, o meu OU o da conta (o user do token, nunca o corpo); sem, só o meu; contaPrimeiro = a ordem da lib dos alunos", () => {
    const c = consulta({ recorte: { modelo: "meu_ou_da_conta", param: "conta", coluna: "nutricionista_id" } });
    expect(planoDaTabela(c, { conta: CONTA, nutricionista_id: OUTRA }, EU).filtros).toEqual([{ op: "ou", filtro: `nutricionista_id.eq.${EU},conta_id.eq.${CONTA}` }]);
    expect(planoDaTabela(c, {}, EU).filtros).toEqual([{ op: "eq", coluna: "nutricionista_id", valor: EU }]);
    const p = consulta({ recorte: { modelo: "meu_ou_da_conta", param: "conta", coluna: "nutricionista_id", contaPrimeiro: true } });
    expect(planoDaTabela(p, { conta: CONTA }, EU).filtros).toEqual([{ op: "ou", filtro: `conta_id.eq.${CONTA},nutricionista_id.eq.${EU}` }]);
  });
  it("fixos: o eq de valor fixo, sempre (nenhum param muda); colunasSe: a lista inteira trocada só com o param booleano true", () => {
    const c = consulta({ fixos: [{ coluna: "ativo", valor: true }], colunasSe: { param: "x", colunas: ["a", "c", "b"] } });
    expect(planoDaTabela(c, { ativo: false }, EU)).toMatchObject({ colunas: "a, b", filtros: [{ op: "eq", coluna: "ativo", valor: true }] });
    expect(planoDaTabela(c, { x: true }, EU).colunas).toBe("a, c, b");
    expect(planoDaTabela(c, { x: "true" }, EU).colunas).toBe("a, b");
  });
});

describe("hml-21b — as leituras da Agenda no motor (como a pessoa): o pedido = o da lib de hoje", () => {
  const SEL = (t: keyof typeof COLUNAS_DA_AGENDA) => COLUNAS_DA_AGENDA[t].join(", ");
  it("agenda_calendarios: os vivos meus + da conta, do mais velho ao mais novo, até 1000; sem a conta, só os meus; o dono do corpo cai", async () => {
    const { itens, pedidos } = await ler([{ q: "agenda_calendarios", conta: CONTA, nutricionista_id: OUTRA }, { q: "agenda_calendarios" }]);
    expect(itens).toEqual([{ ok: true, linhas: [] }, { ok: true, linhas: [] }]);
    expect(pedidos).toEqual([
      { tipo: "select", tabela: "calendarios", colunas: SEL("calendarios"), passos: [["is", "deleted_at", null], ["or", `nutricionista_id.eq.${EU},conta_id.eq.${CONTA}`], ["order", "created_at", { ascending: true }], ["limit", 1000]] },
      { tipo: "select", tabela: "calendarios", colunas: SEL("calendarios"), passos: [["is", "deleted_at", null], ["eq", "nutricionista_id", EU], ["order", "created_at", { ascending: true }], ["limit", 1000]] },
    ]);
    expect(JSON.stringify(pedidos)).not.toContain(OUTRA);
  });

  it("agenda_agendamentos: os vivos que tocam [de, ate) (inicio < ate, fim > de), meus + da conta, os 1000 mais recentes (inicio e id desc)", async () => {
    const linhas = [{ id: A1 }];
    const { itens, pedidos } = await ler([{ q: "agenda_agendamentos", de: DE, ate: ATE, conta: CONTA }], { tabela: () => ({ data: linhas, error: null }) });
    expect(itens).toEqual([{ ok: true, linhas }]);
    expect(pedidos[0]).toEqual({
      tipo: "select", tabela: "agendamentos", colunas: SEL("agendamentos"),
      passos: [["lt", "inicio", ATE], ["or", `fim.gt.${DE}`], ["is", "deleted_at", null], ["or", `nutricionista_id.eq.${EU},conta_id.eq.${CONTA}`],
        ["order", "inicio", { ascending: false }], ["order", "id", { ascending: false }], ["limit", 1000]],
    });
    const ruins = await ler([{ q: "agenda_agendamentos", de: DE }, { q: "agenda_agendamentos", de: "2026-10-12", ate: ATE }, { q: "agenda_agendamentos", de: DE, ate: ATE, conta: "x" }]);
    expect(ruins.itens).toEqual([{ ok: false, erro: "dados_invalidos" }, { ok: false, erro: "dados_invalidos" }, { ok: false, erro: "dados_invalidos" }]);
    expect(ruins.pedidos).toEqual([]);
  });

  it("agenda_bloqueios e agenda_bloqueios_futuros: a janela / o fim ≥ o agora da tela, por início; os futuros até 50; agenda_travas: pela hora", async () => {
    const { pedidos } = await ler([
      { q: "agenda_bloqueios", de: DE, ate: ATE, conta: CONTA }, { q: "agenda_bloqueios_futuros", agora: AGORA.toISOString() }, { q: "agenda_travas", conta: CONTA },
    ]);
    expect(pedidos).toEqual([
      { tipo: "select", tabela: "bloqueios_agenda", colunas: SEL("bloqueios_agenda"), passos: [["lt", "inicio", ATE], ["or", `fim.gt.${DE}`], ["or", `nutricionista_id.eq.${EU},conta_id.eq.${CONTA}`], ["order", "inicio", { ascending: true }], ["limit", 1000]] },
      { tipo: "select", tabela: "bloqueios_agenda", colunas: SEL("bloqueios_agenda"), passos: [["gte", "fim", AGORA.toISOString()], ["eq", "nutricionista_id", EU], ["order", "inicio", { ascending: true }], ["limit", 50]] },
      { tipo: "select", tabela: "agenda_travas", colunas: SEL("agenda_travas"), passos: [["or", `profissional_id.eq.${EU},conta_id.eq.${CONTA}`], ["order", "hora_inicio", { ascending: true }], ["limit", 1000]] },
    ]);
  });

  it("agenda_tags: as vivas DESTES profissionais (in), pela ordem e pela criação; lista vazia, não uuid ou acima de 200 → dados_invalidos", async () => {
    const { pedidos } = await ler([{ q: "agenda_tags", donos: [EU, OUTRA.toUpperCase(), EU] }]);
    expect(pedidos[0]).toEqual({
      tipo: "select", tabela: "agenda_tags", colunas: SEL("agenda_tags"),
      passos: [["in", "profissional_id", [EU, OUTRA]], ["is", "deleted_at", null], ["order", "ordem", { ascending: true }], ["order", "created_at", { ascending: true }], ["limit", 1000]],
    });
    const muitos = Array.from({ length: 201 }, (_, i) => `a${String(i).padStart(7, "0")}-1111-4111-8111-111111111111`);
    const ruins = await ler([{ q: "agenda_tags", donos: [] }, { q: "agenda_tags", donos: ["x"] }, { q: "agenda_tags", donos: muitos }, { q: "agenda_tags" }]);
    expect(ruins.itens.every((i) => i.ok === false && i.erro === "dados_invalidos")).toBe(true);
  });

  it("agenda_regras: as do profissional pedido (o RLS deixa o dono ler as da equipe), 1 linha; agenda_alunos: os ativos vivos, conta OU meus, por nome", async () => {
    const { pedidos } = await ler([{ q: "agenda_regras", profissional: EU }, { q: "agenda_alunos", conta: CONTA }, { q: "agenda_alunos" }, { q: "agenda_aluno", id: A1 }]);
    expect(pedidos).toEqual([
      { tipo: "select", tabela: "agenda_config", colunas: SEL("agenda_config"), passos: [["eq", "profissional_id", EU], ["limit", 1]] },
      { tipo: "select", tabela: "pacientes", colunas: SEL("alunos"), passos: [["eq", "ativo", true], ["is", "deleted_at", null], ["or", `conta_id.eq.${CONTA},nutricionista_id.eq.${EU}`], ["order", "nome", { ascending: true }], ["limit", 1000]] },
      { tipo: "select", tabela: "pacientes", colunas: SEL("alunos"), passos: [["eq", "ativo", true], ["is", "deleted_at", null], ["eq", "nutricionista_id", EU], ["order", "nome", { ascending: true }], ["limit", 1000]] },
      { tipo: "select", tabela: "pacientes", colunas: SEL("alunos"), passos: [["eq", "id", A1], ["is", "deleted_at", null], ["limit", 1]] },
    ]);
  });

  it("agenda_horarios: o dia nos 2 args (p_de = p_ate = dia), a duração e o 'ignorar' só se vieram; o { ok: false } volta como valor; o raise sem_login como ele", async () => {
    const { itens, rpcs } = await ler([
      { q: "agenda_horarios", calendario: CAL, dia: "2026-10-14", duracao: 50, ignorar: A1 }, { q: "agenda_horarios", calendario: CAL, dia: "2026-10-14", duracao: null },
    ], { rpc: () => ({ data: { ok: false, erro: "calendario_inexistente" }, error: null }) });
    expect(rpcs).toEqual([
      { nome: "agenda_horarios", args: { p_calendario: CAL, p_de: "2026-10-14", p_ate: "2026-10-14", p_duracao: 50, p_ignorar: A1 } },
      { nome: "agenda_horarios", args: { p_calendario: CAL, p_de: "2026-10-14", p_ate: "2026-10-14" } },
    ]);
    expect(itens).toEqual([{ ok: true, valor: { ok: false, erro: "calendario_inexistente" } }, { ok: true, valor: { ok: false, erro: "calendario_inexistente" } }]);
    const semLogin = await ler([{ q: "agenda_horarios", calendario: CAL, dia: "2026-10-14" }], { rpc: () => ({ data: null, error: { code: "P0001", message: "sem_login" } }) });
    expect(semLogin.itens).toEqual([{ ok: false, erro: "sem_login" }]);
    expect(semLogin.log.excecao).not.toHaveBeenCalled();
    const ruins = await ler([{ q: "agenda_horarios", calendario: CAL, dia: "2026-02-31" }, { q: "agenda_horarios", dia: "2026-10-14" }, { q: "agenda_horarios", calendario: CAL, dia: "2026-10-14", duracao: 2.5 }]);
    expect(ruins.itens.every((i) => i.ok === false && i.erro === "dados_invalidos")).toBe(true);
  });

  it("a Agenda do aluno: minhas_regras_agenda sem args; aluno_agenda_horarios com o que a lib mandou (o resto, o nulo da RPC); agendamento_inexistente como ele", async () => {
    const { rpcs } = await ler([
      { q: "minhas_regras_agenda", user_id: OUTRA }, { q: "aluno_agenda_horarios", agendamento: A1 }, { q: "aluno_agenda_horarios", profissional: OUTRA, de: "2026-11-01", ate: "2026-11-30" },
    ], { rpc: () => ({ data: [], error: null }) });
    expect(rpcs).toEqual([
      { nome: "minhas_regras_agenda", args: {} },
      { nome: "aluno_agenda_horarios", args: { p_agendamento: A1 } },
      { nome: "aluno_agenda_horarios", args: { p_profissional: OUTRA, p_de: "2026-11-01", p_ate: "2026-11-30" } },
    ]);
    const inex = await ler([{ q: "aluno_agenda_horarios", agendamento: A1 }], { rpc: () => ({ data: null, error: { code: "P0001", message: "agendamento_inexistente" } }) });
    expect(inex.itens).toEqual([{ ok: false, erro: "agendamento_inexistente" }]);
  });

  it("a Agenda inteira numa ida: as 8 leituras da tela (+ a equipe do dono) = 1 lote; o erro de uma não derruba as outras; a mensagem do banco nunca volta", async () => {
    const { itens, pedidos, rpcs } = await ler([
      { q: "agenda_calendarios", conta: CONTA }, { q: "agenda_agendamentos", de: DE, ate: ATE, conta: CONTA }, { q: "agenda_agendamentos", de: DE, ate: ATE, conta: CONTA },
      { q: "agenda_bloqueios", de: DE, ate: ATE, conta: CONTA }, { q: "agenda_bloqueios_futuros", agora: AGORA.toISOString(), conta: CONTA }, { q: "agenda_travas", conta: CONTA },
      { q: "agenda_regras", profissional: EU }, { q: "agenda_alunos", conta: CONTA }, { q: "equipe_da_conta", conta: CONTA },
    ], {
      tabela: (p) => (p.tabela === "agenda_travas" ? { data: null, error: { code: "42501", message: "permission denied for table agenda_travas" } } : { data: [], error: null }),
      rpc: () => ({ data: { ok: true, membros: [] }, error: null }),
    });
    expect(itens.map((i) => (i.ok === false ? i.erro : "ok"))).toEqual(["ok", "ok", "ok", "ok", "ok", "sem_acesso", "ok", "ok", "ok"]);
    // os 2 agendamentos iguais (a mesma janela) rodam 1 vez só
    expect(pedidos.map((p) => p.tabela)).toEqual(["calendarios", "agendamentos", "bloqueios_agenda", "bloqueios_agenda", "agenda_travas", "agenda_config", "pacientes"]);
    expect(rpcs).toEqual([{ nome: "equipe_da_conta", args: { p_conta: CONTA } }]);
  });
});

describe("hml-21b — as leituras dos Alunos e do Dashboard no motor", () => {
  it("alunos_da_conta: a conta, os filtros (só as chaves que a RPC lê, como texto), o offset e o limite (0 a 500) da lib; o número do menu = limite 0", async () => {
    const filtros = { situacao: "ativos", q: "ana", modulo: "treino", ordem: "recentes", exportar: "true", nao_existe: "x", responsavel: "sem" };
    const { rpcs, itens } = await ler([
      { q: "alunos_da_conta", conta: CONTA, filtros, offset: 20, limite: 20 }, { q: "alunos_da_conta", conta: CONTA, filtros: { situacao: "ativos" }, offset: 0, limite: 0 },
    ], { rpc: () => ({ data: { ok: true, total: 3, itens: [] }, error: null }) });
    expect(itens).toEqual([{ ok: true, valor: { ok: true, total: 3, itens: [] } }, { ok: true, valor: { ok: true, total: 3, itens: [] } }]);
    expect(rpcs).toEqual([
      { nome: "alunos_da_conta", args: { p_conta: CONTA, p_filtros: { situacao: "ativos", q: "ana", modulo: "treino", responsavel: "sem", ordem: "recentes", exportar: "true" }, p_offset: 20, p_limite: 20 } },
      { nome: "alunos_da_conta", args: { p_conta: CONTA, p_filtros: { situacao: "ativos" }, p_offset: 0, p_limite: 0 } },
    ]);
    const ruins = await ler([
      { q: "alunos_da_conta", conta: CONTA, offset: 0, limite: 501 }, { q: "alunos_da_conta", conta: CONTA, offset: -1, limite: 20 }, { q: "alunos_da_conta", offset: 0, limite: 20 },
      { q: "alunos_da_conta", conta: CONTA, filtros: { q: "x".repeat(201) } }, { q: "alunos_da_conta", conta: CONTA, filtros: { situacao: 3 } },
    ]);
    expect(ruins.itens.every((i) => i.ok === false && i.erro === "dados_invalidos")).toBe(true);
    expect(ruins.rpcs).toEqual([]);
  });

  it("aluno_do_seletor: o aluno pelo id E da conta, vivo, 1 linha; o CPF só com o com_cpf = true (a string inteira da lib)", async () => {
    const { pedidos } = await ler([{ q: "aluno_do_seletor", conta: CONTA, id: A1 }, { q: "aluno_do_seletor", conta: CONTA, id: A1, com_cpf: true }]);
    expect(pedidos).toEqual([
      { tipo: "select", tabela: "pacientes", colunas: COLUNAS_DOS_ALUNOS.seletor.join(", "), passos: [["eq", "id", A1], ["eq", "conta_id", CONTA], ["is", "deleted_at", null], ["limit", 1]] },
      { tipo: "select", tabela: "pacientes", colunas: COLUNAS_DOS_ALUNOS.seletor_com_cpf.join(", "), passos: [["eq", "id", A1], ["eq", "conta_id", CONTA], ["is", "deleted_at", null], ["limit", 1]] },
    ]);
  });

  it("as RPCs da conta (convites, pendentes, novos por mês, equipe) e o card do aluno (compromissos): o p_conta/p_aluno da lib; sem ele → dados_invalidos", async () => {
    const { rpcs } = await ler([
      { q: "aluno_convites", conta: CONTA }, { q: "alunos_pendentes", conta: CONTA }, { q: "alunos_novos_por_mes", conta: CONTA, meses: 6 }, { q: "equipe_da_conta", conta: CONTA },
      { q: "aluno_compromissos", aluno: A1 },
    ], { rpc: () => ({ data: [], error: null }) });
    expect(rpcs).toEqual([
      { nome: "aluno_convites", args: { p_conta: CONTA } }, { nome: "alunos_pendentes", args: { p_conta: CONTA } },
      { nome: "alunos_novos_por_mes", args: { p_conta: CONTA, p_meses: 6 } }, { nome: "equipe_da_conta", args: { p_conta: CONTA } },
      { nome: "aluno_compromissos", args: { p_aluno: A1 } },
    ]);
    const ruins = await ler([{ q: "aluno_convites" }, { q: "equipe_da_conta", conta: "x" }, { q: "alunos_novos_por_mes", conta: CONTA, meses: 0 }, { q: "aluno_compromissos" }]);
    expect(ruins.itens.every((i) => i.ok === false && i.erro === "dados_invalidos")).toBe(true);
  });

  it("aluno_compromissos: a recusa da w14_matricula_da_rota (sem_acesso, aluno_inexistente, sem_login) volta como o código no item, sem o aviso de erro inesperado; o raise desconhecido segue erro_interno (controle)", async () => {
    // a varredura das recusas conhecidas (decisão da sessão principal 06:31): hoje a tela recebia o código pelo error.message (dados.ts:385-386 do d357719)
    expect([...ERROS_DA_MATRICULA_DA_ROTA]).toEqual(["sem_login", "sem_acesso", "aluno_inexistente"]);
    for (const codigo of ERROS_DA_MATRICULA_DA_ROTA) {
      const r = await ler([{ q: "aluno_compromissos", aluno: A1 }], { rpc: () => ({ data: null, error: { code: "P0001", message: codigo } }) });
      expect(r.itens, codigo).toEqual([{ ok: false, erro: codigo }]);
      expect(r.log.excecao, codigo).not.toHaveBeenCalled();
    }
    const desconhecido = await ler([{ q: "aluno_compromissos", aluno: A1 }], { rpc: () => ({ data: null, error: { code: "P0001", message: "boom" } }) });
    expect(desconhecido.itens).toEqual([{ ok: false, erro: "erro_interno" }]);
    expect(desconhecido.log.excecao).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(desconhecido.r)).not.toContain("boom");
  });

  it("N1 (o RLS): outra conta → as listas vazias / o { ok: false, erro } da RPC dela (sem_acesso, conta_inexistente) como valor; nunca a mensagem", async () => {
    const vazio = await ler([{ q: "agenda_calendarios", conta: OUTRA }, { q: "aluno_do_seletor", conta: OUTRA, id: A1 }], { tabela: () => ({ data: [], error: null }) });
    expect(vazio.itens).toEqual([{ ok: true, linhas: [] }, { ok: true, linhas: [] }]);
    const rpc = await ler([{ q: "alunos_da_conta", conta: OUTRA, offset: 0, limite: 20 }], { rpc: () => ({ data: { ok: false, erro: "sem_acesso" }, error: null }) });
    expect(rpc.itens).toEqual([{ ok: true, valor: { ok: false, erro: "sem_acesso" } }]);
    const negado = await ler([{ q: "agenda_travas" }], { tabela: () => ({ data: null, error: { code: "42501", message: "permission denied for table agenda_travas" } }) });
    expect(negado.itens).toEqual([{ ok: false, erro: "sem_acesso" }]);
    expect(JSON.stringify(negado.r)).not.toContain("permission");
  });
});

// ───────────────────────── as ações ─────────────────────────
describe("hml-21b — o despacho e as listas fechadas das ações da Agenda e dos Alunos", () => {
  it("as 21 ações (20 da Agenda, 1 dos Alunos — os nomes da §2.2 + tags_garantir, PADRÃO); nenhuma cruza com a 21a; o corpo de cada uma é fechado", () => {
    expect([...ACOES_DA_AGENDA]).toEqual([
      "agenda_garantir", "tags_garantir", "calendario_criar", "calendario_editar", "calendario_excluir", "tag_criar", "tag_editar", "tag_excluir",
      "agendamento_criar", "agendamento_editar", "agendamento_excluir", "bloqueio_criar", "bloqueio_excluir", "trava_criar", "trava_excluir",
      "regras_salvar", "agenda_confirmar", "agenda_desistir", "agenda_reagendar", "agenda_marcar",
    ]);
    expect([...ACOES_DOS_ALUNOS]).toEqual(["pacote_definir"]);
    const da21a = [...ACOES_DA_CASCA, ...ACOES_DO_APP] as string[];
    expect([...ACOES_DA_AGENDA, ...ACOES_DOS_ALUNOS].filter((a) => da21a.includes(a))).toEqual([]);
    // hml-21c (a mesma regra da DECISÃO 03:25: a lista ganha as ações da 21c por acréscimo, no fim; o que o caso prova não muda)
    expect(ACOES_DA_CONTA).toEqual([...ACOES_DA_CASCA, ...ACOES_DO_APP, ...ACOES_DA_AGENDA, ...ACOES_DOS_ALUNOS, ...ACOES_DA_21C]);
    expect(Object.keys(CORPOS_DA_21B).sort()).toEqual([...ACOES_DA_AGENDA, ...ACOES_DOS_ALUNOS].sort());
    for (const a of [...ACOES_DA_AGENDA, ...ACOES_DOS_ALUNOS]) expect(CORPOS_DAS_ACOES[a], a).toBe(CORPOS_DA_21B[a]);
    for (const [acao, corpo] of Object.entries(CORPOS_DA_21B)) {
      for (const dono of ["user_id", "destino_user_id", "nutricionista_id", "profissional_id", "dono_id", "base", "deleted_at", "created_at", "origem"]) {
        expect(Object.keys(corpo), `${acao}.${dono}`).not.toContain(dono);
      }
    }
  });

  it("moduloDoPedido: cada ação da Agenda ao módulo agenda; o pacote aos alunos; as da 21a como antes", () => {
    for (const a of ACOES_DA_AGENDA) expect(moduloDoPedido({ acao: a })).toEqual({ modulo: "agenda", acao: a });
    expect(moduloDoPedido({ acao: "pacote_definir" })).toEqual({ modulo: "alunos", acao: "pacote_definir" });
    expect(moduloDoPedido({ acao: "avisos_marcar_lidos" })).toEqual({ modulo: "casca", acao: "avisos_marcar_lidos" });
    for (const v of ["agenda_excluir_calendario", "calendarios", "Calendario_criar", "aluno_definir_pacote", "agenda_garantir_tags", "ler_agenda"]) {
      expect(moduloDoPedido({ acao: v }), v).toBeNull();
    }
  });

  it("o corpo da 21b: ausente = não vai; null = vai como null SÓ onde a coluna aceita; obrigatório ausente/null, chave fora da forma → dados_invalidos", () => {
    expect(lerCamposDaAcao({ id: A1, slot_minutos: null, tag_padrao_id: null, nome: "A", lixo: 1, nutricionista_id: OUTRA }, CORPOS_DA_21B.calendario_editar))
      .toEqual({ ok: true, valores: { id: A1, nome: "A", slot_minutos: null, tag_padrao_id: null } });
    expect(lerCamposDaAcao({ id: A1, nome: null }, CORPOS_DA_21B.calendario_editar)).toEqual({ ok: false, campo: "nome" });
    expect(lerCamposDaAcao({ id: A1, padrao: null }, CORPOS_DA_21B.calendario_editar)).toEqual({ ok: false, campo: "padrao" });
    expect(lerCamposDaAcao({}, CORPOS_DA_21B.calendario_excluir)).toEqual({ ok: false, campo: "id" });
    expect(lerCamposDaAcao({ id: null }, CORPOS_DA_21B.calendario_excluir)).toEqual({ ok: false, campo: "id" });
    for (const [campo, v] of [["faixa_inicio", "24:00"], ["faixa_inicio", "7:00"], ["faixa_fim", "12:60"], ["slot_minutos", 3], ["slot_minutos", 241], ["cor", "x".repeat(21)]] as const) {
      expect(lerCamposDaAcao({ id: A1, [campo]: v }, CORPOS_DA_21B.calendario_editar), `${campo}=${v}`).toEqual({ ok: false, campo });
    }
    expect(lerCamposDaAcao({ id: A1, faixa_inicio: "07:00", faixa_fim: "20:00:00" }, CORPOS_DA_21B.calendario_editar)).toMatchObject({ ok: true });
    for (const dias of [[], [7], [-1], [1.5], "1", [0, 1, 2, 3, 4, 5, 6, 0]]) {
      expect(lerCamposDaAcao({ dias, hora_inicio: "08:00", hora_fim: "09:00" }, CORPOS_DA_21B.trava_criar), JSON.stringify(dias)).toMatchObject(Array.isArray(dias) && dias.length === 0 ? { ok: true } : { ok: false, campo: "dias" });
    }
    for (const papeis of [["x".repeat(41)], Array(11).fill("dono"), [""], [3], "dono"]) {
      expect(lerCamposDaAcao({ papeis }, CORPOS_DA_21B.agenda_garantir), JSON.stringify(papeis).slice(0, 30)).toEqual({ ok: false, campo: "papeis" });
    }
    expect(lerCamposDaAcao({ papeis: [], modulos: [], conta_id: null }, CORPOS_DA_21B.agenda_garantir)).toEqual({ ok: true, valores: { papeis: [], modulos: [], conta_id: null } });
    expect(lerCorpoDaAcao("agendamento_criar", { calendario_id: CAL, titulo: "T", inicio: DE, fim: ATE, status: "cancelado" })).toEqual({ ok: false, erro: "dados_invalidos", campo: "status" });
  });

  it("a 21a segue no lerParams do motor (o null = 'não veio', como sempre): a mesma resposta de antes", () => {
    expect(lerCorpoDaAcao("aviso_mudanca_marcar", { versao: null })).toEqual({ ok: true, valores: {} });
    expect(lerCorpoDaAcao("push_registrar", { token: "t", versao: null })).toEqual({ ok: true, valores: { token: "t" } });
  });
});

describe("hml-21b — as gravações da Agenda (como a pessoa; o dono do user ou do calendário)", () => {
  const CAL_DO_BANCO = { nutricionista_id: OUTRA, conta_id: CONTA };
  it("calendario_criar: o dono = quem chama, a conta do corpo; só as colunas da tela; a volta = a linha da leitura (lista fechada), 1 linha", async () => {
    const linha = { id: CAL, nome: "Treino" };
    const { r, pedidos } = await agenda("calendario_criar", {
      nome: "Treino", cor: "#a78bfa", padrao: true, faixa_inicio: "07:00", faixa_fim: "20:00", slot_minutos: null, conta_id: CONTA, nutricionista_id: OUTRA, deleted_at: "x",
    }, { tabela: () => ({ data: [linha], error: null }) });
    expect(r).toEqual({ ok: true, linha });
    expect(pedidos).toEqual([{
      tipo: "insert", tabela: "calendarios",
      valores: { nome: "Treino", cor: "#a78bfa", padrao: true, faixa_inicio: "07:00", faixa_fim: "20:00", slot_minutos: null, nutricionista_id: EU, conta_id: CONTA },
      passos: [["select", COLUNAS_DA_AGENDA.calendarios.join(", ")], ["single"]],
    }]);
    const semConta = await agenda("calendario_criar", { nome: "X" });
    expect(semConta.pedidos[0].valores).toEqual({ nome: "X", nutricionista_id: EU, conta_id: null });
    expect((await agenda("calendario_criar", { cor: "#000000" })).r).toEqual({ ok: false, erro: "dados_invalidos" });
  });

  it("calendario_editar: SÓ as colunas que vieram (o null limpa o slot/a tag), pelo id; 0 linha → nao_encontrado; nenhuma coluna → dados_invalidos", async () => {
    const ok = await agenda("calendario_editar", { id: CAL, padrao: false, nutricionista_id: OUTRA, conta_id: OUTRA }, { tabela: () => ({ data: [{ id: CAL }], error: null }) });
    expect(ok.r).toEqual({ ok: true, linha: { id: CAL } });
    expect(ok.pedidos).toEqual([{ tipo: "update", tabela: "calendarios", valores: { padrao: false }, passos: [["eq", "id", CAL], ["select", COLUNAS_DA_AGENDA.calendarios.join(", ")]] }]);
    expect((await agenda("calendario_editar", { id: CAL, nome: "Y" }, { tabela: () => ({ data: [], error: null }) })).r).toEqual({ ok: false, erro: "nao_encontrado" });
    const vazio = await agenda("calendario_editar", { id: CAL });
    expect(vazio.r).toEqual({ ok: false, erro: "dados_invalidos" });
    expect(vazio.pedidos).toEqual([]);
  });

  it("calendario_excluir: a RPC nova agenda_excluir_calendario(p_calendario) → quantos agendamentos foram; o nao_encontrado/sem_login dela como eles", async () => {
    const ok = await agenda("calendario_excluir", { id: CAL, nutricionista_id: OUTRA }, { rpc: () => ({ data: 3, error: null }) });
    expect(ok.r).toEqual({ ok: true, agendamentos: 3 });
    expect(ok.rpcs).toEqual([{ nome: "agenda_excluir_calendario", args: { p_calendario: CAL } }]);
    expect(ok.pedidos).toEqual([]);
    const nao = await agenda("calendario_excluir", { id: CAL }, { rpc: () => ({ data: null, error: { code: "P0002", message: "nao_encontrado" } }) });
    expect(nao.r).toEqual({ ok: false, erro: "nao_encontrado" });
    expect(nao.log.excecao).not.toHaveBeenCalled();
    const sl = await agenda("calendario_excluir", { id: CAL }, { rpc: () => ({ data: null, error: { code: "42501", message: "sem_login" } }) });
    expect(sl.r).toEqual({ ok: false, erro: "sem_login" });
  });

  it("agenda_garantir: a RPC nova agenda_garantir_inicio(p_conta, p_papeis, p_modulos) — as listas vazias quando não vieram; volta os criados com as colunas da leitura", async () => {
    const criado = { ...Object.fromEntries(COLUNAS_DA_AGENDA.calendarios.map((k) => [k, null])), id: CAL, nome: "Treino", nutricionista_id: EU, extra_que_nao_vai: 1 };
    const { r, rpcs } = await agenda("agenda_garantir", { conta_id: CONTA, papeis: ["dono", "personal"], modulos: ["treino"], nutricionista_id: OUTRA }, {
      rpc: () => ({ data: { criados: [criado] }, error: null }),
    });
    expect(rpcs).toEqual([{ nome: "agenda_garantir_inicio", args: { p_conta: CONTA, p_papeis: ["dono", "personal"], p_modulos: ["treino"] } }]);
    const { extra_que_nao_vai: _x, ...semExtra } = criado;
    expect(r).toEqual({ ok: true, criados: [semExtra] });
    const nada = await agenda("agenda_garantir", {}, { rpc: () => ({ data: { criados: [] }, error: null }) });
    expect(nada.rpcs).toEqual([{ nome: "agenda_garantir_inicio", args: { p_conta: null, p_papeis: [], p_modulos: [] } }]);
    expect(nada.r).toEqual({ ok: true, criados: [] });
    const ruim = await agenda("agenda_garantir", {}, { rpc: () => ({ data: null, error: { code: "22023", message: "dados_invalidos" } }) });
    expect(ruim.r).toEqual({ ok: false, erro: "dados_invalidos" });
  });

  it("tags_garantir: a agenda_garantir_tags de hoje → o { ok, tags } dela no resultado; o raise sem_login como ele", async () => {
    const ok = await agenda("tags_garantir", { profissional_id: OUTRA }, { rpc: () => ({ data: { ok: false, erro: "sem_acesso" }, error: null }) });
    expect(ok.rpcs).toEqual([{ nome: "agenda_garantir_tags", args: {} }]);
    expect(ok.r).toEqual({ ok: true, resultado: { ok: false, erro: "sem_acesso" } });
    expect((await agenda("tags_garantir", {}, { rpc: () => ({ data: null, error: { code: "P0001", message: "sem_login" } }) })).r).toEqual({ ok: false, erro: "sem_login" });
  });

  it("tag_criar/editar/excluir: o profissional = quem chama (base = false); editar só nome/cor/área; excluir = o deleted_at; os códigos do gatilho como eles", async () => {
    const criar = await agenda("tag_criar", { nome: "Reunião", cor: "#123456", area: "geral", profissional_id: OUTRA, base: true }, { tabela: () => ({ data: [{ id: A1 }], error: null }) });
    expect(criar.pedidos[0]).toEqual({
      tipo: "insert", tabela: "agenda_tags", valores: { profissional_id: EU, nome: "Reunião", cor: "#123456", area: "geral", base: false },
      passos: [["select", COLUNAS_DA_AGENDA.agenda_tags.join(", ")], ["single"]],
    });
    const editar = await agenda("tag_editar", { id: A1, nome: "R", area: "treino", base: false }, { tabela: () => ({ data: [{ id: A1 }], error: null }) });
    expect(editar.pedidos[0]).toMatchObject({ tipo: "update", tabela: "agenda_tags", valores: { nome: "R", area: "treino" } });
    const excluir = await agenda("tag_excluir", { id: A1 }, { tabela: () => ({ data: [{ id: A1 }], error: null }) });
    expect(excluir.r).toEqual({ ok: true });
    expect(excluir.pedidos[0]).toEqual({ tipo: "update", tabela: "agenda_tags", valores: { deleted_at: AGORA.toISOString() }, passos: [["eq", "id", A1], ["select", "id"]] });
    for (const codigo of ERROS_DAS_TAGS) {
      const r = await agenda("tag_excluir", { id: A1 }, { tabela: () => ({ data: null, error: { code: "P0001", message: codigo } }) });
      expect(r.r, codigo).toEqual({ ok: false, erro: codigo });
      expect(r.log.excecao).not.toHaveBeenCalled();
    }
    const repetida = await agenda("tag_criar", { nome: "Treino", cor: "#a78bfa", area: "treino" }, { tabela: () => ({ data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "agenda_tags_nome_uq"' } }) });
    expect(repetida.r).toEqual({ ok: false, erro: "conflito" });
    const rls = await agenda("tag_editar", { id: A1, cor: "#000000" }, { tabela: () => ({ data: null, error: { code: "42501", message: "new row violates row-level security policy" } }) });
    expect(rls.r).toEqual({ ok: false, erro: "sem_acesso" });
    expect((await agenda("tag_excluir", { id: A1 }, { tabela: () => ({ data: [], error: null }) })).r).toEqual({ ok: false, erro: "nao_encontrado" });
  });

  it("agendamento_criar: o dono = o DONO DO CALENDÁRIO lido como a pessoa (nunca o do corpo); calendário que ela não vê → nao_encontrado e nada grava", async () => {
    const corpo = {
      calendario_id: CAL, paciente_id: A1, titulo: "Consulta", inicio: DE, fim: ATE, dia_inteiro: false, status: "agendado", confirmacao: "a_confirmar",
      observacao: null, modulo: "treino", tag_id: null, conta_id: CONTA, nutricionista_id: EU, origem: "aluno",
    };
    const { r, pedidos } = await agenda("agendamento_criar", corpo, {
      tabela: (p) => (p.tabela === "calendarios" ? { data: [CAL_DO_BANCO], error: null } : { data: [{ id: A1 }], error: null }),
    });
    expect(r).toEqual({ ok: true, linha: { id: A1 } });
    expect(pedidos).toEqual([
      { tipo: "select", tabela: "calendarios", colunas: "nutricionista_id", passos: [["eq", "id", CAL], ["maybeSingle"]] },
      {
        tipo: "insert", tabela: "agendamentos",
        valores: {
          calendario_id: CAL, paciente_id: A1, titulo: "Consulta", inicio: DE, fim: ATE, dia_inteiro: false, status: "agendado", confirmacao: "a_confirmar",
          observacao: null, modulo: "treino", tag_id: null, conta_id: CONTA, nutricionista_id: OUTRA,
        },
        passos: [["select", COLUNAS_DA_AGENDA.agendamentos.join(", ")], ["single"]],
      },
    ]);
    const naoVe = await agenda("agendamento_criar", corpo, { tabela: () => ({ data: [], error: null }) });
    expect(naoVe.r).toEqual({ ok: false, erro: "nao_encontrado" });
    expect(naoVe.pedidos.map((p) => p.tipo)).toEqual(["select"]);
    const periodo = await agenda("agendamento_criar", corpo, {
      tabela: (p) => (p.tabela === "calendarios" ? { data: [CAL_DO_BANCO], error: null } : { data: null, error: { code: "23514", message: "agendamentos_periodo_valido" } }),
    });
    expect(periodo.r).toEqual({ ok: false, erro: "dados_invalidos" });
  });

  it("agendamento_editar: só as colunas que vieram; com o calendário, o dono dele (o mesmo de hoje ao trocar de profissional); excluir = o deleted_at", async () => {
    const ok = await agenda("agendamento_editar", { id: A1, calendario_id: CAL, titulo: "Novo", modulo: "geral", conta_id: null, nutricionista_id: EU }, {
      tabela: (p) => (p.tabela === "calendarios" ? { data: [CAL_DO_BANCO], error: null } : { data: [{ id: A1 }], error: null }),
    });
    expect(ok.r).toEqual({ ok: true, linha: { id: A1 } });
    expect(ok.pedidos[1]).toEqual({
      tipo: "update", tabela: "agendamentos", valores: { calendario_id: CAL, titulo: "Novo", modulo: "geral", conta_id: null, nutricionista_id: OUTRA },
      passos: [["eq", "id", A1], ["select", COLUNAS_DA_AGENDA.agendamentos.join(", ")]],
    });
    const semCal = await agenda("agendamento_editar", { id: A1, status: "confirmado", confirmacao: "confirmado" }, { tabela: () => ({ data: [{ id: A1 }], error: null }) });
    expect(semCal.pedidos).toHaveLength(1);
    expect(semCal.pedidos[0].valores).toEqual({ status: "confirmado", confirmacao: "confirmado" });
    const excluir = await agenda("agendamento_excluir", { id: A1 }, { tabela: () => ({ data: [{ id: A1 }], error: null }) });
    expect(excluir.pedidos[0]).toEqual({ tipo: "update", tabela: "agendamentos", valores: { deleted_at: AGORA.toISOString() }, passos: [["eq", "id", A1], ["select", "id"]] });
    expect((await agenda("agendamento_excluir", { id: A1 }, { tabela: () => ({ data: [], error: null }) })).r).toEqual({ ok: false, erro: "nao_encontrado" });
  });

  it("bloqueio e trava: o dono = quem chama, a conta e o calendário do corpo (null = todos); excluir = delete de verdade; 0 linha → nao_encontrado", async () => {
    const b = await agenda("bloqueio_criar", { conta_id: CONTA, calendario_id: null, inicio: DE, fim: ATE, motivo: "Férias", nutricionista_id: OUTRA }, {
      tabela: () => ({ data: [{ id: A1 }], error: null }),
    });
    expect(b.pedidos[0]).toEqual({
      tipo: "insert", tabela: "bloqueios_agenda", valores: { nutricionista_id: EU, conta_id: CONTA, calendario_id: null, inicio: DE, fim: ATE, motivo: "Férias" },
      passos: [["select", COLUNAS_DA_AGENDA.bloqueios_agenda.join(", ")], ["single"]],
    });
    const t = await agenda("trava_criar", { calendario_id: CAL, dias: [1, 3], hora_inicio: "12:00", hora_fim: "13:30", motivo: null, profissional_id: OUTRA }, {
      tabela: () => ({ data: [{ id: A1 }], error: null }),
    });
    expect(t.pedidos[0]).toEqual({
      tipo: "insert", tabela: "agenda_travas", valores: { profissional_id: EU, conta_id: null, calendario_id: CAL, dias: [1, 3], hora_inicio: "12:00", hora_fim: "13:30", motivo: null },
      passos: [["select", COLUNAS_DA_AGENDA.agenda_travas.join(", ")], ["single"]],
    });
    for (const acao of ["bloqueio_excluir", "trava_excluir"] as const) {
      const ok = await agenda(acao, { id: A1 }, { tabela: () => ({ data: [{ id: A1 }], error: null }) });
      expect(ok.pedidos[0], acao).toEqual({ tipo: "delete", tabela: acao === "bloqueio_excluir" ? "bloqueios_agenda" : "agenda_travas", passos: [["eq", "id", A1], ["select", "id"]] });
      expect((await agenda(acao, { id: A1 }, { tabela: () => ({ data: [], error: null }) })).r, acao).toEqual({ ok: false, erro: "nao_encontrado" });
    }
  });

  it("regras_salvar: o upsert do agenda_config de QUEM CHAMA (profissional_id = user, onConflict), as 7 regras; faltou uma → dados_invalidos", async () => {
    const regras = { slot_minutos: 30, atende_inicio: "08:00", atende_fim: "18:00", dias: [1, 2, 3, 4, 5], reagendamentos_max: 1, janela_reagendamento: "mes", desistencia: true };
    const { r, pedidos } = await agenda("regras_salvar", { ...regras, profissional_id: OUTRA }, { tabela: () => ({ data: [{ ...regras, profissional_id: EU }], error: null }) });
    expect(r).toEqual({ ok: true, linha: { ...regras, profissional_id: EU } });
    expect(pedidos).toEqual([{
      tipo: "upsert", tabela: "agenda_config", valores: { profissional_id: EU, ...regras }, opcoes: { onConflict: "profissional_id" },
      passos: [["select", COLUNAS_DA_AGENDA.agenda_config.join(", ")], ["single"]],
    }]);
    const { desistencia: _d, ...semUma } = regras;
    expect((await agenda("regras_salvar", semUma)).r).toEqual({ ok: false, erro: "dados_invalidos" });
    expect((await agenda("regras_salvar", { ...regras, janela_reagendamento: "ano" })).r).toEqual({ ok: false, erro: "dados_invalidos" });
  });

  it("a Agenda do aluno: as RPCs aluno_agenda_* com os MESMOS argumentos de hoje; o { ok: false, erro } no resultado; agendamento_inexistente como ele", async () => {
    const casos: Array<[AcaoDaAgenda, Record<string, unknown>, string, Record<string, unknown>]> = [
      ["agenda_confirmar", { agendamento: A1, paciente_id: OUTRA }, "aluno_agenda_confirmar", { p_agendamento: A1 }],
      ["agenda_desistir", { agendamento: A1 }, "aluno_agenda_desistir", { p_agendamento: A1 }],
      ["agenda_reagendar", { agendamento: A1, inicio: DE }, "aluno_agenda_reagendar", { p_agendamento: A1, p_inicio: DE }],
      ["agenda_marcar", { profissional: OUTRA, inicio: "2026-10-20T13:00:00+00:00" }, "aluno_agenda_marcar", { p_profissional: OUTRA, p_inicio: "2026-10-20T13:00:00+00:00" }],
    ];
    for (const [acao, corpo, rpc, args] of casos) {
      const { r, rpcs } = await agenda(acao, corpo, { rpc: () => ({ data: { ok: false, erro: "nao_confirma" }, error: null }) });
      expect(rpcs, acao).toEqual([{ nome: rpc, args }]);
      expect(r, acao).toEqual({ ok: true, resultado: { ok: false, erro: "nao_confirma" } });
    }
    const inex = await agenda("agenda_confirmar", { agendamento: A1 }, { rpc: () => ({ data: null, error: { code: "P0001", message: "agendamento_inexistente" } }) });
    expect(inex.r).toEqual({ ok: false, erro: "agendamento_inexistente" });
    for (const [acao, corpo] of [["agenda_reagendar", { agendamento: A1 }], ["agenda_marcar", { inicio: DE }], ["agenda_confirmar", { agendamento: "x" }]] as const) {
      expect((await agenda(acao, corpo)).r, acao).toEqual({ ok: false, erro: "dados_invalidos" });
    }
  });

  it("o log das gravações nunca leva os valores (ids, títulos, nomes, observações): só código, schema, ação, campo e pg", async () => {
    const corpo = { calendario_id: CAL, titulo: "Título secreto", inicio: DE, fim: ATE, observacao: "obs secreta" };
    const { log } = await agenda("agendamento_criar", corpo, {
      tabela: (p) => (p.tabela === "calendarios" ? { data: [CAL_DO_BANCO], error: null } : { data: null, error: { code: "XX000", message: "boom Título secreto" } }),
    });
    const tudo = JSON.stringify([log.info.mock.calls, log.aviso.mock.calls, log.erro.mock.calls, log.excecao.mock.calls.map((c) => c[1])]);
    for (const v of ["Título secreto", "obs secreta", CAL, OUTRA, CONTA]) expect(tudo, v).not.toContain(v);
    const recusa = await agenda("calendario_criar", { nome: "Nome secreto", cor: 3 });
    expect(recusa.log.aviso).toHaveBeenCalledWith({ codigo: "dados_invalidos", schema: "staging", acao: "calendario_criar", resultado: "cor" });
  });
});

describe("hml-21b — as gravações dos Alunos", () => {
  it("pacote_definir: a RPC aluno_definir_pacote com os MESMOS argumentos de hoje (o mês nulo vai nulo); o { ok: false, erro } dela no resultado", async () => {
    const k = contexto({ acao: "pacote_definir", aluno: A1, profissional: OUTRA, total: 4, mes_inicio: "2026-10-01", nutricionista_id: EU }, {
      rpc: () => ({ data: { ok: false, erro: "nao_responsavel" }, error: null }),
    });
    const r = await atenderAlunos(k.c as never, "pacote_definir");
    expect(k.rpcs).toEqual([{ nome: "aluno_definir_pacote", args: { p_aluno: A1, p_profissional: OUTRA, p_total: 4, p_mes_inicio: "2026-10-01" } }]);
    expect(r).toEqual({ ok: true, resultado: { ok: false, erro: "nao_responsavel" } });
    const k2 = contexto({ acao: "pacote_definir", aluno: A1, profissional: OUTRA, total: 0, mes_inicio: null }, { rpc: () => ({ data: { ok: true, pacote: null }, error: null }) });
    await atenderAlunos(k2.c as never, "pacote_definir");
    expect(k2.rpcs[0].args).toEqual({ p_aluno: A1, p_profissional: OUTRA, p_total: 0, p_mes_inicio: null });
    for (const corpo of [{ profissional: OUTRA, total: 1 }, { aluno: A1, profissional: OUTRA, total: 1.5 }, { aluno: A1, profissional: OUTRA, total: 1, mes_inicio: "2026-13-01" }]) {
      const k3 = contexto({ acao: "pacote_definir", ...corpo });
      expect(await atenderAlunos(k3.c as never, "pacote_definir"), JSON.stringify(corpo)).toEqual({ ok: false, erro: "dados_invalidos" });
      expect(k3.rpcs).toEqual([]);
    }
  });

  it("pacote_definir: a recusa da w14_matricula_da_rota (o aluno de quem não pode — o N1 da etapa 2 — e o que não existe) volta como o código, sem o aviso de erro inesperado; o desconhecido segue erro_interno (controle)", async () => {
    // medido no staging (etapa 2, 06:26): a OUTRA conta → 500 erro_interno + log.excecao; hoje a tela recebia o código (dados.ts:399-400 do d357719)
    const status: Record<string, number> = {};
    for (const codigo of ERROS_DA_MATRICULA_DA_ROTA) {
      const k = contexto({ acao: "pacote_definir", aluno: A1, profissional: OUTRA, total: 4 }, { rpc: () => ({ data: null, error: { code: "P0001", message: codigo } }) });
      expect(await atenderAlunos(k.c as never, "pacote_definir"), codigo).toEqual({ ok: false, erro: codigo });
      expect(k.log.excecao, codigo).not.toHaveBeenCalled();
      status[codigo] = statusDoErroConta(codigo);
    }
    expect(status).toEqual({ sem_login: 401, sem_acesso: 403, aluno_inexistente: 400 });
    const k = contexto({ acao: "pacote_definir", aluno: A1, profissional: OUTRA, total: 4 }, { rpc: () => ({ data: null, error: { code: "P0001", message: "boom" } }) });
    expect(await atenderAlunos(k.c as never, "pacote_definir")).toEqual({ ok: false, erro: "erro_interno" });
    expect(k.log.excecao).toHaveBeenCalledTimes(1);
  });
});

describe("hml-21b — a fonte: o index despacha os 2 módulos; nenhuma chave secreta", () => {
  const ler = (rel: string) => readFileSync(resolve(RAIZ, "supabase-principal/functions", rel), "utf-8");
  it("index.ts: agenda → atenderAgenda, alunos → atenderAlunos (a porta e o `ler` como na 21a)", () => {
    const fonte = ler("conta/index.ts");
    expect(fonte).toContain('case "agenda":\n      return atenderAgenda(c, pedido.acao);');
    expect(fonte).toContain('case "alunos":\n      return atenderAlunos(c, pedido.acao);');
    expect(fonte).toContain('servirComoPessoa("conta", { freio: 240, jwtLeitura: "jwks" }, async (c) => {');
  });
  it("a migration das 2 RPCs atômicas: INVOKER, search_path vazio, revoke de public/anon e grant ao logado (o checar-definer e o Postgres local provam o resto)", () => {
    const m = readFileSync(resolve(RAIZ, "supabase-principal/migrations/20261013100000_hml21b_agenda_atomicas.sql"), "utf-8");
    for (const f of ["agenda_excluir_calendario(p_calendario uuid) returns integer", "agenda_garantir_inicio(p_conta uuid, p_papeis text[], p_modulos text[]) returns jsonb"]) {
      expect(m).toContain(`create or replace function {schema}.${f}\nlanguage plpgsql volatile security invoker set search_path = '' as $$`);
    }
    expect(m).not.toMatch(/security definer/i);
    expect(m).toContain("revoke all on function {schema}.agenda_excluir_calendario(uuid) from public, anon;");
    expect(m).toContain("revoke all on function {schema}.agenda_garantir_inicio(uuid, text[], text[]) from public, anon;");
    expect(m).toContain("grant execute on function {schema}.agenda_excluir_calendario(uuid) to authenticated, service_role;");
    expect(m).toContain("grant execute on function {schema}.agenda_garantir_inicio(uuid, text[], text[]) to authenticated, service_role;");
    const rev = readFileSync(resolve(RAIZ, "supabase-principal/reversas/20261013100000_hml21b_agenda_atomicas_reversa.sql"), "utf-8");
    expect(rev).toContain("drop function if exists {schema}.agenda_excluir_calendario(uuid);");
    expect(rev).toContain("drop function if exists {schema}.agenda_garantir_inicio(uuid, text[], text[]);");
  });
});
