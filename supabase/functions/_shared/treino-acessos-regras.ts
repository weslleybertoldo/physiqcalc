// Physiq W-A P2 (13/10/2026) — regras PURAS da função `treino-acessos` (Banco do Treino): a linha "Treino — séries" da aba Acessos (P4) lê e muda
// o cadeado das séries do aluno (physiq_profiles.series_travadas). Sem Deno e sem rede: usadas pela função (supabase/functions/treino-acessos/) e
// testadas no Vitest (src/acessos/treinoAcessosRegras.test.ts). Mora no _shared do TREINO (o deploy_function.sh leva só o _shared do projeto):
// nada daqui importa do principal. O desenho (spec W-A §2.2-4, §5.2, §5.5; revisão C4): o CORS (o da treino-leitura), a forma do pedido
// (o campo é `acao`, como nas outras 2 da W-A), o nível ↔ o booleano do Treino ("ver" = travadas), os parâmetros das 2 RPCs do principal, o
// que a acessos_ler respondeu (quem lê, quem muda, o login, a conta, o treino_user_id guardado e os módulos da matrícula) e o status.

/** As origens da treino-leitura (o teste confere com o arquivo dela): o site, o www, o staging, o vercel antigo, o APK e o dev local. */
export const ORIGENS_PERMITIDAS = [
  "https://physiqcalc.com.br", "https://www.physiqcalc.com.br", "https://physiqcalc-staging.vercel.app", "https://physiqcalc.vercel.app",
  "capacitor://localhost", "https://localhost", "http://localhost:8080", "http://localhost:5173",
] as const;

export function corsTreinoAcessos(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin && (ORIGENS_PERMITIDAS as readonly string[]).includes(origin) ? origin : "https://physiqcalc.com.br",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-schema",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export type SchemaTreino = "public" | "staging";
/** O x-schema: ausente = public (como a treino-leitura e a porta-pessoa do principal); fora da lista = null (400 schema_invalido). */
export function schemaDoPedido(v: string | null | undefined): SchemaTreino | null {
  const s = (v || "public").trim().toLowerCase();
  return s === "public" || s === "staging" ? s : null;
}

/** O maior corpo aceito (o pedido é { acao, aluno, valor }): acima, 413 corpo_grande sem ler o resto. */
export const LIMITE_CORPO = 16 * 1024;
/** O freio no isolate (os da treino-leitura): por IP antes do token e por pessoa depois, por minuto. */
export const FREIO = { porIp: 120, porPessoa: 60 } as const;

export const NIVEIS_DAS_SERIES = ["ver", "mexer"] as const;
export type NivelDasSeries = (typeof NIVEIS_DAS_SERIES)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PedidoTreinoAcessos = { acao: "ler"; aluno: string } | { acao: "salvar"; aluno: string; valor: NivelDasSeries };
export type RecusaTreino = { ok: false; erro: string; campo?: string };

/** O pedido na forma ou a recusa: acao_invalida (o action da treino-leitura também) · dados_invalidos com o campo. Nada mais do corpo passa. */
export function lerPedidoTreinoAcessos(corpo: unknown): { ok: true; pedido: PedidoTreinoAcessos } | RecusaTreino {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return { ok: false, erro: "acao_invalida" };
  const c = corpo as Record<string, unknown>;
  if (c.acao !== "ler" && c.acao !== "salvar") return { ok: false, erro: "acao_invalida" };
  if (typeof c.aluno !== "string" || !UUID.test(c.aluno)) return { ok: false, erro: "dados_invalidos", campo: "aluno" };
  const aluno = c.aluno.toLowerCase();
  if (c.acao === "ler") return { ok: true, pedido: { acao: "ler", aluno } };
  if (c.valor !== "ver" && c.valor !== "mexer") return { ok: false, erro: "dados_invalidos", campo: "valor" };
  return { ok: true, pedido: { acao: "salvar", aluno, valor: c.valor } };
}

/** "ver" = o cadeado fechado (series_travadas = true: o aluno não põe nem tira séries); o resto = "mexer" (o padrão do Treino é false). */
export const nivelDasSeries = (travadas: unknown): NivelDasSeries => (travadas === true ? "ver" : "mexer");
export const travadasDoNivel = (n: NivelDasSeries): boolean => n === "ver";

/** Os parâmetros das 2 RPCs do principal (os nomes da migration 20261012200000_wa1_acessos.sql — o teste confere). */
export const argsDoLer = (aluno: string): Record<string, unknown> => ({ p_aluno: aluno });
export const argsDoRegistro = (aluno: string, de: NivelDasSeries, para: NivelDasSeries): Record<string, unknown> => ({ p_aluno: aluno, p_de: de, p_para: para });

export type DoPrincipal =
  | { ok: true; userId: string | null; contaId: string | null; treinoUserId: string | null; podeMudar: boolean; modulos: string[] }
  | { ok: false; erro: string; inesperado: boolean };

/** As recusas da acessos_ler que vão à tela como estão (wa_rota: sem_login · sem_acesso · aluno_inexistente · dados_invalidos). */
const RECUSAS_DO_PRINCIPAL = ["sem_login", "sem_acesso", "aluno_inexistente", "dados_invalidos"];

/** O que a acessos_ler (como a pessoa, pelo REST do principal) respondeu — o que a função precisa, ou o código (o resto = principal_indisponivel). */
export function respostaDoAcessosLer(status: number, corpo: unknown): DoPrincipal {
  const c = corpo && typeof corpo === "object" && !Array.isArray(corpo) ? (corpo as Record<string, unknown>) : null;
  if (status === 200 && c?.ok === true) {
    const id = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v.toLowerCase() : null);
    return {
      ok: true, userId: id(c.user_id), contaId: id(c.conta_id), treinoUserId: id(c.treino_user_id), podeMudar: c.pode_mudar === true,
      modulos: Array.isArray(c.modulos) ? c.modulos.filter((m): m is string => typeof m === "string") : [],
    };
  }
  if (status === 200 && c?.ok === false && typeof c.erro === "string" && RECUSAS_DO_PRINCIPAL.includes(c.erro)) {
    return { ok: false, erro: c.erro, inesperado: false };
  }
  if (status === 401) return { ok: false, erro: "sem_login", inesperado: false };
  return { ok: false, erro: "principal_indisponivel", inesperado: true };
}

export const temTreino = (modulos: readonly string[]): boolean => modulos.includes("treino");
export const registroDeu = (status: number, corpo: unknown): boolean =>
  status === 200 && !!corpo && typeof corpo === "object" && (corpo as { ok?: unknown }).ok === true;

/** O código do Postgres/PostgREST de uma resposta de erro do principal (o campo pg do log), ou null — nunca a mensagem. */
export function pgDaResposta(corpo: unknown): string | null {
  const code = corpo && typeof corpo === "object" ? (corpo as { code?: unknown }).code : null;
  return typeof code === "string" && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(code) ? code : null;
}

export const STATUS_DO_ERRO_TREINO_ACESSOS: Readonly<Record<string, number>> = {
  dados_invalidos: 400, acao_invalida: 400, schema_invalido: 400,
  sem_login: 401,
  sem_acesso: 403,
  aluno_inexistente: 404, sem_treino: 404,
  metodo: 405,
  sem_modulo: 409,
  corpo_grande: 413,
  muitas_acoes: 429,
  erro_interno: 500,
  principal_indisponivel: 502,
};
export const statusDoErroTreino = (erro: string): number => STATUS_DO_ERRO_TREINO_ACESSOS[erro] ?? 500;
