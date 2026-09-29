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
// Ordem (idempotente — pedir de novo depois de um erro no meio refaz só o que faltou; depois de pronto o token deixa de valer):
//   1. confere (principal: excluir_dados_aluno simular; Treino: conferir) — qualquer recusa para ANTES de mexer em algo;
//   2. Treino: delete-my-account "excluir" (dados de treino + soft delete do login de lá + vínculo);
//   3. principal: excluir_dados_aluno (o que o aluno enviou + matrícula desligada) → arquivos do diário e a foto do Perfil;
//   4. por último o login do principal (auth.admin.deleteUser) — a FK "on delete set null" desliga a matrícula.
// Só age sobre o usuário do JWT (nenhum id vem do corpo).
// verify_jwt = true. Publicar: scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions excluir-minha-conta true
// Segredos: TREINO_URL, TREINO_ANON_KEY, ESPELHO_SEGREDO (+ os automáticos).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { emailDeTeste, origemPermitida } from "../_shared/login-regras.ts";
import { STATUS_DA_RECUSA, confirmacaoValida } from "../_shared/conta-aluno-regras.ts";
import { chamarTreino } from "../_shared/treino-servidor.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SCHEMAS = ["public", "staging"];
const BUCKET_FOTOS: Record<string, string> = { public: "fotos-perfil", staging: "fotos-perfil-staging" };

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
    const treinoPre = await chamarTreino(schema, "conferir", user.id);
    if (treinoPre.passo === "profissional") return recusa("profissional", origin, { motivo: "treino" });
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
    const treino = await chamarTreino(schema, "excluir", user.id);
    if (treino.passo === "profissional") return recusa("profissional", origin, { motivo: "treino" });
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
        if (er) console.error("excluir-minha-conta: storage", bucket, er.message);
        arquivosApagados += rem?.length ?? 0;
      }
    }
    // a foto do Perfil (pasta da pessoa no bucket fotos-perfil do schema)
    const bucketFoto = BUCKET_FOTOS[schema];
    const { data: fotos } = await authAdmin.storage.from(bucketFoto).list(user.id, { limit: 100 });
    const caminhosFoto = (fotos ?? []).filter((f) => f?.name).map((f) => `${user.id}/${f.name}`);
    if (caminhosFoto.length) {
      const { data: rem, error: er } = await authAdmin.storage.from(bucketFoto).remove(caminhosFoto);
      if (er) console.error("excluir-minha-conta: foto", er.message);
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
    console.error("excluir-minha-conta:", (e as Error)?.message ?? String(e));
    return json({ ok: false, erro: "erro_interno" }, 500, origin);
  }
});
