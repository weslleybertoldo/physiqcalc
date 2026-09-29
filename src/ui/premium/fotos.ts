/**
 * Fotos de banco grátis embutidas no app (spec 4.9 e P29; créditos em docs/creditos-fotos.json):
 * fundo do card do treino por grupo muscular e foto padrão da refeição por tipo (quando não há foto
 * do diário do dia). Os arquivos ficam em public/fotos e vão dentro do APK.
 */
export type GrupoFoto = "geral" | "peito" | "costas" | "ombros" | "bracos" | "pernas" | "gluteos" | "abdomen" | "cardio";
export type TipoRefeicaoFoto = "cafe-da-manha" | "lanche" | "fruta" | "almoco" | "jantar" | "ceia";

export const FOTOS_TREINO: Record<GrupoFoto, string> = {
  geral: "/fotos/treino/geral.webp",
  peito: "/fotos/treino/peito.webp",
  costas: "/fotos/treino/costas.webp",
  ombros: "/fotos/treino/ombros.webp",
  bracos: "/fotos/treino/bracos.webp",
  pernas: "/fotos/treino/pernas.webp",
  gluteos: "/fotos/treino/gluteos.webp",
  abdomen: "/fotos/treino/abdomen.webp",
  cardio: "/fotos/treino/cardio.webp",
};

export const FOTOS_REFEICAO: Record<TipoRefeicaoFoto, string> = {
  "cafe-da-manha": "/fotos/refeicoes/cafe-da-manha.webp",
  lanche: "/fotos/refeicoes/lanche.webp",
  fruta: "/fotos/refeicoes/fruta.webp",
  almoco: "/fotos/refeicoes/almoco.webp",
  jantar: "/fotos/refeicoes/jantar.webp",
  ceia: "/fotos/refeicoes/ceia.webp",
};

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Bloco muscular do Calc (src/lib/gruposMusculares.ts) ou nome do grupo → grupo da foto. */
const GRUPO_DO_BLOCO: Record<string, GrupoFoto> = {
  peito: "peito",
  peitoral: "peito",
  costas: "costas",
  dorsal: "costas",
  ombro: "ombros",
  ombros: "ombros",
  deltoide: "ombros",
  biceps: "bracos",
  triceps: "bracos",
  braco: "bracos",
  bracos: "bracos",
  antebraco: "bracos",
  quadriceps: "pernas",
  posterior: "pernas",
  "posterior de coxa": "pernas",
  panturrilha: "pernas",
  perna: "pernas",
  pernas: "pernas",
  gluteo: "gluteos",
  gluteos: "gluteos",
  abdomen: "abdomen",
  abdominal: "abdomen",
  core: "abdomen",
  cardio: "cardio",
  corrida: "cardio",
};

/**
 * Foto de fundo do treino do dia (P29). Recebe o bloco/grupo principal ("peito", "Quadríceps",
 * "Dorsal / Rombóide"…) ou o nome do treino ("Peito e Tríceps") e cai em "geral" quando não reconhece.
 */
export function fotoDoTreino(grupoOuNome: string | null | undefined): string {
  const texto = normalizar(grupoOuNome ?? "");
  const primario = texto.split("/")[0].trim();
  if (GRUPO_DO_BLOCO[primario]) return FOTOS_TREINO[GRUPO_DO_BLOCO[primario]];
  const palavra = Object.keys(GRUPO_DO_BLOCO).find((k) => new RegExp(`(^|[^a-z])${k}([^a-z]|$)`).test(texto));
  return FOTOS_TREINO[palavra ? GRUPO_DO_BLOCO[palavra] : "geral"];
}

/**
 * Foto padrão da refeição (P29): pelo nome ("Café da manhã", "Lanche da tarde", "Almoço", "Jantar",
 * "Ceia") e, sem nome conhecido, pelo horário ("07:00").
 */
export function fotoDaRefeicao(nome: string | null | undefined, horario?: string | null): string {
  const n = normalizar(nome ?? "");
  if (/cafe|desjejum|manha cedo/.test(n)) return FOTOS_REFEICAO["cafe-da-manha"];
  if (/almoco/.test(n)) return FOTOS_REFEICAO.almoco;
  if (/jantar|janta/.test(n)) return FOTOS_REFEICAO.jantar;
  if (/ceia/.test(n)) return FOTOS_REFEICAO.ceia;
  if (/fruta/.test(n)) return FOTOS_REFEICAO.fruta;
  if (/lanche|colacao|pre.?treino|pos.?treino/.test(n)) return FOTOS_REFEICAO.lanche;
  const h = Number((horario ?? "").slice(0, 2));
  if (Number.isFinite(h) && horario) {
    if (h < 10) return FOTOS_REFEICAO["cafe-da-manha"];
    if (h < 12) return FOTOS_REFEICAO.fruta;
    if (h < 15) return FOTOS_REFEICAO.almoco;
    if (h < 18) return FOTOS_REFEICAO.lanche;
    if (h < 21) return FOTOS_REFEICAO.jantar;
    return FOTOS_REFEICAO.ceia;
  }
  return FOTOS_REFEICAO.almoco;
}
