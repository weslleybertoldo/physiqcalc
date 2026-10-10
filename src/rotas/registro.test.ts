import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, Suspense, useEffect } from "react";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { existe, listar, montarGrupo, nomeDoArquivo, ordenar, registro, rotasDaEntrada, rotasDaPaginaPublica, slug, tela } from "./registro";

describe("registro por convenção (spec 11.1)", () => {
  it("nome do arquivo", () => {
    expect(nomeDoArquivo("/src/app-aluno/abas/Treino.tsx")).toBe("Treino");
    expect(nomeDoArquivo("/src/painel/contadores/Alunos.ts")).toBe("Alunos");
  });

  it("monta o grupo ignorando testes e arquivos que começam com _", () => {
    const carregar = () => Promise.resolve({ default: () => null });
    const g = montarGrupo({
      "/src/x/Treino.tsx": carregar,
      "/src/x/_Parte.tsx": carregar,
      "/src/x/Treino.test.tsx": carregar,
      "/src/x/Dieta.spec.tsx": carregar,
    });
    expect(Object.keys(g)).toEqual(["Treino"]);
    expect(g.Treino.caminho).toBe("/src/x/Treino.tsx");
  });

  it("hml-18a: a tela já baixada (a pré-carga) abre direto, sem suspender — nada de esqueleto nem da espera de ~300 ms do Suspense", async () => {
    const g = montarGrupo({ "/src/x/Treinos.tsx": () => Promise.resolve({ default: () => createElement("p", null, "a página") }) });
    await g.Treinos.carregar();
    render(createElement(Suspense, { fallback: createElement("p", null, "esqueleto") }, createElement(g.Treinos.Componente)));
    expect(screen.getByText("a página")).toBeInTheDocument(); // já no 1º render
    expect(screen.queryByText("esqueleto")).toBeNull();
  });

  it("hml-18a: a tela ainda não baixada suspende (o esqueleto) e aparece quando o pedaço chega; depois não remonta", async () => {
    let soltar!: () => void;
    const chegou = new Promise<void>((r) => { soltar = r; });
    let montagens = 0;
    function Pagina() {
      useEffect(() => { montagens += 1; }, []);
      return createElement("p", null, "a página");
    }
    const g = montarGrupo({ "/src/x/Agenda.tsx": () => chegou.then(() => ({ default: Pagina })) });
    const r = render(createElement(Suspense, { fallback: createElement("p", null, "esqueleto") }, createElement(g.Agenda.Componente)));
    expect(screen.getByText("esqueleto")).toBeInTheDocument();
    await act(async () => { soltar(); });
    expect(await screen.findByText("a página")).toBeInTheDocument();
    r.rerender(createElement(Suspense, { fallback: createElement("p", null, "esqueleto") }, createElement(g.Agenda.Componente, { outra: 1 })));
    expect(montagens).toBe(1); // o pedaço chegou no meio: a tela continua a mesma (não troca de componente)
  });

  it("ordena pela ordem conhecida; desconhecidos no fim, em ordem alfabética", () => {
    const itens = ["Zeta", "CardDieta", "Alfa", "CardTreino"].map((nome) => ({ nome }));
    expect(ordenar(itens, ["CardTreino", "CardDieta"]).map((i) => i.nome)).toEqual(["CardTreino", "CardDieta", "Alfa", "Zeta"]);
  });

  it("slug das rotas", () => {
    expect(slug("PreConsulta")).toBe("pre-consulta");
    expect(slug("Pagamentos")).toBe("pagamentos");
    expect(slug("Aparência")).toBe("aparencia");
    expect(slug("EntrarEmail")).toBe("entrar-email");
  });

  it("rotas de entrada e das páginas públicas (4.8)", () => {
    expect(rotasDaEntrada("Entrar")).toBe("/entrar");
    expect(rotasDaEntrada("EntrarEmail")).toBe("/entrar/email");
    expect(rotasDaEntrada("BoasVindas")).toBe("/boas-vindas");
    expect(rotasDaPaginaPublica("Formulario")).toEqual(["/f/:slug"]);
    expect(rotasDaPaginaPublica("Diario")).toEqual(["/d/:codigo"]);
    expect(rotasDaPaginaPublica("Cadastro")).toEqual(["/c/:codigo"]);
    expect(rotasDaPaginaPublica("LinkAntigo")).toEqual(["/p/:codigo"]);
    expect(rotasDaPaginaPublica("Calculadora")).toEqual(["/calculator"]);
    expect(rotasDaPaginaPublica("Privacidade")).toEqual(["/privacidade", "/termos"]);
  });

  it("grupos existem (vazios até as worktrees entrarem) e as buscas não quebram", () => {
    for (const grupo of Object.keys(registro) as (keyof typeof registro)[]) {
      expect(typeof registro[grupo]).toBe("object");
    }
    // o layout das Configurações e o do público não viram "aba"/"página"
    expect(existe("abasConfig", "ConfiguracoesLayout")).toBe(false);
    expect(existe("publico", "PublicoLayout")).toBe(false);
    // hml-10 (D5): a página de teste das telas de erro (src/publico/ErroDeTeste.tsx) não entra pelo registro — ele a publicaria em
    // /erro-de-teste em todo build, produção inclusive; a rota /erro-teste é do Rotas.tsx, só no build de staging
    expect(existe("publico", "ErroDeTeste")).toBe(false);
    expect(tela("paginasPainel", "NaoExiste")).toBeNull();
    expect(listar("resumoAluno")).toEqual(expect.any(Array));
  });
});

// hml-16d (H-79): na vite 6 a exclusão "!/src/**/*.test.tsx" deixou de excluir (o glob roda a partir da pasta do padrão positivo):
// os testes entravam no bundle e os dos globs eager rodavam na abertura (tela preta). As exclusões ficam relativas ("!**/…").
describe("hml-16d — exclusões do glob do registro", () => {
  const fonte = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "registro.ts"), "utf8");
  it("nenhuma exclusão absoluta com ** ('!/src/**/…')", () => {
    expect(fonte).not.toMatch(/"!\/src\/\*\*\//);
  });
  it("os testes ficam de fora pelo padrão relativo", () => {
    expect(fonte).toMatch(/"!\*\*\/\*\.test\.tsx"/);
  });
});
