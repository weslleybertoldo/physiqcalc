// Physiq W22 — acesso a dados do Painel › Mensagens (WhatsApp), no BANCO PRINCIPAL (o mesmo do site antigo do Nutri):
//   · a função whatsapp-conectar (JWT do profissional): status (cria a linha 'desconectado' na 1ª visita), conectar (o agente do
//     celular publica o QR), desconectar e teste (1 mensagem para o próprio número conectado);
//   · as funções do banco da W22: whatsapp_resumo, whatsapp_fila, whatsapp_salvar_config, whatsapp_reenviar, whatsapp_limpar_falhas.
// O app NUNCA grava nas tabelas do WhatsApp (quem grava são as funções e o agente). O header x-schema do cliente escolhe public/staging.
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

/** Chama uma função do banco; `{ ok: false, erro }` vira ErroMensagens com o código. */
async function rpc<T>(nome: string, args: Record<string, unknown>): Promise<T> {
  if (offline()) throw new ErroMensagens("sem_internet");
  const { data, error } = await principal.rpc(nome as never, args as never);
  if (error) throw new ErroMensagens(error.message || "erro_interno");
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.ok === false) throw new ErroMensagens(String(d.erro ?? "erro_interno"));
  return d as T;
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
  const r = await rpc<ResumoMensagens>("whatsapp_resumo", { p_conta: contaId });
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
  const r = await rpc<PaginaFila>("whatsapp_fila", {
    p_conta: p.contaId, p_escopo: p.escopo, p_filtro: p.filtro, p_limite: p.limite ?? 30, p_antes: p.cursor?.antes ?? null, p_antes_id: p.cursor?.antesId ?? null,
  });
  return { ...r, itens: Array.isArray(r.itens) ? r.itens : [] };
}

/** grava as mensagens automáticas (profiles.config.whatsapp — o resto do config fica como está) */
export async function salvarConfig(cfg: ConfigWhatsapp): Promise<ConfigWhatsapp> {
  const r = await rpc<{ whatsapp: ConfigWhatsapp }>("whatsapp_salvar_config", { p_whatsapp: paraGravar(cfg) });
  return r.whatsapp;
}

/** a própria mensagem com falha volta para a fila (o banco confere se ainda faz sentido) */
export async function reenviar(id: string): Promise<void> {
  await rpc("whatsapp_reenviar", { p_id: id });
}

/** "Limpar": as falhas de até agora deixam de contar no número do menu */
export async function limparFalhas(): Promise<void> {
  await rpc("whatsapp_limpar_falhas", {});
}

export interface PerfilWhatsapp {
  nome: string | null;
  dados_profissionais: unknown;
  config: unknown;
}

/** o WhatsApp de Configurações › Perfil (dados_profissionais) e a config das automáticas (config.whatsapp) */
export async function lerPerfilWhatsapp(uid: string): Promise<PerfilWhatsapp | null> {
  if (offline()) throw new ErroMensagens("sem_internet");
  const { data, error } = await principal.from("profiles").select("nome, dados_profissionais, config").eq("id", uid).maybeSingle();
  if (error) throw new ErroMensagens(error.message || "erro_interno");
  return (data as PerfilWhatsapp | null) ?? null;
}
