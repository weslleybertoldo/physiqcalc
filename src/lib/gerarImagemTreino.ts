// Gera a imagem "Treino concluído" num <canvas> (sem dependência externa —
// funciona no WebView do APK). Dois modos:
//  - "Só dados": card com as cores do app (altura dinâmica).
//  - "Com foto": foto do usuário como FUNDO (story 1080x1920, estilo Strava) e
//    só as infos mais importantes sobrepostas de forma sutil.
import { formatDuracao, type TreinoResumo } from "./treinoResumo";

const COR = {
  bg: "#0D0D0D",
  card: "#171717",
  accent: "#FFBF00",
  text: "#FFFFFF",
  muted: "#9CA3AF",
  line: "rgba(255,255,255,0.10)",
};

const W = 1080;
const PAD = 64;

function fmtData(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", {
    weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo",
  });
}
function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ─────────────────────────────────────────────────────────────────────────────
// Modo "Só dados" (card completo, altura dinâmica)
// ─────────────────────────────────────────────────────────────────────────────

function alturaDados(resumo: TreinoResumo): number {
  let h = PAD;
  h += 66 + 54 + 48; // cabeçalho
  const chips = 1 + (resumo.academia_nome ? 1 : 0) + 2;
  h += Math.ceil(chips / 2) * 130 + 20;
  h += 46;
  resumo.exercicios.forEach((ex) => {
    h += 44 + Math.max(1, ex.series.length) * 34 + 22;
  });
  h += 10 + 60 + PAD;
  return h;
}

function desenharDados(ctx: CanvasRenderingContext2D, resumo: TreinoResumo, top: number) {
  let y = top + PAD;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = COR.accent;
  ctx.font = "800 34px Arial, sans-serif";
  ctx.fillText("🔥 TREINO CONCLUÍDO", PAD, y);
  y += 66;

  ctx.fillStyle = COR.text;
  ctx.font = "800 56px Arial, sans-serif";
  ctx.fillText(resumo.nome_treino, PAD, y);
  y += 54;

  ctx.fillStyle = COR.muted;
  ctx.font = "400 28px Arial, sans-serif";
  ctx.fillText(`${fmtData(resumo.iniciado_em)} · ${fmtHora(resumo.iniciado_em)}–${fmtHora(resumo.concluido_em)}`, PAD, y);
  y += 48;

  // Ordem: linha 1 = Duração | Academia · linha 2 = Volume total | Média peso/rep
  const chips: Array<[string, string]> = [["Duração", formatDuracao(resumo.duracao_segundos)]];
  if (resumo.academia_nome) chips.push(["Academia", resumo.academia_nome]);
  chips.push(["Volume total", `${Math.round(resumo.volumeTotal).toLocaleString("pt-BR")} kg`]);
  chips.push(["Média peso/rep", resumo.mediaPesoRep != null ? `${resumo.mediaPesoRep.toFixed(1)} kg` : "—"]);

  const chipW = (W - PAD * 2 - 24) / 2;
  const chipH = 110;
  chips.forEach((c, i) => {
    const cx = PAD + (i % 2) * (chipW + 24);
    const cy = y + Math.floor(i / 2) * (chipH + 20);
    ctx.fillStyle = COR.card;
    roundRect(ctx, cx, cy, chipW, chipH, 16);
    ctx.fill();
    ctx.fillStyle = COR.muted;
    ctx.font = "700 22px Arial, sans-serif";
    ctx.fillText(c[0].toUpperCase(), cx + 24, cy + 40);
    ctx.fillStyle = COR.accent;
    ctx.font = "800 40px Arial, sans-serif";
    ctx.fillText(c[1], cx + 24, cy + 84);
  });
  y += Math.ceil(chips.length / 2) * (chipH + 20) + 20;

  ctx.strokeStyle = COR.line;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  y += 44;

  resumo.exercicios.forEach((ex) => {
    ctx.fillStyle = COR.text;
    ctx.font = "700 32px Arial, sans-serif";
    ctx.fillText(ex.nome, PAD, y);
    if (ex.mediaPesoRep != null) {
      ctx.fillStyle = COR.accent;
      ctx.font = "700 26px Arial, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`${ex.mediaPesoRep.toFixed(1)} kg/rep`, W - PAD, y);
      ctx.textAlign = "left";
    }
    y += 44;

    ctx.fillStyle = COR.muted;
    ctx.font = "400 26px Arial, sans-serif";
    if (ex.series.length > 0) {
      ex.series.forEach((s) => {
        ctx.fillText(`Série ${s.numero_serie}:  ${s.peso} kg × ${s.reps} reps`, PAD + 12, y);
        y += 34;
      });
    } else {
      ctx.fillText(`${ex.series_concluidas} série${ex.series_concluidas !== 1 ? "s" : ""} concluída${ex.series_concluidas !== 1 ? "s" : ""}`, PAD + 12, y);
      y += 34;
    }
    y += 22;
  });

  y += 10;
  // Rodapé: PHYSIQCALC (esquerda) + "Acomp: Bertoldo Performance" (direita, Acomp em amarelo)
  ctx.textAlign = "left";
  ctx.font = "700 26px Arial, sans-serif";
  ctx.fillStyle = COR.text;
  ctx.fillText("PHYSIQ", PAD, y + 20);
  const wPhysiq = ctx.measureText("PHYSIQ").width;
  ctx.fillStyle = COR.accent;
  ctx.fillText("CALC", PAD + wPhysiq, y + 20);

  ctx.textAlign = "right";
  ctx.fillStyle = COR.text;
  const nomeAcomp = "Bertoldo Performance";
  ctx.fillText(nomeAcomp, W - PAD, y + 20);
  const wNome = ctx.measureText(nomeAcomp).width;
  ctx.fillStyle = COR.accent;
  ctx.fillText("Acomp: ", W - PAD - wNome, y + 20);
  ctx.textAlign = "left";
}

function gerarTemplate(resumo: TreinoResumo): string {
  const H = alturaDados(resumo);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponível");
  ctx.fillStyle = COR.bg;
  ctx.fillRect(0, 0, W, H);
  desenharDados(ctx, resumo, 0);
  return canvas.toDataURL("image/png");
}

// ─────────────────────────────────────────────────────────────────────────────
// Modo "Com foto" — story 1080x1920, foto de fundo + overlay sutil (estilo Strava)
// ─────────────────────────────────────────────────────────────────────────────

const STORY_W = 1080;
const STORY_H = 1920;

/** Desenha a foto cobrindo todo o canvas (center-crop, tipo object-fit: cover). */
function desenharCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const escala = Math.max(w / img.width, h / img.height);
  const dw = img.width * escala;
  const dh = img.height * escala;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function gerarComFoto(resumo: TreinoResumo, img: HTMLImageElement): string {
  const canvas = document.createElement("canvas");
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponível");

  // Foto de fundo
  desenharCover(ctx, img, STORY_W, STORY_H);

  // Gradiente sutil no rodapé pra legibilidade do texto
  const grad = ctx.createLinearGradient(0, STORY_H * 0.45, 0, STORY_H);
  grad.addColorStop(0, "rgba(13,13,13,0)");
  grad.addColorStop(1, "rgba(13,13,13,0.85)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, STORY_H * 0.45, STORY_W, STORY_H * 0.55);

  // Sombra pra todo texto sobreposto
  const sombra = () => {
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 2;
  };
  const semSombra = () => { ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; };

  // Stats principais empilhados à direita (label pequeno + valor grande) — estilo Strava
  const stats: Array<[string, string]> = [
    ["Duração", formatDuracao(resumo.duracao_segundos)],
    ["Volume total", `${Math.round(resumo.volumeTotal).toLocaleString("pt-BR")} kg`],
  ];
  if (resumo.mediaPesoRep != null) stats.push(["Média peso/rep", `${resumo.mediaPesoRep.toFixed(1)} kg`]);

  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  const xRight = STORY_W - 72;
  let y = 900;
  sombra();
  stats.forEach(([label, valor]) => {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "700 34px Arial, sans-serif";
    ctx.fillText(label, xRight, y);
    y += 78;
    ctx.fillStyle = COR.text;
    ctx.font = "800 92px Arial, sans-serif";
    ctx.fillText(valor, xRight, y);
    y += 70;
  });

  // Título + data + academia no rodapé (esquerda)
  ctx.textAlign = "left";
  ctx.fillStyle = COR.accent;
  ctx.font = "800 40px Arial, sans-serif";
  ctx.fillText("🔥 TREINO CONCLUÍDO", 72, STORY_H - 240);
  ctx.fillStyle = COR.text;
  ctx.font = "800 84px Arial, sans-serif";
  ctx.fillText(resumo.nome_treino, 72, STORY_H - 160);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "400 34px Arial, sans-serif";
  ctx.fillText(`${fmtData(resumo.iniciado_em)} · ${fmtHora(resumo.iniciado_em)}–${fmtHora(resumo.concluido_em)}`, 72, STORY_H - 104);
  if (resumo.academia_nome) {
    ctx.fillStyle = COR.accent;
    ctx.font = "700 34px Arial, sans-serif";
    ctx.fillText(`📍 ${resumo.academia_nome}`, 72, STORY_H - 56);
  }

  // Rodapé direito (acima da data/academia): "Acomp: Bertoldo Performance" + PHYSIQCALC
  ctx.textAlign = "right";
  ctx.font = "700 30px Arial, sans-serif";
  const nomeAcomp = "Bertoldo Performance";
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fillText(nomeAcomp, STORY_W - 72, STORY_H - 160);
  ctx.fillStyle = COR.accent;
  ctx.fillText("Acomp: ", STORY_W - 72 - ctx.measureText(nomeAcomp).width, STORY_H - 160);
  ctx.font = "800 38px Arial, sans-serif";
  ctx.fillStyle = COR.text;
  ctx.fillText("PHYSIQ", STORY_W - 72 - ctx.measureText("CALC").width, STORY_H - 112);
  ctx.fillStyle = COR.accent;
  ctx.fillText("CALC", STORY_W - 72, STORY_H - 112);
  semSombra();

  return canvas.toDataURL("image/png");
}

// ─────────────────────────────────────────────────────────────────────────────

export interface OpcoesImagem {
  fotoDataUrl?: string | null;
}

/** Retorna um data URL PNG da imagem do treino. */
export async function gerarImagemTreino(resumo: TreinoResumo, opts: OpcoesImagem = {}): Promise<string> {
  if (opts.fotoDataUrl) {
    try {
      const img = await carregarImagem(opts.fotoDataUrl);
      return gerarComFoto(resumo, img);
    } catch {
      // foto inválida → cai no template
    }
  }
  return gerarTemplate(resumo);
}
