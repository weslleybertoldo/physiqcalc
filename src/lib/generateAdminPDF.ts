import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  desenharCabecalho, desenharTituloSecao, desenharCard,
  desenharRodape, novaPagina, estiloTabela, hexToRgb,
  TEMA, limparTexto,
} from "@/utils/gerarRelatorio";
import { classificarGordura } from "@/utils/composicaoCorporal";
import { agoraFormatado, formatarDataCurta, calcularIdade } from "@/utils/formatDate";
import { MEDIDA_FIELDS, MEDIDA_GROUPS } from "@/lib/medidas";

export interface AdminProfile {
  nome: string | null;
  email: string | null;
  sexo: string | null;
  idade: number | null;
  data_nascimento: string | null;
  peso: number | null;
  altura: number | null;
  percentual_gordura: number | null;
  massa_gorda: number | null;
  massa_magra: number | null;
  tmb_mifflin: number | null;
  tmb_katch: number | null;
  tmb_metodo: string | null;
  nivel_atividade: number | null;
  ajuste_calorico: number | null;
  macro_proteina_multiplicador: number | null;
  macro_gordura_percentual: number | null;
  user_code: number | null;
  [key: string]: any;
}

export interface Avaliacao {
  created_at: string | null;
  data_avaliacao: string;
  peso: number | null;
  altura: number | null;
  percentual_gordura: number | null;
  massa_gorda: number | null;
  massa_magra: number | null;
  tmb_mifflin: number | null;
  tmb_katch: number | null;
  [key: string]: any;
}

const ACTIVITY_LABELS: Record<number, string> = {
  1.2: "Sedentario",
  1.375: "Levemente ativo",
  1.55: "Moderadamente ativo",
  1.725: "Muito ativo",
  1.9: "Atleta / dupla sessao",
};

export function generateAdminPDF(profile: AdminProfile, avaliacoes?: Avaliacao[]) {
  const doc = new jsPDF();
  const W = doc.internal.pageSize.getWidth();

  const name = limparTexto(profile.nome?.trim() || "Usuario");
  const idadeEfetiva = profile.data_nascimento
    ? calcularIdade(profile.data_nascimento)
    : (profile.idade ?? null);

  let y = desenharCabecalho(
    doc,
    'Relatorio do Aluno',
    `${name} - ID: ${profile.user_code || ""} - ${agoraFormatado({ formato: 'longo' })}`
  );

  // Dados Pessoais
  y = desenharTituloSecao(doc, 'Dados Pessoais', y);
  const cW = (W - 28 - 8) / 3;
  if (profile.peso) desenharCard(doc, 'Peso', `${profile.peso} kg`, 14, y, cW, 18);
  if (profile.altura) desenharCard(doc, 'Altura', `${profile.altura} cm`, 14 + cW + 4, y, cW, 18);
  if (idadeEfetiva) desenharCard(doc, 'Idade', `${idadeEfetiva} anos`, 14 + cW * 2 + 8, y, cW, 18);
  y += 22;

  // Composição Corporal
  if (profile.percentual_gordura) {
    y = desenharTituloSecao(doc, 'Composicao Corporal', y);
    desenharCard(doc, '% Gordura', `${Number(profile.percentual_gordura).toFixed(1)}%`, 14, y, cW, 18, TEMA.amarelo);
    if (profile.massa_gorda) desenharCard(doc, 'Massa Gorda', `${Number(profile.massa_gorda).toFixed(1)} kg`, 14 + cW + 4, y, cW, 18);
    if (profile.massa_magra) desenharCard(doc, 'Massa Magra', `${Number(profile.massa_magra).toFixed(1)} kg`, 14 + cW * 2 + 8, y, cW, 18, TEMA.verde);
    y += 22;

    // Classificação
    const sexo = profile.sexo === "male" ? "M" : "F";
    const cls = classificarGordura(Number(profile.percentual_gordura), sexo as "M" | "F", idadeEfetiva || 25);
    desenharCard(doc, 'Classificacao', limparTexto(cls.label), 14, y, W - 28, 18, cls.cor);
    y += 22;

    // TMB
    y = desenharTituloSecao(doc, 'Taxa Metabolica Basal', y);
    const hW = (W - 28 - 4) / 2;
    if (profile.tmb_mifflin) desenharCard(doc, 'TMB Mifflin-St Jeor', `${Math.round(Number(profile.tmb_mifflin))} kcal/dia`, 14, y, hW, 18);
    if (profile.tmb_katch) desenharCard(doc, 'TMB Katch-McArdle', `${Math.round(Number(profile.tmb_katch))} kcal/dia`, 14 + hW + 4, y, hW, 18);
    y += 22;
  }

  // Macros
  const baseTmb = profile.tmb_metodo === "katch" && profile.tmb_katch ? profile.tmb_katch : profile.tmb_mifflin;
  const actFactor = Number(profile.nivel_atividade ?? 1.55);
  const baseCalories = baseTmb ? Math.round(Number(baseTmb) * actFactor) : null;
  const ajuste = profile.ajuste_calorico ?? 0;
  const total = baseCalories ? baseCalories + ajuste : null;

  if (total && profile.peso) {
    y = desenharTituloSecao(doc, 'Macronutrientes', y);

    const tmbLabel = profile.tmb_metodo === "katch" ? "Katch-McArdle" : "Mifflin-St Jeor";
    const actLabel = ACTIVITY_LABELS[actFactor] || `x${actFactor}`;
    let metaStr: string;
    if (ajuste !== 0) {
      const sign = ajuste >= 0 ? "+" : "-";
      metaStr = `${baseCalories} (base) ${sign} ${Math.abs(ajuste)} = ${total} kcal/dia`;
    } else {
      metaStr = `${total} kcal/dia`;
    }

    desenharCard(doc, `Meta calorica - ${tmbLabel} x ${actLabel}`, metaStr, 14, y, W - 28, 18, TEMA.amarelo);
    y += 22;

    const pm = Number(profile.macro_proteina_multiplicador ?? 2.2);
    const fp = Number(profile.macro_gordura_percentual ?? 15);
    const peso = Number(profile.peso);
    const protG = pm * peso, protK = protG * 4;
    const fatK = total * (fp / 100), fatG = fatK / 9;
    const carbK = total - protK - fatK, carbG = carbK / 4;
    const totalK = protK + fatK + carbK;

    const mW = (W - 28 - 8) / 3;
    desenharCard(doc, `Proteina (${(protK / totalK * 100).toFixed(1)}%)`, `${protG.toFixed(1)}g`, 14, y, mW, 18);
    desenharCard(doc, `Gordura (${(fatK / totalK * 100).toFixed(1)}%)`, `${fatG.toFixed(1)}g`, 14 + mW + 4, y, mW, 18);
    desenharCard(doc, `Carboidrato (${(carbK / totalK * 100).toFixed(1)}%)`, `${carbG.toFixed(1)}g`, 14 + mW * 2 + 8, y, mW, 18);
    y += 22;
  }

  // Medidas Corporais
  const medidasPreenchidas = MEDIDA_FIELDS.filter(f => profile[f.key] != null && Number(profile[f.key]) > 0);
  if (medidasPreenchidas.length > 0) {
    if (y > 220) { y = novaPagina(doc); }
    y = desenharTituloSecao(doc, 'Medidas Corporais (cm)', y);

    for (const group of MEDIDA_GROUPS) {
      const fields = medidasPreenchidas.filter(f => f.group === group.key);
      if (fields.length === 0) continue;

      const mW = (W - 28 - (fields.length - 1) * 4) / Math.min(fields.length, 3);
      let col = 0;
      for (const f of fields) {
        if (y > 260) { y = novaPagina(doc); }
        const x = 14 + col * (mW + 4);
        desenharCard(doc, f.label, `${Number(profile[f.key]).toFixed(1)} cm`, x, y, mW, 16);
        col++;
        if (col >= 3) { col = 0; y += 20; }
      }
      if (col > 0) y += 20;
    }
  }

  // Evolução — Histórico de Avaliações
  if (avaliacoes && avaliacoes.length > 0) {
    if (y > 200) { y = novaPagina(doc); }
    y = desenharTituloSecao(doc, 'Evolucao - Historico de Avaliacoes', y);

    if (avaliacoes.length === 1) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...hexToRgb(TEMA.cinzaMedio));
      doc.text("Apenas uma avaliacao registrada - comparativo disponivel a partir da segunda avaliacao.", 14, y + 2);
      y += 10;
    }

    const sexo = (profile.sexo === "male" ? "M" : "F") as "M" | "F";

    autoTable(doc, {
      startY: y,
      head: [['Data', 'Peso', '% Gordura', 'M. Gorda', 'M. Magra', 'Classificacao']],
      body: avaliacoes.map(a => {
        const pct = a.percentual_gordura;
        const cls = pct ? classificarGordura(Number(pct), sexo, idadeEfetiva || 25) : null;
        return [
          formatarDataCurta(a.data_avaliacao || a.created_at?.split('T')[0]),
          a.peso ? `${a.peso} kg` : '-',
          pct ? `${Number(pct).toFixed(1)}%` : '-',
          a.massa_gorda ? `${Number(a.massa_gorda).toFixed(1)} kg` : '-',
          a.massa_magra ? `${Number(a.massa_magra).toFixed(1)} kg` : '-',
          cls ? limparTexto(cls.label) : '-',
        ];
      }),
      ...estiloTabela(),
      margin: { left: 14, right: 14 },
      didParseCell: (data: any) => {
        if (data.column.index === 5 && data.section === 'body') {
          const av = avaliacoes[data.row.index];
          if (av?.percentual_gordura) {
            const cls = classificarGordura(Number(av.percentual_gordura), sexo, idadeEfetiva || 25);
            data.cell.styles.textColor = hexToRgb(cls.cor);
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  desenharRodape(doc, 'Formulas: Mifflin-St Jeor - Jackson & Pollock - Katch-McArdle');

  const safeName = (profile.nome?.trim() || "Usuario").replace(/[^a-zA-Z0-9 ]/g, "");
  doc.save(`PhysiqCalc-${safeName}-${profile.user_code || ""}.pdf`);
}
