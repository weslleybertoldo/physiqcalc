import { useState } from "react";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CAMPOS_EQUIVALENCIA_VAZIOS, camposDoExercicio, camposParaGravar, type CamposEquivalencia } from "../equivalencia";
import { FormExercicioBiblioteca } from "./FormExercicioBiblioteca";

describe("FormExercicioBiblioteca (biblioteca do master, do profissional e a W23)", () => {
  it("movimento (agrupado, o grupo do exercício primeiro), equipamento e variação; muda o valor", () => {
    const mudancas: CamposEquivalencia[] = [];
    function Casca() {
      const [v, setV] = useState<CamposEquivalencia>(CAMPOS_EQUIVALENCIA_VAZIOS);
      return (
        <FormExercicioBiblioteca
          valor={v}
          grupoMuscular="Bíceps / Braquial"
          aoMudar={(n) => {
            mudancas.push(n);
            setV(n);
          }}
        />
      );
    }
    render(<Casca />);
    const movimento = document.querySelector("[data-campo-movimento]") as HTMLSelectElement;
    expect(movimento.querySelector("optgroup")?.getAttribute("label")).toBe("Bíceps");
    fireEvent.change(movimento, { target: { value: "rosca_martelo" } });
    fireEvent.change(document.querySelector("[data-campo-equipamento]")!, { target: { value: "polia" } });
    fireEvent.change(document.querySelector("[data-campo-variacao]")!, { target: { value: "  corda " } });
    expect(mudancas.at(-1)).toEqual({ padrao_movimento: "rosca_martelo", equipamento: "polia", variacao: "  corda " });
    expect(camposParaGravar(mudancas.at(-1)!)).toEqual({ padrao_movimento: "rosca_martelo", equipamento: "polia", variacao: "corda" });
    fireEvent.change(movimento, { target: { value: "" } });
    expect(mudancas.at(-1)?.padrao_movimento).toBeNull();
    expect((document.querySelector("[data-campo-equipamento]") as HTMLSelectElement).options).toHaveLength(12);
  });

  it("valor fora das listas fixas não vai para o banco; vazio = null", () => {
    expect(camposDoExercicio({ padrao_movimento: "rosca_inventada", equipamento: "trampolim", variacao: "   " })).toEqual(CAMPOS_EQUIVALENCIA_VAZIOS);
    expect(camposDoExercicio(null)).toEqual(CAMPOS_EQUIVALENCIA_VAZIOS);
    expect(camposDoExercicio({ padrao_movimento: "supino_reto", equipamento: "halteres", variacao: null })).toEqual({ padrao_movimento: "supino_reto", equipamento: "halteres", variacao: null });
  });

  it("somente leitura desliga os campos", () => {
    render(<FormExercicioBiblioteca valor={{ padrao_movimento: "remada", equipamento: "barra", variacao: null }} aoMudar={vi.fn()} somenteLeitura />);
    expect((document.querySelector("[data-form-equivalencia]") as HTMLFieldSetElement).disabled).toBe(true);
  });
});
