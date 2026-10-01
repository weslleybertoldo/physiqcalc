import { format } from "date-fns";
import { ordenarRegistros, rotuloReacao, rotuloRefeicao } from "@/nutricao/app/diarioUtil";
import { semAcento } from "@/nutricao/app/numeros";

// Physiq W24 — regras PURAS do Diário alimentar do lado da nutricionista (Painel › Dietas › Diário), portadas do PhysiqNutri
// (src/lib/diarioUtil.ts, W30 de lá: período de 7 a 90 dias, filtro por aluno, "só não reagidas", grupos por dia e os textos). O que
// o aluno e a nutri dividem (refeições, reações sem emoji, ordem, validação da foto, erros da função) fica em src/nutricao/app/
// diarioUtil.ts (W11) — uma cópia só. Datas SEMPRE pelo fuso local via `new Date(iso)` (nunca `slice(0, 10)`). Sem rede; testado.

// ---- Período ----
export const PERIODOS = [7, 15, 30, 45, 60, 90] as const;
export type Periodo = (typeof PERIODOS)[number];
export const PERIODO_PADRAO: Periodo = 7;
export function periodoDaURL(v: string | null | undefined): Periodo {
  const n = Number(v);
  return (PERIODOS as readonly number[]).includes(n) ? (n as Periodo) : PERIODO_PADRAO;
}
/** Meia-noite LOCAL de hoje − (dias − 1): "últimos 7 dias" inclui hoje; 1 = só hoje (o "Diário de hoje" do Dashboard, W25). */
export function inicioDoPeriodo(dias: number, agora: Date = new Date()): Date {
  const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  d.setDate(d.getDate() - (Math.max(1, dias) - 1));
  return d;
}
export const textoPeriodo = (dias: number): string => (dias === 1 ? "hoje" : `últimos ${dias} dias`);

// ---- Reação da nutricionista ----
/** O comentário da nutricionista (coluna comentario_nutri: até 300 caracteres). */
export const COMENTARIO_NUTRI_MAX = 300;

// ---- Lista ----
export type AlunoDoDiario = { id: string; nome: string; apelido?: string | null; link_codigo: string; foto_url?: string | null };
export type RegistroBase = {
  id: string;
  data_hora: string;
  refeicao: string;
  comentario: string;
  reacao_nutri: string | null;
  comentario_nutri: string;
  reagido_em: string | null;
  paciente_id: string;
  paciente?: AlunoDoDiario | null;
};
export type GrupoDia<T> = { chave: string; titulo: string; itens: T[] };

// Nomes dos dias fixos (não dependem do locale do date-fns — o E2E refaz em Python)
const DIAS_LONGOS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export const plural = (n: number, s: string, p: string): string => `${n} ${n === 1 ? s : p}`;
export const chaveDia = (iso: string): string => format(new Date(iso), "dd/MM/yyyy");
export const horaCurta = (iso: string): string => format(new Date(iso), "HH:mm");
export const tituloDia = (d: Date, n: number): string => `${DIAS_LONGOS[d.getDay()]}, ${format(d, "dd/MM/yyyy")} · ${plural(n, "registro", "registros")}`;
export const formatarReagidoEm = (iso: string): string => format(new Date(iso), "dd/MM HH:mm");

/** Grupos por dia LOCAL (chave dd/MM/yyyy), do dia mais recente para o mais antigo; dentro do dia, mais recente primeiro. */
export function agruparPorDia<T extends { id: string; data_hora: string }>(lista: T[]): GrupoDia<T>[] {
  const grupos = new Map<string, { data: Date; itens: T[] }>();
  for (const r of ordenarRegistros(lista)) {
    const d = new Date(r.data_hora);
    const chave = format(d, "dd/MM/yyyy");
    const g = grupos.get(chave);
    if (g) g.itens.push(r);
    else grupos.set(chave, { data: d, itens: [r] });
  }
  return [...grupos.entries()].map(([chave, g]) => ({ chave, titulo: tituloDia(g.data, g.itens.length), itens: g.itens }));
}
export function filtrarRegistros<T extends { paciente_id: string; reacao_nutri: string | null }>(lista: T[], alunoId: string, soNaoReagidas: boolean): T[] {
  return lista.filter((r) => (!alunoId || r.paciente_id === alunoId) && (!soNaoReagidas || !r.reacao_nutri));
}
export const contarNaoReagidas = <T extends { reacao_nutri: string | null }>(lista: T[]): number => lista.filter((r) => !r.reacao_nutri).length;
export const nomeAluno = (r: Pick<RegistroBase, "paciente">): string => (r.paciente?.nome ?? "").trim() || "Aluno";
/** O primeiro nome (o apelido, se houver) — a legenda da foto, como no "Diário de hoje" da tela 6. */
export function primeiroNomeAluno(r: Pick<RegistroBase, "paciente">): string {
  const apelido = (r.paciente?.apelido ?? "").trim();
  if (apelido) return apelido;
  return nomeAluno(r).split(/\s+/)[0] || "Aluno";
}
/** Alunos com registro na lista, únicos, por nome sem acento (desempate por id). */
export function alunosDaLista(lista: RegistroBase[]): AlunoDoDiario[] {
  const mapa = new Map<string, AlunoDoDiario>();
  for (const r of lista) {
    if (!mapa.has(r.paciente_id)) mapa.set(r.paciente_id, { id: r.paciente_id, nome: nomeAluno(r), link_codigo: r.paciente?.link_codigo ?? "", foto_url: r.paciente?.foto_url ?? null });
  }
  return [...mapa.values()].sort((a, b) => {
    const x = semAcento(a.nome).toLowerCase();
    const y = semAcento(b.nome).toLowerCase();
    if (x !== y) return x < y ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
export function textoContagem(total: number, dias: number, naoReagidas: number): string {
  if (!total) return "Nenhum registro";
  const base = `${plural(total, "registro", "registros")} em ${plural(dias, "dia", "dias")}`;
  return naoReagidas > 0 ? `${base} · ${plural(naoReagidas, "não reagida", "não reagidas")}` : base;
}
/** "Almoço · 12:40" (cartão da foto). */
export const textoRegistro = (r: { refeicao: string; data_hora: string }): string => `${rotuloRefeicao(r.refeicao) || "Refeição"} · ${horaCurta(r.data_hora)}`;
/** "Almoço · 01/10/2026 12:40" (a foto grande). */
export const textoRegistroCompleto = (r: { refeicao: string; data_hora: string }): string =>
  `${rotuloRefeicao(r.refeicao) || "Refeição"} · ${chaveDia(r.data_hora)} ${horaCurta(r.data_hora)}`;
/** "Ótimo — comentário" · "Ótimo" · "" (sem reação). Sem emoji (spec 4.9): a tela mostra o chip. */
export function textoReacaoNutri(r: { reacao_nutri: string | null; comentario_nutri: string }): string {
  if (!r.reacao_nutri) return "";
  const base = rotuloReacao(r.reacao_nutri) || "Reagiu";
  return r.comentario_nutri ? `${base} — ${r.comentario_nutri}` : base;
}
/** "Reagido em 01/10 12:40" · "Reagido". */
export const textoReagidoEm = (iso: string | null): string => (iso ? `Reagido em ${formatarReagidoEm(iso)}` : "Reagido");
