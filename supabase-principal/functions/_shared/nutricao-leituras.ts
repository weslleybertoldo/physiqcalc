// Physiq hml-20a (H-42 · jeito 2, etapa 2, 11/10/2026) — o CATÁLOGO das leituras da função nutricao (ação `ler`), PURO: sem Deno, sem
// rede e sem banco. O motor (_shared/leitura-lote.ts) lê o pedido por este catálogo e o módulo functions/nutricao/leituras.ts roda cada
// consulta COMO A PESSOA (o RLS de hoje decide quem vê). Cada entrada declara: os params (tipo e teto; o resto do corpo cai), a fonte
// (a RPC de leitura de hoje com os args montados no servidor, ou a tabela com as colunas em lista fechada, os filtros e o teto), o dono
// (consulta "minha": a coluna = quem chama) e o que assinar (o servidor só assina caminho que a própria consulta leu).
// hml-20a — o app do aluno (spec hml-20 §2.5.1); o aluno não manda id nenhum de quem ele é: as RPCs usam o auth.uid() lá dentro.
//   aluno_dieta { dia }          a minha_dieta(p_dia) de hoje (planos, refeições, metas, os ✓ do dia e o diário dos 7 dias)
//   aluno_diario_urls { ids }    as fotos do próprio diário: relê id e path dos ids (≤ 60) como o aluno ("paciente: ler o proprio
//                                diario") e assina no bucket diario do ambiente (1 h) → linhas [{ id, path, url }]
//   aluno_evolucao               a minha_evolucao() de hoje (antropometrias e fotos de evolução de todas as matrículas) + a URL das
//                                fotos (bucket evolucao, 1 h) na MESMA ida — a PartePrincipal da Evolução
// As sub-worktrees seguintes (20b Painel › Aluno, 20c Dieta/Dietas/Pré-consulta/Dashboard) só ACRESCENTAM entradas aqui.
import type { ConsultaLeitura } from "./leitura-lote.ts";
import { bucketDaEvolucao, bucketDoDiario } from "./nutricao-regras.ts";

/** A validade das URLs assinadas de leitura do app do aluno (a mesma de hoje: 1 h). */
export const VALIDADE_URL_LEITURA_S = 3600;
/** Quantos registros do diário por item (a tela divide acima disso; o diário mostra 7 dias). */
export const DIARIO_IDS_MAX = 60;

/** Os buckets do principal que a leitura assina (o nome de produção; bucketDaLeitura dá o do ambiente). */
export type BucketDeLeitura = "diario" | "evolucao";

export const CONSULTAS_NUTRICAO = {
  // ───── hml-20a — o app do aluno ─────
  aluno_dieta: {
    params: { dia: { tipo: "data", obrigatorio: true } },
    fonte: { rpc: "minha_dieta", args: { p_dia: "dia" } },
  },
  aluno_diario_urls: {
    params: { ids: { tipo: "uuids", max: DIARIO_IDS_MAX, obrigatorio: true } },
    fonte: { tabela: "diario_alimentar", colunas: ["id", "path"], teto: DIARIO_IDS_MAX, filtros: [{ param: "ids", coluna: "id", op: "in" }], vivas: true },
    assinar: { bucket: "diario", coluna: "path", validade: VALIDADE_URL_LEITURA_S },
  },
  aluno_evolucao: {
    params: {},
    fonte: { rpc: "minha_evolucao" },
    assinar: { bucket: "evolucao", coluna: "path", lista: "fotos", validade: VALIDADE_URL_LEITURA_S },
  },
} as const satisfies Record<string, ConsultaLeitura>;

export type ConsultaDaNutricao = keyof typeof CONSULTAS_NUTRICAO;
export const CONSULTAS_DA_NUTRICAO = Object.keys(CONSULTAS_NUTRICAO) as ConsultaDaNutricao[];

/** A consulta, se está no catálogo; senão null. */
export function consultaDaNutricao(q: unknown): ConsultaLeitura | null {
  return typeof q === "string" && Object.prototype.hasOwnProperty.call(CONSULTAS_NUTRICAO, q) ? CONSULTAS_NUTRICAO[q as ConsultaDaNutricao] : null;
}

/** O bucket do ambiente (hml-02b: no staging, o "-staging" — o teste nunca lê do bucket da produção). */
export function bucketDaLeitura(bucket: string, schema: "public" | "staging"): string {
  if (bucket === "diario") return bucketDoDiario(schema);
  if (bucket === "evolucao") return bucketDaEvolucao(schema);
  return schema === "staging" ? `${bucket}-staging` : bucket;
}
