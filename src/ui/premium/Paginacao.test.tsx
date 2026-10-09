import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Paginacao } from "./Paginacao";

const el = (c: HTMLElement, s: string) => c.querySelector(s) as HTMLElement | null;

describe("Paginacao (hml-14b, D13)", () => {
  it('"1–20 de 41", página 1 de 3: Anterior desligado, Próxima vai para a 2', () => {
    const aoMudar = vi.fn();
    const { container } = render(<Paginacao pagina={1} total={41} aoMudar={aoMudar} />);
    expect(el(container, "[data-paginacao-rotulo]")?.textContent).toBe("1–20 de 41");
    expect(el(container, "[data-paginacao-de]")?.textContent).toBe("página 1 de 3");
    expect(el(container, "[data-paginacao]")).toHaveAttribute("data-pagina", "1");
    expect(el(container, "[data-paginacao]")).toHaveAttribute("data-total", "41");
    expect(el(container, "[data-pagina-anterior]")).toBeDisabled();
    fireEvent.click(el(container, "[data-pagina-proxima]")!);
    expect(aoMudar).toHaveBeenCalledWith(2);
  });

  it("na última página a Próxima desliga e a Anterior volta uma", () => {
    const aoMudar = vi.fn();
    const { container } = render(<Paginacao pagina={3} total={41} aoMudar={aoMudar} />);
    expect(el(container, "[data-paginacao-rotulo]")?.textContent).toBe("41–41 de 41");
    expect(el(container, "[data-pagina-proxima]")).toBeDisabled();
    fireEvent.click(el(container, "[data-pagina-anterior]")!);
    expect(aoMudar).toHaveBeenCalledWith(2);
  });

  it("página além do total mostra a última", () => {
    const { container } = render(<Paginacao pagina={9} total={41} aoMudar={() => {}} />);
    expect(el(container, "[data-paginacao]")).toHaveAttribute("data-pagina", "3");
  });

  it("carregando: as setas esperam", () => {
    const { container } = render(<Paginacao pagina={2} total={41} aoMudar={() => {}} carregando />);
    expect(el(container, "[data-pagina-anterior]")).toBeDisabled();
    expect(el(container, "[data-pagina-proxima]")).toBeDisabled();
  });

  it('uma página só: fica o "1–N de N", sem setas', () => {
    const { container } = render(<Paginacao pagina={1} total={5} aoMudar={() => {}} />);
    expect(el(container, "[data-paginacao-rotulo]")?.textContent).toBe("1–5 de 5");
    expect(el(container, "[data-pagina-proxima]")).toBeNull();
    expect(el(container, "[data-pagina-anterior]")).toBeNull();
  });

  it("lista vazia: nada", () => {
    const { container } = render(<Paginacao pagina={1} total={0} aoMudar={() => {}} />);
    expect(container.innerHTML).toBe("");
  });

  it("nome da lista no data-paginacao (tela com 2 listas)", () => {
    const { container } = render(<Paginacao pagina={1} total={30} aoMudar={() => {}} nome="recibos" />);
    expect(el(container, '[data-paginacao="recibos"]')).not.toBeNull();
  });
});
