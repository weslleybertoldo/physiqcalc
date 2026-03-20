import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  desenharCabecalho, desenharTituloSecao, desenharCard,
  desenharRodape, novaPagina, estiloTabela, hexToRgb,
  TEMA, limparTexto,
} from "@/utils/gerarRelatorio";
import { classificarGordura } from "@/utils/composicaoCorporal";
import { agoraFormatado } from "@/utils/formatDate";
import { MedidasCorporais } from "@/types/medidas";
import { MEDIDA_FIELDS, MEDIDA_GROUPS } from "@/lib/medidas";

export interface ReportData {
  name: string;
  gender: "male" | "female";
  age: number;
  height: number;
  weight: number;
  tmbMifflin: number | null;
  bodyFatResult: { bf: number; tmbKatch: number } | null;
  macros: {
    totalCalories: number;
    baseCalories: number;
    calorieAdjust: number;
    calorieSource: string;
    tmbSourceLabel: string;
    activityLabel: string;
    proteinG: number;
    proteinKcal: number;
    proteinPct: number;
    fatG: number;
    fatKcal: number;
    fatPct: number;
    carbG: number;
    carbKcal: number;
    carbPct: number;
  } | null;
  medidas?: MedidasCorporais;
  dobras?: { labels: string[]; values: number[] };
}

const ACTIVITY_LEVELS = [
  { label: "Sedentario", mult: 1.2 },
  { label: "Levemente ativo", mult: 1.375 },
  { label: "Moderadamente ativo", mult: 1.55 },
  { label: "Muito ativo", mult: 1.725 },
  { label: "Atleta / dupla sessao", mult: 1.9 },
];

const MEDIDA_KEY_MAP: Record<string, keyof MedidasCorporais> = {
  medida_pescoco: "pescoco",
  medida_ombro: "ombro",
  medida_peitoral: "peitoral",
  medida_cintura: "cintura",
  medida_abdomen: "abdomen",
  medida_quadril: "quadril",
  medida_braco_d: "bracoD",
  medida_braco_e: "bracoE",
  medida_antebraco_d: "antebracoD",
  medida_antebraco_e: "antebracoE",
  medida_coxa_d: "coxaD",
  medida_coxa_e: "coxaE",
  medida_panturrilha_d: "panturrilhaD",
  medida_panturrilha_e: "panturrilhaE",
};

export function generateReport(data: ReportData) {
  const doc = new jsPDF();
  const W = doc.internal.pageSize.getWidth();

  const subtitle = data.name.trim()
    ? `${limparTexto(data.name.trim())} - ${data.gender === "male" ? "Masculino" : "Feminino"}, ${data.age} anos - ${agoraFormatado({ formato: 'longo' })}`
    : `Composicao Corporal - ${agoraFormatado({ formato: 'longo' })}`;

  let y = desenharCabecalho(doc, 'Composicao Corporal', subtitle);

  // Dados Pessoais
  y = desenharTituloSecao(doc, 'Dados Pessoais', y);
  const cW = (W - 28 - 8) / 3;
  desenharCard(doc, 'Peso', `${data.weight} kg`, 14, y, cW, 18);
  desenharCard(doc, 'Altura', `${data.height} cm`, 14 + cW + 4, y, cW, 18);
  desenharCard(doc, 'Idade', `${data.age} anos`, 14 + cW * 2 + 8, y, cW, 18);
  y += 22;

  // TMB Mifflin
  if (data.tmbMifflin) {
    y = desenharTituloSecao(doc, 'Taxa Metabolica Basal - Mifflin-St Jeor', y);
    desenharCard(doc, 'TMB Mifflin-St Jeor', `${Math.round(data.tmbMifflin)} kcal/dia`, 14, y, W - 28, 18);
    y += 22;
  }

  // Medidas Corporais
  if (data.medidas) {
    const filled = MEDIDA_FIELDS.filter(f => {
      const mKey = MEDIDA_KEY_MAP[f.key];
      return mKey && data.medidas![mKey] !== '' && data.medidas![mKey] !== 0 && data.medidas![mKey] != null;
    });

    if (filled.length > 0) {
      if (y > 220) { y = novaPagina(doc); }
      y = desenharTituloSecao(doc, 'Medidas Corporais (cm)', y);

      for (const group of MEDIDA_GROUPS) {
        const fields = filled.filter(f => f.group === group.key);
        if (fields.length === 0) continue;
        const mW = (W - 28 - (Math.min(fields.length, 3) - 1) * 4) / Math.min(fields.length, 3);
        let col = 0;
        for (const f of fields) {
          if (y > 260) { y = novaPagina(doc); }
          const x = 14 + col * (mW + 4);
          const mKey = MEDIDA_KEY_MAP[f.key];
          desenharCard(doc, f.label, `${Number(data.medidas![mKey]).toFixed(1)} cm`, x, y, mW, 16);
          col++;
          if (col >= 3) { col = 0; y += 20; }
        }
        if (col > 0) y += 20;
      }
    }
  }

  // Dobras Cutâneas + Composição Corporal
  if (data.bodyFatResult) {
    if (y > 200) { y = novaPagina(doc); }
    y = desenharTituloSecao(doc, 'Calculo de % Gordura - Dobras Cutaneas', y);

    // Show fold values if available
    if (data.dobras && data.dobras.values.length > 0) {
      const fW = (W - 28 - (data.dobras.values.length - 1) * 4) / Math.min(data.dobras.values.length, 4);
      let col = 0;
      for (let i = 0; i < data.dobras.values.length; i++) {
        const x = 14 + col * (fW + 4);
        desenharCard(doc, data.dobras.labels[i], `${data.dobras.values[i]} mm`, x, y, fW, 16);
        col++;
        if (col >= 4) { col = 0; y += 20; }
      }
      if (col > 0) y += 20;
    }

    // Body fat results
    const fatMass = data.weight * (data.bodyFatResult.bf / 100);
    const leanMass = data.weight - fatMass;
    desenharCard(doc, '% Gordura', `${data.bodyFatResult.bf.toFixed(1)}%`, 14, y, cW, 18, TEMA.amarelo);
    desenharCard(doc, 'Massa Gorda', `${fatMass.toFixed(1)} kg`, 14 + cW + 4, y, cW, 18);
    desenharCard(doc, 'Massa Magra', `${leanMass.toFixed(1)} kg`, 14 + cW * 2 + 8, y, cW, 18, TEMA.verde);
    y += 22;

    // Classificação
    const sexo = data.gender === "male" ? "M" : "F";
    const cls = classificarGordura(data.bodyFatResult.bf, sexo as "M" | "F", data.age);
    desenharCard(doc, 'Classificacao (Gallagher 2000)', limparTexto(cls.label), 14, y, W - 28, 18, cls.cor);
    y += 22;

    // TMB Katch-McArdle + TDEE
    if (y > 200) { y = novaPagina(doc); }
    y = desenharTituloSecao(doc, 'TMB Especifico - Katch-McArdle + TDEE', y);
    desenharCard(doc, 'TMB Katch-McArdle', `${Math.round(data.bodyFatResult.tmbKatch)} kcal/dia`, 14, y, W - 28, 18, TEMA.amarelo);
    y += 22;

    // TDEE table
    autoTable(doc, {
      startY: y,
      head: [['Nivel de Atividade', 'Multiplicador', 'TDEE']],
      body: ACTIVITY_LEVELS.map(l => [
        l.label,
        `x ${l.mult}`,
        `${Math.round(data.bodyFatResult!.tmbKatch * l.mult)} kcal/dia`,
      ]),
      ...estiloTabela(),
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Macronutrientes
  if (data.macros) {
    if (y > 220) { y = novaPagina(doc); }
    y = desenharTituloSecao(doc, 'Macronutrientes', y);

    const adj = data.macros.calorieAdjust;
    let metaStr: string;
    if (adj !== 0) {
      const sign = adj >= 0 ? "+" : "-";
      metaStr = `${Math.round(data.macros.baseCalories)} (base) ${sign} ${Math.abs(adj)} = ${Math.round(data.macros.totalCalories)} kcal/dia`;
    } else {
      metaStr = `${Math.round(data.macros.totalCalories)} kcal/dia`;
    }

    desenharCard(doc, `Meta calorica - ${limparTexto(data.macros.tmbSourceLabel)} x ${limparTexto(data.macros.activityLabel)}`, metaStr, 14, y, W - 28, 18, TEMA.amarelo);
    y += 22;

    const mW = (W - 28 - 8) / 3;
    desenharCard(doc, 'Proteina', `${data.macros.proteinG.toFixed(1)}g (${data.macros.proteinPct.toFixed(1)}%)`, 14, y, mW, 18);
    desenharCard(doc, 'Gordura', `${data.macros.fatG.toFixed(1)}g (${data.macros.fatPct.toFixed(1)}%)`, 14 + mW + 4, y, mW, 18);
    desenharCard(doc, 'Carboidrato', `${data.macros.carbG.toFixed(1)}g (${data.macros.carbPct.toFixed(1)}%)`, 14 + mW * 2 + 8, y, mW, 18);
    y += 22;
  }

  // Tabela de Referência — % Gordura Corporal
  if (y > 200) { y = novaPagina(doc); }
  y = desenharTituloSecao(doc, 'Tabela de Referencia - % Gordura Corporal', y);

  const refData = [
    ['Gordura Essencial', '< 5%', '< 10%', '#ef4444'],
    ['Atleta', '5% - 13%', '10% - 20%', '#22c55e'],
    ['Boa Forma', '14% - 17%', '21% - 24%', '#4ade80'],
    ['Aceitavel', '18% - 24%', '25% - 31%', '#facc15'],
    ['Obesidade', '> 25%', '> 32%', '#f97316'],
  ];

  const sexo = data.gender === "male" ? "M" : "F";
  const userCls = data.bodyFatResult
    ? classificarGordura(data.bodyFatResult.bf, sexo as "M" | "F", data.age)
    : null;

  autoTable(doc, {
    startY: y,
    head: [['Classificacao', 'Masculino', 'Feminino']],
    body: refData.map(r => [r[0], r[1], r[2]]),
    ...estiloTabela(),
    margin: { left: 14, right: 14 },
    didParseCell: (cellData: any) => {
      if (cellData.section === 'body') {
        const rowLabel = refData[cellData.row.index][0];
        // Highlight the row matching user's classification
        if (userCls && limparTexto(userCls.label) === rowLabel) {
          cellData.cell.styles.fillColor = hexToRgb('#1a1a1a');
          cellData.cell.styles.textColor = hexToRgb(refData[cellData.row.index][3]);
          cellData.cell.styles.fontStyle = 'bold';
        }
        // Color the classification name column
        if (cellData.column.index === 0) {
          cellData.cell.styles.textColor = hexToRgb(refData[cellData.row.index][3]);
        }
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  doc.setFontSize(6);
  doc.setTextColor(...hexToRgb(TEMA.cinzaEscuro));
  doc.setFont('helvetica', 'italic');
  doc.text('Gallagher et al. (2000) | ACE | Lohman TG (1993) | ACSM', 14, y + 2);

  desenharRodape(doc, 'Formulas: Mifflin-St Jeor - Jackson & Pollock - Katch-McArdle');

  const safeName = data.name.trim()
    ? `Relatorio de macros do ${data.name.trim().replace(/[^a-zA-Z0-9 ]/g, "")}`
    : "Relatorio de macros";
  doc.save(`${safeName}.pdf`);
}
