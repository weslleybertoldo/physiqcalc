// Physiq hml-21b (H-43 · jeito 2, etapa 3) — o CONTRATO tela × servidor da função conta, parte 2: cada lib que mudou (a Agenda do painel —
// src/painel/agenda/dados.ts —, a Agenda do aluno — src/app-aluno/perfil/agenda/api.ts —, os Alunos — src/painel/alunos/{api,novosPorMes}.ts
// — e o buscarEquipe) chama lerConta/acaoConta com os params certos, o corpo PASSA nas regras REAIS do servidor (o catálogo inteiro e as listas
// fechadas de supabase-principal/functions/_shared/conta-{leituras,regras}.ts: nenhuma chave a mais, nenhum valor fora da forma, nenhum dono)
// e devolve o MESMO tipo de hoje. A função responde pelos MÓDULOS DE VERDADE (src/test/contaFalsa.ts) sobre o banco falso deste teste. E a
// série da Agenda: as 8 leituras da tela (+ a equipe do dono) numa ida só; as tags (dependem dos calendários) na 2ª.
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lerPedidoDeLeitura, type CatalogoLeitura } from "../../supabase-principal/functions/_shared/leitura-lote";
import { CATALOGO_CONTA } from "../../supabase-principal/functions/_shared/conta-leituras";
import { CORPOS_DAS_ACOES, lerCorpoDaAcao, moduloDoPedido, type AcaoConta } from "../../supabase-principal/functions/_shared/conta-regras";
import { mensagemErroTag } from "@/agenda/regras";

const EU = "33333333-3333-4333-8333-333333333333";
const OUTRA = "99999999-9999-4999-8999-999999999999";
const CONTA = "c0c0c0c0-0000-4000-8000-000000000001";
const CAL = "ca111111-1111-4111-8111-111111111111";
const A1 = "a1111111-1111-4111-8111-111111111111";

type Fn = (...a: unknown[]) => unknown;
type Banco = { rpc?: (nome: string, args?: Record<string, unknown>) => unknown; from?: (t: string) => Record<string, unknown> };
const h = vi.hoisted(() => ({
  eu: "33333333-3333-4333-8333-333333333333",
  banco: {} as Record<string, unknown>,
  corpos: [] as Array<{ nome: string; corpo: Record<string, unknown> }>,
  conta: { id: "c0c0c0c0-0000-4000-8000-000000000001", papeis: ["dono", "nutricionista"], modulos: ["nutricao"] } as Record<string, unknown>,
}));

vi.mock("@/integrations/principal/client", async () => {
  const { invocarContaPeloModulo } = await import("@/test/contaFalsa");
  const banco = {
    rpc: (...a: unknown[]) => (h.banco as Banco).rpc?.(...(a as [string, Record<string, unknown>])),
    from: (t: string) => (h.banco as Banco).from?.(t),
  };
  const conta = invocarContaPeloModulo(banco, { userId: h.eu });
  return {
    PRINCIPAL_URL: "https://api-principal.physiqcalc.com.br",
    PRINCIPAL_SCHEMA: "staging",
    principalConfigurado: true,
    principal: {
      functions: {
        invoke: async (nome: string, o: { body: Record<string, unknown> }) => {
          h.corpos.push({ nome, corpo: o.body });
          return nome === "conta" ? conta(o.body) : { data: null, error: { name: "FunctionsHttpError" } };
        },
      },
    },
  };
});
vi.mock("@/nucleo/conta", () => ({ useConta: () => ({ conta: h.conta, ehDono: (h.conta.papeis as string[]).includes("dono") }) }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: { id: h.eu }, situacao: { nome: "Eu" } }) }));

import * as agenda from "@/painel/agenda/dados";
import { useContextoAgenda, useDadosAgenda } from "@/painel/agenda/useAgenda";
import * as doAluno from "@/app-aluno/perfil/agenda/api";
import * as alunos from "@/painel/alunos/api";
import { buscarNovosPorMes } from "@/painel/alunos/novosPorMes";
import { buscarEquipe } from "@/painel/configuracoes/equipe/api";
import { FILTROS_PADRAO } from "@/painel/alunos/regras";

/** O corpo que a tela mandou PASSA nas regras reais do servidor: a ação/as consultas conhecidas e NENHUMA chave fora da lista. */
function passaNoServidor(corpo: Record<string, unknown>) {
  const pedido = moduloDoPedido(corpo);
  expect(pedido, JSON.stringify(corpo)).not.toBeNull();
  if (pedido!.modulo === "leitura") {
    const r = lerPedidoDeLeitura(corpo, CATALOGO_CONTA.consultas as CatalogoLeitura);
    expect(r.ok).toBe(true);
    for (const item of (corpo.itens as Array<Record<string, unknown>>) ?? []) {
      const declarados = Object.keys((CATALOGO_CONTA.consultas as Record<string, { params: object }>)[String(item.q)].params);
      expect(Object.keys(item).filter((k) => k !== "q" && !declarados.includes(k)), String(item.q)).toEqual([]);
    }
    if (r.ok === true) for (const i of r.itens) expect(i.ok, JSON.stringify(i)).toBe(true);
    return;
  }
  const acao = pedido!.acao as AcaoConta;
  expect(lerCorpoDaAcao(acao, corpo), acao).toMatchObject({ ok: true });
  const declarados = Object.keys(CORPOS_DAS_ACOES[acao]);
  expect(Object.keys(corpo).filter((k) => k !== "acao" && !declarados.includes(k)), acao).toEqual([]);
  for (const dono of ["nutricionista_id", "profissional_id", "user_id"]) expect(Object.keys(corpo), `${acao}.${dono}`).not.toContain(dono);
}
const daConta = () => h.corpos.filter((c) => c.nome === "conta").map((c) => c.corpo);
const todosPassam = () => {
  for (const c of daConta()) passaNoServidor(c);
};

/** Uma tabela do banco falso: grava os passos e devolve as linhas (a lista; o insert/update/delete/upsert com a linha que veio). */
function tabela(linhas: unknown[] = [], gravadas: unknown[][] = []) {
  const cadeia = (resposta: () => { data: unknown; error: unknown }): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    for (const op of ["select", "eq", "in", "is", "or", "gte", "lt", "order", "limit"]) c[op] = () => c;
    c.then = (ok: Fn, falha?: Fn) => Promise.resolve(resposta()).then(ok as never, falha as never);
    return c;
  };
  return {
    select: () => cadeia(() => ({ data: linhas, error: null })),
    insert: (v: unknown) => (gravadas.push(["insert", v]), cadeia(() => ({ data: [{ id: A1, profissional_id: EU, ...(v as object) }], error: null }))),
    update: (v: unknown) => (gravadas.push(["update", v]), cadeia(() => ({ data: [{ id: A1, profissional_id: EU, ...(v as object) }], error: null }))),
    upsert: (v: unknown) => (gravadas.push(["upsert", v]), cadeia(() => ({ data: [v], error: null }))),
    delete: () => (gravadas.push(["delete"]), cadeia(() => ({ data: [{ id: A1 }], error: null }))),
  };
}

beforeEach(() => {
  h.banco = {};
  h.corpos = [];
  h.conta = { id: CONTA, papeis: ["dono", "nutricionista"], modulos: ["nutricao"] };
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});
afterEach(() => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

// ───────────────────────── a Agenda do painel ─────────────────────────
describe("hml-21b — Painel › Agenda (src/painel/agenda/dados.ts) pela conta: a mesma assinatura e o mesmo tipo", () => {
  it("listarCalendarios: q agenda_calendarios com a conta (sem ela, só o meu); o uid nunca vai (o servidor usa o token)", async () => {
    const cal = { id: CAL, nutricionista_id: EU, nome: "Principal" };
    h.banco = { from: () => tabela([cal]) };
    expect(await agenda.listarCalendarios(EU, CONTA)).toEqual([cal]);
    expect(await agenda.listarCalendarios(EU, null)).toEqual([cal]);
    expect(daConta()).toEqual([{ acao: "ler", itens: [{ conta: CONTA, q: "agenda_calendarios" }] }, { acao: "ler", itens: [{ q: "agenda_calendarios" }] }]);
    todosPassam();
  });

  it("garantirCalendarios: com um calendário MEU, só a lista (0 ação); sem, 1 agenda_garantir com a conta, os papéis e os módulos → lista + criados", async () => {
    h.banco = { from: () => tabela([{ id: CAL, nutricionista_id: EU }]) };
    expect(await agenda.garantirCalendarios(EU, CONTA, ["dono", "nutricionista"], ["nutricao"])).toEqual([{ id: CAL, nutricionista_id: EU }]);
    expect(daConta().map((c) => c.acao)).toEqual(["ler"]);
    h.corpos = [];
    const criado = { id: A1, nutricionista_id: EU, nome: "Calendário principal" };
    const doDono = { id: CAL, nutricionista_id: OUTRA, nome: "Do membro" };
    h.banco = { from: () => tabela([doDono]), rpc: (nome: string) => (nome === "agenda_garantir_inicio" ? { data: { criados: [criado] }, error: null } : { data: null, error: null }) };
    expect(await agenda.garantirCalendarios(EU, CONTA, ["dono", "nutricionista"], ["nutricao"])).toEqual([doDono, criado]);
    expect(daConta()).toEqual([
      { acao: "ler", itens: [{ conta: CONTA, q: "agenda_calendarios" }] },
      { conta_id: CONTA, papeis: ["dono", "nutricionista"], modulos: ["nutricao"], acao: "agenda_garantir" },
    ]);
    todosPassam();
    h.corpos = [];
    await agenda.garantirCalendarios(EU, null, [], null);
    expect(daConta()[1]).toEqual({ conta_id: null, papeis: [], modulos: [], acao: "agenda_garantir" });
    todosPassam();
  });

  it("calendário: criar (só as colunas da tela + a conta; o dono nunca vai), editar (as que vieram + o id), excluir (1 ação: a RPC atômica)", async () => {
    const gravadas: unknown[][] = [];
    h.banco = { from: () => tabela([], gravadas), rpc: () => ({ data: 2, error: null }) };
    const novo = await agenda.criarCalendario(EU, CONTA, { nome: "Treino", cor: "#a78bfa", faixa_inicio: "07:00", faixa_fim: "20:00", padrao: true, slot_minutos: null, nutricionista_id: OUTRA, deleted_at: "x" } as never);
    expect(novo).toMatchObject({ id: A1, nome: "Treino", nutricionista_id: EU, conta_id: CONTA });
    await agenda.atualizarCalendario(CAL, { padrao: false });
    await agenda.atualizarCalendario(CAL, { slot_minutos: null, tag_padrao_id: null, nome: "Y" });
    await agenda.excluirCalendario(CAL);
    expect(daConta()).toEqual([
      { nome: "Treino", cor: "#a78bfa", padrao: true, faixa_inicio: "07:00", faixa_fim: "20:00", slot_minutos: null, conta_id: CONTA, acao: "calendario_criar" },
      { padrao: false, id: CAL, acao: "calendario_editar" },
      { nome: "Y", slot_minutos: null, tag_padrao_id: null, id: CAL, acao: "calendario_editar" },
      { id: CAL, acao: "calendario_excluir" },
    ]);
    todosPassam();
    expect(gravadas[0]).toEqual(["insert", { nome: "Treino", cor: "#a78bfa", padrao: true, faixa_inicio: "07:00", faixa_fim: "20:00", slot_minutos: null, nutricionista_id: EU, conta_id: CONTA }]);
  });

  it("tags: listar pelos donos (vazio → nem chama), as base pela ação tags_garantir (o { ok: false } lança como hoje); carregar = 1 ler e, faltando base, + a ação", async () => {
    const base = (area: string, prof = EU) => ({ id: `${area}-${prof}`, profissional_id: prof, nome: area, cor: "#94a3b8", area, base: true, ordem: 1, created_at: "", deleted_at: null });
    expect(await agenda.listarTags([])).toEqual([]);
    expect(daConta()).toEqual([]);
    h.banco = { from: () => tabela([base("treino"), base("nutricao"), base("geral")]) };
    expect(await agenda.carregarTagsDaAgenda(EU, [OUTRA, EU])).toHaveLength(3);
    expect(daConta()).toEqual([{ acao: "ler", itens: [{ donos: [EU, OUTRA], q: "agenda_tags" }] }]);
    h.corpos = [];
    h.banco = { from: () => tabela([base("treino")]), rpc: () => ({ data: { ok: true, tags: [base("treino"), base("nutricao"), base("geral")] }, error: null }) };
    expect(await agenda.carregarTagsDaAgenda(EU, [])).toHaveLength(3);
    expect(daConta().map((c) => c.acao)).toEqual(["ler", "tags_garantir"]);
    todosPassam();
    h.banco = { rpc: () => ({ data: { ok: false, erro: "sem_acesso" }, error: null }) };
    await expect(agenda.garantirTags()).rejects.toThrow("sem_acesso");
  });

  it("tag criar/editar/excluir: o dono nunca vai; o erro com a FRASE de hoje (o mensagemErroTag devolve igual)", async () => {
    h.banco = { from: () => tabela() };
    const t = await agenda.criarTag({ profissional_id: OUTRA, nome: "Reunião", cor: "#123456", area: "geral" });
    expect(t).toMatchObject({ id: A1, nome: "Reunião", profissional_id: EU });
    await agenda.atualizarTag(A1, { nome: "R2" });
    await agenda.excluirTag(A1);
    expect(daConta()).toEqual([
      { nome: "Reunião", cor: "#123456", area: "geral", acao: "tag_criar" },
      { nome: "R2", id: A1, acao: "tag_editar" },
      { id: A1, acao: "tag_excluir" },
    ]);
    todosPassam();
    const casos: Array<[{ code: string; message: string }, string]> = [
      [{ code: "23505", message: 'duplicate key value violates unique constraint "agenda_tags_nome_uq"' }, "Você já tem uma tag com esse nome"],
      [{ code: "P0001", message: "tag_base_nao_exclui" }, "As tags prontas (Treino, Nutrição e Geral) não podem ser excluídas"],
      [{ code: "P0001", message: "tag_base_area_fixa" }, "A área das tags prontas não muda"],
      [{ code: "42501", message: "new row violates row-level security policy for table \"agenda_tags\"" }, "Você não pode mudar as tags de outro profissional"],
      [{ code: "23514", message: 'violates check constraint "agenda_tags_nome"' }, "O nome precisa ter de 1 a 40 caracteres"],
    ];
    for (const [erro, frase] of casos) {
      h.banco = { from: () => ({ ...tabela(), update: () => ({ eq: () => ({ select: async () => ({ data: null, error: erro }) }) }) }) };
      const e = await agenda.excluirTag(A1).catch((x: unknown) => x);
      expect(mensagemErroTag((e as Error).message), erro.message).toBe(frase);
      // hoje a tela recebia a mensagem do banco e o mensagemErroTag dava ESTA frase
      expect(mensagemErroTag(erro.message), "a frase de hoje").toBe(frase);
    }
  });

  it("agendamentos: a janela (de/ate ISO, a conta) desvirada; criar/editar sem o dono (o servidor põe o do calendário); excluir", async () => {
    const gravadas: unknown[][] = [];
    h.banco = {
      from: (t: string) => (t === "calendarios" ? tabela([{ nutricionista_id: OUTRA }]) : tabela([{ id: "b" }, { id: "a" }], gravadas)),
    };
    const de = new Date("2026-10-12T03:00:00.000Z");
    const ate = new Date("2026-10-19T03:00:00.000Z");
    expect((await agenda.listarAgendamentos(de, ate, EU, CONTA)).map((a) => a.id)).toEqual(["a", "b"]);
    const registro = {
      nutricionista_id: OUTRA, calendario_id: CAL, paciente_id: null, titulo: "Consulta", inicio: de.toISOString(), fim: ate.toISOString(), dia_inteiro: false,
      status: "agendado", confirmacao: "a_confirmar", observacao: null, modulo: "nutricao", tag_id: null, conta_id: CONTA,
    };
    const criada = await agenda.criarAgendamento(registro);
    expect(criada).toMatchObject({ id: A1, nutricionista_id: OUTRA, titulo: "Consulta" });
    await agenda.atualizarAgendamento(A1, { calendario_id: CAL, titulo: "Nova", modulo: "nutricao", nutricionista_id: OUTRA });
    await agenda.excluirAgendamento(A1);
    const [ler, criar, editar, excluir] = daConta();
    expect(ler).toEqual({ acao: "ler", itens: [{ de: de.toISOString(), ate: ate.toISOString(), conta: CONTA, q: "agenda_agendamentos" }] });
    const { nutricionista_id: _dono, ...semDono } = registro;
    expect(criar).toEqual({ ...semDono, acao: "agendamento_criar" });
    expect(editar).toEqual({ calendario_id: CAL, titulo: "Nova", modulo: "nutricao", id: A1, acao: "agendamento_editar" });
    expect(excluir).toEqual({ id: A1, acao: "agendamento_excluir" });
    todosPassam();
    expect(gravadas[0][1]).toMatchObject({ nutricionista_id: OUTRA, calendario_id: CAL });
  });

  it("bloqueios, travas e regras: as leituras com a conta (os futuros com o agora da tela); criar sem o dono; excluir; as regras (as 7) normalizadas como hoje", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-13T12:00:00.000Z"));
    try {
      const trava = { id: A1, profissional_id: EU, calendario_id: null, dias: [1, 3], hora_inicio: "12:00:00", hora_fim: "13:00:00", motivo: null };
      h.banco = { from: (t: string) => (t === "agenda_travas" ? tabela([trava]) : t === "agenda_config" ? tabela([{ slot_minutos: 40, atende_inicio: "09:00:00", atende_fim: "17:00:00", dias: [1, 2], reagendamentos_max: 2, janela_reagendamento: "livre", desistencia: false }]) : tabela()) };
      const de = new Date("2026-10-12T03:00:00.000Z");
      const ate = new Date("2026-10-19T03:00:00.000Z");
      await agenda.listarBloqueios(de, ate, EU, CONTA);
      await agenda.listarBloqueiosFuturos(EU, null);
      expect(await agenda.listarTravas(EU, CONTA)).toEqual([{ ...trava, hora_inicio: "12:00", hora_fim: "13:00" }]);
      expect(await agenda.lerRegras(EU)).toMatchObject({ slot_minutos: 40, atende_inicio: "09:00", janela_reagendamento: "livre", desistencia: false, configurada: true });
      await agenda.criarBloqueio({ nutricionista_id: OUTRA, conta_id: CONTA, calendario_id: null, inicio: de.toISOString(), fim: ate.toISOString(), motivo: "Férias" });
      await agenda.criarTrava({ profissional_id: OUTRA, conta_id: null, calendario_id: CAL, dias: [1, 3], hora_inicio: "12:00", hora_fim: "13:00", motivo: null });
      await agenda.excluirBloqueio(A1);
      await agenda.excluirTrava(A1);
      const regras = { slot_minutos: 30, atende_inicio: "08:00", atende_fim: "18:00", dias: [1, 2, 3, 4, 5], reagendamentos_max: 1, janela_reagendamento: "mes" as const, desistencia: true };
      expect(await agenda.salvarRegras(OUTRA, regras)).toMatchObject({ ...regras, configurada: true });
      expect(daConta()).toEqual([
        { acao: "ler", itens: [{ de: de.toISOString(), ate: ate.toISOString(), conta: CONTA, q: "agenda_bloqueios" }] },
        { acao: "ler", itens: [{ agora: "2026-10-13T12:00:00.000Z", q: "agenda_bloqueios_futuros" }] },
        { acao: "ler", itens: [{ conta: CONTA, q: "agenda_travas" }] },
        { acao: "ler", itens: [{ profissional: EU, q: "agenda_regras" }] },
        { conta_id: CONTA, calendario_id: null, inicio: de.toISOString(), fim: ate.toISOString(), motivo: "Férias", acao: "bloqueio_criar" },
        { conta_id: null, calendario_id: CAL, dias: [1, 3], hora_inicio: "12:00", hora_fim: "13:00", motivo: null, acao: "trava_criar" },
        { id: A1, acao: "bloqueio_excluir" },
        { id: A1, acao: "trava_excluir" },
        { ...regras, acao: "regras_salvar" },
      ]);
      todosPassam();
    } finally {
      vi.useRealTimers();
    }
  });

  it("horários do dia, alunos da Agenda, o aluno do ?aluno=, os compromissos e o pacote: os params da lib; o { ok: false } lança como hoje", async () => {
    h.banco = {
      from: () => tabela([{ id: A1, nome: "Aluno" }]),
      rpc: (nome: string) => {
        if (nome === "agenda_horarios") return { data: { ok: true, slots: [{ inicio: "a", fim: "b", estado: "livre" }], regras: { slot_minutos: 30, slot_calendario: 45 } }, error: null };
        if (nome === "aluno_compromissos") return { data: { paciente_id: A1, personal_id: null, nutricionista_id: EU, consultas: [], pacotes: [] }, error: null };
        return { data: { ok: false, erro: "nao_responsavel" }, error: null };
      },
    };
    const hr = await agenda.horariosDoDia(CAL, "2026-10-14", 50, null);
    expect(hr).toMatchObject({ slots: [{ inicio: "a", fim: "b", estado: "livre" }], slotCalendario: 45 });
    expect(await agenda.listarAlunosDaAgenda(CONTA, EU)).toEqual([{ id: A1, nome: "Aluno" }]);
    expect(await agenda.buscarAluno(A1)).toEqual({ id: A1, nome: "Aluno" });
    expect(await agenda.compromissosDoAluno(A1)).toEqual({ paciente_id: A1, personal_id: null, nutricionista_id: EU, consultas: [], pacotes: [] });
    await expect(agenda.definirPacote(A1, OUTRA, 4, "2026-10-01")).rejects.toThrow("nao_responsavel");
    expect(daConta()).toEqual([
      { acao: "ler", itens: [{ calendario: CAL, dia: "2026-10-14", duracao: 50, q: "agenda_horarios" }] },
      { acao: "ler", itens: [{ conta: CONTA, q: "agenda_alunos" }] },
      { acao: "ler", itens: [{ id: A1, q: "agenda_aluno" }] },
      { acao: "ler", itens: [{ aluno: A1, q: "aluno_compromissos" }] },
      { aluno: A1, profissional: OUTRA, total: 4, mes_inicio: "2026-10-01", acao: "pacote_definir" },
    ]);
    todosPassam();
    h.corpos = [];
    h.banco = { rpc: () => ({ data: { ok: false, erro: "calendario_inexistente" }, error: null }) };
    await expect(agenda.horariosDoDia(CAL, "2026-10-14", null, A1)).rejects.toThrow("calendario_inexistente");
    expect(daConta()[0]).toEqual({ acao: "ler", itens: [{ calendario: CAL, dia: "2026-10-14", ignorar: A1, q: "agenda_horarios" }] });
  });

  it("a série da tela: a Agenda abre com 1 `ler` (os calendários, as 2 janelas, os bloqueios, os futuros, as travas, as regras, os alunos e a equipe do dono) + 1 das tags; 0 ação", async () => {
    const base = (area: string) => ({ id: `t-${area}`, profissional_id: EU, nome: area, cor: "#94a3b8", area, base: true, ordem: 1, created_at: "", deleted_at: null });
    h.banco = {
      from: (t: string) => (t === "calendarios" ? tabela([{ id: CAL, nutricionista_id: EU }]) : t === "agenda_tags" ? tabela([base("treino"), base("nutricao"), base("geral")]) : tabela()),
      rpc: () => ({ data: { ok: true, conta: { id: CONTA, nome: "Conta" }, membros: [], convites: [] }, error: null }),
    };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const ancora = new Date("2026-10-13T12:00:00.000Z");
    const { result } = renderHook(() => {
      const ctx = useContextoAgenda();
      return useDadosAgenda(ctx, "semana", ancora, new Set());
    }, { wrapper });
    await waitFor(() => expect(result.current.tagsQ.isSuccess).toBe(true));
    const lotes = daConta();
    expect(lotes.map((c) => c.acao)).toEqual(["ler", "ler"]);
    expect((lotes[0].itens as Array<{ q: string }>).map((i) => i.q).sort()).toEqual([
      "agenda_agendamentos", "agenda_agendamentos", "agenda_alunos", "agenda_bloqueios", "agenda_bloqueios_futuros", "agenda_calendarios", "agenda_regras",
      "agenda_travas", "equipe_da_conta",
    ]);
    expect((lotes[1].itens as Array<{ q: string }>).map((i) => i.q)).toEqual(["agenda_tags"]);
    todosPassam();
  });
});

// ───────────────────────── a Agenda do aluno ─────────────────────────
describe("hml-21b — app › Perfil › Agenda (src/app-aluno/perfil/agenda/api.ts) pela conta", () => {
  it("as regras e os horários pelo `ler` (a janela só se a tela mandou); as 4 ações com o agendamento/profissional e o início", async () => {
    h.banco = { rpc: (nome: string) => (nome === "minhas_regras_agenda" ? { data: [{ profissional_id: OUTRA, paciente_id: A1, papel: "nutricionista", regras: {}, tem_calendario: true }], error: null }
      : nome === "aluno_agenda_horarios" ? { data: { janela: { de: "2026-10-01", ate: null }, horarios: [{ inicio: "x", fim: "y" }] }, error: null }
        : { data: { ok: true }, error: null }) };
    expect(await doAluno.minhasRegrasAgenda()).toMatchObject([{ profissional_id: OUTRA, papel: "nutricionista", tem_calendario: true }]);
    expect(await doAluno.horariosParaReagendar(A1)).toEqual({ janela: { de: "2026-10-01", ate: null }, horarios: [{ inicio: "x", fim: "y" }] });
    await doAluno.horariosParaMarcar(OUTRA, "2026-11-01", "2026-11-30");
    expect(await doAluno.confirmarConsulta(A1)).toEqual({ ok: true });
    await doAluno.desistirConsulta(A1);
    await doAluno.reagendarConsulta(A1, "2026-10-20T13:00:00+00:00");
    await doAluno.marcarConsulta(OUTRA, "2026-10-20T13:00:00+00:00");
    expect(daConta()).toEqual([
      { acao: "ler", itens: [{ q: "minhas_regras_agenda" }] },
      { acao: "ler", itens: [{ agendamento: A1, q: "aluno_agenda_horarios" }] },
      { acao: "ler", itens: [{ profissional: OUTRA, de: "2026-11-01", ate: "2026-11-30", q: "aluno_agenda_horarios" }] },
      { agendamento: A1, acao: "agenda_confirmar" },
      { agendamento: A1, acao: "agenda_desistir" },
      { agendamento: A1, inicio: "2026-10-20T13:00:00+00:00", acao: "agenda_reagendar" },
      { profissional: OUTRA, inicio: "2026-10-20T13:00:00+00:00", acao: "agenda_marcar" },
    ]);
    todosPassam();
  });

  it("o erro: o { ok: false, erro } da função → ErroAgenda com ele; o raise (agendamento_inexistente) e a rede → o código; sem internet antes de chamar", async () => {
    h.banco = { rpc: () => ({ data: { ok: false, erro: "horario_ocupado" }, error: null }) };
    await expect(doAluno.marcarConsulta(OUTRA, "2026-10-20T13:00:00+00:00")).rejects.toMatchObject({ codigo: "horario_ocupado" });
    h.banco = { rpc: () => ({ data: null, error: { code: "P0001", message: "agendamento_inexistente" } }) };
    const e = await doAluno.confirmarConsulta(A1).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(doAluno.ErroAgenda);
    expect(doAluno.mensagemErroAgenda(e)).toBe("Esta consulta não está mais na sua agenda.");
    const l = await doAluno.horariosParaReagendar(A1).catch((x: unknown) => x);
    expect(l).toMatchObject({ codigo: "agendamento_inexistente" });
    h.banco = { rpc: () => ({ data: null, error: { code: "XX000", message: "boom" } }) };
    expect(doAluno.mensagemErroAgenda(await doAluno.minhasRegrasAgenda().catch((x: unknown) => x))).toBe("Não deu certo agora. Tente de novo.");
    h.corpos = [];
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await expect(doAluno.confirmarConsulta(A1)).rejects.toMatchObject({ codigo: "sem_internet" });
    await expect(doAluno.minhasRegrasAgenda()).rejects.toMatchObject({ codigo: "sem_internet" });
    expect(h.corpos).toEqual([]);
  });
});

// ───────────────────────── os Alunos e o Dashboard ─────────────────────────
describe("hml-21b — Painel › Alunos (src/painel/alunos/api.ts e novosPorMes.ts) e o buscarEquipe pela conta", () => {
  const LISTA = { ok: true, total: 1, itens: [], eu: { id: EU, dono: true }, conta: { id: CONTA } };
  it("listarAlunos/exportação/seletor: a alunos_da_conta com a conta, os filtros, o offset e o limite; as páginas de 500 num lote SÓ delas", async () => {
    const chamadas: unknown[] = [];
    h.banco = { rpc: (nome: string, args?: Record<string, unknown>) => (chamadas.push([nome, args]), { data: LISTA, error: null }) };
    await Promise.all([alunos.listarAlunos(CONTA, FILTROS_PADRAO, 0, 20), alunos.listarAlunos(CONTA, FILTROS_PADRAO, 0, 0), alunos.paginaDaExportacao(CONTA, FILTROS_PADRAO, 0, 500)]);
    const lotes = daConta();
    // as 2 da tela (a lista e o número do menu) numa ida; a exportação (500) sozinha
    expect(lotes.map((c) => (c.itens as unknown[]).length).sort()).toEqual([1, 2]);
    expect(chamadas).toContainEqual(["alunos_da_conta", { p_conta: CONTA, p_filtros: { situacao: "ativos" }, p_offset: 0, p_limite: 20 }]);
    expect(chamadas).toContainEqual(["alunos_da_conta", { p_conta: CONTA, p_filtros: { situacao: "ativos", exportar: "true" }, p_offset: 0, p_limite: 500 }]);
    todosPassam();
    h.corpos = [];
    await alunos.buscarAlunosDoSeletor(CONTA, "  Zé ", "todos", 20, true);
    expect(daConta()).toEqual([{ acao: "ler", itens: [{ conta: CONTA, filtros: { situacao: "todos", q: "Zé", exportar: "true" }, offset: 0, limite: 20, q: "alunos_da_conta" }] }]);
    todosPassam();
  });

  it("o aluno do seletor (o CPF só com o comCpf), os convites, os pendentes, os novos por mês e a equipe: os params da lib", async () => {
    h.banco = {
      from: () => tabela([{ id: A1, nome: "Ana", ativo: true, acesso_bloqueado_em: null, user_id: null, conta_excluida_em: null }]),
      rpc: (nome: string) => (nome === "alunos_novos_por_mes" ? { data: { ok: true, mes_atual: "2026-10", meses: [{ mes: "2026-10", novos: 2 }] }, error: null }
        : nome === "equipe_da_conta" ? { data: { ok: true, conta: { id: CONTA, nome: "Conta" }, membros: [], convites: [] }, error: null } : { data: [], error: null }),
    };
    expect(await alunos.alunoDoSeletorPorId(CONTA, A1)).toMatchObject({ id: A1, nome: "Ana", cpf: null });
    await alunos.alunoDoSeletorPorId(CONTA, A1, true);
    expect(await alunos.listarConvites(CONTA)).toEqual([]);
    expect(await alunos.listarPendentes(CONTA)).toEqual([]);
    expect(await buscarNovosPorMes(CONTA)).toMatchObject({ mesAtual: "2026-10", doMes: 2 });
    expect(await buscarEquipe(CONTA)).toBeTruthy();
    expect(daConta()).toEqual([
      { acao: "ler", itens: [{ conta: CONTA, id: A1, q: "aluno_do_seletor" }] },
      { acao: "ler", itens: [{ conta: CONTA, id: A1, com_cpf: true, q: "aluno_do_seletor" }] },
      { acao: "ler", itens: [{ conta: CONTA, q: "aluno_convites" }] },
      { acao: "ler", itens: [{ conta: CONTA, q: "alunos_pendentes" }] },
      { acao: "ler", itens: [{ conta: CONTA, meses: 6, q: "alunos_novos_por_mes" }] },
      { acao: "ler", itens: [{ conta: CONTA, q: "equipe_da_conta" }] },
    ]);
    todosPassam();
  });

  it("o erro: o { ok: false, erro } da RPC com o código dela (como hoje); o banco/a função → erro_interno com o código no extra; sem internet antes", async () => {
    h.banco = { rpc: () => ({ data: { ok: false, erro: "sem_acesso" }, error: null }) };
    await expect(alunos.listarAlunos(CONTA, FILTROS_PADRAO, 0, 20)).rejects.toMatchObject({ codigo: "sem_acesso" });
    await expect(buscarEquipe(CONTA)).rejects.toMatchObject({ codigo: "sem_acesso" });
    h.banco = { rpc: () => ({ data: null, error: { code: "42501", message: "permission denied" } }) };
    const e = await alunos.listarPendentes(CONTA).catch((x: unknown) => x);
    expect(e).toMatchObject({ codigo: "erro_interno", extra: { codigo: "sem_acesso" } });
    expect(JSON.stringify(e)).not.toContain("permission");
    await expect(buscarEquipe(CONTA)).rejects.toMatchObject({ codigo: "erro_interno", extra: { codigo: "sem_acesso" } });
    h.corpos = [];
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await expect(alunos.listarAlunos(CONTA, FILTROS_PADRAO, 0, 20)).rejects.toMatchObject({ codigo: "sem_internet" });
    await expect(alunos.alunoDoSeletorPorId(CONTA, A1)).rejects.toMatchObject({ codigo: "sem_internet" });
    await expect(buscarEquipe(CONTA)).rejects.toMatchObject({ codigo: "sem_internet" });
    expect(h.corpos).toEqual([]);
  });
});
