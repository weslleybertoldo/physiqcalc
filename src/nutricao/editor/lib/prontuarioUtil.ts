// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/prontuarioUtil.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { differenceInYears, format, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { chaveDia, combinarDataHora, formatarHora } from "@/nutricao/editor/lib/agendaUtil";
import { blocosDoMarkdown, normalizarConteudo, textoSemMarcas } from "@/nutricao/editor/lib/orientacoesUtil";

// Regras puras do prontuário do paciente (W11) — registros clínicos datados com texto em markdown SIMPLES (os mesmos
// blocos das orientações da W10: `# título`, `## subtítulo`, `- item`, parágrafos, `**negrito**`). Nada de rede aqui;
// testado no vitest. Data/hora reusam os helpers da agenda (W3); o resumo da linha segue o padrão das consultas (W4).

export const TEXTO_MAX = 20000;
export const RESUMO_MAX = 90;

/** O que a nutricionista digita no modal: data yyyy-MM-dd, hora HH:mm e o texto em markdown simples. */
export type FormRegistro = { data: string; hora: string; texto: string };
/** Como vai/vem do banco (timestamptz em ISO + texto normalizado). */
export type RegistroBase = { data: string; texto: string };

/** Formulário do "novo registro": data e hora de agora, texto vazio. */
export const formVazio = (agora: Date = new Date()): FormRegistro => ({ data: chaveDia(agora), hora: formatarHora(agora), texto: "" });

export function formParaRegistro(f: FormRegistro): RegistroBase {
  return { data: combinarDataHora(f.data, f.hora).toISOString(), texto: normalizarConteudo(f.texto) };
}

export function registroParaForm(r: RegistroBase): FormRegistro {
  const d = new Date(r.data);
  return { data: chaveDia(d), hora: formatarHora(d), texto: r.texto ?? "" };
}

/** Texto sem nenhum bloco (só espaços e linhas em branco) não vale como registro. */
export const textoVazio = (texto: string | null | undefined): boolean => blocosDoMarkdown(texto).length === 0;

export const formatarDataHoraRegistro = (iso: string): string => format(new Date(iso), "dd/MM/yyyy HH:mm");

/** Linha recolhida da lista: 1ª linha com conteúdo, sem as marcas de markdown (`#`, `-`, `**`), até RESUMO_MAX chars. */
export function resumoRegistro(texto: string | null | undefined, max = RESUMO_MAX): string {
  const linha = (texto ?? "").split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  const limpa = textoSemMarcas(linha.replace(/^#{1,6}\s+/, "").replace(/^[-*•]\s+/, "")).replace(/\s+/g, " ").trim();
  return limpa.length > max ? `${limpa.slice(0, max - 1).trimEnd()}…` : limpa;
}

const instante = (iso: string): number => new Date(iso).getTime();

/** Mais recente primeiro (pela data do registro; empate → o gravado por último primeiro). */
export function ordenarRegistros<T extends { data: string; created_at: string }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => instante(b.data) - instante(a.data) || instante(b.created_at) - instante(a.created_at));
}

/** Substitui (pelo id) ou acrescenta e devolve a lista já ordenada. */
export const inserirOrdenado = <T extends { id: string; data: string; created_at: string }>(lista: T[], r: T): T[] =>
  ordenarRegistros([...lista.filter((x) => x.id !== r.id), r]);

export const ultimoRegistro = <T extends { data: string; created_at: string }>(lista: T[]): T | null => ordenarRegistros(lista)[0] ?? null;

/** `yyyy-MM` do mês do registro (fuso local). */
export const chaveMes = (iso: string): string => format(new Date(iso), "yyyy-MM");

/** "2026-09" → "Setembro de 2026". */
export function rotuloMes(chave: string): string {
  const [ano, mes] = chave.split("-").map(Number);
  const texto = format(new Date(ano, mes - 1, 1), "MMMM 'de' yyyy", { locale: ptBR });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export type GrupoMes<T> = { chave: string; rotulo: string; registros: T[] };

/** Agrupa por mês, mês mais recente primeiro (e, dentro do mês, registro mais recente primeiro). */
export function agruparPorMes<T extends { data: string; created_at: string }>(lista: T[]): GrupoMes<T>[] {
  const grupos: GrupoMes<T>[] = [];
  for (const r of ordenarRegistros(lista)) {
    const chave = chaveMes(r.data);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.chave === chave) ultimo.registros.push(r);
    else grupos.push({ chave, rotulo: rotuloMes(chave), registros: [r] });
  }
  return grupos;
}

export function textoContagem(n: number): string {
  if (n === 0) return "Nenhum registro";
  if (n === 1) return "1 registro";
  return `${n} registros`;
}

/** Nascimento (`yyyy-MM-dd`) → "dd/MM/yyyy (N anos)"; sem nascimento ou inválido → null. */
export function textoNascimento(nascimento: string | null | undefined, hoje: Date = new Date()): string | null {
  if (!nascimento) return null;
  const d = parseISO(nascimento);
  if (!isValid(d)) return null;
  const anos = differenceInYears(hoje, d);
  return `${format(d, "dd/MM/yyyy")} (${anos} ${anos === 1 ? "ano" : "anos"})`;
}

const slug = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** `prontuario-<paciente sem acento>-<yyyy-MM-dd>.pdf` */
export const nomeArquivoPDFProntuario = (paciente: string, d: Date): string => `prontuario-${slug(paciente) || "paciente"}-${format(d, "yyyy-MM-dd")}.pdf`;
