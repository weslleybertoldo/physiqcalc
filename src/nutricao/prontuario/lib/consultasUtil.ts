// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/consultasUtil.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { format } from "date-fns";
import { chaveDia, combinarDataHora, formatarHora } from "@/nutricao/editor/lib/agendaUtil";

// Regras puras do histórico de consultas (W4) — nada de rede aqui; testado no vitest.

export const ORIGENS = {
  manual: "Registrada à mão",
  agenda: "Vinda da agenda",
  importacao: "Importada",
} as const;
export type OrigemConsulta = keyof typeof ORIGENS;
export const ehOrigem = (v: string): v is OrigemConsulta => Object.prototype.hasOwnProperty.call(ORIGENS, v);

export const OBSERVACAO_MAX = 5000;

/** O que a nutricionista digita: data yyyy-MM-dd, hora HH:mm e a observação livre. */
export type FormConsulta = { data: string; hora: string; observacao: string };
/** Como vai/vem do banco (timestamptz em ISO + observação nula quando vazia). */
export type RegistroConsulta = { data: string; observacao: string | null };

/** Formulário do "registrar consulta": data e hora de agora, observação vazia. */
export const formVazio = (agora: Date = new Date()): FormConsulta => ({ data: chaveDia(agora), hora: formatarHora(agora), observacao: "" });

export function formParaRegistro(f: FormConsulta): RegistroConsulta {
  return { data: combinarDataHora(f.data, f.hora).toISOString(), observacao: f.observacao.trim() || null };
}

export function registroParaForm(c: RegistroConsulta): FormConsulta {
  const d = new Date(c.data);
  return { data: chaveDia(d), hora: formatarHora(d), observacao: c.observacao ?? "" };
}

export const formatarDataHoraConsulta = (iso: string): string => format(new Date(iso), "dd/MM/yyyy HH:mm");
export const rotuloConsulta = (iso: string): string => `Consulta registrada em ${formatarDataHoraConsulta(iso)}`;

const instante = (iso: string): number => new Date(iso).getTime();

/** Mais recente primeiro (pela data da consulta; empate → a registrada por último primeiro). */
export function ordenarConsultas<T extends { data: string; created_at: string }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => instante(b.data) - instante(a.data) || instante(b.created_at) - instante(a.created_at));
}

/** Substitui (pelo id) ou acrescenta e devolve a lista já ordenada. */
export const inserirOrdenada = <T extends { id: string; data: string; created_at: string }>(lista: T[], c: T): T[] =>
  ordenarConsultas([...lista.filter((x) => x.id !== c.id), c]);

export const ultimaConsulta = <T extends { data: string; created_at: string }>(lista: T[]): T | null => ordenarConsultas(lista)[0] ?? null;

export function textoContagem(n: number): string {
  if (n === 0) return "Nenhuma consulta registrada";
  if (n === 1) return "1 consulta registrada";
  return `${n} consultas registradas`;
}

export const ehFutura = (iso: string, agora: Date = new Date()): boolean => instante(iso) > agora.getTime();

/** Primeira linha da observação, cortada, pra linha recolhida da lista. */
export function resumoObservacao(obs: string | null | undefined, max = 90): string {
  const linha = (obs ?? "").trim().split(/\r?\n/)[0] ?? "";
  return linha.length > max ? `${linha.slice(0, max - 1).trimEnd()}…` : linha;
}
