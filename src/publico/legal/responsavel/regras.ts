/**
 * hml-12 (H-30, D8, P6, P7) — o consentimento do responsável do aluno de 16 ou 17 anos, registrado pelo profissional na ficha do
 * aluno (Resumo › Dados do aluno): regras PURAS (sem rede). O banco é a verdade (aluno_responsavel e aluno_responsavel_registrar, da
 * migração 20261008200000_hml12_aceite_e_consentimento.sql): a faixa de idade, quem pode editar e o registro vigente vêm de lá. Aqui
 * ficam os rótulos, a frase do registro, a conferência do formulário (com os mesmos códigos do banco), o que vai para o banco e as
 * frases dos erros.
 */

export type FaixaIdade = "menor_16" | "16_17" | "adulto";
export type Vinculo = "mae" | "pai" | "responsavel_legal";
export type FormaConsentimento = "presencial" | "documento_assinado" | "mensagem_escrita";

/** O registro vigente (o último evento da matrícula é "aceitou"). */
export interface RegistroResponsavel {
  nome: string;
  vinculo: string;
  forma: string;
  /** timestamptz */
  em: string | null;
  /** o nome do profissional que registrou */
  por: string | null;
}

/** O que aluno_responsavel devolve (e aluno_responsavel_registrar, depois de gravar). */
export interface ResponsavelAluno {
  /** a versão dos textos está ligada no banco (desligada = a seção não aparece) */
  ligado: boolean;
  /** pela data de nascimento da matrícula; sem data = null */
  faixa: FaixaIdade | null;
  pode_editar: boolean;
  atual: RegistroResponsavel | null;
}

export const VINCULOS: { valor: Vinculo; rotulo: string }[] = [
  { valor: "mae", rotulo: "Mãe" },
  { valor: "pai", rotulo: "Pai" },
  { valor: "responsavel_legal", rotulo: "Responsável legal" },
];

export const FORMAS: { valor: FormaConsentimento; rotulo: string }[] = [
  { valor: "presencial", rotulo: "Pessoalmente" },
  { valor: "documento_assinado", rotulo: "Documento assinado" },
  { valor: "mensagem_escrita", rotulo: "Mensagem escrita" },
];

/** O nome do responsável: de 2 a 120 letras (a mesma conferência do banco). */
export const NOME_MIN = 2;
export const NOME_MAX = 120;

export interface FormResponsavel {
  nome: string;
  vinculo: Vinculo | "";
  forma: FormaConsentimento | "";
  /** a caixa "Conferi a idade do aluno… Guardo a prova comigo." */
  confirmo: boolean;
}

export const FORM_VAZIO: FormResponsavel = { nome: "", vinculo: "", forma: "", confirmo: false };

/** A consulta da seção: muda com a data de nascimento (o "Editar dados" troca a data → a faixa é lida de novo). */
export const chaveResponsavel = (alunoId: string, nascimento?: string | null) => ["aluno-responsavel", alunoId, nascimento ?? null] as const;

/** Espaços repetidos viram 1, sem espaço nas pontas. */
export const nomeLimpo = (nome: string) => nome.replace(/\s+/g, " ").trim();

/** O 1º problema do formulário com o código do banco, ou null quando dá para registrar. */
export function problemaDoResponsavel(f: FormResponsavel): string | null {
  const nome = nomeLimpo(f.nome);
  if (nome.length < NOME_MIN || nome.length > NOME_MAX) return "nome_invalido";
  if (!VINCULOS.some((v) => v.valor === f.vinculo)) return "vinculo_invalido";
  if (!FORMAS.some((x) => x.valor === f.forma)) return "forma_invalida";
  if (!f.confirmo) return "falta_confirmar";
  return null;
}

/** O p_dados do registro (aluno_responsavel_registrar). A origem é a do aceite (site, apk ou loja). */
export function dadosDoRegistro(f: FormResponsavel, origem: string): Record<string, unknown> {
  return { acao: "registrar", nome: nomeLimpo(f.nome), vinculo: f.vinculo, forma: f.forma, confirmo: f.confirmo, origem };
}

/** O p_dados da retirada (o banco grava o evento "revogou" do registro vigente). */
export function dadosDaRetirada(origem: string): Record<string, unknown> {
  return { acao: "retirar", origem };
}

const rotuloDe = (lista: { valor: string; rotulo: string }[], valor: string) => lista.find((x) => x.valor === valor)?.rotulo ?? valor;
export const rotuloVinculo = (vinculo: string) => rotuloDe(VINCULOS, vinculo);
export const rotuloForma = (forma: string) => rotuloDe(FORMAS, forma);

/** "08/10/2026" — o dia do registro em São Paulo. */
export function dataDoRegistro(em: string | null | undefined): string {
  if (!em) return "";
  const d = new Date(em);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** "Maria Souza (mãe) · pessoalmente · 08/10/2026 · registrado por Lucas Ferreira" (o que faltar sai da frase). */
export function textoDoRegistro(r: RegistroResponsavel): string {
  return [
    `${r.nome} (${rotuloVinculo(r.vinculo).toLowerCase()})`,
    rotuloForma(r.forma).toLowerCase(),
    dataDoRegistro(r.em),
    r.por ? `registrado por ${r.por}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

const FAIXAS: FaixaIdade[] = ["menor_16", "16_17", "adulto"];
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** A resposta do banco no formato da tela: faixa desconhecida vira null (sem seção); registro sem nome é ignorado. */
export function normalizarResponsavel(bruto: unknown): ResponsavelAluno {
  const r = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const a = (r.atual && typeof r.atual === "object" ? r.atual : null) as Record<string, unknown> | null;
  const nome = texto(a?.nome);
  return {
    ligado: r.ligado === true,
    faixa: FAIXAS.includes(r.faixa as FaixaIdade) ? (r.faixa as FaixaIdade) : null,
    pode_editar: r.pode_editar === true,
    atual: a && nome ? { nome, vinculo: texto(a.vinculo) ?? "", forma: texto(a.forma) ?? "", em: texto(a.em), por: texto(a.por) } : null,
  };
}

/** As frases dos códigos do banco (aluno_responsavel_registrar) e da conferência da tela. */
export const MENSAGEM_RESPONSAVEL: Record<string, string> = {
  nome_invalido: "Escreva o nome do responsável.",
  vinculo_invalido: "Escolha o vínculo: mãe, pai ou responsável legal.",
  forma_invalida: "Escolha como o consentimento foi dado.",
  falta_confirmar: "Marque a confirmação para registrar.",
  nao_e_16_17: "O registro do responsável é só para alunos de 16 ou 17 anos. Confira a data de nascimento.",
  sem_registro_vigente: "Não há consentimento registrado para retirar.",
  sem_acesso: "Só o dono da conta ou o profissional responsável pode registrar isso.",
  aluno_inexistente: "Aluno não encontrado.",
  textos_desligados: "O registro do consentimento ainda não está disponível.",
  conta_real_no_staging: "Este é o ambiente de teste: só contas de teste.",
  sem_login: "Sua sessão terminou. Entre de novo.",
  sem_internet: "Sem conexão. Tente de novo quando a internet voltar.",
};

export function mensagemErroResponsavel(codigo: string | null | undefined): string {
  const c = String(codigo ?? "").trim();
  if (MENSAGEM_RESPONSAVEL[c]) return MENSAGEM_RESPONSAVEL[c];
  if (/failed to fetch|network/i.test(c)) return MENSAGEM_RESPONSAVEL.sem_internet;
  return "Não deu certo agora. Tente de novo.";
}
