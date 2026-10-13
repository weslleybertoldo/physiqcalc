// Physiq hml-21b (H-43 · jeito 2, etapa 3, 13/10/2026) — as GRAVAÇÕES da Agenda pela função conta, COMO A PESSOA (c.comoPessoa — o token de
// quem chama; nenhuma chave secreta). As ações estão em _shared/conta-regras.ts → ACOES_DA_AGENDA; cada uma faz o MESMO de hoje
// (src/painel/agenda/dados.ts e src/app-aluno/perfil/agenda/api.ts no d357719): a mesma tabela/RPC, as mesmas colunas — em lista fechada
// (CORPOS_DA_21B) —, o dono do user (nunca do corpo). O RLS de hoje decide quem pode (o próprio, o dono da conta, o master).
//   agenda_garantir      o 1º acesso: a RPC nova agenda_garantir_inicio(p_conta, p_papeis, p_modulos) (as tags base e os calendários
//                        iniciais numa transação, idempotente) → { criados } (as colunas da leitura agenda_calendarios)
//   tags_garantir        as 3 tags base de quem chama: a agenda_garantir_tags de hoje → { resultado } (o { ok, tags } dela, como veio)
//   calendario_criar     calendarios (o dono = quem chama; a conta do corpo, como o { ...dados, nutricionista_id: uid, conta_id } de hoje)
//   calendario_editar    as colunas do calendário que vieram (id; o RLS: o dono do calendário, o dono da conta, o master)
//   calendario_excluir   a RPC nova agenda_excluir_calendario(p_calendario) (os agendamentos vivos e o calendário à Lixeira, juntos)
//   tag_criar            agenda_tags (profissional_id = quem chama, base = false — o criarTag de hoje)
//   tag_editar           nome/cor/área (o gatilho W2 confere as base) · tag_excluir: o deleted_at (o gatilho leva as consultas à base)
//   agendamento_criar    agendamentos: o dono = o DONO DO CALENDÁRIO (lido aqui como a pessoa — o cal.nutricionista_id da tela; o dono da
//                        conta agenda na agenda do membro pela policy "dono da conta"); o resto, as colunas da tela
//   agendamento_editar   as colunas que vieram; com o calendário, o dono do calendário (o mesmo de hoje quando ele troca de profissional)
//   agendamento_excluir  o deleted_at (Lixeira) · bloqueio_criar/excluir e trava_criar/excluir: o dono = quem chama; excluir = delete
//   regras_salvar        o upsert do agenda_config de quem chama (profissional_id = user), as 7 regras
//   agenda_confirmar|desistir|reagendar|marcar  as RPCs aluno_agenda_* de hoje (a Agenda do aluno) → { resultado }
// As RPCs devolvem o que já devolvem: o { ok: false, erro } delas vai à tela como hoje (no `resultado`); o erro do banco vira o código
// (nunca a mensagem). Excluir/editar com 0 linha (não existe, ou o RLS esconde) → nao_encontrado (o molde da hml-19; antes "dava certo").
import { COLUNAS_DA_AGENDA } from "../_shared/conta-leituras.ts";
import {
  ERROS_DA_AGENDA_DO_ALUNO, ERROS_DAS_RPCS_DA_AGENDA, ERROS_DAS_RPCS_DA_CONTA, ERROS_DAS_TAGS, lerCorpoDaAcao, type AcaoDaAgenda,
} from "../_shared/conta-regras.ts";
import { falha, naoEncontrado, recusa, type ContextoConta, type Resposta } from "./comum.ts";

const sel = (colunas: readonly string[]) => colunas.join(", ");
/** As chaves do corpo (já conferido) que vão como colunas, só as que vieram (o null também: limpa a coluna, como a tela manda). */
function colunasDe(v: Record<string, unknown>, chaves: readonly string[]): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const k of chaves) if (Object.prototype.hasOwnProperty.call(v, k)) saida[k] = v[k];
  return saida;
}
/** Só as colunas da lista fechada de uma linha que o banco devolveu (o RPC devolve a linha inteira; a tela recebe a da leitura). */
function soAsColunas(linha: unknown, colunas: readonly string[]): Record<string, unknown> {
  const o = linha && typeof linha === "object" && !Array.isArray(linha) ? (linha as Record<string, unknown>) : {};
  return Object.fromEntries(colunas.filter((k) => Object.prototype.hasOwnProperty.call(o, k)).map((k) => [k, o[k]]));
}

const CALENDARIO = ["nome", "cor", "padrao", "faixa_inicio", "faixa_fim", "slot_minutos", "tag_padrao_id"] as const;
const CONSULTA = ["calendario_id", "paciente_id", "titulo", "inicio", "fim", "dia_inteiro", "status", "confirmacao", "observacao", "modulo", "tag_id", "conta_id"] as const;
const REGRAS = ["slot_minutos", "atende_inicio", "atende_fim", "dias", "reagendamentos_max", "janela_reagendamento", "desistencia"] as const;
const RPC_DO_ALUNO = { agenda_confirmar: "aluno_agenda_confirmar", agenda_desistir: "aluno_agenda_desistir", agenda_reagendar: "aluno_agenda_reagendar", agenda_marcar: "aluno_agenda_marcar" } as const;

export async function atenderAgenda(c: ContextoConta, acao: AcaoDaAgenda): Promise<Resposta> {
  const p = lerCorpoDaAcao(acao, c.corpo);
  if (p.ok === false) return recusa(c, acao, p.erro, p.campo);
  const v = p.valores;
  switch (acao) {
    case "agenda_garantir":
      return await garantirInicio(c, v);
    case "tags_garantir":
      return await chamarRpc(c, acao, "agenda_garantir_tags", {}, ERROS_DAS_RPCS_DA_CONTA);
    case "calendario_criar":
      return await inserir(c, acao, "calendarios", { ...colunasDe(v, CALENDARIO), nutricionista_id: c.userId, conta_id: v.conta_id ?? null }, COLUNAS_DA_AGENDA.calendarios);
    case "calendario_editar":
      return await editar(c, acao, "calendarios", v.id as string, colunasDe(v, CALENDARIO), COLUNAS_DA_AGENDA.calendarios);
    case "calendario_excluir": {
      const { data, error } = await c.comoPessoa.rpc("agenda_excluir_calendario", { p_calendario: v.id });
      if (error) return falha(c, acao, error, ERROS_DAS_RPCS_DA_AGENDA);
      return { ok: true, agendamentos: typeof data === "number" ? data : 0 };
    }
    case "tag_criar":
      return await inserir(c, acao, "agenda_tags", { profissional_id: c.userId, nome: v.nome, cor: v.cor, area: v.area, base: false }, COLUNAS_DA_AGENDA.agenda_tags, ERROS_DAS_TAGS);
    case "tag_editar":
      return await editar(c, acao, "agenda_tags", v.id as string, colunasDe(v, ["nome", "cor", "area"]), COLUNAS_DA_AGENDA.agenda_tags, ERROS_DAS_TAGS);
    case "tag_excluir":
      return await apagar(c, acao, "agenda_tags", v.id as string, "suave", ERROS_DAS_TAGS);
    case "agendamento_criar":
      return await criarConsulta(c, v);
    case "agendamento_editar":
      return await editarConsulta(c, v);
    case "agendamento_excluir":
      return await apagar(c, acao, "agendamentos", v.id as string, "suave");
    case "bloqueio_criar":
      return await inserir(c, acao, "bloqueios_agenda", {
        nutricionista_id: c.userId, conta_id: v.conta_id ?? null, calendario_id: v.calendario_id ?? null, inicio: v.inicio, fim: v.fim,
        motivo: v.motivo ?? null,
      }, COLUNAS_DA_AGENDA.bloqueios_agenda);
    case "bloqueio_excluir":
      return await apagar(c, acao, "bloqueios_agenda", v.id as string, "de_vez");
    case "trava_criar":
      return await inserir(c, acao, "agenda_travas", {
        profissional_id: c.userId, conta_id: v.conta_id ?? null, calendario_id: v.calendario_id ?? null, dias: v.dias, hora_inicio: v.hora_inicio,
        hora_fim: v.hora_fim, motivo: v.motivo ?? null,
      }, COLUNAS_DA_AGENDA.agenda_travas);
    case "trava_excluir":
      return await apagar(c, acao, "agenda_travas", v.id as string, "de_vez");
    case "regras_salvar": {
      const { data, error } = await c.comoPessoa.from("agenda_config").upsert({ profissional_id: c.userId, ...colunasDe(v, REGRAS) }, { onConflict: "profissional_id" })
        .select(sel(COLUNAS_DA_AGENDA.agenda_config)).single();
      if (error) return falha(c, acao, error);
      return { ok: true, linha: data ?? null };
    }
    case "agenda_confirmar":
    case "agenda_desistir":
      return await chamarRpc(c, acao, RPC_DO_ALUNO[acao], { p_agendamento: v.agendamento }, ERROS_DA_AGENDA_DO_ALUNO);
    case "agenda_reagendar":
      return await chamarRpc(c, acao, RPC_DO_ALUNO[acao], { p_agendamento: v.agendamento, p_inicio: v.inicio }, ERROS_DA_AGENDA_DO_ALUNO);
    case "agenda_marcar":
      return await chamarRpc(c, acao, RPC_DO_ALUNO[acao], { p_profissional: v.profissional, p_inicio: v.inicio }, ERROS_DA_AGENDA_DO_ALUNO);
  }
}

/** Uma RPC de hoje, como a pessoa; o raise de propósito passa como o código; o valor volta como veio (a lib confere o ok/erro, como hoje). */
async function chamarRpc(c: ContextoConta, acao: AcaoDaAgenda, rpc: string, args: Record<string, unknown>, conhecidos: readonly string[]): Promise<Resposta> {
  const { data, error } = await c.comoPessoa.rpc(rpc, args);
  if (error) return falha(c, acao, error, conhecidos);
  return { ok: true, resultado: data ?? null };
}

/** O 1º acesso: a RPC nova (idempotente) com a conta e os papéis/módulos da conta ativa; volta os calendários criados (as colunas da leitura). */
async function garantirInicio(c: ContextoConta, v: Record<string, unknown>): Promise<Resposta> {
  const acao = "agenda_garantir";
  const { data, error } = await c.comoPessoa.rpc("agenda_garantir_inicio", { p_conta: v.conta_id ?? null, p_papeis: v.papeis ?? [], p_modulos: v.modulos ?? [] });
  if (error) return falha(c, acao, error, ERROS_DAS_RPCS_DA_AGENDA);
  const criados = (data as { criados?: unknown } | null)?.criados;
  return { ok: true, criados: Array.isArray(criados) ? criados.map((l) => soAsColunas(l, COLUNAS_DA_AGENDA.calendarios)) : [] };
}

/** insert + a volta em lista fechada (1 linha): o .insert(...).select("*").single() de hoje, com as colunas da leitura. */
async function inserir(
  c: ContextoConta, acao: AcaoDaAgenda, tabela: string, linha: Record<string, unknown>, colunas: readonly string[], conhecidos: readonly string[] = [],
): Promise<Resposta> {
  const { data, error } = await c.comoPessoa.from(tabela).insert(linha).select(sel(colunas)).single();
  if (error) return falha(c, acao, error, conhecidos);
  return { ok: true, linha: data ?? null };
}

/** update das colunas que vieram, pelo id (o RLS decide); 0 linha → nao_encontrado; nenhuma coluna → dados_invalidos (nada roda). */
async function editar(
  c: ContextoConta, acao: AcaoDaAgenda, tabela: string, id: string, patch: Record<string, unknown>, colunas: readonly string[], conhecidos: readonly string[] = [],
): Promise<Resposta> {
  if (Object.keys(patch).length === 0) return recusa(c, acao, "dados_invalidos", "campos");
  const { data, error } = await c.comoPessoa.from(tabela).update(patch).eq("id", id).select(sel(colunas));
  if (error) return falha(c, acao, error, conhecidos);
  if (!Array.isArray(data) || data.length === 0) return naoEncontrado(c, acao);
  return { ok: true, linha: data[0] };
}

/** Excluir pelo id: "suave" = o deleted_at (Lixeira, como hoje); "de_vez" = delete (o bloqueio e a trava, como hoje); 0 linha → nao_encontrado. */
async function apagar(c: ContextoConta, acao: AcaoDaAgenda, tabela: string, id: string, como: "suave" | "de_vez", conhecidos: readonly string[] = []): Promise<Resposta> {
  const t = c.comoPessoa.from(tabela);
  const busca = como === "suave" ? t.update({ deleted_at: new Date().toISOString() }) : t.delete();
  const { data, error } = await busca.eq("id", id).select("id");
  if (error) return falha(c, acao, error, conhecidos);
  if (!Array.isArray(data) || data.length === 0) return naoEncontrado(c, acao);
  return { ok: true };
}

/** O dono de uma consulta = o dono do calendário (lido como a pessoa: o calendário que ela vê — o cal da tela); não vê → null. */
async function donoDoCalendario(c: ContextoConta, acao: AcaoDaAgenda, calendario: string): Promise<{ dono: string } | Resposta> {
  const { data, error } = await c.comoPessoa.from("calendarios").select("nutricionista_id").eq("id", calendario).maybeSingle();
  if (error) return falha(c, acao, error);
  const dono = (data as { nutricionista_id?: unknown } | null)?.nutricionista_id;
  return typeof dono === "string" ? { dono } : naoEncontrado(c, acao);
}
const ehResposta = (x: { dono: string } | Resposta): x is Resposta => "ok" in x;

/** A consulta nova: o dono do calendário, as colunas da tela (o gatilho W2 acerta a tag e a área; o W20 avisa o aluno, como hoje). */
async function criarConsulta(c: ContextoConta, v: Record<string, unknown>): Promise<Resposta> {
  const acao = "agendamento_criar";
  const d = await donoDoCalendario(c, acao, v.calendario_id as string);
  if (ehResposta(d)) return d;
  return await inserir(c, acao, "agendamentos", { ...colunasDe(v, CONSULTA), nutricionista_id: d.dono }, COLUNAS_DA_AGENDA.agendamentos);
}

/** A consulta editada: as colunas que vieram; com o calendário, o dono dele (o mesmo valor quando não troca de profissional). */
async function editarConsulta(c: ContextoConta, v: Record<string, unknown>): Promise<Resposta> {
  const acao = "agendamento_editar";
  const patch = colunasDe(v, CONSULTA);
  if (typeof v.calendario_id === "string") {
    const d = await donoDoCalendario(c, acao, v.calendario_id);
    if (ehResposta(d)) return d;
    patch.nutricionista_id = d.dono;
  }
  return await editar(c, acao, "agendamentos", v.id as string, patch, COLUNAS_DA_AGENDA.agendamentos);
}
