// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/dietaPdf.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { fmtQtd } from "@/nutricao/editor/lib/alimentosUtil";
import { fmtNum } from "@/nutricao/editor/lib/antropometriaUtil";
import {
  ROTULO_SITUACAO, compararComAlvo, descricaoQuantidade, descricaoSubstituto, fmtDiferenca, fmtHorario, fmtKcal, lerSubstitutos, macrosDoItem,
  nomeArquivoPDFDieta, percentuaisMacros, rotuloMetodo, situacaoAlvo, somarMacros, totaisDoPlano, type ItemCalc,
} from "@/nutricao/editor/lib/dietaUtil";

// PDF do plano alimentar pro paciente (jspdf, A4): cabeçalho com título/paciente/data/nutricionista/meta, uma seção
// por refeição (horário · nome) com a tabela de alimentos (quantidade em medida/gramas, kcal, P, C, L), substituições
// e observações de cada item, total da refeição, totais do plano vs meta e observações gerais. Fonte padrão
// (Helvetica). Carregado em chunk separado, como os outros PDFs.

export type ItemPDF = ItemCalc & { observacao: string | null; substitutos: unknown };
export type RefeicaoPDF = { nome: string; horario: string | null; observacao: string | null; itens: ItemPDF[] };
export type DadosPDFDieta = {
  paciente: string;
  nutricionista: string | null;
  data: Date;
  titulo: string;
  metodo: string;
  kcal_alvo: number | null;
  observacao: string | null;
  refeicoes: RefeicaoPDF[];
};

const MARGEM = 18;
const LARGURA = 210 - MARGEM * 2;
const RODAPE = 285;
const COLUNA2 = MARGEM + LARGURA / 2;
// Alimento · Quantidade · kcal · P · C · L (soma = LARGURA)
const LARGURAS = [66, 48, 16, 15, 15, 14];

export function montarPDFDieta(d: DadosPDFDieta): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGEM;

  const quebrar = (altura: number) => {
    if (y + altura > RODAPE - 6) {
      doc.addPage();
      y = MARGEM;
    }
  };
  const fonte = (tamanho: number, estilo: "normal" | "bold" | "italic", cor: [number, number, number] = [20, 20, 20]) => {
    doc.setFont("helvetica", estilo);
    doc.setFontSize(tamanho);
    doc.setTextColor(...cor);
  };
  const paragrafo = (texto: string, tamanho: number, estilo: "normal" | "bold" | "italic", cor: [number, number, number] = [20, 20, 20], recuo = 0) => {
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
      const par = [itens[i], itens[i + 1]];
      par.forEach((item, col) => {
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
  const celula = (texto: string, col: number, estilo: "normal" | "bold" | "italic", cor: [number, number, number]) => {
    fonte(9.5, estilo, cor);
    if (col === 0) doc.text(cortar(texto, LARGURAS[col]), xs[col], y);
    else if (col === 1) doc.text(cortar(texto, LARGURAS[col]), xs[col], y);
    else doc.text(texto, xs[col] + LARGURAS[col] - 2, y, { align: "right" });
  };
  const linhaTabela = (colunas: string[], estilo: "normal" | "bold" | "italic" = "normal", cor: [number, number, number] = [20, 20, 20]) => {
    quebrar(5.2);
    colunas.forEach((c, i) => celula(c, i, estilo, cor));
    y += 5.2;
  };

  // ---- Cabeçalho ----
  fonte(9, "bold", [120, 120, 120]);
  doc.text("PHYSIQNUTRI · PLANO ALIMENTAR", MARGEM, y);
  y += 7;
  paragrafo(d.titulo, 16, "bold");
  y += 1;
  paragrafo(`Paciente: ${d.paciente}`, 10.5, "normal", [60, 60, 60]);
  paragrafo(`Data: ${format(d.data, "dd/MM/yyyy")}${d.nutricionista ? `   ·   Nutricionista: ${d.nutricionista}` : ""}`, 10.5, "normal", [60, 60, 60]);
  const totais = totaisDoPlano(d.refeicoes);
  paragrafo(
    `Método: ${rotuloMetodo(d.metodo) || "Alimentos"}   ·   Meta: ${d.kcal_alvo ? `${fmtKcal(d.kcal_alvo)} kcal/dia` : "não definida"}   ·   Plano: ${fmtKcal(totais.energia_kcal)} kcal/dia`,
    10.5, "normal", [60, 60, 60],
  );
  y += 2;

  // ---- Refeições ----
  for (const r of d.refeicoes) {
    const hora = fmtHorario(r.horario);
    titulo(`${hora ? `${hora} · ` : ""}${r.nome}`);
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
      linhaTabela(["Total da refeição", "", fmtQtd(t.energia_kcal), fmtQtd(t.proteina_g), fmtQtd(t.carboidrato_g), fmtQtd(t.lipidio_g)], "bold", [20, 20, 20]);
    }
    if (r.observacao?.trim()) paragrafo(r.observacao.trim(), 9.5, "italic", [90, 90, 90]);
    y += 1;
  }

  // ---- Totais ----
  titulo("Totais do plano (por dia)");
  const pct = percentuaisMacros(totais);
  const comp = compararComAlvo(totais.energia_kcal, d.kcal_alvo);
  tabelaDupla([
    ["Energia", `${fmtKcal(totais.energia_kcal)} kcal`],
    ["Meta", d.kcal_alvo ? `${fmtKcal(d.kcal_alvo)} kcal` : "—"],
    ["Diferença", comp ? `${fmtDiferenca(comp.diferenca)} kcal (${fmtNum(comp.pct, 0)} % da meta)` : "—"],
    ["Situação", ROTULO_SITUACAO[situacaoAlvo(comp)]],
    ["Proteína", `${fmtQtd(totais.proteina_g)} g${pct ? ` (${fmtNum(pct.proteina, 1)} %)` : ""}`],
    ["Carboidrato", `${fmtQtd(totais.carboidrato_g)} g${pct ? ` (${fmtNum(pct.carboidrato, 1)} %)` : ""}`],
    ["Lipídios", `${fmtQtd(totais.lipidio_g)} g${pct ? ` (${fmtNum(pct.lipidio, 1)} %)` : ""}`],
    ["Fibra alimentar", `${fmtQtd(totais.fibra_g)} g`],
    ["Sódio", `${fmtQtd(totais.sodio_mg)} mg`],
    ["Refeições", String(d.refeicoes.length)],
  ]);
  y += 1;
  paragrafo("Valores calculados a partir da tabela TACO 4ª ed. (NEPA/Unicamp) e dos alimentos cadastrados pela nutricionista. % = participação de cada macronutriente nas kcal (4/4/9).", 8.5, "italic", [120, 120, 120]);

  if (d.observacao?.trim()) {
    titulo("Observações");
    paragrafo(d.observacao.trim(), 10.5, "normal");
  }

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    fonte(8, "normal", [150, 150, 150]);
    doc.text(`${d.paciente} · ${d.titulo}`, MARGEM, RODAPE + 4);
    doc.text(`${p}/${total}`, 210 - MARGEM, RODAPE + 4, { align: "right" });
  }
  return doc;
}

/** Gera e baixa o PDF; devolve o nome do arquivo. */
export function baixarPDFDieta(d: DadosPDFDieta): string {
  const nome = nomeArquivoPDFDieta(d.paciente, d.data);
  montarPDFDieta(d).save(nome);
  return nome;
}
