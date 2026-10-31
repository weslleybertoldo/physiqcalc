// Physiq — "Excluir minha conta" que funciona sempre (31/10/2026, agente F): o caminho do ALUNO da excluir-minha-conta (o pedido SEM
// o campo `fluxo` — o APK antigo, o site antigo e a volta da folha nova quando a 1ª conferência falha) com quem já foi profissional.
// Regras puras, sem Deno nem supabase-js: o vitest testa daqui mesmo (src/app-aluno/perfil/pecas/exclusaoDoAluno.test.ts). Só a
// excluir-minha-conta importa este arquivo.
//
// O defeito (o caso 2 do agente E; reproduzido no staging em 31/10, 20:06:48Z): quem já foi membro de equipe (linha "removido" em
// conta_membros — o membro ATIVO a conferência do aluno já recusa) passava pelo caminho do aluno, que apaga o login DE VEZ → o
// "on delete set null" do conta_membros.user_id quebra o CHECK conta_membros_pessoa_ou_convite → 500 e o login fica. O CHECK fica
// como está, de propósito (migração w2l): sem ele o hard delete levaria em cascata (nutricionista_id → auth.users ON DELETE CASCADE)
// o que essa pessoa registrou para os alunos da equipe. A correção: antes de mexer em qualquer coisa a borda pergunta ao banco
// (excluir_conta_profissional, simular — nada muda) e quem já foi profissional sai pela ORDEM DO PROFISSIONAL (soft delete: a linha
// de equipe fica de âncora; o perfil fica anônimo), a MESMA que a folha do app novo já usa para ele; a resposta volta no formato que
// o app do aluno entende ({ ok, simulacao?, apaga, mantem }).
import type { Resposta } from "./exclusao-profissional-regras.ts";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

export type CaminhoDoAluno =
  | { caminho: "aluno" }
  | { caminho: "profissional" }
  | { caminho: "recusa"; erro: string; motivo: unknown };

/**
 * A conferência do profissional (excluir_conta_profissional com simular = true) → por onde o pedido do aluno segue:
 *   nao_profissional (só aluno)           → o caminho de sempre (o login sai de vez);
 *   ok (já foi profissional: ex-membro)   → a ordem do profissional (soft delete);
 *   outra recusa ou resposta estranha     → recusa, nada apagado (falha fechada: nunca cai no hard delete por engano).
 * Chamada DEPOIS da conferência do aluno (que já recusa o master, o dono, o membro ativo e o perfil de nutricionista).
 */
export function caminhoDoPedidoDoAluno(conferenciaProfissional: unknown): CaminhoDoAluno {
  const c = obj(conferenciaProfissional);
  if (c.ok === true) return { caminho: "profissional" };
  if (c.erro === "nao_profissional") return { caminho: "aluno" };
  const erro = typeof c.erro === "string" && c.erro.trim() ? c.erro : "erro_interno";
  return { caminho: "recusa", erro, motivo: erro === "erro_interno" ? null : (c.motivo ?? null) };
}

/**
 * A resposta da ordem do profissional (_shared/exclusao-profissional-regras.ts) no formato do app do aluno. O principal vem da
 * conferência do aluno (excluir_dados_aluno — a MESMA lista que a parte de aluno da ordem do profissional apaga e guarda); o Treino,
 * da conferência do profissional. Recusa (palavra errada, Treino fora, cobrança que não cancelou, erro) = a mesma resposta, o mesmo HTTP.
 */
export function respostaParaOAluno(r: Resposta, conferenciaAluno: unknown, simular: boolean): Resposta {
  if (r.status !== 200 || r.corpo?.ok !== true) return r;
  const a = obj(conferenciaAluno);
  if (simular) {
    const t = r.corpo.treino ? obj(r.corpo.treino) : null;
    return {
      status: 200,
      corpo: {
        ok: true, simulacao: true, perfil: "ex_profissional",
        apaga: { principal: obj(a.apaga), treino: t ? obj(t.apaga) : null },
        mantem: { principal: obj(a.mantem), treino: t ? obj(t.mantem) : null },
      },
    };
  }
  const feito = obj(r.corpo.resultado);
  return {
    status: 200,
    corpo: {
      ok: true, perfil: "ex_profissional",
      apaga: { principal: { ...obj(a.apaga), arquivos: num(feito.arquivos), login: 1 }, treino: feito.treino ?? null },
      mantem: { principal: obj(a.mantem), treino: null },
    },
  };
}
