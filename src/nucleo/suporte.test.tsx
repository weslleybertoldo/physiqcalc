import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ erro: "profissional", erroProfissional: "nao_profissional" }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ sair: async () => {} }) }));
// W2 da loja: a folha pergunta antes ao caminho do profissional ("nao_profissional" = só aluno → o de sempre; "profissional" = master)
vi.mock("@/painel/configuracoes/excluirConta/api", async (orig) => {
  const real = await orig<typeof import("@/painel/configuracoes/excluirConta/api")>();
  return {
    ...real,
    conferirExclusaoProfissional: async () => {
      throw new real.ErroExclusao(h.erroProfissional, h.erroProfissional === "profissional" ? { motivo: "master" } : {});
    },
  };
});
vi.mock("@/app-aluno/perfil/pecas/api", async (orig) => {
  const real = await orig<typeof import("@/app-aluno/perfil/pecas/api")>();
  return {
    ...real,
    conferirExclusao: async () => {
      throw new real.ErroPerfil(h.erro);
    },
    excluirMinhaConta: async () => ({ ok: true }),
  };
});

import { SheetExcluir } from "@/app-aluno/perfil/pecas/SheetExcluir";
import Privacidade from "@/publico/Privacidade";
import { CONTATO_SUPORTE, linkDoSuporte } from "./suporte";

// H4 (achado da revisão do Calc): o contato do suporte mora num lugar só — a página de privacidade e as telas que mandam "falar
// com o suporte" leem a MESMA constante — o contato que o Weslley escolheu em 02/10 (mudou de novo? 1 linha).
describe("H4 — o contato do suporte (constante única)", () => {
  it("o contato que o Weslley escolheu (02/10) e o link abre o e-mail com o assunto", () => {
    expect(CONTATO_SUPORTE).toBe("bertoldo.code@gmail.com");
    expect(linkDoSuporte("Excluir minha conta")).toBe("mailto:bertoldo.code@gmail.com?subject=Excluir%20minha%20conta");
  });
  it("a página de privacidade mostra o contato da constante", () => {
    render(<MemoryRouter useTransitions={false} initialEntries={["/privacidade"]}><Privacidade /></MemoryRouter>);
    expect(screen.getByText(new RegExp(`Contato: ${CONTATO_SUPORTE.replace(/[.]/g, "\\.")}\\.`))).toBeInTheDocument();
  });
  it("W2 da loja: o profissional que tenta excluir pelo app do aluno vê o caminho certo (painel › Configurações), sem excluir nada", async () => {
    h.erroProfissional = "nao_profissional";
    h.erro = "profissional";
    render(<MemoryRouter useTransitions={false}><SheetExcluir aberto aoMudar={() => {}} /></MemoryRouter>);
    expect(await screen.findByText(/a exclusão é feita no painel, em Configurações › Excluir minha conta/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Excluir no painel/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: CONTATO_SUPORTE })).toBeNull();
    expect(screen.queryByLabelText(/Para confirmar, digite/)).toBeNull();
  });
  it("o master continua recusado e a tela mostra o contato de verdade do suporte", async () => {
    h.erroProfissional = "profissional";
    render(<MemoryRouter useTransitions={false}><SheetExcluir aberto aoMudar={() => {}} /></MemoryRouter>);
    const link = await screen.findByRole("link", { name: CONTATO_SUPORTE });
    expect(link.getAttribute("href")).toBe(linkDoSuporte("Excluir minha conta"));
    expect(screen.queryByRole("button", { name: /Excluir no painel/ })).toBeNull();
    expect(screen.queryByLabelText(/Para confirmar, digite/)).toBeNull();
  });
  it("outra recusa (cobrança automática ligada) não mostra o suporte", async () => {
    h.erroProfissional = "nao_profissional";
    h.erro = "assinatura_ativa";
    render(<MemoryRouter useTransitions={false}><SheetExcluir aberto aoMudar={() => {}} /></MemoryRouter>);
    expect(await screen.findByRole("button", { name: /Abrir Pagamentos/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: CONTATO_SUPORTE })).toBeNull();
  });
});
