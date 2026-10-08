// Physiq hml-10 (H-24 e H-26, D1 e D4) — o saneador dos erros. O que vai para o log das funções, para o banco (avisos_erro) e
// para o aviso no Telegram passa por aqui antes: sai o que pode identificar alguém ou abrir alguma coisa (e-mail, CPF, CNPJ,
// telefone, IP, id, token, chave, query de URL…). Aqui também nascem o texto do aviso e a assinatura (o código de 8
// caracteres que a tela de erro mostra e o aviso repete) e a trava na memória dos avisos repetidos.
//
// PURO: sem Deno, sem rede e sem import — roda nas funções dos 2 bancos, no app (Vite) e no Vitest. Cópia IDÊNTICA em
// supabase/functions/_shared/erros.ts (o Treino não enxerga o _shared do principal): src/lib/logServidor.test.ts confere byte
// a byte. Mudou aqui? Copie para lá. Testes: src/lib/errosServidor.test.ts.
// Modelo: features/erros/limpar.ts do Nativo OS (W3, 04/10/2026) + as rotas do Physiq (/c/, /d/, /f/ e /p/ + código).
// Sem lookbehind nas regex: o app também abre em Safari antigo, que não conhece e recusaria o arquivo inteiro.

/** De onde veio o erro: as 4 capturas do app (D5) ou uma função (D6). "funcao" = o app viu uma função responder 5xx. */
export type OrigemErro = "tela" | "promessa" | "funcao" | "sync" | "servidor";
export type BancoErro = "principal" | "treino";
export type SchemaAviso = "public" | "staging";

/**
 * O erro como chega para o aviso (do app ou de uma função). Tudo é limpo de novo aqui dentro: passar o valor cru ou o já limpo
 * dá o mesmo texto e a mesma assinatura (as limpezas são idempotentes — o app mostra o código e o servidor chega ao mesmo).
 */
export interface ErroParaAviso {
  origem: OrigemErro;
  /** Mensagem do erro (texto livre: é limpo). */
  mensagem?: string | null;
  /** Caminho da tela (pode vir com query, # e ids: é limpo). */
  rota?: string | null;
  /** Nome curto da parte da tela, do código do app (ex.: "aba do aluno"). */
  lugar?: string | null;
  /** Slug da função: a que falhou (origem "funcao") ou a que avisa (origem "servidor"). */
  funcao?: string | null;
  /** Banco da função; sem ele, o principal. */
  banco?: BancoErro | null;
  /** Código do log da função ([a-z0-9_], até 48). */
  codigo?: string | null;
  /** Ação da função ([a-z0-9_], até 48). */
  acao?: string | null;
  /** HTTP (100–599). */
  status?: number | null;
  /** Versão do app (package.json, ex.: "3.74") e onde ele roda. */
  versao?: string | null;
  plataforma?: string | null;
}

export const LIMITE_MENSAGEM = 300;
/** Texto maior que isto é cortado antes da limpeza (a limpeza fica barata mesmo com uma página HTML dentro do erro). */
const LIMITE_BRUTO = 4000;
const LIMITE_LUGAR = 60;
const LIMITE_ROTA = 120;
const ORIGENS: readonly OrigemErro[] = ["tela", "promessa", "funcao", "sync", "servidor"];
const PLATAFORMAS = ["site", "app", "loja"];

// ───────────────────────── formatos fixos (os mesmos do log: _shared/log.ts) ─────────────────────────

/** Código de log ou de ação no formato fixo ([a-z0-9_], até 48; nunca uma chave sb_/sbp_) — ou "" quando não serve. */
export function codigoValido(v: unknown): string {
  return typeof v === "string" && /^[a-z0-9_]{1,48}$/.test(v) && !/^sbp?_/.test(v) ? v : "";
}

/** Slug de função ([a-z0-9-], até 48) — ou "". */
export function funcaoValida(v: unknown): string {
  return typeof v === "string" && /^[a-z0-9][a-z0-9-]{0,47}$/.test(v) ? v : "";
}

/** Status HTTP inteiro de 100 a 599 — ou null. */
export function statusValido(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 100 && v <= 599 ? v : null;
}

/** Versão do app ("3.74" ou "v3.74") → "v3.74"; fora do formato → "". */
export function versaoValida(v: unknown): string {
  const m = typeof v === "string" ? /^v?(\d{1,4}(?:\.\d{1,4}){0,3})$/.exec(v.trim()) : null;
  return m ? `v${m[1]}` : "";
}

/** "site" | "app" | "loja" — ou "". */
export function plataformaValida(v: unknown): string {
  return typeof v === "string" && PLATAFORMAS.includes(v) ? v : "";
}

function origemValida(v: unknown): OrigemErro {
  return ORIGENS.includes(v as OrigemErro) ? (v as OrigemErro) : "tela";
}

const ehDeFuncao = (origem: OrigemErro) => origem === "funcao" || origem === "servidor";

// ───────────────────────── limpar ─────────────────────────

// Caracteres de controle e de formatação invisíveis (inclusive os que invertem o texto) viram espaço. As faixas vão em números,
// e não em escapes dentro da regex, para nenhum editor trocar o escape pelo próprio caractere invisível.
const FAIXAS_INVISIVEIS: ReadonlyArray<readonly [number, number]> = [
  [0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2069], [0xfeff, 0xfeff],
];
const INVISIVEIS = new RegExp(
  `[${FAIXAS_INVISIVEIS.map(([de, ate]) => `${String.fromCharCode(de)}-${String.fromCharCode(ate)}`).join("")}]`,
  "g",
);

/** IPv6: o trecho de hex e ":" (achado por uma regex simples, sem retrocesso caro) só vira [ip] se tiver mesmo a cara de IP. */
function ipv6(trecho: string): string {
  if (trecho.length > 39 || !/^[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){3,7}$/i.test(trecho)) return trecho;
  const comCara = trecho.includes("::") || /[a-f]/i.test(trecho) || trecho.split(":").length > 5; // hora (12:30:45) não
  return comCara ? "[ip]" : trecho;
}

/** [o que procurar, pelo que trocar]. A ordem importa: do formato mais conhecido (token com prefixo) ao mais genérico. */
const TROCAS: ReadonlyArray<readonly [RegExp, string | ((trecho: string) => string)]> = [
  // JWT, "Bearer <qualquer coisa>" e chaves com prefixo conhecido (Supabase, Mercado Pago, Google)
  [/\beyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]*){0,2}/g, "[token]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [token]"],
  [/\b(?:sb_[a-z]+_|sbp_|APP_USR-|TEST-|ya29\.)[A-Za-z0-9_.-]{6,}/g, "[token]"],
  // token de bot do Telegram (<número>:<segredo>)
  [/\b\d{6,}:[A-Za-z0-9_-]{20,}/g, "[token]"],
  // segredo com nome no texto: "apikey=…", "token: …", "senha=…"
  [/\b(apikey|api[_-]?key|access[_-]?token|refresh[_-]?token|token|senha|password|secret|segredo|authorization)(\s*[=:]\s*)[^\s,;&"'<>)]+/gi, "$1$2[token]"],
  // URL: fica o endereço, sai a query e o # (o login antigo volta com #access_token=…; convite traz ?token=…)
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s?#"'<>]*)[?#][^\s"'<>]*/gi, "$1"],
  // query ou # soltos, sem o endereço na frente: "?email=…", "&nome=…", "#access_token=…"
  [/[?#&][A-Za-z0-9_.%[\]-]+=[^\s"'<>]*/g, ""],
  // e-mail (também com o @ codificado de URL, %40)
  [/[A-Za-z0-9._%+-]+(?:@|%40)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gi, "[e-mail]"],
  // o valor que o Postgres e o JSON.parse ecoam na mensagem: Key (email)=(…) · invalid input syntax for type uuid: "…" ·
  // Unexpected token 'J', "João Silv"... is not valid JSON
  [/\)=\([^)]*\)/g, ")=(?)"],
  [/: "[^"]*"/g, ': "?"'],
  [/"[^"]{0,40}"(?:\.\.\.)? is not valid JSON/g, '"?" is not valid JSON'],
  // id (uuid) e IP
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[id]"],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]"],
  [/[0-9A-Fa-f:]{7,}/g, ipv6],
  // segredo sem formato conhecido (antes dos dígitos, que partiriam o segredo ao meio): 32+ letras e números misturados;
  // base64 longo (com + ou /, maiúscula, minúscula e número)
  [/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}/g, "[token]"],
  [/(?=[A-Za-z0-9+/]*[+/])(?=[A-Za-z0-9+/]*\d)(?=[A-Za-z0-9+/]*[a-z])(?=[A-Za-z0-9+/]*[A-Z])[A-Za-z0-9+/]{40,}={0,2}/g, "[token]"],
  // CNPJ e CPF (com ou sem pontuação) antes do telefone, para não virarem "telefone"
  [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[cnpj]"],
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[cpf]"],
  [/(?:\+?55\s?)?(?:\(\d{2}\)|\b\d{2})\s?9?\d{4}[-\s]?\d{4}\b/g, "[telefone]"],
  // qualquer outra sequência longa de dígitos, mesmo colada em letra (id do Mercado Pago, cartão, IMEI, "ref_12345678909")
  [/\d{11,}/g, "[número]"],
];

function cortar(texto: string, limite: number): string {
  if (texto.length <= limite) return texto;
  let fim = limite - 1;
  // não parte um emoji ao meio (a metade sozinha é texto inválido para o Telegram)
  const codigo = texto.charCodeAt(fim - 1);
  if (codigo >= 0xd800 && codigo <= 0xdbff) fim -= 1;
  return `${texto.slice(0, fim)}…`;
}

/**
 * Texto livre (mensagem de erro) sem dado pessoal nem segredo: e-mail, CPF, CNPJ, telefone, IP, uuid, 11+ dígitos, JWT,
 * chaves (sb_, sbp_, APP_USR-, TEST-), token do Telegram, segredo genérico, query e # de URL, o valor que o Postgres ecoa.
 * Junta os espaços e corta em `limite` caracteres (300; o log usa 200). Vazio → "". Idempotente: limpar 2× = limpar 1×.
 * Não reconhece nome de pessoa (fica o texto técnico — risco 4 da spec).
 */
export function limparMensagem(bruta: unknown, limite = LIMITE_MENSAGEM): string {
  let m = String(bruta ?? "").replace(INVISIVEIS, " ").replace(/\s+/g, " ").trim();
  if (m.length > LIMITE_BRUTO) {
    // texto enorme (página HTML dentro do erro…): corta antes de limpar, sem deixar meia palavra (meio e-mail) no corte
    m = m.slice(0, LIMITE_BRUTO);
    m = m.slice(0, Math.max(0, m.lastIndexOf(" "))) || "[texto longo]";
  }
  if (!m) return "";
  // os 2 ramos são o mesmo replace: o TypeScript só escolhe a sobrecarga (texto ou função) com o tipo já separado
  for (const [procura, troca] of TROCAS) m = typeof troca === "string" ? m.replace(procura, troca) : m.replace(procura, troca);
  return cortar(m.replace(/\s+/g, " ").trim(), Math.max(2, limite));
}

/** Nome curto da parte da tela ("aba do aluno"): limpo como a mensagem, até 60 caracteres. */
export function limparLugar(bruto: unknown): string {
  return limparMensagem(bruto, LIMITE_LUGAR);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** As páginas públicas com código do link (rotas/registro.ts, ROTAS_PUBLICAS): /f/:slug, /d/:codigo, /c/:codigo, /p/:codigo. */
const PUBLICAS_COM_CODIGO = ["c", "d", "f", "p"];

function limparSegmento(seg: string, anterior: string, posicao: number): string {
  if (!seg) return seg;
  if (posicao === 2 && PUBLICAS_COM_CODIGO.includes(anterior)) return ":codigo";
  if (/^:[a-z][a-z0-9_-]*$/i.test(seg)) return seg; // já é um marcador (":id") ou o padrão da rota
  if (UUID.test(seg)) return ":id";
  if (/^\d+$/.test(seg)) return ":n";
  if (seg.includes("@") || /%40/i.test(seg)) return ":e-mail";
  if (/^[A-Za-z0-9_-]{16,}$/.test(seg) && /\d/.test(seg)) return ":token";
  if (!/^[A-Za-z0-9_.~-]+$/.test(seg)) return ":texto"; // espaço, acento, %… = dado digitado
  return seg.length > 40 ? ":longo" : seg;
}

/**
 * Caminho da tela sem nada que identifique alguém: nunca leva query nem # (o #access_token do login antigo), tira o endereço
 * quando vem a URL inteira; uuid → ":id", número → ":n", código do link público (/c/ABC123) → ":codigo", token → ":token",
 * e-mail → ":e-mail", texto digitado → ":texto". Até 120 caracteres (o resto vira "/:mais"). Vazio → "". Idempotente.
 */
export function limparRota(bruta: unknown): string {
  const original = String(bruta ?? "").replace(INVISIVEIS, "").trim();
  if (!original) return "";
  let r = original.split(/[?#]/)[0].trim();
  // URL inteira: o site e o app (https://…, capacitor://localhost) perdem o endereço; o deep link do app
  // (com.physiq.app://login-callback) perde só o esquema — ali o "endereço" é o caminho
  r = /^(?:https?|capacitor|ionic):\/\//i.test(r) ? r.replace(/^[a-z]+:\/\/[^/]*/i, "") : r.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  if (!r.startsWith("/")) r = `/${r}`;
  const partes = r.split("/");
  const limpas = partes.map((seg, i) => limparSegmento(seg, partes[i - 1] ?? "", i));
  let saida = "";
  for (let i = 1; i < limpas.length; i++) {
    const proxima = `${saida}/${limpas[i]}`;
    if (proxima.length > LIMITE_ROTA) return `${saida}/:mais`;
    saida = proxima;
  }
  return saida || "/";
}

// ───────────────────────── assinatura, texto do aviso e trava ─────────────────────────

/** FNV-1a de 32 bits sobre os bytes UTF-8: rápido, síncrono e igual no Deno, no navegador e no Node. */
function fnv1a(texto: string): string {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(texto)) {
    h ^= byte;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * O código do erro (8 caracteres hex): o mesmo erro no mesmo lugar dá sempre o mesmo código. Entra a origem e o lugar (a tela
 * para as capturas do app; banco, função, código, ação e HTTP para as funções — a tela de quem chamou não conta) e a mensagem
 * limpa com os números trocados por "#" ("linha 12" e "linha 13" contam igual). Não entram versão, plataforma nem ambiente.
 * A tela mostra este código e o aviso repete (🔑): é por ele que se acha um no outro.
 */
export function assinatura(erro: ErroParaAviso): string {
  const origem = origemValida(erro.origem);
  const funcao = ehDeFuncao(origem);
  const partes = [
    origem,
    funcao ? (erro.banco === "treino" ? "treino" : "principal") : "",
    funcao ? funcaoValida(erro.funcao) : "",
    funcao ? codigoValido(erro.codigo) : "",
    funcao ? codigoValido(erro.acao) : "",
    funcao ? String(statusValido(erro.status) ?? "") : "",
    funcao ? "" : limparRota(erro.rota),
    limparLugar(erro.lugar),
    limparMensagem(erro.mensagem).replace(/\d+/g, "#"),
  ];
  return fnv1a(partes.join("|"));
}

const ROTULO: Record<OrigemErro, string> = {
  tela: "tela",
  promessa: "promessa sem catch",
  sync: "sincronização",
  funcao: "função",
  servidor: "função",
};

/**
 * Onde foi (a linha 📍 do aviso, sem o emoji): "tela · /painel/alunos/:id (aba do aluno)" ou
 * "função cobranca-conta · mp_pix_falhou · HTTP 502 · ação pix_criar" ("(Treino)" depois do nome quando a função é de lá).
 */
export function ondeDoErro(erro: ErroParaAviso): string {
  const origem = origemValida(erro.origem);
  const rota = limparRota(erro.rota);
  const lugar = limparLugar(erro.lugar);
  let partes: string[];
  if (ehDeFuncao(origem)) {
    partes = [`função ${funcaoValida(erro.funcao) || "?"}${erro.banco === "treino" ? " (Treino)" : ""}`];
    const codigo = codigoValido(erro.codigo);
    const status = statusValido(erro.status);
    const acao = codigoValido(erro.acao);
    if (codigo) partes.push(codigo);
    if (status) partes.push(`HTTP ${status}`);
    if (acao) partes.push(`ação ${acao}`);
    if (origem === "funcao" && rota) partes.push(`na tela ${rota}`);
  } else {
    partes = [ROTULO[origem], rota || "(rota desconhecida)"];
  }
  return `${partes.join(" · ")}${lugar ? ` (${lugar})` : ""}`;
}

/** A linha 🧩: "servidor" para as funções; "v3.74 · app" para o app (só o que veio no formato certo). */
function montagem(erro: ErroParaAviso): string {
  if (origemValida(erro.origem) === "servidor") return "servidor";
  return [versaoValida(erro.versao), plataformaValida(erro.plataforma)].filter(Boolean).join(" · ");
}

/**
 * O texto do aviso no Telegram (texto puro: vai sem parse_mode, nada de Markdown). Formato (spec D4):
 *   🔴 Erro no Physiq [staging]        ← sem "[staging]" na produção (schema public)
 *   📍 tela · /painel/alunos/:id (aba do aluno)
 *   💬 <mensagem limpa>                ← só quando há mensagem
 *   🧩 v3.74 · app                     ← "servidor" quando veio de uma função
 *   🔑 a1b2c3d4                        ← a assinatura (o código que a tela mostra)
 *   🔁 +3 iguais segurados             ← só quando o banco segurou iguais desde o último aviso
 * Não leva id de usuário, e-mail, nome, query nem corpo de nada.
 */
export function montarAviso(erro: ErroParaAviso, opcoes: { schema: SchemaAviso; segurados?: number | null }): string {
  const mensagem = limparMensagem(erro.mensagem);
  const n = opcoes.segurados;
  const segurados = typeof n === "number" && Number.isInteger(n) && n > 0 ? n : 0;
  const ambiente = opcoes.schema === "public" ? "" : ` [${opcoes.schema === "staging" ? "staging" : "?"}]`;
  const feito = montagem(erro);
  return [
    `🔴 Erro no Physiq${ambiente}`,
    `📍 ${ondeDoErro(erro)}`,
    mensagem ? `💬 ${mensagem}` : "",
    feito ? `🧩 ${feito}` : "",
    `🔑 ${assinatura(erro)}`,
    segurados > 0 ? `🔁 +${segurados} ${segurados === 1 ? "igual segurado" : "iguais segurados"}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export interface Trava {
  /** true = já avisou desta chave há menos da janela (segura); false = pode avisar (e marca agora). */
  segura(chave: string, agora?: number): boolean;
}

/**
 * Trava na memória da instância (1ª camada, vale mesmo com o banco fora do ar): a mesma chave só passa 1 vez a cada `janelaMs`
 * (10 min). A chave do aviso é "<schema>:<assinatura>" — a mesma instância atende staging e produção. Guarda até `maximo`
 * chaves (as vencidas saem primeiro; depois, as mais antigas).
 */
export function criarTrava(janelaMs = 10 * 60 * 1000, maximo = 500): Trava {
  const vistos = new Map<string, number>();
  return {
    segura(chave: string, agora: number = Date.now()): boolean {
      const ultimo = vistos.get(chave);
      if (ultimo !== undefined && agora - ultimo < janelaMs) return true;
      vistos.delete(chave);
      vistos.set(chave, agora);
      if (vistos.size > maximo) {
        for (const [k, quando] of vistos) if (agora - quando >= janelaMs) vistos.delete(k);
        for (const k of vistos.keys()) {
          if (vistos.size <= maximo) break;
          vistos.delete(k);
        }
      }
      return false;
    },
  };
}
