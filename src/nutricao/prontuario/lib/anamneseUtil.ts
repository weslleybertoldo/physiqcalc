// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/anamneseUtil.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { format } from "date-fns";
import { chaveDia, combinarDataHora, formatarHora } from "@/nutricao/editor/lib/agendaUtil";

// Regras puras da anamnese (W5) — modelos (lista de perguntas) e anamneses (perguntas + respostas + texto livre).
// Nada de rede aqui; testado no vitest.

export const TITULO_MODELO_PADRAO = "Anamnese geral (padrão)";
export const PERGUNTAS_PADRAO: string[] = [
  "Queixa principal / motivo da consulta",
  "Objetivo com o acompanhamento nutricional",
  "Histórico de saúde (doenças atuais e anteriores, cirurgias)",
  "Histórico familiar (diabetes, hipertensão, obesidade, dislipidemia)",
  "Medicamentos e suplementos em uso",
  "Alergias e intolerâncias alimentares",
  "Funcionamento intestinal",
  "Sono (horas por noite e qualidade)",
  "Atividade física (tipo, frequência e duração)",
  "Consumo de água por dia",
  "Bebida alcoólica e tabagismo",
  "Rotina alimentar (horários, refeições e onde costuma comer)",
  "Preferências e aversões alimentares",
];

export const PERGUNTAS_MAX = 60;
export const PERGUNTA_MAX = 300;
export const RESPOSTA_MAX = 4000;
export const TEXTO_LIVRE_MAX = 10000;
export const TITULO_MAX = 120;

export type ItemAnamnese = { pergunta: string; resposta: string };

/** Uma pergunta por linha; tira vazias, espaços repetidos e duplicadas (sem diferenciar caixa). */
export function perguntasDoTexto(texto: string): string[] {
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const linha of texto.split(/\r?\n/)) {
    const p = linha.replace(/\s+/g, " ").trim().slice(0, PERGUNTA_MAX);
    if (!p) continue;
    const chave = p.toLowerCase();
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    saida.push(p);
  }
  return saida.slice(0, PERGUNTAS_MAX);
}

export const textoDasPerguntas = (perguntas: string[]): string => perguntas.join("\n");

/** Lê o jsonb `perguntas` do banco com segurança (só strings não vazias). */
export function lerPerguntas(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
}

/** Lê o jsonb `conteudo` do banco com segurança. */
export function lerConteudo(v: unknown): ItemAnamnese[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const pergunta = typeof o.pergunta === "string" ? o.pergunta : "";
    if (!pergunta) return [];
    return [{ pergunta, resposta: typeof o.resposta === "string" ? o.resposta : "" }];
  });
}

export const montarConteudo = (perguntas: string[], respostas: string[]): ItemAnamnese[] =>
  perguntas.map((pergunta, i) => ({ pergunta, resposta: (respostas[i] ?? "").trim() }));

export const contarRespondidas = (c: ItemAnamnese[]): number => c.filter((i) => i.resposta.trim() !== "").length;

export const textoRespondidas = (c: ItemAnamnese[]): string => (c.length ? `${contarRespondidas(c)}/${c.length} respondidas` : "só texto livre");

export const ehVazia = (c: ItemAnamnese[], textoLivre: string | null | undefined): boolean =>
  contarRespondidas(c) === 0 && !(textoLivre ?? "").trim();

export const tituloPadrao = (modelo: string | null | undefined, d: Date = new Date()): string => `${modelo || "Anamnese"} — ${format(d, "dd/MM/yyyy")}`;

export const formatarDataHoraAnamnese = (iso: string): string => format(new Date(iso), "dd/MM/yyyy HH:mm");

const instante = (iso: string): number => new Date(iso).getTime();

/** Mais recente primeiro (pela data da anamnese; empate → a criada por último primeiro). */
export function ordenarAnamneses<T extends { data: string; created_at: string }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => instante(b.data) - instante(a.data) || instante(b.created_at) - instante(a.created_at));
}

export const inserirOrdenada = <T extends { id: string; data: string; created_at: string }>(lista: T[], a: T): T[] =>
  ordenarAnamneses([...lista.filter((x) => x.id !== a.id), a]);

/** Modelo DO SISTEMA (W40): nutricionista_id NULL no banco — vale pra todas as profissionais, só leitura (Duplicar pra editar). */
export const ehModeloDoSistema = (m: { nutricionista_id?: string | null }): boolean => m.nutricionista_id === null;
const grupoModelo = (m: { favorito: boolean; nutricionista_id?: string | null }): number => (ehModeloDoSistema(m) ? 2 : m.favorito ? 0 : 1);
/** Favoritos → próprios → do sistema; dentro de cada grupo, ordem alfabética do título. */
export function ordenarModelos<T extends { favorito: boolean; titulo: string; nutricionista_id?: string | null }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => grupoModelo(a) - grupoModelo(b) || a.titulo.localeCompare(b.titulo, "pt-BR"));
}
/** A profissional tem algum modelo PRÓPRIO (fora os do sistema)? */
export const temModeloProprio = (lista: { nutricionista_id?: string | null }[], nutricionistaId: string): boolean =>
  lista.some((m) => m.nutricionista_id === nutricionistaId);
/** Título da cópia feita pelo "Duplicar" (cabe no TITULO_MAX). */
export function tituloCopia(titulo: string): string {
  const sufixo = " (minha cópia)";
  return `${titulo.trim().slice(0, TITULO_MAX - sufixo.length)}${sufixo}`;
}

export function textoContagem(n: number): string {
  if (n === 0) return "Nenhuma anamnese";
  if (n === 1) return "1 anamnese";
  return `${n} anamneses`;
}

/** `anamnese-<paciente sem acento>-<yyyy-MM-dd>.pdf` */
export function nomeArquivoPDF(paciente: string, d: Date): string {
  const slug = paciente
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "paciente";
  return `anamnese-${slug}-${format(d, "yyyy-MM-dd")}.pdf`;
}

/** O que a nutricionista digita no modal. */
export type FormAnamnese = { titulo: string; data: string; hora: string; perguntas: string[]; respostas: string[]; textoLivre: string };
/** Como vai/vem do banco. */
export type RegistroAnamnese = { titulo: string; data: string; conteudo: ItemAnamnese[]; texto_livre: string | null };

export function formParaRegistro(f: FormAnamnese): RegistroAnamnese {
  return {
    titulo: f.titulo.trim() || tituloPadrao(null, combinarDataHora(f.data, f.hora)),
    data: combinarDataHora(f.data, f.hora).toISOString(),
    conteudo: montarConteudo(f.perguntas, f.respostas),
    texto_livre: f.textoLivre.trim() || null,
  };
}

export function registroParaForm(a: RegistroAnamnese): FormAnamnese {
  const d = new Date(a.data);
  const conteudo = lerConteudo(a.conteudo);
  return {
    titulo: a.titulo,
    data: chaveDia(d),
    hora: formatarHora(d),
    perguntas: conteudo.map((i) => i.pergunta),
    respostas: conteudo.map((i) => i.resposta),
    textoLivre: a.texto_livre ?? "",
  };
}
