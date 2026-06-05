import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  desenharCabecalho, desenharTituloSecao, desenharCard,
  desenharRodape, novaPagina, estiloTabela, hexToRgb,
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

export interface WorkoutDia {
  dia_semana: string;
  grupo_nome: string;
  exercicios: { nome: string; grupo_muscular: string | null }[];
}

// Decisão #0: sem prescrição no schema → padrão genérico de hipertrofia.
const SERIES_PADRAO = "3 × 8-12";

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

export function generateWorkoutPlanPDF(profile: WorkoutProfile, dias: WorkoutDia[]) {
  const doc = new jsPDF();
  const nome = profile.nome?.trim() || "Aluno";
  const sub = `${nome}${profile.user_code ? ` · ID ${profile.user_code}` : ""}`;
  let y = desenharCabecalho(doc, "Plano de Treino", sub);

  // ── Bloco do aluno ──
  y = desenharTituloSecao(doc, "Aluno", y);
  const W = doc.internal.pageSize.getWidth();
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
    if (y > 235) y = novaPagina(doc);
    y = desenharTituloSecao(doc, `${diaLabel(dia.dia_semana)} · ${limparTexto(dia.grupo_nome)}`, y);
    const body = dia.exercicios.length
      ? dia.exercicios.map((e) => [
          limparTexto(e.nome),
          e.grupo_muscular ? limparTexto(e.grupo_muscular) : "—",
          SERIES_PADRAO,
        ])
      : [["Sem exercícios cadastrados", "—", "—"]];
    autoTable(doc, {
      startY: y,
      head: [["Exercício", "Grupo muscular", "Séries"]],
      body,
      ...estiloTabela(),
      margin: { left: 14, right: 14 },
      columnStyles: {
        1: { cellWidth: 42 },
        2: { halign: "right", cellWidth: 26 },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  desenharRodape(doc, "Series padrao 3 x 8-12 (hipertrofia) - ajustar conforme progressao");

  const safeName = nome.replace(/[^a-zA-Z0-9 ]/g, "");
  doc.save(`PhysiqCalc-Treino-${safeName}-${profile.user_code || ""}.pdf`);
}
