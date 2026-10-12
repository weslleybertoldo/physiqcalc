import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.9.6";
import { AsyncLocalStorage } from "node:async_hooks";
import { criarLog } from "../_shared/log.ts";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { buscarComTempo, ORCAMENTO_MS, prazo, TEMPO_MS, type Prazo } from "../_shared/tempo.ts";
import {
  ACOES_QUE_GRAVAM, COLUNAS_AVALIACOES_EVOLUCAO, COLUNAS_FOTOS_EVOLUCAO, COLUNAS_PERFIL_EVOLUCAO, FREIO_EVOLUCAO_POR_MINUTO, MAX_AVALIACOES_EVOLUCAO,
  MAX_FOTOS_EVOLUCAO, VALIDADE_URL_EVOLUCAO_S, bucketDosRegistros, caminhoDoAluno, caminhosDasFotos, criarFreio, ehAcaoDeLeitura, ehAcaoFoto,
  erroDoBanco, erroDoStorage, foiTempo, lerExclusaoDeFoto, lerPedidoDeFoto, mesRef, parteDaEvolucao, schemaDaFoto, statusDaFoto, urlsAssinadas,
  type AcaoFoto,
} from "./regras.ts";
// hml-14 (H-51 item 2): log em JSON sem dado pessoal (_shared/log.ts) — por enquanto só o GoTrue que não responde (os
// console.error de antes ficam para o resto do H-48)
const log = criarLog("admin-avaliacoes", { avisar: avisarErro });
// Ambiente: schema "public" (prod) ou "staging", resolvido por request via header x-schema.
const _ALLOWED_SCHEMAS = ["public", "staging"];
function resolveSchema(req: Request): string {
  const h = (req.headers.get("x-schema") || "public").toLowerCase();
  return _ALLOWED_SCHEMAS.includes(h) ? h : "public";
}
const schemaCtx = new AsyncLocalStorage<string>();
function currentSchema(): "public" { return (schemaCtx.getStore() || "public") as "public"; }

const ALLOWED_ORIGINS = new Set([
  "https://physiqcalc.vercel.app",
  "https://physiqcalc.com.br",
  "https://www.physiqcalc.com.br",
  "https://physiqcalc-staging.vercel.app",
  "capacitor://localhost",
  "https://localhost",
  "http://localhost:8080",
  "http://localhost:5173",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://physiqcalc.vercel.app";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-schema",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function jsonErr(msg: string, status: number, origin: string | null) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function checkRateLimit(userId: string, endpoint: string, maxCount: number, windowSecs: number): Promise<boolean> {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } });
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_user_id: userId,
      p_endpoint: endpoint,
      p_max_count: maxCount,
      p_window_secs: windowSecs,
    });
    if (error) return true; // fail-open em erro pra evitar lockout
    return data === true;
  } catch {
    return true;
  }
}

// JWT validado LOCALMENTE (JWKS do GoTrue, cacheado no isolate) — poupa a ida ao /auth/v1/user
// na VM Nano a cada chamada. Token que o JWKS não reconhece cai no getUser (compatibilidade).
// Sessão revogada só é percebida quando o token expira (1 h) — por isso só a LEITURA (list) usa este caminho;
// as ações que gravam passam pelo usuarioDaSessao (hml-14, H-51 item 2).
const JWKS = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
async function usuarioDoToken(token: string, auth: string): Promise<any | null> {
  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: `${SUPABASE_URL}/auth/v1`, audience: "authenticated" });
    if (payload.sub) {
      const p = payload as Record<string, unknown>;
      return { id: payload.sub, email: (p.email as string | undefined) ?? null, app_metadata: (p.app_metadata as Record<string, unknown>) ?? {}, user_metadata: (p.user_metadata as Record<string, unknown>) ?? {} };
    }
  } catch (_e) { /* assinatura/alg/kid desconhecido → getUser */ }
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(SUPABASE_URL, anon, { global: { headers: { Authorization: auth } } });
  const { data, error } = await userClient.auth.getUser(token);
  return error || !data?.user ? null : data.user;
}

// hml-14 (H-51 item 2): quem GRAVA confere a sessão no GoTrue a cada pedido (GET /auth/v1/user — o getUser): "sair de todos",
// a conta apagada e o papel tirado valem na hora (pelo JWKS, o token seguia valendo até vencer: 1 h). Resposta 4xx = o token
// não vale mais (null → 401); sem resposta em TEMPO_MS.gotrueTreino, rede ou 5xx → lança (quem chama responde o 500 de sempre).
async function usuarioDaSessao(auth: string): Promise<any | null> {
  const r = await buscarComTempo(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY")!, Authorization: auth },
  }, TEMPO_MS.gotrueTreino);
  if (!r.ok) {
    await r.body?.cancel().catch(() => undefined);
    if (r.status >= 400 && r.status < 500) return null;
    throw new Error(`gotrue_${r.status}`);
  }
  const u = await r.json();
  return u && typeof u === "object" && typeof u.id === "string" ? u : null;
}

// ---- SaaS (12/09/2026): papéis master (role admin|master) e professor; escopo por professor_id ----
type Papel = "master" | "professor";
function papelDe(role: unknown): Papel | null {
  if (role === "admin" || role === "master") return "master";
  if (role === "professor") return "professor";
  return null;
}
// endpoints que o professor TRAVADO (plano vencido) ainda pode usar
const SEM_ACESSO_OK = new Set<string>(["mp-payments"]);
// escopo: professor só enxerga aluno com professor_id = ele; master enxerga todos
// Physiq W3: a regra mora no banco (pode_ver_aluno_treino): master, o professor responsável ou o DONO da conta do aluno
// (espelho do núcleo — o dono vê todos os alunos da conta; o personal, só os dele)
async function alunoDoProfessor(admin: any, user: any, alunoId: string): Promise<boolean> {
  if (alunoId && alunoId === user?.id) return true; // o professor abre o PRÓPRIO perfil (aluno de si mesmo, 18/09/2026)
  if (user?.papel === "master") return true;
  if (!alunoId || !user?.id) return false;
  const { data, error } = await admin.rpc("pode_ver_aluno_treino_por", { p_aluno: alunoId, p_usuario: user.id });
  if (error) {
    // schema ainda sem a função da W3 (a migração entra 1 schema de cada vez): vale a regra de antes
    console.error("pode_ver_aluno_treino_por", error.message);
    const { data: perfil } = await admin.from("physiq_profiles").select("professor_id").eq("id", alunoId).maybeSingle();
    return (perfil as { professor_id?: string } | null)?.professor_id === user.id;
  }
  return data === true;
}

async function requireAdmin(req: Request, endpoint: string, maxCount = 60, windowSecs = 60, grava = false): Promise<{ user: any; error: Response | null }> {
  const origin = req.headers.get("Origin");
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return { user: null, error: jsonErr("missing_auth", 401, origin) };
  const token = auth.slice(7);
  let user: any;
  try {
    // hml-14 (H-51 item 2): a ação que grava confere a sessão no GoTrue; a leitura segue pelo JWKS
    user = grava ? await usuarioDaSessao(auth) : await usuarioDoToken(token, auth);
  } catch (e) {
    log.excecao(e, { codigo: "gotrue_indisponivel", schema: currentSchema(), acao: "conferir_sessao" });
    return { user: null, error: jsonErr("internal", 500, origin) };
  }
  if (!user) return { user: null, error: jsonErr("invalid_token", 401, origin) };
  const role = (user.app_metadata as any)?.role;
  const papel = papelDe(role);
  if (!papel) return { user: null, error: jsonErr("forbidden", 403, origin) };
  // professor com plano vencido (fora da tolerância) só acessa o que está em SEM_ACESSO_OK
  if (papel === "professor" && !SEM_ACESSO_OK.has(endpoint)) {
    const admin0 = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } });
    const { data: ok } = await admin0.rpc("physiq_professor_acesso_ok", { pid: user.id });
    if (ok !== true) return { user: null, error: jsonErr("plano_vencido", 403, origin) };
  }
  user.papel = papel;
  const allowed = await checkRateLimit(user.id, endpoint, maxCount, windowSecs);
  if (!allowed) return { user: null, error: jsonErr("rate_limited", 429, origin) };
  return { user, error: null };
}

// hml-14 (H-51 item 2): as ações que GRAVAM (conferem a sessão no GoTrue); a list segue pelo JWKS. hml-19c: a lista mora no
// regras.ts (ACOES_QUE_GRAVAM: create, update, proxima, delete + as 3 da foto mensal) — testada no Vitest.

// ───────────────────────── hml-19c (H-41 · jeito 2 · decisão 15): a foto mensal do Calc pela função, COMO A PESSOA ─────────────────────────
// A tela (Perfil do aluno › Avaliação › Fotos) deixa de gravar direto no bucket e na tabela:
//   foto_preparar { userId, mes, tipo }          o escopo → o caminho <aluno>/<aaaa-mm>/<tipo>.jpg montado AQUI (regras.ts) → o link
//                                                assinado com upsert (o "Trocar" sobrescreve), criado com o token da pessoa: o Storage
//                                                confere a policy do bucket dela antes de assinar → { ok, bucket, caminho, token }; o
//                                                navegador sobe com uploadToSignedUrl
//   foto_salvar { userId, mes, tipo, caminho }   o caminho devolvido tem de ser o deste aluno/mês/tipo → o arquivo EXISTE nele? (list)
//                                                → upsert da linha (onConflict user_id,mes_ref,tipo: o índice único é inteiro) → { ok, foto }
//   foto_excluir { fotoId }                      a linha lida como a pessoa → o escopo → DELETE da linha → o arquivo sai (só o caminho
//                                                DESTE aluno); não saiu → log arquivo_orfao (sem o caminho) e a resposta segue ok
// Tudo com o cliente "como a pessoa" (a chave anon do Treino + o Authorization do pedido, no schema do x-schema): o RLS de hoje
// ("Staff gerencia registros dos seus alunos" e as policies do bucket) decide como antes — a função não muda quem pode, e nenhuma
// chave secreta entra neste bloco. O escopo é a MESMA regra do alunoDoProfessor (W3), perguntada como a pessoa:
// pode_ver_aluno_treino(aluno) = pode_ver_aluno_treino_por(aluno, auth.uid()). Antes do bloco: o MESMO requireAdmin das ações de antes
// (sessão no GoTrue, papel, plano, freio). Recusa = { error: <código> } com o status do STATUS_FOTO (regras.ts), como as de antes.
function respostaFoto(corpo: Record<string, unknown>, origin: string | null): Response {
  return new Response(JSON.stringify(corpo), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
}

/** Recusa esperada (fora da forma, fora do escopo, a policy recusou, o arquivo não chegou): só o código ao log, como aviso. */
function recusaFoto(acao: AcaoFoto, codigo: string, origin: string | null, ref: string | null = null): Response {
  log.aviso({ codigo: "foto_recusada", schema: currentSchema(), acao, resultado: codigo.toLowerCase(), ref });
  return jsonErr(codigo, statusDaFoto(codigo), origin);
}

/** O Storage recusou (a policy do bucket → forbidden, aviso) ou falhou (internal: avisa o Weslley com o status, sem o corpo). */
function falhaStorageFoto(acao: AcaoFoto, e: unknown, origin: string | null): Response {
  const codigo = erroDoStorage(e);
  if (codigo === "forbidden") return recusaFoto(acao, codigo, origin);
  const status = (e as { status?: unknown } | null)?.status;
  log.erro({ codigo: foiTempo(e) ? "tempo_esgotado" : "storage_falhou", schema: currentSchema(), acao, status: typeof status === "number" ? status : 0 });
  return jsonErr(codigo, statusDaFoto(codigo), origin);
}

/** O banco recusou (o RLS, 42501 → forbidden, aviso) ou falhou (internal: log.excecao — nome, código e mensagem limpa — e aviso). */
function falhaBancoFoto(acao: AcaoFoto, e: unknown, origin: string | null): Response {
  const codigo = erroDoBanco(e);
  if (codigo === "forbidden") return recusaFoto(acao, codigo, origin);
  log.excecao(e, { codigo: foiTempo(e) ? "tempo_esgotado" : "banco_falhou", schema: currentSchema(), acao });
  return jsonErr(codigo, statusDaFoto(codigo), origin);
}

/** O cliente COMO A PESSOA (a chave anon + o Authorization do pedido, no schema do pedido); cada ida leva só o que sobra do prazo. */
function clienteDaPessoa(auth: string, p: Prazo) {
  return createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    db: { schema: currentSchema() },
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: auth },
      fetch: (entrada: string | URL | Request, init?: RequestInit) => buscarComTempo(entrada, init ?? {}, Math.max(1, p.restante())),
    },
  });
}

type Pessoa = ReturnType<typeof clienteDaPessoa>;

/** O MESMO escopo do alunoDoProfessor (a regra da W3), perguntado COMO A PESSOA: o próprio perfil e o master passam; o resto, o banco. */
async function alunoNoEscopo(pessoa: Pessoa, user: any, alunoId: string): Promise<boolean> {
  if (alunoId === user?.id) return true;
  if (user?.papel === "master") return true;
  const { data, error } = await pessoa.rpc("pode_ver_aluno_treino", { p_aluno: alunoId });
  if (error) throw error;
  return data === true;
}

async function prepararFoto(pessoa: Pessoa, user: any, corpo: unknown, origin: string | null): Promise<Response> {
  const acao = "foto_preparar";
  const p = lerPedidoDeFoto(corpo);
  if (!p.ok) return recusaFoto(acao, p.erro, origin);
  if (!(await alunoNoEscopo(pessoa, user, p.alunoId))) return recusaFoto(acao, "forbidden", origin, p.alunoId);
  const bucket = bucketDosRegistros(currentSchema());
  // o link sai COMO A PESSOA: o Storage confere a policy do bucket dela (o INSERT e, com o upsert, o UPDATE do "Trocar") antes de assinar
  const { data, error } = await pessoa.storage.from(bucket).createSignedUploadUrl(p.caminho, { upsert: true });
  if (error || !data?.token) return falhaStorageFoto(acao, error, origin);
  return respostaFoto({ ok: true, bucket, caminho: p.caminho, token: data.token }, origin);
}

async function salvarFoto(pessoa: Pessoa, user: any, corpo: unknown, origin: string | null): Promise<Response> {
  const acao = "foto_salvar";
  const p = lerPedidoDeFoto(corpo);
  if (!p.ok) return recusaFoto(acao, p.erro, origin);
  if (!(await alunoNoEscopo(pessoa, user, p.alunoId))) return recusaFoto(acao, "forbidden", origin, p.alunoId);
  // o arquivo chegou NAQUELE caminho? (o molde do anexo_registrar da hml-19a: list com search, como a pessoa)
  const corte = p.caminho.lastIndexOf("/");
  const pasta = p.caminho.slice(0, corte);
  const arquivo = p.caminho.slice(corte + 1);
  const { data: achados, error: el } = await pessoa.storage.from(bucketDosRegistros(currentSchema())).list(pasta, { search: arquivo, limit: 10 });
  if (el) return falhaStorageFoto(acao, el, origin);
  if (!(achados ?? []).some((f: { name?: string }) => f.name === arquivo)) return recusaFoto(acao, "arquivo_ausente", origin, p.alunoId);
  const { data, error } = await pessoa.from("physiq_registros_fotos")
    .upsert({ user_id: p.alunoId, mes_ref: mesRef(p.mes), tipo: p.tipo, storage_path: p.caminho, updated_at: new Date().toISOString() }, { onConflict: "user_id,mes_ref,tipo" })
    .select("id, user_id, mes_ref, tipo, storage_path")
    .single();
  if (error) return falhaBancoFoto(acao, error, origin);
  return respostaFoto({ ok: true, foto: data }, origin);
}

async function excluirFoto(pessoa: Pessoa, user: any, corpo: unknown, origin: string | null): Promise<Response> {
  const acao = "foto_excluir";
  const x = lerExclusaoDeFoto(corpo);
  if (!x.ok) return recusaFoto(acao, x.erro, origin);
  // a linha lida COMO A PESSOA (o RLS de hoje): não existe ou não é dela → a mesma resposta (forbidden, como o delete de antes)
  const { data: linha, error: el } = await pessoa.from("physiq_registros_fotos").select("id, user_id, storage_path").eq("id", x.fotoId).maybeSingle();
  if (el) return falhaBancoFoto(acao, el, origin);
  const l = linha as { user_id?: unknown; storage_path?: unknown } | null;
  if (!l || typeof l.user_id !== "string") return recusaFoto(acao, "forbidden", origin, x.fotoId);
  if (!(await alunoNoEscopo(pessoa, user, l.user_id.toLowerCase()))) return recusaFoto(acao, "forbidden", origin, x.fotoId);
  const { data: saiu, error: ed } = await pessoa.from("physiq_registros_fotos").delete().eq("id", x.fotoId).select("id");
  if (ed) return falhaBancoFoto(acao, ed, origin);
  if (!saiu?.length) return recusaFoto(acao, "forbidden", origin, x.fotoId);
  // 1º a linha, DEPOIS o arquivo (decisão 8): se o remove falhar, sobra o arquivo (log), nunca a linha apontando para arquivo apagado.
  // Só sai o caminho DESTE aluno (o da linha; um caminho de outro aluno não é tocado). Antes, o erro do remove era ignorado calado.
  const caminho = l.storage_path;
  if (!caminhoDoAluno(caminho, l.user_id)) {
    log.aviso({ codigo: "arquivo_fora_da_pasta", schema: currentSchema(), acao, ref: x.fotoId });
    return respostaFoto({ ok: true }, origin);
  }
  const { data: removidos, error: er } = await pessoa.storage.from(bucketDosRegistros(currentSchema())).remove([caminho]);
  if (er || !removidos?.length) log.aviso({ codigo: "arquivo_orfao", schema: currentSchema(), acao, ref: x.fotoId });
  return respostaFoto({ ok: true }, origin);
}

/** As 3 ações da foto: o erro inesperado vira 500 internal (como as de antes), com o log.excecao e o aviso ao Weslley. */
async function atenderFoto(req: Request, user: any, body: any, origin: string | null): Promise<Response> {
  const acao = body.action as AcaoFoto;
  try {
    const pessoa = clienteDaPessoa(req.headers.get("Authorization") ?? "", prazo(ORCAMENTO_MS.usuario));
    switch (acao) {
      case "foto_preparar":
        return await prepararFoto(pessoa, user, body, origin);
      case "foto_salvar":
        return await salvarFoto(pessoa, user, body, origin);
      case "foto_excluir":
        return await excluirFoto(pessoa, user, body, origin);
      default:
        return jsonErr("invalid_action", 400, origin);
    }
  } catch (e) {
    log.excecao(e, { codigo: foiTempo(e) ? "tempo_esgotado" : "excecao", schema: currentSchema(), acao });
    return jsonErr("internal", 500, origin);
  }
}

// ───────────────────────── hml-20a (H-42 · jeito 2, etapa 2 · decisão 14): minha_evolucao — a Evolução do PRÓPRIO aluno ─────────────────────────
// A aba Evolução e o card do peso do Início (src/evolucao/fontes.ts, carregarTreino) deixam de ler direto no REST do Treino: o mesmo
// conjunto sai daqui, numa ida só, ANTES do requireAdmin (que exige papel de profissional) — qualquer papel lê SÓ O PRÓPRIO:
//   x-schema na lista (400 schema_invalido) → Bearer (401 missing_auth) → o token conferido pelo JWKS (usuarioDoToken, o caminho de
//   leitura da list; 401 invalid_token) → o freio por pessoa (em memória, 60/min; 429 rate_limited) → o cliente COMO A PESSOA (a chave
//   anon + o token dela; o RLS de hoje) → physiq_profiles (as 37 colunas) ∥ physiq_avaliacoes (as colunas da série, as 200 mais novas)
//   ∥ physiq_registros_fotos (as 5 colunas, as 200 mais novas) — o dono das 3 é o `sub` do token, o corpo não entra → a URL das fotos
//   (createSignedUrls no bucket do ambiente, 1 h, só os caminhos lidos; relativa) → { perfil, avaliacoes, fotos } (a ParteTreino).
// O erro do banco: o RLS recusou (42501) → 403 forbidden; o resto → 500 internal (log.excecao + aviso). Não deu para assinar → as fotos
// sem URL (como hoje) e um aviso no log. Nenhuma chave secreta neste bloco.
const freioDaEvolucao = criarFreio(FREIO_EVOLUCAO_POR_MINUTO, 60_000);

async function atenderMinhaEvolucao(req: Request, origin: string | null): Promise<Response> {
  const acao = "minha_evolucao";
  if (!schemaDaFoto(req.headers.get("x-schema"))) return jsonErr("schema_invalido", 400, origin);
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ") || auth.length < 20) return jsonErr("missing_auth", 401, origin);
  try {
    const user = await usuarioDoToken(auth.slice(7).trim(), auth);
    const sub = typeof user?.id === "string" ? user.id : "";
    if (!sub) return jsonErr("invalid_token", 401, origin);
    if (!freioDaEvolucao(`${currentSchema()}:${sub}`)) {
      log.aviso({ codigo: "rate_limited", schema: currentSchema(), acao, ref: sub });
      return jsonErr("rate_limited", 429, origin);
    }
    const pessoa = clienteDaPessoa(auth, prazo(ORCAMENTO_MS.usuario));
    const [perfil, avaliacoes, fotos] = await Promise.all([
      pessoa.from("physiq_profiles").select(COLUNAS_PERFIL_EVOLUCAO.join(", ")).eq("id", sub).maybeSingle(),
      pessoa.from("physiq_avaliacoes").select(COLUNAS_AVALIACOES_EVOLUCAO.join(", ")).eq("user_id", sub)
        .order("data_avaliacao", { ascending: false }).order("id", { ascending: false }).limit(MAX_AVALIACOES_EVOLUCAO),
      pessoa.from("physiq_registros_fotos").select(COLUNAS_FOTOS_EVOLUCAO.join(", ")).eq("user_id", sub)
        .order("mes_ref", { ascending: false }).limit(MAX_FOTOS_EVOLUCAO),
    ]);
    const erro = perfil.error ?? avaliacoes.error ?? fotos.error;
    if (erro) {
      if (erroDoBanco(erro) === "forbidden") {
        log.aviso({ codigo: "leitura_recusada", schema: currentSchema(), acao, resultado: "forbidden", ref: sub });
        return jsonErr("forbidden", 403, origin);
      }
      log.excecao(erro, { codigo: foiTempo(erro) ? "tempo_esgotado" : "banco_falhou", schema: currentSchema(), acao });
      return jsonErr("internal", 500, origin);
    }
    const caminhos = caminhosDasFotos(fotos.data);
    let urls = new Map<string, string>();
    if (caminhos.length) {
      const bucket = bucketDosRegistros(currentSchema());
      const { data: assinadas, error: ea } = await pessoa.storage.from(bucket).createSignedUrls(caminhos, VALIDADE_URL_EVOLUCAO_S);
      if (ea || !assinadas) {
        const status = (ea as { status?: unknown } | null)?.status;
        log.aviso({ codigo: "assinar_falhou", schema: currentSchema(), acao, status: typeof status === "number" ? status : 0, n: caminhos.length });
      } else {
        urls = urlsAssinadas(caminhos, assinadas, bucket);
        if (urls.size < caminhos.length) log.aviso({ codigo: "assinar_parcial", schema: currentSchema(), acao, n: caminhos.length - urls.size });
      }
    }
    return new Response(JSON.stringify(parteDaEvolucao(perfil.data, avaliacoes.data, fotos.data, urls)), {
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  } catch (e) {
    log.excecao(e, { codigo: foiTempo(e) ? "tempo_esgotado" : "excecao", schema: currentSchema(), acao });
    return jsonErr("internal", 500, origin);
  }
}

Deno.serve(async (req) => {
  schemaCtx.enterWith(resolveSchema(req));
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  // o corpo é lido antes do login (a ação decide como a sessão é conferida); corpo quebrado segue no 500 de antes
  let body: any = null;
  let corpoOk = true;
  try { body = await req.json(); } catch { corpoOk = false; }
  // hml-20a: a Evolução do PRÓPRIO aluno (minha_evolucao) vem antes do requireAdmin — qualquer papel lê só o próprio; as de antes não mudam
  if (corpoOk && ehAcaoDeLeitura(body?.action)) return await atenderMinhaEvolucao(req, origin);
  // hml-19c: a foto mensal exige o x-schema da lista (fora dela → 400, nunca cai na produção por engano); as ações de antes não mudam
  const foto = corpoOk && ehAcaoFoto(body?.action);
  if (foto && !schemaDaFoto(req.headers.get("x-schema"))) return jsonErr("schema_invalido", 400, origin);
  const { user, error: authErr } = await requireAdmin(req, "admin-avaliacoes", 60, 60, ACOES_QUE_GRAVAM.has(body?.action));
  if (authErr) return authErr;
  if (foto) return await atenderFoto(req, user, body, origin);
  try {
    if (!corpoOk) throw new Error("corpo_invalido");
    const action = body?.action;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: currentSchema() } });
    // 25/09/2026: + tipo de avaliação (7 dobras, balança), as TMBs e a escolhida, e as medidas — TMB e medidas já
    // eram enviadas pelo painel e ficavam de fora daqui (a avaliação salva perdia os dois)
    const ALLOWED = new Set([
      "data_avaliacao", "peso", "altura", "observacao", "percentual_gordura", "massa_gorda", "massa_magra",
      "metodo_avaliacao", "dobra_1", "dobra_2", "dobra_3", "dobra_4", "dobra_5", "dobra_6", "dobra_7",
      "massa_muscular", "agua_corporal", "gordura_visceral",
      "tmb_mifflin", "tmb_katch", "tmb_balanca", "tmb_metodo",
      "medida_pescoco", "medida_ombro", "medida_peitoral", "medida_cintura", "medida_abdomen", "medida_quadril",
      "medida_braco_d", "medida_braco_e", "medida_antebraco_d", "medida_antebraco_e", "medida_coxa_d", "medida_coxa_e",
      "medida_panturrilha_d", "medida_panturrilha_e",
    ]);
    // avaliação existente → dono → escopo do professor
    const avaliacaoNoEscopo = async (avaliacaoId: string): Promise<boolean> => {
      const { data: av } = await admin.from("physiq_avaliacoes").select("user_id").eq("id", avaliacaoId).maybeSingle();
      return !!av && (await alunoDoProfessor(admin, user, (av as any).user_id));
    };
    if (action === "list") {
      const userId = body?.userId;
      if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
      if (!(await alunoDoProfessor(admin, user, userId))) return jsonErr("forbidden", 403, origin);
      const { data, error } = await admin.from("physiq_avaliacoes").select("*").eq("user_id", userId).order("data_avaliacao", { ascending: true });
      if (error) throw error;
      return new Response(JSON.stringify({ avaliacoes: data ?? [] }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }
    if (action === "create") {
      const userId = body?.userId;
      const avaliacao = body?.avaliacao;
      if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
      if (typeof avaliacao !== "object" || avaliacao === null) return jsonErr("missing_avaliacao", 400, origin);
      if (!(await alunoDoProfessor(admin, user, userId))) return jsonErr("forbidden", 403, origin);
      const filtered: Record<string, unknown> = { user_id: userId };
      for (const k of Object.keys(avaliacao)) if (ALLOWED.has(k)) filtered[k] = avaliacao[k];
      const { data, error } = await admin.from("physiq_avaliacoes").insert(filtered).select().maybeSingle();
      if (error) throw error;
      return new Response(JSON.stringify({ avaliacao: data }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }
    if (action === "update") {
      const avaliacaoId = body?.avaliacaoId;
      const avaliacao = body?.avaliacao ?? {};
      if (!avaliacaoId || typeof avaliacaoId !== "string") return jsonErr("missing_avaliacaoId", 400, origin);
      if (!(await avaliacaoNoEscopo(avaliacaoId))) return jsonErr("forbidden", 403, origin);
      const filtered: Record<string, unknown> = {};
      for (const k of Object.keys(avaliacao)) if (ALLOWED.has(k)) filtered[k] = avaliacao[k];
      if (Object.keys(filtered).length === 0) return jsonErr("no_valid_fields", 400, origin);
      const { data, error } = await admin.from("physiq_avaliacoes").update(filtered).eq("id", avaliacaoId).select().maybeSingle();
      if (error) throw error;
      return new Response(JSON.stringify({ avaliacao: data }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }
    // W17 (NF7): a data da próxima avaliação do aluno (physiq_profiles.proxima_avaliacao) — "" ou null apaga
    if (action === "proxima") {
      const userId = body?.userId;
      const data = body?.data;
      if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
      const valida = data === null || data === "" || (typeof data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data) && !Number.isNaN(Date.parse(`${data}T12:00:00Z`)));
      if (!valida) return jsonErr("data_invalida", 400, origin);
      if (!(await alunoDoProfessor(admin, user, userId))) return jsonErr("forbidden", 403, origin);
      const { data: perfil, error } = await admin.from("physiq_profiles").update({ proxima_avaliacao: data || null }).eq("id", userId).select("proxima_avaliacao").maybeSingle();
      if (error) throw error;
      if (!perfil) return jsonErr("aluno_inexistente", 404, origin);
      return new Response(JSON.stringify({ ok: true, proxima_avaliacao: (perfil as { proxima_avaliacao?: string | null }).proxima_avaliacao ?? null }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }
    if (action === "delete") {
      const avaliacaoId = body?.avaliacaoId;
      if (!avaliacaoId || typeof avaliacaoId !== "string") return jsonErr("missing_avaliacaoId", 400, origin);
      if (!(await avaliacaoNoEscopo(avaliacaoId))) return jsonErr("forbidden", 403, origin);
      const { error } = await admin.from("physiq_avaliacoes").delete().eq("id", avaliacaoId);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }
    return jsonErr("invalid_action", 400, origin);
  } catch (_e) { return jsonErr("internal", 500, origin); }
});
