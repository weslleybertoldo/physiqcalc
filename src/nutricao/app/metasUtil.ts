import { format, isValid, parseISO } from "date-fns";
import { slugNome } from "./numeros";

// Physiq W11 — metas do lado do aluno, portadas do PhysiqNutri (src/lib/metasUtil.ts, W16 do Nutri: dias da semana ISO —
// 1 = segunda … 7 = domingo —, texto dos dias, contagem, pausadas, datas e o nome do PDF) + o ✓ nas metas do dia (NF4, tela 1):
// quais metas valem num dia, o que já foi marcado e o erro da função aluno_marcar_meta em texto. Sem rede; testado.

export type DiaSemana = { n: number; curto: string; nome: string };
export const DIAS_SEMANA: DiaSemana[] = [
  { n: 1, curto: "Seg", nome: "Segunda-feira" },
  { n: 2, curto: "Ter", nome: "Terça-feira" },
  { n: 3, curto: "Qua", nome: "Quarta-feira" },
  { n: 4, curto: "Qui", nome: "Quinta-feira" },
  { n: 5, curto: "Sex", nome: "Sexta-feira" },
  { n: 6, curto: "Sáb", nome: "Sábado" },
  { n: 7, curto: "Dom", nome: "Domingo" },
];
export const TODOS_OS_DIAS: number[] = [1, 2, 3, 4, 5, 6, 7];
export const SEG_A_SEX: number[] = [1, 2, 3, 4, 5];
export const FIM_DE_SEMANA: number[] = [6, 7];

export type AtalhoDias = "todos" | "semana" | "fim";
export const ATALHOS_DIAS: { atalho: AtalhoDias; rotulo: string; dias: number[] }[] = [
  { atalho: "todos", rotulo: "Todos os dias", dias: TODOS_OS_DIAS },
  { atalho: "semana", rotulo: "Seg a Sex", dias: SEG_A_SEX },
  { atalho: "fim", rotulo: "Fim de semana", dias: FIM_DE_SEMANA },
];

/** Únicos, inteiros de 1 a 7, em ordem. Qualquer coisa que não seja lista vira []. */
export function normalizarDias(dias: unknown): number[] {
  const lista = Array.isArray(dias) ? dias : [];
  const vistos = new Set<number>();
  for (const d of lista) {
    const n = Math.trunc(Number(d));
    if (Number.isInteger(n) && n >= 1 && n <= 7) vistos.add(n);
  }
  return [...vistos].sort((a, b) => a - b);
}
export const mesmosDias = (a: unknown, b: unknown): boolean => normalizarDias(a).join(",") === normalizarDias(b).join(",");
export const diaInfo = (n: number): DiaSemana | undefined => DIAS_SEMANA.find((d) => d.n === n);

/** 'Todos os dias' / 'Seg a Sex' / 'Fim de semana' / 'Seg, Qua e Sex' / 'Ter' / nenhum → 'Nenhum dia'. */
export function textoDias(dias: unknown): string {
  const d = normalizarDias(dias);
  if (d.length === 0) return "Nenhum dia";
  const atalho = ATALHOS_DIAS.find((a) => mesmosDias(a.dias, d));
  if (atalho) return atalho.rotulo;
  const curtos = d.map((n) => diaInfo(n)?.curto ?? String(n));
  if (curtos.length === 1) return curtos[0];
  return `${curtos.slice(0, -1).join(", ")} e ${curtos[curtos.length - 1]}`;
}

// ---- Listas (as ativas em destaque, as pausadas recolhidas — como o /app/metas do site antigo) ----
const instante = (iso: string): number => new Date(iso).getTime();
export const metasAtivas = <T extends { ativa: boolean; created_at: string }>(lista: T[]): T[] =>
  lista.filter((m) => m.ativa).sort((a, b) => instante(a.created_at) - instante(b.created_at));
export const metasPausadas = <T extends { ativa: boolean; created_at: string }>(lista: T[]): T[] =>
  lista.filter((m) => !m.ativa).sort((a, b) => instante(a.created_at) - instante(b.created_at));

/** 'Nenhuma meta' / '1 meta · 1 ativa' / '3 metas · 2 ativas' / '2 metas · nenhuma ativa'. */
export function textoContagemMetas(total: number, ativas: number): string {
  if (total === 0) return "Nenhuma meta";
  const t = total === 1 ? "1 meta" : `${total} metas`;
  const a = ativas === 0 ? "nenhuma ativa" : ativas === 1 ? "1 ativa" : `${ativas} ativas`;
  return `${t} · ${a}`;
}
export const textoPausadas = (n: number): string => (n === 0 ? "nenhuma pausada" : n === 1 ? "1 pausada" : `${n} pausadas`);

// ---- Datas ----
/** Data-só (`yyyy-MM-dd`) → "dd/MM/yyyy" (parseISO — `new Date` deslocaria o dia pelo fuso). */
export const formatarDataMeta = (data: string | null | undefined): string => {
  const d = parseISO(data ?? "");
  return isValid(d) ? format(d, "dd/MM/yyyy") : "—";
};

/** `metas-<paciente sem acento>-<yyyyMMdd>.pdf` */
export const nomeArquivoPDFMetas = (paciente: string, hoje: Date = new Date()): string => `metas-${slugNome(paciente)}-${format(hoje, "yyyyMMdd")}.pdf`;

// ---- ✓ nas metas do dia (NF4) ----
/** Dia da semana ISO (1 = segunda … 7 = domingo) de um dia yyyy-mm-dd (sem fuso: é a data do calendário). */
export function diaDaSemana(dia: string): number {
  const [a, m, d] = dia.split("-").map(Number);
  const js = new Date(Date.UTC(a, (m || 1) - 1, d || 1)).getUTCDay(); // 0 = domingo
  return js === 0 ? 7 : js;
}

/** A meta vale no dia: ativa, com o dia da semana marcado e já começou (`inicio` ≤ dia). */
export function metaValeNoDia(m: { ativa: boolean; dias_semana: unknown; inicio?: string | null }, dia: string): boolean {
  if (!m.ativa) return false;
  if (!normalizarDias(m.dias_semana).includes(diaDaSemana(dia))) return false;
  return !m.inicio || m.inicio.slice(0, 10) <= dia;
}

/** As metas do dia (as que valem nele), na ordem da nutricionista. */
export const metasDoDia = <T extends { ativa: boolean; dias_semana: unknown; inicio?: string | null; created_at: string }>(lista: T[], dia: string): T[] =>
  metasAtivas(lista).filter((m) => metaValeNoDia(m, dia));

/** As ativas que NÃO valem no dia (a lista "Outros dias" da folha das metas). */
export const metasDeOutrosDias = <T extends { ativa: boolean; dias_semana: unknown; inicio?: string | null; created_at: string }>(lista: T[], dia: string): T[] =>
  metasAtivas(lista).filter((m) => !metaValeNoDia(m, dia));

/** "2 de 3" — quantas das metas do dia já têm ✓. */
export function progressoDasMetas(doDia: { id: string }[], marcadas: readonly string[]): { feitas: number; total: number } {
  const ids = new Set(marcadas);
  return { feitas: doDia.filter((m) => ids.has(m.id)).length, total: doDia.length };
}

/** "começa em 05/10" para a meta que ainda não começou (senão vazio). */
export function textoInicioFuturo(inicio: string | null | undefined, dia: string): string {
  if (!inicio || inicio.slice(0, 10) <= dia) return "";
  const d = parseISO(inicio.slice(0, 10));
  return isValid(d) ? `começa em ${format(d, "dd/MM")}` : "";
}

/** erro da função aluno_marcar_meta → texto pra pessoa */
export function textoErroMeta(erro: { message?: string } | null | undefined): string {
  const m = (erro?.message ?? "").toLowerCase();
  if (m.includes("sem_internet") || m.includes("failed to fetch") || m.includes("network")) return "Sem conexão. Marque de novo quando a internet voltar.";
  if (m.includes("meta_pausada")) return "Essa meta está pausada pela sua nutricionista.";
  if (m.includes("fora_do_dia")) return "Essa meta não vale para hoje.";
  if (m.includes("data_invalida")) return "Confira a data e a hora do celular.";
  if (m.includes("sem_acesso")) return "Você não tem acesso a esta meta.";
  return "Não foi possível salvar. Tente de novo.";
}
