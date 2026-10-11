// Physiq hml-19a (H-41 · jeito 2, spec hml-19 §2.1 item 6) — a guarda contra a VOLTA da gravação direta do navegador nas áreas que já
// gravam pela função nutricao. Lê o código das pastas migradas (sem os comentários; os testes ficam de fora) e falha em:
//   · .from(…) seguido, no mesmo encadeamento, de .insert( · .update( · .upsert( · .delete(  (tabela);
//   · .storage.from(…).upload( · .remove( · .update( · .move( · .copy(                     (Storage — o PUT no link assinado,
//     uploadToSignedUrl, é o caminho certo e passa);
//   · .rpc("<uma das RPC_QUE_GRAVAM>")                                                     (src/integrations/repeticao.ts).
// Cada sub-worktree põe as pastas dela em AREAS, com a base (o que ainda grava direto e está aceito) — aqui, 0. hml-19b: a Dieta, as
// Dietas e o app do aluno (menos o que é de outra W: antropometrias.ts, da hml-19c, e o link público /d/:codigo, decisão 13).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RPC_QUE_GRAVAM } from "@/integrations/repeticao";
// o mesmo leitor sem comentários da guarda de CI (scripts/ci/checar-funcoes.mjs): o "image/*" de uma string não engole o arquivo
import { semComentarios } from "../../scripts/ci/checar-funcoes.mjs";

const RAIZ = resolve(__dirname, "../..");

/** As áreas migradas para o jeito 2 e o que ainda pode gravar direto em cada uma (a base só diminui); `fora` = arquivos de outra W. */
const AREAS: Record<string, { pastas: string[]; base: number; fora?: string[] }> = {
  // hml-19a: o Prontuário (as 18 tabelas e o bucket de anexos — a Pré-consulta usa as mesmas libs)
  prontuario: { pastas: ["src/nutricao/prontuario"], base: 0 },
  // hml-19b: a Dieta (as libs do editor), as Dietas (alimentos, receitas, diário da nutri) e o app do aluno (✓ e a foto do diário)
  dieta: {
    pastas: ["src/nutricao/editor/lib", "src/painel/dietas", "src/nutricao/app"],
    base: 0,
    fora: ["src/nutricao/editor/lib/antropometrias.ts", "src/painel/dietas/publico.ts"],
  },
};

const GRAVA_TABELA = /\.(insert|update|upsert|delete)\(/;
const GRAVA_STORAGE = /\.storage\s*\.from\(([^()]|\([^()]*\))*\)\s*\.(upload|remove|update|move|copy)\(/g;
const FROM_DE_TABELA = /(?<!\bArray)(?<!storage\s*)\.from\(/g;
const RPC = /\.rpc\(\s*["'`]([a-z0-9_]+)["'`]/g;

const linhaDe = (texto: string, pos: number) => texto.slice(0, pos).split("\n").length;

/** As gravações diretas de um código-fonte: "linha: o quê". */
export function gravacoesDiretas(fonte: string): string[] {
  const texto: string = semComentarios(fonte);
  const achados: string[] = [];
  for (const m of texto.matchAll(GRAVA_STORAGE)) achados.push(`${linhaDe(texto, m.index!)}: storage.${m[2]}`);
  for (const m of texto.matchAll(FROM_DE_TABELA)) {
    // o encadeamento: do .from( até o fim da instrução (;) ou o próximo .from(
    const depois = texto.slice(m.index! + m[0].length, m.index! + m[0].length + 1500);
    const fim = depois.search(/;|\.from\(/);
    const cadeia = fim === -1 ? depois : depois.slice(0, fim);
    const w = GRAVA_TABELA.exec(cadeia);
    if (w) achados.push(`${linhaDe(texto, m.index!)}: tabela.${w[1]}`);
  }
  for (const m of texto.matchAll(RPC)) if (RPC_QUE_GRAVAM.has(m[1])) achados.push(`${linhaDe(texto, m.index!)}: rpc.${m[1]}`);
  return achados;
}

function fontesDa(pasta: string): string[] {
  const saida: string[] = [];
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
    expect(gravacoesDiretas('await supabase.rpc("lixeira_apagar", { p_id: id });')).toEqual(["1: rpc.lixeira_apagar"]);
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
});

describe("hml-19a — as áreas migradas não gravam direto (base 0)", () => {
  it.each(Object.entries(AREAS))("%s: nenhuma gravação direta nas pastas da área", (_area, { pastas, base, fora = [] }) => {
    const fontes = pastas.flatMap(fontesDa).filter((arq) => !fora.includes(relative(RAIZ, arq)));
    const achados = fontes.flatMap((arq) => gravacoesDiretas(readFileSync(arq, "utf-8")).map((a) => `${relative(RAIZ, arq)}:${a}`));
    expect(achados.length, achados.join("\n")).toBe(base);
    // e a área tem código de verdade (a guarda não passa por não achar arquivo)
    expect(fontes.length).toBeGreaterThan(30);
  });

  it("hml-19b: os arquivos de fora existem e ainda gravam direto (a guarda não esconde nada além deles)", () => {
    for (const [area, { fora = [] }] of Object.entries(AREAS)) {
      for (const rel of fora) expect(gravacoesDiretas(readFileSync(resolve(RAIZ, rel), "utf-8")).length, `${area}: ${rel}`).toBeGreaterThan(0);
    }
  });
});
