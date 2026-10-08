// Physiq W7 — excluir-minha-conta (banco principal). "Excluir minha conta" do Perfil do aluno (falha F4 — C88, R11, P19):
// apaga o login nos 2 bancos, os dados de treino e o que o aluno enviou; o que o profissional precisa guardar fica com ele,
// desligado do login. A lista tabela por tabela está nas migrações da W7 (supabase-principal/migrations/20260929170000_w07_perfil.sql
// e supabase/migrations/20260929170100_w07_exportar_excluir.sql).
//
// POST, headers: Authorization: Bearer <access_token do principal> · x-schema: public|staging.
//   { simular: true }            → confere tudo e diz o que apagaria/manteria (nada muda) — a tela mostra antes de confirmar
//   { confirmacao: "EXCLUIR" }   → exclui (a palavra digitada é conferida aqui também)
// 200 → { ok, simulacao?, apaga, mantem }
// Recusas: 400 confirmacao_invalida · 403 profissional (master, dono, membro de equipe, nutricionista — a exclusão não é pelo
// app do aluno: nunca deixar conta/alunos órfãos) · 409 assinatura_ativa (cancelar a cobrança automática antes) ·
// 502 treino_indisponivel (nada foi apagado aqui) · 401 · 403 conta_real_no_staging · 429 rate_limited · 500
//
// hml-09 (H-23) — o Auth é o MESMO no staging e na produção: pelo staging, a conta de teste que também tem dado em produção (uma
// linha dela em public — staging.pegada_em_producao — ou no Treino de produção) não é excluída nem simulada: 403
// conta_real_no_staging + motivo "dados_em_producao", antes de qualquer passo e nos 2 fluxos (o app já traduz o código). Sem
// resposta do banco = 500 (falha fechada). Produção: nada muda.
//
// Ordem (idempotente — pedir de novo depois de um erro no meio refaz só o que faltou; depois de pronto o token deixa de valer):
//   1. confere (principal: excluir_dados_aluno simular; Treino: conferir) — qualquer recusa para ANTES de mexer em algo;
//   2. Treino: delete-my-account "excluir" (dados de treino + soft delete do login de lá + vínculo);
//   3. principal: excluir_dados_aluno (o que o aluno enviou + matrícula desligada) → arquivos do diário e a foto do Perfil;
//   4. por último o login do principal (auth.admin.deleteUser) — a FK "on delete set null" desliga a matrícula.
// Só age sobre o usuário do JWT (nenhum id vem do corpo).
//
// W2 da loja (Google Play) — o PROFISSIONAL (dono, membro de equipe, quem já foi membro) exclui a conta pelo painel › Configurações
// e pela página /excluir-conta, SÓ no pedido do app novo: { fluxo: "profissional", simular: true } | { fluxo: "profissional",
// confirmacao: "EXCLUIR" } → _shared/exclusao-profissional.ts (a ordem e as recusas em _shared/exclusao-profissional-regras.ts).
// Sem o campo — o site de produção de hoje e todo APK antigo —, tudo abaixo segue IGUAL (403 "profissional" e o fluxo do aluno).
// verify_jwt = true. Publicar: scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions excluir-minha-conta true
// Segredos: TREINO_URL, TREINO_ANON_KEY, ESPELHO_SEGREDO, MP_ACCESS_TOKEN_PROD / MP_ACCESS_TOKEN_TEST (o caminho novo cancela a
// cobrança automática) (+ os automáticos).
// hml-10 (H-24, H-26): log em JSON pelo _shared/log.ts (o mesmo log vai para o caminho do profissional e para a conversa com o
// Treino — o aviso de erro diz esta função); o catch final avisa (log.excecao) e devolve o mesmo 500.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { criarLog } from "../_shared/log.ts";
import { emailDeTeste, origemPermitida } from "../_shared/login-regras.ts";
import { STATUS_DA_RECUSA, confirmacaoValida, pegadaBloqueia } from "../_shared/conta-aluno-regras.ts";
import { chamarTreino } from "../_shared/treino-servidor.ts";
import { fluxoDoPedido } from "../_shared/exclusao-profissional-regras.ts";
import { excluirContaProfissionalNaBorda } from "../_shared/exclusao-profissional.ts";
import type { Schema } from "../_shared/cobranca-mp.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SCHEMAS = ["public", "staging"];
const BUCKET_FOTOS: Record<string, string> = { public: "fotos-perfil", staging: "fotos-perfil-staging" };
const log = criarLog("excluir-minha-conta", { avisar: avisarErro });

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
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });
const recusa = (erro: string, origin: string | null, extra: Record<string, unknown> = {}) =>
  json({ ok: false, erro, ...extra }, STATUS_DA_RECUSA[erro] ?? 400, origin);
// hml-09: fora do STATUS_DA_RECUSA de propósito (as recusas do caminho de hoje não mudam)
const dadosEmProducao = (origin: string | null) =>
  json({ ok: false, erro: "conta_real_no_staging", motivo: "dados_em_producao" }, 403, origin);

/** O corpo JSON de um pedido (vazio se não for JSON) — W2 da loja: lido de req.clone() para escolher o caminho. */
async function lerCorpo(r: Request): Promise<Record<string, unknown>> {
  try {
    const c = await r.json();
    return c && typeof c === "object" && !Array.isArray(c) ? (c as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const janelas = new Map<string, number[]>();
function permitido(chave: string, max = 10, janelaMs = 60 * 60_000): boolean {
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

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ ok: false, erro: "metodo" }, 405, origin);
  const schema = (req.headers.get("x-schema") || "public").toLowerCase();
  if (!SCHEMAS.includes(schema)) return json({ ok: false, erro: "schema_invalido" }, 400, origin);

  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ") || auth.length < 20) return json({ ok: false, erro: "missing_auth" }, 401, origin);
  const authAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: ud, error: eu } = await authAdmin.auth.getUser(auth.slice(7).trim());
  if (eu || !ud?.user) return json({ ok: false, erro: "invalid_token" }, 401, origin);
  const user = ud.user;
  const email = String(user.email || "").trim().toLowerCase();
  if (schema === "staging" && !emailDeTeste(email)) return json({ ok: false, erro: "conta_real_no_staging" }, 403, origin);
  // hml-09 (H-23): a conta de teste que também tem dado em produção não sai pelo staging (simular e excluir, nos 2 fluxos)
  if (schema === "staging") {
    const dbStaging = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" }, auth: { persistSession: false } });
    const { data: pegada, error: epg } = await dbStaging.rpc("pegada_em_producao", { p_uid: user.id });
    if (epg) {
      log.excecao(epg, { codigo: "pegada_em_producao_falhou", schema });
      return json({ ok: false, erro: "erro_interno" }, 500, origin);
    }
    if (pegadaBloqueia(pegada)) return dadosEmProducao(origin);
  }

  // W2 da loja: só o pedido do app novo ({ fluxo: "profissional" }) entra no caminho do profissional (com o próprio limite de
  // tentativas). A leitura é de uma CÓPIA do pedido — o corpo segue intacto para o caminho de hoje logo abaixo.
  const pedido = await lerCorpo(req.clone());
  if (fluxoDoPedido(pedido) === "profissional") {
    if (!permitido(`profissional:${schema}:${user.id}`, 20)) return json({ ok: false, erro: "rate_limited" }, 429, origin);
    const r = await excluirContaProfissionalNaBorda({
      schema: schema as Schema, user, authAdmin, simular: pedido.simular === true, confirmacao: pedido.confirmacao, log,
    });
    return json(r.corpo, r.status, origin);
  }

  if (!permitido(`${schema}:${user.id}`)) return json({ ok: false, erro: "rate_limited" }, 429, origin);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const simular = body.simular === true;
  if (!simular && !confirmacaoValida(body.confirmacao)) return recusa("confirmacao_invalida", origin);
  const papelAuth = String((user.app_metadata as Record<string, unknown> | undefined)?.role ?? "");
  if (papelAuth === "master" || papelAuth === "admin") return recusa("profissional", origin, { motivo: "master" });

  const db = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" }, auth: { persistSession: false } });
  try {
    // 1. confere nos 2 bancos antes de mexer em qualquer coisa
    const { data: pre, error: ep } = await db.rpc("excluir_dados_aluno", { p_uid: user.id, p_simular: true });
    if (ep) throw ep;
    const conferencia = (pre ?? {}) as Record<string, unknown>;
    if (conferencia.ok !== true) return recusa(String(conferencia.erro ?? "erro_interno"), origin, { motivo: conferencia.motivo ?? null });
    const treinoPre = await chamarTreino(schema, "conferir", user.id, log);
    if (treinoPre.passo === "profissional") return recusa("profissional", origin, { motivo: "treino" });
    if (treinoPre.passo === "conta_real") return dadosEmProducao(origin);
    if (treinoPre.passo === "indisponivel") return recusa("treino_indisponivel", origin);
    const tPre = treinoPre.passo === "sem_vinculo" ? null : treinoPre.corpo;
    if (simular) {
      return json({
        ok: true, simulacao: true,
        apaga: { principal: conferencia.apaga ?? {}, treino: tPre?.apaga ?? null },
        mantem: { principal: conferencia.mantem ?? {}, treino: tPre?.mantem ?? null },
      }, 200, origin);
    }

    // 2. Banco do Treino (dados de treino + login de lá)
    const treino = await chamarTreino(schema, "excluir", user.id, log);
    if (treino.passo === "profissional") return recusa("profissional", origin, { motivo: "treino" });
    if (treino.passo === "conta_real") return dadosEmProducao(origin);
    if (treino.passo === "indisponivel") return recusa("treino_indisponivel", origin);
    const t = treino.passo === "sem_vinculo" ? null : treino.corpo;

    // 3. banco principal: o que o aluno enviou + a matrícula desligada
    const { data: fim, error: ef } = await db.rpc("excluir_dados_aluno", { p_uid: user.id, p_simular: false });
    if (ef) throw ef;
    const feito = (fim ?? {}) as Record<string, unknown>;
    if (feito.ok !== true) return recusa(String(feito.erro ?? "erro_interno"), origin);
    const arquivos = (Array.isArray(feito.arquivos) ? feito.arquivos : []) as Array<{ bucket: string; path: string }>;
    const porBucket = new Map<string, string[]>();
    for (const a of arquivos) if (a?.bucket && a?.path) porBucket.set(a.bucket, [...(porBucket.get(a.bucket) ?? []), a.path]);
    let arquivosApagados = 0;
    for (const [bucket, caminhos] of porBucket) {
      for (let i = 0; i < caminhos.length; i += 100) {
        const { data: rem, error: er } = await authAdmin.storage.from(bucket).remove(caminhos.slice(i, i + 100));
        if (er) log.excecao(er, { codigo: "storage_falhou", schema, ref: bucket });
        arquivosApagados += rem?.length ?? 0;
      }
    }
    // a foto do Perfil (pasta da pessoa no bucket fotos-perfil do schema)
    const bucketFoto = BUCKET_FOTOS[schema];
    const { data: fotos } = await authAdmin.storage.from(bucketFoto).list(user.id, { limit: 100 });
    const caminhosFoto = (fotos ?? []).filter((f) => f?.name).map((f) => `${user.id}/${f.name}`);
    if (caminhosFoto.length) {
      const { data: rem, error: er } = await authAdmin.storage.from(bucketFoto).remove(caminhosFoto);
      if (er) log.excecao(er, { codigo: "foto_falhou", schema });
      arquivosApagados += rem?.length ?? 0;
    }

    // 4. por último o login (a matrícula fica, desligada — pacientes.user_id "on delete set null")
    const { error: ed } = await authAdmin.auth.admin.deleteUser(user.id);
    if (ed) throw ed;

    return json({
      ok: true,
      apaga: { principal: { ...(feito.apaga as Record<string, unknown> ?? {}), arquivos: arquivosApagados, login: 1 }, treino: t?.apaga ?? null },
      mantem: { principal: feito.mantem ?? {}, treino: t?.mantem ?? null },
    }, 200, origin);
  } catch (e) {
    log.excecao(e, { acao: simular ? "simular" : "excluir", schema });
    return json({ ok: false, erro: "erro_interno" }, 500, origin);
  }
});
