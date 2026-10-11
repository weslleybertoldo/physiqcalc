// Physiq W-P (Task 8b, ponto 2 — decisão do Weslley 10/10/2026) — automaticas-fila (banco principal). Esvazia a fila
// {schema}.automaticas_fila (migrations/20261011030000_wp_fila_automaticas.sql): para cada aluno pendente, a cobrança automática no
// Mercado Pago passa a cobrar o mensalidade_valor ATUAL dele (o valor não fica na fila: o último ganha) — o MESMO PUT /preapproval da
// pagamentos-aluno (_shared/planos-automatica-mp.ts), com a mesma credencial do schema (_shared/cobranca-mp.ts › credencialDoSchema).
//   feito     atualizada | igual | sem_automatica → feito_em + resultado
//   de_novo   falhou antes da 24ª → tentativas + 1, proxima_em + 1 hora, erro (só o código: mp_<status>[:<error do MP>])
//   desistiu  a 24ª falha seguida (1 dia) → feito_em, resultado 'desistiu', log.erro e o aviso ao dono no sino — 1 por conta por
//             rodada, com os nomes juntos (textoDoAvisoDaFila) — e avisado_em
// Antes de comparar, a assinatura é lida no MP (o espelho pode estar velho); depois do PUT, o valor do aluno é lido de novo: mudou no
// meio (o dono salvou outra vez) → a pendência volta para a fila e o MP recebe o valor novo na rodada seguinte. A pendência só fecha
// se ninguém a recolocou na fila enquanto a rodada trabalhava (o proxima_em ainda é o que a rodada leu).
// Até 50 pendentes prontas por rodada (as mais antigas primeiro), 5 por vez; sobrou (ou voltou para a fila) → automaticas_disparar no
// fim (o pg_net chama a próxima rodada).
//
// POST, headers: x-espelho-segredo (o cabeçalho do contrato hml-16c: o mesmo em todos os segredos entre servidores).
// Corpo: { schema: "public" | "staging" } (outro → 400). Quem chama: {schema}.automaticas_disparar() pelo pg_net — logo depois que a
// pagamentos-aluno enfileira e de hora em hora (pg_cron automaticas-fila-<schema>, minuto 7).
// Segredo (S9): RECEBE o do Vault physiq_automaticas_fila_segredo; aqui fica só o hash, em SEGREDO_AUTOMATICAS_FILA_ACEITOS
// (_shared/segredo-servidor.ts). Sem ou errado → 401 (o log não leva o recebido). Gerar/trocar: scripts/segredos/servidor.py
// automaticas_fila. + MP_ACCESS_TOKEN_PROD (public) / MP_ACCESS_TOKEN_TEST (staging): sem o do schema → 500 nao_configurada, antes de
// mexer na fila.
// verify_jwt = false. Publicar: scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions automaticas-fila false
// Log: _shared/log.ts — sem nome, valor ou corpo do MP (do MP, só o status e os códigos); o catch final avisa (log.excecao) e devolve
// 500; a resposta leva só ids e destinos.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { criarLog } from "../_shared/log.ts";
import { credencialDoSchema, tokenMp, type Credencial } from "../_shared/cobranca-mp.ts";
import { avisar, carregarMatricula, linkDoAlunoNoPainel, recebedor, type Matricula } from "../_shared/financeiro-mp.ts";
import type { Schema } from "../_shared/financeiro-regras.ts";
import {
  MAX_TENTATIVAS,
  destinoDoResultado,
  mesmoValor,
  proximaTentativaEm,
  textoDoAvisoDaFila,
  type ResultadoValor,
} from "../_shared/planos-automatica.ts";
import { assinaturaComoNoMp, trocarValorDaAutomatica, type AssinaturaDoAluno, type TrocaDoValor } from "../_shared/planos-automatica-mp.ts";
import { segredoAceito } from "../_shared/segredo-servidor.ts";
import { ORCAMENTO_MS, prazo, type Prazo } from "../_shared/tempo.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SCHEMAS: Schema[] = ["public", "staging"];
/** Por rodada: as 50 pendentes prontas mais antigas, 5 por vez (sem rajada no MP; a rodada cabe no tempo). */
const POR_RODADA = 50;
const POR_VEZ = 5;
/** Com menos que isto sobrando do orçamento da rodada não começa outro grupo (a sobra fica pronta, intacta, para a próxima). */
const MINIMO_POR_GRUPO_MS = 30_000;
/** Para onde o aviso de vários alunos leva (o de 1 aluno leva ao financeiro dele). */
const LINK_DAS_MENSALIDADES = "/painel/financeiro?aba=mensalidades";
const log = criarLog("automaticas-fila", { avisar: avisarErro });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface Pendencia {
  id: number;
  paciente_id: string;
  conta_id: string | null;
  motivo: "plano" | "aluno";
  tentativas: number;
  /** como o banco devolveu: a rodada só grava se ainda for este (ninguém recolocou a pendência na fila no meio) */
  proxima_em: string;
}

/** feito · de_novo · desistiu (destinoDoResultado) · voltou (o valor mudou no meio: de novo na fila, já pronta) · mexida (alguém
 *  recolocou a pendência na fila no meio: fica, com o valor novo) · nao_gravada (o banco não gravou: fica como estava) */
type Destino = "feito" | "de_novo" | "desistiu" | "voltou" | "mexida" | "nao_gravada";

interface Saida {
  id: number;
  destino: Destino;
  resultado?: ResultadoValor;
}

interface Rodada {
  db: SupabaseClient;
  schema: Schema;
  credencial: Credencial;
  prazo: Prazo;
}

/** A assinatura mais recente do aluno (a mesma leitura do assinaturaDe da pagamentos-aluno). Erro do banco lança. */
async function assinaturaDoAluno(db: SupabaseClient, pacienteId: string): Promise<AssinaturaDoAluno | null> {
  const { data, error } = await db.from("aluno_assinaturas").select("id, mp_preapproval_id, status, valor, payload")
    .eq("paciente_id", pacienteId).order("criado_em", { ascending: false }).limit(1);
  if (error) throw error;
  return ((data ?? []) as AssinaturaDoAluno[])[0] ?? null;
}

/** O valor do aluno agora (o que o gatilho do plano deixou). Erro do banco lança. */
async function valorAgora(db: SupabaseClient, pacienteId: string): Promise<unknown> {
  const { data, error } = await db.from("pacientes").select("mensalidade_valor").eq("id", pacienteId).maybeSingle();
  if (error) throw error;
  return (data as { mensalidade_valor: unknown } | null)?.mensalidade_valor ?? null;
}

/** O código da falha do MP para a coluna erro: mp_<status>[:<error do MP>] — nunca o corpo nem a mensagem. */
function erroDoMp(status: number | null, mpErro: unknown): string {
  const codigo = typeof mpErro === "string" && /^[A-Za-z0-9_.-]{1,40}$/.test(mpErro) ? `:${mpErro}` : "";
  return `mp_${status ?? 0}${codigo}`;
}

/** Uma pendência: o valor atual do aluno vai para a automática dele no MP. Nunca lança (cada saída já registrada). */
async function processar(r: Rodada, p: Pendencia): Promise<{ saida: Saida; aluno: Matricula | null }> {
  const ctx = { prazo: prazo(Math.min(ORCAMENTO_MS.servidor, r.prazo.restante())), log, schema: r.schema, acao: "automaticas_fila" };
  let resultado: ResultadoValor = "falhou";
  let erro: string | null = null;
  let aluno: Matricula | null = null;
  let mp: Pick<TrocaDoValor, "status" | "externo"> = { status: null, externo: {} };
  try {
    aluno = await carregarMatricula(r.db, p.paciente_id);
    if (!aluno || aluno.deleted_at) {
      resultado = "sem_automatica";
    } else {
      const a = await assinaturaComoNoMp(r.db, r.credencial, await assinaturaDoAluno(r.db, p.paciente_id), ctx);
      const t = await trocarValorDaAutomatica(r.db, r.credencial, a, Number(aluno.mensalidade_valor), ctx);
      resultado = t.resultado;
      mp = t;
      if (t.resultado === "falhou") {
        erro = erroDoMp(t.status, t.externo.mp_erro);
        log.aviso({ codigo: "fila_valor_falhou", schema: r.schema, ref: p.id, status: t.status, n: p.tentativas + 1, externo: t.externo });
      } else if (t.resultado !== "sem_automatica" && !mesmoValor(await valorAgora(r.db, p.paciente_id), aluno.mensalidade_valor)) {
        // o dono salvou de novo enquanto a rodada trabalhava: volta para a fila (pronta) e a próxima rodada leva o valor novo ao MP
        const { error: erroFila } = await r.db.rpc("automaticas_enfileirar", { p_pacientes: [p.paciente_id], p_motivo: p.motivo });
        if (erroFila) throw erroFila;
        return { saida: { id: p.id, destino: "voltou", resultado }, aluno };
      }
    }
  } catch (e) {
    // erro nosso (banco, código): a tentativa conta como falha (volta em 1 hora) e o Weslley é avisado
    log.excecao(e, { codigo: "pendencia_falhou", schema: r.schema, ref: p.id, n: p.tentativas + 1 });
    resultado = "falhou";
    erro = "erro_interno";
  }
  const destino = destinoDoResultado(resultado, p.tentativas);
  const agora = new Date().toISOString();
  const patch = destino === "feito"
    ? { feito_em: agora, resultado, erro: null }
    : destino === "de_novo"
    ? { tentativas: p.tentativas + 1, proxima_em: proximaTentativaEm(Date.now()), erro }
    : { tentativas: p.tentativas + 1, feito_em: agora, resultado: "desistiu", erro };
  try {
    const { data, error } = await r.db.from("automaticas_fila").update(patch).eq("id", p.id).is("feito_em", null)
      .eq("proxima_em", p.proxima_em).select("id");
    if (error) throw error;
    if (!(data ?? []).length) return { saida: { id: p.id, destino: "mexida", resultado }, aluno };
  } catch (e) {
    log.excecao(e, { codigo: "pendencia_nao_gravada", schema: r.schema, ref: p.id });
    return { saida: { id: p.id, destino: "nao_gravada", resultado }, aluno };
  }
  if (destino === "desistiu") {
    log.erro({ codigo: "fila_valor_desistiu", schema: r.schema, ref: p.id, n: p.tentativas + 1, status: mp.status, externo: mp.externo });
  }
  return { saida: { id: p.id, destino, resultado }, aluno };
}

/** O aviso ao dono das que desistiram: 1 por dono (por conta) por rodada, com os nomes juntos; marca avisado_em. → quantos avisos. */
async function avisarDonos(r: Rodada, desistiram: Array<{ id: number; aluno: Matricula }>): Promise<number> {
  const porDono = new Map<string, Array<{ id: number; aluno: Matricula }>>();
  for (const d of desistiram) {
    const dono = recebedor(d.aluno);
    if (dono) porDono.set(dono, [...(porDono.get(dono) ?? []), d]);
  }
  let avisos = 0;
  for (const [dono, itens] of porDono) {
    const link = itens.length === 1 ? linkDoAlunoNoPainel(itens[0].aluno) : LINK_DAS_MENSALIDADES;
    if (!(await avisar(r.db, dono, "geral", textoDoAvisoDaFila(itens.map((i) => i.aluno.nome)), link, log, r.schema))) continue;
    avisos++;
    const { error } = await r.db.from("automaticas_fila").update({ avisado_em: new Date().toISOString() }).in("id", itens.map((i) => i.id));
    if (error) log.excecao(error, { codigo: "avisado_nao_gravado", schema: r.schema, n: itens.length });
  }
  return avisos;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "metodo" }, 405);
  // a rodada inteira em segundo plano (ninguém espera): o mesmo orçamento do lote da espelho-enviar
  const orcamento = prazo(ORCAMENTO_MS.loteEspelho);
  const via = await segredoAceito(req.headers.get("x-espelho-segredo"), "SEGREDO_AUTOMATICAS_FILA");
  if (!via) {
    log.aviso({ codigo: "segredo_recusado", acao: "automaticas_fila" });
    return json({ error: "segredo_invalido" }, 401);
  }
  log.info({ codigo: "segredo_aceito", acao: "automaticas_fila", resultado: via });
  let corpo: { schema?: unknown } = {};
  try {
    corpo = (await req.json()) as { schema?: unknown };
  } catch {
    corpo = {};
  }
  // só texto (um ["staging"] viraria "staging" no String())
  const schema = (typeof corpo?.schema === "string" ? corpo.schema.toLowerCase() : "") as Schema;
  if (!SCHEMAS.includes(schema)) return json({ error: "schema_invalido" }, 400);
  const credencial = credencialDoSchema(schema);
  if (!tokenMp(credencial)) {
    log.erro({ codigo: "sem_configuracao", schema, acao: "automaticas_fila" });
    return json({ error: "nao_configurada" }, 500);
  }
  const db = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" }, auth: { persistSession: false } });
  const r: Rodada = { db, schema, credencial, prazo: orcamento };

  try {
    const { data: fila, error: erroFila } = await db.from("automaticas_fila").select("id, paciente_id, conta_id, motivo, tentativas, proxima_em")
      .is("feito_em", null).lt("tentativas", MAX_TENTATIVAS).lte("proxima_em", new Date().toISOString())
      .order("proxima_em", { ascending: true }).order("id", { ascending: true }).limit(POR_RODADA);
    if (erroFila) throw erroFila;
    const pendencias = (fila ?? []) as Pendencia[];
    const saidas: Saida[] = [];
    const desistiram: Array<{ id: number; aluno: Matricula }> = [];
    for (let i = 0; i < pendencias.length; i += POR_VEZ) {
      if (i > 0 && orcamento.restante() < MINIMO_POR_GRUPO_MS) {
        log.aviso({ codigo: "rodada_no_limite", schema, n: pendencias.length - i });
        break;
      }
      for (const { saida, aluno } of await Promise.all(pendencias.slice(i, i + POR_VEZ).map((p) => processar(r, p)))) {
        saidas.push(saida);
        if (saida.destino === "desistiu" && aluno) desistiram.push({ id: saida.id, aluno });
      }
    }
    const avisos = desistiram.length ? await avisarDonos(r, desistiram) : 0;
    // a próxima rodada: sobrou pendente pronta (a rodada cheia ou sem tempo — e andou) ou alguma voltou para a fila com o valor novo
    const andou = saidas.some((s) => s.destino === "feito" || s.destino === "de_novo" || s.destino === "desistiu");
    const voltaram = saidas.filter((s) => s.destino === "voltou").length;
    if (((pendencias.length === POR_RODADA || saidas.length < pendencias.length) && andou) || voltaram > 0) {
      const { error: erroDisparo } = await db.rpc("automaticas_disparar");
      if (erroDisparo) log.excecao(erroDisparo, { codigo: "automaticas_disparar_falhou", schema });
    }
    log.info({ codigo: "rodada_feita", schema, acao: "automaticas_fila", n: saidas.length });
    return json({ processadas: saidas.length, resultados: saidas, avisos });
  } catch (e) {
    log.excecao(e, { schema, acao: "automaticas_fila" });
    return json({ error: "erro_interno" }, 500);
  }
});
