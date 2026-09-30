import { format } from "date-fns";
import type { TomChip } from "@/ui/premium/Chip";
import { semAcento } from "./numeros";

// Physiq W11 — diário alimentar do lado do aluno, portado do PhysiqNutri (src/lib/diarioUtil.ts, W30 do Nutri): as refeições do
// registro, a sugestão pela hora, a validação da foto (10 MB; JPG, PNG, WebP, HEIC), o caminho no bucket, os erros da função
// diario_enviar em texto, as datas e a reação da nutricionista — SEM emoji (spec 4.9: a reação vira chip). Acrescentado: qual
// registro do diário é a foto de qual refeição do plano (P29). Sem rede; testado.

// ---- Refeições ----
export type Refeicao = "cafe_manha" | "lanche_manha" | "almoco" | "lanche_tarde" | "jantar" | "ceia" | "outro";
export type OpcaoRefeicao = { valor: Refeicao; rotulo: string; curto: string };
export const REFEICOES: OpcaoRefeicao[] = [
  { valor: "cafe_manha", rotulo: "Café da manhã", curto: "Café" },
  { valor: "lanche_manha", rotulo: "Lanche da manhã", curto: "Lanche AM" },
  { valor: "almoco", rotulo: "Almoço", curto: "Almoço" },
  { valor: "lanche_tarde", rotulo: "Lanche da tarde", curto: "Lanche PM" },
  { valor: "jantar", rotulo: "Jantar", curto: "Jantar" },
  { valor: "ceia", rotulo: "Ceia", curto: "Ceia" },
  { valor: "outro", rotulo: "Outro", curto: "Outro" },
];
export const ehRefeicao = (v: unknown): v is Refeicao => typeof v === "string" && REFEICOES.some((r) => r.valor === v);
export const rotuloRefeicao = (v: unknown): string => REFEICOES.find((r) => r.valor === v)?.rotulo ?? "";
/** Refeição pré-selecionada pela hora do dia (05–09 café · 09–11 lanche · 11–14 almoço · 14–18 lanche · 18–21 jantar · 21–24 ceia). */
export function refeicaoSugerida(hora: number): Refeicao {
  if (hora >= 5 && hora < 9) return "cafe_manha";
  if (hora >= 9 && hora < 11) return "lanche_manha";
  if (hora >= 11 && hora < 14) return "almoco";
  if (hora >= 14 && hora < 18) return "lanche_tarde";
  if (hora >= 18 && hora < 21) return "jantar";
  if (hora >= 21 && hora < 24) return "ceia";
  return "outro";
}

/**
 * P29 — o tipo de registro do diário que corresponde à refeição do plano: pelo nome ("Café da manhã", "Lanche da tarde",
 * "Almoço", "Jantar", "Ceia") e, quando o nome não diz ("Pré-treino", "Refeição 3"), pelo horário.
 */
export function tipoDaRefeicaoDoPlano(nome: string | null | undefined, horario?: string | null): Refeicao {
  const n = semAcento(nome ?? "").toLowerCase();
  const h = Number((horario ?? "").slice(0, 2));
  const temHora = !!horario && Number.isFinite(h);
  if (/cafe|desjejum/.test(n)) return "cafe_manha";
  if (/almoco/.test(n)) return "almoco";
  if (/jantar|janta/.test(n)) return "jantar";
  if (/ceia/.test(n)) return "ceia";
  if (/lanche|colacao|merenda/.test(n)) {
    if (/manha/.test(n)) return "lanche_manha";
    if (/tarde/.test(n)) return "lanche_tarde";
    return temHora && h < 12 ? "lanche_manha" : "lanche_tarde";
  }
  return temHora ? refeicaoSugerida(h) : "outro";
}

// ---- Reações da nutricionista (sem emoji: chip com o rótulo) ----
export type Reacao = "otimo" | "bom" | "atencao" | "evitar";
export const REACOES: { valor: Reacao; rotulo: string; tom: TomChip }[] = [
  { valor: "otimo", rotulo: "Ótimo", tom: "n" },
  { valor: "bom", rotulo: "Bom", tom: "c" },
  { valor: "atencao", rotulo: "Atenção", tom: "a" },
  { valor: "evitar", rotulo: "Evitar", tom: "r" },
];
export const ehReacao = (v: unknown): v is Reacao => typeof v === "string" && REACOES.some((r) => r.valor === v);
export const rotuloReacao = (v: unknown): string => REACOES.find((r) => r.valor === v)?.rotulo ?? "";
export const tomReacao = (v: unknown): TomChip => REACOES.find((r) => r.valor === v)?.tom ?? "g";
/** "Ótimo — comentário" · "Ótimo" · "aguardando a nutricionista" */
export function textoReacao(r: { reacao_nutri: string | null; comentario_nutri: string }): string {
  if (!r.reacao_nutri) return "aguardando a nutricionista";
  const base = rotuloReacao(r.reacao_nutri) || "Reagiu";
  return r.comentario_nutri ? `${base} — ${r.comentario_nutri}` : base;
}

// ---- Arquivo / envio ----
export const COMENTARIO_MAX = 500;
export const FOTO_TAMANHO_MAX = 10 * 1024 * 1024;
export const FOTO_TAMANHO_MAX_ROTULO = "10 MB";
export const MIMES_DIARIO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};
const EXTENSAO_PARA_MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif" };
/** O input aceita qualquer imagem (a câmera do celular decide o formato); a validação abaixo é que fecha a lista. */
export const ACCEPT_DIARIO = "image/*";
export type ArquivoInfo = { name: string; size: number; type: string };
/** MIME pelo tipo do arquivo ou, quando o navegador não informa (HEIC no Android), pela extensão. "" = não aceito. */
export function mimeDaFotoDiario(f: ArquivoInfo): string {
  const t = (f.type || "").toLowerCase();
  if (MIMES_DIARIO[t]) return t;
  const ext = f.name.toLowerCase().split(".").pop() ?? "";
  return EXTENSAO_PARA_MIME[ext] ?? "";
}
export const extensaoDoMime = (mime: string): string => MIMES_DIARIO[mime] ?? "jpg";
/** Objeto no bucket `diario`: <nutricionista_id>/<paciente_id>/<uuid>.<ext> — o mesmo padrão que a política do Storage e a função exigem. */
export function nomeObjeto(nutriId: string, pacienteId: string, mime: string, uuid: string = crypto.randomUUID()): string {
  return `${nutriId}/${pacienteId}/${uuid}.${extensaoDoMime(mime)}`;
}

export type FormEnvio = { refeicao: string; arquivo: ArquivoInfo | null; comentario: string; dataHoraIso: string };
/** Mensagem amigável ANTES de qualquer pedido, ou null quando pode enviar. */
export function validarEnvio(f: FormEnvio, agora: Date = new Date()): string | null {
  if (!ehRefeicao(f.refeicao)) return "Escolha a refeição";
  if (!f.arquivo) return "Escolha a foto da refeição";
  if (f.arquivo.size <= 0) return "A foto está vazia. Escolha outra.";
  if (f.arquivo.size > FOTO_TAMANHO_MAX) return `A foto passa de ${FOTO_TAMANHO_MAX_ROTULO}. Envie uma menor.`;
  if (!mimeDaFotoDiario(f.arquivo)) return "Formato não aceito. Envie JPG, PNG, WebP ou HEIC.";
  if (f.comentario.trim().length > COMENTARIO_MAX) return `O comentário passa de ${COMENTARIO_MAX} caracteres`;
  if (!f.dataHoraIso || Number.isNaN(Date.parse(f.dataHoraIso))) return "Data e hora inválidas";
  if (Date.parse(f.dataHoraIso) > agora.getTime() + 5 * 60 * 1000) return "A data e hora não podem estar no futuro";
  return null;
}
/** Só o arquivo (na hora de escolher): tamanho e formato. */
export const validarArquivoDiario = (f: ArquivoInfo): string | null =>
  validarEnvio({ refeicao: "outro", arquivo: f, comentario: "", dataHoraIso: new Date().toISOString() });

/** Erros da função/Storage (código na mensagem) → texto pro aluno. */
/** Spec 9: o aluno com o diário desligado pelo profissional. */
export const TEXTO_DIARIO_DESLIGADO = "O envio de fotos está desligado pelo seu profissional.";

export function textoErroRpc(e: unknown): string {
  const m = (e instanceof Error ? e.message : typeof e === "string" ? e : "").toLowerCase();
  if (m.includes("codigo_invalido")) return "O envio de fotos não está liberado agora. Fale com a sua nutricionista.";
  // W14 (R12, spec 9): o profissional desligou o diário (ou o storage recusou a foto por isso)
  if (m.includes("diario_desligado") || m.includes("link_desligado")) return TEXTO_DIARIO_DESLIGADO;
  if (m.includes("muitos_envios")) return "Muitos envios em pouco tempo — tente de novo em alguns minutos.";
  if (m.includes("arquivo_nao_encontrado") || m.includes("path_invalido") || m.includes("arquivo_invalido")) return "A foto não subiu. Tente de novo.";
  if (m.includes("data_invalida")) return "A data e hora não podem estar no futuro.";
  if (m.includes("refeicao_invalida")) return "Escolha a refeição.";
  if (m.includes("row-level security") || m.includes("violates") || m.includes("policy") || m.includes("unauthorized")) return "O envio de fotos não está liberado agora. Fale com a sua nutricionista.";
  if (m.includes("mime") || m.includes("not supported") || m.includes("invalid_mime")) return "Formato não aceito. Envie JPG, PNG, WebP ou HEIC.";
  if (m.includes("exceeded") || m.includes("too large") || m.includes("payload") || m.includes("maximum")) return `A foto passa de ${FOTO_TAMANHO_MAX_ROTULO}. Envie uma menor.`;
  if (m.includes("sem_internet") || m.includes("failed to fetch") || m.includes("network") || m.includes("abort")) return "Sem conexão. Confira a internet e tente de novo.";
  return "Não foi possível enviar a foto. Tente de novo.";
}

// ---- datetime-local ⇄ ISO (fuso local) ----
/** Valor do input `datetime-local` ("2026-09-20T12:40", hora LOCAL) → ISO UTC; "" se inválido. */
export function dataHoraLocalParaIso(v: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}
export function isoParaDataHoraLocal(v: string | Date): string {
  const d = typeof v === "string" ? new Date(v) : v;
  return Number.isNaN(d.getTime()) ? "" : format(d, "yyyy-MM-dd'T'HH:mm");
}
export const agoraLocal = (agora: Date = new Date()): string => isoParaDataHoraLocal(agora);

// ---- Lista ----
const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
/** Mais recente primeiro (desempate por id, pra ordem estável). */
export function ordenarRegistros<T extends { id: string; data_hora: string }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => {
    const ta = Date.parse(a.data_hora);
    const tb = Date.parse(b.data_hora);
    if (ta !== tb) return tb - ta;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}
/** 'dom 20/09 · 12:40 · Almoço' (a lista "Seus últimos 7 dias"). */
export function textoItemPublico(r: { refeicao: string; data_hora: string }): string {
  const d = new Date(r.data_hora);
  return `${DIAS_CURTOS[d.getDay()]} ${format(d, "dd/MM")} · ${format(d, "HH:mm")} · ${rotuloRefeicao(r.refeicao) || "Refeição"}`;
}
/** yyyy-mm-dd de um instante no fuso de São Paulo (o dia do registro do diário). */
export function diaSP(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/**
 * P29 — a foto da refeição: o registro mais recente do diário DO DIA com o mesmo tipo da refeição (café, almoço…). Sem registro,
 * null (a tela usa a foto padrão do tipo).
 */
export function registroDaRefeicao<T extends { id: string; data_hora: string; refeicao: string }>(
  diario: T[],
  refeicao: { nome: string; horario: string | null },
  dia: string,
): T | null {
  const tipo = tipoDaRefeicaoDoPlano(refeicao.nome, refeicao.horario);
  return ordenarRegistros(diario).find((r) => r.refeicao === tipo && diaSP(r.data_hora) === dia) ?? null;
}
