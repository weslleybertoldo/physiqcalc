import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { chaveDaPagina } from "./chaveDaPagina";
import { TransicaoDePagina } from "./TransicaoDePagina";

// hml-18a (H-40, E) — a transição de página: a página nova entra animada (fade + 8 px, 200 ms); a ABA dentro da mesma página troca
// sem remontar (o estado local fica — risco 7 da spec).

describe("chaveDaPagina", () => {
  it.each([
    ["/painel", "/painel"],
    ["/painel/", "/painel"],
    ["/painel/alunos", "/painel/alunos"],
    ["/painel/alunos/a1", "/painel/alunos/a1"],
    ["/painel/alunos/a1/treino", "/painel/alunos/a1"],
    ["/painel/alunos/a1/prontuario", "/painel/alunos/a1"],
    ["/painel/alunos/a1/editar", "/painel/alunos/a1/editar"],
    ["/painel/configuracoes", "/painel/configuracoes"],
    ["/painel/configuracoes/equipe", "/painel/configuracoes"],
    ["/painel/treinos", "/painel/treinos"],
    ["/", "/"],
    ["/treino", "/treino"],
    ["/perfil/agenda", "/perfil/agenda"],
    ["/master/app-do-aluno", "/master/app-do-aluno"],
  ])("%s → %s", (caminho, chave) => {
    expect(chaveDaPagina(caminho)).toBe(chave);
  });
});

function Contador() {
  const [n, setN] = useState(0);
  return <button type="button" onClick={() => setN((x) => x + 1)} data-testid="contador">{n}</button>;
}

function Ir({ para }: { para: string }) {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(para)}>{`ir ${para}`}</button>;
}

function montar() {
  return render(
    <MemoryRouter useTransitions={false} initialEntries={["/painel/alunos/a1"]}>
      <Ir para="/painel/alunos/a1/treino" />
      <Ir para="/painel/treinos" />
      <Routes>
        <Route element={<TransicaoDePagina><Outlet /></TransicaoDePagina>}>
          <Route path="/painel/alunos/:id/*" element={<><span>perfil</span><Contador /></>} />
          <Route path="/painel/treinos" element={<span>treinos</span>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("TransicaoDePagina (hml-18a)", () => {
  it("a página entra com a animação de entrada (fade + slide 8 px, 200 ms) e a chave da página", () => {
    montar();
    const pagina = document.querySelector("[data-pagina]")!;
    expect(pagina.getAttribute("data-pagina")).toBe("/painel/alunos/a1");
    for (const c of ["animate-in", "fade-in-0", "slide-in-from-bottom-2", "duration-200"]) expect(pagina.className).toContain(c);
  });

  it("trocar de ABA na mesma página não remonta (o mesmo nó e o estado local ficam)", () => {
    montar();
    const antes = document.querySelector("[data-pagina]");
    fireEvent.click(screen.getByTestId("contador"));
    fireEvent.click(screen.getByText("ir /painel/alunos/a1/treino"));
    expect(document.querySelector("[data-pagina]")).toBe(antes);
    expect(screen.getByTestId("contador").textContent).toBe("1");
  });

  it("trocar de PÁGINA remonta o invólucro (a entrada anima de novo)", () => {
    montar();
    const antes = document.querySelector("[data-pagina]");
    fireEvent.click(screen.getByText("ir /painel/treinos"));
    const depois = document.querySelector("[data-pagina]");
    expect(depois).not.toBe(antes);
    expect(depois?.getAttribute("data-pagina")).toBe("/painel/treinos");
    expect(screen.getByText("treinos")).toBeInTheDocument();
  });
});
