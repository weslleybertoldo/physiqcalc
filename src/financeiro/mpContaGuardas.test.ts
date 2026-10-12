// src/financeiro/mpContaGuardas.test.ts
// Physiq W2 (Task 18) — as guardas de FONTE do Mercado Pago do personal (o molde do recebimentoJeito2.test.ts: lê os arquivos, não importa
// nada deles). Cada regra tem o seu caso de controle — um trecho inventado que ela acusa (a prova de que a regra não passa sempre):
//   1. o navegador (src/, fora dos testes) nunca fala com as tabelas dos tokens nem conhece os segredos; nenhum .env* (nem o CI ou a config
//      do Vite) põe o client ou a chave dos tokens numa VITE_ (o que é VITE_ vai para o pacote do navegador);
//   2. as colunas dos tokens e o verifier do PKCE só aparecem onde o plano deixa (a leitura e a gravação cifradas) e nunca numa resposta;
//   3. o log das funções que seguram o token da conta nunca leva token, code, state, verifier nem a chave pública (campo, valor ou variável);
//   4. Recebimento e PagarMercadoPago sem o cliente do banco (jeito 2);
//   5. a regra da coluna nova (revisão C2): mp_collector_id livre só no _shared/mp-conta.ts (o dono da regra: tudo lá passa pelo
//      schemaTemW2); no _shared/financeiro-mp.ts só no COLUNAS_COBRANCA_W2 e nos tipos; em qualquer outra função, TODA linha com ela leva
//      "// W2: depois do schemaTemW2" (o select/insert solto com a coluna quebraria o public sem a migration da W2 — 42703/PGRST204).
// O que só está em comentário não conta (o leitor troca cada caractere de comentário por espaço e mantém as linhas); declaração de tipo
// (`campo?: …`, `campo: string | null`) também não.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RAIZ = resolve(SRC, "..");
const FUNCOES = join(RAIZ, "supabase-principal", "functions");
/** Pastas que a varredura não visita (dependências, build, saídas e a fábrica dos exercícios 3D). */
const PULAR = new Set(["node_modules", ".git", ".next", "dist", "android", "build", ".venv", "__pycache__", "public", "tex", "relatorios", ".vercel"]);

function listar(dir: string, aceita: (nome: string) => boolean): string[] {
  return readdirSync(dir).flatMap((n) => {
    const c = join(dir, n);
    let pasta: boolean;
    try {
      pasta = statSync(c).isDirectory();
    } catch {
      return []; // link quebrado
    }
    if (pasta) return PULAR.has(n) ? [] : listar(c, aceita);
    return aceita(n) ? [c] : [];
  });
}
/** O caminho a partir da raiz do repo, sempre com "/" (é o nome que as regras e os achados usam). */
const doRepo = (c: string) => relative(RAIZ, c).split("\\").join("/");
const ler = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");
const ehFonteSemTeste = (n: string) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(n) && !/\.(test|spec)\.[jt]sx?$/.test(n);

// ── o leitor ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

interface Fonte {
  /** a fonte sem os comentários (cada caractere de comentário vira espaço; as quebras de linha ficam: índice e linha são os da fonte) */
  codigo: string;
  /** o mesmo e também sem o miolo dos textos ('…', "…", o fixo dos `…` e o corpo das regex; o ${…} fica) — para nomes e pares de ( [ { */
  mascara: string;
}
const ANTES_DE_REGEX = /[(,=:[!&|?{};+\-*%<>~^]$/;
const PALAVRA_ANTES_DE_REGEX = /^(?:return|typeof|case|in|of|void|await|yield|else|do)$/;

function lerFonte(fonte: string): Fonte {
  const n = fonte.length;
  const cod = fonte.split("");
  const mas = fonte.split("");
  const apagar = (arr: string[], i: number) => {
    if (i < n && arr[i] !== "\n" && arr[i] !== "\r") arr[i] = " ";
  };
  const pilha: Array<"texto" | { chaves: number }> = [];
  let ultimo = "";
  let palavra = "";
  let i = 0;
  while (i < n) {
    const c = fonte[i];
    const d = fonte[i + 1];
    const topo = pilha[pilha.length - 1];
    if (topo === "texto") {
      // dentro de um `…`: só o ${…} é código
      if (c === "\\") {
        apagar(mas, i);
        apagar(mas, i + 1);
        i += 2;
      } else if (c === "`") {
        pilha.pop();
        ultimo = "`";
        i++;
      } else if (c === "$" && d === "{") {
        pilha.push({ chaves: 0 });
        ultimo = "{";
        i += 2;
      } else {
        apagar(mas, i);
        i++;
      }
      continue;
    }
    if (c === "/" && d === "/") {
      for (; i < n && fonte[i] !== "\n"; i++) {
        apagar(cod, i);
        apagar(mas, i);
      }
      continue;
    }
    if (c === "/" && d === "*") {
      const fim = fonte.indexOf("*/", i + 2);
      for (const ate = fim < 0 ? n : fim + 2; i < ate; i++) {
        apagar(cod, i);
        apagar(mas, i);
      }
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      for (; j < n && fonte[j] !== c && fonte[j] !== "\n"; j++) {
        if (fonte[j] === "\\") apagar(mas, j++);
        apagar(mas, j);
      }
      ultimo = c;
      palavra = "";
      i = j + 1;
      continue;
    }
    if (c === "`") {
      pilha.push("texto");
      i++;
      continue;
    }
    if (c === "/" && (ultimo === "" || ANTES_DE_REGEX.test(ultimo) || PALAVRA_ANTES_DE_REGEX.test(palavra))) {
      let j = i + 1;
      let classe = false;
      for (; j < n && fonte[j] !== "\n"; j++) {
        if (fonte[j] === "\\") {
          apagar(mas, j++);
          apagar(mas, j);
          continue;
        }
        if (fonte[j] === "[") classe = true;
        else if (fonte[j] === "]") classe = false;
        else if (fonte[j] === "/" && !classe) break;
        apagar(mas, j);
      }
      for (j++; j < n && /[a-z]/i.test(fonte[j]); j++);
      ultimo = "/";
      palavra = "";
      i = j;
      continue;
    }
    if (topo) {
      // dentro de um ${…}: o } dele volta para o texto
      if (c === "{") topo.chaves++;
      else if (c === "}") {
        if (topo.chaves === 0) {
          pilha.pop();
          ultimo = "}";
          i++;
          continue;
        }
        topo.chaves--;
      }
    }
    if (/[\w$]/.test(c)) palavra = /[\w$]/.test(fonte[i - 1] ?? "") ? palavra + c : c;
    else if (!/\s/.test(c)) palavra = "";
    if (!/\s/.test(c)) ultimo = c;
    i++;
  }
  return { codigo: cod.join(""), mascara: mas.join("") };
}

function linhaDe(texto: string, i: number): number {
  let linha = 1;
  for (let k = texto.indexOf("\n"); k !== -1 && k < i; k = texto.indexOf("\n", k + 1)) linha++;
  return linha;
}

/** O índice do fecho do par aberto em `abre` (na máscara: texto e comentário não contam). */
function fecho(mascara: string, abre: number): number {
  let prof = 0;
  for (let i = abre; i < mascara.length; i++) {
    const c = mascara[i];
    if (c === "(" || c === "[" || c === "{") prof++;
    else if (c === ")" || c === "]" || c === "}") {
      prof--;
      if (prof === 0) return i;
    }
  }
  return mascara.length;
}

interface Chamada {
  nome: string;
  /** índice do "(" */
  abre: number;
  /** índice do ")" */
  fim: number;
  /** os argumentos sem comentário (com os textos) */
  args: string;
}
/** As chamadas cujo nome casa com `re` (com /g; o casamento termina no "("), achadas na máscara (texto e comentário não contam). */
function chamadas(f: Fonte, re: RegExp): Chamada[] {
  return [...f.mascara.matchAll(re)].map((m) => {
    const abre = m.index + m[0].length - 1;
    const fim = fecho(f.mascara, abre);
    return { nome: m[0].replace(/\s*\($/, "").replace(/\s+/g, " "), abre, fim, args: f.codigo.slice(abre + 1, fim) };
  });
}

/** Os argumentos de primeiro nível de uma chamada: [início, fim) de cada um, na fonte. */
function argumentos(f: Fonte, ch: Chamada): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let prof = 0;
  let comeco = ch.abre + 1;
  for (let i = ch.abre + 1; i < ch.fim; i++) {
    const c = f.mascara[i];
    if (c === "(" || c === "[" || c === "{") prof++;
    else if (c === ")" || c === "]" || c === "}") prof--;
    else if (c === "," && prof === 0) {
      out.push([comeco, i]);
      comeco = i + 1;
    }
  }
  out.push([comeco, ch.fim]);
  return out.filter(([a, b]) => f.mascara.slice(a, b).trim() !== "");
}

const TIPO_SIMPLES = "(?:string|number|bigint|boolean|unknown|null|undefined)";
const RE_TIPO_DEPOIS_DO_NOME = new RegExp(`^\\s*:\\s*(${TIPO_SIMPLES}(?:\\s*\\|\\s*${TIPO_SIMPLES})*)\\s*(?:[;,})\\]>]|$)`);
/** O nome que termina em `fim` é a declaração de um campo de tipo? (`nome?: …` ou `nome: string | null`). `nome: null` sozinho não: pode
 *  ser o valor de um insert ({ coluna: null }). */
function ehTipo(texto: string, fim: number): boolean {
  const depois = texto.slice(fim, fim + 160);
  if (/^\?:/.test(depois)) return true;
  const m = RE_TIPO_DEPOIS_DO_NOME.exec(depois);
  return !!m && /\b(?:string|number|bigint|boolean|unknown)\b/.test(m[1]);
}

/** "arquivo:linha — o quê", em ordem de posição, sem repetir a mesma posição. */
function relatar(nome: string, f: Fonte, achados: Map<number, string>): string[] {
  return [...achados.entries()].sort((a, b) => a[0] - b[0]).map(([i, o]) => `${nome}:${linhaDe(f.codigo, i)} — ${o}`);
}

// ── 1. o navegador ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const RE_TABELA_DOS_TOKENS = /\bfrom\s*\(\s*["'`](?:recebimento_integracoes|mp_conexoes)["'`]\s*\)/g;
const RE_SEGREDO_NO_NAVEGADOR = /\b(?:MP_CLIENT_SECRET\w*|MP_TOKENS_CHAVE|client_secret)\b/g;
const RE_VITE_DO_SEGREDO = /\bVITE_MP_(?:CLIENT|TOKENS)\w*/g;

function achadosNoNavegador(nome: string, fonte: string): string[] {
  const f = lerFonte(fonte);
  const achados = new Map<number, string>();
  for (const re of [RE_TABELA_DOS_TOKENS, RE_SEGREDO_NO_NAVEGADOR]) for (const m of f.codigo.matchAll(re)) achados.set(m.index, m[0]);
  return relatar(nome, f, achados);
}
/** .env*, o CI e a config do Vite: qualquer menção (até em comentário — é a dica de pôr o segredo numa VITE_). */
function achadosNaConfig(nome: string, texto: string): string[] {
  return [...texto.matchAll(RE_VITE_DO_SEGREDO)].map((m) => `${nome}:${linhaDe(texto, m.index)} — ${m[0]}`);
}

// ── 2. os nomes dos tokens ────────────────────────────────────────────────────────────────────────────────────────────────────────────

const NOMES_DOS_TOKENS = "mp_access_token|mp_refresh_token|token_access|token_refresh|verificador";
const RE_NOME_DO_TOKEN = new RegExp(`\\b(${NOMES_DOS_TOKENS})\\b`, "g");
/** Onde os nomes podem aparecer (o plano): o dono da leitura/gravação cifrada, as regras puras dele (o desafioPkce(verificador) — o S256
 *  do PKCE; o arquivo não fala com o banco nem responde), a volta do OAuth e o job da renovação. */
const LIVRES_DOS_TOKENS = new Set([
  "supabase-principal/functions/_shared/mp-conta.ts",
  "supabase-principal/functions/_shared/mp-conta-regras.ts",
  "supabase-principal/functions/mp-conectar-retorno/index.ts",
  "supabase-principal/functions/mp-contas-renovar/index.ts",
]);
/** …e, na pagamentos-aluno, só dentro destas ações (a gravação: o verifier cifrado do conectar e o token de teste cifrado do simular). */
const ACOES_DOS_TOKENS: Record<string, string[]> = {
  "supabase-principal/functions/pagamentos-aluno/index.ts": ["prof_mp_conectar", "prof_mp_simular_conexao"],
};
/** O filtro que só pergunta SE há token (não lê o valor) vale em qualquer lugar: .not("x", "is", null), .is("x", null), "x.is.null". */
const RE_SO_SE_TEM = [
  new RegExp(`\\.not\\(\\s*(["'])(?:${NOMES_DOS_TOKENS})\\1\\s*,\\s*(["'])is\\2\\s*,\\s*null\\s*\\)`, "g"),
  new RegExp(`\\.is\\(\\s*(["'])(?:${NOMES_DOS_TOKENS})\\1\\s*,\\s*null\\s*\\)`, "g"),
  new RegExp(`\\b(?:${NOMES_DOS_TOKENS})\\.(?:not\\.)?is\\.null\\b`, "g"),
];
/** As respostas: json(…), responder(…), resposta(…), falhar(…) e erro(…) (o `extra` vai no corpo), ok(…), voltar(…) (o 302 da volta do
 *  OAuth) e new Response(…). Método de outro objeto (log.erro, res.json) não é resposta. */
const RE_RESPOSTA = /(?<![\w$.])(?:json|responder|resposta|falhar|erro|ok|voltar)\s*\(|\bnew\s+Response\s*\(/g;
const RE_NUNCA_NA_RESPOSTA = new RegExp(
  `\\b(${NOMES_DOS_TOKENS}|code_verifier|client_secret|clientSecret|MP_CLIENT_SECRET\\w*|MP_TOKENS_CHAVE|chaveMp|tokenMp)\\b`,
  "g",
);

/** O corpo `{ … }` do `if (acao === "<acao>") {` (índices na fonte), ou null. */
function blocoDaAcao(f: Fonte, acao: string): [number, number] | null {
  const m = new RegExp(`\\bif\\s*\\(\\s*acao\\s*===\\s*(["'])${acao}\\1\\s*\\)\\s*\\{`).exec(f.codigo);
  if (!m) return null;
  const abre = m.index + m[0].length - 1;
  return [abre, fecho(f.mascara, abre)];
}

function achadosDosTokens(nome: string, fonte: string): string[] {
  const f = lerFonte(fonte);
  const achados = new Map<number, string>();
  if (!LIVRES_DOS_TOKENS.has(nome)) {
    let codigo = f.codigo;
    for (const re of RE_SO_SE_TEM) codigo = codigo.replace(re, (t) => " ".repeat(t.length));
    const blocos = (ACOES_DOS_TOKENS[nome] ?? []).map((a) => blocoDaAcao(f, a)).filter((b): b is [number, number] => !!b);
    for (const m of codigo.matchAll(RE_NOME_DO_TOKEN)) {
      if (ehTipo(codigo, m.index + m[0].length)) continue;
      if (blocos.some(([a, b]) => m.index > a && m.index < b)) continue;
      achados.set(m.index, `${m[1]} fora dos lugares do plano`);
    }
  }
  for (const ch of chamadas(f, RE_RESPOSTA)) {
    for (const m of ch.args.matchAll(RE_NUNCA_NA_RESPOSTA)) achados.set(ch.abre + 1 + m.index, `${m[1]} numa resposta (${ch.nome})`);
  }
  return relatar(nome, f, achados);
}

// ── 3. o log ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** As funções que seguram o token da conta do personal (a regra 3 lê o log delas). */
const RE_DO_MP_DA_CONTA =
  /^supabase-principal\/functions\/(?:(?:mp-conectar-retorno|mp-contas-renovar|pagamentos-aluno|mp-webhook-aluno|automaticas-fila|master-contas)\/|_shared\/(?:mp-conta|mp-conta-regras|cifra-mp)\.ts$)/;
/** log.info|aviso|erro|excecao (o _shared/log.ts) e, por garantia, o console. */
const RE_LOG = /\b(?:log\s*\.\s*(?:info|aviso|erro|excecao)|console\s*\.\s*(?:log|info|warn|error|debug))\s*\(/g;
/** Nome solto (campo, valor ou variável). Seguido de "." / "?." / "[" é a base de outro nome (chave.id): aí só conta se tiver "token". */
const SOLTO_NO_LOG =
  /token|^(?:code|state|verificador|estado|public_key|publicKey|chavePublica|chave_publica|mp_public_key|access|refresh|novoRefresh|clientSecret|client_secret|code_verifier|segredo|chave|chaveMp)$/i;
/** Membro (depois de "." ou "?."): cred.token, t.access, con.verificador… (code/state não: e.code é o código do Postgres). */
const MEMBRO_NO_LOG = /token|^(?:access|refresh|verificador|publicKey|public_key|mp_public_key|clientSecret|client_secret|code_verifier)$/i;

/** Os `{ … }` de `const|let|var <nome> = { … }` no arquivo (índices na fonte). */
function objetosDaVariavel(f: Fonte, nome: string): Array<[number, number]> {
  const re = new RegExp(`\\b(?:const|let|var)\\s+${nome.replace(/\$/g, "\\$")}\\s*(?::[^=;]+)?=\\s*\\{`, "g");
  return [...f.codigo.matchAll(re)].map((m) => {
    const abre = m.index + m[0].length - 1;
    return [abre, fecho(f.mascara, abre) + 1] as [number, number];
  });
}

function achadosNoLog(nome: string, fonte: string): string[] {
  const f = lerFonte(fonte);
  const achados = new Map<number, string>();
  const vistos = new Set<string>();
  const porVariavel = (i: number, variavel: string, nivel: number) => {
    const objetos = objetosDaVariavel(f, variavel);
    if (!objetos.length) achados.set(i, `o log leva "${variavel}" e a guarda não acha o objeto dela no arquivo`);
    for (const [a, b] of objetos) conferir(a, b, nivel + 1);
  };
  const conferir = (ini: number, fim: number, nivel: number) => {
    const chave = `${ini}:${fim}`;
    if (vistos.has(chave) || nivel > 3) return;
    vistos.add(chave);
    const mascara = f.mascara.slice(ini, fim);
    const sozinho = /^\s*([A-Za-z_$][\w$]*)\s*$/.exec(mascara);
    if (sozinho) return porVariavel(ini + sozinho.index, sozinho[1], nivel);
    for (const m of mascara.matchAll(/[A-Za-z_$][\w$]*/g)) {
      if (m.index > 0 && /[\w$]/.test(mascara[m.index - 1])) continue; // pedaço de número (1e5, 0x1f)
      const antes = mascara.slice(0, m.index).replace(/\s+$/, "");
      const depois = mascara.slice(m.index + m[0].length);
      const membro = /\.$/.test(antes) && !/\.\.\.$/.test(antes);
      const base = /^\s*(?:!?\??\.|\[)/.test(depois);
      const ruim = membro ? MEMBRO_NO_LOG.test(m[0]) : SOLTO_NO_LOG.test(m[0]) && (!base || /token/i.test(m[0]));
      if (ruim) achados.set(ini + m.index, `${membro ? "." : ""}${m[0]} no log`);
      if (!membro && /\.\.\.$/.test(antes) && !base && !/^\s*\(/.test(depois)) porVariavel(ini + m.index, m[0], nivel); // { ...base }
    }
    const codigo = f.codigo.slice(ini, fim);
    for (const q of codigo.matchAll(/(["'])([^"'\n]*)\1\s*:/g)) {
      if (SOLTO_NO_LOG.test(q[2])) achados.set(ini + q.index, `"${q[2]}" no log`);
    }
  };
  for (const ch of chamadas(f, RE_LOG)) {
    const args = argumentos(f, ch);
    // o 1º argumento do log.excecao é o erro capturado: o log.ts só tira dele o name, o código do Postgres e a mensagem limpa
    (/excecao/.test(ch.nome) ? args.slice(1) : args).forEach(([a, b]) => conferir(a, b, 0));
  }
  return relatar(nome, f, achados);
}

// ── 4. as telas ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const TELAS_DO_MP = ["src/painel/configuracoes/Recebimento.tsx", "src/app-aluno/perfil/pagamentos/PagarMercadoPago.tsx"];
const RE_BANCO_NA_TELA = /\bprincipal\s*\.\s*(from|rpc|storage)\b/g;

function achadosNaTela(nome: string, fonte: string): string[] {
  const f = lerFonte(fonte);
  const achados = new Map<number, string>();
  for (const m of f.codigo.matchAll(RE_BANCO_NA_TELA)) achados.set(m.index, `principal.${m[1]} na tela`);
  return relatar(nome, f, achados);
}

// ── 5. a coluna nova ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const MARCA_W2 = "// W2: depois do schemaTemW2";
const DONO_DA_COLUNA = "supabase-principal/functions/_shared/mp-conta.ts";
const SO_COLUNAS_E_TIPOS = "supabase-principal/functions/_shared/financeiro-mp.ts";

function achadosDaColunaNova(nome: string, fonte: string): string[] {
  if (nome === DONO_DA_COLUNA) return [];
  const f = lerFonte(fonte);
  const linhas = f.codigo.split("\n");
  const originais = fonte.split("\n");
  const achados: string[] = [];
  linhas.forEach((l, k) => {
    const usos = [...l.matchAll(/\bmp_collector_id\b/g)].filter((m) => !ehTipo(l, m.index + m[0].length));
    if (!usos.length) return;
    if (nome === SO_COLUNAS_E_TIPOS) {
      if (!/^\s*export\s+const\s+COLUNAS_COBRANCA_W2\s*=/.test(l)) {
        achados.push(`${nome}:${k + 1} — mp_collector_id aqui só no COLUNAS_COBRANCA_W2 e nos tipos (quem chama monta o colunasW2 pelo comCollector)`);
      }
      return;
    }
    if (!originais[k].includes(MARCA_W2)) achados.push(`${nome}:${k + 1} — mp_collector_id sem o comentário "${MARCA_W2}"`);
  });
  return achados;
}

// ── os arquivos ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const DO_SRC = listar(SRC, ehFonteSemTeste).map(doRepo);
const DAS_FUNCOES = listar(FUNCOES, (n) => /\.ts$/.test(n) && !/\.test\.ts$/.test(n)).map(doRepo);
const DO_MP_DA_CONTA = DAS_FUNCOES.filter((r) => RE_DO_MP_DA_CONTA.test(r));
/** Onde uma VITE_ ganha valor: os .env* (em qualquer pasta do repo), os workflows do CI e a config do Vite. */
const DE_CONFIG = [
  ...listar(RAIZ, (n) => n.startsWith(".env")),
  ...listar(join(RAIZ, ".github"), (n) => /\.ya?ml$/.test(n)),
  join(RAIZ, "vite.config.ts"),
].map(doRepo);

describe("W2 — guardas de fonte do Mercado Pago do personal", () => {
  describe("1. segredo fora do navegador", () => {
    it('src/ (fora dos testes) sem from("recebimento_integracoes"), from("mp_conexoes"), MP_CLIENT_SECRET, MP_TOKENS_CHAVE, client_secret', () => {
      expect(DO_SRC.length).toBeGreaterThan(300);
      expect(DO_SRC.flatMap((r) => achadosNoNavegador(r, ler(r)))).toEqual([]);
    });
    it("nenhum .env* do repo (nem o CI nem a config do Vite) com VITE_MP_CLIENT ou VITE_MP_TOKENS", () => {
      expect(DE_CONFIG).toContain(".env.example");
      expect(DE_CONFIG.flatMap((r) => achadosNaConfig(r, ler(r)))).toEqual([]);
    });
    it("controle: acusa a tabela dos tokens e o segredo no navegador e a VITE_ do segredo; o comentário não conta", () => {
      const tela = [
        'const { data } = await principal.from("mp_conexoes").select("id");',
        "const chave = import.meta.env.MP_TOKENS_CHAVE;",
        "const corpo = { client_id: id, client_secret: s }; // client_secret também aqui (o do comentário não conta)",
        "// o client_secret e o from(\"recebimento_integracoes\") nunca vêm ao navegador (comentário: não conta)",
      ].join("\n");
      expect(achadosNoNavegador("src/inventado.ts", tela)).toEqual([
        'src/inventado.ts:1 — from("mp_conexoes")',
        "src/inventado.ts:2 — MP_TOKENS_CHAVE",
        "src/inventado.ts:3 — client_secret",
      ]);
      expect(achadosNaConfig(".env.inventado", "VITE_MP_PUBLIC_KEY=TEST-1\nVITE_MP_CLIENT_SECRET=abc\n# VITE_MP_TOKENS_CHAVE=\n")).toEqual([
        ".env.inventado:2 — VITE_MP_CLIENT_SECRET",
        ".env.inventado:3 — VITE_MP_TOKENS_CHAVE",
      ]);
    });
  });

  describe("2. os tokens e o verifier só onde o plano deixa, e nunca numa resposta", () => {
    it("mp_access_token, mp_refresh_token, token_access, token_refresh e verificador: só nos lugares do plano; nenhum numa resposta", () => {
      expect(DAS_FUNCOES.length).toBeGreaterThan(50);
      expect(DAS_FUNCOES.flatMap((r) => achadosDosTokens(r, ler(r)))).toEqual([]);
    });
    it("a guarda enxerga: os lugares do plano têm os nomes, as 2 ações da pagamentos-aluno existem e as respostas são achadas", () => {
      for (const r of ["supabase-principal/functions/_shared/mp-conta.ts", "supabase-principal/functions/mp-conectar-retorno/index.ts"]) {
        expect(lerFonte(ler(r)).codigo).toMatch(new RegExp(RE_NOME_DO_TOKEN.source)); // cópia: o .test de uma /g mexe no lastIndex dela
      }
      const pagamentos = lerFonte(ler("supabase-principal/functions/pagamentos-aluno/index.ts"));
      for (const [acao, nomeDoToken] of [["prof_mp_conectar", "verificador"], ["prof_mp_simular_conexao", "mp_access_token"]]) {
        const bloco = blocoDaAcao(pagamentos, acao);
        expect(bloco).not.toBeNull();
        expect(pagamentos.codigo.slice(bloco[0], bloco[1])).toContain(nomeDoToken);
      }
      const respostas = DAS_FUNCOES.reduce((n, r) => n + chamadas(lerFonte(ler(r)), RE_RESPOSTA).length, 0);
      expect(respostas).toBeGreaterThan(200);
    });
    it("controle: acusa o nome fora do lugar, fora da ação certa e numa resposta; o filtro de nulo, o tipo e o comentário não contam", () => {
      const aviso = [
        'const { data } = await db.from("recebimento_integracoes").select("conta_id, mp_access_token").eq("conta_id", c);',
        'const { data: d2 } = await db.from("recebimento_integracoes").select("conta_id").not("mp_access_token", "is", null);',
        'const { data: d3 } = await db.from("recebimento_integracoes").select("conta_id").or("mp_refresh_token.is.null,status.eq.erro");',
        "type Linha = { mp_refresh_token: string | null; verificador?: string };",
        "// o verificador e o mp_access_token nunca saem daqui (comentário: não conta)",
      ].join("\n");
      expect(achadosDosTokens("supabase-principal/functions/mp-webhook-aluno/conta.ts", aviso)).toEqual([
        "supabase-principal/functions/mp-webhook-aluno/conta.ts:1 — mp_access_token fora dos lugares do plano",
      ]);
      const pagamentos = [
        'if (acao === "prof_mp_conectar") {',
        "  const verificador = novoSegredoUrl(48);",
        '  await db.from("mp_conexoes").insert({ verificador: await cifrar(verificador, ad, chaveMp) });',
        "}",
        'if (acao === "prof_recebimento") {',
        '  await db.from("recebimento_integracoes").update({ mp_refresh_token: null }).eq("conta_id", id);',
        "}",
      ].join("\n");
      expect(achadosDosTokens("supabase-principal/functions/pagamentos-aluno/index.ts", pagamentos)).toEqual([
        "supabase-principal/functions/pagamentos-aluno/index.ts:6 — mp_refresh_token fora dos lugares do plano",
      ]);
      const dono = [
        "return json({ ok: true, token_access: con.token_access }, 200, origin);",
        'falhar("mp_oauth", 502, { verificador });',
        "return json({ ok: true, url, expira_em: ate }, 200, origin);",
        "const corpo = await res.json(); log.erro({ codigo: \"x\" });",
      ].join("\n");
      expect(achadosDosTokens("supabase-principal/functions/_shared/mp-conta.ts", dono)).toEqual([
        "supabase-principal/functions/_shared/mp-conta.ts:1 — token_access numa resposta (json)",
        "supabase-principal/functions/_shared/mp-conta.ts:1 — token_access numa resposta (json)",
        "supabase-principal/functions/_shared/mp-conta.ts:2 — verificador numa resposta (falhar)",
      ]);
    });
  });

  describe("3. o log das funções do MP da conta sem token, code, state, verifier nem chave pública", () => {
    it("nenhuma chamada de log leva esses campos (nem como valor, nem por uma variável)", () => {
      expect(DO_MP_DA_CONTA).toEqual(
        expect.arrayContaining([
          "supabase-principal/functions/_shared/mp-conta.ts",
          "supabase-principal/functions/mp-conectar-retorno/index.ts",
          "supabase-principal/functions/mp-contas-renovar/index.ts",
          "supabase-principal/functions/pagamentos-aluno/index.ts",
          "supabase-principal/functions/mp-webhook-aluno/conta.ts",
        ]),
      );
      expect(DO_MP_DA_CONTA.flatMap((r) => achadosNoLog(r, ler(r)))).toEqual([]);
    });
    it("a guarda enxerga as chamadas de log desses arquivos", () => {
      const logs = DO_MP_DA_CONTA.reduce((n, r) => n + chamadas(lerFonte(ler(r)), RE_LOG).length, 0);
      expect(logs).toBeGreaterThan(50); // 96 em 12/10 — só prova que a regra não lê um conjunto vazio
    });
    it("controle: acusa token, code, state, verificador e public_key (campo, valor, membro, aspas, variável); o código do evento não conta", () => {
      const inventado = [
        'log.info({ codigo: "mp_conectado", schema, acao, ref: conta.id, resultado: recusa.codigo, pg: e.code });',
        'log.aviso({ codigo: "x", token });',
        'ctx.log.erro({ codigo: "x", schema: ctx.schema, ref: estado });',
        'log.info({ codigo: "x", msg: `fim ${cred.token}` });',
        'log.excecao(e, { codigo: "x", "public_key": t.publicKey });',
        'const campos = { codigo: "x", code: codigo };',
        "d.log.aviso(campos);",
        "log.info(semObjeto);",
        'log.info({ codigo: "x", ref: chave.id, externo: { mp_erro: codigoDoOauth(r.body) } });',
        'log.info({ codigo: "x", state: url.searchParams.get("state") });',
        'log.aviso({ codigo: "x", ref: con.verificador });',
      ].join("\n");
      expect(achadosNoLog("supabase-principal/functions/mp-conectar-retorno/index.ts", inventado)).toEqual([
        "supabase-principal/functions/mp-conectar-retorno/index.ts:2 — token no log",
        "supabase-principal/functions/mp-conectar-retorno/index.ts:3 — estado no log",
        "supabase-principal/functions/mp-conectar-retorno/index.ts:4 — .token no log",
        'supabase-principal/functions/mp-conectar-retorno/index.ts:5 — "public_key" no log',
        "supabase-principal/functions/mp-conectar-retorno/index.ts:5 — .publicKey no log",
        "supabase-principal/functions/mp-conectar-retorno/index.ts:6 — code no log",
        'supabase-principal/functions/mp-conectar-retorno/index.ts:8 — o log leva "semObjeto" e a guarda não acha o objeto dela no arquivo',
        "supabase-principal/functions/mp-conectar-retorno/index.ts:10 — state no log",
        "supabase-principal/functions/mp-conectar-retorno/index.ts:11 — .verificador no log",
      ]);
    });
  });

  describe("4. as telas do MP sem o cliente do banco (jeito 2)", () => {
    it.each(TELAS_DO_MP)("%s: sem principal.from( (nem .rpc / .storage)", (r) => {
      expect(achadosNaTela(r, ler(r))).toEqual([]);
    });
    it("controle: acusa principal.from( na tela; o comentário não conta", () => {
      const tela = [
        'const { data } = await principal.from("cobrancas").select("id");',
        "// principal.from( aqui não (comentário: não conta)",
        'await principal.rpc("recebimento_mp_confirmar", { p_conexao: id });',
      ].join("\n");
      expect(achadosNaTela("src/inventada.tsx", tela)).toEqual(["src/inventada.tsx:1 — principal.from na tela", "src/inventada.tsx:3 — principal.rpc na tela"]);
    });
  });

  describe("5. a regra da coluna nova (revisão C2): mp_collector_id só pelos ajudantes", () => {
    it(`fora do _shared/mp-conta.ts, toda linha com mp_collector_id leva "${MARCA_W2}" (no financeiro-mp.ts, só o COLUNAS_COBRANCA_W2 e os tipos)`, () => {
      expect(DAS_FUNCOES.flatMap((r) => achadosDaColunaNova(r, ler(r)))).toEqual([]);
    });
    it("a guarda enxerga: a coluna está, com a marca, nas funções que o plano lista", () => {
      const marcadas = DAS_FUNCOES.filter((r) => r !== DONO_DA_COLUNA).flatMap((r) =>
        ler(r).split("\n").filter((l) => l.includes(MARCA_W2) && /\bmp_collector_id\b/.test(l)).map(() => r),
      );
      expect([...new Set(marcadas)]).toEqual(
        expect.arrayContaining([
          "supabase-principal/functions/_shared/app-sem-profissional.ts",
          "supabase-principal/functions/master-contas/recebimento.ts",
          "supabase-principal/functions/mp-webhook-aluno/conta.ts",
          "supabase-principal/functions/pagamentos-aluno/index.ts",
          "supabase-principal/functions/pagamentos-aluno/mp-credencial.ts",
        ]),
      );
      expect(marcadas.length).toBeGreaterThanOrEqual(10);
    });
    it('controle: a linha inventada select("id, mp_collector_id") sem a marca é acusada; com a marca, em tipo ou em comentário, não', () => {
      const inventado = [
        'const { data } = await db.from("aluno_assinaturas").select("id, mp_collector_id");',
        `const { data: d2 } = await db.from("aluno_assinaturas").select("id, mp_collector_id"); ${MARCA_W2}`,
        "type Assinatura = { mp_collector_id?: number | string | null; conta: { mp_collector_id: number | null } };",
        "// a mp_collector_id só depois do schemaTemW2 (comentário: não conta)",
        "const linha = { paciente_id: id, mp_collector_id: null };",
      ].join("\n");
      expect(achadosDaColunaNova("supabase-principal/functions/pagamentos-aluno/index.ts", inventado)).toEqual([
        `supabase-principal/functions/pagamentos-aluno/index.ts:1 — mp_collector_id sem o comentário "${MARCA_W2}"`,
        `supabase-principal/functions/pagamentos-aluno/index.ts:5 — mp_collector_id sem o comentário "${MARCA_W2}"`,
      ]);
      // no financeiro-mp.ts nem com a marca: só o COLUNAS_COBRANCA_W2 e os tipos
      expect(achadosDaColunaNova(SO_COLUNAS_E_TIPOS, `export const COLUNAS_COBRANCA_W2 = COLUNAS_COBRANCA_IP + ", mp_collector_id";\n${inventado}`))
        .toEqual([2, 3, 6].map((k) => `${SO_COLUNAS_E_TIPOS}:${k} — mp_collector_id aqui só no COLUNAS_COBRANCA_W2 e nos tipos (quem chama monta o colunasW2 pelo comCollector)`));
      // o dono da regra é livre (tudo lá passa pelo schemaTemW2)
      expect(achadosDaColunaNova(DONO_DA_COLUNA, inventado)).toEqual([]);
    });
  });
});
