// Os 81 exercícios globais como o app os lê do SQLite, a partir da classificação revisada (docs/exercicios-equivalencia.csv) —
// para os testes da troca por equivalente (W9). Só testes importam este arquivo.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExercicioEquivalencia } from "@/treino/equivalencia";

/** CSV simples (vírgula, aspas duplas) — o formato do csv do Python. */
export function lerCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") {
      linha.push(campo);
      campo = "";
    } else if (c === "\n") {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else if (c !== "\r") campo += c;
  }
  if (campo || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas;
}

export const RAIZ_REPO = resolve(__dirname, "../..");
const [cabecalho, ...linhas] = lerCsv(readFileSync(resolve(RAIZ_REPO, "docs/exercicios-equivalencia.csv"), "utf8"));
export const CABECALHO_CSV = cabecalho;

export const CATALOGO_81: (ExercicioEquivalencia & { imagem_url: string | null; tipo: string })[] = linhas.map((l) => {
  const r = Object.fromEntries(cabecalho.map((k, i) => [k, l[i]]));
  return {
    id: r.id,
    nome: r.nome,
    grupo_muscular: r.grupo,
    subgrupo: r.subgrupo || null,
    padrao_movimento: r.padrao_movimento,
    equipamento: r.equipamento,
    variacao: r.variacao || null,
    imagem_url: null,
    tipo: r.nome === "Corrida" ? "corrida" : "musculacao",
  };
});

export function exercicio81(nome: string) {
  const e = CATALOGO_81.find((x) => x.nome === nome);
  if (!e) throw new Error(`não achei ${nome}`);
  return e;
}
