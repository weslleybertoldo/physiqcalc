/**
 * Dados reais da casca (W3): a W1 procura este arquivo (`src/ui/casca/dadosCasca.ts`, registro por convenção) e passa a
 * usar `useDadosCasca()` daqui no lugar do padrão — card da conta (e a troca de conta), card do plano, contador de
 * alunos, menu do usuário, módulos do aluno (abas do app).
 *
 * Fonte: o login do banco principal e a `minha_situacao()` (src/nucleo/sessao.tsx). O Banco do Treino entra só com o papel
 * espelhado no JWT do Treino (o master e o professor de hoje continuam vendo o painel e o master mesmo se o principal estiver
 * fora do ar). O card do plano é o do núcleo para toda conta que paga (a nova e, desde a virada — W28 —, a legada); a isenta e
 * a do master mostram "Sem cobrança" / "Conta master".
 */
import { useAuth } from "@/hooks/useAuth";
import type { ContaCasca, DadosCasca, PlanoCasca } from "@/ui/casca/dadosCasca";
import { useConta } from "./conta";
import { planoCartaoConta, planoCartaoContaNova } from "./cobranca/cartao";
import { useSessao } from "./sessao";
import type { ContaSituacao } from "./situacao";

type Metadados = { full_name?: string; name?: string; avatar_url?: string; picture?: string };

function paraCasca(c: ContaSituacao): ContaCasca {
  return { id: c.id, nome: c.nome, profissionais: Math.max(1, c.profissionais || 1), fotoUrl: null, modulos: c.modulos };
}

export function useDadosCasca(): DadosCasca {
  const sessao = useSessao();
  const conta = useConta();
  const auth = useAuth(); // Banco do Treino (sessão vinda da troca): o papel espelhado
  const situacao = sessao.situacao;

  const usuarioP = sessao.usuario;
  const meta = (usuarioP?.user_metadata ?? {}) as Metadados;
  const nome = situacao?.nome || meta.full_name || meta.name || usuarioP?.email?.split("@")[0] || "";
  const fotoUrl = situacao?.foto_url || meta.avatar_url || meta.picture || null;

  // sem situação e sem internet para buscar (principal fora do ar): vale o que o Treino sabe (spec 9)
  const semSituacao = !situacao;
  const ehMaster = !!situacao?.master || auth.isMaster;
  const ehProfissional = conta.ehProfissional || auth.isStaff;
  const modulosAluno = situacao ? situacao.modulos_aluno : auth.user ? (["treino"] as const).slice() : [];

  // W5 (correção do painel sem o Treino): a casca NÃO espera a troca de token — com a situação do principal ela já abre
  // (menu, card da conta, card do plano, Configurações). Quem precisa do Treino espera no próprio lugar: a Biblioteca do master
  // ("Sem conexão com o Treino") e as abas do app que usam o Treino (GateSessaoTreino do app).
  const carregando =
    !sessao.pronto ||
    (Boolean(usuarioP) && semSituacao && (sessao.carregandoSituacao || (!sessao.erroSituacao && !auth.user))) ||
    (Boolean(usuarioP) && auth.loading);

  let plano: PlanoCasca | null = null;
  if (conta.conta) {
    // W4: conta do núcleo com a situação, o teste e o vencimento reais (e "Renova em … · cartão" com a cobrança automática)
    plano = situacao?.master || conta.conta.situacao === "isenta" ? planoCartaoConta(conta.conta, ehMaster) : planoCartaoContaNova(conta.conta);
  }

  const contaCasca = conta.conta ? paraCasca(conta.conta) : null;
  const contadores: Partial<Record<string, number>> = {};
  if (conta.conta) contadores.Alunos = conta.conta.alunos_ativos;

  return {
    carregando,
    usuario: usuarioP ? { id: usuarioP.id, nome, email: usuarioP.email ?? null, fotoUrl } : null,
    ehProfissional,
    ehMaster,
    ehDono: conta.ehDono || (semSituacao && auth.isStaff),
    papelRotulo: situacao ? conta.papelRotulo : ehMaster ? "Master" : auth.isStaff ? "Personal trainer" : "Aluno",
    modulosAluno: modulosAluno as DadosCasca["modulosAluno"],
    conta: contaCasca,
    contas: conta.contas.map(paraCasca),
    trocarConta: conta.contas.length > 1 ? conta.trocarConta : undefined,
    plano,
    contadores,
  };
}
