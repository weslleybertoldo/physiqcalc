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
// Duas listas: FICA (permanente, com o motivo — a fila do PowerSync, o desvio 23 e os 2 links públicos) e BASE (arquivo → os achados de
// hoje que ainda não saíram: SÓ DIMINUI — cada sub-worktree da hml-21 tira os da área dela; a 21e termina com BASE = {}). A regra:
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
] as const;
/** O getSession que só LÊ a sessão guardada no aparelho para levar o token a uma função (o fetch direto dela) — listados, só o getSession. */
export const SESSAO_ANTES_DA_FUNCAO = [
  "src/ui/premium/useAvisos.ts", "src/treino/editor/api.ts", "src/painel/aluno/avaliacao/fontes.ts", "src/painel/aluno/avaliacao/avaliacaoApi.ts",
  "src/painel/configuracoes/excluirConta/api.ts", "src/painel/configuracoes/excluirConta/zip.ts",
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

/**
 * FICA (permanente — spec §2.9; a 21e termina só com estes): o arquivo, o motivo e o que ele faz hoje (contado: nada novo nem nele).
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
};

/**
 * BASE (hml-21a): os achados de hoje que ainda não saíram — DEPOIS da 21a (a casca e o app do aluno já fora). SÓ DIMINUI: cada sub-W
 * tira os da área dela (21b: a Agenda, os Alunos, o Dashboard; 21d: o Treino; 21c: o Resumo, as Configurações, a Mensagens, a Lixeira, os
 * Modelos); a 21e termina com BASE = {}. Gerada em 12/10/2026 do código da 21a: 22 arquivos, 136 achados.
 */
export const BASE: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  "src/app-aluno/perfil/agenda/api.ts": { "rpc:?": 1, "rpc:aluno_agenda_confirmar": 1, "rpc:aluno_agenda_desistir": 1, "rpc:aluno_agenda_horarios": 2, "rpc:aluno_agenda_marcar": 1, "rpc:aluno_agenda_reagendar": 1, "rpc:minhas_regras_agenda": 1 },
  "src/app-aluno/sozinho/api.ts": { "tabela:physiq_treinos_prontos.select": 1 },
  "src/ferramentas/lixeira/dados.ts": { "rpc:?": 1, "rpc:lixeira_apagar": 1, "rpc:lixeira_da_conta": 1, "rpc:lixeira_restaurar": 1 },
  "src/ferramentas/modelos/dados.ts": { "tabela:?": 1, "tabela:?.select": 1, "tabela:?.update": 1 },
  "src/master/app/treinosProntos.ts": { "tabela:physiq_treinos_prontos.insert": 1, "tabela:physiq_treinos_prontos.select": 1, "tabela:physiq_treinos_prontos.update": 2, "tabela:physiq_treinos_prontos_exercicios.insert": 1, "tabela:physiq_treinos_prontos_grupos.delete": 1, "tabela:physiq_treinos_prontos_grupos.insert": 1, "tabela:tb_exercicios.select": 1 },
  "src/nucleo/dadoLivre.ts": { "rpc:paciente_dado_livre": 1 },
  "src/pages/master/BibliotecaPage.tsx": { "rpc:exercicios_da_lista": 1, "tabela:?": 1, "tabela:grupos_musculares.delete": 1, "tabela:grupos_musculares.insert": 1, "tabela:grupos_musculares.select": 1, "tabela:tb_exercicios.delete": 1, "tabela:tb_exercicios.insert": 1, "tabela:tb_exercicios.select": 1, "tabela:tb_exercicios.update": 2 },
  "src/painel/agenda/dados.ts": { "rpc:agenda_garantir_tags": 1, "rpc:agenda_horarios": 1, "rpc:aluno_compromissos": 1, "rpc:aluno_definir_pacote": 1, "tabela:agenda_config.select": 1, "tabela:agenda_config.upsert": 1, "tabela:agenda_tags.insert": 1, "tabela:agenda_tags.select": 1, "tabela:agenda_tags.update": 2, "tabela:agenda_travas.delete": 1, "tabela:agenda_travas.insert": 1, "tabela:agenda_travas.select": 1, "tabela:agendamentos.insert": 1, "tabela:agendamentos.select": 1, "tabela:agendamentos.update": 3, "tabela:bloqueios_agenda.delete": 1, "tabela:bloqueios_agenda.insert": 1, "tabela:bloqueios_agenda.select": 2, "tabela:calendarios.insert": 1, "tabela:calendarios.select": 1, "tabela:calendarios.update": 2, "tabela:pacientes.select": 2 },
  "src/painel/aluno/dados/api.ts": { "rpc:?": 1, "rpc:aluno_novo_link": 1, "rpc:aluno_salvar_ajustes": 1, "rpc:aluno_salvar_dados": 1, "rpc:mensagens_aviso_fechar": 1, "rpc:mensagens_desligadas": 1, "rpc:mensagens_ligar_para_todos": 1 },
  "src/painel/aluno/envio/api.ts": { "rpc:aluno_avisar_plano": 1 },
  "src/painel/aluno/resumo/acesso/api.ts": { "rpc:aluno_acesso": 1, "rpc:paciente_criar_acesso": 1, "rpc:paciente_redefinir_senha": 1 },
  "src/painel/alunos/api.ts": { "rpc:?": 1, "rpc:aluno_convites": 1, "rpc:alunos_da_conta": 3, "rpc:alunos_pendentes": 1, "tabela:pacientes.select": 1 },
  "src/painel/alunos/novosPorMes.ts": { "rpc:alunos_novos_por_mes": 1 },
  "src/painel/busca/Treinos.tsx": { "tabela:tb_grupos_treino.select": 1 },
  "src/painel/configuracoes/Conta.tsx": { "tabela:contas.update": 1 },
  "src/painel/configuracoes/Perfil.tsx": { "tabela:physiq_professores.update": 1, "tabela:profiles.select": 1, "tabela:profiles.update": 2 },
  "src/painel/configuracoes/equipe/api.ts": { "rpc:?": 1, "rpc:alterar_papeis_membro": 1, "rpc:equipe_da_conta": 1, "rpc:garantir_meu_codigo": 1, "rpc:remover_membro": 1 },
  "src/painel/configuracoes/excluirConta/api.ts": { "rpc:w2l_prontuarios_para_baixar": 1 },
  "src/painel/mensagens/api.ts": { "rpc:?": 1, "rpc:whatsapp_fila": 1, "rpc:whatsapp_limpar_falhas": 1, "rpc:whatsapp_reenviar": 1, "rpc:whatsapp_resumo": 1, "rpc:whatsapp_salvar_config": 1, "tabela:profiles.select": 1 },
  "src/painel/treinos/api.ts": { "rpc:modelos_da_lista": 1, "storage:upload": 1, "tabela:?": 1, "tabela:grupos_musculares.delete": 1, "tabela:grupos_musculares.insert": 1, "tabela:grupos_musculares.select": 1, "tabela:tb_exercicios.delete": 1, "tabela:tb_exercicios.insert": 1, "tabela:tb_exercicios.select": 2, "tabela:tb_exercicios.update": 1, "tabela:tb_grupos_exercicios.delete": 1, "tabela:tb_grupos_exercicios.insert": 1, "tabela:tb_grupos_exercicios.select": 1, "tabela:tb_grupos_exercicios.update": 2, "tabela:tb_grupos_treino.delete": 1, "tabela:tb_grupos_treino.insert": 1, "tabela:tb_grupos_treino.select": 2, "tabela:tb_grupos_treino.update": 1, "tabela:tb_pastas_treino.delete": 1, "tabela:tb_pastas_treino.insert": 1, "tabela:tb_pastas_treino.select": 1, "tabela:tb_pastas_treino.update": 1, "tabela:tb_pastas_treino_grupos.delete": 1, "tabela:tb_pastas_treino_grupos.insert": 1, "tabela:tb_pastas_treino_grupos.select": 2 },
  "src/publico/legal/responsavel/api.ts": { "rpc:?": 1, "rpc:aluno_responsavel": 1, "rpc:aluno_responsavel_registrar": 2 },
  "src/treino/editor/api.ts": { "rpc:aluno_treino": 1, "rpc:exercicios_da_lista": 1 },
};

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

  it("a BASE só diminui: hoje 22 arquivos e 136 achados (a próxima sub-W tira os dela; nunca sobe)", () => {
    expect(Object.keys(BASE).length).toBeLessThanOrEqual(22);
    expect(Object.values(BASE).reduce((n, c) => n + Object.values(c).reduce((m, x) => m + x, 0), 0)).toBeLessThanOrEqual(136);
  });

  it("o FICA são só os 4 arquivos (a fila do PowerSync, o desvio 23 e os 2 links públicos), cada um com o motivo; nenhum deles na BASE", () => {
    expect(Object.keys(FICA).sort()).toEqual(["src/evolucao/fontes.ts", "src/lib/powersync/connector.ts", "src/painel/dietas/publico.ts", "src/painel/preconsulta/publico.ts"]);
    for (const [arquivo, f] of Object.entries(FICA)) {
      expect(f.motivo.length, arquivo).toBeGreaterThan(20);
      expect(BASE[arquivo], arquivo).toBeUndefined();
    }
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
    // o app do aluno sem profissional: só os treinos prontos do Treino (a 21d) seguem direto
    expect(agora.get("src/app-aluno/sozinho/api.ts")).toEqual({ "tabela:physiq_treinos_prontos.select": 1 });
  });

  it("o aviso (sem falhar): o achado da BASE que sumiu — quem tirou a chamada tira a linha da BASE", () => {
    const sumidos = Object.entries(BASE).flatMap(([arquivo, permitido]) =>
      Object.entries(permitido).filter(([k, n]) => (agora.get(arquivo)?.[k] ?? 0) < n).map(([k, n]) => `${arquivo} › ${k} (${agora.get(arquivo)?.[k] ?? 0} × ${n})`));
    // o aviso da BASE que pode diminuir (não é falha: a W-A, por exemplo, pode tirar uma chamada)
    if (sumidos.length) console.warn(`semBancoNoNavegador: a BASE pode diminuir — ${sumidos.join(" · ")}`);
    expect(Array.isArray(sumidos)).toBe(true);
  });
});
