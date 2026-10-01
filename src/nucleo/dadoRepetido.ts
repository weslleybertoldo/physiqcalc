/**
 * W16b — e-mail e CPF únicos entre os alunos de pessoas diferentes (decisão do Weslley, 30/09/2026: "Se tentar cadastrar o mesmo
 * email ou o mesmo CPF ele não permite e aparece uma mensagem vermelha abaixo do campo"). A regra mora no banco principal (gatilho
 * em pacientes + as funções das telas — migração 20260930235000_w16b_email_cpf_unicos.sql); aqui ficam as frases, o mapa dos
 * códigos de erro para o campo e quando conferir (regras puras, sem rede — a chamada ao servidor está em ./dadoLivre.ts).
 */
export type CampoRepetido = "email" | "cpf";

export const MENSAGEM_REPETIDO: Record<CampoRepetido, string> = {
  email: "Já existe um aluno com este e-mail.",
  cpf: "Já existe um aluno com este CPF.",
};
export const DICA_REPETIDO = "Para trazer essa pessoa, use o convite ou o seu código.";
/** /c/ (cadastro público pelo link): só diz que já existe — sem dica de convite (quem preenche é o próprio aluno). */
export const MENSAGEM_CADASTRO_EXISTE = "Já existe cadastro com este e-mail.";

/** O campo de cada código de erro (das funções das telas e do gatilho do banco); null = não é de repetido. */
export function campoDoErro(codigo: string | null | undefined): CampoRepetido | null {
  const c = String(codigo ?? "").toLowerCase();
  if (c.includes("email_repetido") || c === "ja_cadastrado" || c === "cadastro_email_existe") return "email";
  if (c.includes("cpf_repetido")) return "cpf";
  return null;
}

/** Os campos repetidos de uma resposta de erro: o `campos` que o banco devolve (os dois de uma vez) ou o do código. */
export function camposDoErro(codigo: string | null | undefined, extra: Record<string, unknown> = {}): CampoRepetido[] {
  const lista = Array.isArray(extra.campos) ? extra.campos.filter((x): x is CampoRepetido => x === "email" || x === "cpf") : [];
  if (lista.length) return [...new Set(lista)];
  const um = campoDoErro(codigo);
  return um ? [um] : [];
}

const soDigitos = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "");
export const normalizarEmail = (v: string | null | undefined) => String(v ?? "").trim().toLowerCase();

/** Vale conferir no servidor? Só quando o valor mudou do que o aluno já tem e tem cara de e-mail/CPF completo. */
export function precisaConferir(tipo: CampoRepetido, valor: string, inicial = ""): boolean {
  if (tipo === "email") {
    const v = normalizarEmail(valor);
    return v !== normalizarEmail(inicial) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }
  const d = soDigitos(valor);
  return d !== soDigitos(inicial) && d.length === 11;
}
