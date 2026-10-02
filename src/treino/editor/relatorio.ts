/**
 * Relatório do mês do aluno (C45 — PDF e Excel) na aba Treino do perfil do aluno (W15). A lógica é a do Relatório antigo do
 * painel (src/components/admin/AdminRelatorio.tsx, que sai na W28): mesmas leituras (admin-relatorio › relatorio e
 * admin-get-user), mesmos agrupamentos (dias treinados = card do aluno) e os mesmos documentos, com a marca Physiq.
 * Copiado daqui para lá não ser tocado (regra da W15: os componentes antigos deixam de ser usados, não mudam); a W23
 * (Painel › Treinos › Relatório) reaproveita este módulo.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- porte fiel do relatório antigo (dados das funções sem tipo) */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { compartilharBase64, salvarPdf } from "@/lib/salvarPdf";
import { formatarDataCurta, agoraFormatado } from "@/utils/formatDate";
import { contarDiasTreinados } from "@/lib/contagemTreinos";
import { rotuloMetodo, tmbEscolhida } from "@/lib/avaliacao";
import {
  desenharCabecalho, desenharTituloSecao, desenharCard,
  desenharRodape, estiloTabela, novaPagina, limparTexto,
  TEMA, hexToRgb, setTextColor, pintarFundo,
} from "@/utils/gerarRelatorio";

export const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];


export interface SerieRow {
  data_treino: string;
  numero_serie: number;
  peso: number | null;
  reps: number | null;
  concluida: boolean | null;
  exercicio_id: string;
  exercicio_usuario_id: string | null;
  tb_exercicios: { nome: string; grupo_muscular: string; emoji: string | null } | null;
  tb_exercicios_usuario: { nome: string; grupo_muscular: string; emoji: string | null } | null;
}

export interface ProfileData {
  nome: string | null;
  email: string | null;
  user_code: number | null;
  foto_url: string | null;
  peso: number | null;
  altura: number | null;
  idade: number | null;
  percentual_gordura: number | null;
  massa_gorda: number | null;
  massa_magra: number | null;
  tmb_mifflin: number | null;
  tmb_katch: number | null;
  tmb_balanca?: number | null;
  tmb_metodo?: string | null;
  metodo_avaliacao?: string | null;
}

// TMB escolhida da última avaliação; avaliação sem TMB gravada (antes de 25/09/2026 o registro perdia a TMB) → a do perfil
function tmbDoAluno(perfil: ProfileData | null, avaliacao: Record<string, unknown> | null | undefined) {
  const daAvaliacao = avaliacao ? tmbEscolhida(avaliacao) : null;
  return daAvaliacao?.valor != null ? daAvaliacao : tmbEscolhida((perfil ?? {}) as Record<string, unknown>);
}

export interface ExercicioAgrupado {
  id: string;
  nome: string;
  grupo: string;
  emoji: string;
  series: { numero: number; peso: number; reps: number }[];
}

export interface DiaAgrupado {
  data: string;
  concluido: boolean;
  exercicios: ExercicioAgrupado[];
  volumeTotal: number;
  grupoNome: string;
}

export interface SemanaAgrupada {
  numero: number;
  label: string;
  totalTreinos: number;
  volumeTotal: number;
  dias: DiaAgrupado[];
  evolucao: { treinos: number; volume: number } | null;
}


// ── Data fetching ──

export async function carregarRelatorioCompleto(userId: string, ano: number, mes: number) {
  // Leitura via edge function (service_role): tb_treino_concluido, tb_treino_series e
  // tb_treino_dia_override têm RLS de dono (auth.uid() = user_id) e NENHUMA policy de
  // admin, então consultar direto do navegador devolve lista vazia — sem erro — para
  // qualquer aluno que não seja o próprio admin logado.
  const { data, error } = await supabase.functions.invoke("admin-relatorio", {
    body: { action: "relatorio", userId, ano, mes },
  });

  if (error) {
    console.error("[AdminRelatorio] Erro ao carregar relatório:", error);
    return { concluidos: [], series: [] as SerieRow[], grupoNomePorData: {} };
  }

  return {
    concluidos: (data?.concluidos ?? []) as { data_treino: string }[],
    series: (data?.series ?? []) as unknown as SerieRow[],
    grupoNomePorData: (data?.grupoNomePorData ?? {}) as Record<string, string>,
  };
}

export async function carregarDadosUsuario(userId: string) {
  const { data } = await supabase.functions.invoke("admin-get-user", {
    body: { userId }
        });
  return {
    perfil: (data?.profile as ProfileData | null) ?? null,
    avaliacao: data?.avaliacao ?? null
        };
}

// ── Grouping helpers ──

function agruparPorExercicio(series: SerieRow[]): ExercicioAgrupado[] {
  const mapa: Record<string, ExercicioAgrupado> = {};
  series.forEach((s) => {
    const id = s.exercicio_usuario_id ?? s.exercicio_id;
    const info = s.tb_exercicios_usuario ?? s.tb_exercicios;
    if (!mapa[id])
      mapa[id] = {
        id,
        nome: info?.nome ?? "Exercício",
        grupo: info?.grupo_muscular ?? "",
        emoji: info?.emoji ?? "🏋️",
        series: []
        };
    mapa[id].series.push({
      numero: s.numero_serie,
      peso: Number(s.peso ?? 0),
      reps: Number(s.reps ?? 0)
        });
  });
  return Object.values(mapa);
}

function agruparPorDia(
  concluidos: { data_treino: string }[],
  series: SerieRow[],
  grupoNomePorData: Record<string, string> = {}
): DiaAgrupado[] {
  const datas = [
    ...new Set([
      ...concluidos.map((c) => c.data_treino),
      ...series.map((s) => s.data_treino),
    ]),
  ].sort();

  return datas.map((data) => {
    const exercicios = agruparPorExercicio(series.filter((s) => s.data_treino === data));
    const volume = exercicios.reduce(
      (a, ex) => a + ex.series.reduce((b, s) => b + Number(s.peso) * Number(s.reps), 0),
      0
    );
    return {
      data,
      concluido: concluidos.some((c) => c.data_treino === data),
      exercicios,
      volumeTotal: volume,
      grupoNome: grupoNomePorData[data] ?? ''
        };
  });
}

export function agruparPorSemana(
  concluidos: { data_treino: string }[],
  series: SerieRow[],
  ano: number,
  mes: number,
  grupoNomePorData: Record<string, string> = {}
): SemanaAgrupada[] {
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const semanas: Omit<SemanaAgrupada, "evolucao">[] = [];
  let num = 1;

  for (let inicio = 1; inicio <= diasNoMes; inicio += 7) {
    const fim = Math.min(inicio + 6, diasNoMes);
    const pad = (n: number) => String(n).padStart(2, "0");
    const ini = `${ano}-${pad(mes)}-${pad(inicio)}`;
    const fimStr = `${ano}-${pad(mes)}-${pad(fim)}`;

    const c = concluidos.filter((x) => x.data_treino >= ini && x.data_treino <= fimStr);
    const s = series.filter((x) => x.data_treino >= ini && x.data_treino <= fimStr);
    const dias = agruparPorDia(c, s, grupoNomePorData);
    const volume = dias.reduce((a, d) => a + d.volumeTotal, 0);

    semanas.push({
      numero: num,
      label: `Semana ${num}  (${pad(inicio)}/${pad(mes)} – ${pad(fim)}/${pad(mes)})`,
      totalTreinos: contarDiasTreinados(c), // dias treinados (2 treinos no mesmo dia = 1), igual ao card do aluno
      volumeTotal: volume,
      dias
        });
    num++;
  }

  return semanas.map((s, i) => ({
    ...s,
    evolucao:
      i === 0
        ? null
        : {
            treinos: s.totalTreinos - semanas[i - 1].totalTreinos,
            volume:
              semanas[i - 1].volumeTotal > 0
                ? Math.round(
                    ((s.volumeTotal - semanas[i - 1].volumeTotal) / semanas[i - 1].volumeTotal) *
                      100
                  )
                : 0
        }
        }));
}

// ── Sub-components ──

// ── Export helpers ──

export function obterNomeAluno(perfil: ProfileData | null, fallbackNome?: string, fallbackEmail?: string): string {
  return perfil?.nome?.trim() || fallbackNome?.trim() || perfil?.email?.split('@')[0] || fallbackEmail?.split('@')[0] || 'aluno';
}

// ── Export functions ──

interface TreinoSemana {
  semanaLabel: string;
  grupoNome: string;
  data: string;
  volume: number;
  totalReps: number;
  kgPerRep: number;
}

interface ResumoRow {
  semana: string;
  grupo: string;
  volume: string;
  kgRep: string;
  evol: string;
  evolColor: string;
}

export function exportarPDF(
  perfil: ProfileData | null,
  avaliacao: any,
  semanas: SemanaAgrupada[],
  mes: number,
  ano: number,
  fallbackNome?: string,
  fallbackEmail?: string
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  // Intercepta toda nova página adicionada e pinta o fundo antes do conteúdo
  const _origAddPage = doc.addPage.bind(doc);
  (doc as any).addPage = (...args: any[]) => {
    _origAddPage(...args);
    pintarFundo(doc);
    return doc;
  };

  const nomeAluno = obterNomeAluno(perfil, fallbackNome, fallbackEmail);
  const nomeArquivo = `treinos_${nomeAluno.replace(/\s+/g, "_")}_${MESES[mes - 1]}_${ano}.pdf`;

  let y = desenharCabecalho(
    doc,
    'Relatorio de Treinos',
    `${limparTexto(nomeAluno)} - ${MESES[mes - 1]} / ${ano} - Gerado em ${agoraFormatado({ incluirHora: false })}`
  );

  // User data
  y = desenharTituloSecao(doc, 'Dados do Aluno', y);
  autoTable(doc, {
    startY: y,
    head: [],
    body: [
      ["Nome", limparTexto(perfil?.nome ?? fallbackNome ?? "-"), "Email", perfil?.email ?? fallbackEmail ?? "-"],
      ["ID", String(perfil?.user_code ?? "-"), "Ultima avaliacao", avaliacao?.created_at ? formatarDataCurta(avaliacao.created_at.split('T')[0]) : "-"],
      ["Peso", (avaliacao?.peso ?? perfil?.peso) ? `${avaliacao?.peso ?? perfil?.peso} kg` : "-", "Altura", (avaliacao?.altura ?? perfil?.altura) ? `${avaliacao?.altura ?? perfil?.altura} cm` : "-"],
      ["Idade", perfil?.idade ? `${perfil.idade} anos` : "-", "% Gordura", (avaliacao?.percentual_gordura ?? perfil?.percentual_gordura) ? `${Number(avaliacao?.percentual_gordura ?? perfil?.percentual_gordura).toFixed(1)}%` : "-"],
      ["Massa Gorda", (avaliacao?.massa_gorda ?? perfil?.massa_gorda) ? `${Number(avaliacao?.massa_gorda ?? perfil?.massa_gorda).toFixed(1)} kg` : "-", "Massa Magra", (avaliacao?.massa_magra ?? perfil?.massa_magra) ? `${Number(avaliacao?.massa_magra ?? perfil?.massa_magra).toFixed(1)} kg` : "-"],
      ["TMB", (() => { const t = tmbDoAluno(perfil, avaliacao); return t.valor !== null ? `${Math.round(t.valor)} kcal/dia (${limparTexto(t.label)})` : "-"; })(), "Tipo de avaliacao", limparTexto(rotuloMetodo((avaliacao ?? perfil)?.metodo_avaliacao))],
    ],
    ...estiloTabela(),
    margin: { left: 14, right: 14, top: 15 },
        });
  y = (doc as any).lastAutoTable.finalY + 8;

  // Monthly summary
  y = desenharTituloSecao(doc, 'Resumo do Mes', y);
  const totalTreinos = semanas.reduce((a, s) => a + s.totalTreinos, 0);
  const volTotal = semanas.reduce((a, s) => a + s.volumeTotal, 0);
  const media = semanas.length > 0 ? (totalTreinos / semanas.length).toFixed(1) : "0";

  const cW = (W - 28 - 8) / 3;
  desenharCard(doc, 'Treinos no mes', String(totalTreinos), 14, y, cW, 18, TEMA.verde);
  desenharCard(doc, 'Volume total', `${volTotal.toLocaleString('pt-BR')} kg x rep`, 14 + cW + 4, y, cW, 18, TEMA.amarelo);
  desenharCard(doc, 'Media / semana', `${media} treinos`, 14 + cW * 2 + 8, y, cW, 18, TEMA.branco);
  y += 24;

  // ── Resumo semanal com comparação por nome do grupo de treino ──────────
  y = desenharTituloSecao(doc, 'Visao Semanal dos Treinos', y);

  // Monta lista: por semana, por treino (grupoNome do dia), volume total e kg/rep médio
  const treinosPorSemana: TreinoSemana[] = [];
  semanas
    .filter(s => s.totalTreinos > 0)
    .forEach(s => {
      s.dias
        .filter(d => d.exercicios.length > 0)
        .forEach(d => {
          const vol = d.exercicios.reduce(
            (a, ex) => a + ex.series.reduce((b, sr) => b + Number(sr.peso) * Number(sr.reps), 0), 0
          );
          const totalReps = d.exercicios.reduce(
            (a, ex) => a + ex.series.reduce((b, sr) => b + Number(sr.reps), 0), 0
          );
          const kgPerRep = totalReps > 0 ? vol / totalReps : 0;
          const dataCurta = d.data.split('-').reverse().slice(0, 2).join('/');
          const nomeExibicao = d.grupoNome
            ? `${d.grupoNome} ${dataCurta}`
            : `Treino ${dataCurta}`;
          treinosPorSemana.push({
            semanaLabel: s.label,
            grupoNome: nomeExibicao,
            data: d.data,
            volume: vol,
            totalReps,
            kgPerRep
        });
        });
    });

  // Monta rows comparando o mesmo grupoNome entre semanas
  const rows_resumo: (ResumoRow | null)[] = [];
  const treinosVistos: Record<string, TreinoSemana> = {};

  // Agrupa por semana para exibir
  const semanaLabels = [...new Set(treinosPorSemana.map(t => t.semanaLabel))];
  semanaLabels.forEach(semLabel => {
    const treinos = treinosPorSemana.filter(t => t.semanaLabel === semLabel);
    treinos.forEach((t, tIdx) => {
      let evolStr = '-';
      let evolColor: string = TEMA.cinzaMedio;
      // Extract base name (without date suffix "DD/MM") for cross-week comparison
      const nomeBase = t.grupoNome.replace(/\s+\d{2}\/\d{2}$/, '');
      const isRealGrupo = !nomeBase.startsWith('Treino');
      const prev = treinosVistos[nomeBase];
      if (isRealGrupo && prev && prev.semanaLabel !== t.semanaLabel && prev.volume > 0) {
        const diff = ((t.volume - prev.volume) / prev.volume * 100);
        const sinal = diff >= 0 ? '+' : '';
        evolStr = `${sinal}${diff.toFixed(1)}%`;
        evolColor = diff > 0 ? TEMA.verde : diff < 0 ? TEMA.vermelho : TEMA.cinzaMedio;
      }
      treinosVistos[nomeBase] = t;

      rows_resumo.push({
        semana: tIdx === 0 ? semLabel.replace(/ {2}/g, ' ') : '',
        grupo: t.grupoNome,
        volume: `${t.volume.toLocaleString('pt-BR')} kg·rep`,
        kgRep: `${t.kgPerRep.toFixed(2)} kg/rep`,
        evol: evolStr,
        evolColor,
        });
    });
    if (treinos.length > 0) rows_resumo.push(null);
  });

  if (rows_resumo.filter(Boolean).length === 0) {
    setTextColor(doc, TEMA.cinzaMedio);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('Nenhum treino com detalhes registrados.', 14, y + 2);
    y += 10;
  } else {
    if (y > 230) { y = novaPagina(doc); }
    const tableRows = rows_resumo
      .filter(Boolean)
      .map((r: any) => [r.semana, r.grupo, r.volume, r.kgRep, r.evol]);

    autoTable(doc, {
      startY: y,
      head: [['Semana', 'Treino', 'Volume Total', 'Kg/Rep', 'Evolucao kg/rep']],
      body: tableRows,
      ...estiloTabela(),
      headStyles: {
        fillColor: hexToRgb(TEMA.cinzaFundo),
        textColor: hexToRgb(TEMA.amarelo),
        fontSize: 8,
        fontStyle: 'bold' as const,
        },
      columnStyles: {
        0: { cellWidth: 38, fontStyle: 'bold' as const, textColor: hexToRgb(TEMA.cinzaClaro) },
        1: { cellWidth: 52 },
        2: { cellWidth: 32 },
        3: { cellWidth: 22 },
        4: { cellWidth: 28 }
        },
      didParseCell: (data: any) => {
        if (data.column.index === 4 && data.section === 'body') {
          const row = rows_resumo.filter(Boolean)[data.row.index];
          if (row) {
            data.cell.styles.textColor = hexToRgb(row.evolColor as string);
          }
        }
      },
      margin: { left: 14, right: 14, top: 15 },
        });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Weeks
  for (const semana of semanas) {
    if (y > 250) { y = novaPagina(doc); }

    y = desenharTituloSecao(doc, semana.label, y);

    if (semana.evolucao && semana.totalTreinos > 0) {
      const sinal = semana.evolucao.volume >= 0 ? "+" : "";
      const cor = semana.evolucao.volume >= 0 ? TEMA.verde : TEMA.vermelho;
      setTextColor(doc, cor);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(`  ${sinal}${semana.evolucao.volume}% vol vs semana anterior`, W - 14, y - 6, { align: "right" });
    }

    if (semana.dias.every(d => d.exercicios.length === 0 && !d.concluido)) {
      setTextColor(doc, TEMA.cinzaMedio);
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.text("Nenhum treino concluido nesta semana.", 14, y + 2);
      y += 10;
      continue;
    }

    for (const dia of semana.dias.filter(d => d.exercicios.length > 0 || d.concluido)) {
      if (y > 250) { y = novaPagina(doc); }

      const dataFmt = formatarDataCurta(dia.data, { weekday: true });

      if (dia.exercicios.length === 0) {
        // Concluded workout without detailed series
        autoTable(doc, {
          startY: y,
          head: [
            [{ content: `${dataFmt.toUpperCase()}  - CONCLUIDO`, colSpan: 5, styles: { fillColor: hexToRgb(TEMA.cinzaFundo), textColor: hexToRgb(TEMA.cinzaClaro), fontStyle: "bold", fontSize: 9 } }],
          ],
          body: [
            [{ content: "Treino concluido - sem detalhes de series registrados", colSpan: 5, styles: { textColor: hexToRgb(TEMA.cinzaMedio), fontStyle: "italic", fontSize: 8 } }],
          ],
          ...estiloTabela(),
          margin: { left: 14, right: 14, top: 15 },
        });
        y = (doc as any).lastAutoTable.finalY + 4;
        continue;
      }

      const rows: any[] = [];
      for (const ex of dia.exercicios) {
        const seriesStr = ex.series.map((s) => `S${s.numero}: ${Number(s.peso)}kg x ${Number(s.reps)}`).join("   ");
        const maxPeso = Math.max(...ex.series.map((s) => Number(s.peso)));
        const vol = ex.series.reduce((a, s) => a + Number(s.peso) * Number(s.reps), 0);
        rows.push([
          limparTexto(ex.nome),
          limparTexto(ex.grupo),
          seriesStr,
          `${maxPeso} kg`,
          `${vol} kg x rep`,
        ]);
      }

      autoTable(doc, {
        startY: y,
        head: [
          [{ content: `${dataFmt.toUpperCase()}${dia.concluido ? "  - CONCLUIDO" : ""}`, colSpan: 5, styles: { fillColor: hexToRgb(TEMA.cinzaFundo), textColor: hexToRgb(TEMA.cinzaClaro), fontStyle: "bold", fontSize: 9 } }],
          ["Exercicio", "Grupo", "Series", "Max", "Volume"],
        ],
        body: rows,
        ...estiloTabela(),
        showHead: 'firstPage',
        headStyles: { fillColor: hexToRgb(TEMA.cinzaFundo), textColor: hexToRgb(TEMA.amarelo), fontSize: 8, fontStyle: 'bold' as const },
        columnStyles: {
          0: { cellWidth: 48 },
          1: { cellWidth: 28 },
          2: { cellWidth: 68 },
          3: { cellWidth: 22 },
          4: { cellWidth: 24 }
        },
        margin: { left: 14, right: 14, top: 15 },
        });
      y = (doc as any).lastAutoTable.finalY + 4;
    }
    y += 4;
  }

  // Rodapé em todas as páginas
  const totalPaginas = doc.getNumberOfPages();
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    desenharRodape(doc, `Physiq - Pagina ${i} de ${totalPaginas}`);
  }

  // H4: no APK o download do navegador não baixa — o salvarPdf abre a folha de compartilhar (no site, o mesmo doc.save)
  return salvarPdf(doc, nomeArquivo);
}

export async function exportarExcel(
  perfil: ProfileData | null,
  avaliacao: any,
  semanas: SemanaAgrupada[],
  mes: number,
  ano: number,
  fallbackNome?: string,
  fallbackEmail?: string
) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const nomeAluno = obterNomeAluno(perfil, fallbackNome, fallbackEmail);
  const nomeArquivo = `treinos_${nomeAluno.replace(/\s+/g, "_")}_${MESES[mes - 1]}_${ano}.xlsx`;

  const totalTreinos = semanas.reduce((a, s) => a + s.totalTreinos, 0);
  const volTotal = semanas.reduce((a, s) => a + s.volumeTotal, 0);

  // Sheet 1: Summary
  const resumo = [
    ["PHYSIQ — RELATORIO DE TREINOS"],
    [`${MESES[mes - 1]} / ${ano}`],
    [`Gerado em: ${agoraFormatado({ incluirHora: false })}`],
    [],
    ["DADOS DO ALUNO"],
    ["Nome", perfil?.nome ?? fallbackNome ?? "-"],
    ["Email", perfil?.email ?? fallbackEmail ?? "-"],
    ["ID", perfil?.user_code ?? "-"],
    ["Peso", (avaliacao?.peso ?? perfil?.peso) ? `${avaliacao?.peso ?? perfil?.peso} kg` : "-"],
    ["Altura", (avaliacao?.altura ?? perfil?.altura) ? `${avaliacao?.altura ?? perfil?.altura} cm` : "-"],
    ["Idade", perfil?.idade ? `${perfil.idade} anos` : "-"],
    ["% Gordura", (avaliacao?.percentual_gordura ?? perfil?.percentual_gordura) ? `${avaliacao?.percentual_gordura ?? perfil?.percentual_gordura}%` : "-"],
    ["Massa Gorda", (avaliacao?.massa_gorda ?? perfil?.massa_gorda) ? `${avaliacao?.massa_gorda ?? perfil?.massa_gorda} kg` : "-"],
    ["Massa Magra", (avaliacao?.massa_magra ?? perfil?.massa_magra) ? `${avaliacao?.massa_magra ?? perfil?.massa_magra} kg` : "-"],
    ["Tipo de avaliação", rotuloMetodo((avaliacao ?? perfil)?.metodo_avaliacao)],
    [`TMB ${tmbDoAluno(perfil, avaliacao).label}`, tmbDoAluno(perfil, avaliacao).valor !== null ? `${Math.round(tmbDoAluno(perfil, avaliacao).valor!)} kcal/dia` : "-"],
    [],
    ["RESUMO DO MES"],
    ["Treinos no mes", totalTreinos],
    ["Volume total (kg x rep)", volTotal],
    ["Media por semana", parseFloat((totalTreinos / Math.max(semanas.length, 1)).toFixed(1))],
    [],
    ["COMPARATIVO POR SEMANA"],
    ["Semana", "Periodo", "Treinos", "Volume (kg x rep)", "Var. Vol %", "Var. Treinos"],
    ...semanas.map((s) => [
      s.label.split("  ")[0],
      s.label.split("  ")[1] ?? "",
      s.totalTreinos,
      s.volumeTotal,
      s.evolucao ? `${s.evolucao.volume >= 0 ? "+" : ""}${s.evolucao.volume}%` : "-",
      s.evolucao ? `${s.evolucao.treinos >= 0 ? "+" : ""}${s.evolucao.treinos}` : "-",
    ]),
  ];

  const wsResumo = XLSX.utils.aoa_to_sheet(resumo);
  wsResumo["!cols"] = [{ wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 18 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");

  // Sheet 2: Detailed workouts
  const linhas: any[][] = [
    ["Data", "Dia da semana", "Concluido", "Exercicio", "Grupo Muscular", "Serie", "Peso (kg)", "Reps", "Volume (kg x rep)"],
  ];

  for (const semana of semanas) {
    for (const dia of semana.dias) {
      for (const ex of dia.exercicios) {
        for (const s of ex.series) {
          linhas.push([
            dia.data,
            formatarDataCurta(dia.data, { weekday: true }),
            dia.concluido ? "Sim" : "Nao",
            ex.nome,
            ex.grupo,
            `S${s.numero}`,
            s.peso,
            s.reps,
            s.peso * s.reps,
          ]);
        }
      }
    }
  }

  const wsDetalhes = XLSX.utils.aoa_to_sheet(linhas);
  wsDetalhes["!cols"] = [
    { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 36 },
    { wch: 22 }, { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDetalhes, "Treinos Detalhados");

  // Sheet 3: Evolution by exercise
  const porExercicio: Record<string, { data: string; semana: number; series: number; maxPeso: number; vol: number }[]> = {};

  for (const semana of semanas) {
    for (const dia of semana.dias) {
      for (const ex of dia.exercicios) {
        if (!porExercicio[ex.nome]) porExercicio[ex.nome] = [];
        const maxPeso = Math.max(...ex.series.map((s) => s.peso));
        const vol = ex.series.reduce((a, s) => a + s.peso * s.reps, 0);
        porExercicio[ex.nome].push({ data: dia.data, semana: semana.numero, series: ex.series.length, maxPeso, vol });
      }
    }
  }

  const evolucaoLinhas: any[][] = [
    ["Exercicio", "Data", "Semana", "Series", "Peso Max (kg)", "Volume (kg x rep)"],
  ];
  for (const [nome, registros] of Object.entries(porExercicio)) {
    for (const r of registros) {
      evolucaoLinhas.push([nome, r.data, `Semana ${r.semana}`, r.series, r.maxPeso, r.vol]);
    }
  }

  const wsEvolucao = XLSX.utils.aoa_to_sheet(evolucaoLinhas);
  wsEvolucao["!cols"] = [{ wch: 36 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsEvolucao, "Evolucao por Exercicio");

  // H4: no APK o XLSX.writeFile (download do navegador) não baixa — vai pelo mesmo caminho do salvarPdf
  if (Capacitor.isNativePlatform()) await compartilharBase64(nomeArquivo, XLSX.write(wb, { bookType: "xlsx", type: "base64" }) as string);
  else XLSX.writeFile(wb, nomeArquivo);
}
