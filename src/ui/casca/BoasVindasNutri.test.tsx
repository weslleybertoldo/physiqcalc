import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Physiq W28 — "O PhysiqNutri agora é o Physiq" para quem chegou do site antigo do Nutri (a marca do sessionStorage, posta pelo
// src/lib/origemNutri.ts antes do React Router): logado ou deslogado, leve nas páginas do paciente, fecha e não volta.
const h = vi.hoisted(() => ({
  nativo: false,
  sessao: { pronto: true, usuario: null as null | { id: string } },
  ultimoApk: vi.fn(async () => ({ version: "3.37", url: "https://github.com/weslleybertoldo/physiqcalc/releases/download/v3.37/physiq.apk" })),
  baixar: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => h.nativo }, registerPlugin: () => ({}) }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));
vi.mock("@/lib/apkRelease", () => ({
  RELEASES_PAGE: "https://github.com/weslleybertoldo/physiqcalc/releases/latest",
  ultimoApk: h.ultimoApk,
  baixarNoNavegador: h.baixar,
}));

import { BoasVindasNutri } from "./BoasVindasNutri";
import { NaoEncontrada } from "./NaoEncontrada";
import { CHAVE_NUTRI_FECHADA, CHAVE_VEIO_DO_NUTRI, veioDoNutri } from "@/lib/origemNutri";

const ANDROID = "Mozilla/5.0 (Linux; Android 14; 21121210G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const DESKTOP = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
let ua = DESKTOP;

function Onde() {
  const { pathname } = useLocation();
  return <output data-testid="onde">{pathname}</output>;
}

function montar(caminho: string) {
  return render(
    <MemoryRouter useTransitions={false} initialEntries={[caminho]}>
      <BoasVindasNutri />
      <Onde />
    </MemoryRouter>,
  );
}

const marcar = (caminho = "/dashboard") => sessionStorage.setItem(CHAVE_VEIO_DO_NUTRI, JSON.stringify({ caminho, em: 1 }));
const TITULO = "O PhysiqNutri agora é o Physiq";

beforeEach(() => {
  sessionStorage.clear();
  h.nativo = false;
  h.sessao = { pronto: true, usuario: null };
  h.ultimoApk.mockClear();
  h.baixar.mockClear();
  ua = DESKTOP;
  vi.spyOn(window.navigator, "userAgent", "get").mockImplementation(() => ua);
});
afterEach(() => vi.restoreAllMocks());

describe("W28 — tela 'O PhysiqNutri agora é o Physiq'", () => {
  it("sem a marca do Nutri: nada", () => {
    montar("/entrar");
    expect(screen.queryByText(TITULO)).toBeNull();
    expect(document.querySelector("[data-faixa-nutri]")).toBeNull();
  });

  it("deslogado: os 2 jeitos de entrar com a mesma conta + Continuar; o e-mail e senha leva a /entrar/email e fecha", () => {
    marcar();
    montar("/entrar");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(TITULO)).toBeInTheDocument();
    expect(screen.getByText("O PhysiqNutri e o PhysiqCalc viraram um app só: o Physiq.")).toBeInTheDocument();
    expect(screen.getByText("Seus pacientes, planos, agenda e dados continuam aqui.")).toBeInTheDocument();
    expect(screen.getByText("Entre com o mesmo e-mail e senha (ou o Google que você já usava).")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar com o Google" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continuar para o Physiq" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Entrar com o mesmo e-mail e senha" }));
    expect(screen.getByTestId("onde").textContent).toBe("/entrar/email");
    expect(screen.queryByText(TITULO)).toBeNull();
    expect(veioDoNutri()).toBeNull();
    expect(sessionStorage.getItem(CHAVE_NUTRI_FECHADA)).toBe("1");
  });

  it("deslogado: 'Entrar com o Google' leva ao /entrar (onde está o botão do Google)", () => {
    marcar();
    montar("/painel");
    fireEvent.click(screen.getByRole("button", { name: "Entrar com o Google" }));
    expect(screen.getByTestId("onde").textContent).toBe("/entrar");
    expect(screen.queryByText(TITULO)).toBeNull();
  });

  it("logado: 'Continuar para o Physiq' no lugar dos botões de entrar; fecha e não volta", () => {
    h.sessao = { pronto: true, usuario: { id: "u1" } };
    marcar();
    const r = montar("/painel");
    expect(document.querySelector("[data-boas-vindas-nutri]")?.getAttribute("data-boas-vindas-nutri")).toBe("logado");
    expect(screen.queryByRole("button", { name: "Entrar com o mesmo e-mail e senha" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Entrar com o Google" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continuar para o Physiq" }));
    expect(screen.queryByText(TITULO)).toBeNull();
    expect(screen.getByTestId("onde").textContent).toBe("/painel");
    r.unmount();
    montar("/painel");
    expect(screen.queryByText(TITULO)).toBeNull();
  });

  it("o X da folha também fecha (e apaga a marca)", () => {
    marcar();
    montar("/entrar");
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByText(TITULO)).toBeNull();
    expect(veioDoNutri()).toBeNull();
  });

  it("navegador do Android: 'Instalar o app Physiq' baixa o APK da última release", async () => {
    ua = ANDROID;
    marcar();
    montar("/entrar");
    fireEvent.click(screen.getByRole("button", { name: "Instalar o app Physiq" }));
    await waitFor(() => expect(h.baixar).toHaveBeenCalledWith("https://github.com/weslleybertoldo/physiqcalc/releases/download/v3.37/physiq.apk"));
    expect(screen.getByText(TITULO)).toBeInTheDocument(); // baixar não fecha a folha
  });

  it("sem a release (rede): abre a página de downloads", async () => {
    ua = ANDROID;
    h.ultimoApk.mockResolvedValueOnce(null as never);
    marcar();
    montar("/entrar");
    fireEvent.click(screen.getByRole("button", { name: "Instalar o app Physiq" }));
    await waitFor(() => expect(h.baixar).toHaveBeenCalledWith("https://github.com/weslleybertoldo/physiqcalc/releases/latest"));
  });

  it("dentro do APK e no computador: sem o 'Instalar o app Physiq'", () => {
    marcar();
    let r = montar("/entrar");
    expect(screen.queryByRole("button", { name: "Instalar o app Physiq" })).toBeNull();
    r.unmount();
    ua = ANDROID;
    h.nativo = true;
    r = montar("/entrar");
    expect(screen.getByText(TITULO)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Instalar o app Physiq" })).toBeNull();
  });

  it("páginas do paciente (/f, /d, /c, /p): faixa leve no topo; 'Saiba mais' abre a folha", () => {
    for (const c of ["/f/abc", "/d/abc", "/c/abc", "/p/abc"]) {
      marcar(c);
      const r = montar(c);
      expect(document.querySelector("[data-faixa-nutri]"), c).not.toBeNull();
      expect(screen.queryByRole("dialog"), c).toBeNull();
      r.unmount();
    }
    montar("/f/abc");
    fireEvent.click(screen.getByRole("button", { name: "Saiba mais" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(document.querySelector("[data-faixa-nutri]")).toBeNull();
  });

  it("o X da faixa fecha tudo (não volta na sessão)", () => {
    marcar("/f/abc");
    montar("/f/abc");
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(document.querySelector("[data-faixa-nutri]")).toBeNull();
    expect(sessionStorage.getItem(CHAVE_NUTRI_FECHADA)).toBe("1");
  });

  it("espera a sessão (sem piscar os botões errados antes de saber quem é)", () => {
    h.sessao = { pronto: false, usuario: null };
    marcar();
    montar("/entrar");
    expect(screen.queryByText(TITULO)).toBeNull();
  });
});

describe("W28 — Página não encontrada para quem veio do Nutri", () => {
  function rotas(caminho: string) {
    return render(
      <MemoryRouter useTransitions={false} initialEntries={[caminho]}>
        <Routes>
          <Route path="/" element={<div>início</div>} />
          <Route path="*" element={<NaoEncontrada />} />
        </Routes>
        <Onde />
      </MemoryRouter>,
    );
  }
  it("com a marca: vai para o '/' (Início ou Entrar) em vez do 404", () => {
    marcar("/algum/caminho/antigo");
    rotas("/algum/caminho/antigo");
    expect(screen.getByTestId("onde").textContent).toBe("/");
    expect(screen.getByText("início")).toBeInTheDocument();
    expect(document.querySelector("[data-nao-encontrada]")).toBeNull();
  });
  it("sem a marca: o 404 de sempre", () => {
    rotas("/nao-existe");
    expect(screen.getByText("Página não encontrada")).toBeInTheDocument();
    expect(screen.getByTestId("onde").textContent).toBe("/nao-existe");
  });
  it("no próprio '/' não faz laço", () => {
    marcar();
    render(
      <MemoryRouter useTransitions={false} initialEntries={["/"]}>
        <NaoEncontrada />
      </MemoryRouter>,
    );
    expect(screen.getByText("Página não encontrada")).toBeInTheDocument();
  });
});
