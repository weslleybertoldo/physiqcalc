// Physiq restaurar-login (30/10/2026) — restaurar-login (banco principal): o celular NOVO entra sozinho na mesma conta com a chave de volta
// do Android (API Restore Credentials; a regra "Zero-Tap Sign-In" da Google Play de abr/2027). PÚBLICA: o aparelho ainda não tem login.
// Desenho: physiqcalc-scratch/restaurar-login/desenho.md (§4.4 o fluxo, §4.6 o que o servidor confere, §5 opção A).
//
// POST, headers: x-schema: public|staging (+ apikey). Sem JWT. Corpo:
//   { acao: "opcoes" }            → 200 { ok: true, opcoes } (PublicKeyCredentialRequestOptionsJSON). O desafio de entrar é SEM ESTADO
//                                   (revisão de segurança, achado 4): validade + aleatório + HMAC com o segredo RESTAURAR_LOGIN_SEGREDO —
//                                   nada é gravado (ninguém sem conta enche tabela nem derruba a restauração de todos); vale 5 min.
//   { acao: "entrar", resposta }  → 200 { ok: true, sessao: { access_token, refresh_token, expires_in, expires_at, token_type, user: { id } } }
//                                   (o mesmo formato da entrar-senha: o app grava com setSession)
//   A conferência, NA ORDEM: o desafio do clientDataJSON é nosso, deste schema e não venceu (HMAC) → restauracao_chave (a chave ATIVA, com a
//   sessão que a registrou ainda viva e a dona não excluída) → tipo, origem do app, RP ID, id, userHandle, UP, assinatura e contador
//   (_shared/restaurar-login-regras.ts › conferirEntrada) → a recusa da dona pelo banco (trava, so_teste, staging só teste, master — DEPOIS
//   da assinatura: os 403 não viram oráculo) → a pessoa no Auth (getUserById: desativada, e-mail confirmado só pelo email_confirmed_at, o
//   master pelo papel) → restauracao_gastar (no máximo 3 entradas por chave por hora; o desafio gasto: uso único; o contador) → a sessão.
// Recusas: 200 { ok: false, erro: "desligado" } (a trava app_config.restaurar_login desligada; o so_teste com conta que não é de teste; o
//          schema sem a migração — falha FECHADA: sem a trava, nada é conferido nem gravado) · 401 chave_invalida SÓ quando a chave não vale
//          mais (não existe, apagada, vencida, a sessão dela acabou, a dona saiu — o app apaga a chave do aparelho; 2ª revisão, achado 2) ·
//          409 desafio_invalido (o desafio repetido, vencido ou de outro segredo — o app tenta na próxima abertura) · 403 conferencia_falhou
//          (a resposta do Android não confere: assinatura, UP, contador, origem, RP, userHandle — o motivo exato só no log; o app espera 7
//          dias, sem apagar) · 403 conta_real_no_staging · conta_master · acesso_desativado · email_nao_confirmado · 429 muitas_tentativas
//          (o freio por IP e o limite por chave) · 400 dados_invalidos · acao_invalida · schema_invalido · 405 metodo · 413 corpo_grande ·
//          503 indisponivel
// A sessão (decisão D1 = a opção A do desenho; o molde é o emitirSessao da trocar-token): conferida a chave, o e-mail sai do DONO DA CHAVE
// (getUserById) — nunca do pedido —, o link de uso único (recovery: para e-mail que não existe o Auth responde 404 e NÃO cria conta, o que o
// magiclink faria — achado 8) é pedido E GASTO aqui dentro (POST /auth/v1/verify com o token_hash) e só a sessão volta. O link que voltar
// de outra pessoa (o e-mail trocou de dono no meio) não é usado: 503 e o aviso. Nenhum e-mail sai; a chave de servidor fica só aqui (o
// visitante não tem sessão e o generate_link é só de servidor); a chave JWT do projeto não muda. Efeitos no Auth (anotados no desenho): o
// log do Auth mostra "recuperação" + "entrou" (AMR otp) e um "esqueci a senha" pendente da pessoa perde a validade.
// Freios: 30 pedidos por minuto por IP nesta instância (o IP de verdade vem do Worker: x-physiq-ip + PROXY_SEGREDO, como a entrar-senha); o
// desafio vale 5 min e 1 vez; no máximo 3 entradas por chave por hora (o banco); a trava é lida com cache de 60 s — e o banco a confere de
// novo em cada RPC, com o so_teste e o staging só teste (desligar vale na hora).
// Log: só códigos, o schema e o começo do id da chave — nunca o e-mail, os tokens, a resposta do Android ou o corpo do Auth.
// verify_jwt = false (ninguém tem sessão ainda). PUBLICAR SÓ ASSIM:
//   scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions restaurar-login false
// Segredos: RESTAURAR_LOGIN_SEGREDO (o HMAC do desafio de entrar: 32 bytes em base64url; o valor no cofre B Code Segredos › PhysiqCalc ›
// "Physiq — RESTAURAR_LOGIN_SEGREDO (restaurar-login)"; sem ele a função responde 503 e avisa) + PROXY_SEGREDO (o mesmo do Worker
// physiq-principal-api) + os automáticos (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
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
  conferirDesafioEntrar,
  conferirEntrada,
  criarDesafioEntrar,
  desafioDaResposta,
  hexParaBytes,
  lerRespostaEntrada,
  lerTrava,
  opcoesDeEntrada,
  recusaDaPessoa,
  refDaChave,
  segredoDoDesafio,
  sessaoParaApp,
  type LibWebAuthn,
  type Trava,
  type UsuarioDaChave,
} from "../_shared/restaurar-login-regras.ts";
import { TEMPO_MS, buscarComTempo, prazo, type Prazo } from "../_shared/tempo.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PROXY_SEGREDO = Deno.env.get("PROXY_SEGREDO") || "";
/** O segredo do HMAC do desafio de entrar (achado 4). Sem ele: 503 e o aviso (nunca um desafio sem marca). */
const SEGREDO_DO_DESAFIO = segredoDoDesafio(Deno.env.get("RESTAURAR_LOGIN_SEGREDO"));
/** O tipo do link de uso único: recovery (para e-mail que não existe o Auth responde 404, sem criar conta — achado 8). */
const TIPO_DO_LINK = "recovery";
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
async function emitirSessao(email: string, userId: string, p: Prazo): Promise<unknown> {
  const cab = { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" };
  const g = await buscarComTempo(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: cab,
    body: JSON.stringify({ type: TIPO_DO_LINK, email }),
  }, Math.min(TEMPO_MS.gotruePrincipal, p.restante()));
  const link = (await g.json().catch(() => null)) as Record<string, unknown> | null;
  const hashed = link?.hashed_token ?? (link?.properties as Record<string, unknown> | undefined)?.hashed_token;
  if (g.status !== 200 || typeof hashed !== "string" || !hashed) throw new FalhaDoAuth(`generate_link_${g.status}`);
  // o link é da DONA da chave? (o e-mail pode ter mudado de dono entre o getUserById e aqui): de outra pessoa → não usa (achado 8)
  const idDoLink = link?.id ?? (link?.user as Record<string, unknown> | undefined)?.id;
  if (idDoLink !== userId) throw new FalhaDoAuth("generate_link_outra_pessoa");
  const v = await buscarComTempo(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: cab,
    body: JSON.stringify({ type: "email", token_hash: hashed }),
  }, Math.min(TEMPO_MS.gotruePrincipal, p.restante()));
  const sessao = await v.json().catch(() => null);
  if (v.status !== 200) throw new FalhaDoAuth(`verify_${v.status}`);
  return sessao;
}

/** { acao: "opcoes" }: o desafio de entrar, assinado aqui (sem estado: nada vai ao banco). */
async function opcoes(schema: Schema, segredo: Uint8Array, origin: string | null): Promise<Response> {
  return json({ ok: true, opcoes: opcoesDeEntrada(await criarDesafioEntrar(segredo, schema)) }, 200, origin);
}

/** A recusa que o banco devolve (restauracao_chave e restauracao_gastar) → a resposta (o resto: chave_invalida, 401). */
function recusaDoBanco(erro: unknown, schema: Schema, ref: string, origin: string | null): Response {
  if (erro === "desligado") return recusa("desligado", origin);
  if (erro === "muitas_tentativas") {
    log.aviso({ codigo: "limite_da_chave", schema, acao: "entrar", ref });
    return recusa("muitas_tentativas", origin);
  }
  if (erro === "conta_real_no_staging" || erro === "conta_master") {
    log.aviso({ codigo: erro, schema, acao: "entrar", ref });
    return recusa(erro, origin);
  }
  if (erro === "desafio_invalido") {
    // o desafio já foi gasto (a mesma resposta 2 vezes) ou venceu no meio: "tente depois", nunca "a chave morreu" (2ª revisão, achado 2)
    log.aviso({ codigo: "desafio_ja_usado", schema, acao: "entrar", ref });
    return recusa("desafio_invalido", origin);
  }
  // a chave não existe, foi apagada ou venceu, a sessão dela acabou, a dona saiu: o ÚNICO 401 (o app apaga a chave do aparelho)
  log.aviso({ codigo: "chave_apagada_ou_desconhecida", schema, acao: "entrar", ref });
  return recusa("chave_invalida", origin);
}

/**
 * { acao: "entrar", resposta }: o desafio (HMAC) → a chave ativa → a assinatura → a recusa da dona (banco) → a pessoa (Auth) → o desafio
 * gasto + o limite por chave + o contador → a sessão.
 */
async function entrar(db: SupabaseClient, schema: Schema, corpo: Record<string, unknown>, trava: Trava, segredo: Uint8Array, p: Prazo,
  origin: string | null): Promise<Response> {
  const resposta = lerRespostaEntrada(corpo.resposta);
  if (!resposta) return recusa("dados_invalidos", origin);
  const ref = refDaChave(resposta.id);
  const desafio = desafioDaResposta(resposta);
  const d = desafio ? await conferirDesafioEntrar(desafio, segredo, schema) : null;
  if (!desafio || !d || d.ok === false) {
    log.aviso({ codigo: d && d.ok === false ? `desafio_${d.motivo}` : "desafio_invalido", schema, acao: "entrar", ref });
    return recusa("desafio_invalido", origin);
  }
  const { data: kc, error: ek } = await db.rpc("restauracao_chave", { p_credencial: resposta.id });
  if (ek) throw ek;
  const k = (kc ?? {}) as { ok?: unknown; erro?: unknown; user_id?: unknown; chave?: unknown; contador?: unknown; recusa?: unknown };
  if (k.ok !== true) return recusaDoBanco(k.erro, schema, ref, origin);
  const chavePublica = hexParaBytes(k.chave);
  if (!chavePublica || typeof k.user_id !== "string") throw new Error("restauracao_chave_fora_do_formato");
  const userId = k.user_id;
  const conf = await conferirEntrada(resposta, {
    desafio,
    schema,
    chave: { credencialId: resposta.id, userId, chavePublica, contador: Number(k.contador) || 0 },
  }, LIB);
  if (conf.ok === false) {
    // a resposta do Android não confere (assinatura, UP, contador, origem, RP): não é "a chave morreu" — o app espera, sem apagar
    log.aviso({ codigo: conf.motivo, schema, acao: "entrar", ref });
    return recusa("conferencia_falhou", origin);
  }
  // a recusa da dona pelo banco (o so_teste e o staging só teste de agora, sem o cache; o master pelo perfil — achados 2 e 6)
  if (k.recusa !== null && k.recusa !== undefined) return recusaDoBanco(k.recusa, schema, ref, origin);
  // a pessoa dona da chave (o e-mail sai daqui, nunca do pedido)
  const { data: ud, error: eg } = await db.auth.admin.getUserById(userId);
  if (eg && (eg as { status?: unknown }).status !== 404) throw eg;
  const pessoa = (ud?.user ?? null) as UsuarioDaChave | null;
  const motivo = recusaDaPessoa(pessoa, { schema, soTeste: trava.soTeste });
  if (motivo) {
    log.aviso({ codigo: motivo === "desligado" ? "so_conta_de_teste" : motivo, schema, acao: "entrar", ref });
    return recusa(motivo, origin);
  }
  // só agora o desafio é gasto (uso único), com o limite por chave e o contador
  const { data: gd, error: egd } = await db.rpc("restauracao_gastar", {
    p_desafio: desafio,
    p_credencial: resposta.id,
    p_contador: conf.novoContador,
    p_expira: new Date(d.expiraEm * 1000).toISOString(),
  });
  if (egd) throw egd;
  const g = (gd ?? {}) as { ok?: unknown; erro?: unknown };
  if (g.ok !== true) return recusaDoBanco(g.erro, schema, ref, origin);
  const sessao = sessaoParaApp(await emitirSessao(pessoa!.email!, userId, p), userId);
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
    // sem o segredo do desafio, nada de desafio sem marca: 503 e o aviso
    if (!SEGREDO_DO_DESAFIO) {
      log.erro({ codigo: "sem_segredo_do_desafio", schema, acao });
      return recusa("indisponivel", origin);
    }
    if (acao === "opcoes") return await opcoes(schema, SEGREDO_DO_DESAFIO, origin);
    return await entrar(db, schema, corpo, trava, SEGREDO_DO_DESAFIO, p, origin);
  } catch (e) {
    if (e instanceof FalhaDoAuth) {
      log.erro({ codigo: e.codigo, schema, acao });
      return recusa("indisponivel", origin);
    }
    log.excecao(e, { schema, acao });
    return recusa("indisponivel", origin);
  }
});
