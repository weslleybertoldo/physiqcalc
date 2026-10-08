// Physiq hml-10 (H-26 e H-48, D5) — o aviso de erro do app. O que quebra no app vira 1 POST na função erro-avisar do banco
// principal, que avisa o Weslley no Telegram (grupo Validação › tópico Physiq) com a trava de repetidos dela:
//   "tela"      a tela inteira (components/ErrorBoundary.tsx), uma parte dela (ui/casca/LimiteDeErro.tsx, inclusive as
//               silenciosas) ou o erro que ninguém pegou (lib/globalErrorHandler.ts, evento "error");
//   "promessa"  promessa rejeitada sem catch (lib/globalErrorHandler.ts, depois dos filtros de rede e abort de lá);
//   "funcao"    a resposta FINAL ≥ 500 de /functions/v1/<slug> nos 2 clientes do supabase-js (integrations/repeticao.ts);
//   "sync"      a escrita do aparelho que o PowerSync descartou (lib/powersync/connector.ts: só tabela, op e código).
//
// Daqui sai só o que o _shared/erros.ts deixa (a mesma limpeza das funções): a mensagem sem e-mail, CPF, telefone, token, id…;
// a rota é o location.pathname limpo (nunca a query nem o #: o #access_token do login antigo não sai); a parte da tela; a versão
// e onde o app roda (site | app | loja). Nunca id de usuário, e-mail, nome, pilha nem corpo de nada.
//
// avisarErro devolve SEMPRE o código (a assinatura de 8 hex — o mesmo 🔑 do aviso: o servidor recalcula do mesmo corpo), que a
// tela de erro mostra, mesmo quando não manda. Não manda: no `vite dev` (e no Vitest), sem o principal configurado, sem internet,
// erro de rede ou abort, chunk velho (deploy novo: a tela pede para recarregar), "Script error." (script de outra origem, sem
// detalhe) e ResizeObserver (aviso do navegador, não é erro). Trava por carregamento da página: 1 por código e no máximo 5.
//
// Envio: fetch puro com keepalive (sai mesmo se a página fechar logo depois), sem a repetição dos clientes e sem cabeçalho próprio
// — o corpo vai como text/plain e o schema em ?schema=: é um pedido "simples", sem preflight (keepalive com preflight não funciona
// em todo navegador; a função aceita os 2 jeitos). Sem apikey e sem sessão: a erro-avisar é verify_jwt false e quem prova que o
// pedido é do app é a Origin da lista (login-regras.origemPermitida). Nenhum erro daqui chega a quem chamou.
// Testes: src/lib/avisoDeErro.test.ts.
import { Capacitor } from "@capacitor/core";
import {
  assinatura,
  funcaoValida,
  limparLugar,
  limparMensagem,
  limparRota,
  statusValido,
  type BancoErro,
} from "../../supabase-principal/functions/_shared/erros";
import { ehLoja } from "./distribuicao";
import { BUILD_DO_APP } from "./plataforma";

export type OrigemDoApp = "tela" | "promessa" | "funcao" | "sync";
export type PlataformaDoApp = "site" | "app" | "loja";
type Env = Record<string, string | boolean | undefined>;

/** O erro que o app viu. */
export interface AvisoDoApp {
  origem: OrigemDoApp;
  /** O erro como veio (Error, texto ou o que a promessa rejeitou): vira a mensagem limpa (sem pilha; do PostgREST, só a message). */
  mensagem?: unknown;
  /** Nome curto da parte da tela ("tela inteira", "aba do aluno Treino"): é limpo e vai com até 60 caracteres. */
  lugar?: string | null;
  /** Origem "funcao": o slug da função que respondeu 5xx, o banco dela (sem ele, o principal) e o HTTP. */
  funcao?: string | null;
  banco?: BancoErro | null;
  status?: number | null;
}

/** O corpo do POST — o formato que a erro-avisar lê do navegador (lerAviso, _shared/erro-avisar-regras.ts). */
export interface CorpoDoAviso {
  origem: OrigemDoApp;
  mensagem?: string;
  rota?: string;
  lugar?: string;
  versao?: string;
  plataforma: PlataformaDoApp;
  funcao?: string;
  banco?: BancoErro;
  status?: number;
}

export interface ConfigAviso {
  /** Manda de verdade? false no `vite dev`, no Vitest e no build sem o principal (aí só devolve o código). */
  ligado: boolean;
  /** `${VITE_PRINCIPAL_URL}/functions/v1/erro-avisar?schema=<schema>`. */
  url: string;
  /** __APP_VERSION__ ("3.74"). */
  versao: string;
  plataforma: PlataformaDoApp;
  fetch: typeof fetch;
  /** Tem internet? (navigator.onLine) */
  online: () => boolean;
  /** O caminho da tela agora (rotaAtual: location.pathname, sem query e sem #). */
  rota: () => string;
}

/**
 * Tamanho máximo do corpo: o LIMITE_CORPO da erro-avisar (_shared/erro-avisar-regras.ts; o teste confere que é o mesmo). O corpo
 * não chega perto: a mensagem limpa tem até 300 caracteres, o lugar 60 e a rota 120 (o teste manda o pior caso).
 */
export const LIMITE_DO_CORPO = 2048;
/** Avisos por carregamento da página (a erro-avisar ainda segura os iguais por 10 min e 30 por hora por ambiente). */
export const MAXIMO_POR_CARREGAMENTO = 5;

/**
 * O schema do principal: a MESMA regra do resolverSchemaPrincipal (src/integrations/principal/client.ts) — VITE_PRINCIPAL_SCHEMA,
 * senão VITE_DB_SCHEMA, senão "public". Não importa de lá: o client.ts importa o repeticao.ts, que importa este arquivo (ciclo),
 * e a tela de erro não pode depender do cliente do Supabase. O teste confere que as 2 regras dão o mesmo.
 */
export function schemaDoAviso(env: Env): "public" | "staging" {
  for (const chave of ["VITE_PRINCIPAL_SCHEMA", "VITE_DB_SCHEMA"]) {
    const valor = String(env[chave] ?? "").trim().toLowerCase();
    if (valor === "public" || valor === "staging") return valor;
  }
  return "public";
}

/**
 * Para onde vai o aviso e se ele vai, pelas variáveis do build — as do cliente do principal (VITE_PRINCIPAL_URL e
 * VITE_PRINCIPAL_ANON_KEY: sem as 2, o principal não está configurado). No `vite dev` (DEV) não manda.
 */
export function enderecoDoAviso(env: Env): { ligado: boolean; url: string } {
  const base = String(env.VITE_PRINCIPAL_URL ?? "").trim().replace(/\/+$/, "");
  const chave = String(env.VITE_PRINCIPAL_ANON_KEY ?? "").trim();
  const dev = env.DEV === true || env.DEV === "true";
  return {
    ligado: Boolean(base && chave) && !dev,
    url: base ? `${base}/functions/v1/erro-avisar?schema=${schemaDoAviso(env)}` : "",
  };
}

/**
 * Onde o app roda: "loja" (o AAB da Google Play), "app" (o APK) ou "site" (o navegador). Nunca lança: roda quando este módulo
 * carrega, e as telas de erro dependem dele (ponte do Capacitor quebrada = "site").
 */
export function plataformaAtual(): PlataformaDoApp {
  try {
    if (ehLoja) return "loja";
    if (BUILD_DO_APP || Capacitor.isNativePlatform()) return "app";
  } catch {
    // sem a ponte do Capacitor (ou a flag do build ilegível): navegador
  }
  return "site";
}

/** O caminho da tela: só o location.pathname — a query (?code=, ?email=…) e o # (#access_token=…) nunca entram. */
export function rotaAtual(): string {
  return typeof location === "undefined" ? "" : location.pathname;
}

/**
 * O texto do erro, sem a pilha: "TypeError: …" (o nome só quando não é o Error comum). Do erro do PostgREST (um objeto), só a
 * message — nunca details, hint nem o objeto inteiro. Objeto sem message: vazio.
 */
export function textoDoErro(e: unknown): string {
  try {
    if (e instanceof Error) return `${e.name && e.name !== "Error" ? `${e.name}: ` : ""}${e.message ?? ""}`;
    if (typeof e === "string") return e;
    if (e && typeof e === "object") {
      const m = (e as { message?: unknown }).message;
      return typeof m === "string" ? m : "";
    }
    return e === null || e === undefined ? "" : String(e);
  } catch {
    return "";
  }
}

function nomeDoErro(e: unknown): string {
  try {
    const nome = e && typeof e === "object" ? (e as { name?: unknown }).name : null;
    return typeof nome === "string" ? nome : "";
  } catch {
    return "";
  }
}

const CHUNK = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError|Loading (?:CSS )?chunk \S+ failed/i;
const ABORT = /AbortError|TimeoutError|aborted|signal timed out/i;
const REDE = /Failed to fetch|NetworkError|Load failed|Network request failed|net::ERR_|ERR_NETWORK|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION/i;
const SCRIPT_ERROR = /^(?:Uncaught )?Script error\.?$/i;
const RESIZE = /ResizeObserver loop/i;

export type MotivoIgnorado = "chunk" | "abort" | "rede" | "script" | "resize";

/** Por que este erro não vira aviso (null = vira): chunk velho, abort, rede, "Script error." ou ResizeObserver. */
export function motivoParaIgnorar(texto: string, nome = ""): MotivoIgnorado | null {
  // o chunk antes da rede: "Failed to fetch dynamically imported module" também tem "Failed to fetch"
  if (CHUNK.test(texto)) return "chunk";
  if (nome === "AbortError" || nome === "TimeoutError" || ABORT.test(texto)) return "abort";
  if (REDE.test(texto)) return "rede";
  if (SCRIPT_ERROR.test(texto.trim())) return "script";
  if (RESIZE.test(texto)) return "resize";
  return null;
}

/** O corpo limpo: a mensagem, a rota e o lugar passam pelo _shared/erros.ts (a mesma limpeza que a erro-avisar repete). */
function montarCorpo(aviso: AvisoDoApp, config: ConfigAviso): CorpoDoAviso {
  const corpo: CorpoDoAviso = { origem: aviso.origem, plataforma: config.plataforma };
  const mensagem = limparMensagem(textoDoErro(aviso.mensagem));
  if (mensagem) corpo.mensagem = mensagem;
  let rota = "";
  try {
    rota = limparRota(config.rota());
  } catch {
    // sem location: sem rota
  }
  if (rota) corpo.rota = rota;
  const lugar = limparLugar(aviso.lugar);
  if (lugar) corpo.lugar = lugar;
  if (config.versao) corpo.versao = config.versao;
  if (aviso.origem === "funcao") {
    const funcao = funcaoValida(aviso.funcao);
    if (funcao) corpo.funcao = funcao;
    corpo.banco = aviso.banco === "treino" ? "treino" : "principal";
    const status = statusValido(aviso.status);
    if (status) corpo.status = status;
  }
  return corpo;
}

export interface AvisoDeErro {
  /** Monta o aviso, manda (quando é o caso) e devolve o código. Nunca lança. */
  avisar(aviso: AvisoDoApp): string;
}

/** O avisador com a trava de um carregamento da página (1 por código, até 5). O do app é o `avisarErro` abaixo; o teste cria o dele. */
export function criarAvisoDeErro(config: ConfigAviso): AvisoDeErro {
  const enviados = new Set<string>();
  return {
    avisar(aviso: AvisoDoApp): string {
      let codigo = "";
      try {
        const corpo = montarCorpo(aviso, config);
        // a assinatura do corpo (_shared/erros.ts): a erro-avisar chega ao mesmo código ao ler este corpo
        codigo = assinatura(corpo);
        if (!config.ligado || !config.url) return codigo;
        if (motivoParaIgnorar(textoDoErro(aviso.mensagem), nomeDoErro(aviso.mensagem))) return codigo;
        // a erro-avisar recusa (400) a origem "funcao" sem um slug válido; e o app nunca avisa a falha dela mesma
        if (aviso.origem === "funcao" && (!corpo.funcao || corpo.funcao === "erro-avisar")) return codigo;
        if (!config.online()) return codigo;
        if (enviados.has(codigo) || enviados.size >= MAXIMO_POR_CARREGAMENTO) return codigo;
        enviados.add(codigo);
        const pedido = config.fetch(config.url, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          body: JSON.stringify(corpo),
          keepalive: true,
          credentials: "omit",
          cache: "no-store",
          // nem o endereço da página vai junto (a Origin continua: é ela que a função confere)
          referrerPolicy: "no-referrer",
        });
        void Promise.resolve(pedido).catch(() => undefined);
      } catch {
        // o aviso nunca vira outro erro
      }
      return codigo;
    },
  };
}

const ENV = import.meta.env as Env;

const DO_APP = criarAvisoDeErro({
  ...enderecoDoAviso(ENV),
  versao: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "",
  plataforma: plataformaAtual(),
  fetch: (entrada, init) => fetch(entrada, init),
  online: () => typeof navigator === "undefined" || navigator.onLine !== false,
  rota: rotaAtual,
});

/**
 * Avisa o erro (quando é o caso) e devolve o código de 8 caracteres que a tela mostra ("Código: a1b2c3d4"). Nunca lança.
 * Ex.: avisarErro({ origem: "tela", mensagem: erro, lugar: "aba do aluno" }).
 */
export function avisarErro(aviso: AvisoDoApp): string {
  return DO_APP.avisar(aviso);
}
