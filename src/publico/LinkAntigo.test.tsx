import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { diarioNoPhysiq, enderecoDoDiario, normalizarCodigoDiario, origemDoDiario, secaoNoSiteAntigo, siteAntigoNutri } from "@/nucleo/siteAntigoNutri";
import { existe, rotasDaPaginaPublica } from "@/rotas/registro";

import LinkAntigo from "./LinkAntigo";

describe("W14 (F1, R13) — o link do diário num lugar só", () => {
  it("o site antigo do Nutri (prod ou staging, pelo schema) continua sabido; sem a página do Physiq, o /d/ era o de lá", () => {
    expect(siteAntigoNutri("public")).toBe("https://nutri.physiqcalc.com.br");
    expect(siteAntigoNutri("staging")).toBe("https://physiqnutri-staging.vercel.app");
    expect(enderecoDoDiario(" ABC234xyz9 ", { schema: "public", temPagina: () => false })).toBe("https://nutri.physiqcalc.com.br/d/abc234xyz9");
    expect(enderecoDoDiario("abc", { schema: "staging", temPagina: () => false })).toBe("https://physiqnutri-staging.vercel.app/d/abc");
    expect(normalizarCodigoDiario("a/b?c=1")).toBe("abc1");
    expect(secaoNoSiteAntigo("p1", "consultas", "public")).toBe("https://nutri.physiqcalc.com.br/pacientes/p1/consultas");
  });
  it("W24: a página /d/:codigo do Physiq existe (src/publico/Diario.tsx) — o link passa para ela SOZINHO (registro por convenção)", () => {
    expect(rotasDaPaginaPublica("LinkAntigo")).toEqual(["/p/:codigo"]);
    expect(rotasDaPaginaPublica("Diario")).toEqual(["/d/:codigo"]);
    expect(existe("publico", "Diario")).toBe(true);
    expect(diarioNoPhysiq()).toBe(true);
    expect(enderecoDoDiario("abc", { origem: "https://physiqcalc.com.br" })).toBe("https://physiqcalc.com.br/d/abc");
  });
  it("W24: a origem do link é o SITE do ambiente (no APK a página é https://localhost); no dev local, a própria origem", () => {
    expect(origemDoDiario("public", false, "https://localhost")).toBe("https://physiqcalc.com.br");
    expect(origemDoDiario("staging", false, "https://localhost")).toBe("https://physiqcalc-staging.vercel.app");
    expect(origemDoDiario("public", false, "https://physiqcalc.com.br")).toBe("https://physiqcalc.com.br");
    expect(origemDoDiario("staging", true, "http://localhost:5173")).toBe("http://localhost:5173");
    expect(origemDoDiario("public", true, "https://localhost")).toBe("https://physiqcalc.com.br");
    expect(enderecoDoDiario(" XYZ1234567 ", { schema: "public" })).toMatch(/\/d\/xyz1234567$/);
  });
});

describe("W14 (F1) + W24 — /p/:codigo abre o diário do Physiq", () => {
  const replace = vi.fn();
  const original = window.location;
  beforeEach(() => {
    replace.mockReset();
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, origin: "http://localhost:5173", replace } });
  });
  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: original });
  });
  it("vai para o /d/<código> DENTRO do Physiq (sem sair para o site antigo)", () => {
    render(
      <MemoryRouter initialEntries={["/p/ABC"]}>
        <Routes>
          <Route path="/p/:codigo" element={<LinkAntigo />} />
          <Route path="/d/:codigo" element={<p data-testid="diario">diário</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("diario")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
