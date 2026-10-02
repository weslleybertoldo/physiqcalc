// Physiq W17 — porta do PhysiqNutri (main ca9f66f, src/lib/antropometriaPdf.ts). Só os imports mudaram; o resto é o do site antigo. W26: marca PHYSIQ no cabeçalho (N-60, como a W18/W19/W24).
import { jsPDF } from "jspdf";
import { format } from "date-fns";
import {
  CIRCUNFERENCIAS, DOBRAS, fmtNum, lerMedidas, lerResultados, nomeArquivoPDF, rotuloProtocolo, rotuloSexo,
} from "@/nutricao/editor/lib/antropometriaUtil";

// PDF da avaliação antropométrica (jspdf, A4): cabeçalho com paciente/data/nutricionista, dados da avaliação,
// circunferências e dobras em duas colunas, resultados e observações. Fonte padrão (Helvetica, Latin-1).

export type DadosPDFAntropometria = {
  paciente: string;
  nutricionista: string | null;
  data: Date;
  peso: number | null;
  altura: number | null;
  sexo: string | null;
  idade: number | null;
  protocolo: string;
  circunferencias: unknown;
  dobras: unknown;
  resultados: unknown;
  observacao: string | null;
};

const MARGEM = 18;
const LARGURA = 210 - MARGEM * 2;
const RODAPE = 285;
const COLUNA2 = MARGEM + LARGURA / 2;

export function montarPDFAntropometria(d: DadosPDFAntropometria): jsPDF {
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
  const paragrafo = (texto: string, tamanho: number, estilo: "normal" | "bold" | "italic", cor: [number, number, number] = [20, 20, 20]) => {
    fonte(tamanho, estilo, cor);
    const linhas = doc.splitTextToSize(texto || "—", LARGURA) as string[];
    const passo = tamanho * 0.45;
    for (const linha of linhas) {
      quebrar(passo);
      doc.text(linha, MARGEM, y);
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
  /** Pares rótulo/valor em duas colunas. */
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

  fonte(9, "bold", [120, 120, 120]);
  doc.text("PHYSIQ · ANTROPOMETRIA", MARGEM, y);
  y += 7;
  paragrafo("Avaliação antropométrica", 16, "bold");
  y += 1;
  paragrafo(`Paciente: ${d.paciente}`, 10.5, "normal", [60, 60, 60]);
  paragrafo(`Data: ${format(d.data, "dd/MM/yyyy HH:mm")}${d.nutricionista ? `   ·   Nutricionista: ${d.nutricionista}` : ""}`, 10.5, "normal", [60, 60, 60]);
  y += 2;

  titulo("Dados da avaliação");
  tabelaDupla([
    ["Peso", d.peso === null ? "—" : `${fmtNum(d.peso, 1)} kg`],
    ["Altura", d.altura === null ? "—" : `${fmtNum(d.altura, 1)} cm`],
    ["Sexo", rotuloSexo(d.sexo)],
    ["Idade", d.idade === null ? "—" : `${d.idade} anos`],
    ["Protocolo", rotuloProtocolo(d.protocolo, false)],
  ]);

  const circ = lerMedidas(d.circunferencias);
  const itensCirc = CIRCUNFERENCIAS.filter((c) => circ[c.chave] !== undefined).map((c): [string, string] => [c.rotulo, `${fmtNum(circ[c.chave], 1)} cm`]);
  if (itensCirc.length) {
    titulo("Circunferências");
    tabelaDupla(itensCirc);
  }

  const dob = lerMedidas(d.dobras);
  const itensDob = DOBRAS.filter((x) => dob[x.chave] !== undefined).map((x): [string, string] => [x.rotulo, `${fmtNum(dob[x.chave], 1)} mm`]);
  if (itensDob.length) {
    titulo("Dobras cutâneas");
    tabelaDupla(itensDob);
  }

  const r = lerResultados(d.resultados);
  const itensRes: [string, string][] = [];
  if (r.imc !== null) itensRes.push(["IMC", `${fmtNum(r.imc, 1)} kg/m²${r.classificacao_imc ? ` (${r.classificacao_imc})` : ""}`]);
  if (r.densidade !== null) itensRes.push(["Densidade corporal", `${fmtNum(r.densidade, 4)} g/cm³`]);
  if (r.percentual_gordura !== null) itensRes.push(["% de gordura", `${fmtNum(r.percentual_gordura, 1)}%`]);
  if (r.massa_gorda !== null) itensRes.push(["Massa gorda", `${fmtNum(r.massa_gorda, 1)} kg`]);
  if (r.massa_magra !== null) itensRes.push(["Massa magra", `${fmtNum(r.massa_magra, 1)} kg`]);
  if (r.rcq !== null) itensRes.push(["Relação cintura/quadril", fmtNum(r.rcq, 2)]);
  if (r.rce !== null) itensRes.push(["Relação cintura/estatura", fmtNum(r.rce, 2)]);
  if (itensRes.length) {
    titulo("Resultados");
    tabelaDupla(itensRes);
  }

  if (d.observacao?.trim()) {
    titulo("Observações");
    paragrafo(d.observacao.trim(), 10.5, "normal");
  }

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    fonte(8, "normal", [150, 150, 150]);
    doc.text(`${d.paciente} · ${format(d.data, "dd/MM/yyyy")}`, MARGEM, RODAPE + 4);
    doc.text(`${p}/${total}`, 210 - MARGEM, RODAPE + 4, { align: "right" });
  }
  return doc;
}

/** Gera e baixa o PDF; devolve o nome do arquivo. */
export function baixarPDFAntropometria(d: DadosPDFAntropometria): string {
  const nome = nomeArquivoPDF(d.paciente, d.data);
  montarPDFAntropometria(d).save(nome);
  return nome;
}
