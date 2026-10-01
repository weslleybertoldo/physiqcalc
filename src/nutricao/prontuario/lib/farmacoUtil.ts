// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/farmacoUtil.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { format, isValid } from "date-fns";
import { semAcento } from "@/nutricao/editor/lib/alimentosUtil";
import { dataLocalISO, dataValida, fmtData, hojeISO } from "@/nutricao/editor/lib/gestacionalUtil";
import { aplicarChip, chipAtivo } from "@/nutricao/editor/lib/suplementosUtil";

export { aplicarChip, chipAtivo, fmtData, hojeISO };

// Regras puras da seção "Fármaco-nutrientes" (W27): a BASE de interações fármaco × nutriente (as do sistema, com
// `nutricionista_id` NULL, + as próprias da nutricionista) é cruzada com os MEDICAMENTOS EM USO do paciente. O cruzamento é
// SEMPRE por nome: o nome digitado casa com o genérico ou com um sinônimo da interação (sem acento/caixa), ou COMEÇA com um
// deles seguido de espaço ('metformina 850' casa 'Metformina'; 'puran t4 50' casa o sinônimo 'Puran T4'). A análise é um
// documento CONGELADO (cópia dos medicamentos ativos + das interações encontradas na hora) com parecer em markdown simples (W10).

// ---- Limites ----
export const MEDICAMENTO_MAX = 120;
export const NUTRIENTE_MAX = 120;
export const CLASSE_MAX = 120;
/** dose, posologia, observação, efeito, fonte */
export const TEXTO_MAX = 300;
export const CONDUTA_MAX = 1000;
export const TITULO_MAX = 160;
export const PARECER_MAX = 8000;
export const SUGESTOES_MAX = 8;

// ---- Gravidade ----
export type Gravidade = "baixa" | "moderada" | "alta";
export const GRAVIDADES: readonly { valor: Gravidade; rotulo: string; peso: number }[] = [
  { valor: "alta", rotulo: "Alta", peso: 3 },
  { valor: "moderada", rotulo: "Moderada", peso: 2 },
  { valor: "baixa", rotulo: "Baixa", peso: 1 },
];
export const ehGravidade = (v: unknown): v is Gravidade => GRAVIDADES.some((g) => g.valor === v);
export const lerGravidade = (v: unknown): Gravidade => (ehGravidade(v) ? v : "moderada");
export const rotuloGravidade = (g: string): string => GRAVIDADES.find((x) => x.valor === g)?.rotulo ?? g;
export const pesoGravidade = (g: string): number => GRAVIDADES.find((x) => x.valor === g)?.peso ?? 0;
/** A maior gravidade da lista (null sem interação). */
export function gravidadeMaxima(lista: readonly { gravidade: string }[]): Gravidade | null {
  let melhor: Gravidade | null = null;
  for (const i of lista) {
    if (ehGravidade(i.gravidade) && pesoGravidade(i.gravidade) > (melhor ? pesoGravidade(melhor) : 0)) melhor = i.gravidade;
  }
  return melhor;
}

export type Origem = "sistema" | "propria";
export const POSOLOGIAS_RAPIDAS = ["1x ao dia", "2x ao dia", "3x ao dia", "em jejum", "com as refeições", "à noite"] as const;

// ---- Formas mínimas (o Row do banco satisfaz) ----
export interface InteracaoBase {
  id: string;
  nutricionista_id: string | null;
  codigo?: string | null;
  medicamento: string;
  sinonimos: string[] | null;
  classe: string;
  nutriente: string;
  efeito: string;
  gravidade: string;
  conduta: string;
  fonte: string;
}
export interface MedicamentoBase {
  id: string;
  medicamento: string;
  dose: string;
  posologia: string;
  /** `yyyy-MM-dd` (coluna date) ou null */
  inicio: string | null;
  ativo: boolean;
  observacao: string;
  created_at?: string;
}
export const origemDe = (i: { nutricionista_id: string | null }): Origem => (i.nutricionista_id ? "propria" : "sistema");
export const rotuloOrigem = (o: Origem): string => (o === "sistema" ? "Sistema" : "Minha");

// ---- Normalização e casamento ----
export const normalizarMedicamento = (s: string | null | undefined): string => semAcento(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
export const nomesDaInteracao = (i: { medicamento: string; sinonimos: string[] | null }): string[] =>
  [i.medicamento, ...(i.sinonimos ?? [])].map((n) => (n ?? "").trim()).filter(Boolean);
/** Casa quando o nome digitado é IGUAL ao genérico ou a um sinônimo (sem acento/caixa), ou COMEÇA com um deles seguido de espaço. */
export function casaMedicamento(nomeDigitado: string, i: { medicamento: string; sinonimos: string[] | null }): boolean {
  const n = normalizarMedicamento(nomeDigitado);
  if (!n) return false;
  return nomesDaInteracao(i)
    .map(normalizarMedicamento)
    .filter(Boolean)
    .some((x) => n === x || n.startsWith(`${x} `));
}
/** Nomes distintos da base (genérico + sinônimos) contendo a busca, a partir de 2 letras, até `max` — os que COMEÇAM com a busca primeiro. */
export function sugerirMedicamentos(base: readonly { medicamento: string; sinonimos: string[] | null }[], busca: string, max = SUGESTOES_MAX): string[] {
  const b = normalizarMedicamento(busca);
  if (b.length < 2) return [];
  const vistos = new Map<string, string>();
  for (const i of base) {
    for (const nome of nomesDaInteracao(i)) {
      const k = normalizarMedicamento(nome);
      if (k.includes(b) && !vistos.has(k)) vistos.set(k, nome);
    }
  }
  return [...vistos.entries()]
    .sort((a, c) => Number(c[0].startsWith(b)) - Number(a[0].startsWith(b)) || a[0].localeCompare(c[0]))
    .slice(0, max)
    .map(([, nome]) => nome);
}
/** Interações da base que casam com o nome (1x cada, por id), por gravidade desc e nutriente. */
export function interacoesDoMedicamento<T extends InteracaoBase>(nome: string, base: readonly T[]): T[] {
  const vistos = new Set<string>();
  const lista: T[] = [];
  for (const i of base) {
    if (!vistos.has(i.id) && casaMedicamento(nome, i)) {
      vistos.add(i.id);
      lista.push(i);
    }
  }
  return ordenarInteracoes(lista);
}

// ---- Cruzamento ----
export interface GrupoCruzamento<M = MedicamentoBase, I = InteracaoBase> {
  medicamento: M;
  interacoes: I[];
}
/** Só os medicamentos ATIVOS (ativos primeiro, por nome), cada um com as interações da base que casam com ele. */
export function cruzar<M extends MedicamentoBase, I extends InteracaoBase>(medicamentos: readonly M[], base: readonly I[]): GrupoCruzamento<M, I>[] {
  return ordenarMedicamentos(medicamentos.filter((m) => m.ativo)).map((m) => ({ medicamento: m, interacoes: interacoesDoMedicamento(m.medicamento, base) }));
}
type Grupo = { interacoes: { gravidade: string }[] };
export const totalInteracoes = (c: readonly Grupo[]): number => c.reduce((s, g) => s + g.interacoes.length, 0);
export const contarAltas = (c: readonly Grupo[]): number => c.reduce((s, g) => s + g.interacoes.filter((i) => i.gravidade === "alta").length, 0);
export const gravidadeMaximaCruzamento = (c: readonly Grupo[]): Gravidade | null => gravidadeMaxima(c.flatMap((g) => g.interacoes));
const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`;
/** '3 medicamentos · 5 interações · 2 altas' (sem alta → sem o 3º trecho; sem medicamento → 'nenhum medicamento em uso'). */
export function resumoCruzamento(c: readonly Grupo[]): string {
  if (!c.length) return "nenhum medicamento em uso";
  const n = totalInteracoes(c);
  const altas = contarAltas(c);
  const partes = [plural(c.length, "medicamento", "medicamentos"), n ? plural(n, "interação", "interações") : "nenhuma interação"];
  if (altas) partes.push(plural(altas, "alta", "altas"));
  return partes.join(" · ");
}
/** Parecer inicial em markdown simples (W10): '## Medicamento' + '- **Nutriente** (gravidade): conduta'. */
export function montarParecer(c: readonly GrupoCruzamento<{ medicamento: string }, { nutriente: string; gravidade: string; conduta: string }>[]): string {
  return c
    .map((g) => {
      const linhas = g.interacoes.length
        ? g.interacoes.map((i) => `- **${i.nutriente}** (${rotuloGravidade(i.gravidade).toLowerCase()}): ${i.conduta}`)
        : ["- sem interação conhecida na base"];
      return [`## ${g.medicamento.medicamento}`, ...linhas].join("\n");
    })
    .join("\n\n");
}

// ---- Documento congelado (jsonb) ----
export interface MedicamentoCongelado {
  medicamento: string;
  dose: string;
  posologia: string;
}
export interface InteracaoCongelada {
  id: string;
  /** o nome do medicamento DO PACIENTE que casou */
  medicamento: string;
  nutriente: string;
  efeito: string;
  gravidade: Gravidade;
  conduta: string;
  origem: Origem;
}
const texto1 = (s: unknown): string => (typeof s === "string" ? s : s == null ? "" : String(s)).replace(/\s+/g, " ").trim();
const ehObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export const congelarMedicamentos = (c: readonly GrupoCruzamento<MedicamentoBase, InteracaoBase>[]): MedicamentoCongelado[] =>
  c.map((g) => ({ medicamento: texto1(g.medicamento.medicamento), dose: texto1(g.medicamento.dose), posologia: texto1(g.medicamento.posologia) }));
export const congelarInteracoes = (c: readonly GrupoCruzamento<MedicamentoBase, InteracaoBase>[]): InteracaoCongelada[] =>
  c.flatMap((g) =>
    g.interacoes.map((i) => ({
      id: i.id,
      medicamento: texto1(g.medicamento.medicamento),
      nutriente: texto1(i.nutriente),
      efeito: texto1(i.efeito),
      gravidade: lerGravidade(i.gravidade),
      conduta: texto1(i.conduta),
      origem: origemDe(i),
    })),
  );
/** Leitor tolerante do jsonb `medicamentos`. */
export function lerMedicamentosJson(v: unknown): MedicamentoCongelado[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(ehObj)
    .map((o) => ({ medicamento: texto1(o.medicamento), dose: texto1(o.dose), posologia: texto1(o.posologia) }))
    .filter((m) => m.medicamento);
}
/** Leitor tolerante do jsonb `interacoes`. */
export function lerInteracoesJson(v: unknown): InteracaoCongelada[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(ehObj)
    .map((o) => ({
      id: texto1(o.id),
      medicamento: texto1(o.medicamento),
      nutriente: texto1(o.nutriente),
      efeito: texto1(o.efeito),
      gravidade: lerGravidade(o.gravidade),
      conduta: texto1(o.conduta),
      origem: (o.origem === "propria" ? "propria" : "sistema") as Origem,
    }))
    .filter((i) => i.medicamento && i.nutriente);
}
/** Agrupa as interações congeladas pelo medicamento, na ordem dos medicamentos congelados (sem interação → grupo vazio). */
export function agruparCongeladas(medicamentos: readonly MedicamentoCongelado[], interacoes: readonly InteracaoCongelada[]): GrupoCruzamento<MedicamentoCongelado, InteracaoCongelada>[] {
  const grupos: GrupoCruzamento<MedicamentoCongelado, InteracaoCongelada>[] = medicamentos.map((m) => ({ medicamento: m, interacoes: [] }));
  for (const i of interacoes) {
    let g = grupos.find((x) => normalizarMedicamento(x.medicamento.medicamento) === normalizarMedicamento(i.medicamento));
    if (!g) {
      g = { medicamento: { medicamento: i.medicamento, dose: "", posologia: "" }, interacoes: [] };
      grupos.push(g);
    }
    g.interacoes.push(i);
  }
  for (const g of grupos) g.interacoes = ordenarInteracoes(g.interacoes);
  return grupos;
}

// ---- Formulário do medicamento ----
export interface FormMedicamento {
  medicamento: string;
  /** interação escolhida no autocomplete (só documenta) */
  interacaoId: string | null;
  dose: string;
  posologia: string;
  /** `yyyy-MM-dd` ou '' */
  inicio: string;
  observacao: string;
}
export const formInicialMedicamento = (): FormMedicamento => ({ medicamento: "", interacaoId: null, dose: "", posologia: "", inicio: "", observacao: "" });
export const formDoMedicamento = (m: MedicamentoBase & { interacao_id?: string | null }): FormMedicamento => ({
  medicamento: m.medicamento,
  interacaoId: m.interacao_id ?? null,
  dose: m.dose,
  posologia: m.posologia,
  inicio: m.inicio ? dataLocalISO(m.inicio) : "",
  observacao: m.observacao,
});
export function validarMedicamento(f: FormMedicamento, hoje: string = hojeISO()): string | null {
  const nome = f.medicamento.trim();
  if (!nome) return "Informe o medicamento";
  if (nome.length > MEDICAMENTO_MAX) return `Nome com até ${MEDICAMENTO_MAX} caracteres`;
  if ([f.dose, f.posologia, f.observacao].some((s) => s.trim().length > TEXTO_MAX)) return `Textos com até ${TEXTO_MAX} caracteres`;
  if (f.inicio) {
    if (!dataValida(f.inicio)) return "Data de início inválida";
    if (f.inicio > hoje) return "O início não pode ser no futuro";
  }
  return null;
}
export interface RegistroMedicamento {
  medicamento: string;
  interacao_id: string | null;
  dose: string;
  posologia: string;
  inicio: string | null;
  observacao: string;
}
export const medicamentoParaBanco = (f: FormMedicamento): RegistroMedicamento => ({
  medicamento: texto1(f.medicamento),
  interacao_id: f.interacaoId,
  dose: texto1(f.dose),
  posologia: texto1(f.posologia),
  inicio: f.inicio || null,
  observacao: f.observacao.trim(),
});

// ---- Formulário da interação (própria) ----
export interface FormInteracao {
  medicamento: string;
  /** separados por vírgula */
  sinonimos: string;
  classe: string;
  nutriente: string;
  efeito: string;
  gravidade: Gravidade;
  conduta: string;
  fonte: string;
}
export const formInicialInteracao = (): FormInteracao => ({ medicamento: "", sinonimos: "", classe: "", nutriente: "", efeito: "", gravidade: "moderada", conduta: "", fonte: "" });
export const formDaInteracao = (i: InteracaoBase): FormInteracao => ({
  medicamento: i.medicamento,
  sinonimos: textoSinonimos(i.sinonimos),
  classe: i.classe,
  nutriente: i.nutriente,
  efeito: i.efeito,
  gravidade: lerGravidade(i.gravidade),
  conduta: i.conduta,
  fonte: i.fonte,
});
/** 'Glifage, Glucoformin' → ['Glifage', 'Glucoformin'] (sem vazio, sem duplicado — comparando sem acento/caixa). */
export function lerSinonimos(texto: string): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const p of texto.split(",")) {
    const s = texto1(p);
    const k = normalizarMedicamento(s);
    if (s && !vistos.has(k)) {
      vistos.add(k);
      out.push(s);
    }
  }
  return out;
}
export const textoSinonimos = (l: readonly string[] | null | undefined): string => (l ?? []).join(", ");
export function validarInteracao(f: FormInteracao): string | null {
  const med = f.medicamento.trim();
  if (!med) return "Informe o medicamento";
  if (med.length > MEDICAMENTO_MAX) return `Medicamento com até ${MEDICAMENTO_MAX} caracteres`;
  if (lerSinonimos(f.sinonimos).some((s) => s.length > MEDICAMENTO_MAX)) return `Sinônimos com até ${MEDICAMENTO_MAX} caracteres cada`;
  if (f.classe.trim().length > CLASSE_MAX) return `Classe com até ${CLASSE_MAX} caracteres`;
  const nut = f.nutriente.trim();
  if (!nut) return "Informe o nutriente";
  if (nut.length > NUTRIENTE_MAX) return `Nutriente com até ${NUTRIENTE_MAX} caracteres`;
  const ef = f.efeito.trim();
  if (!ef) return "Descreva o efeito";
  if (ef.length > TEXTO_MAX) return `Efeito com até ${TEXTO_MAX} caracteres`;
  if (!ehGravidade(f.gravidade)) return "Escolha a gravidade";
  const cond = f.conduta.trim();
  if (!cond) return "Descreva a conduta";
  if (cond.length > CONDUTA_MAX) return `Conduta com até ${CONDUTA_MAX} caracteres`;
  if (f.fonte.trim().length > TEXTO_MAX) return `Fonte com até ${TEXTO_MAX} caracteres`;
  return null;
}
export interface RegistroInteracao {
  medicamento: string;
  sinonimos: string[];
  classe: string;
  nutriente: string;
  efeito: string;
  gravidade: Gravidade;
  conduta: string;
  fonte: string;
}
export const interacaoParaBanco = (f: FormInteracao): RegistroInteracao => ({
  medicamento: texto1(f.medicamento),
  sinonimos: lerSinonimos(f.sinonimos),
  classe: texto1(f.classe),
  nutriente: texto1(f.nutriente),
  efeito: f.efeito.trim(),
  gravidade: lerGravidade(f.gravidade),
  conduta: f.conduta.trim(),
  fonte: texto1(f.fonte),
});

// ---- Formulário da análise ----
export interface FormAnalise {
  titulo: string;
  parecer: string;
}
export const tituloPadraoAnalise = (d: Date = new Date()): string => `Análise fármaco-nutriente — ${format(d, "dd/MM/yyyy")}`;
export function validarAnalise(f: FormAnalise): string | null {
  const t = f.titulo.trim();
  if (!t) return "Dê um título à análise";
  if (t.length > TITULO_MAX) return `Título com até ${TITULO_MAX} caracteres`;
  if (f.parecer.length > PARECER_MAX) return `Parecer com até ${PARECER_MAX} caracteres`;
  return null;
}
export const analiseParaBanco = (f: FormAnalise): FormAnalise => ({ titulo: texto1(f.titulo), parecer: f.parecer.replace(/\r\n/g, "\n").trim() });

// ---- Ordenação e filtros ----
/** Ativos primeiro; depois por nome (sem acento/caixa) e criação. */
export function ordenarMedicamentos<T extends { ativo: boolean; medicamento: string; created_at?: string }>(l: readonly T[]): T[] {
  return [...l].sort(
    (a, b) =>
      Number(b.ativo) - Number(a.ativo) ||
      normalizarMedicamento(a.medicamento).localeCompare(normalizarMedicamento(b.medicamento)) ||
      (a.created_at ?? "").localeCompare(b.created_at ?? ""),
  );
}
/** Gravidade desc, depois medicamento e nutriente (sem acento/caixa). */
export function ordenarInteracoes<T extends { gravidade: string; medicamento: string; nutriente: string }>(l: readonly T[]): T[] {
  return [...l].sort(
    (a, b) =>
      pesoGravidade(b.gravidade) - pesoGravidade(a.gravidade) ||
      normalizarMedicamento(a.medicamento).localeCompare(normalizarMedicamento(b.medicamento)) ||
      normalizarMedicamento(a.nutriente).localeCompare(normalizarMedicamento(b.nutriente)),
  );
}
/** Base por medicamento e nutriente (sem acento/caixa), do sistema e próprias misturadas. */
export function ordenarBase<T extends InteracaoBase>(l: readonly T[]): T[] {
  return [...l].sort(
    (a, b) =>
      normalizarMedicamento(a.medicamento).localeCompare(normalizarMedicamento(b.medicamento)) ||
      pesoGravidade(b.gravidade) - pesoGravidade(a.gravidade) ||
      normalizarMedicamento(a.nutriente).localeCompare(normalizarMedicamento(b.nutriente)),
  );
}
export type FiltroOrigem = "todas" | "sistema" | "propria";
/** Busca sem acento em medicamento/sinônimos/nutriente/classe; gravidade '' = todas. */
export function filtrarBase<T extends InteracaoBase>(lista: readonly T[], busca: string, gravidade: string, origem: FiltroOrigem): T[] {
  const b = normalizarMedicamento(busca);
  return lista.filter(
    (i) =>
      (!gravidade || i.gravidade === gravidade) &&
      (origem === "todas" || origemDe(i) === origem) &&
      (!b || [i.medicamento, ...(i.sinonimos ?? []), i.nutriente, i.classe].some((s) => normalizarMedicamento(s).includes(b))),
  );
}
export const ordenarAnalises = <T extends { data: string; created_at: string }>(l: readonly T[]): T[] =>
  [...l].sort((a, b) => b.data.localeCompare(a.data) || b.created_at.localeCompare(a.created_at));
export const inserirRegistro = <T extends { id: string }>(l: readonly T[], r: T): T[] => [...l.filter((x) => x.id !== r.id), r];

// ---- Textos ----
export const textoMedicamento = (m: { medicamento: string; dose: string; posologia: string }): string =>
  [m.medicamento, m.dose, m.posologia].map((s) => (s ?? "").trim()).filter(Boolean).join(" · ");
export function textoDetalheMedicamento(m: { dose: string; posologia: string; inicio: string | null }): string {
  const partes = [m.dose, m.posologia].map((s) => (s ?? "").trim()).filter(Boolean);
  if (m.inicio) partes.push(`desde ${fmtData(m.inicio)}`);
  return partes.join(" · ") || "sem posologia";
}
/** '2 medicamentos em uso · 1 suspenso' */
export function textoContagemMedicamentos(ativos: number, total: number): string {
  const suspensos = Math.max(0, total - ativos);
  const a = ativos === 1 ? "1 medicamento em uso" : `${ativos} medicamentos em uso`;
  return suspensos ? `${a} · ${plural(suspensos, "suspenso", "suspensos")}` : a;
}
export const textoInteracoesMedicamento = (n: number): string => (n === 0 ? "sem interação conhecida" : plural(n, "interação", "interações"));
/** Prévia ao vivo do modal: '3 interações conhecidas: Vitamina B12 (moderada), …' ou 'sem interação conhecida na base'. */
export const textoPreviaInteracoes = (lista: readonly { nutriente: string; gravidade: string }[]): string =>
  lista.length
    ? `${plural(lista.length, "interação conhecida", "interações conhecidas")}: ${lista.map((i) => `${i.nutriente} (${rotuloGravidade(i.gravidade).toLowerCase()})`).join(", ")}`
    : "sem interação conhecida na base";
/** 'N medicamentos · N interações · gravidade máx. alta' de uma análise congelada. */
export function textoAnalise(a: { medicamentos: unknown; interacoes: unknown }): string {
  const m = lerMedicamentosJson(a.medicamentos);
  const i = lerInteracoesJson(a.interacoes);
  const g = gravidadeMaxima(i);
  return [plural(m.length, "medicamento", "medicamentos"), i.length ? plural(i.length, "interação", "interações") : "nenhuma interação", g ? `gravidade máx. ${g}` : ""]
    .filter(Boolean)
    .join(" · ");
}
export const textoContagemAnalises = (n: number): string => (n === 0 ? "nenhuma análise" : plural(n, "análise", "análises"));
export const textoContagemBase = (n: number): string => (n === 0 ? "nenhuma interação" : plural(n, "interação", "interações"));
/** 'Metformina (Glifage, Glucoformin) → Vitamina B12' */
export const textoBaseInteracao = (i: { medicamento: string; sinonimos: string[] | null; nutriente: string }): string =>
  `${i.medicamento}${i.sinonimos?.length ? ` (${i.sinonimos.join(", ")})` : ""} → ${i.nutriente}`;
export const formatarDataHoraAnalise = (iso: string): string => {
  const d = new Date(iso);
  return isValid(d) ? format(d, "dd/MM/yyyy HH:mm") : "—";
};
const slug = (s: string, max = 40): string => normalizarMedicamento(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max);
/** `<paciente>-farmaco-nutrientes-yyyy-MM-dd.pdf` (data = a da emissão). */
export const nomeArquivoPDFFarmaco = (paciente: string, d: Date): string => `${slug(paciente) || "paciente"}-farmaco-nutrientes-${format(d, "yyyy-MM-dd")}.pdf`;
