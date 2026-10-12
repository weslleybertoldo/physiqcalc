// supabase-principal/functions/master-contas/recebimento.ts
// Physiq W2 (Task 12) — o "Desligar"/"trocar a forma" do master (master-contas › acao › tipo "recebimento"): sair de um Mercado Pago (o do
// Physiq ou o DA CONTA do personal) com cobrança automática viva CANCELA ANTES, com o OK (MENOR 7 da revisão da W1, decisão 11 do plano).
// As 3 camadas: o gatilho contas_guard_mp recusa a troca com automática viva (para todo mundo); a master_conta_acao devolve
// automaticas_ativas antes do gatilho; aqui o 409 vira a pergunta da tela e, com o OK, cada automática é cancelada com a credencial DELA
// (cancelarAssinaturasPorCredencial — o MP do Physiq pelo token do ambiente, a conta do personal pelo token decifrado) e só então a troca.
// Sem acesso ao MP da conta (revogado, desconectada, sem a MP_TOKENS_CHAVE, outra conta do MP), o master pode FORÇAR: as assinaturas que o
// Physiq não alcança ficam canceladas no Physiq (com evento), o personal é avisado para desligar no app do MP e cada aluno também (MENOR 17).
// O texto do PR: forçar sem acesso deixa a automática viva no MP do personal; passados os 7 dias de leitura, essas cobranças não dão mais
// baixa no Physiq (conta_sem_mp).
// Sem rede própria nem Deno no topo: o Vitest importa este arquivo com db e fetch falsos (src/master/masterContasRecebimento.test.ts).
// Pedido: args { modo, cancelar_automaticas?: true, forcar_sem_acesso?: true } — o banco lê só o modo (o MP da conta e a InfinitePay só o dono
// liga: modo_invalido). Respostas (status + corpo; a tela traduz o erro):
//   200 o que a master_conta_acao devolve (+ automaticas { canceladas, forcadas } quando cancelou) · 409 automaticas_ativas { alunos } (nada
//   mudou) · 502 automaticas_nao_canceladas { falhas, canceladas, sem_acesso } (o MP recusou ou não respondeu: o modo não muda) · 409
//   automaticas_sem_acesso { alunos, canceladas } (o modo não muda; de novo com forcar_sem_acesso: true) · os outros erros do banco com o
//   status de sempre (statusDoErro: modo_invalido 400, so_master 403, conta_inexistente 404…). Erro do banco lança (o catch da porta: 500).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { chaveDoAmbiente } from "../_shared/cifra-mp.ts";
import { MpIndisponivel, credencialDoSchema, type Schema } from "../_shared/cobranca-mp.ts";
import { avisar } from "../_shared/financeiro-mp.ts";
import type { Log } from "../_shared/log.ts";
import { statusDoErro } from "../_shared/master-regras.ts";
import {
  MpContaSemAcesso, cancelarAssinaturasPorCredencial, credencialDaConta, integracaoMp, marcarErro, mpContaFetch, oauthDoAmbiente,
  pacientesComAutomaticaViva, schemaTemW2, type ContextoMpConta,
} from "../_shared/mp-conta.ts";
import { emLotes, todasAsPaginas } from "../_shared/paginas.ts";
import type { Prazo } from "../_shared/tempo.ts";

/** O texto da W1 (pagamentos-aluno › prof_recebimento_salvar): a automática do aluno foi desligada de verdade no Mercado Pago. */
export const TEXTO_AUTOMATICA_DESLIGADA = "Seu profissional mudou a forma de receber: a cobrança automática no cartão foi desligada. Veja em Pagamentos.";
/** MENOR 17: forçado sem acesso — a automática pode seguir viva no MP do personal (o Physiq não alcança). */
export const TEXTO_AUTOMATICA_SEM_ACESSO = "Seu profissional mudou a forma de receber. Se o seu cartão continuar sendo cobrado pela cobrança automática, fale com o seu profissional.";
/** Decisão 11: o aviso ao dono quando o master forçou (o sino corta em 160 — cabe com até 5 dígitos). */
export function textoDoDonoSemAcesso(n: number): string {
  return `O Physiq mudou a sua forma de receber. Desligue no app do Mercado Pago as cobranças automáticas de ${n} aluno(s): o Physiq não conseguiu desligar por aqui.`;
}

const VIVAS = ["authorized", "pending", "paused"];
const MOTIVO = "master_trocou_a_forma";

export interface PedidoRecebimento {
  schema: Schema;
  /** o master que pediu (cancelada_por do forçado e o `por` do evento) */
  masterId: string;
  /** service_role no schema do ambiente */
  db: SupabaseClient;
  log: Log;
  /** o prazo do pedido (hml-14: vai em toda ida ao MP) */
  prazo: Prazo;
  /** a master_conta_acao('recebimento') COMO A PESSOA, com o args inteiro (o banco confere o master e o modo; lê só o modo) */
  noBanco: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
}
export interface RespostaRecebimento { status: number; corpo: Record<string, unknown> }

/** A ida ao banco. O gatilho contas_guard_mp (a corrida dentro da RPC: uma automática nasceu entre a conferência e a troca) lança
 *  P0001 "automaticas_ativas:<n>" — o rpc da porta não reconhece o código (tem ":" e número) e lançaria: aqui vira o mesmo erro da RPC (409,
 *  nunca 500). Qualquer outro erro do banco segue lançando. */
async function noBanco(p: PedidoRecebimento, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    return await p.noBanco(args);
  } catch (e) {
    const m = /^automaticas_ativas:(\d+)$/.exec(String((e as { message?: unknown } | null)?.message ?? ""));
    if (m) return { ok: false, erro: "automaticas_ativas", alunos: Number(m[1]) };
    throw e;
  }
}
const recusa = (r: Record<string, unknown>): RespostaRecebimento => (r.erro === "automaticas_ativas"
  ? { status: 409, corpo: { ok: false, erro: "automaticas_ativas", alunos: Number(r.alunos) || 0 } }
  : { status: statusDoErro(r.erro), corpo: r });

/** O MP da conta, com a chave da cifra e o client do OAuth do ambiente. Sem a MP_TOKENS_CHAVE o getter lança MpContaSemAcesso (o
 *  cancelamento conta como semAcesso e o MP do Physiq segue — o recado da Task 4). */
async function contextoDoMp(p: PedidoRecebimento): Promise<() => ContextoMpConta> {
  const chave = await chaveDoAmbiente();
  return () => {
    if (!chave) throw new MpContaSemAcesso("-", "nao_configurado");
    return { schema: p.schema, log: p.log, prazo: p.prazo, chave, oauth: oauthDoAmbiente(p.schema) };
  };
}

/** Decisão 11 ("revogado"): o cancelamento usa o mpFetch puro, e um token tirado no MP com a integração ainda "ativa" daria só falhas (502) até
 *  o diário marcar o erro. Antes de cancelar — só com a W2, a integração ativa e alguma automática viva NA conta do personal — o GET /users/me
 *  pelo mpContaFetch decide: 401 → renova → recusada → marcarErro (a conta vira semAcesso e o master pode forçar já); 200 de OUTRO usuário →
 *  conta_trocada. MP fora/sem prazo ou sem a chave → não decide nada (o cancelamento diz o resto). Erro do banco lança. */
async function conferirAcessoDaConta(p: PedidoRecebimento, contaId: string, ctxMp: () => ContextoMpConta): Promise<void> {
  if (!(await schemaTemW2(p.db, p.schema))) return;
  const integ = await integracaoMp(p.db, contaId);
  if (!integ || integ.status !== "ativa" || !integ.tem_acesso) return;
  const { data, error } = await p.db.from("aluno_assinaturas").select("id, pacientes!inner(conta_id)").eq("pacientes.conta_id", contaId)
    .eq("mp_collector_id", integ.mp_user_id).in("status", VIVAS).limit(1); // W2: depois do schemaTemW2
  if (error) throw error;
  if (!((data ?? []) as unknown[]).length) return;
  try {
    const ctx = ctxMp();
    const cred = await credencialDaConta(p.db, ctx, contaId);
    const eu = await mpContaFetch<{ id?: number | string }>(p.db, ctx, cred, "/users/me");
    if (eu.status === 200 && Number(eu.body?.id) !== cred.collectorId) await marcarErro(p.db, ctx, contaId, "conta_trocada");
  } catch (e) {
    if (!(e instanceof MpContaSemAcesso) && !(e instanceof MpIndisponivel)) throw e;
  }
}

/** O aviso a cada aluno (pelo login da matrícula; sem login, nenhum; 1 por pessoa). Erro do banco na leitura lança; o aviso que não grava só
 *  vai ao log (o avisar de sempre). */
async function avisarAlunos(p: PedidoRecebimento, pacienteIds: string[], texto: string): Promise<number> {
  if (!pacienteIds.length) return 0;
  const linhas = await emLotes(pacienteIds, 150, async (lote) => {
    const { data, error } = await p.db.from("pacientes").select("user_id").in("id", lote);
    if (error) throw error;
    return (data ?? []) as Array<{ user_id: string | null }>;
  });
  let n = 0;
  for (const u of new Set(linhas.map((l) => l.user_id).filter((x): x is string => !!x))) {
    if (await avisar(p.db, u, "geral", texto, "/perfil/pagamentos", p.log, p.schema)) n++;
  }
  return n;
}

/** Decisão 11 + MENOR 17: as assinaturas vivas que o Physiq NÃO alcança (com collector — a conta do personal ou outra conta do MP) dos alunos
 *  que estavam na lista ficam canceladas no Physiq (cancelada_por = o master; gravação condicional: só a que ainda está viva), 1 evento, o
 *  aviso ao dono (desligar no app do MP) e o do MENOR 17 a cada aluno. A do MP do Physiq (collector nulo) NUNCA é forçada: o Physiq alcança —
 *  se uma nasceu na corrida, o banco recusa a troca e a nova tentativa a cancela de verdade. Devolve os alunos forçados. */
async function forcarSemAcesso(p: PedidoRecebimento, contaId: string, pacienteIds: string[]): Promise<string[]> {
  if (!pacienteIds.length || !(await schemaTemW2(p.db, p.schema))) return [];
  type Viva = { id: string; paciente_id: string; payload: Record<string, unknown> | null };
  const vivas = await emLotes(pacienteIds, 150, (lote) => todasAsPaginas<Viva>((de, ate) =>
    p.db.from("aluno_assinaturas").select("id, paciente_id, payload").in("paciente_id", lote).in("status", VIVAS)
      .not("mp_collector_id", "is", null).order("id").range(de, ate))); // W2: depois do schemaTemW2
  const em = new Date().toISOString();
  const alunos = new Set<string>();
  let assinaturas = 0;
  for (const a of vivas) {
    const payload = { ...(a.payload ?? {}), cancelada_por: p.masterId, motivo_cancelamento: "sem_acesso_ao_mp_do_personal", cancelada_em: em };
    const { data, error } = await p.db.from("aluno_assinaturas").update({ status: "cancelled", payload }).eq("id", a.id).in("status", VIVAS)
      .select("id");
    if (error) throw error;
    if (!((data ?? []) as unknown[]).length) continue;
    assinaturas++;
    alunos.add(a.paciente_id);
  }
  if (!assinaturas) return [];
  const { error: ee } = await p.db.from("conta_eventos").insert({ conta_id: contaId, tipo: "outro",
    depois: { w2: "forcou_sem_acesso", n: alunos.size, assinaturas }, por: p.masterId });
  if (ee) throw ee;
  p.log.aviso({ codigo: "mp_forcou_sem_acesso", schema: p.schema, acao: "recebimento", ref: contaId, n: alunos.size });
  const { data: c, error: ec } = await p.db.from("contas").select("dono_id").eq("id", contaId).maybeSingle();
  if (ec) throw ec;
  await avisar(p.db, (c as { dono_id: string | null } | null)?.dono_id, "geral", textoDoDonoSemAcesso(alunos.size), "/painel/configuracoes/recebimento",
    p.log, p.schema);
  await avisarAlunos(p, [...alunos], TEXTO_AUTOMATICA_SEM_ACESSO);
  return [...alunos];
}

/** A troca da forma de receber pelo master (ver o topo). */
export async function trocarRecebimento(p: PedidoRecebimento, contaId: string, args: Record<string, unknown>): Promise<RespostaRecebimento> {
  const r = await noBanco(p, args);
  if (r.ok !== false) return { status: 200, corpo: r };
  if (r.erro !== "automaticas_ativas" || args.cancelar_automaticas !== true) return recusa(r);
  // o OK: cada automática viva com a credencial DELA (a função não lança por causa do MP — MENOR 11)
  const ids = await pacientesComAutomaticaViva(p.db, contaId);
  const ctxMp = await contextoDoMp(p);
  if (ids.length) await conferirAcessoDaConta(p, contaId, ctxMp);
  const t = await cancelarAssinaturasPorCredencial(p.db, { schema: p.schema, log: p.log, prazo: p.prazo }, ctxMp, credencialDoSchema(p.schema),
    ids, MOTIVO);
  const vivos = new Set(await pacientesComAutomaticaViva(p.db, contaId));
  // quem ficou sem nenhuma automática viva foi desligado DE VERDADE: o aviso sai já (numa nova tentativa ele não estaria mais na lista)
  await avisarAlunos(p, ids.filter((id) => !vivos.has(id)), TEXTO_AUTOMATICA_DESLIGADA);
  if (t.falhas) {
    p.log.erro({ codigo: "automaticas_nao_canceladas", schema: p.schema, acao: "recebimento", ref: contaId, n: t.falhas });
    return { status: 502, corpo: { ok: false, erro: "automaticas_nao_canceladas", falhas: t.falhas, canceladas: t.canceladas, sem_acesso: t.semAcesso } };
  }
  let forcados: string[] = [];
  if (t.semAcesso) {
    if (args.forcar_sem_acesso !== true) {
      p.log.aviso({ codigo: "automaticas_sem_acesso", schema: p.schema, acao: "recebimento", ref: contaId, n: t.semAcesso });
      return { status: 409, corpo: { ok: false, erro: "automaticas_sem_acesso", alunos: t.semAcesso, canceladas: t.canceladas } };
    }
    forcados = await forcarSemAcesso(p, contaId, ids.filter((id) => vivos.has(id)));
  }
  const r2 = await noBanco(p, args);
  if (r2.ok === false) return recusa(r2);
  p.log.info({ codigo: "master_trocou_a_forma", schema: p.schema, acao: "recebimento", ref: contaId, n: t.canceladas });
  return { status: 200, corpo: { ...r2, automaticas: { canceladas: t.canceladas, forcadas: forcados.length } } };
}
