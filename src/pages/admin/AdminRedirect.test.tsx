import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useParams } from "react-router-dom";
import { describe, expect, it } from "vitest";
import AdminRedirect from "./AdminRedirect";
import AlunoViewPage from "./AlunoViewPage";

// mostra onde o redirect parou (rota da engrenagem)
const Sonda = () => {
  const { id } = useParams();
  const loc = useLocation();
  return <p data-testid="sonda">{`${loc.pathname}${loc.search}|${id}`}</p>;
};

const monta = (entrada: string) => render(
  <MemoryRouter initialEntries={[entrada]}>
    <Routes>
      <Route path="/admin" element={<AdminRedirect />} />
      <Route path="/admin/alunos" element={<p data-testid="lista">lista</p>} />
      <Route path="/admin/alunos/:id" element={<Sonda />} />
      <Route path="/admin/alunos/:id/ver" element={<AlunoViewPage />} />
    </Routes>
  </MemoryRouter>,
);

describe("o olho virou a aba Dados da engrenagem (pedido 18/09/2026)", () => {
  it("/admin?v=view&u=abc (link antigo) → /admin/alunos/abc?ct=dados", () => {
    monta("/admin?v=view&u=abc");
    expect(screen.getByTestId("sonda")).toHaveTextContent("/admin/alunos/abc?ct=dados|abc");
  });

  it("/admin/alunos/abc/ver (rota antiga do olho) → /admin/alunos/abc?ct=dados", () => {
    monta("/admin/alunos/abc/ver");
    expect(screen.getByTestId("sonda")).toHaveTextContent("/admin/alunos/abc?ct=dados|abc");
  });

  it("/admin?v=config&u=abc&ct=treino continua caindo na engrenagem com a aba pedida", () => {
    monta("/admin?v=config&u=abc&ct=treino");
    expect(screen.getByTestId("sonda")).toHaveTextContent("/admin/alunos/abc?ct=treino|abc");
  });

  it("?v=view sem id não quebra (cai na lista)", () => {
    monta("/admin?v=view");
    expect(screen.getByTestId("lista")).toBeInTheDocument();
  });
});
