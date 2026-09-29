// Physiq W3 — pos-login (banco principal). Roda logo depois de cada login no Physiq (Google ou e-mail e senha), antes da
// minha_situacao() e da troca de token (spec 4.2 e 7.4):
//   1. P25 — 1ª entrada com o Google numa conta criada com senha: a senha antiga vira uma aleatória (uma vez só);
//   2. convites pendentes do e-mail confirmado (membro da equipe ou aluno) viram membro/matrícula (spec 8.1);
//   3. ponte do Calc (= o script 01 para uma pessoa): pergunta ao Banco do Treino (vincular-professor, modo servidor) se a
//      pessoa é professor do Calc sem conta aqui, tem convite de professor do master pendente ou é aluno de um professor do
//      Calc sem matrícula aqui — e cria a conta/matrícula (o master continua convidando pelo painel antigo até a W27);
//   4. devolve a minha_situacao() já atualizada.
// Nada disso manda e-mail, WhatsApp ou aviso a ninguém.
//
// POST, headers: Authorization: Bearer <access_token do principal> · x-schema: public|staging. Corpo: {}.
// 200 → { ok, senha_trocada, convites: {aceitos, recusados}, legado: {...}, situacao }
// Erros: 401 missing_auth | invalid_token · 403 email_nao_confirmado | conta_real_no_staging · 429 rate_limited · 500
// verify_jwt = false (validado aqui). PUBLICAR SÓ ASSIM:
//   scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions pos-login false
// Segredos: TREINO_URL, ESPELHO_SEGREDO (+ os automáticos).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  claimsDoJwt,
  contaLegadoCalc,
  deveTrocarSenha,
  ehLoginGoogle,
  emailConfirmado,
  emailDeTeste,
  hojeSaoPaulo,
  origemPermitida,
  professorDoCalcDeVerdade,
  senhaAleatoria,
  somarDiasIso,
  temIdentidade,
  type ProfessorCalc,
} from "../_shared/login-regras.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const TREINO_URL = (Deno.env.get("TREINO_URL") || "").replace(/\/+$/, "");
const ESPELHO_SEGREDO = Deno.env.get("ESPELHO_SEGREDO") || "";
const SCHEMAS = ["public", "staging"];

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

const janelas = new Map<string, number[]>();
function permitido(chave: string, max = 30, janelaMs = 60 * 60_000): boolean {
  const agora = Date.now();
  const validos = (janelas.get(chave) ?? []).filter((t) => t > agora - janelaMs);
  if (validos.length >= max) { janelas.set(chave, validos); return false; }
  validos.push(agora);
  janelas.set(chave, validos);
  if (janelas.size > 5000) janelas.clear();
  return true;
}

/** Resposta do vincular-professor (Treino, modo servidor). */
interface LegadoTreino {
  treino_user_id: string | null;
  professor: ProfessorCalc | null;
  convite_professor: { codigo: string; nome: string | null } | null;
  aluno: { professor_codigo: string | null } | null;
}

async function perguntarAoTreino(schema: string, corpo: Record<string, unknown>): Promise<LegadoTreino | null> {
  if (!TREINO_URL || ESPELHO_SEGREDO.length < 32) return null;
  const r = await fetch(`${TREINO_URL}/functions/v1/vincular-professor`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-espelho-segredo": ESPELHO_SEGREDO, "x-schema": schema },
    body: JSON.stringify({ modo: "servidor", ...corpo }),
  });
  if (r.status !== 200) {
    console.error("pos-login: vincular-professor respondeu", r.status, (await r.text()).slice(0, 300));
    return null;
  }
  return await r.json();
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ ok: false, erro: "metodo" }, 405, origin);
  const schema = (req.headers.get("x-schema") || "public").toLowerCase();
  if (!SCHEMAS.includes(schema)) return json({ ok: false, erro: "schema_invalido" }, 400, origin);
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ") || auth.length < 20) return json({ ok: false, erro: "missing_auth" }, 401, origin);
  const token = auth.slice(7).trim();

  const authAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: ud, error: eu } = await authAdmin.auth.getUser(token);
  if (eu || !ud?.user) return json({ ok: false, erro: "invalid_token" }, 401, origin);
  const user = ud.user;
  if (!emailConfirmado(user)) return json({ ok: false, erro: "email_nao_confirmado" }, 403, origin);
  const email = String(user.email).trim().toLowerCase();
  if (schema === "staging" && !emailDeTeste(email)) return json({ ok: false, erro: "conta_real_no_staging" }, 403, origin);
  if (!permitido(`${schema}:${user.id}`)) return json({ ok: false, erro: "rate_limited" }, 429, origin);

  const db = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" }, auth: { persistSession: false } });
  const loginGoogle = ehLoginGoogle(claimsDoJwt(token), user);
  const saida: Record<string, unknown> = { ok: true, senha_trocada: false, login_google: loginGoogle };

  try {
    // 1. P25 — senha antiga trocada por uma aleatória na 1ª entrada com o Google (a conta é compartilhada pelos 2 schemas)
    const app = (user.app_metadata as Record<string, unknown>) || {};
    if (loginGoogle && temIdentidade(user, "email") && !app.senha_trocada_google_em) {
      // physiq_tem_senha mora no schema public (bloco compartilhado: o Auth é um só)
      const dbPublic = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: "public" }, auth: { persistSession: false } });
      const { data: temSenha, error: ets } = await dbPublic.rpc("physiq_tem_senha", { p_user: user.id });
      if (ets) console.error("pos-login: physiq_tem_senha", ets.message);
      if (deveTrocarSenha({ loginGoogle, temIdentidadeEmail: true, temSenha: temSenha === true, jaTrocou: false })) {
        const { error } = await authAdmin.auth.admin.updateUserById(user.id, {
          password: senhaAleatoria(),
          app_metadata: { ...app, senha_trocada_google_em: new Date().toISOString() },
        });
        if (error) console.error("pos-login: P25", error.message);
        else saida.senha_trocada = true;
      }
    }

    // 2. convites pendentes do e-mail confirmado
    const { data: conv, error: ec } = await db.rpc("aceitar_convites_do_email", { p_user: user.id, p_email: email });
    if (ec) console.error("pos-login: convites", ec.message);
    saida.convites = conv ?? { aceitos: 0, recusados: [] };

    // 3. ponte do Calc (não trava o login se o Treino estiver fora do ar)
    const legado: Record<string, unknown> = {};
    try {
      const meta = (user.user_metadata as Record<string, unknown>) || {};
      const nome = String(meta.full_name ?? meta.name ?? email.split("@")[0]).slice(0, 120);
      const lt = await perguntarAoTreino(schema, { principal_user_id: user.id, email, google: loginGoogle, nome });
      if (lt) {
        legado.treino = { tem_usuario: !!lt.treino_user_id, professor: !!lt.professor, convite: !!lt.convite_professor, aluno: !!lt.aluno };
        const { data: membros } = await db.from("conta_membros").select("conta_id, papeis, status, contas(plano)")
          .eq("user_id", user.id).eq("status", "ativo");
        const jaPersonal = ((membros ?? []) as Array<{ papeis: string[]; contas: { plano: string } | null }>)
          .some((m) => m.papeis.includes("personal") && ["treino", "treino_nutricao"].includes(m.contas?.plano ?? ""));
        // W4: a linha de professor que o espelho criou para o personal de uma conta NOVA não é um professor do Calc
        if (lt.professor && !jaPersonal && professorDoCalcDeVerdade(lt.professor)) {
          const c = contaLegadoCalc(lt.professor, hojeSaoPaulo());
          const { data, error } = await db.rpc("registrar_profissional_treino", {
            p_user: user.id, p_nome: lt.professor.nome || nome, p_codigo: lt.professor.codigo_convite, p_origem: "legado_calc",
            p_faixa: c.faixa, p_situacao: c.situacao, p_teste_ate: c.teste_ate, p_vence_em: c.vence_em,
            p_tolerancia: c.tolerancia_dias, p_isenta_motivo: c.isenta_motivo, p_treino_user_id: lt.treino_user_id,
          });
          if (error) throw error;
          legado.conta_legado_calc = data;
        } else if (lt.convite_professor && !jaPersonal) {
          const { data: cfg } = await db.from("app_config").select("valor").eq("chave", "teste_dias").maybeSingle();
          const dias = Number((cfg as { valor?: unknown } | null)?.valor) || 14;
          const { data, error } = await db.rpc("registrar_profissional_treino", {
            p_user: user.id, p_nome: lt.convite_professor.nome || nome, p_codigo: lt.convite_professor.codigo, p_origem: "nova",
            p_faixa: "f10", p_situacao: "teste", p_teste_ate: somarDiasIso(hojeSaoPaulo(), dias), p_vence_em: null,
            p_tolerancia: 0, p_isenta_motivo: null, p_treino_user_id: lt.treino_user_id,
          });
          if (error) throw error;
          legado.conta_nova = data;
        }
        if (lt.aluno?.professor_codigo) {
          const { data: mats } = await db.from("pacientes").select("id").eq("user_id", user.id).is("deleted_at", null).limit(1);
          if (!(mats ?? []).length) {
            const { data: membro } = await db.from("conta_membros").select("conta_id, user_id")
              .ilike("codigo_convite", lt.aluno.professor_codigo).eq("status", "ativo").not("user_id", "is", null).limit(1).maybeSingle();
            if (membro) {
              const m = membro as { conta_id: string; user_id: string };
              const { data, error } = await db.rpc("matricular_na_conta", {
                p_user: user.id, p_conta: m.conta_id, p_personal: m.user_id, p_nutricionista: null, p_origem: "calc", p_ignorar_regras: true,
              });
              if (error) throw error;
              legado.matricula_calc = data;
            } else {
              legado.matricula_calc = { ok: false, erro: "professor_sem_conta" };
            }
          }
        }
      }
    } catch (e) {
      console.error("pos-login: ponte do Calc", String((e as { message?: string })?.message || e));
      legado.erro = "ponte_indisponivel";
    }
    saida.legado = legado;

    // 4. situação atualizada (com o token da pessoa: a função lê auth.uid())
    const comoPessoa = createClient(SUPABASE_URL, ANON, {
      db: { schema: schema as "public" },
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: situacao, error: es } = await comoPessoa.rpc("minha_situacao");
    if (es) throw es;
    saida.situacao = situacao;
    return json(saida, 200, origin);
  } catch (e) {
    console.error("pos-login erro", String((e as { message?: string })?.message || e));
    return json({ ok: false, erro: "erro_interno" }, 500, origin);
  }
});
