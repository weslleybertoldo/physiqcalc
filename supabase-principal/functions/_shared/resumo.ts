// Physiq W2 — lê no banco principal o que o Treino precisa saber de uma pessoa (resumo do núcleo, spec §7.4/§8.3).
// Usado pela espelho-resumo (a trocar-token pede no login) e pela espelho-enviar (fila de mudanças).
// hml-14 (H-32): os alunos do personal vêm em todas as páginas (antes, sem range, paravam calados no 1000º — o max_rows — e o
// espelho não religava os outros no Treino; a faixa "livre" e as contas legadas não têm limite de alunos).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { todasAsPaginas } from "./paginas.ts";
import {
  contasOndeEPersonalComTreino,
  montarResumo,
  type LinhaAlunoDeTreino,
  type LinhaConta,
  type LinhaMatricula,
  type LinhaMembro,
} from "./resumo-regras.ts";

export type Resumo = ReturnType<typeof montarResumo>;

/** db = service_role no schema do ambiente; authAdmin = service_role (Auth é um só pros 2 schemas). */
export async function resumoDaPessoa(db: SupabaseClient, authAdmin: SupabaseClient, principalUserId: string): Promise<Resumo | null> {
  const { data: u, error: eu } = await authAdmin.auth.admin.getUserById(principalUserId);
  if (eu || !u?.user) return null;
  const user = u.user;

  const [perfilQ, membrosQ, matriculasQ] = await Promise.all([
    db.from("profiles").select("role, nome").eq("id", principalUserId).maybeSingle(),
    db.from("conta_membros").select("conta_id, papeis, status, codigo_convite").eq("user_id", principalUserId),
    db.from("pacientes")
      .select("id, conta_id, ativo, deleted_at, acesso_bloqueado_em, personal_id, nome, genero, nascimento, created_at")
      .eq("user_id", principalUserId),
  ]);
  for (const q of [perfilQ, membrosQ, matriculasQ]) if (q.error) throw q.error;
  const membros = (membrosQ.data ?? []) as LinhaMembro[];
  const matriculas = (matriculasQ.data ?? []) as LinhaMatricula[];

  const contaIds = [...new Set([...membros.map((m) => m.conta_id), ...matriculas.map((m) => m.conta_id).filter((x): x is string => !!x)])];
  let contas: LinhaConta[] = [];
  if (contaIds.length) {
    const { data, error } = await db.from("contas")
      .select("id, nome, origem, plano, situacao, teste_ate, vence_em, tolerancia_dias, cobranca_legada, alunos_bloqueados_em, alunos_bloqueados_msg")
      .in("id", contaIds);
    if (error) throw error;
    contas = (data ?? []) as LinhaConta[];
  }

  let alunos: LinhaAlunoDeTreino[] = [];
  const contasPersonal = contasOndeEPersonalComTreino(membros, contas);
  if (contasPersonal.length) {
    // ordem pelo id (único): estável entre as páginas; erro do banco ou lista grande demais lançam
    alunos = await todasAsPaginas<LinhaAlunoDeTreino>((de, ate) =>
      db.from("pacientes")
        .select("user_id, conta_id")
        .eq("personal_id", principalUserId)
        .in("conta_id", contasPersonal)
        .is("deleted_at", null)
        .not("user_id", "is", null)
        .order("id", { ascending: true })
        .range(de, ate));
  }

  const meta = (user.user_metadata as Record<string, unknown>) || {};
  const perfil = (perfilQ.data ?? null) as { role: string | null; nome: string | null } | null;
  return montarResumo({
    principal_user_id: principalUserId,
    email: user.email ?? null,
    nome: perfil?.nome ?? (meta.full_name as string | undefined) ?? (meta.name as string | undefined) ?? null,
    role_perfil: perfil?.role ?? null,
    role_jwt: ((user.app_metadata as Record<string, unknown>)?.role as string | undefined) ?? null,
    membros,
    contas,
    matriculas,
    alunos_de_treino: alunos,
  });
}
