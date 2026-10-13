// Physiq W-A P2 (jeito 2, 13/10/2026) — regras PURAS da função `acessos` (banco principal): a aba Acessos do Painel › Aluno (P4) lê e grava
// "o que o aluno pode no app". Sem Deno e sem rede: usadas pela função (supabase-principal/functions/acessos/) e testadas no Vitest
// (src/acessos/acessosRegras.test.ts, com o contrato da migration). O desenho (spec W-A §5.2, §5.5, §5.6):
//   · a FORMA antes da RPC: a ação numa lista fechada (ler · salvar), o aluno (uuid da rota: a matrícula ou o id do Treino), a chave numa
//     lista fechada (acesso_app · diario_alimentar · acesso_link · dieta — treino_series NÃO: as séries vão pela treino-acessos, no Treino) e o
//     nível de cada chave (bloqueado | liberado; a dieta ver | mexer); nada mais do corpo passa;
//   · a RPC certa, chamada COMO A PESSOA (acessos_ler · acessos_salvar — migration 20261012200000_wa1_acessos.sql), que decide quem lê e quem
//     muda (w14_matricula_da_rota + w14_pode_editar: qualquer profissional do aluno, nunca o aluno) e devolve { ok, … } ou { ok: false, erro };
//   · a volta: só o que a tela usa (os ids internos — user_id, conta_id, treino_user_id — ficam no servidor);
//   · o status de cada código (a tela escreve a frase: src/acessos/api.ts).
import { ehUuid } from "./nutricao-regras.ts";

export const ACOES_DE_ACESSOS = ["ler", "salvar"] as const;
export type AcaoDeAcessos = (typeof ACOES_DE_ACESSOS)[number];

export const CHAVES_DE_ACESSO = ["acesso_app", "diario_alimentar", "acesso_link", "dieta"] as const;
export type ChaveDeAcesso = (typeof CHAVES_DE_ACESSO)[number];

/** Os níveis de cada chave (os mesmos do check da acessos_salvar). */
export const NIVEIS_DA_CHAVE: Readonly<Record<ChaveDeAcesso, readonly string[]>> = {
  acesso_app: ["bloqueado", "liberado"],
  diario_alimentar: ["bloqueado", "liberado"],
  acesso_link: ["bloqueado", "liberado"],
  dieta: ["ver", "mexer"],
};

export const RPC_DE_ACESSOS: Readonly<Record<AcaoDeAcessos, string>> = { ler: "acessos_ler", salvar: "acessos_salvar" };

/** O que volta à tela: a whitelist (o resto do jsonb da RPC fica no servidor). */
export const CAMPOS_DA_VOLTA = ["paciente_id", "tem_login", "modulos", "conta_modulos", "tem_nutricionista", "pode_mudar", "linhas", "mudancas"] as const;

export type PedidoDeAcessos =
  | { acao: "ler"; aluno: string }
  | { acao: "salvar"; aluno: string; chave: ChaveDeAcesso; valor: string };

export type Recusa = { ok: false; erro: string; campo?: string };

const ehChave = (v: unknown): v is ChaveDeAcesso => typeof v === "string" && (CHAVES_DE_ACESSO as readonly string[]).includes(v);

/** O pedido na forma (só os campos conhecidos) ou a recusa: acao_invalida (fora da lista) · dados_invalidos com o campo. */
export function lerPedidoDeAcessos(corpo: Record<string, unknown>): { ok: true; pedido: PedidoDeAcessos } | Recusa {
  const acao = corpo.acao;
  if (acao !== "ler" && acao !== "salvar") return { ok: false, erro: "acao_invalida" };
  if (!ehUuid(corpo.aluno)) return { ok: false, erro: "dados_invalidos", campo: "aluno" };
  const aluno = corpo.aluno.toLowerCase();
  if (acao === "ler") return { ok: true, pedido: { acao, aluno } };
  if (!ehChave(corpo.chave)) return { ok: false, erro: "dados_invalidos", campo: "chave" };
  const valor = corpo.valor;
  if (typeof valor !== "string" || !NIVEIS_DA_CHAVE[corpo.chave].includes(valor)) return { ok: false, erro: "dados_invalidos", campo: "valor" };
  return { ok: true, pedido: { acao, aluno, chave: corpo.chave, valor } };
}

/** A RPC e os parâmetros (os nomes da migration — o teste confere). */
export function chamadaDeAcessos(p: PedidoDeAcessos): { rpc: string; args: Record<string, unknown> } {
  return p.acao === "ler"
    ? { rpc: RPC_DE_ACESSOS.ler, args: { p_aluno: p.aluno } }
    : { rpc: RPC_DE_ACESSOS.salvar, args: { p_aluno: p.aluno, p_chave: p.chave, p_valor: p.valor } };
}

/** Status HTTP de cada código (o corpo leva { ok: false, erro }). */
export const STATUS_DO_ERRO_ACESSOS: Readonly<Record<string, number>> = {
  dados_invalidos: 400, acao_invalida: 400, schema_invalido: 400, ajuste_invalido: 400,
  sem_login: 401,
  sem_acesso: 403,
  nao_encontrado: 404, aluno_inexistente: 404,
  metodo: 405,
  sem_login_do_aluno: 409, sem_nutricao: 409, conflito: 409,
  corpo_grande: 413,
  muitas_acoes: 429,
  erro_interno: 500,
  tempo_esgotado: 504,
};

export function statusDoErroAcessos(erro: unknown): number {
  return STATUS_DO_ERRO_ACESSOS[String(erro ?? "")] ?? 500;
}

/**
 * O que a RPC devolveu, como resposta: { ok: true, …só a whitelist } · { ok: false, erro } com um código conhecido · o resto (não objeto,
 * código desconhecido, erro_interno da wa_rota) → erro_interno com `inesperado` (a função avisa: log.erro).
 */
export function voltaDosAcessos(data: unknown): { ok: true; [campo: string]: unknown } | { ok: false; erro: string; inesperado: boolean } {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, erro: "erro_interno", inesperado: true };
  const d = data as Record<string, unknown>;
  if (d.ok !== true) {
    const erro = typeof d.erro === "string" ? d.erro : "";
    return erro && erro !== "erro_interno" && Object.prototype.hasOwnProperty.call(STATUS_DO_ERRO_ACESSOS, erro)
      ? { ok: false, erro, inesperado: false }
      : { ok: false, erro: "erro_interno", inesperado: true };
  }
  const saida: { ok: true; [campo: string]: unknown } = { ok: true };
  for (const k of CAMPOS_DA_VOLTA) if (Object.prototype.hasOwnProperty.call(d, k)) saida[k] = d[k];
  return saida;
}
