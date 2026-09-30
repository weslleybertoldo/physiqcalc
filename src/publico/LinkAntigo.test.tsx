import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { diarioNoPhysiq, enderecoDoDiario, normalizarCodigoDiario, secaoNoSiteAntigo, siteAntigoNutri } from "@/nucleo/siteAntigoNutri";
import { rotasDaPaginaPublica } from "@/rotas/registro";

import LinkAntigo from "./LinkAntigo";

describe("W14 (F1, R13) — o link do diário num lugar só", () => {
  it("hoje: o /d/ do site antigo do Nutri (prod ou staging, pelo schema); quando o /d/ do Physiq existir (W24), o dele", () => {
    expect(siteAntigoNutri("public")).toBe("https://nutri.physiqcalc.com.br");
    expect(siteAntigoNutri("staging")).toBe("https://physiqnutri-staging.vercel.app");
    expect(enderecoDoDiario(" ABC234xyz9 ", { schema: "public", temPagina: () => false })).toBe("https://nutri.physiqcalc.com.br/d/abc234xyz9");
    expect(enderecoDoDiario("abc", { schema: "staging", temPagina: () => false })).toBe("https://physiqnutri-staging.vercel.app/d/abc");
    expect(enderecoDoDiario("abc", { origem: "https://physiqcalc.com.br", temPagina: () => true })).toBe("https://physiqcalc.com.br/d/abc");
    expect(normalizarCodigoDiario("a/b?c=1")).toBe("abc1");
    expect(secaoNoSiteAntigo("p1", "consultas", "public")).toBe("https://nutri.physiqcalc.com.br/pacientes/p1/consultas");
  });
  it("as rotas públicas: /p/:codigo é o LinkAntigo e /d/:codigo será o Diario (W24, ainda não existe)", () => {
    expect(rotasDaPaginaPublica("LinkAntigo")).toEqual(["/p/:codigo"]);
    expect(rotasDaPaginaPublica("Diario")).toEqual(["/d/:codigo"]);
    expect(diarioNoPhysiq()).toBe(false);
  });
});

describe("W14 (F1) — /p/:codigo abre o diário", () => {
  const replace = vi.fn();
  const original = window.location;
  beforeEach(() => {
    replace.mockReset();
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, origin: "http://localhost:5173", replace } });
  });
  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: original });
  });
  it("vai para o /d/<código> que funciona hoje (site antigo) e mostra o link enquanto abre", () => {
    render(
      <MemoryRouter initialEntries={["/p/abc"]}>
        <Routes>
          <Route path="/p/:codigo" element={<LinkAntigo />} />
        </Routes>
      </MemoryRouter>,
    );
    const destino = enderecoDoDiario("abc");
    expect(destino).toMatch(/\/d\/abc$/);
    expect(replace).toHaveBeenCalledWith(destino);
    expect(screen.getByText("Abrindo o seu diário…")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir o diário" })).toHaveAttribute("href", destino);
  });
});
