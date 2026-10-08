import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// hml-08 (H-22) — o painel master fica só no site: no app, a conta master sai deste aparelho (logout local) e vê "Conta master:
// use o site"; no site, e para quem não é master, passa direto.
const h = vi.hoisted(() => ({
  site: true,
  usuario: null as null | { id: string; email: string },
  situacao: null as null | { master: boolean },
  isMaster: false,
  sair: null as unknown as ReturnType<typeof vi.fn>,
  abrir: null as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock("@/lib/plataforma", () => ({ BUILD_DO_APP: false, masterNesteAparelho: () => h.site }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: h.usuario, situacao: h.situacao, sair: h.sair }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ isMaster: h.isMaster }) }));
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "public", supabase: {} }));
vi.mock("@capacitor/browser", () => ({ Browser: { open: (...a: unknown[]) => h.abrir(...a) } }));

import { MasterSoNoSite } from "./MasterSoNoSite";

const TEXTO =
  "O painel master fica só no site physiqcalc.com.br (no computador ou no navegador do celular). Esta conta saiu do app neste aparelho. Para usar o app, entre com uma conta de aluno ou de profissional.";

function Onde() {
  return <output data-testid="onde">{useLocation().pathname}</output>;
}

function arvore() {
  return (
    <MemoryRouter initialEntries={["/painel"]}>
      <MasterSoNoSite>
        <div data-testid="app">o app</div>
      </MasterSoNoSite>
      <Onde />
    </MemoryRouter>
  );
}

function logar(papel: "master" | "master-treino" | "aluno") {
  h.usuario = { id: `u-${papel}`, email: `${papel}@teste.com` };
  h.situacao = papel === "master-treino" ? null : { master: papel === "master" };
  h.isMaster = papel === "master-treino";
}

const cartao = () => document.querySelector("[data-master-so-no-site]");

beforeEach(() => {
  h.site = true;
  h.usuario = null;
  h.situacao = null;
  h.isMaster = false;
  h.sair = vi.fn(async () => {});
  h.abrir = vi.fn(async () => {});
});

describe("MasterSoNoSite (hml-08)", () => {
  it("site + master: passa direto (o master abre no site) e não sai", () => {
    logar("master");
    render(arvore());
    expect(screen.getByTestId("app")).toBeInTheDocument();
    expect(cartao()).toBeNull();
    expect(h.sair).not.toHaveBeenCalled();
  });

  it("app + master: mostra o cartão e sai SÓ deste aparelho, 1 vez; o cartão fica depois que o login some; Entendi vai ao /entrar", () => {
    h.site = false;
    logar("master");
    const r = render(arvore());
    expect(screen.queryByTestId("app")).toBeNull();
    expect(screen.getByRole("heading", { name: "Conta master: use o site" })).toBeInTheDocument();
    expect(cartao()?.querySelector("p")?.textContent).toBe(TEXTO);
    expect(h.sair).toHaveBeenCalledTimes(1);
    expect(h.sair).toHaveBeenCalledWith({ escopo: "local" });
    // outro render com a trava ainda de pé (o sair não terminou): não sai de novo
    r.rerender(arvore());
    expect(h.sair).toHaveBeenCalledTimes(1);
    // o sair terminou: sem login, o aviso continua na tela
    h.usuario = null;
    h.situacao = null;
    r.rerender(arvore());
    expect(cartao()).not.toBeNull();
    expect(screen.queryByTestId("app")).toBeNull();
    expect(h.sair).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Entendi" }));
    expect(cartao()).toBeNull();
    expect(screen.getByTestId("app")).toBeInTheDocument();
    expect(screen.getByTestId("onde").textContent).toBe("/entrar");
  });

  it("app + papel admin|master do Treino (sem a situação do principal): também trava", () => {
    h.site = false;
    logar("master-treino");
    render(arvore());
    expect(cartao()).not.toBeNull();
    expect(h.sair).toHaveBeenCalledTimes(1);
    expect(h.sair).toHaveBeenCalledWith({ escopo: "local" });
  });

  it("Abrir o site: o /master do site do ambiente, pelo navegador do aparelho", () => {
    h.site = false;
    logar("master");
    render(arvore());
    fireEvent.click(screen.getByRole("button", { name: "Abrir o site" }));
    expect(h.abrir).toHaveBeenCalledWith({ url: "https://physiqcalc.com.br/master" });
    expect(cartao()).not.toBeNull();
  });

  it("app + aluno: passa direto e não sai", () => {
    h.site = false;
    logar("aluno");
    render(arvore());
    expect(screen.getByTestId("app")).toBeInTheDocument();
    expect(cartao()).toBeNull();
    expect(h.sair).not.toHaveBeenCalled();
  });

  it("app sem login: passa direto e não sai", () => {
    h.site = false;
    render(arvore());
    expect(screen.getByTestId("app")).toBeInTheDocument();
    expect(cartao()).toBeNull();
    expect(h.sair).not.toHaveBeenCalled();
  });
});
