// Physiq hml-10 (H-24 e H-26, D1 e D6) — o log das funções: 1 linha JSON por evento, no nível certo do console (o Supabase
// separa info, aviso e erro: console.log, console.warn e console.error). Cada campo tem formato fixo; fora dele vira "?".
// Texto livre só entra limpo (_shared/erros.ts). log.erro e log.excecao também AVISAM o Weslley no Telegram, em segundo plano
// (EdgeRuntime.waitUntil quando existe): a resposta não espera, e falha do aviso nunca derruba a função. info e aviso nunca
// avisam.
//
// Quem avisa entra por injeção — cada banco tem o seu _shared/avisar-erro.ts (o principal manda ao Telegram; o Treino, à
// função erro-avisar do principal) — e por isso este arquivo é IGUAL nos 2 projetos: cópia IDÊNTICA em
// supabase/functions/_shared/log.ts (src/lib/logServidor.test.ts confere byte a byte). Mudou aqui? Copie para lá.
//
// Uso (as mesmas linhas no principal e no Treino):
//   import { criarLog } from "../_shared/log.ts";
//   import { avisarErro } from "../_shared/avisar-erro.ts";
//   const log = criarLog("cobranca-conta", { avisar: avisarErro });
//   log.info({ codigo: "aviso_mp", schema, acao: topico, ref: id, resultado });
//   log.erro({ codigo: "mp_pix_falhou", schema, acao: "pix_criar", ref: fatura.id, status: st,
//              externo: { mp_erro: pay?.error, mp_causas: (pay?.cause ?? []).map((c) => c?.code) } });
//   } catch (e) {
//     log.excecao(e, { acao, schema });          // o catch final de toda função publicada
//     return erro("erro_interno", 500, origin);
//   }
// Saída: {"nivel":"erro","funcao":"cobranca-conta","codigo":"mp_pix_falhou","schema":"public","acao":"pix_criar",
//         "ref":"<id da fatura>","status":400,"externo":{"mp_erro":"bad_request","mp_causas":[2067]}}
// NUNCA passar: corpo de resposta (MP, Resend, GoTrue, FCM, Treino, principal), corpo do pedido, e-mail, nome, telefone, CPF,
// token (só o fimDoToken de 6, no campo aparelho), termo de busca, URL com query, o objeto de erro inteiro (use log.excecao).
import {
  codigoValido,
  funcaoValida,
  limparMensagem,
  statusValido,
  type ErroParaAviso,
  type SchemaAviso,
} from "./erros.ts";

/** Quem avisa (cada banco tem o seu: _shared/avisar-erro.ts). Recebe o erro já limpo e o schema (null = não informado). */
export type AvisarErro = (erro: ErroParaAviso, schema: SchemaAviso | null) => unknown;

export interface OpcoesLog {
  /** O aviso de erro do banco: `avisarErro` do _shared/avisar-erro.ts. null = só loga (o caminho do próprio aviso; testes). */
  avisar: AvisarErro | null;
}

/** Códigos que os serviços de fora devolvem. Só estas chaves entram (as outras somem), cada uma no seu formato (fora: "?"). */
export interface ExternoLog {
  /** Mercado Pago: o campo "error" da resposta (ex.: "bad_request"). */
  mp_erro?: unknown;
  /** Mercado Pago: os cause[].code (números; até 10). */
  mp_causas?: unknown;
  /** Mercado Pago: status_detail (ex.: "cc_rejected_insufficient_amount"). */
  mp_status_detail?: unknown;
  /** Resend: o "name" do erro (ex.: "validation_error"). */
  resend_erro?: unknown;
  /** GoTrue: error_code/code (ex.: "email_exists"). */
  gotrue_codigo?: unknown;
  /** FCM: o código (ex.: "UNREGISTERED", "OAUTH", "REDE"). */
  fcm_codigo?: unknown;
  /** Função do Treino: só o código de erro que ela devolveu ([a-z_], até 40). */
  treino_erro?: unknown;
  /** Função do principal: só o código de erro que ela devolveu ([a-z_], até 40). */
  principal_erro?: unknown;
  /** Telegram: o message_id do aviso enviado. */
  telegram_id?: unknown;
}

/** Os campos de uma linha. Só `codigo` é obrigatório; o que não vier não aparece; o que vier fora do formato vira "?". */
export interface CamposLog {
  /** O que aconteceu: [a-z0-9_], até 48 (ex.: "mp_pix_falhou"). */
  codigo: string;
  /** "public" | "staging". Passe SEMPRE que já souber: é ele que põe [staging] no aviso (sem ele, o aviso sai como produção). */
  schema?: string | null;
  /** Ação, tópico ou passo: [a-z0-9_], até 48. */
  acao?: string | null;
  /** Id técnico: uuid, id do Mercado Pago, preapproval ([A-Za-z0-9_-], até 64; nunca chave, e-mail, nome ou CPF). */
  ref?: unknown;
  /** HTTP (inteiro 0–999; 0 = sem resposta). */
  status?: unknown;
  /** Duração em ms (número ≥ 0; arredonda). */
  ms?: unknown;
  /** Contagem (inteiro ≥ 0). */
  n?: unknown;
  /** Código do Postgres (5 caracteres, ex.: "23505") ou do PostgREST ("PGRST116"). */
  pg?: unknown;
  /** Desfecho curto: [a-z0-9_], até 48 (ex.: "ignorado", "token_invalido"). */
  resultado?: unknown;
  /** Aparelho do push: o fimDoToken (push-regras.ts) = "…" + 6 caracteres. Nunca o token inteiro. */
  aparelho?: unknown;
  /** Códigos do serviço de fora (ExternoLog). */
  externo?: ExternoLog | null;
  /** Texto livre: entra LIMPO (limparMensagem) e com até 200 caracteres. Em log.excecao não vale (a msg é a do erro). */
  msg?: unknown;
}

export interface Log {
  /** console.log. Nunca avisa. */
  info(campos: CamposLog): void;
  /** console.warn. Nunca avisa. */
  aviso(campos: CamposLog): void;
  /** console.error + aviso ao Weslley (em segundo plano). */
  erro(campos: CamposLog): void;
  /**
   * O catch: console.error com o name, o pg (código do Postgres, se houver) e a msg (a mensagem limpa, até 200) do erro — nunca
   * details, hint, pilha ou o objeto — + aviso ao Weslley. `codigo` padrão: "excecao".
   */
  excecao(e: unknown, campos?: Partial<CamposLog>): void;
}

const LIMITE_MSG = 200;
const RE_REF = /^[A-Za-z0-9_-]{1,64}$/;
/** Chave ou token com cara de código ou de id (passa no formato, mas não é): JWT e as chaves do Supabase e do Mercado Pago. */
const RE_CHAVE = /^(?:eyJ|sbp?_|APP_USR-|TEST-)/;
const RE_PG = /^(?:[0-9A-Z]{5}|PGRST\d{3})$/;
const RE_APARELHO = /^…?[A-Za-z0-9_:-]{1,6}$/;
const RE_NOME_ERRO = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

const noFormato = (v: unknown, re: RegExp): string | null =>
  typeof v === "string" && re.test(v) && !RE_CHAVE.test(v) ? v : null;
const inteiro = (v: unknown, max: number): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : null;

function refValida(v: unknown): string | null {
  const s = typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? String(v) : typeof v === "string" ? v : null;
  return noFormato(s, RE_REF);
}

function causasValidas(v: unknown): Array<number | "?"> | null {
  if (!Array.isArray(v)) return null;
  return v.slice(0, 10).map((c) => inteiro(typeof c === "string" && /^\d{1,6}$/.test(c) ? Number(c) : c, 999999) ?? "?");
}

/** As chaves do `externo`, na ordem da saída, cada uma com o seu formato. */
const EXTERNO: ReadonlyArray<readonly [keyof ExternoLog, (v: unknown) => unknown]> = [
  ["mp_erro", (v) => noFormato(v, /^[A-Za-z0-9_.-]{1,64}$/)],
  ["mp_causas", causasValidas],
  ["mp_status_detail", (v) => noFormato(v, /^[a-z0-9_]{1,64}$/)],
  ["resend_erro", (v) => noFormato(v, /^[a-z0-9_]{1,64}$/)],
  ["gotrue_codigo", (v) => noFormato(v, /^[a-z0-9_]{1,64}$/)],
  ["fcm_codigo", (v) => noFormato(v, /^[A-Za-z0-9_-]{1,64}$/)],
  ["treino_erro", (v) => noFormato(v, /^[a-z_]{1,40}$/)],
  ["principal_erro", (v) => noFormato(v, /^[a-z_]{1,40}$/)],
  ["telegram_id", (v) => inteiro(v, Number.MAX_SAFE_INTEGER)],
];

function externoValido(v: unknown): Record<string, unknown> | "?" {
  if (!v || typeof v !== "object" || Array.isArray(v)) return "?";
  const o = v as Record<string, unknown>;
  const saida: Record<string, unknown> = {};
  for (const [chave, validar] of EXTERNO) {
    if (o[chave] === undefined || o[chave] === null) continue;
    saida[chave] = validar(o[chave]) ?? "?";
  }
  return saida;
}

/** "mp_erro bad_request · mp_causas 2067" — o que o aviso mostra quando o log.erro não tem msg. */
function resumoExterno(externo: unknown): string {
  if (!externo || typeof externo !== "object") return "";
  return Object.entries(externo as Record<string, unknown>)
    .filter(([chave, valor]) => chave !== "telegram_id" && valor !== "?")
    .map(([chave, valor]) => `${chave} ${Array.isArray(valor) ? valor.join(",") : String(valor)}`)
    .join(" · ");
}

/** O que se lê de um erro capturado: o name, o código do Postgres e a mensagem limpa. Nunca details, hint, pilha ou o objeto. */
function lerErro(e: unknown): { name: string; pg: string | null; msg: string } {
  if (e instanceof Error) {
    return {
      name: noFormato(e.name, RE_NOME_ERRO) ?? "Error",
      pg: noFormato((e as { code?: unknown }).code, RE_PG),
      msg: limparMensagem(e.message, LIMITE_MSG),
    };
  }
  if (e !== null && typeof e === "object") {
    // o erro do PostgREST (supabase-js 2.39) é um objeto { message, details, hint, code }: o details traz o valor da linha
    const o = e as Record<string, unknown>;
    const doPostgrest = "message" in o && ("details" in o || "hint" in o);
    return {
      name: noFormato(o.name, RE_NOME_ERRO) ?? (doPostgrest ? "PostgrestError" : "Object"),
      pg: noFormato(o.code, RE_PG),
      msg: limparMensagem(typeof o.message === "string" ? o.message : "", LIMITE_MSG),
    };
  }
  if (typeof e === "string") return { name: "string", pg: null, msg: limparMensagem(e, LIMITE_MSG) };
  return { name: e === null ? "null" : typeof e, pg: null, msg: "" };
}

type ComEdgeRuntime = { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } };

/**
 * Deixa a promessa terminando depois da resposta: EdgeRuntime.waitUntil no Supabase (sem ele, a instância pode parar antes).
 * Fora do Supabase (Vitest, Deno puro) a promessa segue sozinha. Nunca lança e nunca deixa rejeição solta.
 */
export function emSegundoPlano(p: unknown): void {
  const segura = Promise.resolve(p).then(
    () => undefined,
    () => undefined,
  );
  try {
    (globalThis as ComEdgeRuntime).EdgeRuntime?.waitUntil?.(segura);
  } catch {
    /* sem EdgeRuntime: a promessa segue sozinha */
  }
}

type Nivel = "info" | "aviso" | "erro";

/** Cria o log de uma função (nome = o slug dela; fora de [a-z0-9-] vira "?"). */
export function criarLog(funcao: string, opcoes: OpcoesLog): Log {
  const nome = funcaoValida(funcao) || "?";
  const avisar = opcoes?.avisar ?? null;

  function avisarEmSegundoPlano(erro: ErroParaAviso, schema: SchemaAviso | null): void {
    if (!avisar) return;
    try {
      emSegundoPlano(avisar(erro, schema));
    } catch {
      /* o aviso nunca derruba a função */
    }
  }

  function escrever(nivel: Nivel, entrada: unknown, capturado?: { e: unknown }): void {
    let linha: Record<string, unknown>;
    try {
      const c = (entrada && typeof entrada === "object" ? entrada : { codigo: "?", msg: entrada }) as Record<string, unknown>;
      linha = { nivel, funcao: nome, codigo: codigoValido(c.codigo) || "?" };
      const por = (chave: string, valor: unknown, validar: (v: unknown) => unknown) => {
        if (valor !== undefined && valor !== null) linha[chave] = validar(valor) ?? "?";
      };
      por("schema", c.schema, (v) => (v === "public" || v === "staging" ? v : null));
      por("acao", c.acao, (v) => codigoValido(v) || null);
      por("ref", c.ref, refValida);
      por("status", c.status, (v) => inteiro(v, 999));
      por("ms", c.ms, (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1e9 ? Math.round(v) : null));
      por("n", c.n, (v) => inteiro(v, 1e9));
      por("resultado", c.resultado, (v) => codigoValido(v) || null);
      por("aparelho", c.aparelho, (v) => noFormato(v, RE_APARELHO));
      por("pg", c.pg, (v) => noFormato(v, RE_PG));
      por("externo", c.externo, externoValido);
      let mensagemDoAviso = "";
      if (capturado) {
        const lido = lerErro(capturado.e);
        linha.name = lido.name;
        if (lido.pg) linha.pg = lido.pg;
        if (lido.msg) linha.msg = lido.msg;
        const pg = typeof linha.pg === "string" && linha.pg !== "?" ? `pg ${linha.pg}` : "";
        mensagemDoAviso = [lido.name, pg, lido.msg].filter(Boolean).join(" · ");
      } else {
        const msg = c.msg === undefined || c.msg === null ? "" : limparMensagem(c.msg, LIMITE_MSG);
        if (msg) linha.msg = msg;
        const pg = typeof linha.pg === "string" && linha.pg !== "?" ? `pg ${linha.pg}` : "";
        mensagemDoAviso = msg || resumoExterno(linha.externo) || pg;
      }
      const saida = JSON.stringify(linha);
      if (nivel === "info") console.log(saida);
      else if (nivel === "aviso") console.warn(saida);
      else console.error(saida);
      if (nivel === "erro") {
        avisarEmSegundoPlano(
          {
            origem: "servidor",
            funcao: nome,
            codigo: String(linha.codigo),
            acao: typeof linha.acao === "string" && linha.acao !== "?" ? linha.acao : null,
            status: statusValido(linha.status),
            mensagem: mensagemDoAviso || null,
          },
          linha.schema === "public" || linha.schema === "staging" ? linha.schema : null,
        );
      }
    } catch {
      try {
        console.error(JSON.stringify({ nivel: "erro", funcao: nome, codigo: "log_falhou" }));
      } catch {
        /* sem console: nada a fazer */
      }
    }
  }

  return {
    info: (campos) => escrever("info", campos),
    aviso: (campos) => escrever("aviso", campos),
    erro: (campos) => escrever("erro", campos),
    excecao: (e, campos) => escrever("erro", { ...(campos ?? {}), codigo: campos?.codigo ?? "excecao" }, { e }),
  };
}
