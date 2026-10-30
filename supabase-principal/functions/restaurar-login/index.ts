// Physiq restaurar-login (30/10/2026) — restaurar-login (banco principal): o celular NOVO entra sozinho na mesma conta com a chave de volta
// do Android (API Restore Credentials; a regra "Zero-Tap Sign-In" da Google Play de abr/2027). PÚBLICA: o aparelho ainda não tem login.
// Desenho: physiqcalc-scratch/restaurar-login/desenho.md (§4.4 o fluxo, §4.6 o que o servidor confere, §5 opção A).
//
// POST, headers: x-schema: public|staging (+ apikey). Sem JWT. Corpo:
//   { acao: "opcoes" }            → 200 { ok: true, opcoes } (PublicKeyCredentialRequestOptionsJSON; o desafio 'entrar': 5 min, uso único)
//   { acao: "entrar", resposta }  → 200 { ok: true, sessao: { access_token, refresh_token, expires_in, expires_at, token_type, user: { id } } }
//                                   (o mesmo formato da entrar-senha: o app grava com setSession)
//   A conferência (_shared/restaurar-login-regras.ts › conferirEntrada): o desafio do clientDataJSON é GASTO no banco antes de tudo
//   (restauracao_usar: uso único, vencido ou não; devolve a chave SÓ se ativa) → tipo, origem do app, RP ID, id, userHandle, assinatura e
//   contador → a pessoa dona da chave (Auth admin getUserById: existe, staging só conta de TESTE, so_teste, não desativada, e-mail
//   confirmado) → restauracao_concluir (contador, usada_em, usos) → a sessão.
// Recusas: 200 { ok: false, erro: "desligado" } (a trava app_config.restaurar_login desligada; o so_teste com conta que não é de teste; o
//          schema sem a migração — falha FECHADA: sem a trava, nada é conferido nem gravado) · 401 chave_invalida (desafio, origem, RP, tipo,
//          assinatura, contador, userHandle ou chave apagada — o motivo exato só no log) · 403 conta_real_no_staging · acesso_desativado ·
//          email_nao_confirmado · 400 dados_invalidos · acao_invalida · schema_invalido · 405 metodo · 413 corpo_grande · 429
//          muitas_tentativas · 503 indisponivel
// A sessão (decisão D1 = a opção A do desenho; o molde é o emitirSessao da trocar-token): conferida a chave, o e-mail sai do DONO DA CHAVE
// (getUserById) — nunca do pedido; o generate_link de um e-mail que não existe criaria a conta —, o link de uso único (magiclink) é pedido E
// GASTO aqui dentro (POST /auth/v1/verify com o token_hash) e só a sessão volta. Nenhum e-mail sai; a chave de servidor fica só aqui (o
// visitante não tem sessão e o generate_link é só de servidor); a chave JWT do projeto não muda. Efeitos no Auth (anotados no desenho): o
// log do Auth mostra "recuperação" + "entrou" (AMR otp) e um "esqueci a senha" pendente da pessoa perde a validade.
// Freios: 30 pedidos por minuto por IP nesta instância (o IP de verdade vem do Worker: x-physiq-ip + PROXY_SEGREDO, como a entrar-senha); o
// desafio vale 5 min e 1 vez; o banco segura no máximo 1000 desafios vivos; a trava é lida com cache de 60 s — e o banco a confere de novo
// em cada RPC (desligar vale na hora).
// Log: só códigos, o schema e o começo do id da chave — nunca o e-mail, os tokens, a resposta do Android ou o corpo do Auth.
// verify_jwt = false (ninguém tem sessão ainda). PUBLICAR SÓ ASSIM:
//   scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions restaurar-login false
// Segredos: PROXY_SEGREDO (o mesmo do Worker physiq-principal-api) + os automáticos (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { verifyAuthenticationResponse, verifyRegistrationResponse } from "jsr:@simplewebauthn/server@13.3.3";
import { decodeCredentialPublicKey } from "jsr:@simplewebauthn/server@13.3.3/helpers";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { ipDoPedido } from "../_shared/entrar-senha-regras.ts";
import { criarLog } from "../_shared/log.ts";
import { origemPermitida } from "../_shared/login-regras.ts";
import { schemaDoPedido, type Schema } from "../_shared/master-regras.ts";
import {
  LIMITE_CORPO,
  STATUS_DA_RECUSA,
  conferirEntrada,
  desafioDaResposta,
  hexParaBytes,
  lerRespostaEntrada,
  lerTrava,
  opcoesDeEntrada,
  recusaDaPessoa,
  refDaChave,
  sessaoParaApp,
  type LibWebAuthn,
  type Trava,
  type UsuarioDaChave,
} from "../_shared/restaurar-login-regras.ts";
import { TEMPO_MS, buscarComTempo, prazo, type Prazo } from "../_shared/tempo.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PROXY_SEGREDO = Deno.env.get("PROXY_SEGREDO") || "";
const log = criarLog("restaurar-login", { avisar: avisarErro });
const LIB = { verifyRegistrationResponse, verifyAuthenticationResponse, decodeCredentialPublicKey } as unknown as LibWebAuthn;
/** O prazo de um pedido inteiro: a 1ª abertura do app espera cerca de 8 s no Carregando (as 2 chamadas). */
const ORCAMENTO_MS = 7_000;

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
const recusa = (erro: keyof typeof STATUS_DA_RECUSA, origin: string | null) => json({ ok: false, erro }, STATUS_DA_RECUSA[erro], origin);

// freio da instância contra rajada (antes do banco): 30 pedidos por minuto por IP (uma restauração = 2 pedidos)
const janelas = new Map<string, number[]>();
function permitido(chave: string, max = 30, janelaMs = 60_000): boolean {
  const agora = Date.now();
  const validos = (janelas.get(chave) ?? []).filter((t) => t > agora - janelaMs);
  if (validos.length >= max) {
    janelas.set(chave, validos);
    return false;
  }
  validos.push(agora);
  janelas.set(chave, validos);
  if (janelas.size > 5000) janelas.clear();
  return true;
}

// a trava (app_config.restaurar_login, publica = false) — 60 s em memória por schema; sem a linha (o public antes da liberação) = desligado
const travas = new Map<Schema, { em: number; valor: Trava }>();
async function lerTravaDoSchema(db: SupabaseClient, schema: Schema): Promise<Trava> {
  const c = travas.get(schema);
  if (c && Date.now() - c.em < 60_000) return c.valor;
  const { data, error } = await db.from("app_config").select("valor").eq("chave", "restaurar_login").eq("publica", false).maybeSingle();
  if (error) throw error;
  const valor = lerTrava((data as { valor?: unknown } | null)?.valor);
  travas.set(schema, { em: Date.now(), valor });
  return valor;
}

/** O corpo JSON (objeto), lido até o limite: "grande" (413) ou null (não é um objeto JSON). */
async function lerCorpo(req: Request): Promise<Record<string, unknown> | null | "grande"> {
  if (Number(req.headers.get("content-length") || 0) > LIMITE_CORPO) return "grande";
  const bruto = await req.text();
  if (bruto.length > LIMITE_CORPO) return "grande";
  try {
    const v = JSON.parse(bruto);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** O Auth respondeu fora do esperado no generate_link ou no verify: só o código (o corpo traz o e-mail e o token). */
class FalhaDoAuth extends Error {
  constructor(readonly codigo: string) {
    super(codigo);
    this.name = "FalhaDoAuth";
  }
}

/**
 * A opção A: o link de uso único gerado pelo servidor e gasto aqui mesmo → a sessão do Auth (access + refresh), sem e-mail nenhum. Cada
 * chamada espera no máximo o tempo do GoTrue dentro do prazo do pedido. O /verify vai com a chave de servidor: o captcha global do Auth
 * (W28) não entra no caminho.
 */
async function emitirSessao(email: string, p: Prazo): Promise<unknown> {
  const cab = { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" };
  const g = await buscarComTempo(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: cab,
    body: JSON.stringify({ type: "magiclink", email }),
  }, Math.min(TEMPO_MS.gotruePrincipal, p.restante()));
  const link = (await g.json().catch(() => null)) as Record<string, unknown> | null;
  const hashed = link?.hashed_token ?? (link?.properties as Record<string, unknown> | undefined)?.hashed_token;
  if (g.status !== 200 || typeof hashed !== "string" || !hashed) throw new FalhaDoAuth(`generate_link_${g.status}`);
  const v = await buscarComTempo(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: cab,
    body: JSON.stringify({ type: "email", token_hash: hashed }),
  }, Math.min(TEMPO_MS.gotruePrincipal, p.restante()));
  const sessao = await v.json().catch(() => null);
  if (v.status !== 200) throw new FalhaDoAuth(`verify_${v.status}`);
  return sessao;
}

/** { acao: "opcoes" }: o desafio 'entrar' (o banco confere a trava de novo e o teto de vivos). */
async function opcoes(db: SupabaseClient, schema: Schema, origin: string | null): Promise<Response> {
  const { data, error } = await db.rpc("restauracao_desafio_entrar");
  if (error) throw error;
  const r = (data ?? {}) as { ok?: unknown; erro?: unknown; desafio?: unknown };
  if (r.ok !== true || typeof r.desafio !== "string") {
    if (r.erro === "muitas_tentativas") {
      log.aviso({ codigo: "desafios_no_teto", schema, acao: "opcoes" });
      return recusa("muitas_tentativas", origin);
    }
    return recusa("desligado", origin);
  }
  return json({ ok: true, opcoes: opcoesDeEntrada(r.desafio) }, 200, origin);
}

/** { acao: "entrar", resposta }: o desafio gasto → a conferência → a pessoa → o contador → a sessão. */
async function entrar(db: SupabaseClient, schema: Schema, corpo: Record<string, unknown>, trava: Trava, p: Prazo, origin: string | null): Promise<Response> {
  const resposta = lerRespostaEntrada(corpo.resposta);
  if (!resposta) return recusa("dados_invalidos", origin);
  const ref = refDaChave(resposta.id);
  const desafio = desafioDaResposta(resposta);
  if (!desafio) {
    log.aviso({ codigo: "desafio_invalido", schema, acao: "entrar", ref });
    return recusa("chave_invalida", origin);
  }
  // o desafio é gasto ANTES da conferência (uso único: a mesma resposta não serve 2 vezes, certa ou errada)
  const { data: uso, error: eu } = await db.rpc("restauracao_usar", { p_desafio: desafio, p_credencial: resposta.id });
  if (eu) throw eu;
  const u = (uso ?? {}) as { ok?: unknown; erro?: unknown; user_id?: unknown; chave?: unknown; contador?: unknown };
  if (u.ok !== true) {
    if (u.erro === "desligado") return recusa("desligado", origin);
    const motivoDoBanco = u.erro === "desafio_invalido" ? "desafio_invalido" : "chave_apagada_ou_desconhecida";
    log.aviso({ codigo: motivoDoBanco, schema, acao: "entrar", ref });
    return recusa("chave_invalida", origin);
  }
  const chavePublica = hexParaBytes(u.chave);
  if (!chavePublica || typeof u.user_id !== "string") throw new Error("restauracao_usar_fora_do_formato");
  const userId = u.user_id;
  const conf = await conferirEntrada(resposta, {
    desafio,
    schema,
    chave: { credencialId: resposta.id, userId, chavePublica, contador: Number(u.contador) || 0 },
  }, LIB);
  if (conf.ok === false) {
    log.aviso({ codigo: conf.motivo, schema, acao: "entrar", ref });
    return recusa("chave_invalida", origin);
  }
  // a pessoa dona da chave (o e-mail sai daqui, nunca do pedido)
  const { data: ud, error: eg } = await db.auth.admin.getUserById(userId);
  if (eg && (eg as { status?: unknown }).status !== 404) throw eg;
  const pessoa = (ud?.user ?? null) as UsuarioDaChave | null;
  const motivo = recusaDaPessoa(pessoa, { schema, soTeste: trava.soTeste });
  if (motivo) {
    log.aviso({ codigo: motivo === "desligado" ? "so_conta_de_teste" : motivo, schema, acao: "entrar", ref });
    return recusa(motivo, origin);
  }
  const { data: fim, error: ef } = await db.rpc("restauracao_concluir", { p_credencial: resposta.id, p_contador: conf.novoContador });
  if (ef) throw ef;
  if ((fim as { ok?: unknown } | null)?.ok !== true) {
    // apagada entre o restauracao_usar e aqui (o Sair no aparelho velho, ao mesmo tempo)
    log.aviso({ codigo: "chave_apagada_no_meio", schema, acao: "entrar", ref });
    return recusa("chave_invalida", origin);
  }
  const sessao = sessaoParaApp(await emitirSessao(pessoa!.email!, p), userId);
  if (!sessao) {
    log.erro({ codigo: "sessao_invalida", schema, acao: "entrar", ref });
    return recusa("indisponivel", origin);
  }
  log.info({ codigo: "restaurado", schema, acao: "entrar", ref, resultado: conf.novoContador > 0 ? "com_contador" : "contador_zero" });
  return json({ ok: true, sessao }, 200, origin);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ ok: false, erro: "metodo" }, 405, origin);
  const schema = schemaDoPedido(req.headers.get("x-schema"));
  if (!schema) return json({ ok: false, erro: "schema_invalido" }, 400, origin);
  const ip = ipDoPedido(req.headers, PROXY_SEGREDO);
  if (!permitido(`${schema}:${ip ?? "sem-ip"}`)) {
    log.aviso({ codigo: "muitas_tentativas", schema });
    return recusa("muitas_tentativas", origin);
  }
  const corpo = await lerCorpo(req);
  if (corpo === "grande") return json({ ok: false, erro: "corpo_grande" }, 413, origin);
  if (!corpo) return recusa("dados_invalidos", origin);
  const acao = corpo.acao;
  if (acao !== "opcoes" && acao !== "entrar") return json({ ok: false, erro: "acao_invalida" }, 400, origin);

  const p = prazo(ORCAMENTO_MS);
  const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
    db: { schema: schema as "public" },
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (entrada: string | URL | Request, init?: RequestInit) => buscarComTempo(entrada, init ?? {}, Math.max(1, p.restante())) },
  });
  try {
    // falha FECHADA: sem a trava ligada (ou sem a linha — o public antes da liberação), nada é conferido nem gravado
    const trava = await lerTravaDoSchema(db, schema);
    if (!trava.ligado) return recusa("desligado", origin);
    if (acao === "opcoes") return await opcoes(db, schema, origin);
    return await entrar(db, schema, corpo, trava, p, origin);
  } catch (e) {
    if (e instanceof FalhaDoAuth) {
      log.erro({ codigo: e.codigo, schema, acao });
      return recusa("indisponivel", origin);
    }
    log.excecao(e, { schema, acao });
    return recusa("indisponivel", origin);
  }
});
