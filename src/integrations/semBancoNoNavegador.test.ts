// Physiq hml-21a (H-43 · jeito 2, etapa 3 — spec hml-21 §2.9) — a guarda do ESTADO FINAL da etapa 3: o navegador não fala com o banco.
// Varre o src/ INTEIRO (sem os testes, sem o src/test/ e sem os comentários — o semComentarios do scripts/ci/checar-funcoes.mjs) e acha
// TODA forma de acesso direto aos 2 projetos:
//   · tabela   `.from("t")` (com a 1ª operação da cadeia: select/insert/update/upsert/delete), o `(x.from as …)("t")` e o invólucro local
//              `tabela("t")` (o `const tabela = (n) => (cliente.from as any)(n)` de 3 arquivos);
//   · rpc      `.rpc("x")`, o invólucro local `rpc("x")` e o `.rpc(nome)` com o nome numa variável (o QUALQUER_RPC da hml-20d → "rpc:?");
//   · storage  `.storage.from(b).<op>` e a op num objeto guardado (o bucket numa variável) — MENOS o uploadToSignedUrl (o PUT no link que o
//              SERVIDOR assinou) e o getPublicUrl (só monta a URL, sem rede);
//   · channel  `.channel(` (Realtime — hoje, nenhum);
//   · auth     `.auth.<método>(` FORA dos arquivos do login (o login é a exceção do jeito 2: LOGIN abaixo) e do getSession que só lê a sessão
//              guardada antes de chamar uma função (SESSAO_ANTES_DA_FUNCAO).
// Duas listas: FICA (com o motivo — a fila do PowerSync, o desvio 23, os 2 links públicos e, desde a hml-21e, as 6 leituras do Treino do
// desvio 24) e BASE (arquivo → os achados de hoje que ainda não saíram: SÓ DIMINUI — cada sub-worktree da hml-21 tirou os da área dela; a
// 21e terminou com BASE = {}: a guarda é a lista do que fica — a etapa 4 revoga o resto, spec §2.11 item 7). A regra:
// achados ⊆ BASE ∪ FICA, contados por (arquivo, forma, alvo) — nada novo em lugar nenhum; um arquivo novo com qualquer achado falha. Quando
// um achado da BASE some (alguém tirou a chamada), o teste AVISA no log (sem falhar): quem tirou tira a linha (na sub-W da área).
// Com a W-A da LINUX 3: os arquivos novos dela não podem ter achado (a guarda dela, src/aluno-dia/semBancoDireto.test.ts, pede o mesmo) e
// uma remoção dela num arquivo da BASE não quebra o ⊆ — a W-A não edita esta guarda (só a hml-21 edita).
// Gerar a BASE de novo (depois de tirar os achados de uma área): GERAR_BASE=1 npx vitest run src/integrations/semBancoNoNavegador.test.ts
// (imprime o JSON no log; cole no lugar da BASE — só pode ter diminuído).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
// o mesmo leitor sem comentários da guarda de CI (scripts/ci/checar-funcoes.mjs)
import { semComentarios } from "../../scripts/ci/checar-funcoes.mjs";

const RAIZ = resolve(__dirname, "../..");

export type Forma = "tabela" | "rpc" | "storage" | "channel" | "auth";
export interface Achado {
  linha: number;
  forma: Forma;
  /** a tabela (+ a 1ª operação), a RPC, a operação do Storage, o canal ou o método do Auth; "?" quando o nome vem numa variável */
  alvo: string;
}

/** Os arquivos do LOGIN (a exceção do jeito 2): todo `.auth.` neles é o login e a sessão — fica no navegador. */
export const LOGIN = [
  "src/nucleo/sessao.tsx", "src/nucleo/senha.ts", "src/nucleo/trocaToken.ts", "src/nucleo/entrarSenha.ts", "src/lib/capacitorAuth.ts",
  "src/hooks/useAuth.tsx", "src/hooks/useAppLifecycle.ts", "src/lib/powersync/connector.ts", "src/lib/saasApi.ts",
  "src/master/doisFatores/mfa.ts", // hml-22 (H-22): o 2FA do master (TOTP do Auth) — login, só no site
] as const;
/** O getSession que só LÊ a sessão guardada no aparelho para levar o token a uma função (o fetch direto dela) — listados, só o getSession. */
export const SESSAO_ANTES_DA_FUNCAO = [
  "src/ui/premium/useAvisos.ts", "src/treino/editor/api.ts", "src/painel/aluno/avaliacao/fontes.ts", "src/painel/aluno/avaliacao/avaliacaoApi.ts",
  "src/painel/configuracoes/excluirConta/api.ts", "src/painel/configuracoes/excluirConta/zip.ts",
  "src/acessos/api.ts", // W-A P2: o token do principal para a treino-acessos (o fetch do Treino), com o ok da hml-21
] as const;

const OPS_DE_TABELA = new Set(["select", "insert", "update", "upsert", "delete"]);
const OPS_QUE_FICAM = new Set(["uploadToSignedUrl", "getPublicUrl"]);
const linhaDe = (texto: string, pos: number) => texto.slice(0, pos).split("\n").length;
const NOME_ESCRITO = /^\s*["'`]([A-Za-z0-9_-]+)["'`]/;

/** Do "(" (em `abre`) até o ")" que fecha; devolve a posição logo depois. */
function depoisDoFecho(texto: string, abre: number): number {
  let nivel = 0;
  for (let i = abre; i < texto.length; i++) {
    if (texto[i] === "(") nivel++;
    else if (texto[i] === ")" && --nivel === 0) return i + 1;
  }
  return texto.length;
}
/** A partir de `de` (dentro de um parêntese já aberto), a posição do ")" que fecha esse parêntese. */
function fechoDoGrupo(texto: string, de: number): number {
  let nivel = 0;
  for (let i = de; i < texto.length; i++) {
    if (texto[i] === "(") nivel++;
    else if (texto[i] === ")") {
      if (nivel === 0) return i;
      nivel--;
    }
  }
  return texto.length;
}
/** A 1ª operação encadeada logo depois de `pos` (o `.select(`, `.update(`…), ou null. */
function operacaoDepois(texto: string, pos: number): string | null {
  return /^\s*\.\s*([A-Za-z]+)\s*[(<]/.exec(texto.slice(pos, pos + 300))?.[1] ?? null;
}
const comOp = (nome: string, op: string | null) => (op && OPS_DE_TABELA.has(op) ? `${nome}.${op}` : nome);

/** Os acessos diretos ao banco de um código-fonte (sem comentários). `arquivo` decide o que é login. */
export function achadosNoNavegador(fonte: string, arquivo = ""): Achado[] {
  const texto: string = semComentarios(fonte);
  const achados: Achado[] = [];
  const add = (pos: number, forma: Forma, alvo: string) => achados.push({ linha: linhaDe(texto, pos), forma, alvo });

  // ── tabela: X.from("t") — não o Storage, nem o Array.from / Buffer.from / Object.from…
  for (const m of texto.matchAll(/(?<!(?:Array|Buffer|Object|Set|Map|Iterator|storage)\s*)\.from\s*\(/g)) {
    const abre = m.index! + m[0].length - 1;
    const nome = NOME_ESCRITO.exec(texto.slice(abre + 1))?.[1] ?? "?";
    add(m.index!, "tabela", comOp(nome, operacaoDepois(texto, depoisDoFecho(texto, abre))));
  }
  // ── tabela: (X.from as …)("t") — o cast que tira o tipo (o nome vem no 2º parêntese)
  for (const m of texto.matchAll(/\.from\s+as\b/g)) {
    const fecho = fechoDoGrupo(texto, m.index! + m[0].length);
    const resto = texto.slice(fecho + 1);
    const chamada = /^\s*\(/.exec(resto);
    if (!chamada) continue;
    const abre = fecho + 1 + chamada[0].length - 1;
    const nome = NOME_ESCRITO.exec(texto.slice(abre + 1))?.[1] ?? "?";
    add(m.index!, "tabela", comOp(nome, operacaoDepois(texto, depoisDoFecho(texto, abre))));
  }
  // ── tabela: o invólucro local tabela("t") / tabela(nome) — só onde ele é o `.from` disfarçado (const tabela = (n) => (cliente.from as …)(n))
  if (/const\s+tabela\s*=\s*\([^)]*\)\s*=>\s*\(\s*[\w$.]+\.from\s+as\b/.test(texto)) {
    for (const m of texto.matchAll(/(?<![\w$.])tabela\s*(?:<[^()]*?>)?\s*\(/g)) {
      const abre = m.index! + m[0].length - 1;
      const nome = /^\s*["'`]([a-z0-9_]+)["'`]/.exec(texto.slice(abre + 1))?.[1] ?? "?";
      add(m.index!, "tabela", comOp(nome, operacaoDepois(texto, depoisDoFecho(texto, abre))));
    }
  }
  // ── rpc: .rpc("x") / .rpc(nome) e o invólucro local rpc("x")
  for (const m of texto.matchAll(/\.rpc\s*(?:<[^()]*?>)?\s*\(/g)) {
    add(m.index!, "rpc", NOME_ESCRITO.exec(texto.slice(m.index! + m[0].length))?.[1] ?? "?");
  }
  for (const m of texto.matchAll(/(?<![\w$.])rpc\s*(?:<[^()]*?>)?\s*\(\s*["'`]([a-z0-9_]+)["'`]/g)) add(m.index!, "rpc", m[1]);
  // ── storage: .storage.from(b).<op> (menos o PUT no link assinado e o getPublicUrl); o bucket guardado numa variável
  const guardados = new Set<string>();
  /** a posição do "." de cada operação do Storage já contada (para não contar 2 vezes a mesma) */
  const pontos = new Set<number>();
  for (const m of texto.matchAll(/\.storage\s*\.from\s*\(/g)) {
    const fim = depoisDoFecho(texto, m.index! + m[0].length - 1);
    const op = /^\s*(\.)\s*([A-Za-z]+)\s*\(/.exec(texto.slice(fim, fim + 300));
    if (op) {
      pontos.add(fim + op[0].indexOf("."));
      if (!OPS_QUE_FICAM.has(op[2])) add(m.index!, "storage", op[2]);
      continue;
    }
    const v = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;=]*$/.exec(texto.slice(Math.max(0, m.index! - 200), m.index!));
    if (v) guardados.add(v[1]);
  }
  for (const nome of guardados) {
    for (const m of texto.matchAll(new RegExp(`(?<![\\w$.])${nome.replace(/\$/g, "\\$")}\\s*(\\.)\\s*([A-Za-z]+)\\s*\\(`, "g"))) {
      const ponto = m.index! + m[0].indexOf(".");
      pontos.add(ponto);
      if (!OPS_QUE_FICAM.has(m[2])) add(m.index!, "storage", m[2]);
    }
  }
  // o link assinado num objeto recebido (o bucket num parâmetro): as operações que só existem no Storage
  for (const m of texto.matchAll(/\.(createSignedUrls?|createSignedUploadUrl)\s*\(/g)) if (!pontos.has(m.index!)) add(m.index!, "storage", m[1]);
  // ── channel: o Realtime
  for (const m of texto.matchAll(/\.channel\s*\(/g)) add(m.index!, "channel", NOME_ESCRITO.exec(texto.slice(m.index! + m[0].length))?.[1] ?? "?");
  // ── auth: fora do login
  if (!(LOGIN as readonly string[]).includes(arquivo)) {
    const soSessao = (SESSAO_ANTES_DA_FUNCAO as readonly string[]).includes(arquivo);
    for (const m of texto.matchAll(/\.auth\s*\.\s*(?:(?:mfa|admin)\s*\.\s*)?([A-Za-z]+)\s*\(/g)) {
      if (!(soSessao && m[1] === "getSession")) add(m.index!, "auth", m[1]);
    }
  }
  return achados.sort((a, b) => a.linha - b.linha);
}

/** Os achados contados por "forma:alvo" (a chave da BASE e do FICA). */
export function contar(achados: readonly Achado[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const a of achados) c[`${a.forma}:${a.alvo}`] = (c[`${a.forma}:${a.alvo}`] ?? 0) + 1;
  return c;
}

/** O que passou do permitido (a chave nova ou a contagem acima da do arquivo) — "arquivo › forma:alvo (agora × permitido)". */
export function excessos(arquivo: string, agora: Record<string, number>, permitido: Readonly<Record<string, number>> = {}): string[] {
  return Object.entries(agora)
    .filter(([k, n]) => n > (permitido[k] ?? 0))
    .map(([k, n]) => `${arquivo} › ${k} (${n} × ${permitido[k] ?? 0})`);
}

/** O porquê do desvio 24 (docs/desvios.md): as leituras do Treino que o gate da 21d deixou no navegador (decisão 17 da spec). */
const GATE_21D =
  "o gate da 21d reprovou a leitura pela função treinos (Meus treinos p50 2,65 s pela treinos × 2,04 s direto; a função ociosa 4,6–12,6 s) — " +
  "sai quando o banco do Treino sair da máquina pequena (H-80) ou na etapa 4";

/**
 * FICA (spec §2.9 — o que fica no navegador no fim da etapa 3; a etapa 4 revoga o que não está aqui, §2.11 itens 2 e 7): o arquivo, o
 * motivo e o que ele faz hoje (contado: nada novo nem nele). Os 4 da spec (a fila do PowerSync, o desvio 23 e os 2 links públicos) + os 6
 * das leituras do Treino que o gate da 21d deixou no navegador (hml-21e, desvio 24 — a contagem de 14/10/2026, a mesma da BASE da 21c).
 */
export const FICA: Readonly<Record<string, { motivo: string; achados: Readonly<Record<string, number>> }>> = {
  "src/lib/powersync/connector.ts": {
    motivo: "desvio 3: a fila do PowerSync grava as 15 tabelas do aparelho no REST do Treino (o treino offline) — RLS das 15 provado (spec §2.8)",
    achados: { "tabela:?": 1 },
  },
  "src/evolucao/fontes.ts": {
    motivo: "desvio 23: a parte do TREINO da Evolução do aluno (3 leituras do REST do Treino + a assinatura do `registros`) — a admin-avaliacoes segue lenta (H-105)",
    achados: { "storage:createSignedUrls": 1, "tabela:physiq_avaliacoes.select": 1, "tabela:physiq_profiles.select": 1, "tabela:physiq_registros_fotos.select": 1 },
  },
  "src/painel/dietas/publico.ts": {
    motivo: "desvio 21: o link público /d/:codigo (sem login, como anônimo; o limite por IP mora no SQL) — sai na etapa 4",
    achados: { "rpc:diario_enviar": 1, "rpc:diario_link": 1, "rpc:diario_listar": 1, "storage:remove": 1, "storage:upload": 1 },
  },
  "src/painel/preconsulta/publico.ts": {
    motivo: "desvio 21: o link público /f/:slug (sem login, como anônimo; o limite por IP mora no SQL) — sai na etapa 4",
    achados: { "rpc:preconsulta_formulario": 1, "rpc:preconsulta_responder": 2 },
  },
  // hml-21e (decisão B do contrato 21e): as 6 leituras do Treino saem da BASE para cá — desvio 24
  "src/app-aluno/sozinho/api.ts": {
    motivo: `desvio 24: os Treinos prontos do aluno sem profissional leem o Treino direto (physiq_treinos_prontos) — ${GATE_21D}`,
    achados: { "tabela:physiq_treinos_prontos.select": 1 },
  },
  "src/master/app/treinosProntos.ts": {
    motivo: `desvio 24: os Treinos prontos do Master leem o Treino direto (physiq_treinos_prontos com os grupos e os exercícios embutidos; tb_exercicios, os globais) — ${GATE_21D}`,
    achados: { "tabela:physiq_treinos_prontos.select": 1, "tabela:tb_exercicios.select": 1 },
  },
  "src/pages/master/BibliotecaPage.tsx": {
    motivo: `desvio 24: a Biblioteca global do Master lê o Treino direto (a RPC exercicios_da_lista, grupos_musculares, tb_exercicios — a contagem por grupo — e o invólucro tabela()) — ${GATE_21D}`,
    achados: { "rpc:exercicios_da_lista": 1, "tabela:?": 1, "tabela:grupos_musculares.select": 1, "tabela:tb_exercicios.select": 1 },
  },
  "src/painel/busca/Treinos.tsx": {
    motivo: `desvio 24: a Busca (Ctrl K) lê os treinos direto do Treino (tb_grupos_treino) — ${GATE_21D}`,
    achados: { "tabela:tb_grupos_treino.select": 1 },
  },
  "src/painel/treinos/api.ts": {
    motivo: `desvio 24: o Painel › Treinos (Meus treinos, Detalhe, Biblioteca, Folha) e a aba Treinos dos Modelos leem o Treino direto (a RPC modelos_da_lista, tb_grupos_exercicios, tb_pastas_treino_grupos ×2, tb_pastas_treino, grupos_musculares, tb_grupos_treino ×2, tb_exercicios ×2 e o invólucro tabela()) — ${GATE_21D}`,
    achados: { "rpc:modelos_da_lista": 1, "tabela:?": 1, "tabela:grupos_musculares.select": 1, "tabela:tb_exercicios.select": 2, "tabela:tb_grupos_exercicios.select": 1, "tabela:tb_grupos_treino.select": 2, "tabela:tb_pastas_treino.select": 1, "tabela:tb_pastas_treino_grupos.select": 2 },
  },
  "src/treino/editor/api.ts": {
    motivo: `desvio 24: o editor do treino (Aluno › Treino) lê direto a RPC aluno_treino do PRINCIPAL e a exercicios_da_lista do Treino — ${GATE_21D}`,
    achados: { "rpc:aluno_treino": 1, "rpc:exercicios_da_lista": 1 },
  },
};
/** As 6 leituras do Treino do desvio 24 (estavam na BASE até a 21c; no FICA desde a 21e). */
const DESVIO_24 = [
  "src/app-aluno/sozinho/api.ts", "src/master/app/treinosProntos.ts", "src/pages/master/BibliotecaPage.tsx", "src/painel/busca/Treinos.tsx",
  "src/painel/treinos/api.ts", "src/treino/editor/api.ts",
] as const;

/**
 * BASE (hml-21a): os achados de hoje que ainda não saíram — DEPOIS da 21a (a casca e o app do aluno já fora). SÓ DIMINUI: cada sub-W
 * tira os da área dela (21b: a Agenda, os Alunos, o Dashboard; 21d: o Treino; 21c: o Resumo, as Configurações, a Mensagens, a Lixeira, os
 * Modelos); a 21e termina com BASE = {}. Gerada em 12/10/2026 do código da 21a: 22 arquivos, 136 achados.
 * hml-21b (13/10/2026, GERAR_BASE=1 no código da 21b — só diminuiu): saíram a Agenda (src/painel/agenda/dados.ts, os 28), a Agenda do aluno
 * (src/app-aluno/perfil/agenda/api.ts, 8), os Alunos (src/painel/alunos/api.ts, 7, e novosPorMes.ts, 1) e a leitura da Equipe (o
 * equipe_da_conta; as 3 gravações e o invólucro da Equipe ficam para a 21c) → 18 arquivos, 91 achados.
 * hml-21c (13/10/2026, GERAR_BASE=1 no código da 21c — só diminuiu): saíram os 12 arquivos da 21c (o login do aluno, os dados/ajustes/link/
 * faixa do aluno, a pré-checagem do e-mail/CPF, o responsável, a reserva do envio, o Perfil e a Conta das Configurações, a Equipe, o ZIP, a
 * Mensagens, a Lixeira e os ★ dos Modelos — 70 achados) → 6 arquivos, 21 achados: SÓ as leituras do Treino que o gate da 21d deixou no
 * navegador (o desvio novo — a 21e decide).
 * hml-21e (14/10/2026, decisão 15 da spec — GERAR_BASE=1 imprime "BASE GERADA {}"): a BASE terminou VAZIA. A história: 21a 22 arquivos/136
 * achados → 21b 18/91 → 21d 18/60 (as gravações do Treino; as leituras voltaram com o gate) → 21c 6/21 → 21e 0 (os 6 das leituras do Treino
 * no FICA, desvio 24, com a mesma contagem). Daqui em diante, um achado fora do FICA é novo — falha.
 */
export const BASE: Readonly<Record<string, Readonly<Record<string, number>>>> = {};

function fontesDoSrc(): string[] {
  const saida: string[] = [];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const cam = join(dir, nome);
      if (statSync(cam).isDirectory()) {
        if (relative(RAIZ, cam) !== "src/test") andar(cam);
      } else if (/\.(ts|tsx)$/.test(nome) && !/\.(test|spec)\.(ts|tsx)$/.test(nome) && !nome.endsWith(".d.ts")) saida.push(cam);
    }
  };
  andar(resolve(RAIZ, "src"));
  return saida.sort();
}

describe("hml-21a — o detector acha cada forma de acesso direto (controle positivo)", () => {
  const alvos = (fonte: string, arquivo = "src/x.ts") => achadosNoNavegador(fonte, arquivo).map((a) => `${a.linha}: ${a.forma}:${a.alvo}`);

  it("tabela: .from(\"t\") com a 1ª operação (em 1 ou várias linhas, com o `as never`), o cast (x.from as any)(\"t\") e o invólucro tabela(\"t\")", () => {
    expect(alvos('const { data, error } = await principal.from("avisos").select("id").order("criado_em");')).toEqual(["1: tabela:avisos.select"]);
    expect(alvos('await principal\n  .from("profiles" as never)\n  .update({ nome })\n  .eq("id", uid);')).toEqual(["2: tabela:profiles.update"]);
    expect(alvos("await db.from(TABELA).delete().eq(\"id\", id);")).toEqual(["1: tabela:?.delete"]);
    expect(alvos('await (supabase.from as any)("physiq_professores").update(campos).eq("id", id);')).toEqual(["1: tabela:physiq_professores.update"]);
    expect(alvos('const { data } = await (supabase.from as unknown as (t: string) => ReturnType<typeof supabase.from>)("tb_grupos_treino").select("id");'))
      .toEqual(["1: tabela:tb_grupos_treino.select"]);
    expect(alvos('const tabela = (nome: string) => (supabase.from as any)(nome);\nawait tabela("tb_exercicios").insert(x);\nawait tabela(nome).update(v);'))
      .toEqual(["1: tabela:?", "2: tabela:tb_exercicios.insert", "3: tabela:?.update"]);
    // só onde o invólucro é o .from disfarçado: uma função tabela() de outra coisa não conta
    expect(alvos('function tabela(linhas) { return linhas; }\nconst t = tabela("x");')).toEqual([]);
  });

  it("rpc: .rpc(\"x\"), .rpc<T>(\"x\"), o nome numa variável (rpc:?) e o invólucro local rpc(\"x\") — a definição do invólucro conta como rpc:?", () => {
    expect(alvos('const { data, error } = await principal.rpc("minha_agenda" as never, { p_desde } as never);')).toEqual(["1: rpc:minha_agenda"]);
    expect(alvos('await supabase.rpc<Json>("exames_do_aluno", args);')).toEqual(["1: rpc:exames_do_aluno"]);
    expect(alvos("const { data, error } = await principal.rpc(nome as never, args as never);")).toEqual(["1: rpc:?"]);
    expect(alvos('async function rpc<T>(nome: string) { return principal.rpc(nome as never); }\nconst r = await rpc<Perfil>("aluno_perfil", {});'))
      .toEqual(["1: rpc:?", "2: rpc:aluno_perfil"]);
  });

  it("storage: a operação encadeada e a do bucket guardado; o link assinado num objeto recebido; o uploadToSignedUrl e o getPublicUrl FICAM", () => {
    expect(alvos("await principal.storage.from(BUCKET).upload(caminho, arquivo, { upsert: false });")).toEqual(["1: storage:upload"]);
    expect(alvos("const b = supabase.storage.from(BUCKET);\nawait b.remove([c]);\nawait b.list(pasta);")).toEqual(["2: storage:remove", "3: storage:list"]);
    expect(alvos("const { data, error } = await bucket.createSignedUrls(caminhos, 3600);")).toEqual(["1: storage:createSignedUrls"]);
    expect(alvos("await principal.storage.from(p.bucket).uploadToSignedUrl(p.caminho, p.token, arquivo);")).toEqual([]);
    expect(alvos("return principal.storage.from(B).getPublicUrl(caminho).data.publicUrl;")).toEqual([]);
  });

  it("channel (o Realtime) e o .auth. fora do login; no login e no getSession antes de uma função, não", () => {
    expect(alvos('const canal = principal.channel("avisos").on("postgres_changes", {}, cb).subscribe();')).toEqual(["1: channel:avisos"]);
    expect(alvos("await principal.auth.updateUser({ password });", "src/painel/qualquer.ts")).toEqual(["1: auth:updateUser"]);
    expect(alvos("const { data } = await principal.auth.getSession();", "src/painel/qualquer.ts")).toEqual(["1: auth:getSession"]);
    expect(alvos("await principal.auth.signOut();\nawait principal.auth.updateUser({ password });", "src/nucleo/sessao.tsx")).toEqual([]);
    expect(alvos("const { data } = await principal.auth.getSession();", "src/ui/premium/useAvisos.ts")).toEqual([]);
    expect(alvos("await principal.auth.signOut();", "src/ui/premium/useAvisos.ts")).toEqual(["1: auth:signOut"]);
  });

  // (como as outras guardas — semLeituraDireta, checar-funcoes —, o detector lê o código SEM os comentários, não sem as strings: um texto
  // com ".from(" contaria; no src/ não há nenhum — a BASE sai do código de verdade e a 21e termina com ela vazia)
  it("o que NÃO é acesso direto: a função (invoke/lerConta/acaoConta), Array.from/Buffer.from, Object.from, o comentário", () => {
    const fonte = [
      'const { data, error } = await principal.functions.invoke("conta", { body: { acao: "ler", itens } });',
      'const r = await lerConta("avisos"); await acaoConta("perfil_nome", { nome });',
      "const ids = Array.from(new Set(lista)); const b = Buffer.from(x); const u = Uint8Array.from(y);",
      '// antes: await principal.from("avisos").select("*");',
      "/* await supabase.storage.from(B).createSignedUrls(c, 60); */",
    ].join("\n");
    expect(alvos(fonte)).toEqual([]);
  });

  it("a casca e o app do aluno de ANTES (53f2583) seriam pegos: o sino (lê e marca), a sessão, a foto, o push, o aceite", () => {
    const antes = [
      'const { data, error } = await cliente.from("avisos").select("id,tipo,titulo,link,lido_em,criado_em").order("criado_em", { ascending: false }).limit(30);',
      'const { error } = await cliente.from("avisos").update({ lido_em: new Date().toISOString() }).in("id", ids);',
      'const { data, error } = await principal.rpc("minha_situacao" as never);',
      'const { error } = await principal.storage.from(BUCKET_FOTOS_PERFIL).upload(caminho, arquivo, { upsert: false });',
      'const { data, error } = await principal.rpc("push_registrar" as never, { p_token: token } as never);',
      'const { data, error } = await principal.rpc("aceitar_no_acesso" as never, args as never);',
    ].join("\n");
    expect(alvos(antes)).toEqual([
      "1: tabela:avisos.select", "2: tabela:avisos.update", "3: rpc:minha_situacao", "4: storage:upload", "5: rpc:push_registrar", "6: rpc:aceitar_no_acesso",
    ]);
  });
});

describe("hml-21a — o src/ inteiro ⊆ BASE ∪ FICA (nada novo em lugar nenhum; a BASE só diminui)", () => {
  const arquivos = fontesDoSrc();
  const agora = new Map(arquivos.map((cam) => [relative(RAIZ, cam), contar(achadosNoNavegador(readFileSync(cam, "utf-8"), relative(RAIZ, cam)))]));

  it("a varredura pega o src/ inteiro (o detector não passa por não achar arquivo)", () => {
    expect(arquivos.length).toBeGreaterThan(800);
    expect(agora.has("src/nucleo/sessao.tsx") && agora.has("src/lib/powersync/connector.ts")).toBe(true);
    expect([...agora.keys()].some((a) => a.startsWith("src/test/"))).toBe(false);
  });

  it("cada arquivo: os achados de agora ⊆ os da BASE ou do FICA (um achado novo, num arquivo novo ou não, falha)", () => {
    if (process.env.GERAR_BASE === "1") {
      const base: Record<string, Record<string, number>> = {};
      for (const [arquivo, c] of agora) if (Object.keys(c).length && !FICA[arquivo]) base[arquivo] = c;
      // o modo de gerar a BASE imprime o JSON para colar
      console.log(`BASE GERADA ${JSON.stringify(base)}`);
    }
    const fora = [...agora].flatMap(([arquivo, c]) => excessos(arquivo, c, FICA[arquivo]?.achados ?? BASE[arquivo]));
    expect(fora).toEqual([]);
  });

  it("um arquivo NOVO com qualquer acesso direto falha (o que a W-A criar, inclusive); tirar uma chamada de um arquivo da BASE não falha", () => {
    const novo = contar(achadosNoNavegador('await principal.from("acessos").select("id");', "src/acessos/novo.ts"));
    expect(excessos("src/acessos/novo.ts", novo, BASE["src/acessos/novo.ts"])).toEqual(["src/acessos/novo.ts › tabela:acessos.select (1 × 0)"]);
    const [arquivo, permitido] = Object.entries(BASE)[0] ?? ["src/x.ts", { "rpc:x": 2 }];
    const menos = { ...permitido, [Object.keys(permitido)[0]]: 0 };
    expect(excessos(arquivo, menos, permitido)).toEqual([]);
  });

  it("a BASE terminou VAZIA (hml-21e, decisão 15 da spec): nada fica no navegador fora do FICA", () => {
    // hml-21a: 22 arquivos e 136 achados; hml-21b: −4 arquivos e −45 achados (a Agenda, a Agenda do aluno, os Alunos e a leitura da Equipe);
    // hml-21d (F3a, as gravações do Treino): −31 achados (o Painel › Treinos, os treinos prontos e a Biblioteca do master, o espelho do Perfil);
    // hml-21c: −12 arquivos e −39 achados (o Resumo, as Configurações, a Mensagens, a Lixeira e os ★ dos Modelos) → 6 arquivos e 21 achados;
    // hml-21e: −6 arquivos e −21 achados (as leituras do Treino que o gate da 21d deixou no navegador passaram para o FICA — desvio 24) → 0
    expect(Object.keys(BASE)).toEqual([]);
  });

  it("o FICA são EXATAMENTE os 10 (os 4 da spec + as 6 leituras do Treino do desvio 24), cada um com o motivo; nenhum deles na BASE", () => {
    expect(Object.keys(FICA).sort()).toEqual([
      "src/app-aluno/sozinho/api.ts", "src/evolucao/fontes.ts", "src/lib/powersync/connector.ts", "src/master/app/treinosProntos.ts",
      "src/pages/master/BibliotecaPage.tsx", "src/painel/busca/Treinos.tsx", "src/painel/dietas/publico.ts", "src/painel/preconsulta/publico.ts",
      "src/painel/treinos/api.ts", "src/treino/editor/api.ts",
    ]);
    for (const [arquivo, f] of Object.entries(FICA)) {
      expect(f.motivo.length, arquivo).toBeGreaterThan(20);
      expect(BASE[arquivo], arquivo).toBeUndefined();
    }
    // os 6 da hml-21e — e só eles — com o motivo do desvio 24
    expect(Object.keys(FICA).filter((arquivo) => FICA[arquivo].motivo.startsWith("desvio 24: ")).sort()).toEqual([...DESVIO_24]);
  });

  it("a casca e o app do aluno (a 21a) não estão na BASE: 0 acesso direto nas 13 libs que a 21a levou para a função conta", () => {
    const da21a = [
      "src/ui/premium/useAvisos.ts", "src/ui/avisos/AvisoMembroRemovido.tsx", "src/nucleo/sessao.tsx", "src/nucleo/senha.ts", "src/push/aparelho.ts",
      "src/publico/legal/aceite/api.ts", "src/entrada/onboarding/CriarConta.tsx", "src/app-aluno/perfil/pecas/api.ts", "src/app-aluno/perfil/Conta.tsx",
      "src/painel/configuracoes/perfil/foto.ts", "src/integrations/repeticao.ts", "src/lib/fotoProfessor.ts", "src/conta/ler.ts", "src/conta/gravar.ts",
    ];
    for (const arquivo of da21a) {
      expect(BASE[arquivo], arquivo).toBeUndefined();
      expect(agora.get(arquivo), arquivo).toEqual({});
    }
    // o app do aluno sem profissional: só os treinos prontos do Treino seguem direto (desvio 24 — o gate da 21d; no FICA desde a 21e)
    expect(agora.get("src/app-aluno/sozinho/api.ts")).toEqual({ "tabela:physiq_treinos_prontos.select": 1 });
  });

  it("hml-21b: a Agenda, os Alunos e o Dashboard não estão na BASE — 0 acesso direto nas libs que a 21b levou para a função conta", () => {
    const da21b = ["src/painel/agenda/dados.ts", "src/painel/agenda/useAgenda.ts", "src/app-aluno/perfil/agenda/api.ts", "src/painel/alunos/api.ts",
      "src/painel/alunos/novosPorMes.ts"];
    for (const arquivo of da21b) {
      expect(BASE[arquivo], arquivo).toBeUndefined();
      expect(agora.get(arquivo), arquivo).toEqual({});
    }
    // a Equipe: só a leitura (buscarEquipe) saiu na 21b; hml-21c (a regra 11:57 da 21d — o que registrava a peça desta W como pendente vira o
    // estado sem ela): as 3 gravações e o invólucro também saíram (pela função conta)
    expect(agora.get("src/painel/configuracoes/equipe/api.ts")).toEqual({});
  });

  it("hml-21c: o Resumo, as Configurações, a Mensagens, a Lixeira e os Modelos não estão na BASE — 0 acesso direto nas 13 libs da 21c", () => {
    const da21c = [
      "src/painel/aluno/resumo/acesso/api.ts", "src/painel/aluno/dados/api.ts", "src/nucleo/dadoLivre.ts", "src/publico/legal/responsavel/api.ts",
      "src/painel/aluno/envio/api.ts", "src/painel/configuracoes/Perfil.tsx", "src/painel/configuracoes/Conta.tsx", "src/painel/configuracoes/perfil/api.ts",
      "src/painel/configuracoes/equipe/api.ts", "src/painel/configuracoes/excluirConta/api.ts", "src/painel/mensagens/api.ts", "src/ferramentas/lixeira/dados.ts",
      "src/ferramentas/modelos/dados.ts",
    ];
    for (const arquivo of da21c) {
      expect(BASE[arquivo], arquivo).toBeUndefined();
      expect(agora.get(arquivo), arquivo).toEqual({});
    }
    // hml-21e (a regra 11:57 da 21d — o que registrava a peça desta W como pendente vira o estado sem ela): a BASE vazia; as 6 leituras do
    // Treino que o gate da 21d deixou no navegador moram no FICA (desvio 24)
    expect(Object.keys(BASE)).toEqual([]);
    expect(DESVIO_24.filter((arquivo) => FICA[arquivo] !== undefined)).toEqual([...DESVIO_24]);
  });

  it("o aviso (sem falhar): o achado da BASE que sumiu — quem tirou a chamada tira a linha da BASE", () => {
    const sumidos = Object.entries(BASE).flatMap(([arquivo, permitido]) =>
      Object.entries(permitido).filter(([k, n]) => (agora.get(arquivo)?.[k] ?? 0) < n).map(([k, n]) => `${arquivo} › ${k} (${agora.get(arquivo)?.[k] ?? 0} × ${n})`));
    // o aviso da BASE que pode diminuir (não é falha: a W-A, por exemplo, pode tirar uma chamada)
    if (sumidos.length) console.warn(`semBancoNoNavegador: a BASE pode diminuir — ${sumidos.join(" · ")}`);
    expect(Array.isArray(sumidos)).toBe(true);
  });
});
