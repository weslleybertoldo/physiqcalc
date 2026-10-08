import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// hml-11 (H-28, D3/D4) — /privacidade, /termos e /assinatura com os textos legais novos (só no staging até a virada): o documento
// certo em cada rota, a versão, "Imprimir ou salvar em PDF", os links entre os 3, a faixa "em revisão" e o Voltar do app.
const h = vi.hoisted(() => ({ loja: false }));
vi.mock("@/lib/distribuicao", () => ({
  get ehLoja() {
    return h.loja;
  },
  get DISTRIBUICAO() {
    return h.loja ? "play" : "site";
  },
}));

import { ESTADO_ABERTA_PELO_APP } from "@/publico/privacidade/textos";
import PaginaLegal from "./PaginaLegal";
import { TITULO_RESUMO } from "./assinatura";
import { TITULO_ANEXO } from "./termos";
import { DATA_DOS_TEXTOS, VENDEDOR, VERSAO_TEXTOS } from "./versao";

let onde = "";
function Onde() {
  onde = useLocation().pathname;
  return <div data-fora-da-pagina-legal>{onde}</div>;
}

type Entrada = string | { pathname: string; state?: unknown; hash?: string };
function abrir(entrada: Entrada, antes: Entrada[] = []) {
  return render(
    <MemoryRouter initialEntries={[...antes, entrada]} initialIndex={antes.length}>
      <Routes>
        {["/privacidade", "/termos", "/assinatura"].map((caminho) => (
          <Route key={caminho} path={caminho} element={<PaginaLegal />} />
        ))}
        <Route path="*" element={<Onde />} />
      </Routes>
    </MemoryRouter>,
  );
}

const pagina = () => document.querySelector("[data-pagina-legal]");
const linksLegais = () => [...document.querySelectorAll("[data-pagina-legal] header [data-link-legal]")].map((a) => a.getAttribute("data-link-legal"));

beforeEach(() => {
  h.loja = false;
  onde = "";
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("PaginaLegal — os 3 documentos", () => {
  it.each([
    ["/privacidade", "politica", "Política de Privacidade do Physiq", "1. Quem somos e como falar conosco", ["termos", "assinatura"]],
    ["/termos", "termos", "Termos de Uso do Physiq", TITULO_ANEXO, ["politica", "assinatura"]],
    ["/assinatura", "assinatura", "Termos de assinatura do Physiq", TITULO_RESUMO, ["politica", "termos"]],
  ])("%s → %s: título, versão, texto e os links para os outros 2", (rota, doc, titulo, umTitulo, outros) => {
    abrir(rota);
    expect(pagina()?.getAttribute("data-pagina-legal")).toBe(doc);
    expect(pagina()?.getAttribute("data-versao")).toBe(VERSAO_TEXTOS);
    expect(screen.getByRole("heading", { level: 1, name: titulo })).toBeInTheDocument();
    expect(screen.getByText(`Versão de ${DATA_DOS_TEXTOS}`)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: umTitulo })).toBeInTheDocument();
    expect(pagina()?.textContent).toContain(VENDEDOR.nome);
    expect(linksLegais()).toEqual(outros);
  });

  it("a faixa 'em revisão' no topo, com o link da versão em vigor", () => {
    abrir("/termos");
    const faixa = document.querySelector("[data-texto-em-revisao]") as HTMLElement;
    expect(faixa).not.toBeNull();
    expect(faixa.textContent).toBe("Versão em revisão — ainda não publicada. A versão em vigor está em physiqcalc.com.br/privacidade.");
    expect(within(faixa).getByRole("link").getAttribute("href")).toBe("https://physiqcalc.com.br/privacidade");
    // a faixa vem antes do título
    expect(faixa.compareDocumentPosition(screen.getByRole("heading", { level: 1 })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("'Imprimir ou salvar em PDF' abre a impressão do navegador (Decreto 7.962/2013, art. 4º, IV)", () => {
    const imprimir = vi.spyOn(window, "print").mockImplementation(() => undefined);
    abrir("/assinatura");
    const botao = document.querySelector("[data-imprimir]") as HTMLElement;
    expect(botao.textContent).toBe("Imprimir ou salvar em PDF");
    fireEvent.click(botao);
    expect(imprimir).toHaveBeenCalledTimes(1);
    // o CSS de impressão esconde a casca e os botões
    expect(document.querySelector("[data-pagina-legal] style")?.textContent).toMatch(/@media print[\s\S]*\[data-casca="publico"\] > header/);
    expect(botao.closest(".print\\:hidden")).not.toBeNull();
  });

  it("o link para outro documento troca a página", () => {
    abrir("/privacidade");
    fireEvent.click(document.querySelector('[data-link-legal="assinatura"]') as HTMLElement);
    expect(pagina()?.getAttribute("data-pagina-legal")).toBe("assinatura");
    expect(screen.getByRole("heading", { level: 1, name: "Termos de assinatura do Physiq" })).toBeInTheDocument();
  });

  it("a tabela rola sozinha para o lado (a página não estoura no celular)", () => {
    abrir("/assinatura");
    const tabelas = [...document.querySelectorAll("[data-tabela-legal]")];
    expect(tabelas.length).toBe(2);
    for (const t of tabelas) {
      expect(t.className).toContain("overflow-x-auto");
      expect(t.querySelector("table")?.className).toMatch(/min-w-/);
    }
  });

  it("a Política da versão da Google Play não tem o GitHub; a do site tem", () => {
    abrir("/privacidade");
    expect(pagina()?.textContent).toContain("GitHub");
    h.loja = true;
    abrir("/privacidade");
    expect(document.querySelectorAll("[data-pagina-legal]")[1]?.textContent).not.toContain("GitHub");
  });

  it("abre na âncora do link (/termos#anexo-…)", () => {
    const rolar = vi.fn();
    Element.prototype.scrollIntoView = rolar;
    abrir({ pathname: "/termos", hash: "#anexo-acordo-de-tratamento-de-dados-profissional-e-physiq" });
    expect(rolar).toHaveBeenCalledTimes(1);
    expect((rolar.mock.contexts[0] as HTMLElement).textContent).toBe(TITULO_ANEXO);
  });
});

describe("PaginaLegal — o Voltar", () => {
  it("aberta pelo site: Voltar vai para o início", () => {
    abrir("/privacidade");
    const voltar = document.querySelector("[data-voltar]") as HTMLElement;
    expect(voltar.getAttribute("data-voltar")).not.toBe("app");
    expect(voltar.getAttribute("href")).toBe("/");
  });

  it("aberta pelo app: Voltar volta para a tela do app, mesmo depois de trocar de documento", () => {
    abrir({ pathname: "/privacidade", state: ESTADO_ABERTA_PELO_APP }, ["/perfil"]);
    expect(document.querySelector('[data-voltar="app"]')).not.toBeNull();
    // o link para os Termos leva o estado e troca a página no histórico
    fireEvent.click(document.querySelector('[data-link-legal="termos"]') as HTMLElement);
    expect(pagina()?.getAttribute("data-pagina-legal")).toBe("termos");
    const voltar = document.querySelector('[data-voltar="app"]') as HTMLElement;
    expect(voltar).not.toBeNull();
    fireEvent.click(voltar);
    expect(onde).toBe("/perfil");
  });
});
