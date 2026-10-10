import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// hml-17 (H-39): a guarda contra a volta da "consulta que falha e a tela diz nenhum/zero". Com a API caindo, o Perfil dizia
// "Você ainda não está com um profissional", os Pendentes "Nada esperando", a busca "Nada encontrado." e o /c/ "este link não vale
// mais" — a consulta falhava e a tela mostrava o vazio. Regra: toda `const X = useQuery(` de um .tsx lê o erro DAQUELA consulta
// (`X.isError`, `X.error` ou `X.status`; na desestruturação, `isError`/`error`/`status`) no mesmo arquivo — ou está na BASE abaixo,
// com o motivo (as NEUTRO e as LOCAL da triagem da spec da hml-17, §1.3.4: não afirmam nada falso com a falha). A base SÓ DIMINUI:
// consulta nova sem erro falha o teste; item da base que já lê o erro (ou sumiu) também — tire da base.
// A contagem é a mesma da medição da spec (130 consultas com variável nos .tsx, 43 sem ler o erro no 9313a50).

const SRC = resolve(__dirname, "..");
const RAIZ = resolve(SRC, "..");
const CONSULTA = /const\s+(\{[^}]*\}|[A-Za-z_$][\w$]*)\s*=\s*useQuery(?:<[^>]*>)?\(/g;

type Motivo = `NEUTRO: ${string}` | `LOCAL: ${string}`;
/** arquivo → consulta (o nome da variável; a desestruturação sem espaços) → motivo. */
const BASE: Record<string, Record<string, Motivo>> = {
  "src/nutricao/editor/secoes/Planejamento.tsx": { nomeQ: "NEUTRO: o nome da nutricionista no PDF (a falha vira o PDF sem o nome)" },
  "src/nutricao/editor/secoes/Suplementos.tsx": { perfilQ: "NEUTRO: o nome e o CRN no PDF" },
  "src/nutricao/prontuario/secoes/AvaliacaoIntegrada.tsx": { perfilQ: "NEUTRO: o nome e o CRN no PDF" },
  "src/nutricao/prontuario/secoes/Documentos.tsx": {
    profQ: "NEUTRO: o nome e o CRN no PDF — com a falha o atestado/receituário sai sem CRN (a função engole o erro): ⚪ no parecer",
  },
  "src/nutricao/prontuario/secoes/FarmacoNutrientes.tsx": { perfilQ: "NEUTRO: o nome e o CRN no PDF" },
  "src/nutricao/prontuario/secoes/Gestacional.tsx": { perfilQ: "NEUTRO: o nome e o CRN no PDF" },
  "src/painel/dietas/Receitas.tsx": { perfilQ: "NEUTRO: o nome e o CRN no PDF da receita" },
  "src/painel/aluno/Editores.tsx": { nomeQ: "NEUTRO: o nome da nutricionista no PDF" },
  "src/painel/paginas/Impressos.tsx": { perfilQ: "NEUTRO: o nome e o CRN nos impressos" },
  "src/app-aluno/perfil/pecas/RodapePerfil.tsx": { release: "NEUTRO: sem a versão nova do APK, o botão abre a página de downloads" },
  "src/master/alunos/MoverAlunosDialog.tsx": { det: "NEUTRO: master — sem a conta, o Mover fica desligado (ninguém é movido)" },
  "src/pages/master/BibliotecaPage.tsx": { nomesQ: "NEUTRO: master — os nomes dos donos dos exercícios ficam sem nome" },
  "src/painel/configuracoes/Recebimento.tsx": { consulta: "NEUTRO: o formulário fica no esqueleto (não afirma nada)" },
  "src/painel/gates/FaixaMensagensDesligadas.tsx": { q: "NEUTRO: a faixa só aparece com o dado (sem ele, nada)" },
  "src/painel/preconsulta/LigarAlunoDialog.tsx": { sugestaoQ: "NEUTRO: só a sugestão de aluno some; a busca manual segue" },
  "src/ui/avisos/AvisoMembroRemovido.tsx": { q: "NEUTRO: o aviso só aparece com o dado (a função devolve null na falha)" },
  "src/app-aluno/busca/BuscaApp.tsx": { "{data,isLoading}": "LOCAL: lê o SQLite do aparelho (PowerSync)" },
  "src/app-aluno/gates/GateBloqueioAluno.tsx": { "{data}": "LOCAL: o SQLite do aparelho; a situação do servidor cobre em parte" },
  "src/components/treinos/SeletorAcademia.tsx": {
    "{data:academias}": "LOCAL: o SQLite do aparelho — tocar num equipamento com a lista sem carregar regrava a lista só com ele: ⚪ no parecer",
  },
  "src/treino/ui/Historico.tsx": { "{data}": "LOCAL: o SQLite do aparelho", "{data:concluidos}": "LOCAL: o SQLite do aparelho" },
};

/** Os 5 do front.py (B14 consulta_sem_tratar_erro) e as 15 da triagem (D1–D13) que esta W corrigiu: nunca voltam para a base. */
const CORRIGIDAS: [string, string][] = [
  ["src/app-aluno/abas/Perfil.tsx", "perfil"], ["src/app-aluno/abas/Perfil.tsx", "agenda"], ["src/painel/alunos/Pendentes.tsx", "q"],
  ["src/painel/busca/Alunos.tsx", "r"], ["src/painel/busca/Alimentos.tsx", "r"], ["src/painel/busca/Treinos.tsx", "r"],
  ["src/master/contas/AcaoContaDialog.tsx", "tabela"],
  ["src/publico/Cadastro.tsx", "info"], ["src/painel/configuracoes/Recebimento.tsx", "pendentes"], ["src/app-aluno/perfil/Agenda.tsx", "regrasQ"],
  ["src/nutricao/editor/secoes/Planejamento.tsx", "calculosQ"], ["src/painel/aluno/Editores.tsx", "calculosQ"], ["src/treino/editor/Secoes.tsx", "praticado"],
  ["src/painel/alunos/NovoAluno.tsx", "convites"], ["src/painel/configuracoes/Aplicativo.tsx", "release"], ["src/painel/dietas/Diario.tsx", "alunosQ"],
  ["src/painel/treinos/Historico.tsx", "det"], ["src/treino/editor/Secoes.tsx", "det"], ["src/nutricao/editor/secoes/Planejamento.tsx", "q"],
  ["src/financeiro/ui/FinanceiroDoAluno.tsx", "categorias"], ["src/painel/treinos/MeusTreinos.tsx", "resumoBiblioteca"],
  ["src/master/app/TreinosProntos.tsx", "bib"],
];

function telas(): string[] {
  return (readdirSync(SRC, { recursive: true }) as string[])
    .filter((f) => /\.tsx$/.test(f) && !/\.(test|spec)\.tsx$/.test(f))
    .map((f) => join(SRC, f));
}

/** Cada consulta com variável: o arquivo (relativo à raiz), o nome e se o erro dela é lido. */
function consultas(): { arquivo: string; consulta: string; leErro: boolean }[] {
  const saida: { arquivo: string; consulta: string; leErro: boolean }[] = [];
  for (const caminho of telas()) {
    const texto = readFileSync(caminho, "utf-8");
    const arquivo = relative(RAIZ, caminho).replace(/\\/g, "/");
    for (const m of texto.matchAll(CONSULTA)) {
      const lhs = m[1];
      if (lhs.startsWith("{")) {
        const chaves = lhs.slice(1, -1).split(",").map((x) => x.split(":")[0].trim());
        saida.push({ arquivo, consulta: lhs.replace(/\s+/g, ""), leErro: chaves.some((c) => ["isError", "error", "status"].includes(c)) });
      } else {
        saida.push({ arquivo, consulta: lhs, leErro: new RegExp(`\\b${lhs.replace(/\$/g, "\\$")}\\.(isError|error|status)\\b`).test(texto) });
      }
    }
  }
  return saida;
}

describe("guarda (hml-17, H-39): toda consulta de tela lê o próprio erro", () => {
  const todas = consultas();
  const semErro = todas.filter((c) => !c.leErro);
  const naBase = (c: { arquivo: string; consulta: string }) => Boolean(BASE[c.arquivo]?.[c.consulta]);

  it("acha as consultas (o padrão de busca ainda pega o código)", () => {
    expect(todas.length).toBeGreaterThanOrEqual(120);
    expect(todas.some((c) => c.arquivo === "src/app-aluno/abas/Perfil.tsx" && c.consulta === "perfil")).toBe(true);
  });

  it("nenhuma consulta nova sem ler o erro (fora da base com o motivo)", () => {
    expect(semErro.filter((c) => !naBase(c)).map((c) => `${c.arquivo} › ${c.consulta}`)).toEqual([]);
  });

  it("a base só diminui: cada item ainda existe e ainda não lê o erro (corrigiu ou sumiu → tire da base)", () => {
    const vivos = new Set(semErro.map((c) => `${c.arquivo}|${c.consulta}`));
    const sobras = Object.entries(BASE).flatMap(([arquivo, mapa]) => Object.keys(mapa).map((consulta) => `${arquivo}|${consulta}`)).filter((k) => !vivos.has(k));
    expect(sobras).toEqual([]);
    expect(Object.values(BASE).reduce((n, m) => n + Object.keys(m).length, 0)).toBeLessThanOrEqual(21); // as 16 NEUTRO + as 5 LOCAL
  });

  it("os 5 do front.py e as 15 da triagem leem o erro e não estão na base", () => {
    for (const [arquivo, consulta] of CORRIGIDAS) {
      const c = todas.find((x) => x.arquivo === arquivo && x.consulta === consulta);
      expect(c, `${arquivo} › ${consulta} (a consulta existe)`).toBeDefined();
      expect(c?.leErro, `${arquivo} › ${consulta}`).toBe(true);
      expect(BASE[arquivo]?.[consulta], `${arquivo} › ${consulta} fora da base`).toBeUndefined();
    }
  });

  it("a regra do front.py (B14 consulta_sem_tratar_erro): nenhum .tsx com useQuery( sem tratar erro em lugar nenhum", () => {
    const sem = telas()
      .filter((caminho) => {
        const t = readFileSync(caminho, "utf-8");
        return /\buseQuery\(/.test(t) && !/isError|\berror\b|onError|throwOnError|ErrorBoundary/.test(t);
      })
      .map((caminho) => relative(RAIZ, caminho));
    expect(sem).toEqual([]);
  });
});
