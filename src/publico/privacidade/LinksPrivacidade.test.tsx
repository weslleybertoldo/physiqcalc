import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/distribuicao", () => ({ ehLoja: false, DISTRIBUICAO: "site" }));

import Privacidade from "../Privacidade";
import { LinksPrivacidade } from "./LinksPrivacidade";

// W3 da loja — os links da política dentro do app: abrem a página pública na mesma janela e o "Voltar" dela volta para a tela do app
function montar(inicio = "/perfil") {
  return render(
    <MemoryRouter initialEntries={[inicio]}>
      <Routes>
        <Route path="/perfil" element={<div data-tela-perfil><LinksPrivacidade /></div>} />
        <Route path="/privacidade" element={<Privacidade />} />
        <Route path="/termos" element={<Privacidade />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LinksPrivacidade — W3 da loja", () => {
  it("os 2 links: Política de privacidade (/privacidade) e Termos de uso (/termos)", () => {
    montar();
    expect(screen.getByRole("link", { name: "Política de privacidade" }).getAttribute("href")).toBe("/privacidade");
    expect(screen.getByRole("link", { name: "Termos de uso" }).getAttribute("href")).toBe("/termos");
    expect(screen.getByRole("navigation", { name: "Privacidade e termos" })).toBeInTheDocument();
  });

  it("tocar abre a política (com o Voltar do app) e o Voltar volta para a tela de onde veio", () => {
    montar();
    fireEvent.click(screen.getByRole("link", { name: "Política de privacidade" }));
    expect(document.querySelector("[data-pagina-privacidade]")?.getAttribute("data-rota")).toBe("privacidade");
    expect(document.querySelector("[data-voltar]")?.getAttribute("data-voltar")).toBe("app");
    fireEvent.click(screen.getByRole("button", { name: /Voltar/ }));
    expect(document.querySelector("[data-tela-perfil]")).not.toBeNull();
  });

  it("os termos abrem na mesma página, na parte dos termos", () => {
    Element.prototype.scrollIntoView = vi.fn();
    montar();
    fireEvent.click(screen.getByRole("link", { name: "Termos de uso" }));
    expect(document.querySelector("[data-pagina-privacidade]")?.getAttribute("data-rota")).toBe("termos");
  });
});
