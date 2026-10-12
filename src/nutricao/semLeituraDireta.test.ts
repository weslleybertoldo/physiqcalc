// Physiq hml-20a (H-42 · jeito 2, etapa 2 — spec hml-20 §4) — a guarda contra a VOLTA da leitura direta do navegador nas áreas que já
// leem pela função (o detector do semGravacaoDireta.test.ts, para LEITURA). Lê o código das pastas migradas (sem os comentários; os
// testes ficam de fora) e falha em:
//   · .from(…) com .select( como 1ª operação do encadeamento                                   (tabela);
//   · .rpc("<uma das RPC_SO_LEITURA>")                                                          (src/integrations/repeticao.ts);
//   · .storage.from(…).createSignedUrl( · .createSignedUrls( · .download( · .list(               (Storage);
//   · .createSignedUrl(s)( num objeto guardado (o bucket numa variável ou num parâmetro).
// Cada sub-worktree põe as pastas dela em AREAS, com a base (o que ainda lê direto e está aceito — só diminui) e o `fora` (arquivos de
// outra W, e os links públicos sem login, /d/:codigo e /f/:slug, que ficam no navegador — decisão 13 da hml-19, spec hml-20 §2.8).
// hml-20a: o app do aluno — a Evolução (src/evolucao), a Dieta e o Diário (src/nutricao/app), as abas Evolução e Dieta, os cards do
// Início, a lib das fotos mensais e a própria porta das leituras (leitura.ts, leituraEmLote.ts): só o DESVIO 23 (o gate J, 12/10/2026,
// docs/desvios.md) — a parte do TREINO da Evolução segue no navegador (src/evolucao/fontes.ts: as 3 leituras do REST do Treino e a
// assinatura do `registros`, iguais ao 637363f), listada e contada; nada do PRINCIPAL. E no src/ inteiro ninguém lê direto as 2 RPCs que
// a 20a levou para o servidor; as 2 tabelas do Treino da Evolução, só o fontes.ts (o desvio; o painel lê o Treino pela treino-leitura).
// hml-20b: o Painel › Aluno — o Prontuário (src/nutricao/prontuario), a casca/Resumo (src/painel/aluno/dados), a Avaliação
// (src/painel/aluno/avaliacao, src/nutricao/avaliacao, abas/Avaliacao.tsx) e as 2 libs da fronteira (editor/lib/profissional.ts e
// antropometrias.ts): 0 leitura direta do principal, fora 1 de OUTRA W listada (a mensagens_desligadas do aviso da P15 — Mensagens, H-43,
// no mesmo arquivo do perfil). O detector passa a ver também o invólucro local de RPC (`rpc("x"` / `rpc<T>("x"`, como o do
// painel/aluno/dados/api.ts — o aluno_perfil saía por ele). E no src/ inteiro ninguém lê direto as 4 RPCs que a 20b levou para o servidor.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RPC_SO_LEITURA } from "@/integrations/repeticao";
// o mesmo leitor sem comentários da guarda de CI (scripts/ci/checar-funcoes.mjs)
import { semComentarios } from "../../scripts/ci/checar-funcoes.mjs";

const RAIZ = resolve(__dirname, "../..");

/**
 * As áreas migradas para a leitura pela função e o que ainda pode ler direto em cada uma (a base só diminui); `fora` = arquivos de outra
 * W (ou os links públicos); `pastas` aceita pasta ou arquivo avulso; `minimo` = quantos arquivos a área tem de ter (a guarda não passa por
 * não achar arquivo).
 */
const AREAS: Record<string, { pastas: string[]; base: number; fora?: string[]; minimo: number; desvio?: Record<string, string[]> }> = {
  // hml-20a: o app do aluno (Início, Evolução, Dieta/Diário) e a porta das leituras — 47 arquivos hoje
  aluno: {
    pastas: [
      "src/evolucao", "src/nutricao/app", "src/app-aluno/abas/Evolucao.tsx", "src/app-aluno/abas/Dieta.tsx", "src/app-aluno/abas/Inicio.tsx",
      "src/app-aluno/inicio", "src/lib/registrosFotos.ts", "src/nutricao/leitura.ts", "src/integrations/leituraEmLote.ts",
    ],
    base: 4,
    // o desvio do gate J (docs/desvios.md): a parte do TREINO da Evolução no navegador — physiq_profiles, physiq_avaliacoes,
    // physiq_registros_fotos e o createSignedUrls do `registros` (o assinar do fontes.ts). Nenhuma outra leitura direta na área.
    desvio: { "src/evolucao/fontes.ts": ["storage.createSignedUrls", "tabela.select", "tabela.select", "tabela.select"] },
    minimo: 40,
  },
  // hml-20b: o Painel › Aluno (casca, Resumo, Prontuário ×10, Avaliação, PDF) — 86 arquivos hoje. No 6fd3194 o detector achava 34 leituras
  // diretas aqui (33 desta W; o progresso_20b); agora só 1, de OUTRA W: a mensagens_desligadas (o aviso único da P15, que a faixa lê —
  // Mensagens, H-43/hml-21) mora no mesmo api.ts do perfil e fica no navegador. O resto do Resumo que lê direto (planos_do_aluno e
  // refeicoes_concluidas — 20c; aluno_compromissos, aluno_responsavel, aluno_acesso e o paciente_dado_livre — H-43) está fora destas pastas.
  "painel-aluno": {
    pastas: [
      "src/nutricao/prontuario", "src/painel/aluno/dados", "src/painel/aluno/avaliacao", "src/nutricao/avaliacao", "src/painel/aluno/abas/Avaliacao.tsx",
      "src/nutricao/editor/lib/profissional.ts", "src/nutricao/editor/lib/antropometrias.ts",
    ],
    base: 1,
    desvio: { "src/painel/aluno/dados/api.ts": ["rpc.mensagens_desligadas"] },
    minimo: 80,
  },
};
/**
 * O que saiu do navegador para o servidor — no src/ inteiro, ninguém lê direto (o nome escrito na chamada). hml-20a: as 2 do app do
 * aluno; hml-20b: as 4 do Painel › Aluno (aluno_perfil, aluno_evolucao, aluno_anotacoes, exames_do_aluno — nenhuma tem leitor em área de
 * outra W).
 */
const RPCS_DO_SERVIDOR = ["minha_dieta", "minha_evolucao", "aluno_perfil", "aluno_evolucao", "aluno_anotacoes", "exames_do_aluno"] as const;
/** hml-20a (desvio do gate J): as 2 tabelas do Treino da Evolução do aluno — só o src/evolucao/fontes.ts lê direto (1 vez cada). */
const TABELAS_DO_DESVIO = ["physiq_avaliacoes", "physiq_registros_fotos"] as const;
const SO_O_DESVIO = "src/evolucao/fontes.ts";

const FROM_DE_TABELA = /(?<!\bArray)(?<!storage\s*)\.from\(/g;
const LE_STORAGE = /\.storage\s*\.from\(([^()]|\([^()]*\))*\)\s*\.(createSignedUrls?|download|list)\(/g;
const ASSINA_GUARDADO = /\.(createSignedUrls?)\(/g;
// hml-20b: também o invólucro local (`rpc("x"` / `rpc<T>("x"`, sem o ponto) e o genérico no `.rpc<T>("x"`
const RPC = /(?<![\w$])rpc\s*(?:<[^()]*?>)?\s*\(\s*["'`]([a-z0-9_]+)["'`]/g;
const TABELA_ESCRITA = /^\s*["'`]([a-z0-9_]+)["'`]/;

const linhaDe = (texto: string, pos: number) => texto.slice(0, pos).split("\n").length;

/** Do "(" de abertura até o ")" que fecha (parênteses do código; o texto entre aspas não atrapalha a contagem na prática das libs). */
function depoisDoFecho(texto: string, abre: number): number {
  let nivel = 0;
  for (let i = abre; i < texto.length; i++) {
    if (texto[i] === "(") nivel++;
    else if (texto[i] === ")" && --nivel === 0) return i + 1;
  }
  return texto.length;
}

/** As leituras diretas de um código-fonte: "linha: o quê". */
export function leiturasDiretas(fonte: string): string[] {
  const texto: string = semComentarios(fonte);
  const achados: string[] = [];
  const doStorage = new Set<number>();
  for (const m of texto.matchAll(LE_STORAGE)) {
    const l = linhaDe(texto, m.index!);
    doStorage.add(l);
    achados.push(`${l}: storage.${m[2]}`);
  }
  for (const m of texto.matchAll(ASSINA_GUARDADO)) {
    const l = linhaDe(texto, m.index!);
    if (!doStorage.has(l)) achados.push(`${l}: storage.${m[1]}`);
  }
  for (const m of texto.matchAll(FROM_DE_TABELA)) {
    // a 1ª operação depois do .from(…): select = leitura (o .insert(…).select() da gravação começa no insert)
    const fim = depoisDoFecho(texto, m.index! + m[0].length - 1);
    const op = /^\s*\.\s*([A-Za-z]+)\s*[(<]/.exec(texto.slice(fim, fim + 200));
    if (op?.[1] === "select") achados.push(`${linhaDe(texto, m.index!)}: tabela.select`);
  }
  for (const m of texto.matchAll(RPC)) if (RPC_SO_LEITURA.has(m[1])) achados.push(`${linhaDe(texto, m.index!)}: rpc.${m[1]}`);
  return achados;
}

/** As leituras com o nome ESCRITO de uma das RPCs/tabelas que foram para o servidor (a varredura do src/ inteiro). */
function leiturasDoQueSaiu(fonte: string): string[] {
  const texto: string = semComentarios(fonte);
  const achados: string[] = [];
  for (const m of texto.matchAll(RPC)) if ((RPCS_DO_SERVIDOR as readonly string[]).includes(m[1])) achados.push(`${linhaDe(texto, m.index!)}: rpc.${m[1]}`);
  for (const m of texto.matchAll(FROM_DE_TABELA)) {
    const nome = TABELA_ESCRITA.exec(texto.slice(m.index! + m[0].length))?.[1];
    if (nome && (TABELAS_DO_DESVIO as readonly string[]).includes(nome)) achados.push(`${linhaDe(texto, m.index!)}: ${nome}`);
  }
  return achados;
}

function fontesDa(pasta: string): string[] {
  const alvo = resolve(RAIZ, pasta);
  if (statSync(alvo).isFile()) return [alvo];
  const saida: string[] = [];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const cam = join(dir, nome);
      if (statSync(cam).isDirectory()) andar(cam);
      else if (/\.(ts|tsx)$/.test(nome) && !/\.(test|spec)\.(ts|tsx)$/.test(nome)) saida.push(cam);
    }
  };
  andar(alvo);
  return saida.sort();
}

describe("hml-20a — o detector acha o que procura (controle positivo)", () => {
  it("tabela: select como 1ª operação (em 1 ou várias linhas, com o `as never`, com o tipo genérico)", () => {
    expect(leiturasDiretas('const { data, error } = await supabase.from("physiq_profiles").select(COLUNAS).eq("id", id).maybeSingle();')).toEqual(["1: tabela.select"]);
    expect(leiturasDiretas('const r = await principal\n  .from("anamneses" as never)\n  .select("id, titulo")\n  .eq("paciente_id", p);')).toEqual(["2: tabela.select"]);
    expect(leiturasDiretas("await db.from(TABELA).select<Linha>(\"*\").limit(10);")).toEqual(["1: tabela.select"]);
  });

  it("RPC de leitura; Storage: o link assinado (1 e lote), download e list; o createSignedUrls num objeto guardado", () => {
    expect(leiturasDiretas('const { data, error } = await principal.rpc("minha_dieta" as never, { p_dia: dia } as never);')).toEqual(["1: rpc.minha_dieta"]);
    expect(leiturasDiretas("const { data } = await principal.storage.from(BUCKET).createSignedUrls(caminhos, 3600);")).toEqual(["1: storage.createSignedUrls"]);
    expect(leiturasDiretas('await supabase.storage.from(bucketDoAmbiente("anexos")).createSignedUrl(path, 60);')).toEqual(["1: storage.createSignedUrl"]);
    expect(leiturasDiretas("await supabase.storage.from(B).download(path);")).toEqual(["1: storage.download"]);
    expect(leiturasDiretas("await supabase.storage.from(B).list(pasta, { limit: 10 });")).toEqual(["1: storage.list"]);
    expect(leiturasDiretas("const { data, error } = await bucket.createSignedUrls(caminhos, VALIDADE_URL_S);")).toEqual(["1: storage.createSignedUrls"]);
  });

  it("o que NÃO é leitura direta passa: gravação (insert…select), RPC que grava, o PUT no link assinado, a função, Array.from, comentário", () => {
    const fonte = [
      'const { data, error } = await supabase.from("anamneses").insert(valores).select("*").single();',
      'await supabase.from("anexos").update({ deleted_at: agora }).eq("id", id);',
      'const { data: r } = await supabase.rpc("diario_enviar", args);',
      "const up = await principal.storage.from(link.bucket).uploadToSignedUrl(link.caminho, link.token, arquivo);",
      'const { data, error } = await supabase.functions.invoke("nutricao", { body: { acao: "ler", itens } });',
      "const ids = Array.from(new Set(lista)).filter(Boolean);",
      '// antes: await supabase.from("anexos").select("*");',
      "/* await supabase.storage.from(B).createSignedUrls(c, 60); */",
    ].join("\n");
    expect(leiturasDiretas(fonte)).toEqual([]);
  });

  it("a base de antes (637363f) seria pega: as 3 libs da 20a liam direto (o detector acharia as 9 leituras de lá)", () => {
    const antes = [
      // src/evolucao/fontes.ts (as 3 do Treino, a minha_evolucao e a assinatura num objeto guardado)
      'supabase.from("physiq_profiles").select(COLUNAS_PERFIL).eq("id", treinoId).maybeSingle(),',
      'supabase.from("physiq_avaliacoes").select("*").eq("user_id", treinoId)',
      'supabase.from("physiq_registros_fotos").select("id, mes_ref, tipo, storage_path, created_at").eq("user_id", treinoId)',
      'const { data, error } = await principal.rpc("minha_evolucao" as never);',
      "const { data, error } = await bucket.createSignedUrls(caminhos, VALIDADE_URL_S);",
      // src/nutricao/app/pacienteApp.ts e src/lib/registrosFotos.ts
      'const { data, error } = await principal.rpc("minha_dieta" as never, { p_dia: dia } as never);',
      "const { data, error } = await principal.storage.from(BUCKET_DIARIO).createSignedUrls(comPath.map((r) => r.path), VALIDADE_URL_S);",
      'const { data, error } = await supabase\n    .from("physiq_registros_fotos")\n    .select("id, user_id, mes_ref, tipo, storage_path")',
      "const { data, error } = await supabase.storage.from(BUCKET_REGISTROS).createSignedUrl(path, 3600);",
    ].join("\n");
    expect(leiturasDiretas(antes)).toHaveLength(9);
    expect(leiturasDoQueSaiu(antes)).toHaveLength(5); // minha_evolucao, minha_dieta, physiq_avaliacoes, physiq_registros_fotos ×2
  });
});

describe("hml-20b — o detector também acha as leituras de antes do Painel › Aluno (controle positivo)", () => {
  it("o invólucro local de RPC (com e sem o tipo), o .rpc com o tipo, a URL de 1 anexo e o profiles; a definição do invólucro não conta", () => {
    expect(leiturasDiretas('const r = await rpc<PerfilAluno>("aluno_perfil", { p_aluno: alunoId });')).toEqual(["1: rpc.aluno_perfil"]);
    expect(leiturasDiretas('const r = await rpc<MensagensDesligadas | null>("mensagens_desligadas", {});')).toEqual(["1: rpc.mensagens_desligadas"]);
    expect(leiturasDiretas('return rpc("aluno_responsavel", { p_aluno: alunoId });')).toEqual(["1: rpc.aluno_responsavel"]);
    expect(leiturasDiretas('const { data } = await supabase.rpc<Json>("exames_do_aluno", args);')).toEqual(["1: rpc.exames_do_aluno"]);
    expect(leiturasDiretas("async function rpc<T>(nome: string, args: Record<string, unknown>): Promise<T> {")).toEqual([]);
    expect(leiturasDiretas('await rpc("aluno_salvar_dados", { p_aluno: alunoId });')).toEqual([]); // RPC que grava
    expect(leiturasDiretas('const x = await meuRpc("aluno_perfil", {}); const y = await prpc("aluno_perfil");')).toEqual([]);
    const antes = [
      'const { data, error } = await supabase.rpc("aluno_anotacoes" as never, args as never);',
      'const { data, error } = await principal.rpc("aluno_evolucao" as never, { p_aluno: alunoIdDaRota } as never);',
      "const { data, error } = await principal.storage.from(BUCKET_EVOLUCAO).createSignedUrls(caminhos, VALIDADE_URL_S);",
      "const { data, error } = await supabase.storage.from(BUCKET_ANEXOS).createSignedUrl(anexo.path, segundos, download ? { download: anexo.nome } : undefined);",
      'const { data, error } = await principal.from("antropometrias").select("*").eq("id", av.idOriginal).maybeSingle();',
      'const { data, error } = await supabase.from("profiles").select("nome").eq("id", userId).maybeSingle();',
      'const { data, error } = await supabase\n    .from("consultas")\n    .select("*")\n    .eq("paciente_id", pacienteId)',
    ].join("\n");
    expect(leiturasDiretas(antes)).toHaveLength(7);
    expect(leiturasDoQueSaiu(antes)).toHaveLength(2); // aluno_anotacoes e aluno_evolucao (as 4 da 20b saíram do src/)
  });
});

describe("hml-20a — as áreas migradas não leem direto (só o desvio listado)", () => {
  it.each(Object.entries(AREAS))("%s: nenhuma leitura direta nas pastas da área além do desvio listado", (_area, { pastas, base, fora = [], minimo, desvio = {} }) => {
    const fontes = pastas.flatMap(fontesDa).filter((arq) => !fora.includes(relative(RAIZ, arq)));
    const achados = fontes.flatMap((arq) => leiturasDiretas(readFileSync(arq, "utf-8")).map((a) => `${relative(RAIZ, arq)}:${a}`));
    expect(achados.length, achados.join("\n")).toBe(base);
    // cada leitura que ficou é a do desvio (o arquivo e o tipo); o resto da área: 0
    const porArquivo: Record<string, string[]> = {};
    for (const a of achados) {
      const [arq, , oque] = a.split(":");
      (porArquivo[arq] ??= []).push(oque.trim());
    }
    for (const lista of Object.values(porArquivo)) lista.sort();
    expect(porArquivo, achados.join("\n")).toEqual(desvio);
    expect(Object.values(desvio).flat()).toHaveLength(base);
    expect(fontes.length).toBeGreaterThanOrEqual(minimo);
  });

  it("o desvio do gate J é SÓ o Treino: as 3 tabelas physiq_* pelo cliente do Treino e o bucket registros; nada do principal direto na área", () => {
    const texto: string = semComentarios(readFileSync(resolve(RAIZ, SO_O_DESVIO), "utf-8"));
    expect(texto.match(/\bsupabase\.from\("physiq_(profiles|avaliacoes|registros_fotos)"\)\.select\(/g)).toHaveLength(3);
    expect(texto).toMatch(/assinar\(supabase\.storage\.from\(BUCKET_REGISTROS\), c\)/);
    // o fontes.ts não usa o cliente do principal para nada (a parte do principal vai pelo lerNutricao)
    expect(texto).not.toMatch(/\bprincipal\s*\.\s*(from|rpc|storage|functions)\b/);
  });

  it("no src/ inteiro, ninguém lê direto as RPCs que foram para o servidor (20a: minha_dieta, minha_evolucao; 20b: aluno_perfil, aluno_evolucao, aluno_anotacoes, exames_do_aluno); physiq_avaliacoes e physiq_registros_fotos só no desvio", () => {
    const fontes = fontesDa("src");
    const achados = fontes.flatMap((arq) => leiturasDoQueSaiu(readFileSync(arq, "utf-8")).map((a) => `${relative(RAIZ, arq)}:${a}`));
    const fora = achados.filter((a) => !a.startsWith(`${SO_O_DESVIO}:`));
    expect(fora, fora.join("\n")).toEqual([]);
    expect(achados.map((a) => a.split(":").at(-1)!.trim()).sort()).toEqual([...TABELAS_DO_DESVIO]);
    expect(fontes.length).toBeGreaterThan(500);
  });

  it("os arquivos de fora existem e ainda leem direto (a guarda não esconde nada além deles)", () => {
    for (const [area, { fora = [] }] of Object.entries(AREAS)) {
      for (const rel of fora) expect(leiturasDiretas(readFileSync(resolve(RAIZ, rel), "utf-8")).length, `${area}: ${rel}`).toBeGreaterThan(0);
    }
  });

  it("desvio registrado (spec §2.8): os links públicos sem login seguem no navegador — /d/:codigo e /f/:slug chamam as RPCs deles direto", () => {
    expect(readFileSync(resolve(RAIZ, "src/painel/dietas/publico.ts"), "utf-8")).toMatch(/\.rpc\(\s*"diario_link"/);
    expect(readFileSync(resolve(RAIZ, "src/painel/dietas/publico.ts"), "utf-8")).toMatch(/\.rpc\(\s*"diario_listar"/);
    expect(readFileSync(resolve(RAIZ, "src/painel/preconsulta/publico.ts"), "utf-8")).toMatch(/\.rpc\(\s*"preconsulta_formulario"/);
  });
});
