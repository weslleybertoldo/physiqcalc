// Physiq W18 — quem vê e quem muda o prontuário do aluno no painel (spec 4.1, linha Prontuário; P3, P4) e as seções da aba
// Prontuário (spec 4.5). Regras puras: o banco confere de novo (RLS da W2/W3/W18 — pode_ver_clinico, anotacao_valida).
import type { PerfilAluno } from "@/painel/aluno/dados/tipos";

/** As seções da aba (spec 4.5 › Prontuário): as anotações da equipe e as 9 seções clínicas do prontuário do Nutri. */
export const SECOES_PRONTUARIO = [
  { id: "anotacoes", rotulo: "Anotações", clinica: false },
  { id: "consultas", rotulo: "Consultas", clinica: true },
  { id: "anamnese", rotulo: "Anamnese", clinica: true },
  { id: "questionarios", rotulo: "Questionários", clinica: true },
  { id: "exames", rotulo: "Exames", clinica: true },
  { id: "avaliacao-integrada", rotulo: "Avaliação 360", clinica: true },
  { id: "gestacional", rotulo: "Gestacional", clinica: true },
  { id: "farmaco-nutrientes", rotulo: "Fármaco-nutrientes", clinica: true },
  { id: "documentos", rotulo: "Documentos", clinica: true },
  { id: "anexos", rotulo: "Anexos", clinica: true },
] as const;
export type SecaoProntuario = (typeof SECOES_PRONTUARIO)[number]["id"];

/** Os formulários que os atalhos abrem (?nova=…): o "Fluxo de consulta" da W14 e o "Nova anotação" do card do Resumo. */
const NOVA_DA_SECAO: Record<string, SecaoProntuario> = { anotacao: "anotacoes", consulta: "consultas", anamnese: "anamnese" };

/**
 * A seção que a rota pede: `?secao=` (também o do redirecionamento de /pacientes/:id/<seção> do site antigo — "prontuario" é a
 * das anotações) ou o formulário do atalho (`?nova=consulta|anamnese|anotacao`). Sem nada, as anotações.
 */
export function secaoDaUrl(params: URLSearchParams): SecaoProntuario {
  const s = params.get("secao");
  if (s === "prontuario") return "anotacoes";
  if (SECOES_PRONTUARIO.some((x) => x.id === s)) return s as SecaoProntuario;
  const nova = params.get("nova");
  if (nova && NOVA_DA_SECAO[nova]) return NOVA_DA_SECAO[nova];
  return "anotacoes";
}

export type Visibilidade = "equipe" | "nutricionistas";
export type PapelAutor = "master" | "nutricionista" | "personal" | "dono";

export interface AcessoProntuario {
  /** vê as seções clínicas e as anotações "Só nutricionistas" (nutricionista da conta com acesso ao aluno, ou master) */
  clinico: boolean;
  /** muda as seções clínicas (nutricionista responsável, dono com papel de nutricionista, master — RLS da W3) */
  editarClinico: boolean;
  /** visibilidades que a pessoa pode dar a uma anotação; a 1ª é o padrão (nutricionista → só nutricionistas; personal → equipe) */
  visibilidades: Visibilidade[];
}

type PerfilDoAcesso = Pick<PerfilAluno, "eu" | "nutricionista" | "personal" | "conta_id">;

/**
 * Quem vê o quê (spec 4.1): a nutricionista responsável vê e muda tudo; o dono com papel de nutricionista também; o dono sem esse
 * papel e o personal responsável leem e escrevem só as anotações "Equipe" (nada clínico); o master vê e muda tudo. Aluno sem conta
 * (paciente do site antigo) = a nutricionista dona dele.
 */
export function acessoDoProntuario(p: PerfilDoAcesso): AcessoProntuario {
  const eu = p.eu;
  const tudo: AcessoProntuario = { clinico: true, editarClinico: true, visibilidades: ["nutricionistas", "equipe"] };
  const so: AcessoProntuario = { clinico: false, editarClinico: false, visibilidades: ["equipe"] };
  if (!eu) return so;
  if (eu.master) return tudo;
  if (!p.conta_id) return p.nutricionista?.id === eu.id ? tudo : so;
  if (!eu.nutricionista) return so;
  const responsavel = p.nutricionista?.id === eu.id;
  return { clinico: true, editarClinico: responsavel || eu.dono, visibilidades: ["nutricionistas", "equipe"] };
}

/**
 * O papel com que a anotação é assinada (registros_prontuario.autor_papel — o banco recusa papel que a pessoa não tem):
 * "Só nutricionistas" é sempre da nutricionista; na "Equipe", o papel de quem escreve em relação ao aluno (a nutri responsável,
 * o personal responsável, o dono…).
 */
export function papelDaAnotacao(p: PerfilDoAcesso, visibilidade: Visibilidade): PapelAutor {
  const eu = p.eu;
  if (eu?.master) return "master";
  if (visibilidade === "nutricionistas") return "nutricionista";
  if (!eu) return "personal";
  if (!p.conta_id) return "nutricionista";
  if (eu.nutricionista && p.nutricionista?.id === eu.id) return "nutricionista";
  if (eu.personal && p.personal?.id === eu.id) return "personal";
  if (eu.dono) return "dono";
  if (eu.nutricionista) return "nutricionista";
  return "personal";
}

export const ROTULO_VISIBILIDADE: Record<Visibilidade, string> = { equipe: "Equipe", nutricionistas: "Só nutricionistas" };

export const ROTULO_PAPEL: Record<PapelAutor, string> = {
  master: "Master",
  nutricionista: "Nutricionista",
  personal: "Personal",
  dono: "Dono",
};

/** O texto que explica a visibilidade no formulário da anotação. */
export function ajudaVisibilidade(v: Visibilidade): string {
  return v === "equipe"
    ? "Todos que acompanham o aluno leem (personal, nutricionista e o dono da conta)."
    : "Só as nutricionistas da conta que acompanham o aluno leem (o personal não vê).";
}

export function textoAnotacoes(n: number): string {
  if (n === 0) return "Nenhuma anotação";
  if (n === 1) return "1 anotação";
  return `${n} anotações`;
}
