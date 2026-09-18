import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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
}

export interface WorkoutExercicio {
  nome: string;
  grupo_muscular: string | null;
  /** nº de séries configurado pro aluno (edge `admin-get-workout-plan`); ausente = padrão */
  num_series?: number | null;
}

export interface WorkoutDia {
  dia_semana: string;
  grupo_nome: string;
  exercicios: WorkoutExercicio[];
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
export function textoSeries(numSeries: number | null | undefined): string {
  const n = Number(numSeries);
  const v = Number.isFinite(n) && n >= 1 ? Math.min(SERIES_MAX, Math.round(n)) : SERIES_PADRAO;
  return `${v} × ${REPS_PADRAO}`;
}

/** Linhas da tabela de um dia: [exercício, grupo muscular, séries]. */
export function linhasTabelaDia(dia: WorkoutDia): string[][] {
  return dia.exercicios.length
    ? dia.exercicios.map((e) => [
        limparTexto(e.nome),
        e.grupo_muscular ? limparTexto(e.grupo_muscular) : "—",
        textoSeries(e.num_series),
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

  for (const dia of dias) {
    const body = linhasTabelaDia(dia);
    if (precisaNovaPagina(y, body.length, H)) y = abrirPagina();
    y = desenharTituloSecao(doc, `${diaLabel(dia.dia_semana)} · ${limparTexto(dia.grupo_nome)}`, y);
    autoTable(doc, {
      startY: y,
      head: [["Exercício", "Grupo muscular", "Séries"]],
      body,
      ...estiloTabela(),
      margin: { left: 14, right: 14, bottom: MARGEM_INFERIOR },
      columnStyles: {
        1: { cellWidth: 42 },
        2: { halign: "right", cellWidth: 26 },
      },
      willDrawPage: pintarSeNova,
    });
    y = ((doc as DocComTabela).lastAutoTable?.finalY ?? y) + 8;
  }

  // Rodapé em TODAS as páginas (antes só a última tinha)
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    desenharRodape(doc, RODAPE_TREINO);
  }
  doc.setPage(total);
  return doc;
}

export function nomeArquivoTreino(profile: WorkoutProfile): string {
  const nome = profile.nome?.trim() || "Aluno";
  const safeName = nome.replace(/[^a-zA-Z0-9 ]/g, "");
  return `PhysiqCalc-Treino-${safeName}-${profile.user_code || ""}.pdf`;
}

export function generateWorkoutPlanPDF(profile: WorkoutProfile, dias: WorkoutDia[]) {
  const doc = montarWorkoutPlanPDF(profile, dias);
  doc.save(nomeArquivoTreino(profile));
}
