import { ehProfissional, type Situacao } from "@/nucleo/situacao";

/**
 * W14 (falha F2 — R12, spec 9): o ajuste "Acesso ao app" do aluno desligado pelo profissional. O login é aceito e o app fecha em
 * seguida com a mensagem própria — diferente das 3 travas que já existem (master bloqueou os alunos da conta, "Acesso pausado
 * pelo seu profissional" da W13 e "Pagamento pendente"). Vale pela situação do banco principal (guardada no aparelho: abre
 * fechado também sem internet depois da 1ª conferência). Quem também é profissional ou master nunca é travado (P7); basta UMA
 * matrícula ativa (e não bloqueada) com o acesso ligado para o app abrir (o caso de 2 contas da migração, P7).
 */
export const TITULO_ACESSO_APP = "Seu acesso ao app está desligado";
export const TEXTO_ACESSO_APP = "Fale com seu profissional para voltar a usar. O que você já tinha continua guardado.";

export function acessoAppDesligado(s: Situacao | null | undefined): boolean {
  if (!s || ehProfissional(s)) return false;
  const vivas = (s.matriculas || []).filter((m) => m.ativo && !m.bloqueada);
  if (!vivas.length) return false;
  // ausente (servidor de antes da W14 ou situação guardada antiga) = ligado
  return vivas.every((m) => m.acesso_app === false);
}
