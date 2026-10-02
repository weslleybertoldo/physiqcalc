import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { salvarPdf } from "@/lib/salvarPdf";
import {
  desenharCabecalho, desenharTituloSecao, desenharCard,
  desenharRodape, novaPagina, pintarFundo, estiloTabela, hexToRgb,
  TEMA, limparTexto,
} from "@/utils/gerarRelatorio";

export interface WorkoutProfile {
  nome: string | null;
  user_code: number | null;
  sexo: string | null;
  idade: number | null;
  peso: number | null;
  altura: number | null;
  plano_nome: string | null;
  /** W15: o descanso padrão do aluno (vale nos exercícios sem descanso próprio) */
  tempo_descanso_segundos?: number | null;
  /** W15 — NF7: data da troca do treino (novo ciclo), yyyy-mm-dd */
  proxima_troca_treino?: string | null;
}

export interface WorkoutExercicio {
  nome: string;
  grupo_muscular: string | null;
  /** nº de séries configurado pro aluno (edge `admin-get-workout-plan`); ausente = padrão */
  num_series?: number | null;
  /** W15 — NF1 (prescrição opcional do profissional): repetições-alvo ("10" ou "8-12"), descanso (s) e carga sugerida (kg) */
  reps_alvo?: string | null;
  descanso_segundos?: number | null;
  carga_sugerida_kg?: number | null;
}

export interface WorkoutDia {
  dia_semana: string;
  grupo_nome: string;
  exercicios: WorkoutExercicio[];
  /** W15 — NF2: observação do treino para o aluno */
  observacao?: string | null;
}

/** Sem prescrição de repetições no schema → faixa genérica de hipertrofia (decisão de 05/06/2026). */
export const REPS_PADRAO = "8-12";
/** Mesmo padrão do app (`src/lib/seriesPadrao.ts`) quando o aluno não tem nº configurado. */
export const SERIES_PADRAO = 3;
const SERIES_MAX = 10;

/**
 * Coluna "Séries": "N × 8-12" com o N configurado pro aluno (exercício > treino > padrão, resolvido na edge).
 * Até 18/09/2026 saía "3" fixo pra todo mundo — a Lívia tinha ABS com 1 série e o PDF mostrava 3.
 */
export function textoSeries(numSeries: number | null | undefined, repsAlvo?: string | null): string {
  const n = Number(numSeries);
  const v = Number.isFinite(n) && n >= 1 ? Math.min(SERIES_MAX, Math.round(n)) : SERIES_PADRAO;
  // W15: com as repetições prescritas pelo profissional (NF1), elas; sem, a faixa genérica de sempre
  const reps = typeof repsAlvo === "string" && repsAlvo.trim() ? repsAlvo.trim() : REPS_PADRAO;
  return `${v} × ${reps}`;
}

/** "60 s" · "90 s" · "2 min" · "2 min 30 s" (o mesmo texto do app do aluno). */
export function textoDescansoPdf(segundos: number | null | undefined): string {
  const s = Math.round(Number(segundos));
  if (!Number.isFinite(s) || s <= 0) return "—";
  if (s < 120) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}

/** "60 kg" · "22,5 kg" · "—" */
export function textoCargaPdf(kg: number | null | undefined): string {
  const n = Number(kg);
  if (kg === null || kg === undefined || !Number.isFinite(n) || n <= 0) return "—";
  return `${String(Math.round(n * 100) / 100).replace(".", ",")} kg`;
}

/** W15: algum exercício tem descanso ou carga prescritos? Então o PDF ganha as colunas Descanso e Carga. */
export function temPrescricaoCompleta(dias: WorkoutDia[]): boolean {
  return dias.some((d) => d.exercicios.some((e) => (e.descanso_segundos ?? 0) > 0 || (e.carga_sugerida_kg ?? 0) > 0));
}

/** Linhas com a prescrição completa: [exercício, grupo, séries × reps, descanso (o do exercício ou o padrão), carga]. */
export function linhasTabelaDiaCompleta(dia: WorkoutDia, descansoPadrao: number | null | undefined): string[][] {
  return dia.exercicios.length
    ? dia.exercicios.map((e) => [
        limparTexto(e.nome),
        e.grupo_muscular ? limparTexto(e.grupo_muscular) : "—",
        textoSeries(e.num_series, e.reps_alvo),
        textoDescansoPdf(e.descanso_segundos ?? descansoPadrao),
        textoCargaPdf(e.carga_sugerida_kg),
      ])
    : [["Sem exercícios cadastrados", "—", "—", "—", "—"]];
}

/** Linhas da tabela de um dia: [exercício, grupo muscular, séries]. */
export function linhasTabelaDia(dia: WorkoutDia): string[][] {
  return dia.exercicios.length
    ? dia.exercicios.map((e) => [
        limparTexto(e.nome),
        e.grupo_muscular ? limparTexto(e.grupo_muscular) : "—",
        textoSeries(e.num_series, e.reps_alvo),
      ])
    : [["Sem exercícios cadastrados", "—", "—"]];
}

// Alturas em mm (fonte 8/7 + cellPadding 3 do estiloTabela) — só pra decidir a quebra ANTES de desenhar.
const ALTURA_TITULO_SECAO = 11;
const ALTURA_CABECALHO_TABELA = 9;
const ALTURA_LINHA_TABELA = 9.5;
/** Margem inferior das tabelas: acima da linha do rodapé (H − 12). */
const MARGEM_INFERIOR = 16;
/** y inicial das páginas sem cabeçalho (o que `novaPagina` devolve). */
const Y_TOPO_PAGINA_NOVA = 15;

/** Altura estimada de um dia (título da seção + tabela com `numLinhas`). */
export function alturaEstimadaDia(numLinhas: number): number {
  return ALTURA_TITULO_SECAO + ALTURA_CABECALHO_TABELA + Math.max(1, numLinhas) * ALTURA_LINHA_TABELA;
}

/**
 * O dia começa numa página nova? Sim quando não cabe a partir de `y` MAS cabe inteiro numa página vazia —
 * antes a tabela partia no meio (Terça da Lívia: 6 linhas na página 1, 1 órfã na 2). Tabela maior que uma
 * página inteira fica onde está e o autoTable divide (com o fundo pintado pelo hook).
 */
export function precisaNovaPagina(y: number, numLinhas: number, alturaPagina: number): boolean {
  const altura = alturaEstimadaDia(numLinhas);
  const limite = alturaPagina - MARGEM_INFERIOR;
  const cabeAqui = y + altura <= limite;
  const cabeEmPaginaNova = Y_TOPO_PAGINA_NOVA + altura <= limite;
  return !cabeAqui && cabeEmPaginaNova;
}

const DIA_LABEL: Record<string, string> = {
  domingo: "Domingo", dom: "Domingo", "0": "Domingo", "7": "Domingo",
  segunda: "Segunda", seg: "Segunda", "1": "Segunda",
  terca: "Terça", "terça": "Terça", ter: "Terça", "2": "Terça",
  quarta: "Quarta", qua: "Quarta", "3": "Quarta",
  quinta: "Quinta", qui: "Quinta", "4": "Quinta",
  sexta: "Sexta", sex: "Sexta", "5": "Sexta",
  sabado: "Sábado", "sábado": "Sábado", sab: "Sábado", "6": "Sábado",
};
function diaLabel(d: string): string {
  const k = (d ?? "").toLowerCase().trim();
  if (DIA_LABEL[k]) return DIA_LABEL[k];
  return d ? d.charAt(0).toUpperCase() + d.slice(1) : "Dia";
}

export const RODAPE_TREINO = `Repetições ${REPS_PADRAO} (hipertrofia) · nº de séries conforme configurado no app`;
/** W15: rodapé quando o profissional prescreveu (NF1). */
export const RODAPE_TREINO_PRESCRITO = `Séries, repetições, descanso e carga prescritos pelo profissional · sem repetições prescritas: ${REPS_PADRAO}`;

/** o jspdf-autotable pendura `lastAutoTable` no documento (posição final da última tabela) */
type DocComTabela = jsPDF & { lastAutoTable?: { finalY: number } };

/** Monta o documento (sem salvar) — separado do `save` pra dar pra testar e renderizar fora do browser. */
export function montarWorkoutPlanPDF(profile: WorkoutProfile, dias: WorkoutDia[]): jsPDF {
  const doc = new jsPDF();
  const nome = profile.nome?.trim() || "Aluno";
  const sub = `${nome}${profile.user_code ? ` · ID ${profile.user_code}` : ""}`;
  let y = desenharCabecalho(doc, "Plano de Treino", sub);

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // Páginas que já têm o fundo escuro: a 1ª (cabeçalho) e as que `novaPagina` abre. As que o autoTable abre
  // sozinho (tabela que não coube) ficavam BRANCAS até 18/09/2026 — o hook `willDrawPage` pinta antes do conteúdo.
  const paginasPintadas = new Set<number>([1]);
  const abrirPagina = (): number => {
    const yTopo = novaPagina(doc);
    paginasPintadas.add(doc.getNumberOfPages());
    return yTopo;
  };
  const pintarSeNova = () => {
    const p = doc.getCurrentPageInfo().pageNumber;
    if (paginasPintadas.has(p)) return;
    pintarFundo(doc);
    paginasPintadas.add(p);
  };

  // ── Bloco do aluno ──
  y = desenharTituloSecao(doc, "Aluno", y);
  const cardW = (W - 28 - 12) / 4; // 4 cards + 3 gaps de 4mm
  const cards: [string, string][] = [
    ["Sexo", profile.sexo === "male" ? "Masculino" : profile.sexo === "female" ? "Feminino" : "—"],
    ["Idade", profile.idade ? `${profile.idade} anos` : "—"],
    ["Peso", profile.peso ? `${profile.peso} kg` : "—"],
    ["Altura", profile.altura ? `${profile.altura} cm` : "—"],
  ];
  cards.forEach(([l, v], i) => desenharCard(doc, l, v, 14 + i * (cardW + 4), y, cardW, 16));
  y += 22;

  // ── Treino por dia ──
  if (!dias.length) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...hexToRgb(TEMA.cinzaMedio));
    doc.text("Nenhum treino configurado para este aluno.", 14, y + 2);
  }

  // W15: com descanso ou carga prescritos (NF1), a tabela ganha as colunas Descanso e Carga
  const completa = temPrescricaoCompleta(dias);
  const temReps = dias.some((d) => d.exercicios.some((e) => typeof e.reps_alvo === "string" && e.reps_alvo.trim()));
  if (profile.proxima_troca_treino && /^\d{4}-\d{2}-\d{2}$/.test(profile.proxima_troca_treino)) {
    const [a, m, d] = profile.proxima_troca_treino.split("-");
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...hexToRgb(TEMA.cinzaMedio));
    doc.text(`Troca do treino (novo ciclo): ${d}/${m}/${a}`, 14, y);
    y += 7;
  }
  for (const dia of dias) {
    const body = completa ? linhasTabelaDiaCompleta(dia, profile.tempo_descanso_segundos) : linhasTabelaDia(dia);
    const obs = typeof dia.observacao === "string" && dia.observacao.trim() ? limparTexto(dia.observacao.trim()) : null;
    if (precisaNovaPagina(y, body.length + (obs ? 1 : 0), H)) y = abrirPagina();
    y = desenharTituloSecao(doc, `${diaLabel(dia.dia_semana)} · ${limparTexto(dia.grupo_nome)}`, y);
    autoTable(doc, {
      startY: y,
      head: [completa ? ["Exercício", "Grupo muscular", "Séries", "Descanso", "Carga"] : ["Exercício", "Grupo muscular", "Séries"]],
      body,
      ...estiloTabela(),
      margin: { left: 14, right: 14, bottom: MARGEM_INFERIOR },
      columnStyles: completa
        ? { 1: { cellWidth: 36 }, 2: { halign: "right", cellWidth: 22 }, 3: { halign: "right", cellWidth: 20 }, 4: { halign: "right", cellWidth: 20 } }
        : { 1: { cellWidth: 42 }, 2: { halign: "right", cellWidth: 26 } },
      willDrawPage: pintarSeNova,
    });
    y = ((doc as DocComTabela).lastAutoTable?.finalY ?? y) + 8;
    if (obs) {
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...hexToRgb(TEMA.cinzaMedio));
      const linhasObs = doc.splitTextToSize(`Observação: ${obs}`, W - 28) as string[];
      doc.text(linhasObs, 14, y - 3);
      y += linhasObs.length * 4 + 3;
    }
  }

  // Rodapé em TODAS as páginas (antes só a última tinha)
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    desenharRodape(doc, completa || temReps ? RODAPE_TREINO_PRESCRITO : RODAPE_TREINO);
  }
  doc.setPage(total);
  return doc;
}

export function nomeArquivoTreino(profile: WorkoutProfile): string {
  const nome = profile.nome?.trim() || "Aluno";
  const safeName = nome.replace(/[^a-zA-Z0-9 ]/g, "");
  return `Physiq-Treino-${safeName}-${profile.user_code || ""}.pdf`;
}

export function generateWorkoutPlanPDF(profile: WorkoutProfile, dias: WorkoutDia[]): Promise<void> {
  const doc = montarWorkoutPlanPDF(profile, dias);
  // H4: no APK o download do navegador não baixa — o salvarPdf abre a folha de compartilhar (no site, o mesmo doc.save)
  return salvarPdf(doc, nomeArquivoTreino(profile));
}
