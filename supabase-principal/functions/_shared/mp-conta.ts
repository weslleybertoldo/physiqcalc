// supabase-principal/functions/_shared/mp-conta.ts
// Physiq W2 — o Mercado Pago DA CONTA do personal no servidor: ler a integração (nunca devolve token), montar a credencial (token decifrado
// só em memória), trocar o code (OAuth), renovar (o refresh GIRA: trava de 2 min + gravação condicional), chamar o MP com 401 → /users/me
// com o mesmo token (o 401 também é "recurso de outra conta" — revisão I2) → renova → 1 nova tentativa, marcar "erro" e avisar o dono (no
// máximo 1 por dia), achar a credencial certa de uma cobrança/assinatura que já existe (o collector; escrita × leitura — I3), a regra da
// coluna nova (colunasAssinatura/comCollector — C2), as cobranças da automática pela busca (I1) e cancelar automáticas pela credencial de
// cada uma. Só `import type` de URL: o Vitest importa com db e fetch falsos (src/financeiro/mpContaServidor.test.ts). Nunca no log: token,
// code, state, verifier, chave pública ou corpo do MP (só status, códigos e, no máximo, as CHAVES de um corpo fora do formato).
// A volta do OAuth (guardarParaConfirmar — revisão I8) entra na Task 8; quem grava a integração é a RPC recebimento_mp_confirmar, COMO A
// PESSOA (Task 6).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { cancelarAssinaturasDasMatriculas } from "./app-sem-profissional.ts";
import { cifrar, dadoAssociado, decifrar, type LerAmbiente } from "./cifra-mp.ts";
import {
  MpIndisponivel, baseDoMp, credencialDoSchema, mpFetch, type Credencial, type CredencialConta, type CredencialMp, type RespostaMp, type Schema,
} from "./cobranca-mp.ts";
import { modoConfere, mpTransitorio, type PagamentoMp } from "./cobranca-regras.ts";
import { avisar, carregarMatricula, registrarPagamentoAvulsoDoMp, type Matricula } from "./financeiro-mp.ts";
import type { Log } from "./log.ts";
import { emLotes, todasAsPaginas } from "./paginas.ts";
import {
  AVISO_DONO_MS, RENOVAR_NA_HORA_MS, codigoDoOauth, lerTokenDoMp, motivoDoOauth, precisaRenovar, proximaTentativa, qualCredencial, type TokenMp,
} from "./mp-conta-regras.ts";
import { TEMPO_MS, buscarComTempo, tempoEsgotado, type Prazo } from "./tempo.ts";

export interface ContextoMpConta {
  schema: Schema;
  log: Log;
  prazo: Prazo;
  /** MP_TOKENS_CHAVE importada (cifra-mp.ts › chaveDoAmbiente) */
  chave: CryptoKey;
  /** oauthDoAmbiente(schema): MP_CLIENT_ID / MP_CLIENT_SECRET (no staging, o par _STAGING quando existe — plano B do I6); null = sem
   *  configuração (a troca e a renovação respondem "fora") */
  oauth: { clientId: string; clientSecret: string } | null;
  /** o Vitest passa um falso; publicado, o fetch de sempre */
  fetch?: typeof fetch;
}
export class MpContaSemAcesso extends Error {
  constructor(public contaId: string, public motivo: string) {
    super(`mp_conta_sem_acesso_${motivo}`);
    this.name = "MpContaSemAcesso";
  }
}

type ComDeno = { Deno?: { env: { get: (n: string) => string | undefined } } };
const lerDaFuncao: LerAmbiente = (nome) => (globalThis as ComDeno).Deno?.env.get(nome);

/** I6: o client do OAuth das funções. No staging, o par MP_CLIENT_ID_STAGING/MP_CLIENT_SECRET_STAGING quando os 2 existem (a aplicação de
 *  TESTE de um integrador de teste — plano B da prova); o public nunca lê o par de teste. Faltando um do par → null ("não configurado"). */
export function oauthDoAmbiente(schema: Schema, ler: LerAmbiente = lerDaFuncao): { clientId: string; clientSecret: string } | null {
  const par = (id: string, segredo: string) => {
    const clientId = (ler(id) ?? "").trim();
    const clientSecret = (ler(segredo) ?? "").trim();
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  };
  return (schema === "staging" ? par("MP_CLIENT_ID_STAGING", "MP_CLIENT_SECRET_STAGING") : null) ?? par("MP_CLIENT_ID", "MP_CLIENT_SECRET");
}
/** PKCE (S256) ligado, a não ser que MP_OAUTH_PKCE = "0" (desliga sem código se o MP recusar o PKCE sem ele ligado no painel — decisão 4). */
export function pkceLigado(ler: LerAmbiente = lerDaFuncao): boolean {
  return ler("MP_OAUTH_PKCE") !== "0";
}

const TABELA_AUSENTE = /relation|does not exist|42P01|PGRST20|schema cache/i;
const W2_NO_SCHEMA = new Map<Schema, { tem: boolean; em: number }>();
/** O schema já tem a migration da W2? (a função é uma só para public e staging — lição I2 da W1). Guardado 60 s por instância. */
export async function schemaTemW2(db: SupabaseClient, schema: Schema): Promise<boolean> {
  const g = W2_NO_SCHEMA.get(schema);
  if (g && Date.now() - g.em < 60_000) return g.tem;
  const { error } = await db.from("mp_conexoes").select("id").limit(1);
  if (error && !TABELA_AUSENTE.test(`${error.code ?? ""} ${error.message ?? ""}`)) throw error;
  W2_NO_SCHEMA.set(schema, { tem: !error, em: Date.now() });
  return !error;
}

// ── C2: a REGRA DA COLUNA NOVA. mp_collector_id só entra em select/insert por aqui (ou pelo COLUNAS_COBRANCA_W2): a função é uma só para
// o public e o staging, e entre a Task 14 (publicar) e a 22 (a migration no public) o public NÃO tem a coluna — o select com ela dá 42703
// (o aluno_status inteiro em 500) e o insert dá PGRST204 DEPOIS do POST /preapproval (a automática nasce no MP e o banco recusa: o aluno
// tenta de novo = cobrança em dobro). A guarda de fonte da Task 18 acusa a coluna escrita fora daqui.
export const COLUNAS_ASSINATURA = "id, paciente_id, conta_id, mp_preapproval_id, status, valor, proximo_vencimento, payload, criado_em";
export async function colunasAssinatura(db: SupabaseClient, schema: Schema): Promise<string> {
  return (await schemaTemW2(db, schema)) ? `${COLUNAS_ASSINATURA}, mp_collector_id` : COLUNAS_ASSINATURA;
}
export async function comCollector(db: SupabaseClient, schema: Schema, collector: number | null | undefined): Promise<{ mp_collector_id?: number }> {
  return (await schemaTemW2(db, schema)) && collector ? { mp_collector_id: collector } : {};
}
export const collectorDe = (cred: CredencialMp): number | null => (typeof cred === "string" ? null : cred.collectorId);

export interface IntegracaoMp {
  conta_id: string; status: "ativa" | "erro" | "desconectada"; mp_user_id: number; mp_apelido: string | null; mp_public_key: string | null;
  mp_expira_em: string | null; mp_erro: string | null; mp_origem: string; mp_teste: boolean | null; conectado_em: string | null;
  desconectada_em: string | null; tem_acesso: boolean;
}
const COLUNAS = "conta_id, status, mp_user_id, mp_apelido, mp_public_key, mp_expira_em, mp_erro, mp_origem, mp_teste, conectado_em, desconectada_em";

/** A integração SEM token (o tem_acesso diz só se ainda há token guardado). */
export async function integracaoMp(db: SupabaseClient, contaId: string): Promise<IntegracaoMp | null> {
  const { data, error } = await db.from("recebimento_integracoes").select(`${COLUNAS}, mp_access_token`).eq("conta_id", contaId)
    .eq("provedor", "mercadopago").maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { mp_access_token, ...resto } = data as Record<string, unknown>;
  return { ...(resto as Omit<IntegracaoMp, "tem_acesso">), mp_user_id: Number(resto.mp_user_id), tem_acesso: typeof mp_access_token === "string" };
}

/** A credencial da conta. exigirAtiva (padrão): só a ativa. renovar (padrão): vence em < 1 dia → renova antes. */
export async function credencialDaConta(db: SupabaseClient, ctx: ContextoMpConta, contaId: string,
  op: { exigirAtiva?: boolean; renovar?: boolean } = {}): Promise<CredencialConta> {
  const { data, error } = await db.from("recebimento_integracoes").select("status, mp_user_id, mp_access_token, mp_expira_em, mp_origem")
    .eq("conta_id", contaId).eq("provedor", "mercadopago").maybeSingle();
  if (error) throw error;
  const l = data as { status: string; mp_user_id: number; mp_access_token: string | null; mp_expira_em: string | null; mp_origem: string } | null;
  if (!l?.mp_access_token) throw new MpContaSemAcesso(contaId, l ? "sem_token" : "sem_integracao");
  if (op.exigirAtiva !== false && l.status !== "ativa") throw new MpContaSemAcesso(contaId, l.status);
  // MENOR 12: o refresh "can only be used once" — renovar no pedido de alguém só com ≥ 10 s de prazo; senão segue com o token que ainda vale
  if (op.renovar !== false && l.status === "ativa" && l.mp_origem === "oauth" && precisaRenovar(l.mp_expira_em, Date.now(), RENOVAR_NA_HORA_MS)
      && ctx.prazo.restante() >= 10_000) {
    const r = await renovarConta(db, ctx, contaId);
    if (r === "renovada" || r === "outra_renovou") return await credencialDaConta(db, ctx, contaId, { ...op, renovar: false });
  }
  if (l.mp_expira_em && Date.parse(l.mp_expira_em) <= Date.now()) throw new MpContaSemAcesso(contaId, "vencido");
  const token = await decifrar(l.mp_access_token, dadoAssociado(ctx.schema, contaId, "access"), ctx.chave);
  return { tipo: "conta", schema: ctx.schema, contaId, collectorId: Number(l.mp_user_id), token };
}

/** POST /oauth/token (client_id + client_secret sempre; o resto por chamada). Rede/tempo → 599. */
async function postOauth(ctx: ContextoMpConta, corpo: Record<string, string>): Promise<{ status: number; body: unknown }> {
  if (!ctx.oauth) return { status: 599, body: null };
  const ms = Math.min(TEMPO_MS.mp, ctx.prazo.restante());
  if (ms < 1_000) return { status: 599, body: null };
  try {
    const res = await buscarComTempo(`${baseDoMp()}/oauth/token`, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: ctx.oauth.clientId, client_secret: ctx.oauth.clientSecret, ...corpo }),
    }, ms, ctx.fetch ?? fetch);
    let body: unknown = null;
    try {
      body = await res.json();
    } catch (e) {
      if (tempoEsgotado(e)) throw e;
    }
    return { status: res.status, body };
  } catch {
    return { status: 599, body: null };
  }
}

export async function trocarCodigo(ctx: ContextoMpConta, p: { codigo: string; redirect: string; verificador: string | null; teste: boolean }):
  Promise<{ ok: true; token: TokenMp } | { ok: false; motivo: "recusado" | "fora"; status: number }> {
  const corpo: Record<string, string> = { grant_type: "authorization_code", code: p.codigo, redirect_uri: p.redirect, test_token: p.teste ? "true" : "false" };
  if (p.verificador) corpo.code_verifier = p.verificador;
  const r = await postOauth(ctx, corpo);
  const t = r.status >= 200 && r.status < 300 ? lerTokenDoMp(r.body) : null;
  if (t) return { ok: true, token: t };
  ctx.log.aviso({ codigo: "mp_oauth_troca_falhou", schema: ctx.schema, status: r.status, externo: { mp_erro: codigoDoOauth(r.body) } });
  return { ok: false, motivo: r.status >= 200 && r.status < 300 ? "recusado" : motivoDoOauth(r.status), status: r.status };
}

export type ResultadoRenovar = "renovada" | "outra_renovou" | "recusada" | "fora" | "ocupada" | "sem_refresh";

/** Renova o acesso da conta. A trava (2 min) e a gravação condicional seguram a corrida do refresh que GIRA. */
export async function renovarConta(db: SupabaseClient, ctx: ContextoMpConta, contaId: string): Promise<ResultadoRenovar> {
  const { data: pegou, error: et } = await db.rpc("mp_integracao_reservar", { p_conta: contaId, p_segundos: 120 });
  if (et) throw et;
  if (pegou !== true) return "ocupada";
  let soltar = true;
  // toda gravação abaixo é pela MESMA chave: conta + provedor
  try {
    const { data, error } = await db.from("recebimento_integracoes").select("mp_refresh_token, mp_origem, mp_expira_em, mp_renovar_tentativas")
      .eq("conta_id", contaId).eq("provedor", "mercadopago").maybeSingle();
    if (error) throw error;
    const l = data as { mp_refresh_token: string | null; mp_origem: string; mp_expira_em: string | null; mp_renovar_tentativas: number } | null;
    if (!l?.mp_refresh_token || l.mp_origem !== "oauth") return "sem_refresh";
    const refresh = await decifrar(l.mp_refresh_token, dadoAssociado(ctx.schema, contaId, "refresh"), ctx.chave);
    const r = await postOauth(ctx, { grant_type: "refresh_token", refresh_token: refresh });
    const t = r.status >= 200 && r.status < 300 ? lerTokenDoMp(r.body) : null;
    if (t) {
      const novo = {
        mp_access_token: await cifrar(t.access, dadoAssociado(ctx.schema, contaId, "access"), ctx.chave),
        mp_refresh_token: t.refresh ? await cifrar(t.refresh, dadoAssociado(ctx.schema, contaId, "refresh"), ctx.chave) : l.mp_refresh_token,
        mp_expira_em: t.expiraEm, mp_public_key: t.publicKey ?? undefined, mp_renovado_em: new Date().toISOString(), mp_renovando_ate: null,
        mp_renovar_tentativas: 0, mp_renovar_proxima_em: null, mp_erro: t.renovavel ? null : "sem_renovacao", status: "ativa",
      };
      // o MP JÁ girou o refresh: a gravação tenta 3× (a perda do par novo = o dono reconecta — log.excecao avisa o Weslley)
      for (let i = 0; i < 3; i++) {
        const { data: g, error: eg } = await db.from("recebimento_integracoes").update(novo).eq("conta_id", contaId).eq("provedor", "mercadopago")
          .eq("mp_refresh_token", l.mp_refresh_token).select("conta_id");
        if (!eg) {
          soltar = false;
          ctx.log.info({ codigo: "mp_conta_renovada", schema: ctx.schema, ref: contaId });
          return (g ?? []).length ? "renovada" : "outra_renovou";
        }
        if (i === 2) ctx.log.excecao(eg, { codigo: "mp_renovacao_nao_gravada", schema: ctx.schema, ref: contaId });
        else await new Promise((ok) => setTimeout(ok, 300 * (i + 1)));
      }
      return "fora";
    }
    if (r.status >= 200 && r.status < 300) {
      // MENOR 13: 2xx (o MP JÁ girou o refresh) com o corpo fora do formato do lerTokenDoMp (ex.: expires_in > 400 d): guarda ao menos o
      // refresh novo — sem ele a próxima renovação morre — e avisa o Weslley com as CHAVES do corpo (o msg do log; nunca os valores)
      const corpo = (r.body && typeof r.body === "object" && !Array.isArray(r.body) ? r.body : {}) as Record<string, unknown>;
      ctx.log.erro({ codigo: "mp_renovacao_formato", schema: ctx.schema, ref: contaId, status: r.status,
        msg: `chaves: ${Object.keys(corpo).slice(0, 20).join(", ")}` });
      const novoRefresh = typeof corpo.refresh_token === "string" && /^[A-Za-z0-9_-]{8,300}$/.test(corpo.refresh_token) ? corpo.refresh_token : null;
      if (novoRefresh) {
        const { error: eg } = await db.from("recebimento_integracoes").update({
          mp_refresh_token: await cifrar(novoRefresh, dadoAssociado(ctx.schema, contaId, "refresh"), ctx.chave), mp_erro: "renovacao_formato",
          mp_renovando_ate: null, mp_renovar_proxima_em: new Date(Date.now() + 3_600_000).toISOString(),
        }).eq("conta_id", contaId).eq("provedor", "mercadopago").eq("mp_refresh_token", l.mp_refresh_token);
        if (eg) throw eg;
        soltar = false;
      }
      return "recusada";
    }
    if (motivoDoOauth(r.status) === "recusado") {
      // invalid_grant pode ser OUTRA renovação que girou o refresh: relê — mudou = não é erro
      const { data: d2, error: e2 } = await db.from("recebimento_integracoes").select("mp_refresh_token").eq("conta_id", contaId)
        .eq("provedor", "mercadopago").maybeSingle();
      if (e2) throw e2;
      if ((d2 as { mp_refresh_token: string | null } | null)?.mp_refresh_token !== l.mp_refresh_token) return "outra_renovou";
      ctx.log.aviso({ codigo: "mp_renovacao_recusada", schema: ctx.schema, ref: contaId, status: r.status, externo: { mp_erro: codigoDoOauth(r.body) } });
      if (l.mp_expira_em && Date.parse(l.mp_expira_em) > Date.now()) {
        const { error: ea } = await db.from("recebimento_integracoes").update({ mp_erro: "renovacao_recusada",
          mp_renovar_proxima_em: new Date(Date.now() + 86_400_000).toISOString() }).eq("conta_id", contaId).eq("provedor", "mercadopago");
        if (ea) throw ea;
        await avisarDonoDaConexao(db, ctx, contaId, "O Mercado Pago não renovou sozinho o acesso do Physiq à sua conta. Conecte de novo em Configurações › Recebimento para os alunos não pararem de pagar pelo app.");
      } else {
        await marcarErro(db, ctx, contaId, "renovacao_recusada");
      }
      return "recusada";
    }
    const { error: ef } = await db.from("recebimento_integracoes").update({ mp_renovar_tentativas: l.mp_renovar_tentativas + 1,
      mp_renovar_proxima_em: proximaTentativa(l.mp_renovar_tentativas) }).eq("conta_id", contaId).eq("provedor", "mercadopago");
    if (ef) throw ef;
    return "fora";
  } finally {
    if (soltar) {
      const { error } = await db.from("recebimento_integracoes").update({ mp_renovando_ate: null }).eq("conta_id", contaId).eq("provedor", "mercadopago");
      if (error) ctx.log.excecao(error, { codigo: "mp_trava_nao_solta", schema: ctx.schema, ref: contaId });
    }
  }
}

/** A conexão caiu de vez: status "erro" (só a ativa — a 2ª vez não muda nada), log.erro (avisa o Weslley) e o aviso ao dono (1 por dia). */
export async function marcarErro(db: SupabaseClient, ctx: ContextoMpConta, contaId: string, motivo: string): Promise<boolean> {
  const { data, error } = await db.from("recebimento_integracoes").update({ status: "erro", mp_erro: motivo, mp_renovando_ate: null })
    .eq("conta_id", contaId).eq("provedor", "mercadopago").eq("status", "ativa").select("conta_id");
  if (error) throw error;
  if (!((data ?? []) as unknown[]).length) return false;
  ctx.log.erro({ codigo: "mp_conta_sem_acesso", schema: ctx.schema, ref: contaId, resultado: motivo });
  await avisarDonoDaConexao(db, ctx, contaId, "Seu Mercado Pago desconectou do Physiq. Conecte de novo em Configurações › Recebimento para os alunos continuarem pagando pelo app.");
  return true;
}

/** O aviso ao dono da conta sobre a conexão com o MP: só quem ganha a gravação condicional do mp_avisado_em avisa — no máximo 1 por dia
 *  (a renovação recusada seguida do erro no mesmo pedido não vira 2 avisos). */
export async function avisarDonoDaConexao(db: SupabaseClient, ctx: ContextoMpConta, contaId: string, texto: string): Promise<boolean> {
  const agora = Date.now();
  const { data, error } = await db.from("recebimento_integracoes").update({ mp_avisado_em: new Date(agora).toISOString() })
    .eq("conta_id", contaId).eq("provedor", "mercadopago")
    .or(`mp_avisado_em.is.null,mp_avisado_em.lt.${new Date(agora - AVISO_DONO_MS).toISOString()}`).select("conta_id");
  if (error) throw error;
  if (!((data ?? []) as unknown[]).length) return false;
  const { data: c, error: ec } = await db.from("contas").select("dono_id").eq("id", contaId).maybeSingle();
  if (ec) throw ec;
  return await avisar(db, (c as { dono_id: string | null } | null)?.dono_id, "geral", texto, "/painel/configuracoes/recebimento", ctx.log, ctx.schema);
}

// ── I2: o 401 NÃO é "a conexão caiu" sozinho. O MP devolve 401 também para recurso de OUTRA conta (o buscarNoMp de hoje já trata assim —
// cobranca-mp.ts › buscarNoMp), e o id buscado pode vir de um aviso público forjado. Antes de renovar, GET /users/me com o MESMO token decide.
// Várias chamadas com a MESMA credencial no mesmo pedido (a busca da automática e os GET de cada pagamento, o GET/PUT/GET da automática
// antiga): o token novo de uma renovação passa para a `cred` de quem chamou (as próximas já vão com ele), e uma credencial lida ANTES de uma
// renovação recente (outro objeto, outra chamada) tenta o token guardado antes de dizer "a conexão caiu" — sem isso, o 401 do token velho
// logo depois da renovação marcava "erro" numa conta boa.
export async function mpContaFetch<T>(db: SupabaseClient, ctx: ContextoMpConta, cred: CredencialConta, caminho: string,
  init: RequestInit = {}, op: { renovar?: boolean } = {}): Promise<RespostaMp<T>> {
  const r = await mpFetch<T>(cred, caminho, init, { prazo: ctx.prazo });
  if (r.status !== 401) return r;
  const eu = await mpFetch<{ id?: number | string }>(cred, "/users/me", {}, { prazo: ctx.prazo });
  if (eu.status === 200) {
    if (Number(eu.body?.id) === cred.collectorId) return r;                 // o token vale: o recurso é de outra conta — nada muda
    await marcarErro(db, ctx, cred.contaId, "conta_trocada");               // o token é de OUTRO usuário do MP: não confiar nele
    throw new MpContaSemAcesso(cred.contaId, "conta_trocada");
  }
  if (eu.status !== 401 && eu.status !== 403) throw new MpIndisponivel(eu.status);   // sem decisão (MP fora/prazo): ninguém marca nada
  if (op.renovar === false) throw new MpContaSemAcesso(cred.contaId, "token_recusado"); // o webhook (MENOR 34): 500 e o job renova
  const { data, error } = await db.from("recebimento_integracoes").select("mp_renovado_em").eq("conta_id", cred.contaId)
    .eq("provedor", "mercadopago").maybeSingle();
  if (error) throw error;
  const ultima = Date.parse((data as { mp_renovado_em: string | null } | null)?.mp_renovado_em ?? "");
  const renovouHaPouco = Number.isFinite(ultima) && Date.now() - ultima < 10 * 60_000;   // no máximo 1 renovação a cada 10 min por conta
  let nova: CredencialConta | null = null;
  if (!renovouHaPouco) {
    if (ctx.prazo.restante() < 10_000) throw new MpIndisponivel(599);       // MENOR 12: sem prazo para girar o refresh com segurança
    let res = await renovarConta(db, ctx, cred.contaId);
    if (res === "ocupada") {
      await new Promise((ok) => setTimeout(ok, 1_500));
      res = "outra_renovou";                                                // outra renovação estava no meio: relê a credencial
    }
    if (res === "fora") throw new MpIndisponivel(599);
    if (res === "renovada" || res === "outra_renovou") nova = await credencialDaConta(db, ctx, cred.contaId, { renovar: false });
  } else {
    // renovou há pouco: se o token guardado já é OUTRO, esta credencial é de antes da renovação — tenta com o guardado (sem renovar de novo).
    // O MESMO token recusado logo depois de renovar = o acesso foi tirado no MP.
    const guardada = await credencialDaConta(db, ctx, cred.contaId, { exigirAtiva: false, renovar: false }).catch((e) => {
      if (e instanceof MpContaSemAcesso) return null;
      throw e;
    });
    if (guardada && guardada.token !== cred.token) nova = guardada;
  }
  if (nova) {
    cred.token = nova.token;                                                // quem segura esta credencial segue com o token novo
    const r2 = await mpFetch<T>(nova, caminho, init, { prazo: ctx.prazo });   // POST refeito = X-Idempotency-Key nova (o 1º deu 401)
    if (r2.status !== 401) return r2;
  }
  await marcarErro(db, ctx, cred.contaId, "acesso_recusado");
  throw new MpContaSemAcesso(cred.contaId, "acesso_recusado");
}

/** Qualquer ida ao MP com uma credencial já escolhida: a do Physiq pelo mpFetch de sempre; a da conta pelo mpContaFetch (o 401 confere). */
export async function chamarMp<T>(db: SupabaseClient, ctx: ContextoMpConta, cred: CredencialMp, caminho: string, init: RequestInit = {},
  op: { renovar?: boolean } = {}): Promise<RespostaMp<T>> {
  return typeof cred === "string"
    ? await mpFetch<T>(cred, caminho, init, { prazo: ctx.prazo })
    : await mpContaFetch<T>(db, ctx, cred, caminho, init, op);
}

/** Busca um recurso NA CONTA (o aviso do MP nunca é a verdade). 200 do modo do schema → o recurso; o 401 que voltou do mpContaFetch (o
 *  /users/me disse que o token vale: o recurso é de outra conta — I2), 404, 403 ou outro modo → null; MP fora → MpIndisponivel (o 401 é
 *  lido ANTES do mpTransitorio, que contaria o 401 como "MP fora"). */
export async function buscarNaConta<T>(db: SupabaseClient, ctx: ContextoMpConta, cred: CredencialConta, caminho: string,
  op: { renovar?: boolean } = {}): Promise<T | null> {
  const { status, body } = await mpContaFetch<T>(db, ctx, cred, caminho, {}, op);
  if (status === 200 && body) return modoConfere(credencialDoSchema(cred.schema), body) ? body : null;
  if (status === 401) return null;
  if (mpTransitorio(status)) throw new MpIndisponivel(status);
  return null;
}

/** A credencial de uma cobrança que JÁ existe (o collector dela): nulo → a do Physiq (o getter `ctx` nem é chamado: o MP do Physiq não
 *  precisa da MP_TOKENS_CHAVE); o da integração da conta → a da conta; outro → null ("outra conta do MP": o Physiq não alcança).
 *  · escrita: a desconectada → null (decisão 10: depois de desligar, só leitura); em erro → MpContaSemAcesso (quem chama: 409
 *    mp_conta_indisponivel);
 *  · leitura (I3): em erro ou sem token → null (não confere: quem chama devolve a linha do banco); a desconectada com token (os 7 dias) → a
 *    credencial, sem renovar. */
export async function credencialDaCobranca(db: SupabaseClient, ctx: () => ContextoMpConta,
  c: { conta_id: string | null; mp_collector_id?: number | string | null }, physiq: Credencial,
  op: { escrita?: boolean; leitura?: boolean } = {}): Promise<CredencialMp | null> {
  const collector = c.mp_collector_id ?? null;
  if (qualCredencial(collector, null) === "physiq") return physiq;
  if (!c.conta_id) return null;
  const integ = await integracaoMp(db, c.conta_id);
  if (!integ || !integ.tem_acesso || qualCredencial(collector, integ) !== "conta") return null;
  if (integ.status === "desconectada") {
    if (op.escrita) return null;
    return await credencialDaConta(db, ctx(), c.conta_id, { exigirAtiva: false, renovar: false });
  }
  if (op.leitura && integ.status !== "ativa") return null;
  return await credencialDaConta(db, ctx(), c.conta_id, { exigirAtiva: !!op.escrita });
}

/** O mesmo, para uma assinatura (aluno_assinaturas): pelo conta_id dela; nulo (a assinatura antiga) → o da matrícula. */
export async function credencialDaAssinatura(db: SupabaseClient, ctx: () => ContextoMpConta,
  a: { paciente_id: string; conta_id: string | null; mp_collector_id?: number | string | null }, physiq: Credencial,
  op: { escrita?: boolean; leitura?: boolean } = {}): Promise<CredencialMp | null> {
  if (qualCredencial(a.mp_collector_id ?? null, null) === "physiq") return physiq;
  let conta = a.conta_id;
  if (!conta) {
    const { data, error } = await db.from("pacientes").select("conta_id").eq("id", a.paciente_id).maybeSingle();
    if (error) throw error;
    conta = (data as { conta_id: string | null } | null)?.conta_id ?? null;
  }
  return await credencialDaCobranca(db, ctx, { conta_id: conta, mp_collector_id: a.mp_collector_id }, physiq, op);
}

/** As matrículas com cobrança automática viva na conta (sair do MP cancela — a regra cruzada do spec-review). Busca pelos PACIENTES da
 *  conta: a aluno_assinaturas antiga pode ter conta_id nulo (MENOR 6 da revisão da W1). O automaticasVivasDaConta da W1, movido para cá. */
export async function pacientesComAutomaticaViva(db: SupabaseClient, contaId: string): Promise<string[]> {
  const linhas = await todasAsPaginas<{ paciente_id: string }>((de, ate) =>
    db.from("aluno_assinaturas").select("paciente_id, pacientes!inner(conta_id)").eq("pacientes.conta_id", contaId)
      .in("status", ["authorized", "pending", "paused"]).order("paciente_id").range(de, ate));
  return [...new Set(linhas.map((l) => l.paciente_id))];
}

// ── I1: a REDE da cobrança de cada mês da automática na conta. O aviso dela pode nunca vir para o notification_url da assinatura (o exemplo
// oficial do POST /preapproval não tem o campo; a doc se contradiz) — então a busca das cobranças da automática (o molde da cobranca-conta)
// registra as aprovadas que faltam (idempotente: mp_payment_id único). Quem chama: o conferirAssinatura (os 2 MPs) e o diário do
// mp-contas-renovar. `chamar` = o chamarMp com a credencial da assinatura já escolhida. O PagamentoMp do cobranca-regras.ts não muda (cópia no
// Treino — decisão 18): o collector_id vem pelo tipo local abaixo.
type PagamentoDaConta = PagamentoMp & { collector_id?: number | string | null };
export async function registrarCobrancasDaAutomatica(db: SupabaseClient, schema: Schema, log: Log,
  chamar: <T>(caminho: string) => Promise<RespostaMp<T>>, m: Matricula,
  a: { mp_preapproval_id: string | null; status: string }, colunasW2: { mp_collector_id?: number }): Promise<number> {
  if (!a.mp_preapproval_id || a.status !== "authorized") return 0;
  const busca = await chamar<{ results?: Array<{ payment?: { id?: number | string | null } | null }> }>(
    `/authorized_payments/search?preapproval_id=${encodeURIComponent(a.mp_preapproval_id)}&sort=date_created&criteria=desc&limit=6`);
  if (mpTransitorio(busca.status)) throw new MpIndisponivel(busca.status);
  if (busca.status !== 200) return 0;
  const ids = [...new Set((busca.body?.results ?? []).map((x) => x.payment?.id).filter((x) => x !== null && x !== undefined).map(String))];
  if (!ids.length) return 0;
  const { data: ja, error } = await db.from("cobrancas").select("mp_payment_id").in("mp_payment_id", ids);
  if (error) throw error;
  const conhecidos = new Set(((ja ?? []) as Array<{ mp_payment_id: string }>).map((x) => x.mp_payment_id));
  let n = 0;
  for (const pid of ids.filter((x) => !conhecidos.has(x))) {
    const { status, body: pay } = await chamar<PagamentoDaConta>(`/v1/payments/${encodeURIComponent(pid)}`);
    if (mpTransitorio(status)) throw new MpIndisponivel(status);
    if (status !== 200 || !pay?.id || pay.status !== "approved") continue;
    if (colunasW2.mp_collector_id && Number(pay.collector_id) !== colunasW2.mp_collector_id) continue;   // só o que caiu NESTA conta
    await registrarPagamentoAvulsoDoMp(db, m, pay, { preapprovalId: a.mp_preapproval_id, origem: "assinatura", colunasW2 }, log, schema);
    n++;
  }
  if (n) log.info({ codigo: "mp_automatica_rede", schema, ref: a.mp_preapproval_id, n });
  return n;
}

export interface ResultadoConferir { resultado: "ok" | "sem_acesso" | "fora"; cobrancas: number }

/** O diário (MENOR 27 e I1; quem chama é o mp-contas-renovar, 1×/dia por integração OAuth ativa): GET /users/me com o token da conta (o
 *  acesso tirado no MP é descoberto sem esperar um aluno pagar: 401 → a renovação → recusada → marcarErro "acesso_recusado"; outro usuário
 *  → "conta_trocada"); depois, as automáticas vivas DESTA conta (collector = a integração; até 50) pela busca das cobranças; no fim o
 *  mp_conferido_em. MP fora → "fora" sem gravar o mp_conferido_em (a próxima hora tenta). Erro do banco lança. */
export async function conferirConta(db: SupabaseClient, ctx: ContextoMpConta, integ: { conta_id: string; mp_user_id: number | string }):
  Promise<ResultadoConferir> {
  try {
    const cred = await credencialDaConta(db, ctx, integ.conta_id);
    const eu = await mpContaFetch<{ id?: number | string }>(db, ctx, cred, "/users/me");
    if (eu.status !== 200) throw new MpIndisponivel(eu.status);              // sem resposta que decida (o 401 já passou pelo mpContaFetch)
    if (Number(eu.body?.id) !== cred.collectorId) {
      await marcarErro(db, ctx, integ.conta_id, "conta_trocada");
      return { resultado: "sem_acesso", cobrancas: 0 };
    }
    const { data, error } = await db.from("aluno_assinaturas").select(`${await colunasAssinatura(db, ctx.schema)}, pacientes!inner(conta_id)`)
      .eq("pacientes.conta_id", integ.conta_id).eq("mp_collector_id", Number(integ.mp_user_id)).eq("status", "authorized")
      .order("criado_em", { ascending: false }).limit(50);
    if (error) throw error;
    const chamar = <T>(caminho: string) => mpContaFetch<T>(db, ctx, cred, caminho);   // a cred segue com o token novo se o MP pedir renovação
    const colunasW2 = await comCollector(db, ctx.schema, cred.collectorId);
    let cobrancas = 0;
    for (const a of (data ?? []) as unknown as Array<{ paciente_id: string; mp_preapproval_id: string | null; status: string }>) {
      const m = await carregarMatricula(db, a.paciente_id);
      if (m) cobrancas += await registrarCobrancasDaAutomatica(db, ctx.schema, ctx.log, chamar, m, a, colunasW2);
    }
    const { error: ec } = await db.from("recebimento_integracoes").update({ mp_conferido_em: new Date().toISOString() })
      .eq("conta_id", integ.conta_id).eq("provedor", "mercadopago");
    if (ec) throw ec;
    return { resultado: "ok", cobrancas };
  } catch (e) {
    if (e instanceof MpIndisponivel) return { resultado: "fora", cobrancas: 0 };
    if (e instanceof MpContaSemAcesso) return { resultado: "sem_acesso", cobrancas: 0 };
    throw e;
  }
}

// ── C2 + MENOR 11: cancelar as automáticas vivas, cada uma com a credencial DELA. Sem a W2 no schema → o caminho de antes (sem agrupar, sem
// ler a coluna nova). O MP sem resposta (MpIndisponivel) vira `falhas` e a conta sem acesso (MpContaSemAcesso — inclusive a MP_TOKENS_CHAVE
// ausente) vira `semAcesso`: a função NUNCA lança por causa do MP (quem chama responde 502/409, nunca 500). Erro do banco lança (500 antes
// de mudar qualquer coisa — o hml-14 de sempre).
export async function cancelarAssinaturasPorCredencial(db: SupabaseClient, base: { schema: Schema; log: Log; prazo: Prazo },
  ctx: () => ContextoMpConta, physiq: Credencial, pacienteIds: string[], motivo: string):
  Promise<{ canceladas: number; falhas: number; semAcesso: number }> {
  const t = { canceladas: 0, falhas: 0, semAcesso: 0 };
  const cancelar = async (cred: CredencialMp, ids: string[], filtro?: { collector: number | null }) => {
    try {
      const r = await cancelarAssinaturasDasMatriculas(db, cred, ids, motivo, base.log, { prazo: base.prazo }, filtro);
      t.canceladas += r.canceladas;
      t.falhas += r.falhas;
    } catch (e) {
      if (e instanceof MpIndisponivel) t.falhas += ids.length;
      else if (e instanceof MpContaSemAcesso) t.semAcesso += ids.length;
      else throw e;
    }
  };
  if (!pacienteIds.length) return t;
  if (!(await schemaTemW2(db, base.schema))) {
    await cancelar(physiq, pacienteIds);
    return t;
  }
  type Viva = { paciente_id: string; conta_id: string | null; mp_collector_id: number | string | null };
  const vivas = await emLotes(pacienteIds, 150, (lote) => todasAsPaginas<Viva>((de, ate) =>
    db.from("aluno_assinaturas").select("paciente_id, conta_id, mp_collector_id") // W2: depois do schemaTemW2
      .in("paciente_id", lote).in("status", ["authorized", "pending", "paused"]).order("id").range(de, ate)));
  const grupos = new Map<string, { collector: number | null; conta: string | null; ids: Set<string> }>();
  for (const v of vivas) {
    const collector = v.mp_collector_id === null || v.mp_collector_id === undefined ? null : Number(v.mp_collector_id);
    const chave = collector === null ? "physiq" : `${collector}:${v.conta_id ?? ""}`;
    const g = grupos.get(chave) ?? { collector, conta: v.conta_id, ids: new Set<string>() };
    g.ids.add(v.paciente_id);
    grupos.set(chave, g);
  }
  for (const g of grupos.values()) {
    if (g.collector === null) {
      await cancelar(physiq, [...g.ids], { collector: null });
      continue;
    }
    try {
      const cred = await credencialDaCobranca(db, ctx, { conta_id: g.conta, mp_collector_id: g.collector }, physiq, { escrita: true });
      if (!cred || typeof cred === "string") {
        t.semAcesso += g.ids.size;                                          // outra conta do MP ou desconectada: o Physiq não alcança
        continue;
      }
      await cancelar(cred, [...g.ids], { collector: g.collector });
    } catch (e) {
      if (e instanceof MpContaSemAcesso || e instanceof MpIndisponivel) t[e instanceof MpIndisponivel ? "falhas" : "semAcesso"] += g.ids.size;
      else throw e;
    }
  }
  return t;
}
