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
import { dadosBalanca, rotuloMetodo, tmbEscolhida } from "@/lib/avaliacao";

// texto do PDF sem emoji e sem acento (mesmo padrão dos títulos: "Composicao Corporal")
const pdfTexto = (t: string) => limparTexto(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "");

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

  // Composição Corporal (tipo de avaliação no título; na bioimpedância, os dados da balança)
  if (profile.percentual_gordura) {
    y = desenharTituloSecao(doc, `Composicao Corporal - ${pdfTexto(rotuloMetodo(profile.metodo_avaliacao))}`, y);
    desenharCard(doc, '% Gordura', `${Number(profile.percentual_gordura).toFixed(1)}%`, 14, y, cW, 18, TEMA.amarelo);
    if (profile.massa_gorda) desenharCard(doc, 'Massa Gorda', `${Number(profile.massa_gorda).toFixed(1)} kg`, 14 + cW + 4, y, cW, 18);
    if (profile.massa_magra) desenharCard(doc, 'Massa Magra', `${Number(profile.massa_magra).toFixed(1)} kg`, 14 + cW * 2 + 8, y, cW, 18, TEMA.verde);
    y += 22;

    // Classificação
    const sexo = profile.sexo === "male" ? "M" : "F";
    const cls = classificarGordura(Number(profile.percentual_gordura), sexo as "M" | "F", idadeEfetiva || 25);
    const balanca = dadosBalanca(profile);
    if (balanca.length > 0) {
      balanca.forEach((d, i) => desenharCard(doc, pdfTexto(d.label), pdfTexto(d.valor), 14 + i * (cW + 4), y, cW, 18));
      y += 22;
    }

    desenharCard(doc, 'Classificacao', limparTexto(cls.label), 14, y, W - 28, 18, cls.cor);
    y += 22;

    // TMB: só a que o professor escolheu
    const tmb = tmbEscolhida(profile);
    if (tmb.valor !== null) {
      y = desenharTituloSecao(doc, 'Taxa Metabolica Basal', y);
      desenharCard(doc, `TMB ${pdfTexto(tmb.label)}`, `${Math.round(tmb.valor)} kcal/dia`, 14, y, W - 28, 18);
      y += 22;
    }
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
      head: [['Data', 'Tipo', 'Peso', '% Gordura', 'M. Gorda', 'M. Magra', 'Classificacao']],
      body: avaliacoes.map(a => {
        const pct = a.percentual_gordura;
        const cls = pct ? classificarGordura(Number(pct), sexo, idadeEfetiva || 25) : null;
        return [
          formatarDataCurta(a.data_avaliacao || a.created_at?.split('T')[0]),
          pdfTexto(rotuloMetodo(a.metodo_avaliacao)),
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
        if (data.column.index === 6 && data.section === 'body') {
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
