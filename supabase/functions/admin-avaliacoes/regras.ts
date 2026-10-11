// Physiq hml-19c (H-41 · jeito 2 · decisão 15 da spec hml-19, 11/10/2026) — regras PURAS da admin-avaliacoes (Banco do Treino). Sem
// Deno, sem rede e sem banco: usadas pela função (o deploy leva a pasta da função) e testadas no Vitest
// (src/lib/adminAvaliacoesRegras.test.ts) — o molde do admin-tags/regras.ts.
//   · as ações que GRAVAM (hml-14, H-51 item 2: conferem a sessão no GoTrue a cada pedido; a list segue pelo JWKS): as de antes e as
//     3 da foto mensal;
//   · a foto mensal do Calc (Perfil do aluno › Avaliação › Fotos): o mês "aaaa-mm" (mês de 01 a 12), o tipo (a lista fechada do
//     TipoFoto de src/lib/registrosFotos.ts = o check da tabela physiq_registros_fotos) e o caminho <aluno>/<aaaa-mm>/<tipo>.jpg
//     MONTADO AQUI — nunca vem do navegador. O caminho que volta (o do preparar, no salvar) e o da linha (no excluir) só valem se forem
//     do MESMO aluno: caminho de outro aluno é recusado;
//   · o código de cada recusa (o corpo leva { error: <código> }, como as ações de antes — a tela traduz pelo código) e o status HTTP;
//   · o erro do Storage e do banco quando a função grava COMO A PESSOA: a policy recusou → forbidden (403); o resto → internal (500).

/** As ações de antes: create/update/proxima/delete gravam com a service role; a list lê. O comportamento delas não muda nesta W. */
export const ACOES_DE_ANTES = ["list", "create", "update", "proxima", "delete"] as const;

/** hml-19c: a foto mensal pela função, COMO A PESSOA (o token dela no Storage e na tabela — o RLS de hoje decide). */
export const ACOES_FOTO = ["foto_preparar", "foto_salvar", "foto_excluir"] as const;
export type AcaoFoto = (typeof ACOES_FOTO)[number];

/** As ações que GRAVAM: conferem a sessão no GoTrue a cada pedido ("sair de todos", a conta apagada e o papel tirado valem na hora). */
export const ACOES_QUE_GRAVAM: ReadonlySet<string> = new Set<string>(["create", "update", "proxima", "delete", ...ACOES_FOTO]);

/** A ação é uma das 3 da foto mensal? */
export function ehAcaoFoto(v: unknown): v is AcaoFoto {
  return typeof v === "string" && (ACOES_FOTO as readonly string[]).includes(v);
}

/** Os 4 tipos de foto do mês (o check da tabela e o TipoFoto da tela). */
export const TIPOS_FOTO = ["frente", "costas", "lateral_direita", "lateral_esquerda"] as const;
export type TipoFoto = (typeof TIPOS_FOTO)[number];
export function ehTipoFoto(v: unknown): v is TipoFoto {
  return typeof v === "string" && (TIPOS_FOTO as readonly string[]).includes(v);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

const MES = /^\d{4}-(\d{2})$/;
/** "aaaa-mm" — o valor do <input type="month"> e a regra de hoje (^\d{4}-\d{2}$) — com o mês de 01 a 12. */
export function mesValido(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = MES.exec(v);
  if (!m) return false;
  const mes = Number(m[1]);
  return mes >= 1 && mes <= 12;
}

/** O mês de referência da linha: "aaaa-mm" → "aaaa-mm-01" (sempre o dia 1, como hoje). */
export const mesRef = (mes: string): string => `${mes}-01`;

/**
 * O schema do pedido para a foto: só "public" ou "staging" (fora da lista → null → 400, nunca cai na produção por engano). A mesma
 * leitura do resolveSchema do index.ts (minúsculas, sem aparar), para os 2 nunca discordarem.
 */
export function schemaDaFoto(v: unknown): "public" | "staging" | null {
  const s = typeof v === "string" ? v.toLowerCase() : "";
  return s === "public" || s === "staging" ? s : null;
}

/** O bucket do ambiente (o mesmo BUCKET_REGISTROS da tela): no staging, o "-staging". */
export function bucketDosRegistros(schema: string): string {
  return schema === "staging" ? "registros-staging" : "registros";
}

/** O caminho do objeto, montado NO SERVIDOR: <aluno>/<aaaa-mm>/<tipo>.jpg (a 1ª pasta é o aluno — é ela que as policies do bucket leem). */
export function caminhoDaFotoMensal(alunoId: string, mes: string, tipo: TipoFoto): string {
  return `${alunoId.toLowerCase()}/${mes}/${tipo}.jpg`;
}

/** O caminho é de uma foto mensal DESTE aluno, no formato do caminhoDaFotoMensal? (outro aluno, outra pasta, fora do formato → não) */
export function caminhoDoAluno(caminho: unknown, alunoId: unknown): caminho is string {
  if (typeof caminho !== "string" || !ehUuid(alunoId) || caminho.length > 120) return false;
  const partes = caminho.split("/");
  if (partes.length !== 3 || partes[0] !== alunoId.toLowerCase() || !mesValido(partes[1])) return false;
  return partes[2].endsWith(".jpg") && ehTipoFoto(partes[2].slice(0, -".jpg".length));
}

/** Os códigos das recusas da foto (a tela traduz pelo código: src/painel/aluno/avaliacao/mensagens.ts). */
export type RecusaFoto = "missing_userId" | "missing_fotoId" | "mes_invalido" | "tipo_invalido" | "forbidden";

const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * foto_preparar { userId, mes, tipo } · foto_salvar { userId, mes, tipo, caminho }: o aluno (uuid), o mês e o tipo conferidos e o
 * caminho montado aqui. O `caminho` que o navegador devolve no salvar (o que o preparar deu) tem de ser ESTE; outro (outro aluno,
 * outro mês, outro tipo, outra pasta) → forbidden. Sem `caminho`, vale o montado aqui.
 */
export function lerPedidoDeFoto(corpo: unknown):
  | { ok: true; alunoId: string; mes: string; tipo: TipoFoto; caminho: string }
  | { ok: false; erro: RecusaFoto } {
  const c = objeto(corpo);
  if (!ehUuid(c.userId)) return { ok: false, erro: "missing_userId" };
  if (!mesValido(c.mes)) return { ok: false, erro: "mes_invalido" };
  if (!ehTipoFoto(c.tipo)) return { ok: false, erro: "tipo_invalido" };
  const alunoId = c.userId.toLowerCase();
  const caminho = caminhoDaFotoMensal(alunoId, c.mes, c.tipo);
  if (c.caminho !== undefined && c.caminho !== null && c.caminho !== caminho) return { ok: false, erro: "forbidden" };
  return { ok: true, alunoId, mes: c.mes, tipo: c.tipo, caminho };
}

/** foto_excluir { fotoId }: o id da linha (uuid). O caminho do arquivo vem da LINHA, nunca do corpo. */
export function lerExclusaoDeFoto(corpo: unknown): { ok: true; fotoId: string } | { ok: false; erro: "missing_fotoId" } {
  const c = objeto(corpo);
  return ehUuid(c.fotoId) ? { ok: true, fotoId: c.fotoId.toLowerCase() } : { ok: false, erro: "missing_fotoId" };
}

/** O status HTTP de cada código da foto (o corpo leva { error: código }); o que não está aqui é 500. */
export const STATUS_FOTO: Readonly<Record<string, number>> = {
  missing_userId: 400, missing_fotoId: 400, mes_invalido: 400, tipo_invalido: 400, schema_invalido: 400, invalid_action: 400,
  forbidden: 403,
  arquivo_ausente: 404,
  internal: 500,
};
export function statusDaFoto(codigo: string): number {
  return STATUS_FOTO[codigo] ?? 500;
}

/**
 * O erro do Storage (assinar, listar) como a pessoa: a policy do bucket recusou (HTTP 403, ou o statusCode "403" que o Storage põe no
 * corpo do 400, ou a mensagem do RLS) → forbidden; o resto (Storage fora, tempo esgotado) → internal.
 */
export function erroDoStorage(e: unknown): "forbidden" | "internal" {
  const o = objeto(e);
  const status = typeof o.status === "number" ? o.status : 0;
  const msg = typeof o.message === "string" ? o.message : "";
  if (status === 403 || String(o.statusCode ?? "") === "403" || /row-level security/i.test(msg)) return "forbidden";
  return "internal";
}

/** O erro do banco (PostgREST) como a pessoa: o RLS recusou (42501) → forbidden; o resto → internal (com aviso). */
export function erroDoBanco(e: unknown): "forbidden" | "internal" {
  return objeto(e).code === "42501" ? "forbidden" : "internal";
}

/** O tempo da ida estourou? (o "TimeoutError" do buscarComTempo chega na mensagem do erro do supabase-js) — só para o log. */
export function foiTempo(e: unknown): boolean {
  const o = objeto(e);
  return /^(TimeoutError|AbortError)\b/.test(String(o.name ?? "")) || /^(TimeoutError|AbortError)\b/.test(String(o.message ?? ""));
}
