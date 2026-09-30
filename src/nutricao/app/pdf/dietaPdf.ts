// Physiq W11 — PDF do plano alimentar para o aluno (porta do src/lib/dietaPdf.ts do PhysiqNutri, com a marca Physiq — N-60):
// cabeçalho com título/aluno/data/nutricionista/meta, uma seção por refeição (horário · nome, e os dias da semana quando o plano
// varia por dia — NF3) com a tabela de alimentos (quantidade em medida/gramas, kcal, P, C, L), substituições e observações de
// cada item, total da refeição, os totais (por dia; plano que varia: um por dia da semana) e as observações gerais. jsPDF
// carregado sob demanda; no APK o arquivo sai pela folha de compartilhar (salvarPdf).
import type { jsPDF as JsPdf } from "jspdf";
import { format } from "date-fns";
import { salvarPdf } from "@/lib/salvarPdf";
import {
  ROTULO_SITUACAO, compararComAlvo, descricaoQuantidade, descricaoSubstituto, fmtDiferenca, fmtHorario, fmtKcal, fmtNum, fmtQtd, lerSubstitutos,
  macrosDoItem, nomeArquivoPDFDieta, ordenarItens, ordenarRefeicoes, percentuaisMacros, rotuloMetodo, situacaoAlvo, somarMacros, totaisDoPlano,
} from "../dietaUtil";
import { DIAS_SEMANA, normalizarDias, textoDias } from "../metasUtil";
import type { PlanoAlimentar } from "../tipos";

export type DadosPDFDieta = { aluno: string; nutricionista: string | null; plano: PlanoAlimentar };

const MARGEM = 18;
const LARGURA = 210 - MARGEM * 2;
const RODAPE = 285;
const COLUNA2 = MARGEM + LARGURA / 2;
// Alimento · Quantidade · kcal · P · C · L (soma = LARGURA)
const LARGURAS = [66, 48, 16, 15, 15, 14];
type Cor = [number, number, number];
type Estilo = "normal" | "bold" | "italic";
const VIOLETA: Cor = [139, 92, 246];

export async function montarPDFDieta(d: DadosPDFDieta): Promise<JsPdf> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const plano = d.plano;
  const refeicoes = ordenarRefeicoes(plano.refeicoes).map((r) => ({ ...r, itens: ordenarItens(r.itens) }));
  const varia = refeicoes.some((r) => normalizarDias(r.dias_semana).length > 0);
  let y = MARGEM;

  const quebrar = (altura: number) => {
    if (y + altura > RODAPE - 6) {
      doc.addPage();
      y = MARGEM;
    }
  };
  const fonte = (tamanho: number, estilo: Estilo, cor: Cor = [20, 20, 20]) => {
    doc.setFont("helvetica", estilo);
    doc.setFontSize(tamanho);
    doc.setTextColor(...cor);
  };
  const paragrafo = (texto: string, tamanho: number, estilo: Estilo, cor: Cor = [20, 20, 20], recuo = 0) => {
    fonte(tamanho, estilo, cor);
    const linhas = doc.splitTextToSize(texto || "—", LARGURA - recuo) as string[];
    const passo = tamanho * 0.45;
    for (const linha of linhas) {
      quebrar(passo);
      doc.text(linha, MARGEM + recuo, y);
      y += passo;
    }
  };
  const titulo = (texto: string) => {
    quebrar(12);
    y += 2;
    fonte(9, "bold", [120, 120, 120]);
    doc.text(texto.toUpperCase(), MARGEM, y);
    y += 1.5;
    doc.setDrawColor(200, 200, 200);
    doc.line(MARGEM, y, 210 - MARGEM, y);
    y += 5;
  };
  const tabelaDupla = (itens: [string, string][]) => {
    const passo = 5.2;
    for (let i = 0; i < itens.length; i += 2) {
      quebrar(passo);
      [itens[i], itens[i + 1]].forEach((item, col) => {
        if (!item) return;
        const x = col === 0 ? MARGEM : COLUNA2;
        fonte(10, "normal", [90, 90, 90]);
        doc.text(item[0], x, y);
        fonte(10, "bold");
        doc.text(item[1], x + LARGURA / 2 - 4, y, { align: "right" });
      });
      y += passo;
    }
  };
  /** Corta um texto pra caber na largura da coluna (com "..." no fim). */
  const cortar = (texto: string, largura: number): string => {
    const partes = doc.splitTextToSize(texto, largura - 2) as string[];
    if (partes.length <= 1) return texto;
    const primeira = partes[0].replace(/\s+\S*$/, "");
    return `${primeira || partes[0]}...`;
  };
  const xs: number[] = [];
  let acc = MARGEM;
  for (const l of LARGURAS) {
    xs.push(acc);
    acc += l;
  }
  const linhaTabela = (colunas: string[], estilo: Estilo = "normal", cor: Cor = [20, 20, 20]) => {
    quebrar(5.2);
    colunas.forEach((c, i) => {
      fonte(9.5, estilo, cor);
      if (i <= 1) doc.text(cortar(c, LARGURAS[i]), xs[i], y);
      else doc.text(c, xs[i] + LARGURAS[i] - 2, y, { align: "right" });
    });
    y += 5.2;
  };

  // ---- Cabeçalho (faixa violeta + marca, como os outros PDFs do Physiq) ----
  doc.setFillColor(...VIOLETA);
  doc.rect(0, 0, 210, 3, "F");
  fonte(9, "bold", [120, 120, 120]);
  doc.text("PHYSIQ · PLANO ALIMENTAR", MARGEM, y);
  y += 7;
  paragrafo(plano.titulo, 16, "bold");
  y += 1;
  paragrafo(`Aluno: ${d.aluno}`, 10.5, "normal", [60, 60, 60]);
  paragrafo(`Data: ${format(new Date(plano.created_at), "dd/MM/yyyy")}${d.nutricionista ? `   ·   Nutricionista: ${d.nutricionista}` : ""}`, 10.5, "normal", [60, 60, 60]);
  const todos = totaisDoPlano(refeicoes);
  paragrafo(
    `Método: ${rotuloMetodo(plano.metodo) || "Alimentos"}   ·   Meta: ${plano.kcal_alvo ? `${fmtKcal(plano.kcal_alvo)} kcal/dia` : "não definida"}` +
      (varia ? "   ·   O plano muda conforme o dia da semana" : `   ·   Plano: ${fmtKcal(todos.energia_kcal)} kcal/dia`),
    10.5, "normal", [60, 60, 60],
  );
  y += 2;

  // ---- Refeições ----
  for (const r of refeicoes) {
    const hora = fmtHorario(r.horario);
    const dias = normalizarDias(r.dias_semana);
    titulo(`${hora ? `${hora} · ` : ""}${r.nome}${dias.length ? ` · ${textoDias(dias)}` : ""}`);
    if (r.itens.length === 0) {
      paragrafo("Sem alimentos nesta refeição.", 9.5, "italic", [120, 120, 120]);
    } else {
      linhaTabela(["Alimento", "Quantidade", "kcal", "P (g)", "C (g)", "L (g)"], "bold", [90, 90, 90]);
      for (const i of r.itens) {
        const m = macrosDoItem(i);
        linhaTabela([i.alimento?.nome ?? "Alimento removido", descricaoQuantidade(i), fmtQtd(m.energia_kcal), fmtQtd(m.proteina_g), fmtQtd(m.carboidrato_g), fmtQtd(m.lipidio_g)]);
        const subs = lerSubstitutos(i.substitutos);
        if (subs.length) paragrafo(`ou: ${subs.map(descricaoSubstituto).join("  ·  ")}`, 8.5, "italic", [110, 110, 110], 4);
        if (i.observacao?.trim()) paragrafo(i.observacao.trim(), 8.5, "italic", [110, 110, 110], 4);
      }
      const t = somarMacros(r.itens.map(macrosDoItem));
      linhaTabela(["Total da refeição", "", fmtQtd(t.energia_kcal), fmtQtd(t.proteina_g), fmtQtd(t.carboidrato_g), fmtQtd(t.lipidio_g)], "bold");
    }
    if (r.observacao?.trim()) paragrafo(r.observacao.trim(), 9.5, "italic", [90, 90, 90]);
    y += 1;
  }

  // ---- Totais ----
  if (varia) {
    titulo("Totais por dia da semana");
    linhaTabela(["Dia", "", "kcal", "P (g)", "C (g)", "L (g)"], "bold", [90, 90, 90]);
    for (const dsem of DIAS_SEMANA) {
      const doDia = refeicoes.filter((r) => {
        const ds = normalizarDias(r.dias_semana);
        return ds.length === 0 || ds.includes(dsem.n);
      });
      const t = totaisDoPlano(doDia);
      linhaTabela([dsem.nome, `${doDia.length} ${doDia.length === 1 ? "refeição" : "refeições"}`, fmtQtd(t.energia_kcal), fmtQtd(t.proteina_g), fmtQtd(t.carboidrato_g), fmtQtd(t.lipidio_g)]);
    }
  } else {
    titulo("Totais do plano (por dia)");
    const pct = percentuaisMacros(todos);
    const comp = compararComAlvo(todos.energia_kcal, plano.kcal_alvo);
    tabelaDupla([
      ["Energia", `${fmtKcal(todos.energia_kcal)} kcal`],
      ["Meta", plano.kcal_alvo ? `${fmtKcal(plano.kcal_alvo)} kcal` : "—"],
      ["Diferença", comp ? `${fmtDiferenca(comp.diferenca)} kcal (${fmtNum(comp.pct, 0)} % da meta)` : "—"],
      ["Situação", ROTULO_SITUACAO[situacaoAlvo(comp)]],
      ["Proteína", `${fmtQtd(todos.proteina_g)} g${pct ? ` (${fmtNum(pct.proteina, 1)} %)` : ""}`],
      ["Carboidrato", `${fmtQtd(todos.carboidrato_g)} g${pct ? ` (${fmtNum(pct.carboidrato, 1)} %)` : ""}`],
      ["Lipídios", `${fmtQtd(todos.lipidio_g)} g${pct ? ` (${fmtNum(pct.lipidio, 1)} %)` : ""}`],
      ["Fibra alimentar", `${fmtQtd(todos.fibra_g)} g`],
      ["Sódio", `${fmtQtd(todos.sodio_mg)} mg`],
      ["Refeições", String(refeicoes.length)],
    ]);
  }
  y += 1;
  paragrafo("Valores calculados a partir da tabela TACO 4ª ed. (NEPA/Unicamp) e dos alimentos cadastrados pela nutricionista. % = participação de cada macronutriente nas kcal (4/4/9).", 8.5, "italic", [120, 120, 120]);

  if (plano.observacao?.trim()) {
    titulo("Observações");
    paragrafo(plano.observacao.trim(), 10.5, "normal");
  }

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    fonte(8, "normal", [150, 150, 150]);
    doc.text(`${d.aluno} · ${plano.titulo}`, MARGEM, RODAPE + 4);
    doc.text(`Physiq · ${p}/${total}`, 210 - MARGEM, RODAPE + 4, { align: "right" });
  }
  return doc;
}

/** Gera e baixa (no APK: compartilha) o PDF; devolve o nome do arquivo. */
export async function baixarPDFDieta(d: DadosPDFDieta): Promise<string> {
  const nome = nomeArquivoPDFDieta(d.aluno, new Date(d.plano.created_at));
  await salvarPdf(await montarPDFDieta(d), nome);
  return nome;
}
