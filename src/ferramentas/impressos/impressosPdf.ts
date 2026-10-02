// Physiq W26 — porta do PhysiqNutri (main 294887a, src/lib/impressosPdf.ts) com a marca do Physiq (como a W18/W19/W24). Só a marca
// (PHYSIQ · IMPRESSO, rodapé 'Physiq · nome · data' e a nota do Código de ética) e os imports mudaram; o desenho é o do site antigo.
import { jsPDF } from "jspdf";
import { autoTable, type RowInput } from "jspdf-autotable";
import {
  type ContextoImpresso, type Impresso, ID_CODIGO_ETICA, LINK_CFN, impressoPorId, infoCategoria, nomeArquivo, rodapeImpresso, textoEmitido,
} from "@/ferramentas/impressos/impressosUtil";

// W31 — os 7 impressos do consultório, gerados na hora (jsPDF + autotable; mesmo padrão dos outros `lib/*Pdf.ts`). Conteúdo PRÓPRIO:
// nada é copiado da referência; o Código de ética é um resumo em palavras nossas + o link do texto oficial no CFN (nunca o texto legal).
// Todos têm o mesmo cabeçalho (marca · categoria · título · nutricionista · data) e rodapé ('Physiq · nome · data' + página).
// Helvetica padrão é Latin-1 → `latin()` troca os símbolos que não existem lá; quadradinhos e linhas pra preencher são DESENHADOS.

type Estilo = "normal" | "bold" | "italic";
type Cor = [number, number, number];
type Alinh = "left" | "right" | "center";
type Celula =
  | string
  | { content: string; rowSpan?: number; colSpan?: number; styles?: { fontStyle?: Estilo; fillColor?: Cor; halign?: Alinh; valign?: "top" | "middle" | "bottom"; textColor?: Cor } };
type Linha = Celula[];

type OpcoesTabela = {
  cabecalho?: string[];
  linhas: Linha[];
  larguras?: number[];
  alinhamentos?: Alinh[];
  /** colunas do corpo que ganham um quadradinho pra marcar à mão (o texto da célula é ignorado) */
  marcadores?: number[];
  tamanho?: number;
  alturaLinha?: number;
  /** recheio da célula (padrão 1.6 mm; menor = linha mais baixa) */
  recheio?: number;
  cabecalhoCentralizado?: boolean;
  negritoPrimeiraColuna?: boolean;
};

const MARGEM = 15;
const LARGURA = 210 - MARGEM * 2;
const DIREITA = 210 - MARGEM;
const RODAPE = 284;
const PRETO: Cor = [20, 20, 20];
const CINZA: Cor = [70, 70, 70];
const CINZA_CLARO: Cor = [110, 110, 110];
const APAGADO: Cor = [150, 150, 150];
const ESCURO: Cor = [40, 40, 40];
const LINHA: Cor = [205, 205, 205];
const AZUL: Cor = [30, 90, 170];
const FUNDO: Cor = [238, 238, 238];

/** Helvetica padrão é Latin-1: ≤ ≥ – — − → × … e aspas curvas não existem lá. */
const latin = (s: string): string =>
  s
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/[–—−]/g, "-")
    .replace(/→/g, "->")
    .replace(/×/g, "x")
    .replace(/…/g, "...")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');

const vazias = (rotulo: string, n: number): Linha => [rotulo, ...Array.from({ length: n }, () => "")];

function novoDesenho(impresso: Impresso, ctx: ContextoImpresso) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGEM;

  const fonte = (tamanho: number, estilo: Estilo, cor: Cor = PRETO) => {
    doc.setFont("helvetica", estilo);
    doc.setFontSize(tamanho);
    doc.setTextColor(...cor);
  };
  const quebrar = (altura: number) => {
    if (y + altura > RODAPE - 8) {
      doc.addPage();
      y = MARGEM;
    }
  };
  const novaPagina = () => {
    doc.addPage();
    y = MARGEM;
  };
  const espaco = (mm: number) => {
    y += mm;
  };
  const paragrafo = (texto: string, tamanho = 10, estilo: Estilo = "normal", cor: Cor = PRETO, recuo = 0) => {
    fonte(tamanho, estilo, cor);
    const linhas = doc.splitTextToSize(latin(texto) || "-", LARGURA - recuo) as string[];
    const passo = tamanho * 0.45;
    for (const l of linhas) {
      quebrar(passo);
      doc.text(l, MARGEM + recuo, y);
      y += passo;
    }
  };
  const nota = (texto: string) => {
    paragrafo(texto, 8.5, "italic", CINZA_CLARO);
    y += 1;
  };
  const secao = (titulo: string, detalhe?: string) => {
    y += 2.5;
    quebrar(12);
    const rotulo = latin(titulo.toUpperCase());
    fonte(9.5, "bold", CINZA_CLARO);
    doc.text(rotulo, MARGEM, y);
    if (detalhe) {
      const larg = doc.getTextWidth(rotulo);
      fonte(9.5, "normal", CINZA_CLARO);
      doc.text(latin(`· ${detalhe}`), MARGEM + larg + 2, y);
    }
    y += 1.5;
    doc.setDrawColor(215, 215, 215);
    doc.setLineWidth(0.3);
    doc.line(MARGEM, y, DIREITA, y);
    y += 5;
  };
  const lista = (itens: string[], tamanho = 10) => {
    for (const item of itens) {
      quebrar(tamanho * 0.45);
      fonte(tamanho, "normal");
      doc.text("•", MARGEM + 1.5, y);
      paragrafo(item, tamanho, "normal", PRETO, 6);
      y += 0.8;
    }
    y += 1;
  };
  /** 'Rótulo: ________' lado a lado; quebra a linha sozinho quando não cabe. */
  const campos = (itens: { rotulo: string; largura?: number }[], tamanho = 10) => {
    quebrar(9);
    let x = MARGEM;
    for (const it of itens) {
      fonte(tamanho, "bold", CINZA);
      const rot = latin(`${it.rotulo}:`);
      const largRot = doc.getTextWidth(rot) + 1.5;
      const largCampo = it.largura ?? 50;
      if (x > MARGEM && x + largRot + largCampo > DIREITA + 0.5) {
        y += 8.5;
        quebrar(9);
        x = MARGEM;
      }
      doc.text(rot, x, y);
      const fim = Math.min(x + largRot + largCampo, DIREITA);
      doc.setDrawColor(150, 150, 150);
      doc.setLineWidth(0.25);
      doc.line(x + largRot, y + 1, fim, y + 1);
      x = fim + 5;
    }
    y += 8.5;
  };
  const linhasEmBranco = (n: number, passo = 7.5) => {
    for (let k = 0; k < n; k += 1) {
      quebrar(passo);
      y += passo;
      doc.setDrawColor(...LINHA);
      doc.setLineWidth(0.25);
      doc.line(MARGEM, y, DIREITA, y);
    }
    y += 3;
  };
  const link = (url: string) => {
    quebrar(6);
    fonte(10, "normal", AZUL);
    doc.textWithLink(url, MARGEM, y, { url });
    y += 5.5;
  };

  const prepararLinhas = (linhas: Linha[]): RowInput[] =>
    linhas.map((l) => l.map((c) => (typeof c === "string" ? latin(c) : { ...c, content: latin(c.content) })));
  const opcoesAutoTable = (o: OpcoesTabela, startY: number, esquerda: number, larguraTabela?: number) => {
    const marc = new Set(o.marcadores ?? []);
    const tam = o.tamanho ?? 9;
    return {
      startY,
      margin: { left: esquerda, right: MARGEM, top: MARGEM, bottom: 18 },
      tableWidth: larguraTabela ?? LARGURA,
      head: o.cabecalho ? [o.cabecalho.map(latin)] : undefined,
      body: prepararLinhas(o.linhas),
      theme: "grid" as const,
      styles: {
        font: "helvetica",
        fontSize: tam,
        cellPadding: o.recheio ?? 1.6,
        textColor: [30, 30, 30] as Cor,
        lineColor: LINHA,
        lineWidth: 0.2,
        valign: "middle" as const,
        minCellHeight: o.alturaLinha ?? 0,
      },
      headStyles: { fillColor: ESCURO, textColor: [255, 255, 255] as Cor, fontStyle: "bold" as const, fontSize: tam - 0.5, halign: (o.cabecalhoCentralizado ? "center" : "left") as Alinh },
      columnStyles: Object.fromEntries(
        (o.larguras ?? []).map((w, k) => [k, { cellWidth: w, halign: o.alinhamentos?.[k] ?? "left", fontStyle: (k === 0 && o.negritoPrimeiraColuna ? "bold" : "normal") as Estilo }]),
      ),
      didParseCell: (data: { section: string; column: { index: number }; cell: { text: string[] } }) => {
        if (data.section === "body" && marc.has(data.column.index)) data.cell.text = [""];
      },
      didDrawCell: (data: { section: string; column: { index: number }; cell: { x: number; y: number; width: number; height: number } }) => {
        if (data.section !== "body" || !marc.has(data.column.index)) return;
        const cx = data.cell.x + data.cell.width / 2;
        const cy = data.cell.y + data.cell.height / 2;
        doc.setDrawColor(120, 120, 120);
        doc.setLineWidth(0.3);
        doc.rect(cx - 1.6, cy - 1.6, 3.2, 3.2, "S");
      },
    };
  };
  const finalDaUltimaTabela = (): number => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;

  const tabela = (o: OpcoesTabela) => {
    quebrar(16);
    autoTable(doc, opcoesAutoTable(o, y, MARGEM));
    y = finalDaUltimaTabela() + 5;
  };
  /** Duas tabelas na mesma altura (questionários): não deixa o par começar se a estimativa não couber na página. */
  const tabelasLadoALado = (esq: OpcoesTabela, dir: OpcoesTabela | null, estimativa: number) => {
    quebrar(estimativa);
    const inicio = y;
    const larg = (LARGURA - 6) / 2;
    autoTable(doc, opcoesAutoTable(esq, inicio, MARGEM, larg));
    const f1 = finalDaUltimaTabela();
    let f2 = f1;
    if (dir) {
      autoTable(doc, opcoesAutoTable(dir, inicio, MARGEM + larg + 6, larg));
      f2 = finalDaUltimaTabela();
    }
    y = Math.max(f1, f2) + 4;
  };

  // ---- Cabeçalho comum ----
  fonte(9, "bold", [120, 120, 120]);
  doc.text("PHYSIQ · IMPRESSO", MARGEM, y);
  fonte(9, "normal", [120, 120, 120]);
  doc.text(latin(infoCategoria(impresso.categoria).rotulo.toUpperCase()), DIREITA, y, { align: "right" });
  y += 8;
  paragrafo(impresso.titulo, 16, "bold");
  y += 0.5;
  paragrafo(textoEmitido(ctx), 10, "normal", CINZA);
  y += 2;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(MARGEM, y, DIREITA, y);
  y += 6;

  /** Rodapé em todas as páginas ('Physiq · nome · data' + 'p/N'). */
  const finalizar = (): jsPDF => {
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p += 1) {
      doc.setPage(p);
      fonte(8, "normal", APAGADO);
      doc.text(latin(rodapeImpresso(ctx)), MARGEM, RODAPE + 5);
      doc.text(`${p}/${total}`, DIREITA, RODAPE + 5, { align: "right" });
    }
    return doc;
  };

  return { paragrafo, nota, secao, lista, campos, linhasEmBranco, link, tabela, tabelasLadoALado, espaco, quebrar, novaPagina, finalizar };
}
type Desenho = ReturnType<typeof novoDesenho>;

// =====================================================================================================================
// 1. Ficha de avaliação antropométrica
// =====================================================================================================================
const DATAS = ["Data ____/____/____", "Data ____/____/____", "Data ____/____/____"];

function fichaAntropometrica(d: Desenho) {
  d.secao("Identificação");
  d.campos([{ rotulo: "Paciente", largura: 100 }, { rotulo: "Nascimento", largura: 32 }]);
  d.campos([{ rotulo: "Sexo", largura: 20 }, { rotulo: "Idade", largura: 14 }, { rotulo: "Avaliador(a)", largura: 78 }]);
  d.secao("Medidas gerais e circunferências", "escreva a data no topo de cada coluna");
  d.tabela({
    cabecalho: ["Medida", ...DATAS],
    linhas: [
      vazias("Peso (kg)", 3),
      vazias("Altura (cm)", 3),
      vazias("IMC (kg/m²) = peso ÷ altura²", 3),
      vazias("Cintura (cm)", 3),
      vazias("Quadril (cm)", 3),
      vazias("Relação cintura/quadril", 3),
      vazias("Braço relaxado (cm)", 3),
      vazias("Braço contraído (cm)", 3),
      vazias("Coxa (cm)", 3),
      vazias("Panturrilha (cm)", 3),
      vazias("Pescoço (cm)", 3),
    ],
    larguras: [72, 36, 36, 36],
    alturaLinha: 6.4,
  });
  d.secao("Dobras cutâneas (mm)", "média de 3 medidas no mesmo ponto");
  d.tabela({
    cabecalho: ["Dobra", ...DATAS],
    linhas: [
      vazias("Tríceps", 3),
      vazias("Bíceps", 3),
      vazias("Subescapular", 3),
      vazias("Suprailíaca", 3),
      vazias("Abdominal", 3),
      vazias("Coxa", 3),
      vazias("Panturrilha", 3),
      vazias("Soma das dobras (mm)", 3),
      vazias("% de gordura — protocolo: ______________", 3),
    ],
    larguras: [72, 36, 36, 36],
    alturaLinha: 6.4,
  });
  d.secao("Observações");
  d.linhasEmBranco(2);
}

// =====================================================================================================================
// 2. Rastreamento metabólico (questionário de sintomas por sistema, 0–4)
// =====================================================================================================================
const SISTEMAS: { nome: string; itens: string[] }[] = [
  { nome: "Cabeça", itens: ["Dores de cabeça", "Sensação de desmaio", "Tontura", "Insônia"] },
  { nome: "Olhos", itens: ["Olhos lacrimejantes ou com coceira", "Olhos inchados ou vermelhos", "Bolsas ou olheiras", "Visão embaçada ou em túnel"] },
  { nome: "Ouvidos", itens: ["Coceira nos ouvidos", "Dor ou infecção de ouvido", "Secreção no ouvido", "Zumbido ou perda de audição"] },
  { nome: "Nariz", itens: ["Nariz entupido", "Sinusite", "Rinite ou espirros frequentes", "Excesso de muco", "Coriza"] },
  { nome: "Boca e garganta", itens: ["Tosse crônica", "Precisa limpar a garganta com frequência", "Dor de garganta ou rouquidão", "Língua, gengivas ou lábios inchados", "Aftas"] },
  { nome: "Pele", itens: ["Acne", "Urticária, erupções ou pele seca", "Queda de cabelo", "Rubor ou ondas de calor", "Suor excessivo"] },
  { nome: "Coração", itens: ["Batimentos irregulares ou falhos", "Batimentos acelerados", "Dor no peito"] },
  { nome: "Pulmões", itens: ["Congestão no peito", "Asma ou bronquite", "Falta de ar", "Dificuldade para respirar"] },
  { nome: "Sistema digestivo", itens: ["Náusea ou vômito", "Diarreia", "Constipação", "Distensão abdominal ou inchaço", "Gases ou arrotos", "Azia", "Dor intestinal ou estomacal"] },
  { nome: "Articulações e músculos", itens: ["Dor nas articulações", "Artrite", "Rigidez ou limitação de movimento", "Dor muscular", "Fraqueza ou cansaço muscular"] },
  { nome: "Peso", itens: ["Compulsão por comer ou beber", "Desejo intenso por certos alimentos", "Excesso de peso", "Retenção de líquidos", "Baixo peso"] },
  { nome: "Energia e atividade", itens: ["Fadiga ou lentidão", "Apatia, letargia", "Hiperatividade", "Inquietação"] },
  { nome: "Mente", itens: ["Memória fraca", "Confusão ou dificuldade de compreensão", "Dificuldade de concentração", "Dificuldade de coordenação motora", "Dificuldade para tomar decisões", "Fala arrastada ou gagueira"] },
  { nome: "Emoções", itens: ["Alterações de humor", "Ansiedade, medo ou nervosismo", "Raiva, irritabilidade ou agressividade", "Depressão"] },
  { nome: "Outros", itens: ["Adoece com frequência", "Urgência ou frequência urinária", "Coceira ou secreção genital"] },
];

function blocoSistema(s: { nome: string; itens: string[] }): OpcoesTabela {
  return {
    cabecalho: [s.nome, "0-4"],
    linhas: [
      ...s.itens.map((i): Linha => [i, ""]),
      [{ content: "Total do sistema", styles: { fontStyle: "bold", fillColor: FUNDO } }, { content: "", styles: { fillColor: FUNDO } }],
    ],
    larguras: [72, 15],
    alinhamentos: ["left", "center"],
    tamanho: 8,
    alturaLinha: 5,
    recheio: 0.9,
  };
}

function rastreamentoMetabolico(d: Desenho) {
  d.paragrafo(
    "Como preencher: para cada sintoma, marque a pontuação que melhor descreve os ÚLTIMOS 30 DIAS. Some os pontos de cada sistema e, no fim, o total geral.",
    9.5,
    "normal",
    CINZA,
  );
  d.espaco(1);
  d.paragrafo("Pontuação: 0 = nunca ou quase nunca · 1 = ocasional, efeito leve · 2 = ocasional, efeito intenso · 3 = frequente, efeito leve · 4 = frequente, efeito intenso.", 9, "bold", CINZA);
  d.espaco(3);
  d.campos([{ rotulo: "Paciente", largura: 104 }, { rotulo: "Data", largura: 32 }]);
  for (let k = 0; k < SISTEMAS.length; k += 2) {
    const esq = SISTEMAS[k];
    const dir = SISTEMAS[k + 1] ?? null;
    const linhas = Math.max(esq.itens.length, dir?.itens.length ?? 0) + 2;
    d.tabelasLadoALado(blocoSistema(esq), dir ? blocoSistema(dir) : null, linhas * 5.4 + 8);
  }
  d.espaco(2);
  d.tabela({
    cabecalho: ["Total geral (soma de todos os sistemas)", "Pontos"],
    linhas: [[{ content: "", styles: { fillColor: FUNDO } }, ""]],
    larguras: [140, 40],
    alinhamentos: ["left", "center"],
    alturaLinha: 9,
  });
  d.secao("Leitura orientativa do total geral");
  d.lista(
    [
      "Até 30 pontos: carga de sintomas baixa — acompanhar nas próximas consultas.",
      "31 a 60 pontos: carga moderada — investigar hábitos alimentares, sono, estresse e sinais de intolerâncias.",
      "61 a 100 pontos: carga alta — priorizar a investigação clínica e o acompanhamento próximo.",
      "Acima de 100 pontos: carga muito alta — avaliar encaminhamento e conduta em conjunto com a equipe de saúde.",
    ],
    9.5,
  );
  d.nota("Faixas usadas como triagem na prática clínica; interprete sempre junto da anamnese e dos exames. Este questionário não substitui diagnóstico médico.");
}

// =====================================================================================================================
// 3. Sinais e sintomas de carências nutricionais
// =====================================================================================================================
const GRUPOS_SINAIS: { regiao: string; itens: [string, string][] }[] = [
  {
    regiao: "Pele",
    itens: [
      ["Pele seca e descamativa", "Vitamina A, ácidos graxos essenciais, zinco"],
      ["Petéquias ou hematomas fáceis", "Vitamina C, vitamina K"],
      ["Dermatite seborreica", "Vitaminas B2 e B6, biotina, zinco"],
      ["Hiperqueratose folicular (pele áspera)", "Vitamina A, vitamina C"],
      ["Palidez", "Ferro, folato, vitamina B12"],
      ["Cicatrização lenta", "Zinco, vitamina C, proteínas"],
    ],
  },
  {
    regiao: "Cabelo",
    itens: [
      ["Queda difusa", "Ferro, zinco, proteínas, biotina"],
      ["Fino, quebradiço e sem brilho", "Proteínas, zinco, ácidos graxos essenciais"],
      ["Despigmentação em faixas", "Proteínas, cobre"],
    ],
  },
  {
    regiao: "Unhas",
    itens: [
      ["Unhas em colher (coiloníquia)", "Ferro"],
      ["Quebradiças e com estrias", "Ferro, zinco, biotina"],
      ["Manchas brancas", "Zinco (avaliar também trauma local)"],
    ],
  },
  {
    regiao: "Olhos",
    itens: [
      ["Dificuldade de ver no escuro", "Vitamina A"],
      ["Conjuntiva seca ou manchas esbranquiçadas", "Vitamina A"],
      ["Palidez da conjuntiva", "Ferro"],
      ["Vermelhidão ao redor da córnea", "Vitamina B2"],
    ],
  },
  {
    regiao: "Boca",
    itens: [
      ["Rachaduras nos cantos (queilite angular)", "Vitaminas B2, B6 e B3, ferro"],
      ["Língua lisa, inchada ou avermelhada (glossite)", "Vitaminas B2, B3 e B12, folato, ferro"],
      ["Gengivas inchadas e que sangram", "Vitamina C"],
      ["Perda ou alteração do paladar", "Zinco"],
      ["Aftas recorrentes", "Vitamina B12, folato, ferro"],
    ],
  },
  {
    regiao: "Sistêmicos",
    itens: [
      ["Fadiga e fraqueza", "Ferro, vitamina B12, folato, magnésio"],
      ["Cãibras e espasmos musculares", "Magnésio, cálcio, potássio"],
      ["Formigamento em mãos e pés", "Vitaminas B12, B1 e B6"],
      ["Dores ósseas ou fraqueza muscular proximal", "Vitamina D, cálcio"],
      ["Aumento da tireoide (bócio)", "Iodo"],
      ["Inchaço (edema)", "Proteínas, vitamina B1"],
      ["Infecções frequentes", "Zinco, vitamina A, vitamina C, proteínas"],
      ["Alterações de memória e humor", "Vitaminas B12 e B1, folato, ômega-3"],
      ["Intolerância ao frio", "Ferro, iodo"],
    ],
  },
];

function sinaisESintomas(d: Desenho) {
  d.paragrafo(
    "Durante o exame físico, marque o quadrinho dos sinais presentes. A coluna da direita traz as carências mais associadas a cada achado — são pistas para orientar a anamnese alimentar e os exames, não um diagnóstico.",
    9.5,
    "normal",
    CINZA,
  );
  d.espaco(2);
  d.campos([{ rotulo: "Paciente", largura: 104 }, { rotulo: "Data", largura: 32 }]);
  const linhas: Linha[] = [];
  for (const g of GRUPOS_SINAIS) {
    g.itens.forEach(([sinal, carencia], k) => {
      if (k === 0) linhas.push([{ content: g.regiao, rowSpan: g.itens.length, styles: { fontStyle: "bold", valign: "top" } }, sinal, carencia, ""]);
      else linhas.push([sinal, carencia, ""]);
    });
  }
  d.tabela({
    cabecalho: ["Região", "Sinal ou sintoma", "Possível carência relacionada", "Presente"],
    linhas,
    larguras: [22, 66, 78, 14],
    alinhamentos: ["left", "left", "left", "center"],
    marcadores: [3],
    tamanho: 8,
    alturaLinha: 5,
    recheio: 1,
  });
  d.nota("Sinais clínicos são inespecíficos e podem ter causas não nutricionais (medicamentos, doenças, fatores genéticos). Confirme com a anamnese alimentar e exames laboratoriais antes de qualquer conduta.");
  d.secao("Observações e conduta");
  d.linhasEmBranco(2);
}

// =====================================================================================================================
// 4. Código de ética — RESUMO em palavras próprias + link oficial (não reproduz o texto legal)
// =====================================================================================================================
function codigoDeEtica(d: Desenho) {
  d.paragrafo(
    "O Código de Ética e de Conduta do Nutricionista foi aprovado pela Resolução CFN nº 599, de 25 de fevereiro de 2018. Este impresso é um RESUMO em linguagem simples, feito para consulta rápida no consultório. Ele não substitui o texto oficial, que está disponível no site do Conselho Federal de Nutricionistas:",
    9.5,
    "normal",
    CINZA,
  );
  d.espaco(1);
  d.link(LINK_CFN);

  const T = 9; // listas um pouco menores pra caber numa página
  d.secao("Princípios que orientam a profissão");
  d.lista([
    "A alimentação adequada é um direito humano; a atuação do nutricionista serve à saúde, à segurança alimentar e ao bem-estar das pessoas.",
    "Exercer a profissão com competência técnica, atualização constante e condutas baseadas em evidências científicas.",
    "Respeitar a autonomia do paciente: informar, esclarecer e obter a concordância dele para as condutas propostas.",
    "Atender a todos sem discriminação de qualquer natureza e com respeito às diferenças culturais e alimentares.",
    "Guardar sigilo sobre tudo o que souber em razão do atendimento, inclusive dados registrados em sistemas.",
    "Agir com honestidade: não prometer resultados nem explorar a vulnerabilidade de quem procura ajuda.",
    "Não deixar interesses comerciais (marcas, suplementos, produtos) interferirem na conduta técnica.",
    "Colaborar com os demais profissionais de saúde e respeitar os limites de atuação de cada área.",
    "Manter registros e prontuários organizados, verdadeiros e acessíveis ao paciente quando solicitados.",
    "Zelar pela imagem da profissão, inclusive na comunicação pública e nas redes sociais.",
  ], T);

  d.secao("Deveres no dia a dia do consultório");
  d.lista([
    "Identificar-se com nome e número do CRN em todos os documentos que emitir.",
    "Individualizar a conduta: avaliação antes de qualquer prescrição — nada de plano padrão sem avaliar.",
    "Informar ao paciente os objetivos, os riscos, as alternativas e os custos do acompanhamento.",
    "Prescrever apenas o que está dentro das atribuições legais do nutricionista.",
    "Registrar a evolução do paciente e guardar os documentos pelo tempo previsto na legislação.",
    "Emitir atestados, declarações e laudos somente com base em avaliação realmente realizada.",
    "Garantir condições adequadas de higiene, privacidade e segurança no atendimento.",
  ], T);

  d.secao("O que o código veda");
  d.lista([
    "Divulgar ou prometer resultados garantidos; usar imagens de 'antes e depois' ou depoimentos de pacientes com finalidade sensacionalista ou publicitária.",
    "Indicar ou vender produtos em troca de vantagem que comprometa a independência da conduta.",
    "Divulgar dados ou imagens do paciente sem autorização expressa.",
    "Realizar, delegar ou encobrir atendimento feito por pessoa não habilitada.",
    "Usar títulos ou especialidades que não possui.",
    "Prescrever fora da competência do nutricionista (por exemplo, medicamentos).",
    "Praticar concorrência desleal ou captar pacientes por meios antiéticos.",
  ], T);

  d.secao("Publicidade e redes sociais — pontos de atenção");
  d.lista([
    "Conteúdo informativo e educativo, sempre com identificação profissional (nome e CRN).",
    "Sem autopromoção sensacionalista, preços-isca ou comparação depreciativa com colegas.",
    "Imagens de pacientes só com autorização por escrito e nunca associadas a resultados garantidos.",
    "Parcerias comerciais devem ser transparentes e não podem orientar a conduta clínica.",
  ], T);

  d.secao("Infrações e penalidades");
  d.paragrafo(
    "Denúncias são apuradas pelos Conselhos Regionais (CRN) em processo ético, com direito de defesa. As penalidades vão da advertência à cassação do registro profissional, conforme a gravidade e a reincidência.",
    9.5,
  );
  d.espaco(2);
  d.nota("Resumo elaborado pela equipe do Physiq para uso interno do consultório. Em caso de dúvida, vale o texto oficial da Resolução CFN nº 599/2018 e as orientações do seu CRN.");
}

// =====================================================================================================================
// 5. Checklist diário de higienização
// =====================================================================================================================
const ITENS_HIGIENIZACAO = [
  "Higienizar as mãos ao iniciar o turno; conferir álcool 70% disponível",
  "Limpar e desinfetar a mesa de atendimento e superfícies de contato",
  "Higienizar balança, estadiômetro e adipômetro após cada uso",
  "Limpar fita métrica e demais materiais de avaliação",
  "Desinfetar maçanetas, interruptores, teclado e mouse",
  "Repor sabonete líquido, papel toalha e álcool em gel",
  "Esvaziar lixeiras e trocar os sacos",
  "Limpar o piso da sala e da recepção",
  "Higienizar o banheiro (vaso, pia, espelho) e repor insumos",
  "Limpar o refrigerador por dentro e conferir a organização",
  "Conferir validade dos produtos de limpeza e dos insumos",
  "Ventilar a sala e conferir climatização e filtros",
];

function checklistHigienizacao(d: Desenho) {
  d.paragrafo(
    "Marque o quadrinho quando o item estiver concluído no turno; deixe em branco quando não se aplicar naquele dia e anote o motivo em observações.",
    9.5,
    "normal",
    CINZA,
  );
  d.espaco(2);
  d.campos([{ rotulo: "Semana de", largura: 24 }, { rotulo: "a", largura: 24 }, { rotulo: "Setor / sala", largura: 40 }, { rotulo: "Responsável", largura: 40 }]);
  const linhas: Linha[] = [];
  for (const item of ITENS_HIGIENIZACAO) {
    linhas.push([{ content: item, rowSpan: 2, styles: { valign: "middle" } }, "Manhã", "", "", "", "", "", "", ""]);
    linhas.push(["Tarde", "", "", "", "", "", "", ""]);
  }
  d.tabela({
    cabecalho: ["Item de higienização", "Turno", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"],
    linhas,
    larguras: [74, 15, 13, 13, 13, 13, 13, 13, 13],
    alinhamentos: ["left", "left", "center", "center", "center", "center", "center", "center", "center"],
    marcadores: [2, 3, 4, 5, 6, 7, 8],
    tamanho: 8.5,
    alturaLinha: 5.2,
    recheio: 0.9,
  });
  d.campos([{ rotulo: "Conferido por", largura: 70 }, { rotulo: "Visto", largura: 40 }]);
  d.nota("Use os produtos e diluições indicados pelo fabricante e registre qualquer não conformidade (falta de insumo, equipamento com defeito, item não realizado) nas observações.");
  d.secao("Observações da semana");
  d.linhasEmBranco(2);
}

// =====================================================================================================================
// 6. Controle de temperatura de equipamentos
// =====================================================================================================================
function controleTemperatura(d: Desenho) {
  d.paragrafo(
    "Meça e registre a temperatura de cada equipamento duas vezes ao dia (M = manhã, T = tarde), sempre no mesmo horário. Leitura fora da faixa: anote a ação corretiva e o visto de quem agiu.",
    9.5,
    "normal",
    CINZA,
  );
  d.espaco(2);
  d.campos([{ rotulo: "Mês / ano", largura: 30 }, { rotulo: "Setor", largura: 44 }, { rotulo: "Responsável", largura: 52 }]);
  d.campos([{ rotulo: "Termômetro (identificação)", largura: 44 }, { rotulo: "Última calibração", largura: 32 }]);
  d.secao("Equipamentos e faixas ideais", "anote a identificação de cada um");
  d.tabela({
    cabecalho: ["Nº", "Equipamento", "Faixa ideal", "Identificação (marca / local)"],
    linhas: [
      ["1", "Refrigerador", "0 °C a 5 °C", ""],
      ["2", "Freezer", "-18 °C ou menos", ""],
      ["3", "Estufa / banho-maria (alimentos quentes)", "60 °C ou mais", ""],
      ["", "Balcão ou expositor refrigerado", "até 5 °C", ""],
      ["", "", "", ""],
    ],
    larguras: [10, 70, 40, 60],
    alturaLinha: 6.5,
  });
  d.secao("Quando a leitura sair da faixa");
  d.lista(
    [
      "Conferir se a porta ficou aberta ou se o equipamento está sobrecarregado; ajustar o termostato.",
      "Redistribuir os alimentos; se a temperatura não voltar à faixa, transferir para outro equipamento.",
      "Descartar itens que ficaram fora da faixa por tempo que comprometa a segurança e registrar o descarte.",
      "Acionar a manutenção e anotar a data do chamado.",
    ],
    9.5,
  );
  d.nota("Termômetros devem ser calibrados periodicamente. Faixas de referência baseadas nas boas práticas de manipulação de alimentos; adapte às exigências da vigilância sanitária local.");
  const linhas: Linha[] = Array.from({ length: 31 }, (_, k) => [String(k + 1), "", "", "", "", "", "", ""]);
  d.quebrar(31 * 5.6 + 22);
  d.secao("Registro diário", "temperatura em °C");
  d.tabela({
    cabecalho: ["Dia", "Equip. 1 - M", "Equip. 1 - T", "Equip. 2 - M", "Equip. 2 - T", "Equip. 3 - M", "Equip. 3 - T", "Fora da faixa? Ação corretiva / visto"],
    linhas,
    larguras: [10, 17, 17, 17, 17, 17, 17, 68],
    alinhamentos: ["center", "center", "center", "center", "center", "center", "center", "left"],
    tamanho: 8,
    alturaLinha: 5.6,
    cabecalhoCentralizado: true,
  });
}

// =====================================================================================================================
// 7. Ficha técnica de preparação
// =====================================================================================================================
function fichaTecnica(d: Desenho) {
  d.secao("Identificação da preparação");
  d.campos([{ rotulo: "Nome da preparação", largura: 96 }, { rotulo: "Código", largura: 22 }]);
  d.campos([{ rotulo: "Categoria", largura: 60 }, { rotulo: "Rendimento total (g ou mL)", largura: 40 }]);
  d.campos([{ rotulo: "Nº de porções", largura: 20 }, { rotulo: "Peso da porção (g)", largura: 28 }, { rotulo: "Tempo de preparo", largura: 28 }]);
  d.campos([{ rotulo: "Custo total (R$)", largura: 44 }, { rotulo: "Custo por porção (R$)", largura: 44 }]);
  d.secao("Ingredientes");
  d.tabela({
    cabecalho: ["Ingrediente", "Per capita bruto (g)", "Per capita líquido (g)", "Fator de correção", "Medida caseira", "Custo (R$)"],
    linhas: Array.from({ length: 12 }, () => ["", "", "", "", "", ""]),
    larguras: [58, 26, 26, 22, 28, 20],
    alinhamentos: ["left", "center", "center", "center", "left", "right"],
    tamanho: 8.5,
    alturaLinha: 6.6,
    cabecalhoCentralizado: true,
  });
  d.nota("Fator de correção (FC) = peso bruto ÷ peso líquido. Fator de cocção (FCy) = peso cozido ÷ peso cru. Per capita = quantidade por porção.");
  d.secao("Modo de preparo");
  d.linhasEmBranco(8);
  d.secao("Valor nutricional por porção");
  d.tabela({
    cabecalho: ["Energia (kcal)", "Proteínas (g)", "Carboidratos (g)", "Lipídios (g)", "Fibras (g)", "Sódio (mg)"],
    linhas: [["", "", "", "", "", ""]],
    larguras: [30, 30, 30, 30, 30, 30],
    alinhamentos: ["center", "center", "center", "center", "center", "center"],
    alturaLinha: 9,
    cabecalhoCentralizado: true,
  });
  d.campos([{ rotulo: "Fonte dos dados", largura: 60 }, { rotulo: "Elaborado por", largura: 52 }, { rotulo: "Data", largura: 24 }]);
  d.secao("Observações");
  d.linhasEmBranco(2);
}

// =====================================================================================================================
const GERADORES: Record<string, (d: Desenho) => void> = {
  "ficha-antropometrica": fichaAntropometrica,
  "rastreamento-metabolico": rastreamentoMetabolico,
  "sinais-e-sintomas": sinaisESintomas,
  [ID_CODIGO_ETICA]: codigoDeEtica,
  "checklist-higienizacao": checklistHigienizacao,
  "controle-temperatura": controleTemperatura,
  "ficha-tecnica": fichaTecnica,
};

/** Gera o impresso pedido (cabeçalho e rodapé comuns + conteúdo próprio). Lança erro em id desconhecido. */
export function gerarImpresso(id: string, ctx: ContextoImpresso): jsPDF {
  const impresso = impressoPorId(id);
  const gerar = GERADORES[id];
  if (!impresso || !gerar) throw new Error(`Impresso desconhecido: ${id}`);
  const d = novoDesenho(impresso, ctx);
  gerar(d);
  return d.finalizar();
}

/** Gera e baixa; devolve o nome do arquivo (`physiq-<id>-<data>.pdf`). */
export function baixarImpresso(id: string, ctx: ContextoImpresso): string {
  const nome = nomeArquivo(id, ctx.data);
  gerarImpresso(id, ctx).save(nome);
  return nome;
}

/** Abre o PDF numa aba nova (blob URL). Pop-up bloqueado → cai no download (`aberto: false`). */
export function abrirImpresso(id: string, ctx: ContextoImpresso): { nome: string; aberto: boolean } {
  const nome = nomeArquivo(id, ctx.data);
  const doc = gerarImpresso(id, ctx);
  const url = String(doc.output("bloburl"));
  const aba = typeof window !== "undefined" ? window.open(url, "_blank") : null;
  if (!aba) {
    doc.save(nome);
    return { nome, aberto: false };
  }
  return { nome, aberto: true };
}
