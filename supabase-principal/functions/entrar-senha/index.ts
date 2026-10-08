// Physiq W8b — entrar-senha (banco principal): a porta do "Entrar com e-mail e senha" do Physiq, com o limite de tentativas NO
// SERVIDOR (regra dele, 29/09 ~22:35): 4 senhas erradas → 1 min; cada erro depois sobe 5 → 15 → 30 → 60 min; o seguinte bloqueia
// DE VEZ (até a senha certa é recusada) — destrava com uma senha nova do profissional/master ou entrando com o Google.
// O gancho "Password Verification Attempt" do Auth não existe no plano Free (402 na Management API) → este é o caminho:
//   1. captcha invisível (Cloudflare Turnstile) conferido aqui (siteverify + token de uso único, login_captcha_usar) — sem ele,
//      nada é contado nem conferido;
//   2. login_iniciar: IP passou do limite da janela? conta bloqueada (tempo ou de vez)? outra tentativa em andamento?
//   3. GoTrue (POST /auth/v1/token?grant_type=password, como o app fazia) — a senha é conferida pelo próprio Auth;
//   4. login_concluir: acerto zera; senha errada conta e aplica a escada; o resto (rede, acesso desativado) não conta;
//   5. devolve a sessão (o app grava com setSession) ou o estado do bloqueio (o app mostra o tempo que falta).
// Risco que sobra (anotado na W8b): quem chamar o /auth/v1/token direto não passa por aqui (só o limite por IP do próprio Auth
// segura) — o captcha global do Auth fica para a W28, quando o site antigo do Nutri (que entra direto) sair do ar.
//
// POST, headers: x-schema: public|staging (+ apikey). Corpo: { email, senha, captcha }. Sem JWT (a pessoa ainda não entrou).
// 200 → { ok: true, sessao: <resposta do GoTrue> }
// 400 senha_errada {erros, restam, bloqueado_ate, agora} · bloqueado_de_vez · captcha_invalido · dados_invalidos
// 423 bloqueado {bloqueado_ate, agora} · bloqueado_de_vez · muitas_tentativas_rede {bloqueado_ate} · em_andamento
// 403 acesso_desativado · email_nao_confirmado · conta_real_no_staging · 429 limite_servidor · 503 indisponivel
// verify_jwt = false (ninguém tem sessão ainda). PUBLICAR SÓ ASSIM:
//   scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions entrar-senha false
// Segredos: TURNSTILE_SECRET (cofre › PhysiqCalc › "Physiq — Cloudflare Turnstile (entrar com senha, W8b)"), LOGIN_IP_SAL,
// PROXY_SEGREDO (o mesmo do Worker physiq-principal-api) (+ os automáticos).
// hml-10 (H-24, H-25, H-26): log em JSON pelo _shared/log.ts (do GoTrue, só o status e o código do erro — nunca o corpo, que
// pode trazer a sessão ou o e-mail); LOGIN_IP_SAL sem reserva: sem ele (ou com menos de 16 caracteres) não há conta por IP —
// 503 indisponivel + log.erro, nada é conferido (falha fechada; o segredo existe); o catch final avisa (log.excecao).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { criarLog } from "../_shared/log.ts";
import { emailDeTeste, origemPermitida } from "../_shared/login-regras.ts";
import {
  captchaAceito,
  categoriaGoTrue,
  corpoRecusa,
  corpoSenhaErrada,
  hashDoIp,
  hashDoToken,
  ipDoPedido,
  lerPedido,
  motivoDoCaptcha,
  type EstadoBloqueio,
} from "../_shared/entrar-senha-regras.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET") || "";
const LOGIN_IP_SAL = Deno.env.get("LOGIN_IP_SAL") || "";
const PROXY_SEGREDO = Deno.env.get("PROXY_SEGREDO") || "";
const SCHEMAS = ["public", "staging"];
/** O sal do hash do IP (login_iniciar conta as tentativas por IP): menor que isto não serve. */
const SAL_MINIMO = 16;
const log = criarLog("entrar-senha", { avisar: avisarErro });

function cors(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origemPermitida(origin) ? origin! : "https://physiqcalc.com.br",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-schema",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors(origin) },
  });

// freio da instância contra rajada (antes do captcha e do banco): 40 pedidos por minuto por IP
const janelas = new Map<string, number[]>();
function permitido(chave: string, max = 40, janelaMs = 60_000): boolean {
  const agora = Date.now();
  const validos = (janelas.get(chave) ?? []).filter((t) => t > agora - janelaMs);
  if (validos.length >= max) { janelas.set(chave, validos); return false; }
  validos.push(agora);
  janelas.set(chave, validos);
  if (janelas.size > 5000) janelas.clear();
  return true;
}

// regras do banco (captcha ligado/desligado) — 60 s em memória por schema
const regrasCache = new Map<string, { em: number; valor: Record<string, unknown> }>();
async function regras(db: { rpc: (fn: string) => PromiseLike<{ data: unknown; error: unknown }> }, schema: string): Promise<Record<string, unknown>> {
  const c = regrasCache.get(schema);
  if (c && Date.now() - c.em < 60_000) return c.valor;
  const { data, error } = await db.rpc("login_regras");
  const valor = !error && data && typeof data === "object" ? (data as Record<string, unknown>) : { captcha: true };
  regrasCache.set(schema, { em: Date.now(), valor });
  return valor;
}

/** "aceito" | "recusado" | "indisponivel" (o Cloudflare não respondeu — quem chama RECUSA: falha fechada, homologação H-17). */
async function conferirCaptcha(token: string, ip: string | null, schema: string): Promise<"aceito" | "recusado" | "indisponivel"> {
  if (!token) return "recusado";
  const corpo = new URLSearchParams({ secret: TURNSTILE_SECRET, response: token });
  if (ip) corpo.set("remoteip", ip);
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), 8000);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: corpo, signal: controle.signal });
    if (r.status >= 500) return "indisponivel";
    const d = await r.json().catch(() => null);
    if (!d) return "indisponivel";
    if (!captchaAceito(d)) {
      log.aviso({ codigo: "captcha_recusado", schema, resultado: motivoDoCaptcha(d) });
      return "recusado";
    }
    return "aceito";
  } catch (e) {
    log.excecao(e, { codigo: "siteverify_fora", schema });
    return "indisponivel";
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ ok: false, erro: "metodo" }, 405, origin);
  const schema = (req.headers.get("x-schema") || "public").toLowerCase();
  if (!SCHEMAS.includes(schema)) return json({ ok: false, erro: "schema_invalido" }, 400, origin);
  // hml-10 (D3): sem o sal não há conta por IP — ninguém entra por aqui até o segredo voltar (falha fechada; a tela mostra o
  // "indisponivel" de sempre)
  if (LOGIN_IP_SAL.length < SAL_MINIMO) {
    log.erro({ codigo: "sem_configuracao", schema, msg: LOGIN_IP_SAL ? "LOGIN_IP_SAL curto" : "falta LOGIN_IP_SAL" });
    return json({ ok: false, erro: "indisponivel" }, 503, origin);
  }

  const lido = lerPedido(await req.json().catch(() => null));
  if (!lido.ok) return json({ ok: false, erro: lido.erro }, 400, origin);
  const { email, senha, captcha } = lido.pedido;
  // staging só aceita conta de teste (P26) — nem conta a tentativa de uma conta real
  if (schema === "staging" && !emailDeTeste(email)) return json({ ok: false, erro: "conta_real_no_staging" }, 403, origin);

  const ip = ipDoPedido(req.headers, PROXY_SEGREDO);
  if (!permitido(`${schema}:${ip ?? "sem-ip"}`)) {
    return json({ ok: false, erro: "muitas_tentativas_rede", bloqueado_ate: new Date(Date.now() + 60_000).toISOString(), agora: new Date().toISOString() }, 423, origin);
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" }, auth: { persistSession: false } });
  try {
    const cfg = await regras(db, schema);
    if (cfg.captcha !== false) {
      // falha FECHADA (homologação, H-17): sem o segredo ou com o Cloudflare fora do ar, ninguém entra sem captcha — a tela
      // mostra o aviso do captcha_invalido ("Não deu para confirmar que é você. Tente de novo.")
      const v = TURNSTILE_SECRET ? await conferirCaptcha(captcha, ip, schema) : "indisponivel";
      if (v !== "aceito") {
        if (v === "indisponivel") {
          log.erro({ codigo: "captcha_indisponivel", schema, acao: "entrar", resultado: TURNSTILE_SECRET ? "siteverify" : "sem_turnstile_secret" });
        }
        return json({ ok: false, erro: "captcha_invalido" }, 400, origin);
      }
      // o siteverify aceita o MESMO token mais de uma vez (medido em 30/09): aqui cada token vale UMA tentativa
      const { data: primeiro, error: eu } = await db.rpc("login_captcha_usar", { p_hash: await hashDoToken(captcha) });
      if (eu) throw eu;
      if (primeiro !== true) return json({ ok: false, erro: "captcha_invalido" }, 400, origin);
    }

    const ipHash = ip ? await hashDoIp(ip, LOGIN_IP_SAL) : null;
    const { data: ini, error: ei } = await db.rpc("login_iniciar", { p_email: email, p_ip_hash: ipHash });
    if (ei) throw ei;
    const inicio = (ini ?? {}) as EstadoBloqueio & { permitido?: boolean };
    if (inicio.permitido !== true) return json(corpoRecusa(inicio), 423, origin);

    let status = 0;
    let corpo: unknown = null;
    try {
      const controle = new AbortController();
      const timer = setTimeout(() => controle.abort(), 12_000);
      // W28: a senha é conferida no GoTrue COMO SERVIDOR (service_role) — com o captcha global do Auth ligado (o site antigo do
      // Nutri entrava direto no /auth/v1/token), a chamada de servidor não precisa do captcha do GoTrue: o Turnstile já foi
      // conferido aqui em cima, com token de uso único. O GoTrue confere a senha do mesmo jeito.
      const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
        body: JSON.stringify({ email, password: senha }),
        signal: controle.signal,
      }).finally(() => clearTimeout(timer));
      status = r.status;
      corpo = await r.json().catch(() => null);
    } catch (e) {
      log.excecao(e, { codigo: "gotrue_sem_resposta", schema });
    }

    const cat = categoriaGoTrue(status, corpo);
    const concluir = async (resultado: "ok" | "senha_errada" | "nao_conta") => {
      const { data, error } = await db.rpc("login_concluir", { p_email: email, p_resultado: resultado });
      if (error) throw error;
      return (data ?? {}) as EstadoBloqueio;
    };
    if (cat === "ok") {
      // a senha está certa e a sessão existe: um tropeço do banco ao zerar o contador não pode barrar a entrada
      await concluir("ok").catch((e) => log.excecao(e, { codigo: "zerar_contador_falhou", schema }));
      return json({ ok: true, sessao: corpo }, 200, origin);
    }
    if (cat === "senha_errada") return json(corpoSenhaErrada(await concluir("senha_errada")), 400, origin);
    await concluir("nao_conta");
    if (cat === "desativado") return json({ ok: false, erro: "acesso_desativado" }, 403, origin);
    if (cat === "nao_confirmado") return json({ ok: false, erro: "email_nao_confirmado" }, 403, origin);
    if (cat === "limite") return json({ ok: false, erro: "limite_servidor" }, 429, origin);
    // do GoTrue, só o código do erro (o corpo pode trazer o e-mail)
    const doGoTrue = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
    log.erro({ codigo: "gotrue_inesperado", schema, status, externo: { gotrue_codigo: doGoTrue.error_code ?? doGoTrue.code } });
    return json({ ok: false, erro: "indisponivel" }, 503, origin);
  } catch (e) {
    log.excecao(e, { schema });
    return json({ ok: false, erro: "indisponivel" }, 503, origin);
  }
});
