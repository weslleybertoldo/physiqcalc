// Physiq W22 — acesso a dados do Painel › Mensagens (WhatsApp), no BANCO PRINCIPAL (o mesmo do site antigo do Nutri):
//   · a função whatsapp-conectar (JWT do profissional): status (cria a linha 'desconectado' na 1ª visita), conectar (o agente do
//     celular publica o QR), desconectar e teste (1 mensagem para o próprio número conectado);
//   · as funções do banco da W22: whatsapp_resumo, whatsapp_fila, whatsapp_salvar_config, whatsapp_reenviar, whatsapp_limpar_falhas.
// O app NUNCA grava nas tabelas do WhatsApp (quem grava são as funções e o agente). O header x-schema do cliente escolhe public/staging.
// hml-21c (H-43 · jeito 2, etapa 3): as 5 funções do banco e o perfil vão pela função conta, COM A SESSÃO de quem está logado — as MESMAS
// RPCs e os MESMOS argumentos, no servidor: as leituras (o resumo — também o número do menu —, a fila e o perfil) no lote da tela (1 ida); as
// gravações (a config, o reenviar, o "Limpar") como ações. A whatsapp-conectar fica como está (já é servidor). O erro: ErroMensagens com o
// CÓDIGO (a rede que caiu → sem_internet; o { ok: false, erro } da RPC, como hoje) — a mensagem crua do banco não vem mais.
import { acaoConta, codigoDaGravacao, type AcaoConta } from "@/conta/gravar";
import { codigoDaLeitura, lerConta, type ConsultaDaConta } from "@/conta/ler";
import { principal } from "@/integrations/principal/client";
import { paraGravar, type ConfigWhatsapp } from "./disparosUtil";
import type { EscopoFila, FiltroFila, ItemFila, StatusMensagem } from "./filaUtil";
import type { Instancia } from "./whatsappUtil";

export class ErroMensagens extends Error {
  constructor(public codigo: string) {
    super(codigo);
  }
}

const offline = () => typeof navigator !== "undefined" && navigator.onLine === false;

async function corpoDoErro(erro: unknown): Promise<Record<string, unknown> | null> {
  const ctx = (erro as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      return (await ctx.clone().json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

/** Chama uma ação da whatsapp-conectar; erro HTTP vira ErroMensagens com o CÓDIGO ({ error: "sem_numero" | … }) para a tela traduzir. */
async function conectar<T>(acao: "status" | "conectar" | "desconectar" | "teste"): Promise<T> {
  if (offline()) throw new ErroMensagens("sem_internet");
  const { data, error } = await principal.functions.invoke("whatsapp-conectar", { body: { acao } });
  if (error) {
    const c = await corpoDoErro(error);
    throw new ErroMensagens(String(c?.error ?? "erro_interno"));
  }
  return data as T;
}

/** garante a linha e devolve o estado atual (a tela chama ao abrir e faz polling enquanto espera o QR) */
export async function statusConexao(): Promise<Instancia> {
  return (await conectar<{ instancia: Instancia }>("status")).instancia;
}

/** pede a conexão: o agente do celular publica o QR em alguns segundos */
export async function pedirConexao(): Promise<Instancia> {
  return (await conectar<{ instancia: Instancia }>("conectar")).instancia;
}

/** derruba a sessão (ou cancela o pedido de conexão em curso) */
export async function desconectar(): Promise<Instancia> {
  return (await conectar<{ instancia: Instancia }>("desconectar")).instancia;
}

/** enfileira uma mensagem de teste para o próprio número conectado */
export async function enviarTeste(): Promise<{ repetida: boolean }> {
  const r = await conectar<{ repetida?: boolean }>("teste");
  return { repetida: !!r.repetida };
}

/** O valor de uma função do banco; `{ ok: false, erro }` vira ErroMensagens com o código. */
function okOuErro<T>(data: unknown): T {
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.ok === false) throw new ErroMensagens(String(d.erro ?? "erro_interno"));
  return d as T;
}

/** hml-21c: uma leitura pela conta (no lote da tela) — o erro com o código. */
async function ler<T>(q: ConsultaDaConta, params: Record<string, unknown>): Promise<T> {
  if (offline()) throw new ErroMensagens("sem_internet");
  let valor: unknown;
  try {
    valor = (await lerConta(q, params)).valor;
  } catch (e) {
    throw new ErroMensagens(codigoDaLeitura(e));
  }
  return okOuErro<T>(valor);
}

/** hml-21c: uma gravação pela conta (a RPC de hoje no servidor, como a pessoa) — o erro com o código. */
async function acao<T>(nome: AcaoConta, corpo: Record<string, unknown>): Promise<T> {
  if (offline()) throw new ErroMensagens("sem_internet");
  let resultado: unknown;
  try {
    resultado = (await acaoConta<{ resultado?: unknown }>(nome, corpo)).resultado;
  } catch (e) {
    throw new ErroMensagens(codigoDaGravacao(e));
  }
  return okOuErro<T>(resultado);
}

export interface ResumoMensagens {
  dono: boolean;
  /** a última batida do celular de envio (max(ultimo_ping) da tabela das instâncias) */
  agente_ping: string | null;
  pendentes: number;
  enviadas_30d: number;
  /** o número do menu: falhas NOVAS da própria fila (7 dias, depois do "Limpar") */
  falhas: number;
  falhas_desde: string | null;
  falhas_vistas_em: string | null;
  /** enviadas por dia, os últimos 14 dias (o mais antigo primeiro) */
  serie_enviadas: number[];
  ultimo_teste: { status: StatusMensagem; erro: string | null; criado_em: string; enviada_em: string | null } | null;
  /** os alunos de quem é o responsável (nutri ou personal): com telefone e com o ajuste "Mensagens automáticas" ligado */
  alcance: { alunos: number; com_telefone: number; ligadas: number } | null;
}

export async function buscarResumo(contaId: string | null): Promise<ResumoMensagens> {
  const r = await ler<ResumoMensagens>("whatsapp_resumo", { conta: contaId });
  return { ...r, serie_enviadas: Array.isArray(r.serie_enviadas) ? r.serie_enviadas.map(Number) : [] };
}

export interface PaginaFila {
  escopo: EscopoFila;
  filtro: FiltroFila;
  itens: ItemFila[];
  mais: boolean;
}

/** cursor da próxima página: a última linha da página atual (created_at + id — o cron grava várias no mesmo instante) */
export type CursorFila = { antes: string; antesId: string } | null;

export async function listarFila(p: { contaId: string | null; escopo: EscopoFila; filtro: FiltroFila; limite?: number; cursor?: CursorFila }): Promise<PaginaFila> {
  const r = await ler<PaginaFila>("whatsapp_fila", {
    conta: p.contaId, escopo: p.escopo, filtro: p.filtro, limite: p.limite ?? 30, antes: p.cursor?.antes ?? null, antes_id: p.cursor?.antesId ?? null,
  });
  return { ...r, itens: Array.isArray(r.itens) ? r.itens : [] };
}

/** grava as mensagens automáticas (profiles.config.whatsapp — o resto do config fica como está) */
export async function salvarConfig(cfg: ConfigWhatsapp): Promise<ConfigWhatsapp> {
  const r = await acao<{ whatsapp: ConfigWhatsapp }>("whatsapp_config_salvar", { whatsapp: paraGravar(cfg) });
  return r.whatsapp;
}

/** a própria mensagem com falha volta para a fila (o banco confere se ainda faz sentido) */
export async function reenviar(id: string): Promise<void> {
  await acao("whatsapp_reenviar", { id });
}

/** "Limpar": as falhas de até agora deixam de contar no número do menu */
export async function limparFalhas(): Promise<void> {
  await acao("whatsapp_limpar_falhas", {});
}

export interface PerfilWhatsapp {
  nome: string | null;
  dados_profissionais: unknown;
  config: unknown;
}

/**
 * o WhatsApp de Configurações › Perfil (dados_profissionais) e a config das automáticas (config.whatsapp) — hml-21c: o profiles DE QUEM ESTÁ
 * LOGADO pela conta (q=perfil_mensagens: o servidor filtra pelo user do token; o `uid` fica na assinatura de antes), no lote da tela
 */
export async function lerPerfilWhatsapp(_uid: string): Promise<PerfilWhatsapp | null> {
  if (offline()) throw new ErroMensagens("sem_internet");
  let linhas: unknown[] | undefined;
  try {
    linhas = (await lerConta("perfil_mensagens")).linhas;
  } catch (e) {
    throw new ErroMensagens(codigoDaLeitura(e));
  }
  return ((linhas ?? [])[0] as PerfilWhatsapp | undefined) ?? null;
}
