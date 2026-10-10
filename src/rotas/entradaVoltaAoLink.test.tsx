import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Physiq H2 — sem login, o link do e-mail (ex.: /perfil/agenda) cai na entrada; depois de entrar, a pessoa volta à tela do link,
// mesmo quando a entrada perdeu a página que pediu o login (o "Entrar com e-mail e senha" e a volta do Google). A regra de
// sempre continua: conta sem nada vai às Boas-vindas; a página que pediu o login (que não seja a raiz) vence o destino guardado.
const h = vi.hoisted(() => ({
  sessao: { pronto: true, usuario: { id: "u1" } as null | { id: string }, situacao: { sem_nada: false } as null | Record<string, unknown>, erroSituacao: false },
}));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));

import { RotaEntrada } from "./Rotas";
import { esquecerDestino, guardarDestino } from "@/lib/linksDoApp";

function Onde() {
  const l = useLocation();
  return <span data-testid="onde">{`${l.pathname}${l.search}`}</span>;
}
function entrar(caminho: string, state?: unknown) {
  const r = render(
    <MemoryRouter useTransitions={false} initialEntries={[{ pathname: caminho, state }]}>
      <Routes>
        <Route path="/entrar" element={<RotaEntrada nome="Entrar" />} />
        <Route path="/entrar/email" element={<RotaEntrada nome="EntrarEmail" />} />
        <Route path="*" element={<Onde />} />
      </Routes>
    </MemoryRouter>,
  );
  const onde = screen.getByTestId("onde").textContent;
  r.unmount();
  return onde;
}

beforeEach(() => {
  localStorage.clear();
  h.sessao = { pronto: true, usuario: { id: "u1" }, situacao: { sem_nada: false }, erroSituacao: false };
});

describe("H2 — depois do login, a tela do link", () => {
  it("entrou pelo e-mail e senha (sem o state): vai ao destino do link", () => {
    guardarDestino("/perfil/agenda");
    expect(entrar("/entrar/email")).toBe("/perfil/agenda");
  });
  it("voltou do Google (a página recarregou, sem o state): vai ao destino do link", () => {
    guardarDestino("/perfil/agenda");
    expect(entrar("/entrar")).toBe("/perfil/agenda");
  });
  it("o APK abriu na raiz e o link guardou o destino: vai a ele (a raiz não conta como página pedida)", () => {
    guardarDestino("/dieta?ver=metas");
    expect(entrar("/entrar", { de: "/" })).toBe("/dieta?ver=metas");
  });
  it("a página que pediu o login vence o destino guardado", () => {
    guardarDestino("/perfil/agenda");
    expect(entrar("/entrar", { de: "/painel/alunos" })).toBe("/painel/alunos");
  });
  it("conta sem nada: Boas-vindas, como sempre", () => {
    h.sessao = { ...h.sessao, situacao: { sem_nada: true } };
    guardarDestino("/perfil/agenda");
    expect(entrar("/entrar")).toBe("/boas-vindas");
  });
  it("sem link nenhum: a regra de sempre (a página pedida ou o início)", () => {
    esquecerDestino();
    expect(entrar("/entrar")).toBe("/");
    expect(entrar("/entrar", { de: "/perfil" })).toBe("/perfil");
  });
});
