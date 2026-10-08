/**
 * /c/:codigo — o cadastro pelo link do profissional (W13; H5 — N-57 / DN-6): regras PURAS do formulário, espelho da função do banco
 * `cadastro_link_enviar` (migração 20261002090100_h5_agenda_cadastro_aviso_pix.sql). Como no Nutri (CadastroPublico, W41): só o NOME é
 * obrigatório; apelido, nascimento, telefone, CPF, e-mail, gênero e observações são opcionais; o CPF confere o dígito verificador
 * aqui (o banco confere os 11 dígitos); e-mail ou CPF que já é de um aluno vira pendente como os outros — a tela não diz se a
 * pessoa já é aluna em alguma conta (homologação, H-18, 08/10/2026); o profissional vê o aviso ao aprovar (paciente_email_repetido).
 */
import { EMAIL_RE } from "@/lib/email";

export const NOME_MIN = 2;
export const NOME_MAX = 120;
export const APELIDO_MAX = 60;
export const EMAIL_MAX = 160;
export const OBSERVACOES_MAX = 2000;

export interface FormCadastro {
  nome: string;
  apelido: string;
  email: string;
  telefone: string;
  cpf: string;
  nascimento: string;
  genero: string;
  observacoes: string;
}

export const FORM_VAZIO: FormCadastro = { nome: "", apelido: "", email: "", telefone: "", cpf: "", nascimento: "", genero: "", observacoes: "" };

/** As frases de cada código da função (alunos → cadastro_link_enviar). */
export const MENSAGEM: Record<string, string> = {
  nome_invalido: "Escreva o seu nome.",
  apelido_invalido: "O apelido pode ter até 60 letras.",
  email_invalido: "Confira o e-mail.",
  telefone_invalido: "O telefone precisa ter DDD e 8 ou 9 números.",
  cpf_invalido: "Confira o CPF.",
  nascimento_invalido: "Confira a data de nascimento.",
  genero_invalido: "Escolha uma opção de gênero.",
  cadastro_repetido: "Você já mandou um cadastro para este profissional. Espere a aprovação.",
  muitos_cadastros: "Muitos cadastros agora. Tente de novo em alguns minutos.",
  captcha_invalido: "Não deu para confirmar que é você. Tente de novo.",
  link_nao_encontrado: "Este link de cadastro não vale mais. Peça outro ao seu profissional.",
  conta_real_no_staging: "Este é o ambiente de teste: só e-mails de teste.",
};

export const apenasDigitos = (v: string | null | undefined): string => String(v ?? "").replace(/\D/g, "");

/** Máscara progressiva 000.000.000-00. */
export function formatarCPF(v: string | null | undefined): string {
  const d = apenasDigitos(v).slice(0, 11);
  let out = d.slice(0, 3);
  if (d.length > 3) out += "." + d.slice(3, 6);
  if (d.length > 6) out += "." + d.slice(6, 9);
  if (d.length > 9) out += "-" + d.slice(9, 11);
  return out;
}

/** Os 2 dígitos verificadores (e nada de 11 dígitos iguais). */
export function validarCPF(cpf: string): boolean {
  const d = apenasDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/** O 1º problema do formulário como código da função (o mesmo do banco), ou null quando está tudo certo. */
export function problemaDoCadastro(f: FormCadastro, hoje: string = new Date().toISOString().slice(0, 10)): string | null {
  const nome = f.nome.replace(/\s+/g, " ").trim();
  if (nome.length < NOME_MIN || nome.length > NOME_MAX) return "nome_invalido";
  if (f.apelido.trim().length > APELIDO_MAX) return "apelido_invalido";
  const email = f.email.trim();
  if (email && (!EMAIL_RE.test(email) || email.length > EMAIL_MAX)) return "email_invalido";
  const tel = apenasDigitos(f.telefone);
  if (tel && tel.length !== 10 && tel.length !== 11) return "telefone_invalido";
  if (apenasDigitos(f.cpf) && !validarCPF(f.cpf)) return "cpf_invalido";
  if (f.nascimento && (!/^\d{4}-\d{2}-\d{2}$/.test(f.nascimento) || f.nascimento < "1900-01-01" || f.nascimento > hoje)) return "nascimento_invalido";
  return null;
}

/** O que vai para o banco: textos aparados, telefone e CPF só com os dígitos. */
export function dadosDoCadastro(f: FormCadastro): Record<string, string> {
  return {
    nome: f.nome.replace(/\s+/g, " ").trim(),
    apelido: f.apelido.replace(/\s+/g, " ").trim(),
    email: f.email.trim(),
    telefone: apenasDigitos(f.telefone),
    cpf: apenasDigitos(f.cpf),
    nascimento: f.nascimento,
    genero: f.genero,
    observacoes: f.observacoes.trim(),
  };
}

