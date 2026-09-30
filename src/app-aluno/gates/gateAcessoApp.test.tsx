import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { conta, matricula, situacao } from "@/test/fixturesNucleo";
import { gatesApp } from "@/rotas/registro";

const h = vi.hoisted(() => ({ sessao: {} as Record<string, unknown>, online: true }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));
vi.mock("@/ui/premium/useOnline", () => ({ useOnline: () => h.online }));

import GateAcessoApp from "./GateAcessoApp";
import { usePerfilReduzido } from "./pecas/modoReduzido";
import { acessoAppDesligado, TEXTO_ACESSO_APP, TITULO_ACESSO_APP } from "./pecas/acessoApp";

function OApp() {
  const r = usePerfilReduzido();
  return <div>{r ? `perfil reduzido: ${r.titulo}` : "o app"}</div>;
}
const montar = (caminho = "/") =>
  render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="*" element={<GateAcessoApp><OApp /></GateAcessoApp>} />
      </Routes>
    </MemoryRouter>,
  );

const recarregar = vi.fn(async () => null);
beforeEach(() => {
  h.sessao = { situacao: situacao({ matriculas: [matricula()] }), recarregarSituacao: recarregar, sair: vi.fn() };
  h.online = true;
  recarregar.mockClear();
});

describe("W14 (F2, R12) — GateAcessoApp: \"Seu acesso ao app está desligado\" (spec 9)", () => {
  it("acesso ao app desligado → o app fecha com a mensagem própria; Exportar/Excluir e Conferir de novo", () => {
    h.sessao.situacao = situacao({ matriculas: [matricula({ acesso_app: false })] });
    montar();
    expect(screen.getByText(TITULO_ACESSO_APP)).toBeInTheDocument();
    expect(screen.getByText(TEXTO_ACESSO_APP)).toBeInTheDocument();
    expect(screen.queryByText("o app")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Conferir de novo/ }));
    expect(recarregar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Exportar ou excluir meus dados/ }));
    expect(screen.getByText(`perfil reduzido: ${TITULO_ACESSO_APP}`)).toBeInTheDocument();
  });

  it("ligado (ou o servidor antigo sem o campo) → o app abre", () => {
    montar();
    expect(screen.getByText("o app")).toBeInTheDocument();
    h.sessao.situacao = situacao({ matriculas: [matricula({ acesso_app: true })] });
    montar();
    expect(screen.getAllByText("o app").length).toBe(2);
  });

  it("não se confunde com as outras travas: não fecha por bloqueio, e profissional/master nunca", () => {
    expect(acessoAppDesligado(situacao({ matriculas: [matricula({ bloqueada: true })] }))).toBe(false);
    expect(acessoAppDesligado(situacao({ contas: [conta()], matriculas: [matricula({ acesso_app: false })] }))).toBe(false);
    expect(acessoAppDesligado(situacao({ master: true, matriculas: [matricula({ acesso_app: false })] }))).toBe(false);
    expect(acessoAppDesligado(null)).toBe(false);
  });

  it("2 matrículas (P7): uma com o acesso ligado mantém o app aberto; desativada não conta", () => {
    const duas = situacao({ matriculas: [matricula({ id: "a", acesso_app: false }), matricula({ id: "b", conta_id: "c2", acesso_app: true })] });
    expect(acessoAppDesligado(duas)).toBe(false);
    const umaDesativada = situacao({ matriculas: [matricula({ id: "a", acesso_app: false }), matricula({ id: "b", ativo: false, acesso_app: true })] });
    expect(acessoAppDesligado(umaDesativada)).toBe(true);
    // a bloqueada fica com a trava da W13; a outra (desligada) fecha pela W14
    const bloqueadaEDesligada = situacao({ matriculas: [matricula({ id: "a", bloqueada: true }), matricula({ id: "b", acesso_app: false })] });
    expect(acessoAppDesligado(bloqueadaEDesligada)).toBe(true);
  });

  it("vem logo depois das travas de bloqueio e antes da de pagamento", () => {
    const ordem = gatesApp.map((g) => g.nome);
    expect(ordem.indexOf("GateAcessoApp")).toBe(ordem.indexOf("GateBloqueioAluno") + 1);
    expect(ordem.indexOf("GateAcessoApp")).toBeLessThan(ordem.indexOf("GatePagamentoPendente"));
  });
});
