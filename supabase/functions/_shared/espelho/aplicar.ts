// Physiq W2 — aplica o resumo do núcleo (banco principal) no espelho do Banco do Treino (spec §7.4 e §8.3).
// Usado pela trocar-token (no login) e pela espelho-nucleo (quando o principal muda). Idempotente.
// O vínculo que vale entre os 2 bancos é SÓ o physiq_identidades (service_role): nada que o app grava no principal
// (ex.: pacientes.treino_user_id) decide qual usuário do Treino é de quem.
import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  acessoProfessor,
  deveTirarAcessoDoEspelho,
  escolherMatriculaTreino,
  linhasEspelhoMembros,
  papelTreino,
  sexoTreino,
  statusDoPerfil,
  type LinhaProfessorCobranca,
  type ResumoNucleo,
} from "./regras.ts";

export interface ResultadoEspelho {
  papel: string | null;
  papel_mudou: boolean;
  membros: number;
  professor: "criado" | "atualizado" | "sem_acesso" | null;
  aluno: "atualizado" | "sem_matricula_de_treino" | "sem_perfil";
  alunos_ligados: number;
}

/** principal_user_id → treino_user_id, pelo vínculo (physiq_identidades) do schema. */
export async function mapearTreino(db: SupabaseClient, principalIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(principalIds.filter(Boolean))];
  const mapa = new Map<string, string>();
  if (!ids.length) return mapa;
  const { data, error } = await db.from("physiq_identidades").select("principal_user_id, treino_user_id").in("principal_user_id", ids);
  if (error) throw error;
  for (const l of (data ?? []) as Array<{ principal_user_id: string; treino_user_id: string }>) mapa.set(l.principal_user_id, l.treino_user_id);
  return mapa;
}

export async function aplicarResumo(
  db: SupabaseClient,
  authAdmin: SupabaseClient,
  treinoUser: User,
  resumo: ResumoNucleo,
): Promise<ResultadoEspelho> {
  const treinoId = treinoUser.id;
  const agora = new Date().toISOString();

  // 1. papel no JWT do Treino
  const meta = { ...((treinoUser.app_metadata as Record<string, unknown>) || {}) };
  const papelAtual = typeof meta.role === "string" ? meta.role : null;
  const papelNovo = papelTreino(resumo, papelAtual);
  const papelMudou = papelNovo !== papelAtual;
  if (papelMudou) {
    // app_metadata faz merge no GoTrue; role null apaga a chave
    const { error } = await authAdmin.auth.admin.updateUserById(treinoId, { app_metadata: { role: papelNovo } });
    if (error) throw error;
  }

  // 2. espelho dos membros (todas as contas em que aparece; as que sumiram do núcleo ficam inativas)
  const linhas = linhasEspelhoMembros(resumo);
  if (linhas.length) {
    const { error } = await db.from("physiq_espelho_membros").upsert(
      linhas.map((l) => ({ conta_id: l.conta_id, treino_user_id: treinoId, papeis: l.papeis, ativo: l.ativo, atualizado_em: agora })),
      { onConflict: "conta_id,treino_user_id" },
    );
    if (error) throw error;
  }
  {
    let q = db.from("physiq_espelho_membros").update({ ativo: false, atualizado_em: agora }).eq("treino_user_id", treinoId).eq("ativo", true);
    if (linhas.length) q = q.not("conta_id", "in", `(${linhas.map((l) => l.conta_id).join(",")})`);
    const { error } = await q;
    if (error) throw error;
  }

  // 3. personal numa conta com Treino → linha em physiq_professores com o acesso espelhado
  let professor: ResultadoEspelho["professor"] = null;
  const acesso = acessoProfessor(resumo);
  if (acesso) {
    const { data: existente, error: e1 } = await db.from("physiq_professores")
      .select("id, alunos_bloqueados_em, alunos_bloqueados_msg").eq("id", treinoId).maybeSingle();
    if (e1) throw e1;
    const campos: Record<string, unknown> = { nucleo_acesso_ate: acesso.nucleo_acesso_ate };
    // bloqueio dos alunos pelo master: o núcleo manda quando bloqueia, ou sempre que há conta nova; só com conta legada
    // e sem bloqueio no núcleo, não mexe (o bloqueio antigo do Calc continua valendo até a virada)
    if (acesso.alunos_bloqueados_em || acesso.ponte) {
      campos.alunos_bloqueados_em = acesso.alunos_bloqueados_em;
      campos.alunos_bloqueados_msg = acesso.alunos_bloqueados_msg;
    }
    if (acesso.ponte) {
      campos.acesso_liberado_ate = acesso.ponte.acesso_liberado_ate;
      campos.status = acesso.ponte.status;
    }
    if (!existente) {
      let codigo = acesso.codigo_convite;
      const nome = (resumo.nome || treinoUser.email?.split("@")[0] || "Professor").slice(0, 120);
      if (codigo) {
        const { data: usado } = await db.from("physiq_professores").select("id").eq("codigo_convite", codigo).maybeSingle();
        if (usado) codigo = null;
      }
      if (!codigo) {
        const { data: gerado, error: eg } = await db.rpc("physiq_gerar_codigo_professor", { p_nome: nome });
        if (eg) throw eg;
        codigo = gerado as string;
      }
      const { error: ei } = await db.from("physiq_professores").insert({
        id: treinoId, nome, email: treinoUser.email ?? resumo.email, codigo_convite: codigo,
        status: acesso.ponte?.status ?? "ativo", ...campos,
      });
      if (ei) throw ei;
      // o professor também é usuário do app: garante o perfil (o gatilho do Calc já cria no cadastro)
      await db.from("physiq_profiles").upsert({ id: treinoId, nome, email: treinoUser.email }, { onConflict: "id", ignoreDuplicates: true });
      professor = "criado";
    } else {
      const { error: eu } = await db.from("physiq_professores").update(campos).eq("id", treinoId);
      if (eu) throw eu;
      professor = "atualizado";
    }
  } else {
    // W5: não é mais personal numa conta com Treino (removido da equipe, perdeu o papel): o acesso que o espelho deu sai
    const { data: linha, error: el } = await db.from("physiq_professores")
      .select("id, plano_id, trial_ate, adesao_paga_em, ciclo_vence_em, anual_ate, cobranca_pausada, acesso_liberado_ate, nucleo_acesso_ate")
      .eq("id", treinoId).maybeSingle();
    if (el) throw el;
    if (deveTirarAcessoDoEspelho(resumo, papelAtual, (linha as LinhaProfessorCobranca | null) ?? null)) {
      const { error: et } = await db.from("physiq_professores").update({ acesso_liberado_ate: null, nucleo_acesso_ate: null }).eq("id", treinoId);
      if (et) throw et;
      professor = "sem_acesso";
    }
  }

  // 4. aluno: a matrícula com Treino manda em professor_id, conta_id, status e no cadastro
  let aluno: ResultadoEspelho["aluno"] = "sem_matricula_de_treino";
  const mat = escolherMatriculaTreino(resumo.matriculas);
  if (mat) {
    const { data: perfil, error: ep } = await db.from("physiq_profiles").select("id, status, professor_id, conta_id").eq("id", treinoId).maybeSingle();
    if (ep) throw ep;
    if (!perfil) {
      aluno = "sem_perfil";
    } else {
      const campos: Record<string, unknown> = { conta_id: mat.conta_id, status: statusDoPerfil(mat, (perfil as { status: string | null }).status) };
      if (!mat.personal_id) {
        campos.professor_id = null; // sem responsável de treino
      } else {
        const mapa = await mapearTreino(db, [mat.personal_id]);
        const profTreino = mapa.get(mat.personal_id);
        if (profTreino) campos.professor_id = profTreino; // personal ainda sem vínculo: liga quando ele entrar (passo 5 dele)
      }
      if (mat.nome && mat.nome.trim()) campos.nome = mat.nome.trim();
      const sexo = sexoTreino(mat.genero);
      if (sexo) campos.sexo = sexo;
      if (mat.nascimento) campos.data_nascimento = mat.nascimento;
      const { error: eu } = await db.from("physiq_profiles").update(campos).eq("id", treinoId);
      if (eu) throw eu;
      aluno = "atualizado";
    }
  }

  // 5. personal: liga ao Treino dele os alunos de treino que já têm vínculo (aluno que entrou antes do personal)
  let ligados = 0;
  if (acesso && resumo.alunos_de_treino?.length) {
    const mapa = await mapearTreino(db, resumo.alunos_de_treino.map((a) => a.principal_user_id));
    for (const a of resumo.alunos_de_treino) {
      const alunoTreino = mapa.get(a.principal_user_id);
      if (!alunoTreino || alunoTreino === treinoId) continue;
      const { data, error } = await db.from("physiq_profiles")
        .update({ professor_id: treinoId, conta_id: a.conta_id })
        .eq("id", alunoTreino)
        .or(`professor_id.is.null,professor_id.neq.${treinoId},conta_id.is.null,conta_id.neq.${a.conta_id}`)
        .select("id");
      if (error) throw error;
      ligados += (data ?? []).length;
    }
  }

  return { papel: papelNovo, papel_mudou: papelMudou, membros: linhas.length, professor, aluno, alunos_ligados: ligados };
}
