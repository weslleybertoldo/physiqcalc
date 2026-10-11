// Perfil do aluno › Avaliação (W17): os erros dos 2 bancos em frases para quem usa o painel.
// hml-19c: o erro da função nutricao (a antropometria e as fotos de evolução gravam por ela) já chega com a frase fixa do código
// (ErroNutricao, src/nutricao/servidor.ts) — ela vai à tela como está (antes, a mensagem crua do banco caía no texto genérico).
import { ErroFonte } from "@/evolucao/fontes";
import { ErroNutricao } from "@/nutricao/servidor";
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
  // hml-19c — a foto mensal pela admin-avaliacoes (foto_preparar → o arquivo no link assinado → foto_salvar; foto_excluir)
  upload_falhou: "Não foi possível enviar a foto. Tente de novo.",
  arquivo_ausente: "A foto não chegou. Envie de novo.",
  invalid_action: "Esta ação não está disponível. Atualize o app.",
};

export function mensagemDoErro(e: unknown): string {
  if (e instanceof ErroNutricao) return e.message;
  const codigo = e instanceof ErroAvaliacao || e instanceof ErroFonte ? e.message : e instanceof Error ? e.message : "";
  if (MENSAGEM[codigo]) return MENSAGEM[codigo];
  if (/row-level security|permission denied|42501/i.test(codigo)) return "Você não tem permissão para mudar isto.";
  return "Não deu certo agora. Tente de novo.";
}
