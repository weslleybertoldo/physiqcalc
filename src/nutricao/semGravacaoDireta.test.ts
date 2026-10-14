// Physiq hml-19a (H-41 · jeito 2, spec hml-19 §2.1 item 6) — a guarda contra a VOLTA da gravação direta do navegador nas áreas que já
// gravam pela função nutricao. Lê o código das pastas migradas (sem os comentários; os testes ficam de fora) e falha em:
//   · .from(…) seguido, no mesmo encadeamento, de .insert( · .update( · .upsert( · .delete(  (tabela);
//   · .storage.from(…).upload( · .remove( · .update( · .move( · .copy(                     (Storage — o PUT no link assinado,
//     uploadToSignedUrl, é o caminho certo e passa);
//   · .rpc("<uma das RPC_QUE_GRAVAM>")                                                     (src/integrations/repeticao.ts).
// Cada sub-worktree põe as pastas dela em AREAS, com a base (o que ainda grava direto e está aceito) — aqui, 0. hml-19b: a Dieta, as
// Dietas e o app do aluno (menos o que é de outra W: antropometrias.ts, da hml-19c, e o link público /d/:codigo, decisão 13).
// hml-19c: a Avaliação — as fotos de evolução e os diálogos (src/nutricao/avaliacao), a aba do painel (a foto mensal do Treino e o
// aviso, src/painel/aluno/avaliacao) e a lib da antropometria (um arquivo avulso, que saiu do `fora` da Dieta).
// hml-19d: o Financeiro (src/financeiro e src/painel/financeiro — as libs, os diálogos e as tags do aluno) grava pela função financeiro.
// As pastas são divididas com a LINUX 3 (cobrança, Mercado Pago, InfinitePay, planos): nesta área só contam as gravações nas 4 tabelas
// do Financeiro e em pacientes (as tags) — `tabelas`; e, no src/ inteiro, ninguém grava direto nas 4 tabelas.
// hml-20c (H-102 🟡): a Pré-consulta (src/painel/preconsulta) grava pela função nutricao — as 5 gravações que ficaram de fora do H-41
// (criar/editar/excluir o formulário; ligar/marcar importada e excluir a resposta): base 5 → 0. O formulário público /f/:slug (publico.ts,
// anônimo — decisão 13) fica fora: responde pela RPC pública de hoje.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RPC_QUE_GRAVAM } from "@/integrations/repeticao";
// o mesmo leitor sem comentários da guarda de CI (scripts/ci/checar-funcoes.mjs): o "image/*" de uma string não engole o arquivo
import { semComentarios } from "../../scripts/ci/checar-funcoes.mjs";

const RAIZ = resolve(__dirname, "../..");

/**
 * As áreas migradas para o jeito 2 e o que ainda pode gravar direto em cada uma (a base só diminui); `fora` = arquivos de outra W;
 * `pastas` aceita pasta ou arquivo avulso; `minimo` = quantos arquivos a área tem de ter, no mínimo (a guarda não passa por não achar
 * arquivo; o padrão é 31).
 */
const AREAS: Record<string, { pastas: string[]; base: number; fora?: string[]; minimo?: number; tabelas?: readonly string[] }> = {
  // hml-19a: o Prontuário (as 18 tabelas e o bucket de anexos — a Pré-consulta usa as mesmas libs)
  prontuario: { pastas: ["src/nutricao/prontuario"], base: 0 },
  // hml-19b: a Dieta (as libs do editor), as Dietas (alimentos, receitas, diário da nutri) e o app do aluno (✓ e a foto do diário)
  dieta: {
    pastas: ["src/nutricao/editor/lib", "src/painel/dietas", "src/nutricao/app"],
    base: 0,
    fora: ["src/painel/dietas/publico.ts"],
  },
  // hml-19c: a Avaliação (Perfil do aluno › Avaliação) — 16 arquivos hoje
  avaliacao: {
    pastas: ["src/nutricao/avaliacao", "src/painel/aluno/avaliacao", "src/nutricao/editor/lib/antropometrias.ts"],
    base: 0,
    minimo: 15,
  },
  // hml-19d: o Financeiro (as movimentações, as categorias, os modelos e os recibos; as sementes do 1º acesso; as tags do aluno) — só as
  // gravações nestas tabelas contam (o resto das 2 pastas é da cobrança/LINUX 3)
  financeiro: {
    pastas: ["src/financeiro", "src/painel/financeiro"],
    base: 0,
    tabelas: ["transacoes", "recibos", "modelos_recibo", "categorias_financeiras", "pacientes"],
  },
  // hml-20c: a Pré-consulta (os formulários e as respostas do painel) — 14 arquivos hoje (15 menos o formulário público)
  preconsulta: {
    pastas: ["src/painel/preconsulta"],
    base: 0,
    fora: ["src/painel/preconsulta/publico.ts"],
    minimo: 14,
  },
};
/** As 4 tabelas do Financeiro (hml-19d): ninguém no src/ grava direto nelas. */
const TABELAS_DO_FINANCEIRO = ["transacoes", "recibos", "modelos_recibo", "categorias_financeiras"] as const;

const GRAVA_TABELA = /\.(insert|update|upsert|delete)\(/;
const GRAVA_STORAGE = /\.storage\s*\.from\(([^()]|\([^()]*\))*\)\s*\.(upload|remove|update|move|copy)\(/g;
const FROM_DE_TABELA = /(?<!\bArray)(?<!storage\s*)\.from\(/g;
const RPC = /\.rpc\(\s*["'`]([a-z0-9_]+)["'`]/g;

const linhaDe = (texto: string, pos: number) => texto.slice(0, pos).split("\n").length;

const TABELA_ESCRITA = /^\s*["'`]([a-z0-9_]+)["'`]\s*\)/;

/**
 * As gravações diretas de um código-fonte: "linha: o quê". `tabelas` (hml-19d): só as gravações nessas tabelas (ou num `.from(` cujo nome
 * não está escrito — conta, por garantia); o Storage e as RPCs ficam de fora (a área é a das tabelas).
 */
export function gravacoesDiretas(fonte: string, tabelas?: readonly string[]): string[] {
  const texto: string = semComentarios(fonte);
  const achados: string[] = [];
  if (!tabelas) for (const m of texto.matchAll(GRAVA_STORAGE)) achados.push(`${linhaDe(texto, m.index!)}: storage.${m[2]}`);
  for (const m of texto.matchAll(FROM_DE_TABELA)) {
    // o encadeamento: do .from( até o fim da instrução (;) ou o próximo .from(
    const depois = texto.slice(m.index! + m[0].length, m.index! + m[0].length + 1500);
    const fim = depois.search(/;|\.from\(/);
    const cadeia = fim === -1 ? depois : depois.slice(0, fim);
    const w = GRAVA_TABELA.exec(cadeia);
    if (!w) continue;
    const nome = TABELA_ESCRITA.exec(depois)?.[1];
    if (tabelas && nome && !tabelas.includes(nome)) continue;
    achados.push(`${linhaDe(texto, m.index!)}: tabela.${w[1]}`);
  }
  if (!tabelas) for (const m of texto.matchAll(RPC)) if (RPC_QUE_GRAVAM.has(m[1])) achados.push(`${linhaDe(texto, m.index!)}: rpc.${m[1]}`);
  return achados;
}

/** hml-19d: só as gravações com o nome da tabela ESCRITO e numa das `tabelas` (a varredura do src/ inteiro): "linha: tabela.operação". */
function gravacoesComONome(fonte: string, tabelas: readonly string[]): string[] {
  const texto: string = semComentarios(fonte);
  const achados: string[] = [];
  for (const m of texto.matchAll(FROM_DE_TABELA)) {
    const depois = texto.slice(m.index! + m[0].length, m.index! + m[0].length + 1500);
    const nome = TABELA_ESCRITA.exec(depois)?.[1];
    if (!nome || !tabelas.includes(nome)) continue;
    const fim = depois.search(/;|\.from\(/);
    const w = GRAVA_TABELA.exec(fim === -1 ? depois : depois.slice(0, fim));
    if (w) achados.push(`${linhaDe(texto, m.index!)}: ${nome}.${w[1]}`);
  }
  return achados;
}

function fontesDa(pasta: string): string[] {
  const saida: string[] = [];
  // hml-19c: um arquivo avulso também vale (a lib da antropometria mora no editor da Dieta)
  if (statSync(resolve(RAIZ, pasta)).isFile()) return [resolve(RAIZ, pasta)];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const cam = join(dir, nome);
      if (statSync(cam).isDirectory()) andar(cam);
      else if (/\.(ts|tsx)$/.test(nome) && !/\.(test|spec)\.(ts|tsx)$/.test(nome)) saida.push(cam);
    }
  };
  andar(resolve(RAIZ, pasta));
  return saida.sort();
}

describe("hml-19a — o detector acha o que procura (controle positivo)", () => {
  it("tabela: insert/update/upsert/delete no mesmo encadeamento, em 1 ou várias linhas", () => {
    expect(gravacoesDiretas('await supabase.from("x").insert({ a: 1 });')).toEqual(["1: tabela.insert"]);
    expect(gravacoesDiretas('const r = await supabase\n  .from("anexos")\n  .update({ deleted_at: agora })\n  .eq("id", id);')).toEqual(["2: tabela.update"]);
    expect(gravacoesDiretas("await db.from(T_BASE).upsert(linhas, { onConflict: \"id\" });")).toEqual(["1: tabela.upsert"]);
    expect(gravacoesDiretas("await supabase.from(TABELA).delete().eq(\"id\", id);")).toEqual(["1: tabela.delete"]);
  });

  it("Storage: upload e remove (fora do link assinado); RPC que grava", () => {
    expect(gravacoesDiretas("await supabase.storage.from(BUCKET).upload(path, arquivo, { upsert: false });")).toEqual(["1: storage.upload"]);
    expect(gravacoesDiretas("await supabase.storage.from(bucketDoAmbiente(\"anexos\")).remove([path]);")).toEqual(["1: storage.remove"]);
    // hml-21c (a regra das listas): a lixeira_apagar saiu do RPC_QUE_GRAVAM (vai pela função conta) — o exemplo usa uma que segue nela
    expect(gravacoesDiretas('await supabase.rpc("diario_enviar", { p_codigo: codigo });')).toEqual(["1: rpc.diario_enviar"]);
  });

  it("o que NÃO é gravação passa: leituras, o PUT no link assinado, o link de leitura, Array.from, RPC de leitura, comentário", () => {
    const fonte = [
      'const { data, error } = await supabase.from("anamneses").select("*").eq("paciente_id", p).order("data", { ascending: false });',
      "const up = await supabase.storage.from(link.bucket).uploadToSignedUrl(link.caminho, link.token, arquivo);",
      "const { data: u } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);",
      "const ids = Array.from(new Set(lista)).filter(Boolean); mapa.delete(chave);",
      'const { data: n } = await supabase.rpc("aluno_anotacoes" as never, args as never);',
      '// antes: await supabase.from("anexos").insert({ ... });',
      '/* await supabase.storage.from(B).remove([p]); */',
    ].join("\n");
    expect(gravacoesDiretas(fonte)).toEqual([]);
  });

  it("hml-19d: com a lista de tabelas, só elas contam (o nome não escrito conta por garantia; o Storage e as RPCs não são da área)", () => {
    const tabelas = AREAS.financeiro.tabelas!;
    expect(gravacoesDiretas('await principal.from("transacoes").insert({ valor: 1 });', tabelas)).toEqual(["1: tabela.insert"]);
    expect(gravacoesDiretas('const { error } = await principal.from("pacientes").update({ tags: nomes }).eq("id", id);', tabelas)).toEqual(["1: tabela.update"]);
    expect(gravacoesDiretas('await principal.from("mp_contas").update({ ativo: false }).eq("id", id);', tabelas)).toEqual([]);
    expect(gravacoesDiretas("await principal.from(TABELA).delete().eq(\"id\", id);", tabelas)).toEqual(["1: tabela.delete"]);
    expect(gravacoesDiretas("await principal.storage.from(BUCKET).upload(path, arquivo);", tabelas)).toEqual([]);
    expect(gravacoesDiretas('await principal.rpc("diario_enviar", { p_codigo: codigo });', tabelas)).toEqual([]);
    // sem a lista, como antes
    expect(gravacoesDiretas('await principal.from("mp_contas").update({ ativo: false });')).toEqual(["1: tabela.update"]);
  });
});

describe("hml-20c — o detector acha as 5 gravações de antes da Pré-consulta (controle positivo; base 5 → 0)", () => {
  it("o insert do formulário (com o .select().single() da volta), os 2 updates do formulário e os 2 da resposta", () => {
    const antes = [
      "const { data, error } = await principal\n      .from(\"formularios_preconsulta\")\n      .insert({\n        nutricionista_id: uid,\n        conta_id: contaId,\n      })\n      .select(\"*\")\n      .single();",
      'const { data, error } = await principal.from("formularios_preconsulta").update(dados).eq("id", id).select("*").single();',
      'const { error } = await principal.from("formularios_preconsulta").update({ deleted_at: new Date().toISOString() }).eq("id", id);',
      'const { data, error } = await principal.from("respostas_preconsulta").update(dados).eq("id", id).select(SELECT_RESPOSTA).single();',
      'const { error } = await principal.from("respostas_preconsulta").update({ deleted_at: new Date().toISOString() }).eq("id", id);',
    ].join("\n");
    expect(gravacoesDiretas(antes).map((a) => a.split(": ")[1])).toEqual(["tabela.insert", "tabela.update", "tabela.update", "tabela.update", "tabela.update"]);
    // o que a 20c põe no lugar não é gravação direta: a ação pela função
    expect(gravacoesDiretas('const { linha } = await acaoNutricao("preconsulta_resposta_ligar", { id, paciente_id: alunoId });')).toEqual([]);
  });
});

describe("hml-19a — as áreas migradas não gravam direto (base 0)", () => {
  it.each(Object.entries(AREAS))("%s: nenhuma gravação direta nas pastas da área", (_area, { pastas, base, fora = [], minimo = 31, tabelas }) => {
    const fontes = pastas.flatMap(fontesDa).filter((arq) => !fora.includes(relative(RAIZ, arq)));
    const achados = fontes.flatMap((arq) => gravacoesDiretas(readFileSync(arq, "utf-8"), tabelas).map((a) => `${relative(RAIZ, arq)}:${a}`));
    expect(achados.length, achados.join("\n")).toBe(base);
    // e a área tem código de verdade (a guarda não passa por não achar arquivo)
    expect(fontes.length).toBeGreaterThanOrEqual(minimo);
  });

  it("hml-19d: ninguém no src/ inteiro grava direto nas 4 tabelas do Financeiro (transacoes, recibos, modelos_recibo, categorias)", () => {
    const fontes = fontesDa("src");
    const achados = fontes.flatMap((arq) => gravacoesComONome(readFileSync(arq, "utf-8"), TABELAS_DO_FINANCEIRO).map((a) => `${relative(RAIZ, arq)}:${a}`));
    expect(achados, achados.join("\n")).toEqual([]);
    expect(fontes.length).toBeGreaterThan(500);
    // o detector acha o que procura
    expect(gravacoesComONome('await principal.from("recibos").update({ deleted_at: x }).eq("id", id);', TABELAS_DO_FINANCEIRO)).toEqual(["1: recibos.update"]);
    expect(gravacoesComONome('await principal.from(TABELA).insert({});', TABELAS_DO_FINANCEIRO)).toEqual([]);
  });

  it("hml-19b: os arquivos de fora existem e ainda gravam direto (a guarda não esconde nada além deles)", () => {
    for (const [area, { fora = [] }] of Object.entries(AREAS)) {
      for (const rel of fora) expect(gravacoesDiretas(readFileSync(resolve(RAIZ, rel), "utf-8")).length, `${area}: ${rel}`).toBeGreaterThan(0);
    }
  });
});
