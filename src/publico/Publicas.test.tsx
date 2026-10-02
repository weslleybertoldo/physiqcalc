import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Calculadora from "./Calculadora";
import Privacidade from "./Privacidade";

// Physiq W26 — as páginas públicas novas (C13, C63): /privacidade = /termos e /calculator, sem login, na marca Physiq.
const abrir = (no: React.ReactNode, caminho: string) => render(<MemoryRouter initialEntries={[caminho]}>{no}</MemoryRouter>);

describe("/privacidade e /termos (C13)", () => {
  it("política e termos do Physiq: as 7 seções, LGPD com Exportar/Excluir no Perfil e os 2 bancos", () => {
    abrir(<Privacidade />, "/privacidade");
    const secoes = [...document.querySelectorAll("[data-secao-privacidade]")].map((s) => s.getAttribute("data-secao-privacidade"));
    expect(secoes).toEqual(["quem-somos", "dados", "uso", "armazenamento", "direitos", "retencao", "termos"]);
    expect(screen.getByText("Política de Privacidade e Termos")).toBeInTheDocument();
    expect(document.body.textContent).toContain("Perfil › Exportar meus dados");
    expect(document.body.textContent).toContain("Perfil › Excluir minha conta");
    expect(document.body.textContent).toContain("sa-east-1");
    expect(document.body.textContent).not.toMatch(/PhysiqNutri|PhysiqCalc/);
    expect(document.querySelector("[data-pagina-privacidade]")?.getAttribute("data-rota")).toBe("privacidade");
  });

  it("/termos abre a mesma página já na parte dos termos", () => {
    const rolar = vi.fn();
    Element.prototype.scrollIntoView = rolar;
    abrir(<Privacidade />, "/termos");
    expect(document.querySelector("[data-pagina-privacidade]")?.getAttribute("data-rota")).toBe("termos");
    expect(rolar).toHaveBeenCalled();
  });
});

describe("/calculator (C63)", () => {
  it("sem login: composição corporal e comparativo; o PDF só com dado", () => {
    localStorage.clear();
    abrir(<Calculadora />, "/calculator");
    expect(screen.getByText("Calculadora de composição corporal")).toBeInTheDocument();
    expect((document.querySelector("[data-btn-pdf-composicao]") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Comparativo" }));
    expect(document.querySelector("[data-comparativo]")).not.toBeNull();
    expect((document.querySelector("[data-btn-pdf-comparativo]") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(document.querySelector('[data-campo-peso-lado="ref"]')!, { target: { value: "82" } });
    expect((document.querySelector("[data-btn-pdf-comparativo]") as HTMLButtonElement).disabled).toBe(false);
  });
});
