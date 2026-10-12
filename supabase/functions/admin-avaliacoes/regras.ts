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

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// hml-20a (H-42 · jeito 2, etapa 2 · decisão 14 da spec hml-20, 11/10/2026) — a Evolução do PRÓPRIO aluno pela função (a ação
// minha_evolucao, antes do requireAdmin): o que a tela lia direto no REST do Treino (src/evolucao/fontes.ts, carregarTreino) passa a
// ser lido aqui, COMO A PESSOA (a chave anon do Treino + o token dela; o RLS de hoje — o aluno lê as próprias linhas e a própria pasta
// do bucket). Qualquer papel lê SÓ O PRÓPRIO: o dono de todas as consultas é o `sub` do token; nada do corpo vira filtro.
//   · as colunas em LISTA FECHADA (sai o select("*")): o perfil = as 37 de hoje (a composição atual); as avaliações = as que a série
//     usa (src/evolucao/serie.ts), com a observação como hoje; as fotos mensais = as 5 de hoje;
//   · as 200 avaliações e as 200 fotos MAIS NOVAS (hml-14d, D30), as avaliações devolvidas em ordem CRESCENTE (como a tela fazia);
//   · a URL assinada das fotos (bucket do ambiente, 1 h) sai daqui, só dos caminhos que a própria consulta leu, RELATIVA ao projeto
//     (/storage/v1/object/sign/…?token=…): a tela monta com o domínio dela — a mesma URL de hoje;
//   · o freio por pessoa (em memória, 60/min): a leitura não passa pelo check_rate_limit da service role.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

/** As ações de LEITURA da pessoa sobre ela mesma (antes do requireAdmin; nunca gravam — fora de ACOES_QUE_GRAVAM). */
export const ACOES_DE_LEITURA = ["minha_evolucao"] as const;
export type AcaoDeLeitura = (typeof ACOES_DE_LEITURA)[number];
export function ehAcaoDeLeitura(v: unknown): v is AcaoDeLeitura {
  return typeof v === "string" && (ACOES_DE_LEITURA as readonly string[]).includes(v);
}

/** O perfil que a Evolução mostra (a composição atual que o personal gravou) — as 37 colunas de hoje. */
export const COLUNAS_PERFIL_EVOLUCAO = [
  "id", "sexo", "idade", "peso", "altura", "metodo_avaliacao", "percentual_gordura", "massa_gorda", "massa_magra",
  "massa_muscular", "agua_corporal", "gordura_visceral", "tmb_mifflin", "tmb_katch", "tmb_balanca", "tmb_metodo",
  "dobra_1", "dobra_2", "dobra_3", "dobra_4", "dobra_5", "dobra_6", "dobra_7",
  "medida_pescoco", "medida_ombro", "medida_peitoral", "medida_cintura", "medida_abdomen", "medida_quadril",
  "medida_braco_d", "medida_braco_e", "medida_antebraco_d", "medida_antebraco_e", "medida_coxa_d", "medida_coxa_e",
  "medida_panturrilha_d", "medida_panturrilha_e",
] as const;

/** As colunas das avaliações que a série usa (serie.ts: avaliacaoDoTreino, tmbEscolhida, as dobras e as medidas), com a observação. */
export const COLUNAS_AVALIACOES_EVOLUCAO = [
  "id", "data_avaliacao", "created_at", "metodo_avaliacao", "peso", "altura", "percentual_gordura", "massa_gorda", "massa_magra",
  "massa_muscular", "agua_corporal", "gordura_visceral", "tmb_mifflin", "tmb_katch", "tmb_balanca", "tmb_metodo",
  "dobra_1", "dobra_2", "dobra_3", "dobra_4", "dobra_5", "dobra_6", "dobra_7",
  "medida_pescoco", "medida_ombro", "medida_peitoral", "medida_cintura", "medida_abdomen", "medida_quadril",
  "medida_braco_d", "medida_braco_e", "medida_antebraco_d", "medida_antebraco_e", "medida_coxa_d", "medida_coxa_e",
  "medida_panturrilha_d", "medida_panturrilha_e", "observacao",
] as const;

/** As fotos mensais (as 5 colunas de hoje). */
export const COLUNAS_FOTOS_EVOLUCAO = ["id", "mes_ref", "tipo", "storage_path", "created_at"] as const;

/** hml-14d (D30): quantas avaliações e fotos mensais a Evolução lê (as MAIS NOVAS). */
export const MAX_AVALIACOES_EVOLUCAO = 200;
export const MAX_FOTOS_EVOLUCAO = 200;
/** A validade da URL assinada das fotos (a de hoje: 1 h). */
export const VALIDADE_URL_EVOLUCAO_S = 3600;
/** Pedidos por minuto por pessoa, nesta instância (em memória). */
export const FREIO_EVOLUCAO_POR_MINUTO = 60;

/** O freio por pessoa em memória: até `max` pedidos por `janelaMs` em cada chave (a mesma regra da porta do principal). */
export function criarFreio(max: number, janelaMs: number, limiteDeChaves = 5000): (chave: string, agora?: number) => boolean {
  const janelas = new Map<string, number[]>();
  return (chave: string, agora: number = Date.now()) => {
    const validos = (janelas.get(chave) ?? []).filter((t) => t > agora - janelaMs);
    if (validos.length >= max) {
      janelas.set(chave, validos);
      return false;
    }
    validos.push(agora);
    janelas.set(chave, validos);
    if (janelas.size > limiteDeChaves) janelas.clear();
    return true;
  };
}

const PREFIXO_ASSINADA = "/storage/v1/object/sign/";

/** Os caminhos que a PRÓPRIA consulta leu (storage_path de cada foto): texto, sem repetição. */
export function caminhosDasFotos(fotos: unknown): string[] {
  const saida = new Set<string>();
  for (const f of Array.isArray(fotos) ? fotos : []) {
    const c = objeto(f).storage_path;
    if (typeof c === "string" && c.length > 0 && c.length <= 1024) saida.add(c);
  }
  return [...saida];
}

/** A parte relativa (/storage/v1/object/sign/<bucket>/…?token=…) da URL que o Storage assinou; outra coisa → null. */
export function assinaturaRelativa(url: unknown, bucket: string): string | null {
  if (typeof url !== "string") return null;
  const i = url.indexOf(`${PREFIXO_ASSINADA}${bucket}/`);
  return i >= 0 ? url.slice(i) : null;
}

/** caminho → URL relativa, SÓ para os caminhos pedidos (o que o Storage devolver a mais é ignorado); o que falhou fica de fora. */
export function urlsAssinadas(pedidos: readonly string[], resposta: unknown, bucket: string): Map<string, string> {
  const quero = new Set(pedidos);
  const mapa = new Map<string, string>();
  for (const r of Array.isArray(resposta) ? resposta : []) {
    const o = objeto(r);
    if (typeof o.path !== "string" || !quero.has(o.path) || o.error) continue;
    const rel = assinaturaRelativa(o.signedUrl, bucket);
    if (rel) mapa.set(o.path, rel);
  }
  return mapa;
}

/**
 * A resposta da minha_evolucao = a ParteTreino da tela (src/evolucao/tipos.ts): o perfil (ou null), as avaliações em ordem CRESCENTE (a
 * consulta traz as mais novas primeiro) e as fotos com a `url` relativa (null quando não deu para assinar — a tela mostra "Foto
 * indisponível", como hoje).
 */
export function parteDaEvolucao(perfil: unknown, avaliacoes: unknown, fotos: unknown, urls: ReadonlyMap<string, string>): {
  perfil: Record<string, unknown> | null;
  avaliacoes: unknown[];
  fotos: unknown[];
} {
  const p = perfil && typeof perfil === "object" && !Array.isArray(perfil) ? (perfil as Record<string, unknown>) : null;
  return {
    perfil: p,
    avaliacoes: Array.isArray(avaliacoes) ? [...avaliacoes].reverse() : [],
    fotos: (Array.isArray(fotos) ? fotos : []).map((f) => {
      const o = objeto(f);
      return { ...o, url: typeof o.storage_path === "string" ? urls.get(o.storage_path) ?? null : null };
    }),
  };
}
