// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/prontuarioPdf.ts) para o banco principal. O mesmo documento de hoje,
// com a marca Physiq; as anotações agora têm autor (personal e nutricionista na mesma linha do tempo — P4): quem escreveu aparece
// ao lado da data quando não é quem emite o PDF (as dela saem iguais ao site antigo).
import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { blocosDoMarkdown, textoSemMarcas, trechosInline, type Bloco } from "@/nutricao/editor/lib/orientacoesUtil";
import { agruparPorMes, formatarDataHoraRegistro, nomeArquivoPDFProntuario, textoContagem, textoNascimento } from "@/nutricao/editor/lib/prontuarioUtil";

// PDF do prontuário INTEIRO (jspdf, A4): cabeçalho PHYSIQ · PRONTUÁRIO DO PACIENTE com paciente, nascimento (idade),
// nutricionista e "emitido em"; os registros vivos agrupados por mês na MESMA ordem da tela (mais recente primeiro) —
// data/hora em negrito e o texto nos blocos da W10 (títulos, subtítulos, listas, parágrafos e `**negrito**` inline montado
// palavra a palavra) — e rodapé com páginas. Fonte padrão (Helvetica, Latin-1). Carregado em chunk separado (`pdf-*.js`).

export type DadosPDFProntuario = {
  paciente: string;
  /** `yyyy-MM-dd` ou null */
  nascimento: string | null;
  nutricionista: string | null;
  /** o rótulo da linha de quem emite (padrão "Nutricionista", como no site antigo) */
  rotuloProfissional?: string;
  emitidoEm: Date;
  /** `autor` = quem escreveu, quando não é quem emite (sai "data · autor") */
  registros: { data: string; texto: string; created_at: string; autor?: string | null }[];
};

const MARGEM = 18;
const LARGURA = 210 - MARGEM * 2;
const RODAPE = 285;
type Cor = [number, number, number];
type Estilo = "normal" | "bold" | "italic";

export function montarPDFProntuario(d: DadosPDFProntuario): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
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
  /** Texto corrido com `**negrito**`: monta palavra a palavra e quebra a linha quando não cabe (igual ao PDF da W10). */
  const rico = (texto: string, tamanho: number, recuo = 0, cor: Cor = [20, 20, 20]) => {
    const passo = tamanho * 0.45;
    const xIni = MARGEM + recuo;
    const xFim = MARGEM + LARGURA;
    const pecas: { t: string; negrito: boolean }[] = [];
    for (const tr of trechosInline(texto)) {
      for (const p of tr.texto.split(/(\s+)/)) if (p) pecas.push({ t: p, negrito: tr.negrito });
    }
    if (!pecas.length) return;
    quebrar(passo);
    let x = xIni;
    for (const p of pecas) {
      fonte(tamanho, p.negrito ? "bold" : "normal", cor);
      const larg = doc.getTextWidth(p.t);
      if (x > xIni && x + larg > xFim) {
        y += passo;
        quebrar(passo);
        x = xIni;
        if (/^\s+$/.test(p.t)) continue; // espaço no começo da linha nova não conta
      }
      doc.text(p.t, x, y);
      x += larg;
    }
    y += passo;
  };
  const bloco = (b: Bloco) => {
    if (b.tipo === "titulo") {
      y += 1.5;
      quebrar(11);
      paragrafo(textoSemMarcas(b.texto), 12, "bold");
      y += 0.8;
      return;
    }
    if (b.tipo === "subtitulo") {
      y += 1.2;
      quebrar(9);
      paragrafo(textoSemMarcas(b.texto).toUpperCase(), 9.5, "bold", [90, 90, 90]);
      y += 0.5;
      return;
    }
    if (b.tipo === "lista") {
      for (const item of b.itens) {
        quebrar(6);
        fonte(10.5, "normal");
        doc.text("•", MARGEM + 1.5, y);
        rico(item, 10.5, 6);
        y += 0.8;
      }
      y += 1.2;
      return;
    }
    rico(b.texto, 10.5);
    y += 2;
  };

  // ---- Cabeçalho ----
  fonte(9, "bold", [120, 120, 120]);
  doc.text("PHYSIQ · PRONTUÁRIO DO PACIENTE", MARGEM, y);
  y += 7;
  paragrafo(d.paciente, 16, "bold");
  y += 1;
  const nascimento = textoNascimento(d.nascimento, d.emitidoEm);
  if (nascimento) paragrafo(`Nascimento: ${nascimento}`, 10.5, "normal", [60, 60, 60]);
  if (d.nutricionista) paragrafo(`${d.rotuloProfissional ?? "Nutricionista"}: ${d.nutricionista}`, 10.5, "normal", [60, 60, 60]);
  paragrafo(`Emitido em ${format(d.emitidoEm, "dd/MM/yyyy HH:mm")}   ·   ${textoContagem(d.registros.length)}`, 10.5, "normal", [60, 60, 60]);
  y += 2;
  doc.setDrawColor(200, 200, 200);
  doc.line(MARGEM, y, 210 - MARGEM, y);
  y += 6;

  // ---- Registros por mês (mais recente primeiro, como na tela) ----
  const grupos = agruparPorMes(d.registros);
  if (!grupos.length) paragrafo("Nenhum registro no prontuário.", 10.5, "italic", [140, 140, 140]);
  for (const g of grupos) {
    y += 1;
    quebrar(14);
    paragrafo(g.rotulo.toUpperCase(), 9.5, "bold", [90, 90, 90]);
    y += 1.5;
    for (const r of g.registros) {
      quebrar(14);
      paragrafo(r.autor ? `${formatarDataHoraRegistro(r.data)} · ${r.autor}` : formatarDataHoraRegistro(r.data), 11.5, "bold");
      y += 0.5;
      const blocos = blocosDoMarkdown(r.texto);
      if (!blocos.length) paragrafo("Sem conteúdo.", 10.5, "italic", [140, 140, 140]);
      for (const b of blocos) bloco(b);
      y += 1;
      quebrar(4);
      doc.setDrawColor(225, 225, 225);
      doc.line(MARGEM, y, 210 - MARGEM, y);
      y += 5;
    }
  }

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    fonte(8, "normal", [150, 150, 150]);
    doc.text(`${d.paciente} · Prontuário · ${format(d.emitidoEm, "dd/MM/yyyy")}`, MARGEM, RODAPE + 4);
    doc.text(`${p}/${total}`, 210 - MARGEM, RODAPE + 4, { align: "right" });
  }
  return doc;
}

/** Gera e baixa o PDF do prontuário inteiro; devolve o nome do arquivo. */
export function baixarPDFProntuario(d: DadosPDFProntuario): string {
  const nome = nomeArquivoPDFProntuario(d.paciente, d.emitidoEm);
  montarPDFProntuario(d).save(nome);
  return nome;
}
