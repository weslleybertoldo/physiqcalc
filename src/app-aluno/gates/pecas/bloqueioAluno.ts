import { ehProfissional, type Situacao } from "@/nucleo/situacao";

/**
 * W13 (F5, R10, spec 9) — o profissional bloqueou o acesso do aluno ("Bloquear acesso" em Alunos). Duas fontes:
 *   · o banco principal (minha_situacao(): matrícula com acesso_bloqueado_em — guardada no aparelho, abre sem internet);
 *   · o espelho do Banco do Treino que o PowerSync traz (physiq_profiles.status = 'bloqueado'): chega no aparelho logo depois
 *     do bloqueio (sincronização), então a trava vale SEM INTERNET depois da 1ª sincronização, mesmo com a situação guardada
 *     de antes do bloqueio.
 * O principal manda: com internet, se a situação acabou de ser conferida no servidor e diz que não está bloqueado, o espelho
 * velho do aparelho não fecha o app (desbloqueou e o PowerSync ainda não trouxe o 'ativo').
 * Quem também é profissional ou master nunca é travado aqui (P7). Uma matrícula ativa sem bloqueio (ex.: o caso de 2 contas da
 * migração, P7) mantém o app aberto.
 */
export interface BloqueioAluno {
  bloqueado: boolean;
  mensagem: string | null;
  fonte: "principal" | "treino" | null;
}

export const TITULO_BLOQUEIO_PROFISSIONAL = "Acesso pausado pelo seu profissional";
export const TEXTO_BLOQUEIO_PROFISSIONAL =
  "O seu profissional pausou o seu acesso ao app. Fale com ele para voltar a usar — o que você já tinha continua guardado.";

const LIVRE: BloqueioAluno = { bloqueado: false, mensagem: null, fonte: null };

export function bloqueioDoProfissional(
  s: Situacao | null | undefined,
  treino?: { status?: string | null } | null,
  confirmadoNoServidor = false,
): BloqueioAluno {
  if (!s || ehProfissional(s)) return LIVRE;
  const vivas = (s.matriculas || []).filter((m) => m.ativo);
  if (!vivas.length) return LIVRE;
  const msg = vivas.find((m) => m.bloqueada && m.bloqueio_msg)?.bloqueio_msg ?? null;
  if (vivas.every((m) => m.bloqueada)) return { bloqueado: true, mensagem: msg, fonte: "principal" };
  // o espelho do Treino só fala do treino: fecha se as matrículas livres são todas de treino (a de só nutrição segue aberta)
  if (!confirmadoNoServidor && treino?.status === "bloqueado" && vivas.every((m) => m.bloqueada || m.modulos.includes("treino"))) {
    return { bloqueado: true, mensagem: msg, fonte: "treino" };
  }
  return LIVRE;
}
