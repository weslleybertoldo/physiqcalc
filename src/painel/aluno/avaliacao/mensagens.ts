// Perfil do aluno › Avaliação (W17): os erros dos 2 bancos em frases para quem usa o painel.
import { ErroFonte } from "@/evolucao/fontes";
import { ErroAvaliacao } from "./avaliacaoApi";

const MENSAGEM: Record<string, string> = {
  sem_internet: "Sem internet. Tente de novo quando a conexão voltar.",
  forbidden: "Você não muda a avaliação física deste aluno (é do personal responsável).",
  sem_acesso: "Você não vê este aluno.",
  plano_vencido: "O plano da conta venceu: a avaliação física fica travada até a renovação.",
  missing_userId: "O aluno ainda não tem o treino no Physiq (ele entra no app primeiro).",
  data_invalida: "Data inválida.",
  rate_limited: "Muitas tentativas seguidas. Espere um minuto e tente de novo.",
  invalid_token: "Sua sessão venceu. Entre de novo.",
  mes_invalido: "Escolha o mês das fotos.",
};

export function mensagemDoErro(e: unknown): string {
  const codigo = e instanceof ErroAvaliacao || e instanceof ErroFonte ? e.message : e instanceof Error ? e.message : "";
  if (MENSAGEM[codigo]) return MENSAGEM[codigo];
  if (/row-level security|permission denied|42501/i.test(codigo)) return "Você não tem permissão para mudar isto.";
  return "Não deu certo agora. Tente de novo.";
}
