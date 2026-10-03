/**
 * Troca de exercício por equivalente (W9 — R9, C67, NF11; spec §8 "Equivalência de exercícios").
 *
 * `padrao_movimento` e `equipamento` (colunas de `tb_exercicios` e `tb_exercicios_usuario`) usam SÓ as listas fixas daqui;
 * `variacao` é texto livre (ex. "pegada aberta", "sentado"). A classificação dos 81 exercícios globais está em
 * `docs/exercicios-equivalencia.csv` (carga: `supabase/migrations/*_w09_classificacao_81.sql`).
 * Os 61 globais novos (sem GIF, 03/10/2026) vêm classificados em `scripts/conteudo/novos_61.json` (carga: `*_exercicios_novos_61.sql`).
 *
 * A regra (tudo no aparelho, sem internet — o catálogo vem do SQLite do PowerSync):
 *  - **Equivalentes** = mesmo movimento (`padrao_movimento`) e mesmo grupo muscular, outro exercício. Primeiro os de OUTRO
 *    equipamento (ex.: rosca martelo na polia ≈ rosca martelo com halteres); depois os do mesmo equipamento com outra variação
 *    (ex.: supino na máquina sentado × deitado).
 *  - **Mesmo músculo** = mesmo grupo e mesmo músculo principal do subgrupo, outro movimento (ex.: supino → crucifixo).
 *  - **Todos** = a lista inteira de hoje.
 *  - Academia com equipamentos marcados (opcional; sem marcar = sem filtro): o que ela não tem vai para o FIM, apagado, com
 *    "não tem na sua academia". Exercício sem equipamento cadastrado nunca é escondido.
 *
 * "Grupo" é o bloco muscular que o app já mostra (Peito, Costas, Ombro… — `blocoDoGrupoMuscular`), porque o
 * `grupo_muscular` é texto livre ("Costas" × "Dorsal / Bíceps" × "Dorsal / Rombóide" são todos Costas). O "músculo principal
 * do subgrupo" é o 1º músculo citado no `subgrupo` (ex. "Latíssimo do dorso · romboides" → dorsal); sem subgrupo (exercício
 * próprio do aluno, do profissional sem classificar) vale só o grupo — ele continua aparecendo em "Mesmo músculo" e "Todos".
 */
import { BLOCO_OUTROS, blocoDoGrupoMuscular, normalizar } from "@/lib/gruposMusculares";

// ───────────────────────── listas fixas ─────────────────────────

export const EQUIPAMENTOS = [
  { chave: "barra", rotulo: "Barra" },
  { chave: "halteres", rotulo: "Halteres" },
  { chave: "polia", rotulo: "Polia (cabo)" },
  { chave: "maquina", rotulo: "Máquina" },
  { chave: "smith", rotulo: "Smith" },
  { chave: "peso_corporal", rotulo: "Peso corporal" },
  { chave: "elastico", rotulo: "Elástico" },
  { chave: "kettlebell", rotulo: "Kettlebell" },
  { chave: "anilha", rotulo: "Anilha" },
  { chave: "suspensao", rotulo: "Suspensão" },
  { chave: "cardio", rotulo: "Cardio" },
] as const;

export type Equipamento = (typeof EQUIPAMENTOS)[number]["chave"];

/** Movimentos: a chave vai para o banco; `bloco` é o grupo muscular (as chaves de BLOCOS_MUSCULARES) — agrupa o seletor. */
export const PADROES = [
  // peito
  { chave: "supino_reto", rotulo: "Supino reto e flexão", bloco: "peito" },
  { chave: "supino_inclinado", rotulo: "Supino inclinado", bloco: "peito" },
  { chave: "supino_declinado", rotulo: "Supino declinado", bloco: "peito" },
  { chave: "crucifixo", rotulo: "Crucifixo e cross-over", bloco: "peito" },
  // costas
  { chave: "puxada_vertical", rotulo: "Puxada e barra fixa", bloco: "costas" },
  { chave: "remada", rotulo: "Remada", bloco: "costas" },
  { chave: "pulldown", rotulo: "Pulldown e pullover (braços estendidos)", bloco: "costas" },
  { chave: "encolhimento", rotulo: "Encolhimento", bloco: "costas" },
  { chave: "extensao_lombar", rotulo: "Extensão lombar", bloco: "costas" },
  // ombro
  { chave: "desenvolvimento", rotulo: "Desenvolvimento", bloco: "ombro" },
  { chave: "elevacao_lateral", rotulo: "Elevação lateral", bloco: "ombro" },
  { chave: "elevacao_frontal", rotulo: "Elevação frontal", bloco: "ombro" },
  { chave: "crucifixo_invertido", rotulo: "Crucifixo invertido e face pull", bloco: "ombro" },
  { chave: "remada_alta", rotulo: "Remada alta", bloco: "ombro" },
  // bíceps e antebraço
  { chave: "rosca_direta", rotulo: "Rosca direta e alternada", bloco: "biceps" },
  { chave: "rosca_scott", rotulo: "Rosca Scott e concentrada", bloco: "biceps" },
  { chave: "rosca_martelo", rotulo: "Rosca martelo", bloco: "biceps" },
  { chave: "rosca_punho", rotulo: "Rosca de punho", bloco: "biceps" },
  // tríceps
  { chave: "triceps_frances", rotulo: "Tríceps francês e testa", bloco: "triceps" },
  { chave: "triceps_extensao", rotulo: "Tríceps pulley, corda e coice", bloco: "triceps" },
  { chave: "mergulho", rotulo: "Mergulho", bloco: "triceps" },
  // pernas
  { chave: "agachamento", rotulo: "Agachamento e leg press", bloco: "quadriceps" },
  { chave: "afundo", rotulo: "Afundo e búlgaro", bloco: "quadriceps" },
  { chave: "extensao_joelho", rotulo: "Cadeira extensora", bloco: "quadriceps" },
  { chave: "flexao_joelho", rotulo: "Flexora e flexão nórdica", bloco: "posterior" },
  { chave: "terra_stiff", rotulo: "Levantamento terra e stiff", bloco: "posterior" },
  { chave: "elevacao_pelvica", rotulo: "Elevação pélvica", bloco: "gluteo" },
  { chave: "coice_gluteo", rotulo: "Coice de glúteo", bloco: "gluteo" },
  { chave: "abducao_quadril", rotulo: "Abdução de quadril", bloco: "gluteo" },
  { chave: "aducao_quadril", rotulo: "Adução de quadril", bloco: "gluteo" },
  { chave: "panturrilha", rotulo: "Panturrilha", bloco: "panturrilha" },
  // abdômen
  { chave: "abdominal_supra", rotulo: "Abdominal supra", bloco: "abdomen" },
  { chave: "abdominal_obliquo", rotulo: "Abdominal oblíquo", bloco: "abdomen" },
  { chave: "abdominal_infra", rotulo: "Abdominal infra", bloco: "abdomen" },
  { chave: "prancha", rotulo: "Prancha", bloco: "abdomen" },
  // cardio
  { chave: "cardio", rotulo: "Cardio (corrida, bike, elíptico)", bloco: "cardio" },
] as const;

export type PadraoMovimento = (typeof PADROES)[number]["chave"];

const MAPA_EQUIPAMENTO = new Map<string, string>(EQUIPAMENTOS.map((e) => [e.chave, e.rotulo]));
const MAPA_PADRAO = new Map<string, (typeof PADROES)[number]>(PADROES.map((p) => [p.chave, p]));

export const ehEquipamento = (v: unknown): v is Equipamento => typeof v === "string" && MAPA_EQUIPAMENTO.has(v);
export const ehPadrao = (v: unknown): v is PadraoMovimento => typeof v === "string" && MAPA_PADRAO.has(v);
export const rotuloEquipamento = (v: string | null | undefined): string | null => (v ? MAPA_EQUIPAMENTO.get(v) ?? null : null);
export const rotuloPadrao = (v: string | null | undefined): string | null => (v ? MAPA_PADRAO.get(v)?.rotulo ?? null : null);

// ───────────────────────── equipamentos da academia (NF11) ─────────────────────────

/**
 * `tb_academias.equipamentos` é `text[]` no Postgres e texto JSON no SQLite do PowerSync (`["barra","halteres"]`). Aceita
 * também o literal do Postgres (`{barra,halteres}`), a lista pronta e lixo (→ vazio). Só as chaves conhecidas, sem repetir.
 */
export function lerEquipamentos(valor: unknown): Equipamento[] {
  let lista: unknown[] = [];
  if (Array.isArray(valor)) lista = valor;
  else if (typeof valor === "string") {
    const t = valor.trim();
    if (t.startsWith("[")) {
      try {
        const j = JSON.parse(t);
        if (Array.isArray(j)) lista = j;
      } catch {
        lista = [];
      }
    } else if (t.startsWith("{") && t.endsWith("}")) {
      lista = t.slice(1, -1).split(",").map((x) => x.trim().replace(/^"|"$/g, ""));
    }
  }
  const saida: Equipamento[] = [];
  for (const x of lista) if (ehEquipamento(x) && !saida.includes(x)) saida.push(x);
  return saida;
}

/** O que vai para a coluna: JSON na ordem da lista fixa; nada marcado = NULL (sem filtro). */
export function gravarEquipamentos(lista: readonly string[]): string | null {
  const ordem = EQUIPAMENTOS.map((e) => e.chave).filter((c) => lista.includes(c));
  return ordem.length ? JSON.stringify(ordem) : null;
}

// ───────────────────────── músculo principal do subgrupo ─────────────────────────

/** 1ª palavra (ou expressão) do músculo → músculo canônico. Mais longas primeiro ("biceps femoral" antes de "biceps"). */
const MUSCULOS: [string, string][] = [
  ["biceps femoral", "isquiotibiais"],
  ["semitendineo", "isquiotibiais"],
  ["semimembranaceo", "isquiotibiais"],
  ["isquiotibiais", "isquiotibiais"],
  ["posterior de coxa", "isquiotibiais"],
  ["peitoral", "peitoral"],
  ["peito", "peitoral"],
  ["latissimo", "dorsal"],
  ["dorsal", "dorsal"],
  ["redondo", "dorsal"],
  // trapézio superior (o do encolhimento) × médio/inferior (o das remadas e puxadas, junto com os romboides)
  ["trapezio superior", "trapezio_superior"],
  ["elevador da escapula", "trapezio_superior"],
  ["trapezio", "costas_media"],
  ["romboide", "costas_media"],
  ["deltoide", "deltoide"],
  ["ombro", "deltoide"],
  ["rotadores", "deltoide"],
  ["biceps", "biceps"],
  ["braquiorradial", "biceps"],
  ["braquial", "biceps"],
  ["flexores do antebraco", "antebraco"],
  ["extensores do antebraco", "antebraco"],
  ["antebraco", "antebraco"],
  ["triceps", "triceps"],
  ["quadriceps", "quadriceps"],
  ["vastos", "quadriceps"],
  ["reto femoral", "quadriceps"],
  ["gluteo", "gluteo"],
  ["tensor da fascia lata", "gluteo"],
  ["adutor", "adutores"],
  ["abdutor", "gluteo"],
  ["gastrocnemio", "panturrilha"],
  ["soleo", "panturrilha"],
  ["panturrilha", "panturrilha"],
  ["reto abdominal", "abdomen"],
  ["obliquo", "abdomen"],
  ["abdominal", "abdomen"],
  ["transverso", "abdomen"],
  ["core", "abdomen"],
  ["flexores do quadril", "abdomen"],
  ["eretores", "lombar"],
  ["lombar", "lombar"],
  ["cardio", "cardio"],
];

function musculoDoTrecho(trecho: string): string | null {
  const t = normalizar(trecho);
  if (!t) return null;
  for (const [prefixo, musculo] of MUSCULOS) if (t.startsWith(prefixo)) return musculo;
  return null;
}

/** Os músculos citados no subgrupo, na ordem (o 1º é o principal). Parênteses saem ("Peitoral médio (esternal)" → peitoral). */
export function musculosDoSubgrupo(subgrupo: string | null | undefined): string[] {
  if (!subgrupo) return [];
  const semParenteses = subgrupo.replace(/\([^)]*\)/g, " ");
  const saida: string[] = [];
  for (const trecho of semParenteses.split(/[·—;,+]|\s-\s|\//)) {
    const m = musculoDoTrecho(trecho);
    if (m && !saida.includes(m)) saida.push(m);
  }
  return saida;
}

// ───────────────────────── a regra ─────────────────────────

export interface ExercicioEquivalencia {
  id: string;
  nome: string;
  grupo_muscular: string;
  subgrupo?: string | null;
  padrao_movimento?: string | null;
  equipamento?: string | null;
  variacao?: string | null;
  isPessoal?: boolean;
}

/** Grupo (bloco muscular) do exercício: "Dorsal / Bíceps" e "Costas" → costas. */
export const grupoDe = (e: Pick<ExercicioEquivalencia, "grupo_muscular">): string => blocoDoGrupoMuscular(e.grupo_muscular || "");

const mesmoExercicio = (a: ExercicioEquivalencia, b: ExercicioEquivalencia) => a.id === b.id && !!a.isPessoal === !!b.isPessoal;
const padraoValido = (e: ExercicioEquivalencia): string | null => (ehPadrao(e.padrao_movimento) ? e.padrao_movimento : null);
const equipamentoValido = (e: ExercicioEquivalencia): string | null => (ehEquipamento(e.equipamento) ? e.equipamento : null);

/** Equivalente: mesmo movimento e mesmo grupo, outro exercício (o grupo "Outros" não conta: nome sem grupo conhecido). */
export function ehEquivalente(atual: ExercicioEquivalencia, outro: ExercicioEquivalencia): boolean {
  if (mesmoExercicio(atual, outro)) return false;
  const p = padraoValido(atual);
  if (!p || p !== padraoValido(outro)) return false;
  const g = grupoDe(atual);
  return g !== BLOCO_OUTROS && g === grupoDe(outro);
}

/**
 * Mesmo músculo: mesmo grupo, NÃO é equivalente e o subgrupo bate — o músculo principal de um aparece no subgrupo do outro
 * (ex.: agachamento sumô "Adutores · glúteo · quadríceps" × afundo "Quadríceps · glúteo"; puxada × encolhimento, não).
 * Sem subgrupo em um dos dois (ou sem músculo reconhecido), vale só o grupo.
 */
export function ehMesmoMusculo(atual: ExercicioEquivalencia, outro: ExercicioEquivalencia): boolean {
  if (mesmoExercicio(atual, outro) || ehEquivalente(atual, outro)) return false;
  const g = grupoDe(atual);
  if (g === BLOCO_OUTROS || g !== grupoDe(outro)) return false;
  const deQuemSai = musculosDoSubgrupo(atual.subgrupo);
  const doOutro = musculosDoSubgrupo(outro.subgrupo);
  if (deQuemSai.length === 0 || doOutro.length === 0) return true;
  return doOutro.includes(deQuemSai[0]) || deQuemSai.includes(doOutro[0]);
}

/** A academia tem o equipamento? Sem filtro (nada marcado) ou exercício sem equipamento cadastrado → sim. */
export function temNaAcademia(e: ExercicioEquivalencia, equipamentosAcademia: readonly string[] | null | undefined): boolean {
  if (!equipamentosAcademia || equipamentosAcademia.length === 0) return true;
  const eq = equipamentoValido(e);
  return !eq || equipamentosAcademia.includes(eq);
}

export interface OpcaoTroca<T extends ExercicioEquivalencia> {
  exercicio: T;
  /** a academia (com equipamentos marcados) não tem → vai para o fim, apagada */
  semNaAcademia: boolean;
  /** equivalente com o MESMO equipamento de quem sai (outra variação) — depois dos de outro equipamento */
  mesmoEquipamento: boolean;
}

export interface GruposTroca<T extends ExercicioEquivalencia> {
  equivalentes: OpcaoTroca<T>[];
  mesmoMusculo: OpcaoTroca<T>[];
  todos: T[];
  /** o exercício usado como referência (quem sai; ou o original, se quem sai não tem movimento cadastrado) */
  referencia: ExercicioEquivalencia;
}

const porNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, "pt-BR");

/**
 * Os 3 grupos do "Trocar". `atual` = o exercício que está na tela; `origem` = o programado no treino (quando o da tela já é
 * uma troca) — se o da tela não tem movimento cadastrado (ex.: exercício próprio), a referência passa a ser o original.
 */
export function montarGruposTroca<T extends ExercicioEquivalencia>(
  atual: ExercicioEquivalencia,
  catalogo: readonly T[],
  opcoes: { equipamentosAcademia?: readonly string[] | null; origem?: ExercicioEquivalencia | null } = {},
): GruposTroca<T> {
  const referencia = !padraoValido(atual) && opcoes.origem && padraoValido(opcoes.origem) ? opcoes.origem : atual;
  const eqAtual = equipamentoValido(referencia);
  const naTela = (e: ExercicioEquivalencia) => mesmoExercicio(e, atual);
  const opcao = (e: T): OpcaoTroca<T> => ({
    exercicio: e,
    semNaAcademia: !temNaAcademia(e, opcoes.equipamentosAcademia),
    mesmoEquipamento: !!eqAtual && equipamentoValido(e) === eqAtual,
  });
  const ordenar = (lista: OpcaoTroca<T>[], porEquipamento: boolean) =>
    lista.sort(
      (a, b) =>
        Number(a.semNaAcademia) - Number(b.semNaAcademia) ||
        (porEquipamento ? Number(a.mesmoEquipamento) - Number(b.mesmoEquipamento) : 0) ||
        porNome(a.exercicio, b.exercicio),
    );

  // quando a referência é o original (o da tela não tem movimento), o próprio original também é opção: voltar a ele
  const ehOpcaoEquivalente = (e: T) => ehEquivalente(referencia, e) || (referencia !== atual && mesmoExercicio(e, referencia));
  const equivalentes = ordenar(catalogo.filter((e) => !naTela(e) && ehOpcaoEquivalente(e)).map(opcao), true);
  const idsEquivalentes = new Set(equivalentes.map((o) => `${o.exercicio.isPessoal ? "p" : "g"}:${o.exercicio.id}`));
  const mesmoMusculo = ordenar(
    catalogo
      .filter((e) => !naTela(e) && !idsEquivalentes.has(`${e.isPessoal ? "p" : "g"}:${e.id}`) && ehMesmoMusculo(referencia, e))
      .map(opcao),
    false,
  );
  return { equivalentes, mesmoMusculo, todos: [...catalogo].sort(porNome), referencia };
}

/** Linha curta do exercício na troca: "Halteres · pegada neutra" / "Remada · Máquina". */
export function descricaoCurta(e: ExercicioEquivalencia, comMovimento = false): string {
  const partes = [comMovimento ? rotuloPadrao(e.padrao_movimento) : null, rotuloEquipamento(e.equipamento), e.variacao?.trim() || null];
  return partes.filter(Boolean).join(" · ");
}

// ───────────────────────── campos da biblioteca (FormExercicioBiblioteca) ─────────────────────────

/** Os campos de equivalência de um exercício da biblioteca (colunas de `tb_exercicios` e `tb_exercicios_usuario`). */
export interface CamposEquivalencia {
  padrao_movimento: string | null;
  equipamento: string | null;
  variacao: string | null;
}

export const CAMPOS_EQUIVALENCIA_VAZIOS: CamposEquivalencia = { padrao_movimento: null, equipamento: null, variacao: null };

/** Do registro do banco para o formulário (valor fora das listas fixas vira vazio). */
export function camposDoExercicio(e: Partial<CamposEquivalencia> | null | undefined): CamposEquivalencia {
  return {
    padrao_movimento: ehPadrao(e?.padrao_movimento) ? e!.padrao_movimento! : null,
    equipamento: ehEquipamento(e?.equipamento) ? e!.equipamento! : null,
    variacao: e?.variacao?.trim() || null,
  };
}

/** O que vai para o insert/update: só chaves das listas fixas; variação sem espaços sobrando; vazio = null. */
export function camposParaGravar(v: CamposEquivalencia): CamposEquivalencia {
  return camposDoExercicio(v);
}
