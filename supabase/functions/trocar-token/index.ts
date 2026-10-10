// Physiq W2 — trocar-token (Banco do Treino). Troca o login do BANCO PRINCIPAL por uma sessão do Banco do Treino,
// que o PowerSync aceita (ele só confia em token emitido pelo Auth do Treino — spec §7.4 / D2).
//
// POST, headers: Authorization: Bearer <access_token do principal> · x-schema: public|staging. Corpo: {} (vazio).
// 200 → { access_token, refresh_token, expires_in, expires_at, token_type, treino_user_id, papel, vinculo, espelho }
// Erros: 401 missing_auth | invalid_token · 403 email_nao_confirmado | conta_real_no_staging | aluno_bloqueado (W13) ·
//        409 conta_em_conflito ·
//        429 rate_limited · 502 principal_indisponivel | espelho_indisponivel · 500 erro_interno
//
// Regras de segurança (spec 7.4, risco 1): o token é validado no próprio principal (GET /auth/v1/user: assinatura e
// revogação) e o e-mail tem que estar confirmado; o usuário do Treino vem do vínculo physiq_identidades; sem vínculo, só
// procura pelo e-mail quando a sessão do principal é Google (e-mail verificado pelo Google); e-mail e senha sem vínculo
// com e-mail que já existe no Treino → conta_em_conflito (o master resolve). Limite: check_rate_limit (20/h por pessoa).
//
// verify_jwt = false (o token é do outro banco). PUBLICAR SÓ ASSIM:
//   scripts/deploy_function.sh uxwpwdbbnlticxgtzcsb supabase/functions trocar-token false
// NUNCA pelo workflow deploy-function.yml (ele liga o verify_jwt e a troca passa a responder 401 pra todo mundo).
// Segredos: PRINCIPAL_URL, PRINCIPAL_ANON_KEY, SEGREDO_ESPELHO_RESUMO (hml-16c, S4: o que a espelho-resumo do principal aceita;
// até o F7, sem ele, o legado ESPELHO_SEGREDO — _shared/segredo-servidor.ts) (+ os automáticos do Supabase).
// hml-10 (H-24 e H-26): log em JSON sem dado pessoal (_shared/log.ts); log.erro e log.excecao avisam o Weslley pelo principal.
// hml-14 (H-32, D3): o login tem um prazo de 35 s (o front espera 40 s) e cada chamada para fora espera no máximo o tempo do
// destino dentro dele — GoTrue do principal 5 s, espelho-resumo 8 s, GoTrue do Treino 10 s (generate_link, verify, getUserById e
// o updateUserById do espelho; o createUser do 1º login, o que sobra do prazo); estourou → o caminho de erro de sempre
// (principal_indisponivel ou erro_interno), nada novo no front.
// hml-14 (H-51 item 3): o 23505 ao gravar o vínculo não passa calado (gravarVinculo): usuário do Treino de OUTRO login → 409
// conta_em_conflito + registro para o master; 2 chamadas ao mesmo tempo → vale o vínculo gravado e o órfão vai para o log.
import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { aplicarResumo, type ResultadoEspelho } from "../_shared/espelho/aplicar.ts";
import {
  alunoBloqueadoSemStaff,
  claimsDoJwt,
  decidirVinculo,
  decidirVinculoDuplicado,
  ehLoginGoogle,
  emailConfirmado,
  emailDeTeste,
  type ResumoNucleo,
  type UsuarioPrincipal,
} from "../_shared/espelho/regras.ts";
import { criarLog } from "../_shared/log.ts";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { TEMPO_MS, buscarComTempo, prazo, tempoEsgotado, type Prazo } from "../_shared/tempo.ts";
import { segredoParaEnviar } from "../_shared/segredo-servidor.ts";

const log = criarLog("trocar-token", { avisar: avisarErro });

/** hml-14 (H-32, D3): o prazo do login inteiro (o front desiste em 40 s; o máximo medido em 7 dias foi 26,3 s). */
const ORCAMENTO_LOGIN_MS = 35_000;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const PRINCIPAL_URL = (Deno.env.get("PRINCIPAL_URL") || "").replace(/\/+$/, "");
const PRINCIPAL_ANON_KEY = Deno.env.get("PRINCIPAL_ANON_KEY") || "";
const SEGREDO_ESPELHO_RESUMO = segredoParaEnviar("SEGREDO_ESPELHO_RESUMO");

const SCHEMAS = ["public", "staging"];
const ALLOWED_ORIGINS = new Set([
  "https://physiqcalc.com.br",
  "https://www.physiqcalc.com.br",
  "https://physiqcalc-staging.vercel.app",
  "https://physiqcalc.vercel.app",
  "capacitor://localhost",
  "https://localhost",
  "http://localhost:8080",
  "http://localhost:5173",
]);

function cors(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://physiqcalc.com.br",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-schema",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });
const erro = (codigo: string, status: number, origin: string | null, extra?: Record<string, unknown>) =>
  json({ error: codigo, ...(extra || {}) }, status, origin);

// antes de validar o token: freio por IP no isolate (não deixa martelar o /auth/v1/user do principal)
const janelasIp = new Map<string, number[]>();
function freioPorIp(ip: string, max = 60, janelaMs = 60_000): boolean {
  const agora = Date.now();
  const validos = (janelasIp.get(ip) ?? []).filter((t) => t > agora - janelaMs);
  if (validos.length >= max) { janelasIp.set(ip, validos); return false; }
  validos.push(agora);
  janelasIp.set(ip, validos);
  if (janelasIp.size > 5000) janelasIp.clear();
  return true;
}

async function usuarioDoPrincipal(token: string, p: Prazo): Promise<{ user: UsuarioPrincipal & Record<string, unknown> | null; status: number }> {
  const r = await buscarComTempo(`${PRINCIPAL_URL}/auth/v1/user`, { headers: { apikey: PRINCIPAL_ANON_KEY, Authorization: `Bearer ${token}` } },
    Math.min(TEMPO_MS.gotruePrincipal, p.restante()));
  if (r.status === 200) return { user: await r.json(), status: 200 };
  await r.body?.cancel();
  return { user: null, status: r.status };
}

async function resumoDoPrincipal(principalUserId: string, schema: string, p: Prazo): Promise<ResumoNucleo | null> {
  const r = await buscarComTempo(`${PRINCIPAL_URL}/functions/v1/espelho-resumo`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-espelho-segredo": SEGREDO_ESPELHO_RESUMO, "x-schema": schema },
    body: JSON.stringify({ principal_user_id: principalUserId }),
  }, Math.min(TEMPO_MS.principal, p.restante()));
  if (r.status !== 200) {
    // hml-10 (H-24): da resposta, só o status e o código de erro da espelho-resumo (o corpo nunca vai para o log)
    const corpo = (await r.json().catch(() => null)) as { error?: unknown; erro?: unknown } | null;
    log.erro({ codigo: "espelho_resumo_respondeu", schema, status: r.status, externo: { principal_erro: corpo?.error ?? corpo?.erro } });
    return null;
  }
  return await r.json();
}

/** hml-14 (H-32): o tempo vale até ler o corpo — estourou no meio dele, lança o tempo esgotado (não vira "corpo vazio"). */
function semCorpo(e: unknown): Record<string, unknown> {
  if (tempoEsgotado(e)) throw e;
  return {};
}

/**
 * magic link gerado pelo servidor + verify = sessão nova do Treino (access + refresh), sem e-mail. Falha → lança
 * "generate_link_<status>" ou "verify_<status>" (hml-10, H-24: sem o corpo do GoTrue, que traz o e-mail e o token).
 */
async function emitirSessao(email: string, p: Prazo): Promise<Record<string, unknown>> {
  const g = await buscarComTempo(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email }),
  }, Math.min(TEMPO_MS.gotrueTreino, p.restante()));
  const link = await g.json().catch(semCorpo);
  const hashed = (link as Record<string, unknown>)?.hashed_token ?? ((link as Record<string, Record<string, unknown>>)?.properties?.hashed_token);
  if (g.status !== 200 || typeof hashed !== "string") throw new Error(`generate_link_${g.status}`);
  const v = await buscarComTempo(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "email", token_hash: hashed }),
  }, Math.min(TEMPO_MS.gotrueTreino, p.restante()));
  const sessao = await v.json().catch(semCorpo);
  if (v.status !== 200 || typeof (sessao as Record<string, unknown>)?.access_token !== "string") {
    throw new Error(`verify_${v.status}`);
  }
  return sessao as Record<string, unknown>;
}

/**
 * Registra o conflito para o master resolver (W27). hml-14 (H-51 item 3): falhar aqui não muda o 409 (ninguém entra no Treino
 * de outra pessoa), mas avisa — é o registro que leva o caso ao master ("Já avisamos o suporte", no app).
 */
async function registrarConflito(
  db: SupabaseClient,
  schema: string,
  linha: { principal_user_id: string; email: string; treino_user_id: string | null; motivo?: string },
): Promise<void> {
  const { error } = await db.from("physiq_identidade_conflitos").upsert(
    { ...linha, ultima_em: new Date().toISOString() },
    { onConflict: "principal_user_id" },
  );
  if (error) log.excecao(error, { codigo: "conflito_nao_gravado", schema });
}

/**
 * Grava o vínculo deste login com o usuário do Treino e devolve o usuário do Treino que vale; null = ele já é de OUTRO login
 * (quem chama responde conta_em_conflito). hml-14 (H-51 item 3): antes o 23505 passava calado e a troca emitia a sessão desse
 * Treino — o login novo entrava no treino do antigo (e-mail que mudou de dono) ou, na corrida, seguia com um usuário sem
 * vínculo. Agora relê o vínculo deste login e decide pela regra pura (decidirVinculoDuplicado, _shared/espelho/regras.ts).
 */
async function gravarVinculo(
  db: SupabaseClient,
  schema: string,
  linha: { principal_user_id: string; treino_user_id: string; email: string; origem: "google" | "criado" },
  criadoAgora: boolean,
): Promise<string | null> {
  const { error } = await db.from("physiq_identidades").insert(linha);
  if (!error) return linha.treino_user_id;
  if (error.code !== "23505") throw error;
  const { data: gravado, error: eg } = await db.from("physiq_identidades")
    .select("treino_user_id").eq("principal_user_id", linha.principal_user_id).maybeSingle();
  if (eg) throw eg;
  const decisao = decidirVinculoDuplicado({
    tentado: linha.treino_user_id,
    gravado: (gravado as { treino_user_id?: string } | null)?.treino_user_id ?? null,
    criadoAgora,
  });
  if (decisao.caminho === "conflito") return null;
  // sem dado pessoal: só o id do usuário do Treino que ficou sem vínculo (para apagar à mão)
  if (decisao.caminho === "usar_gravado" && decisao.orfao) log.erro({ codigo: "usuario_orfao", schema, ref: decisao.orfao });
  return decisao.treinoUserId;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return erro("metodo", 405, origin);
  const p = prazo(ORCAMENTO_LOGIN_MS); // hml-14 (H-32, D3): o prazo do login inteiro (todas as chamadas para fora)
  if (!PRINCIPAL_URL || !PRINCIPAL_ANON_KEY || !SEGREDO_ESPELHO_RESUMO) return erro("nao_configurada", 500, origin);

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "sem-ip";
  if (!freioPorIp(ip)) return erro("rate_limited", 429, origin);

  const schema = (req.headers.get("x-schema") || "public").toLowerCase();
  if (!SCHEMAS.includes(schema)) return erro("schema_invalido", 400, origin);
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ") || auth.length < 20) return erro("missing_auth", 401, origin);
  const token = auth.slice(7).trim();

  // 1. token do principal validado no próprio principal (assinatura, validade e revogação)
  let principal: UsuarioPrincipal & Record<string, unknown>;
  try {
    const r = await usuarioDoPrincipal(token, p);
    if (!r.user) return r.status >= 500 ? erro("principal_indisponivel", 502, origin) : erro("invalid_token", 401, origin);
    principal = r.user;
  } catch (e) {
    log.excecao(e, { codigo: "principal_indisponivel", schema });
    return erro("principal_indisponivel", 502, origin);
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" }, auth: { persistSession: false } });
  // hml-14 (H-32, D3): o cliente do GoTrue do Treino (supabase-js) com tempo em cada chamada — sem isto, o GoTrue parado prendia o
  // login no getUserById, antes do generate_link. getUserById e o updateUserById do espelho: TEMPO_MS.gotrueTreino (cortar só faz
  // tentar de novo). Estourou → o erro do supabase-js → erro_interno. O `db` (PostgREST) segue sem tempo (D6).
  const clienteAuth = (ms: () => number) => createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
    global: { fetch: (entrada, init) => buscarComTempo(entrada, init ?? {}, ms()) },
  });
  const authAdmin = clienteAuth(() => Math.min(TEMPO_MS.gotrueTreino, p.restante()));

  let acao = "limite"; // hml-10 (D6): o passo em que estava, para o log do catch final
  try {
    // 2. limite de tentativas por pessoa (20 por hora, a check_rate_limit do Calc)
    const { data: permitido, error: erl } = await db.rpc("check_rate_limit", {
      p_user_id: principal.id, p_endpoint: "trocar-token", p_max_count: 20, p_window_secs: 3600,
    });
    if (erl) throw erl;
    if (permitido === false) return erro("rate_limited", 429, origin);

    // 3. e-mail confirmado; no staging só conta de teste (P26)
    if (!emailConfirmado(principal)) return erro("email_nao_confirmado", 403, origin);
    const email = String(principal.email).trim().toLowerCase();
    if (schema === "staging" && !emailDeTeste(email)) return erro("conta_real_no_staging", 403, origin);

    // 4. qual usuário do Treino é desta pessoa
    acao = "vinculo";
    const loginGoogle = ehLoginGoogle(claimsDoJwt(token), principal);
    const { data: vinculo, error: ev } = await db.from("physiq_identidades")
      .select("treino_user_id, origem").eq("principal_user_id", principal.id).maybeSingle();
    if (ev) throw ev;
    let treinoIdPorEmail: string | null = null;
    if (!vinculo) {
      const { data: achado, error: ea } = await db.rpc("physiq_auth_user_id_por_email", { p_email: email });
      if (ea) throw ea;
      treinoIdPorEmail = (achado as string | null) ?? null;
    }
    const decisao = decidirVinculo({ temVinculo: !!vinculo, loginGoogle, treinoIdPorEmail });
    const meta = (principal.user_metadata as Record<string, unknown>) || {};

    let treinoUserId: string;
    let origemVinculo: string;
    if (decisao === "conflito") {
      await registrarConflito(db, schema, { principal_user_id: principal.id, email, treino_user_id: treinoIdPorEmail });
      return erro("conta_em_conflito", 409, origin);
    } else if (decisao === "usar_vinculo") {
      treinoUserId = (vinculo as { treino_user_id: string }).treino_user_id;
      origemVinculo = (vinculo as { origem: string }).origem;
    } else if (decisao === "vincular_por_email") {
      const ligado = await gravarVinculo(db, schema, { principal_user_id: principal.id, treino_user_id: treinoIdPorEmail!, email, origem: "google" }, false);
      if (!ligado) {
        // hml-14 (H-51 item 3): o usuário do Treino com este e-mail já é de OUTRO login (o e-mail mudou de dono)
        await registrarConflito(db, schema, { principal_user_id: principal.id, email, treino_user_id: treinoIdPorEmail, motivo: "treino_de_outro_login" });
        return erro("conta_em_conflito", 409, origin);
      }
      treinoUserId = ligado;
      origemVinculo = "google";
    } else {
      // criar: sem usuário no Treino com esse e-mail (no staging o gatilho do Calc cria o perfil só no schema staging).
      // hml-14 (H-32): o createUser espera o que sobra do prazo do login, não os 10 s — cortar depois de o GoTrue criar deixaria o
      // usuário do Treino sem vínculo, e o próximo login por senha cairia em conta_em_conflito (sobram ≥ 30 s: o máximo medido do
      // login inteiro é 26,3 s)
      const { data: novo, error: ec } = await clienteAuth(() => p.restante()).auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          full_name: meta.full_name ?? meta.name ?? meta.nome ?? null,
          avatar_url: meta.avatar_url ?? meta.picture ?? null,
          origem: "physiq",
          ...(schema === "staging" ? { ambiente: "staging" } : {}),
        },
      });
      if (ec || !novo?.user) {
        // corrida com outra chamada da mesma pessoa: o vínculo pode ter acabado de nascer
        const { data: v2 } = await db.from("physiq_identidades").select("treino_user_id").eq("principal_user_id", principal.id).maybeSingle();
        if (!v2) throw ec ?? new Error("createUser sem usuário");
        treinoUserId = (v2 as { treino_user_id: string }).treino_user_id;
      } else {
        const ligado = await gravarVinculo(db, schema, { principal_user_id: principal.id, treino_user_id: novo.user.id, email, origem: "criado" }, true);
        if (!ligado) {
          // hml-14 (H-51 item 3): o usuário recém-criado já ligado a OUTRO login (não deveria acontecer): nunca a sessão dele
          await registrarConflito(db, schema, { principal_user_id: principal.id, email, treino_user_id: novo.user.id, motivo: "treino_de_outro_login" });
          return erro("conta_em_conflito", 409, origin);
        }
        treinoUserId = ligado;
      }
      origemVinculo = "criado";
    }

    const { data: tu, error: eu } = await authAdmin.auth.admin.getUserById(treinoUserId);
    if (eu || !tu?.user) throw eu ?? new Error("usuário do Treino sumiu");
    const treinoUser: User = tu.user;
    if (!treinoUser.email) throw new Error("usuário do Treino sem e-mail");

    // 5. espelho: resumo do núcleo aplicado no Treino (papel, conta, professor, status)
    acao = "espelho";
    const resumo = await resumoDoPrincipal(principal.id, schema, p);
    if (!resumo) return erro("espelho_indisponivel", 502, origin);
    const espelho: ResultadoEspelho = await aplicarResumo(db, authAdmin, log, treinoUser, resumo, schema === "staging" ? "staging" : "public");
    await db.from("physiq_identidades").update({ visto_em: new Date().toISOString() }).eq("principal_user_id", principal.id);

    // W13 (F5): aluno bloqueado pelo profissional em todas as matrículas — e que não é profissional nem master (P7) — não ganha
    // sessão do Treino (o APK ≤ 3.15 não tem a trava; o app novo mostra "Acesso pausado pelo seu profissional")
    if (alunoBloqueadoSemStaff(resumo, espelho.papel)) return erro("aluno_bloqueado", 403, origin);

    // 6. sessão do Treino (o app grava com setSession; o PowerSync conecta com ela)
    acao = "sessao";
    const sessao = await emitirSessao(treinoUser.email, p);
    return json({
      access_token: sessao.access_token,
      refresh_token: sessao.refresh_token,
      expires_in: sessao.expires_in,
      expires_at: sessao.expires_at,
      token_type: sessao.token_type ?? "bearer",
      treino_user_id: treinoUserId,
      papel: espelho.papel,
      vinculo: origemVinculo,
      espelho,
    }, 200, origin);
  } catch (e) {
    log.excecao(e, { acao, schema });
    return erro("erro_interno", 500, origin);
  }
});
