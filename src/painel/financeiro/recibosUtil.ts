// Physiq W19 — regras PURAS dos recibos do Painel › Financeiro (N-59, N-62): o que faltava na porta da W6 (src/financeiro/recibos.ts —
// tags, extenso, número, CPF, nome do PDF, ordenação dos modelos) para o fluxo do PhysiqNutri (main ca9f66f, src/lib/recibosUtil.ts):
// formulário ⇄ registro, modelo inicial (o 1º ★), dados de exemplo da prévia, contagens — e o que muda por PAPEL: a nutricionista
// recebe o mesmo modelo padrão, a mesma descrição e os mesmos rótulos do site antigo ("Paciente", "Nutricionista"); o personal e quem
// tem os 2 papéis recebem os do Physiq ("Aluno", "Personal trainer"/"Profissional", sem "nutricional").
import { chaveDia, dataValida } from "@/nutricao/editor/lib/agendaUtil";
import { normalizarConteudo } from "@/nutricao/editor/lib/orientacoesUtil";
import { CONTEUDO_MODELO_PADRAO, DESCRICAO_RECIBO_MAX, TAGS, type DadosTags } from "@/financeiro/recibos";
import { parseValor, textoValor } from "./financeiroUtil";

export type PapelProfissional = "dono" | "personal" | "nutricionista";

/** O texto do modelo padrão do site antigo do Nutri (o mesmo de hoje para a nutricionista). */
export const CONTEUDO_MODELO_PADRAO_NUTRI = [
  "Recebi de *|NOME_PACIENTE|*, CPF *|NUMERO_DOCUMENTO_PACIENTE|*, a quantia de *|VALOR_CONSULTA|* (*|VALOR_POR_EXTENSO|*), referente a atendimento nutricional.",
  "",
  "Para maior clareza, firmo o presente recibo.",
  "",
  "*|DATA_HOJE|*",
  "",
  "*|NOME_NUTRICIONISTA|*",
  "*|CARIMBO|*",
].join("\n");

export interface PadraoRecibo {
  /** só nutricionista: tudo igual ao site antigo */
  nutri: boolean;
  conteudoModelo: string;
  descricao: string;
  rotuloPaciente: string;
  rotuloProfissional: string;
}

/** O padrão do recibo pelo papel de quem emite (na conta ativa). */
export function padraoDoRecibo(papeis: readonly string[] | null | undefined): PadraoRecibo {
  const p = papeis ?? [];
  const nutri = p.includes("nutricionista") && !p.includes("personal");
  if (nutri) return { nutri, conteudoModelo: CONTEUDO_MODELO_PADRAO_NUTRI, descricao: "Consulta nutricional", rotuloPaciente: "Paciente", rotuloProfissional: "Nutricionista" };
  const personal = p.includes("personal") && !p.includes("nutricionista");
  return { nutri, conteudoModelo: CONTEUDO_MODELO_PADRAO, descricao: "Atendimento", rotuloPaciente: "Aluno", rotuloProfissional: personal ? "Personal trainer" : "Profissional" };
}

/** "Camila Rocha (nutricionista)" — o autor ao lado da data no PDF de um recibo que outro membro emitiu. */
export function rotuloAutor(nome: string | null | undefined, papeis: readonly string[] | null | undefined): string {
  const n = (nome ?? "").trim() || "Profissional";
  const t = padraoDoRecibo(papeis).rotuloProfissional.toLowerCase();
  return `${n} (${t})`;
}

/** Dados de exemplo para a prévia do modelo. */
export const dadosExemplo = (nomeProfissional: string | null | undefined, hoje: Date = new Date()): DadosTags & { valor: number; data: string; numero: number } => ({
  nomePaciente: "Maria da Silva",
  cpf: "12345678909",
  valor: 180,
  data: chaveDia(hoje),
  numero: 1,
  nomeProfissional: nomeProfissional || "Ana Nutri",
});

export const contarTags = (conteudo: string | null | undefined): number => TAGS.filter((t) => (conteudo ?? "").includes(t.tag)).length;
export const textoTags = (n: number): string => (n === 0 ? "sem tags" : n === 1 ? "1 tag" : `${n} tags`);

/** Nº maior primeiro (o mais recente). */
export const ordenarRecibos = <T extends { numero: number }>(lista: T[]): T[] => [...lista].sort((a, b) => b.numero - a.numero);
export function textoContagemRecibos(n: number): string {
  if (n === 0) return "Nenhum recibo";
  if (n === 1) return "1 recibo";
  return `${n} recibos`;
}

/** Modelo pré-selecionado: o 1º favorito em ordem alfabética (sem favorito, o 1º da lista); lista vazia → null. */
export function modeloInicial<T extends { id: string; favorito: boolean; titulo: string }>(lista: T[]): T | null {
  return [...lista].sort((a, b) => Number(b.favorito) - Number(a.favorito) || a.titulo.localeCompare(b.titulo, "pt-BR"))[0] ?? null;
}

// ---- Formulário ⇄ registro (o do Nutri) ----
export type FormRecibo = { modeloId: string; descricao: string; valor: string; data: string };
export type RegistroRecibo = { modelo_id: string | null; descricao: string; valor: number; data: string; texto: string };

/** Recibo a partir de uma movimentação (descrição, valor e data dela) ou avulso (descrição padrão do papel, valor vazio, hoje). */
export function formInicial(
  transacao: { descricao: string; valor: number; data: string } | null | undefined,
  modeloId: string,
  descricaoPadrao: string,
  hoje: Date = new Date(),
): FormRecibo {
  return {
    modeloId,
    descricao: (transacao?.descricao ?? "").trim() || descricaoPadrao,
    valor: transacao ? textoValor(Number(transacao.valor)) : "",
    data: transacao && dataValida(transacao.data ?? "") ? transacao.data : chaveDia(hoje),
  };
}

export function formParaRegistro(f: FormRecibo, texto: string, descricaoPadrao: string, hoje: Date = new Date()): RegistroRecibo {
  return {
    modelo_id: f.modeloId || null,
    descricao: (f.descricao ?? "").trim().replace(/\s+/g, " ").slice(0, DESCRICAO_RECIBO_MAX) || descricaoPadrao,
    valor: parseValor(f.valor) ?? 0,
    data: dataValida(f.data ?? "") ? f.data : chaveDia(hoje),
    texto: normalizarConteudo(texto),
  };
}
