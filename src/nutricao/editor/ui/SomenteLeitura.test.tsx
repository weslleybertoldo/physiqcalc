import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { cliqueBarrado } from "@/nutricao/editor/lib/somenteLeitura";
import { SomenteLeitura } from "./SomenteLeitura";

function Secao({ aoPdf, aoNova, aoSoltar }: { aoPdf: () => void; aoNova: () => void; aoSoltar: () => void }) {
  const [mais, setMais] = useState(false);
  return (
    <div onDrop={aoSoltar}>
      <button type="button" onClick={aoNova}>Nova anamnese</button>
      <button type="button" onClick={aoPdf} data-leitura>PDF</button>
      <input aria-label="De" type="date" data-leitura />
      <input aria-label="Observação" />
      <div role="button" tabIndex={0} onClick={aoNova}>Editar (div)</div>
      <button type="button" data-leitura onClick={() => setMais(true)}>Ver</button>
      {mais && <button type="button" onClick={aoNova}>Excluir</button>}
    </div>
  );
}

describe("H5 — modo só leitura: trava o que grava, deixa o que é de ler (achado 1 do FIM-1b)", () => {
  it("PDF, Ver e o período ficam; Novo, Excluir e os campos travam — também o que nasce depois", async () => {
    const aoPdf = vi.fn();
    const aoNova = vi.fn();
    const aoSoltar = vi.fn();
    render(
      <SomenteLeitura data-dieta-leitura>
        <Secao aoPdf={aoPdf} aoNova={aoNova} aoSoltar={aoSoltar} />
      </SomenteLeitura>,
    );
    expect(screen.getByRole("button", { name: "Nova anamnese" })).toBeDisabled();
    expect(screen.getByLabelText("Observação")).toBeDisabled();
    expect(screen.getByRole("button", { name: "PDF" })).toBeEnabled();
    expect(screen.getByLabelText("De")).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    expect(aoPdf).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Editar (div)"));
    expect(aoNova).not.toHaveBeenCalled();
    // o "Ver" abre um detalhe com um botão de gravar: ele nasce travado
    fireEvent.click(screen.getByRole("button", { name: "Ver" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Excluir" })).toBeDisabled());
    // soltar um arquivo na área não chega na seção
    fireEvent.drop(screen.getByRole("button", { name: "PDF" }).parentElement!);
    expect(aoSoltar).not.toHaveBeenCalled();
  });
  it("o clique barrado: controle sem data-leitura sim; dentro de data-leitura ou texto, não", () => {
    document.body.innerHTML = `<div><button id="a">x</button><span data-leitura><button id="b">y</button></span><p id="c">texto</p></div>`;
    expect(cliqueBarrado(document.getElementById("a"))).toBe(true);
    expect(cliqueBarrado(document.getElementById("b"))).toBe(false);
    expect(cliqueBarrado(document.getElementById("c"))).toBe(false);
  });
});
