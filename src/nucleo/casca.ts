/**
 * Dados reais da casca (W3): a W1 procura este arquivo (`src/ui/casca/dadosCasca.ts`, registro por convenção) e passa a
 * usar `useDadosCasca()` daqui no lugar do padrão — card da conta (e a troca de conta), card do plano, contador de
 * alunos, menu do usuário, módulos do aluno (abas do app).
 *
 * Fonte: o login do banco principal e a `minha_situacao()` (src/nucleo/sessao.tsx). O Banco do Treino entra em 2 pontos:
 * o papel espelhado no JWT do Treino (o master e o professor de hoje continuam vendo o painel e o master mesmo se o
 * principal estiver fora do ar) e o `plano-status` do Calc, que é a regra de cobrança das contas 'legado_calc' até a W28.
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { invokeMp } from "@/lib/mpClient";
import type { PlanoStatus } from "@/lib/saasApi";
import { planoDoStatusLegado, type ContaCasca, type DadosCasca, type PlanoCasca } from "@/ui/casca/dadosCasca";
import { useConta } from "./conta";
import { planoCartaoContaNova } from "./cobranca/cartao";
import { planoCartaoConta, planoCartaoNutri } from "./planoLegado";
import { useSessao } from "./sessao";
import { regraDoPlano, type ContaSituacao } from "./situacao";

type Metadados = { full_name?: string; name?: string; avatar_url?: string; picture?: string };

function paraCasca(c: ContaSituacao): ContaCasca {
  return { id: c.id, nome: c.nome, profissionais: Math.max(1, c.profissionais || 1), fotoUrl: null, modulos: c.modulos };
}

export function useDadosCasca(): DadosCasca {
  const sessao = useSessao();
  const conta = useConta();
  const auth = useAuth(); // Banco do Treino (sessão vinda da troca): papel espelhado e plano-status do Calc
  const situacao = sessao.situacao;
  const regra = regraDoPlano(conta.conta, situacao);

  const planoCalc = useQuery({
    // mesma chave do AdminLayout antigo: um pedido só para o card do plano e para a trava das telas antigas
    queryKey: ["plano-status", auth.user?.id],
    queryFn: () => invokeMp<PlanoStatus>("plano-status"),
    enabled: Boolean(auth.user) && auth.isStaff && (regra === "calc" || (!situacao && auth.isStaff)),
    staleTime: 60_000,
    retry: 1,
  });

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
  // (menu, card da conta, card do plano, Configurações). Quem precisa do Treino espera no próprio lugar: as páginas antigas
  // do painel (AdminLayout → "Sem conexão com o Treino") e as abas do app que usam o Treino (GateSessaoTreino do app).
  const carregando =
    !sessao.pronto ||
    (Boolean(usuarioP) && semSituacao && (sessao.carregandoSituacao || (!sessao.erroSituacao && !auth.user))) ||
    (Boolean(usuarioP) && auth.loading);

  let plano: PlanoCasca | null = null;
  if (conta.conta) {
    if (regra === "calc") plano = planoCalc.data ? planoDoStatusLegado(planoCalc.data) : planoCartaoConta(conta.conta, ehMaster);
    else if (regra === "nutri") plano = planoCartaoNutri(situacao?.legado_nutri);
    // W4: conta nova com a situação, o teste e o vencimento reais (e "Renova em … · cartão" com a cobrança automática)
    else if (regra === "nova") plano = planoCartaoContaNova(conta.conta);
    else plano = planoCartaoConta(conta.conta, ehMaster);
  } else if (semSituacao && planoCalc.data) {
    plano = planoDoStatusLegado(planoCalc.data);
  }

  const contaCasca = conta.conta ? paraCasca(conta.conta) : null;
  const contadores: Partial<Record<string, number>> = {};
  if (conta.conta) contadores.Alunos = conta.conta.alunos_ativos;
  else if (planoCalc.data?.professor) contadores.Alunos = planoCalc.data.professor.alunos;

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
