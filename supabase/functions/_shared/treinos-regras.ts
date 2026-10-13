// Physiq hml-21d (H-43 · jeito 2, etapa 3, 13/10/2026) — regras PURAS da função treinos (Banco do Treino): sem Deno e sem rede; usadas pela
// função (supabase/functions/treinos/) e testadas no Vitest (src/treino/treinosServidor.test.ts). O molde é o _shared/conta-regras.ts do
// principal (a hml-21a/21b): a tela chama UMA ação; a função grava com a SESSÃO do Treino de quem chama (o RLS de hoje decide quem pode — 2ª
// camada) e aqui fica a FORMA:
//   · a lista fechada de ações, por módulo (modelos: os treinos-modelo, os exercícios deles, a ordem e as pastas; biblioteca: os exercícios,
//     a foto, os grupos musculares e o perfil do professor no Treino; master: os treinos prontos do app e a biblioteca global) — o
//     moduloDoPedido despacha; o `ler` vai ao catálogo (_shared/treinos-leituras.ts);
//   · o corpo de cada ação em lista fechada (CORPOS_DAS_ACOES): cada chave com o tipo e o teto (o formato dos params do motor —
//     _shared/leitura-lote.ts — + `nulo`: o null VAI ao banco, como a tela manda hoje); a chave que a ação não declara CAI (professor_id,
//     user_id, criado_por, emoji do painel… nunca chegam ao banco); a declarada fora da forma → dados_invalidos (nada roda);
//   · o DONO do que é criado vem do TOKEN, nunca do corpo: quem é master cria no catálogo GLOBAL (professor_id null — o donoAoCriar da tela,
//     src/painel/treinos/regras.ts); os outros, para si (o sub do token); o RLS decide de novo (só a staff grava, cada um o seu);
//   · o Master (treinos prontos, biblioteca global): o papel conferido ANTES do banco (o app_metadata.role do token = o que o
//     physiq_is_master() lê: admin ou master) — quem não é → 403 sem_acesso, sem ida ao banco;
//   · a foto do exercício (bucket exercicios/-staging, spec §2.5): o caminho nasce AQUI — <id do exercício>.<ext>, o MESMO de hoje (o
//     subirImagem): a policy do bucket (exercicios_professor_write) só deixa o professor gravar o arquivo cujo nome antes do 1º "." é o id de
//     um exercício DELE (não há "pasta do user" neste bucket — decisão 12: a policy fica); o editar só aceita a URL pública DESTE arquivo
//     neste bucket (ou a que já estava na linha, ou nenhuma);
//   · a tradução do erro do banco: a do motor (erroDaLeitura) + o 23503 do painel como `em_uso` (a tela de hoje diz "Está em uso…": o
//     exercício num treino pronto, o modelo que um aluno recebe) — a mensagem do banco nunca vai à tela.
import { erroDaLeitura, valorDoParam, type ParamLeitura } from "./leitura-lote.ts";

// ───────────────────────── os tetos (acima do que as telas aceitam: a função barra o abuso, o banco decide o valor) ─────────────────────────
/** O nome de um treino, pasta, exercício, grupo muscular ou do professor (a tela: 60–100; o banco não corta). */
export const NOME_MAX = 200;
/** A dica do exercício e a observação de um exercício do treino pronto. */
export const TEXTO_MAX = 2000;
/** Uma URL (a da foto). */
export const URL_MAX = 2000;
/** Os códigos de movimento e de equipamento (as listas fixas da tela: src/treino/equivalencia.ts). */
export const CODIGO_MAX = 60;
/** A foto/GIF do exercício: até 5 MB (o subirImagem da tela; o bucket aceita até 10). */
export const IMAGEM_MAX_BYTES = 5 * 1024 * 1024;
/** Os tipos da foto do exercício (os allowed_mime_types do bucket) → a extensão do arquivo. */
export const TIPOS_DE_IMAGEM: Readonly<Record<string, string>> = { "image/gif": "gif", "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" };
/** Os exercícios de um modelo que a ordem leva de uma vez (a RPC modelo_ordenar aceita até 1000). */
export const ORDEM_MAX = 1000;
/** As divisões de um treino pronto (as letras A–Z) e os exercícios de cada divisão (a RPC treino_pronto_salvar confere igual). */
export const DIVISOES_MAX = 26;
export const EXERCICIOS_POR_DIVISAO_MAX = 100;
/** O emoji do exercício global (a tela do master escolhe 1 de uma lista). */
export const EMOJI_MAX = 16;
const INT4 = { min: -2_147_483_648, max: 2_147_483_647 } as const;

// ───────────────────────── as ações ─────────────────────────
/** Painel › Treinos › Meus treinos e o Detalhe: os modelos, os exercícios de cada um, a ordem (a RPC nova) e as pastas. */
export const ACOES_DOS_MODELOS = [
  "modelo_criar", "modelo_editar", "modelo_excluir", "modelo_exercicio_incluir", "modelo_exercicio_tirar", "modelo_exercicio_prescrever",
  "modelo_ordenar", "pasta_criar", "pasta_editar", "pasta_excluir", "pasta_vincular", "pasta_desvincular",
] as const;
/** Painel › Treinos › Biblioteca e a Folha do exercício: os exercícios, a foto, os grupos musculares; e o espelho do perfil (Configurações). */
export const ACOES_DA_BIBLIOTECA = [
  "exercicio_criar", "exercicio_editar", "exercicio_excluir", "exercicio_foto_preparar", "grupo_muscular_criar", "grupo_muscular_excluir",
  "professor_perfil",
] as const;
/** Master: os treinos prontos do app (a RPC nova do salvar) e a biblioteca global (exercícios e grupos musculares). */
export const ACOES_DO_MASTER = [
  "treino_pronto_salvar", "treino_pronto_ativo", "exercicio_global_criar", "exercicio_global_editar", "exercicio_global_excluir",
  "exercicio_global_promover", "grupo_global_criar", "grupo_global_excluir",
] as const;
export type AcaoDosModelos = (typeof ACOES_DOS_MODELOS)[number];
export type AcaoDaBiblioteca = (typeof ACOES_DA_BIBLIOTECA)[number];
export type AcaoDoMaster = (typeof ACOES_DO_MASTER)[number];
export type AcaoTreinos = AcaoDosModelos | AcaoDaBiblioteca | AcaoDoMaster;
export const ACOES_DA_TREINOS: readonly AcaoTreinos[] = [...ACOES_DOS_MODELOS, ...ACOES_DA_BIBLIOTECA, ...ACOES_DO_MASTER];

// ───────────────────────── o corpo das gravações ─────────────────────────
/**
 * O campo do corpo de uma gravação: um param do motor (o tipo e o teto) com `nulo` (o null VAI ao banco: limpar a coluna, como a tela
 * manda hoje) e 2 tipos daqui: `numero` (a carga sugerida: 0,25 a 999,75 — decimal) e `ids` (a lista da ordem: uuids, na ordem, SEM tirar
 * os repetidos — a RPC recusa). Sem `nulo`, o null → dados_invalidos (nada roda).
 */
export type CampoDaAcao =
  | (ParamLeitura & { nulo?: boolean })
  | { tipo: "numero"; min: number; max: number; obrigatorio?: boolean; nulo?: boolean }
  | { tipo: "ids"; max: number; obrigatorio?: boolean };
export type CamposDaAcao = Readonly<Record<string, CampoDaAcao>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const texto = (max: number, obrigatorio = false) => ({ tipo: "texto", max, obrigatorio }) as const;
const nulo = <T extends object>(c: T) => ({ ...c, nulo: true }) as T & { nulo: true };
const uuidObrig = { tipo: "uuid", obrigatorio: true } as const;
const inteiro = { tipo: "inteiro", ...INT4 } as const;
const booleanoObrig = { tipo: "booleano", obrigatorio: true } as const;
const TIPOS_DE_EXERCICIO = ["musculacao", "corrida"] as const;

/** As colunas do exercício que a Folha do painel manda (DadosExercicio de src/painel/treinos/api.ts — o emoji e o dono nascem aqui). */
const CAMPOS_DO_EXERCICIO = {
  nome: texto(NOME_MAX), grupo_muscular: texto(NOME_MAX), tipo: { tipo: "enum", valores: TIPOS_DE_EXERCICIO }, subgrupo: nulo(texto(NOME_MAX)),
  dica: nulo(texto(TEXTO_MAX)), padrao_movimento: nulo(texto(CODIGO_MAX)), equipamento: nulo(texto(CODIGO_MAX)), variacao: nulo(texto(NOME_MAX)),
} as const;
/** As colunas do exercício GLOBAL que a Biblioteca do master manda (o campos de src/pages/master/BibliotecaPage.tsx; o tipo nasce aqui). */
const CAMPOS_DO_GLOBAL = {
  nome: texto(NOME_MAX), grupo_muscular: texto(NOME_MAX), emoji: texto(EMOJI_MAX), subgrupo: nulo(texto(NOME_MAX)), dica: nulo(texto(TEXTO_MAX)),
  padrao_movimento: nulo(texto(CODIGO_MAX)), equipamento: nulo(texto(CODIGO_MAX)), variacao: nulo(texto(NOME_MAX)),
} as const;
/** A prescrição do exercício NO MODELO (prescreverModelo: as 4 que a tela mexeu; o check da tabela decide o valor). */
const CAMPOS_DA_PRESCRICAO = {
  num_series: nulo(inteiro), reps_alvo: nulo(texto(20)), descanso_segundos: nulo(inteiro), carga_sugerida_kg: nulo({ tipo: "numero", min: 0, max: 100_000 } as const),
} as const;
const obrig = <T extends object>(c: T) => ({ ...c, obrigatorio: true }) as T & { obrigatorio: true };

/** O corpo de cada ação: as chaves que ela aceita (o que não está aqui cai). O treino_pronto_salvar tem o leitor dele (lerTreinoPronto). */
export const CORPOS_DAS_ACOES = {
  // ───── modelos ─────
  modelo_criar: { nome: texto(NOME_MAX, true) },
  modelo_editar: { id: uuidObrig, nome: texto(NOME_MAX, true) },
  modelo_excluir: { id: uuidObrig },
  modelo_exercicio_incluir: { grupo: uuidObrig, exercicio: uuidObrig, ordem: obrig(inteiro) },
  modelo_exercicio_tirar: { grupo: uuidObrig, exercicio: uuidObrig },
  modelo_exercicio_prescrever: { grupo: uuidObrig, exercicio: uuidObrig, ...CAMPOS_DA_PRESCRICAO },
  modelo_ordenar: { grupo: uuidObrig, ids: { tipo: "ids", max: ORDEM_MAX, obrigatorio: true } },
  pasta_criar: { nome: texto(NOME_MAX, true) },
  pasta_editar: { id: uuidObrig, nome: texto(NOME_MAX, true) },
  pasta_excluir: { id: uuidObrig },
  pasta_vincular: { pasta: uuidObrig, grupo: uuidObrig },
  pasta_desvincular: { pasta: uuidObrig, grupo: uuidObrig },
  // ───── biblioteca ─────
  exercicio_criar: {
    ...CAMPOS_DO_EXERCICIO, nome: texto(NOME_MAX, true), grupo_muscular: texto(NOME_MAX, true), tipo: { tipo: "enum", valores: TIPOS_DE_EXERCICIO, obrigatorio: true },
  },
  exercicio_editar: { id: uuidObrig, ...CAMPOS_DO_EXERCICIO, imagem_url: nulo(texto(URL_MAX)) },
  exercicio_excluir: { id: uuidObrig },
  exercicio_foto_preparar: {
    exercicio: uuidObrig, tipo: { tipo: "enum", valores: Object.keys(TIPOS_DE_IMAGEM), obrigatorio: true },
    tamanho: { tipo: "inteiro", min: 1, max: IMAGEM_MAX_BYTES, obrigatorio: true },
  },
  grupo_muscular_criar: { nome: texto(NOME_MAX, true) },
  grupo_muscular_excluir: { id: uuidObrig },
  // o nome e a foto que os alunos veem nas telas antigas (o espelho do Perfil): só a linha de quem chama
  professor_perfil: { nome: texto(NOME_MAX), foto_url: nulo(texto(URL_MAX)) },
  // ───── master ─────
  treino_pronto_salvar: {},
  treino_pronto_ativo: { id: uuidObrig, ativo: booleanoObrig },
  exercicio_global_criar: { ...CAMPOS_DO_GLOBAL, nome: texto(NOME_MAX, true), grupo_muscular: texto(NOME_MAX, true) },
  exercicio_global_editar: { id: uuidObrig, ...CAMPOS_DO_GLOBAL },
  exercicio_global_excluir: { id: uuidObrig },
  exercicio_global_promover: { id: uuidObrig },
  grupo_global_criar: { nome: texto(NOME_MAX, true) },
  grupo_global_excluir: { id: uuidObrig },
} as const satisfies Record<AcaoTreinos, CamposDaAcao>;

/** O valor de um campo de gravação (sem o null — o null é do lerCamposDaAcao): os 2 tipos daqui; o resto, o do motor. */
function valorDoCampo(c: CampoDaAcao, v: unknown): { ok: true; valor: unknown } | { ok: false } {
  const fora = { ok: false as const };
  switch (c.tipo) {
    case "numero":
      return typeof v === "number" && Number.isFinite(v) && v >= c.min && v <= c.max ? { ok: true, valor: v } : fora;
    case "ids":
      return Array.isArray(v) && v.length >= 1 && v.length <= c.max && v.every((x) => typeof x === "string" && UUID.test(x))
        ? { ok: true, valor: (v as string[]).map((x) => x.toLowerCase()) }
        : fora;
    default:
      return valorDoParam(c, v);
  }
}

/**
 * As chaves que a gravação aceita (as de fora caem): ausente = não muda (não vai ao banco); null = vai como null SÓ onde o campo aceita
 * (`nulo`), senão dados_invalidos; obrigatório ausente ou null → dados_invalidos. Nada roda com um campo fora da forma.
 */
export function lerCamposDaAcao(
  corpo: Record<string, unknown>,
  campos: CamposDaAcao,
): { ok: true; valores: Record<string, unknown> } | { ok: false; campo: string } {
  const valores: Record<string, unknown> = {};
  for (const [nome, c] of Object.entries(campos)) {
    const v = Object.prototype.hasOwnProperty.call(corpo, nome) ? corpo[nome] : undefined;
    if (v === undefined) {
      if (c.obrigatorio) return { ok: false, campo: nome };
      continue;
    }
    if (v === null) {
      if ("nulo" in c && c.nulo === true && !c.obrigatorio) {
        valores[nome] = null;
        continue;
      }
      return { ok: false, campo: nome };
    }
    const r = valorDoCampo(c, v);
    if (r.ok === false) return { ok: false, campo: nome };
    valores[nome] = r.valor;
  }
  return { ok: true, valores };
}

/** As chaves que a ação aceita, conferidas; uma fora da forma → dados_invalidos (o nome dela vai ao log, nunca o valor). */
export function lerCorpoDaAcao(
  acao: AcaoTreinos,
  corpo: Record<string, unknown>,
): { ok: true; valores: Record<string, unknown> } | { ok: false; erro: "dados_invalidos"; campo: string } {
  const r = lerCamposDaAcao(corpo, CORPOS_DAS_ACOES[acao] as CamposDaAcao);
  return r.ok === true ? r : { ok: false, erro: "dados_invalidos", campo: r.campo };
}

/** As chaves do corpo (já conferido) que vão como colunas — só as que vieram (o null também: limpa a coluna, como a tela manda). */
export function colunasDe(v: Record<string, unknown>, chaves: readonly string[]): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const k of chaves) if (Object.prototype.hasOwnProperty.call(v, k)) saida[k] = v[k];
  return saida;
}
/** As colunas da prescrição, do exercício do painel e do exercício global, na ordem (o que vai ao update/insert). */
export const COLUNAS_DA_PRESCRICAO = Object.keys(CAMPOS_DA_PRESCRICAO);
export const COLUNAS_DO_EXERCICIO = Object.keys(CAMPOS_DO_EXERCICIO);
export const COLUNAS_DO_GLOBAL = Object.keys(CAMPOS_DO_GLOBAL);

// ───────────────────────── o treino pronto do master (a RPC treino_pronto_salvar) ─────────────────────────
/** As colunas da linha do treino pronto que a tela manda (a `linha` do salvarTreinoPronto de hoje) — todas, o descricao pode ser null. */
export const COLUNAS_DO_TREINO_PRONTO = ["codigo", "nome", "objetivo", "nivel", "dias_por_semana", "divisao", "descricao", "ordem", "ativo"] as const;

type Valor = { ok: true; valor: unknown } | { ok: false };
const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const umTexto = (v: unknown, max: number, vazio = true): Valor =>
  typeof v === "string" && v.length <= max && (vazio || v.length > 0) ? { ok: true, valor: v } : { ok: false };
const umInteiro = (v: unknown, min = INT4.min, max = INT4.max): Valor =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? { ok: true, valor: v } : { ok: false };

/**
 * O corpo do treino_pronto_salvar { id?, treino, divisoes }: o id (uuid ou nada — criar), a linha com as 9 colunas da tela (as de fora
 * caem) e as divisões (1 a 26: letra, nome, dias, exercícios — até 100, cada um com exercicio_id, series, reps, descanso_segundos e
 * observacao; as de fora caem). Tipos e tetos aqui; o domínio (objetivo, nível, letra, dias, séries, descanso) é das regras da tabela e da
 * RPC (dados_invalidos). Devolve o que vai à RPC, limpo.
 */
export function lerTreinoPronto(
  corpo: Record<string, unknown>,
): { ok: true; id: string | null; treino: Record<string, unknown>; divisoes: Array<Record<string, unknown>> } | { ok: false; erro: "dados_invalidos"; campo: string } {
  const fora = (campo: string) => ({ ok: false as const, erro: "dados_invalidos" as const, campo });
  const id = corpo.id;
  if (id !== undefined && id !== null && !(typeof id === "string" && UUID.test(id))) return fora("id");
  const t = corpo.treino;
  if (!ehObjeto(t)) return fora("treino");
  const tetos: Record<(typeof COLUNAS_DO_TREINO_PRONTO)[number], (v: unknown) => Valor> = {
    codigo: (v) => umTexto(v, 100, false),
    nome: (v) => umTexto(v, NOME_MAX),
    objetivo: (v) => umTexto(v, 40),
    nivel: (v) => umTexto(v, 40),
    dias_por_semana: (v) => umInteiro(v),
    divisao: (v) => umTexto(v, NOME_MAX),
    descricao: (v) => (v === null ? { ok: true, valor: null } : umTexto(v, TEXTO_MAX)),
    ordem: (v) => umInteiro(v),
    ativo: (v) => (typeof v === "boolean" ? { ok: true, valor: v } : { ok: false }),
  };
  const treino: Record<string, unknown> = {};
  for (const k of COLUNAS_DO_TREINO_PRONTO) {
    const r = tetos[k](Object.prototype.hasOwnProperty.call(t, k) ? t[k] : undefined);
    if (r.ok === false) return fora(`treino.${k}`);
    treino[k] = r.valor;
  }
  const ds = corpo.divisoes;
  if (!Array.isArray(ds) || ds.length < 1 || ds.length > DIVISOES_MAX) return fora("divisoes");
  const divisoes: Array<Record<string, unknown>> = [];
  for (const d of ds) {
    if (!ehObjeto(d)) return fora("divisoes");
    const letra = umTexto(d.letra, 2, false);
    const nome = umTexto(d.nome, NOME_MAX);
    if (letra.ok === false || nome.ok === false) return fora("divisoes.letra_nome");
    if (!Array.isArray(d.dias) || d.dias.length > 7 || !d.dias.every((x) => typeof x === "string" && x.length <= 3)) return fora("divisoes.dias");
    if (!Array.isArray(d.exercicios) || d.exercicios.length > EXERCICIOS_POR_DIVISAO_MAX) return fora("divisoes.exercicios");
    const exercicios: Array<Record<string, unknown>> = [];
    for (const e of d.exercicios) {
      if (!ehObjeto(e) || typeof e.exercicio_id !== "string" || !UUID.test(e.exercicio_id)) return fora("divisoes.exercicios.exercicio_id");
      const series = umInteiro(e.series);
      const reps = umTexto(e.reps, 20);
      const descanso = e.descanso_segundos === null || e.descanso_segundos === undefined ? { ok: true as const, valor: null } : umInteiro(e.descanso_segundos);
      const obs = e.observacao === null || e.observacao === undefined ? { ok: true as const, valor: null } : umTexto(e.observacao, TEXTO_MAX);
      if (series.ok === false || reps.ok === false || descanso.ok === false || obs.ok === false) return fora("divisoes.exercicios");
      exercicios.push({ exercicio_id: e.exercicio_id.toLowerCase(), series: series.valor, reps: reps.valor, descanso_segundos: descanso.valor, observacao: obs.valor });
    }
    divisoes.push({ letra: letra.valor, nome: nome.valor, dias: [...(d.dias as string[])], exercicios });
  }
  return { ok: true, id: typeof id === "string" ? id.toLowerCase() : null, treino, divisoes };
}

// ───────────────────────── quem chama: o dono e o master ─────────────────────────
/**
 * O app_metadata.role do token de quem chama — SÓ depois de a porta conferir o token (pelo JWKS do Treino ou pelo getUser): é o que o
 * physiq_is_master() do banco lê (o JWT da troca de token, auth.jwt() -> app_metadata ->> role). Token que não dá para ler → null.
 */
export function papelDoToken(token: string): string | null {
  const partes = token.split(".");
  if (partes.length !== 3 || partes[1].length > 16_000) return null;
  try {
    const b64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = new TextDecoder().decode(Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0)));
    const payload = JSON.parse(json) as { app_metadata?: { role?: unknown } } | null;
    const role = payload && typeof payload === "object" ? payload.app_metadata?.role : undefined;
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

/** É master no Treino? A MESMA regra do physiq_papel() (admin ou master — supabase/migrations/20260913000000_saas_professores_alunos.sql). */
export const ehMaster = (papel: string | null | undefined): boolean => papel === "admin" || papel === "master";

/** O dono do que é criado no catálogo: o master cria no GLOBAL (null — o donoAoCriar da tela); os outros, para si (o sub do token). */
export const donoAoCriar = (userId: string, master: boolean): string | null => (master ? null : userId);

// ───────────────────────── a foto do exercício (bucket exercicios/-staging) ─────────────────────────
/** O bucket das fotos dos exercícios no ambiente (o BUCKET_EXERCICIOS da tela: exercicios-staging no staging). */
export const bucketDosExercicios = (schema: "public" | "staging"): string => (schema === "staging" ? "exercicios-staging" : "exercicios");

/** O caminho da foto do exercício: <id>.<ext> — o MESMO do subirImagem de hoje (a policy do bucket confere que o exercício é de quem grava). */
export function caminhoDaFotoDoExercicio(exercicio: string, tipo: string): string {
  return `${exercicio.toLowerCase()}.${TIPOS_DE_IMAGEM[tipo] ?? "png"}`;
}

/** O domínio próprio da API do Treino (o Worker physiqcalc-api — docs/api-dominio-proprio.md): o VITE_SUPABASE_URL dos builds. */
export const URL_API_TREINO = "https://api.physiqcalc.com.br";

/**
 * A URL que o exercicio_editar pode gravar como a foto NOVA: a pública DESTE exercício neste bucket — <host>/storage/v1/object/public/
 * <bucket>/<id>.<gif|webp|png|jpg> com o ?v=<instante> que a tela põe —, num dos hosts da API do Treino (o domínio próprio e o do projeto).
 * Devolve o caminho do arquivo (para conferir que ele está lá) ou null.
 */
export function caminhoDaUrlDaFoto(url: unknown, bucket: string, exercicio: string, hosts: readonly string[]): string | null {
  if (typeof url !== "string" || url.length > URL_MAX) return null;
  for (const host of hosts) {
    const base = `${host.replace(/\/+$/, "")}/storage/v1/object/public/${bucket}/`;
    if (!host || !url.startsWith(base)) continue;
    const m = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(gif|webp|png|jpg)(?:\?v=\d{1,16})?$/.exec(url.slice(base.length));
    return m && m[1] === exercicio.toLowerCase() ? `${m[1]}.${m[2]}` : null;
  }
  return null;
}

// ───────────────────────── o despacho ─────────────────────────
export type PedidoTreinos =
  | { modulo: "leitura"; acao: "ler" }
  | { modulo: "modelos"; acao: AcaoDosModelos }
  | { modulo: "biblioteca"; acao: AcaoDaBiblioteca }
  | { modulo: "master"; acao: AcaoDoMaster };

/** O módulo e a ação do pedido (null = acao_invalida). O `ler` vai ao catálogo; as 3 listas não se cruzam (os testes conferem). */
export function moduloDoPedido(corpo: Record<string, unknown>): PedidoTreinos | null {
  const v = corpo.acao;
  if (v === "ler") return { modulo: "leitura", acao: "ler" };
  if (typeof v !== "string") return null;
  if ((ACOES_DOS_MODELOS as readonly string[]).includes(v)) return { modulo: "modelos", acao: v as AcaoDosModelos };
  if ((ACOES_DA_BIBLIOTECA as readonly string[]).includes(v)) return { modulo: "biblioteca", acao: v as AcaoDaBiblioteca };
  if ((ACOES_DO_MASTER as readonly string[]).includes(v)) return { modulo: "master", acao: v as AcaoDoMaster };
  return null;
}

// ───────────────────────── erros ─────────────────────────
/** Os códigos que as 2 RPCs novas (a migration 20261013100000_hml21d) levantam de propósito (o raise com o código na mensagem). */
export const ERROS_DAS_RPCS_DO_TREINO = ["sem_login", "dados_invalidos", "nao_encontrado"] as const;

/** Status HTTP de cada erro (o corpo leva { ok: false, erro } e a tela escreve a frase — src/treino/servidor.ts). */
export const STATUS_DO_ERRO_TREINO: Record<string, number> = {
  sem_login: 401,
  sem_acesso: 403,
  nao_encontrado: 404,
  metodo: 405,
  conflito: 409,
  em_uso: 409,
  corpo_grande: 413,
  muitas_acoes: 429,
  erro_interno: 500,
  storage_falhou: 502,
  tempo_esgotado: 504,
  // 400: acao_invalida, dados_invalidos, schema_invalido, consulta_invalida, lote_grande
};

export function statusDoErroTreino(erro: unknown): number {
  return STATUS_DO_ERRO_TREINO[String(erro ?? "")] ?? 400;
}

/**
 * O erro do banco (ou de uma RPC) como o código da resposta: os `conhecidos` (o raise de propósito) passam como estão; com `emUso`, o 23503
 * (a linha é usada por outra — o exercício num treino pronto, o modelo que um aluno recebe; ou o que ela cita sumiu) = `em_uso`, a frase de
 * hoje da tela; o resto, a tabela do motor (a MESMA do erroDoBanco da nutricao). `inesperado` = a função avisa (log.excecao).
 */
export function erroDoTreino(
  e: { code?: unknown; message?: unknown; name?: unknown } | null | undefined,
  conhecidos: readonly string[] = [],
  opcoes: { emUso?: boolean } = {},
): { erro: string; inesperado: boolean } {
  if (opcoes.emUso === true && e?.code === "23503") return { erro: "em_uso", inesperado: false };
  return erroDaLeitura(e, conhecidos);
}
