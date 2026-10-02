import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GraficoLinha } from "./GraficoLinha";

const janela = { inicio: "2026-04-01", fim: "2026-10-01" };
const pesos = [{ data: "2026-04-10", valor: 87 }, { data: "2026-06-14", valor: 84.2 }, { data: "2026-08-20", valor: 85.1 }];
const gorduras = [{ data: "2026-04-10", valor: 19.6 }, { data: "2026-06-14", valor: 17.8 }, { data: "2026-08-20", valor: 18.4 }];

describe("H5 — achado 9: a linha do % de gordura no gráfico (só quando pedida)", () => {
  it("sem a 2ª linha: o gráfico da tela 4, igual (o app)", () => {
    const { container } = render(<GraficoLinha pontos={pesos as never} janela={janela} />);
    expect(container.querySelector("[data-grafico-linha2]")).toBeNull();
    expect(container.querySelectorAll("path").length).toBe(2);
  });
  it("com a 2ª linha (o painel): tracejada, com os pontos, na própria escala", () => {
    const { container } = render(<GraficoLinha pontos={pesos as never} janela={janela} linha2={{ pontos: gorduras as never, cor: "#F59E0B" }} />);
    const g = container.querySelector("[data-grafico-linha2]")!;
    expect(g.getAttribute("data-grafico-linha2")).toBe("3");
    expect(g.querySelector("path")!.getAttribute("stroke-dasharray")).toBe("5 4");
    expect(g.querySelectorAll("circle").length).toBe(3);
  });
  it("menos de 2 valores de gordura: não desenha a 2ª linha", () => {
    const { container } = render(<GraficoLinha pontos={pesos as never} janela={janela} linha2={{ pontos: gorduras.slice(0, 1) as never, cor: "#F59E0B" }} />);
    expect(container.querySelector("[data-grafico-linha2]")).toBeNull();
  });
});
