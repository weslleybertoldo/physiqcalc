/**
 * Card "Acesso do aluno" (W8b; a W14 estende com desativar/remover): regras puras — a senha provisória gerada, a validação, o
 * estado que o card mostra e as frases dos erros das RPCs (paciente_criar_acesso / paciente_redefinir_senha / aluno_acesso).
 */

export interface BloqueioLogin {
  erros: number;
  bloqueado_ate: string | null;
  bloqueado_de_vez: boolean;
}

export interface AcessoDoLogin {
  user_id: string;
  email: string;
  ativo: boolean;
  criado_em: string | null;
  ultimo_acesso: string | null;
  entra_com_google?: boolean;
  tem_senha?: boolean;
  senha_provisoria?: boolean;
  bloqueio?: BloqueioLogin | null;
}

export interface DadosAcessoAluno {
  paciente_id: string;
  nome: string | null;
  email: string | null;
  ativo: boolean;
  conta_id: string | null;
  acesso: AcessoDoLogin | null;
  agora: string;
}

export type EstadoAcesso = "sem" | "ativo" | "provisoria" | "bloqueado" | "bloqueado_de_vez" | "desativado";

/** O que o card mostra no chip (a ordem importa: desativado > bloqueado de vez > bloqueado > provisória > ativo). */
export function estadoDoAcesso(d: Pick<DadosAcessoAluno, "acesso" | "agora"> | null | undefined, agora = Date.now()): EstadoAcesso {
  const a = d?.acesso;
  if (!a) return "sem";
  if (!a.ativo) return "desativado";
  if (a.bloqueio?.bloqueado_de_vez) return "bloqueado_de_vez";
  // o fim do bloqueio vem no relógio do servidor: compara com a hora do servidor + o tempo que passou desde a resposta
  if (a.bloqueio?.bloqueado_ate && Date.parse(a.bloqueio.bloqueado_ate) > agora) return "bloqueado";
  if (a.senha_provisoria) return "provisoria";
  return "ativo";
}

export const ROTULO_ESTADO: Record<EstadoAcesso, string> = {
  sem: "SEM ACESSO",
  ativo: "ATIVO",
  provisoria: "SENHA PROVISÓRIA",
  bloqueado: "BLOQUEADO",
  bloqueado_de_vez: "BLOQUEADO",
  desativado: "DESATIVADO",
};

export const TOM_ESTADO: Record<EstadoAcesso, "g" | "n" | "a" | "r"> = {
  sem: "g",
  ativo: "n",
  provisoria: "a",
  bloqueado: "r",
  bloqueado_de_vez: "r",
  desativado: "r",
};

// sem letras/números que se confundem ao ditar (0/O, 1/l/I)
const LETRAS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITOS = "23456789";

/** Número aleatório em [0, n) do gerador do navegador (sem viés: rejeita o que sobra). */
function aleatorio(n: number, fonte: (b: Uint32Array) => Uint32Array): number {
  const limite = Math.floor(0x1_0000_0000 / n) * n;
  const b = new Uint32Array(1);
  for (;;) {
    fonte(b);
    if (b[0] < limite) return b[0] % n;
  }
}

/** Senha provisória para o profissional passar ao aluno: 10 caracteres, letras e números (do crypto do navegador). */
export function gerarSenhaProvisoria(tamanho = 10, fonte: (b: Uint32Array) => Uint32Array = (b) => crypto.getRandomValues(b)): string {
  const tudo = LETRAS + DIGITOS;
  const chars = [LETRAS[aleatorio(LETRAS.length, fonte)], DIGITOS[aleatorio(DIGITOS.length, fonte)]];
  while (chars.length < tamanho) chars.push(tudo[aleatorio(tudo.length, fonte)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = aleatorio(i + 1, fonte);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export const SENHA_MIN = 8;

/** Validação da folha: e-mail (só ao criar o acesso) e a senha com 8+ caracteres, letras e números. */
export function validarAcesso(f: { email: string; senha: string }, criar: boolean): string | null {
  if (criar && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return "Informe um e-mail válido.";
  if (f.senha.length < SENHA_MIN) return `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`;
  if (!/[A-Za-z]/.test(f.senha) || !/[0-9]/.test(f.senha)) return "A senha precisa ter letras e números.";
  return null;
}

/** Códigos curtos das RPCs → frase para o profissional. */
export function textoErroAcesso(mensagem: string, padrao = "Não foi possível concluir. Tente de novo."): string {
  const m = (mensagem ?? "").toLowerCase();
  if (m.includes("sem_acesso")) return "Você não mexe no acesso deste aluno.";
  if (m.includes("aluno_inexistente")) return "Aluno não encontrado.";
  if (m.includes("ja_tem_acesso")) return "Este aluno já tem acesso. Atualize a página.";
  if (m.includes("sem_conta")) return "Este aluno ainda não tem acesso. Atualize a página.";
  if (m.includes("email_invalido")) return "Informe um e-mail válido.";
  if (m.includes("email_em_uso")) return "Já existe uma conta com este e-mail. Se for dele, peça para entrar com o Google.";
  if (m.includes("senha_curta")) return `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`;
  if (m.includes("failed to fetch") || m.includes("network")) return "Sem conexão agora. Tente de novo.";
  return padrao;
}

/** "hoje, 14:32" · "ontem, 09:10" · "12/08/2026" · "Nunca entrou". */
export function textoUltimoAcesso(iso: string | null | undefined, agora = new Date()): string {
  if (!iso) return "Nunca entrou";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  const dia = (x: Date) => x.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  if (dia(d) === dia(agora)) return `hoje, ${hora}`;
  const ontem = new Date(agora.getTime() - 86_400_000);
  if (dia(d) === dia(ontem)) return `ontem, ${hora}`;
  return dia(d);
}

/** "14:52" (hora de São Paulo) — até quando o bloqueio temporário vale. */
export function horaDoBloqueio(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "";
}

/** O texto para o profissional copiar e mandar ao aluno. */
export function textoParaOAluno(p: { nome?: string | null; email: string; senha: string; site?: string }): string {
  const primeiro = (p.nome ?? "").trim().split(/\s+/)[0];
  const site = p.site ?? "https://physiqcalc.com.br";
  return [
    `${primeiro ? `Oi, ${primeiro}! ` : ""}Seu acesso ao Physiq:`,
    `E-mail: ${p.email}`,
    `Senha provisória: ${p.senha}`,
    `Entre em ${site} (ou no app) em "Entrar com e-mail e senha". No primeiro acesso você cria a sua senha.`,
  ].join("\n");
}
