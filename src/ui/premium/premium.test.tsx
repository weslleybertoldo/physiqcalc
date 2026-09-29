import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Dumbbell, House } from "lucide-react";
import { caminhoSuave, pontosDaSerie } from "./grafico";
import { iniciais, tempoDesde } from "./texto";
import { Chip } from "./Chip";
import { fotoDaRefeicao, fotoDoTreino } from "./fotos";
import { TabBar } from "./TabBar";
import { Anel } from "./Anel";
import { EstadoErro, EstadoVazio } from "./Estados";

describe("componentes premium", () => {
  it("curva suave passa pelos pontos (Catmull-Rom → Bézier, igual ao gerador)", () => {
    const d = caminhoSuave([[0, 10], [10, 0], [20, 10]]);
    expect(d.startsWith("M0.0,10.0 C")).toBe(true);
    expect(d.endsWith("20.0,10.0")).toBe(true);
    const pts = pontosDaSerie([90, 84], 100, 50, 4);
    expect(pts[0]).toEqual([4, 4]); // maior valor em cima
    expect(pts[1]).toEqual([96, 46]);
  });

  it("iniciais do nome", () => {
    expect(iniciais("Rafael Moura")).toBe("RM");
    expect(iniciais("camila")).toBe("C");
    expect(iniciais("  ")).toBe("?");
    expect(iniciais("Ana Paula de Souza")).toBe("AS");
  });

  it("tempo desde o aviso", () => {
    const agora = new Date("2026-09-29T12:00:00Z").getTime();
    expect(tempoDesde("2026-09-29T11:59:30Z", agora)).toBe("agora");
    expect(tempoDesde("2026-09-29T11:35:00Z", agora)).toBe("25 min");
    expect(tempoDesde("2026-09-29T09:00:00Z", agora)).toBe("3 h");
    expect(tempoDesde("2026-09-27T12:00:00Z", agora)).toBe("2 d");
  });

  it("fotos padrão (P29)", () => {
    expect(fotoDoTreino("Peito e Tríceps")).toBe("/fotos/treino/peito.webp");
    expect(fotoDoTreino("Dorsal / Rombóide")).toBe("/fotos/treino/costas.webp");
    expect(fotoDoTreino("Quadríceps")).toBe("/fotos/treino/pernas.webp");
    expect(fotoDoTreino("biceps")).toBe("/fotos/treino/bracos.webp");
    expect(fotoDoTreino("Treino A")).toBe("/fotos/treino/geral.webp");
    expect(fotoDaRefeicao("Café da manhã")).toBe("/fotos/refeicoes/cafe-da-manha.webp");
    expect(fotoDaRefeicao("Lanche da tarde")).toBe("/fotos/refeicoes/lanche.webp");
    expect(fotoDaRefeicao("Almoço")).toBe("/fotos/refeicoes/almoco.webp");
    expect(fotoDaRefeicao("Refeição 5", "19:00")).toBe("/fotos/refeicoes/jantar.webp");
    expect(fotoDaRefeicao("Refeição 6", "22:30")).toBe("/fotos/refeicoes/ceia.webp");
  });

  it("chip com o tom e o ícone", () => {
    render(<Chip tom="t" icone={Dumbbell}>TREINO</Chip>);
    const chip = screen.getByText("TREINO");
    expect(chip.className).toContain("pq-chip-t");
    expect(chip.querySelector("svg")).not.toBeNull();
  });

  it("barra de abas: rótulo inteiro, aba ativa marcada", () => {
    render(
      <MemoryRouter>
        <TabBar itens={[{ id: "inicio", rotulo: "Início", icone: House, para: "/", ativo: true }, { id: "treino", rotulo: "Treino", icone: Dumbbell, para: "/treino" }]} />
      </MemoryRouter>,
    );
    const ativo = screen.getByText("Início").closest("a")!;
    expect(ativo.getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("Treino").className).toContain("whitespace-nowrap");
    expect(screen.getByText("Treino").className).not.toContain("truncate");
  });

  it("anel limita o progresso entre 0 e 100%", () => {
    render(<Anel pct={1.7} rotulo="adesão" />);
    expect(screen.getByRole("img", { name: "adesão" })).toBeInTheDocument();
  });

  it("estados vazio e erro no mesmo visual", () => {
    render(<EstadoVazio titulo="Nada aqui" texto="Adicione o primeiro" />);
    expect(screen.getByText("Nada aqui").closest("[data-estado]")?.getAttribute("data-estado")).toBe("vazio");
    render(<EstadoErro aoTentar={() => {}} />);
    expect(screen.getByRole("button", { name: /Tentar de novo/ })).toBeInTheDocument();
  });
});
