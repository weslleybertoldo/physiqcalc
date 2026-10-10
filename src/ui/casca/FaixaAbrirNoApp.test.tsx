import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Physiq H2 — a faixa "Abrir no app Physiq" no navegador do Android: aparece nas páginas do aluno (e na entrada, quando a pessoa
// veio de um link delas), fecha e fica lembrado; não aparece no APK, no computador, no iPhone, no painel nem nas públicas.
const h = vi.hoisted(() => ({
  nativo: false,
  sessao: { pronto: true, usuario: null as null | { id: string } },
  casca: { carregando: false, ehProfissional: false },
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => h.nativo }, registerPlugin: () => ({}) }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));
vi.mock("@/ui/casca/dadosCasca", () => ({ useDadosCasca: () => h.casca }));

import { CHAVE_FAIXA_FECHADA, FaixaAbrirNoApp } from "./FaixaAbrirNoApp";
import { guardarDestino } from "@/lib/linksDoApp";

const ANDROID = "Mozilla/5.0 (Linux; Android 14; 21121210G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const DESKTOP = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
let ua = ANDROID;

function montar(caminho: string, state?: unknown) {
  return render(
    <MemoryRouter useTransitions={false} initialEntries={[{ pathname: caminho.split("?")[0], search: caminho.includes("?") ? `?${caminho.split("?")[1]}` : "", state }]}>
      <FaixaAbrirNoApp />
    </MemoryRouter>,
  );
}
const link = () => document.querySelector<HTMLAnchorElement>("[data-faixa-abrir-app-link]");

beforeEach(() => {
  localStorage.clear();
  h.nativo = false;
  h.sessao = { pronto: true, usuario: { id: "u1" } };
  h.casca = { carregando: false, ehProfissional: false };
  ua = ANDROID;
  vi.spyOn(window.navigator, "userAgent", "get").mockImplementation(() => ua);
});
afterEach(() => vi.restoreAllMocks());

describe("H2 — faixa \"Abrir no app Physiq\"", () => {
  it("Android, página do aluno: aparece com o intent:// da MESMA tela (e a página de baixar o APK sem o app)", () => {
    montar("/perfil/agenda");
    expect(screen.getByText("Abrir no app Physiq")).toBeInTheDocument();
    expect(link()!.getAttribute("href")).toBe(
      "intent://physiqcalc.com.br/perfil/agenda#Intent;scheme=https;package=com.bertoldo.physiqcalc;S.browser_fallback_url=https%3A%2F%2Fgithub.com%2Fweslleybertoldo%2Fphysiqcalc%2Freleases%2Flatest;end",
    );
  });
  it("leva a busca junto", () => {
    montar("/dieta?ver=metas");
    expect(link()!.getAttribute("href")).toContain("intent://physiqcalc.com.br/dieta?ver=metas#Intent;");
  });
  it("Fechar some e fica lembrado (não volta ao abrir de novo)", () => {
    const r = montar("/perfil/agenda");
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByText("Abrir no app Physiq")).toBeNull();
    expect(localStorage.getItem(CHAVE_FAIXA_FECHADA)).toBe("1");
    r.unmount();
    montar("/treino");
    expect(screen.queryByText("Abrir no app Physiq")).toBeNull();
  });
  it("na entrada, sem login, vinda do link: abre a tela do link no app", () => {
    h.sessao = { pronto: true, usuario: null };
    guardarDestino("/perfil/agenda");
    montar("/entrar");
    expect(link()!.getAttribute("href")).toContain("intent://physiqcalc.com.br/perfil/agenda#Intent;");
  });
  it("na entrada vinda da raiz com o código do profissional pendente: o ?prof= vai junto (o popup abre no app)", () => {
    h.sessao = { pronto: true, usuario: null };
    localStorage.setItem("physiq_prof_pendente", "PROF-LUCAS-FERREIRA");
    montar("/entrar", { de: "/" });
    expect(link()!.getAttribute("href")).toContain("intent://physiqcalc.com.br/?prof=PROF-LUCAS-FERREIRA#Intent;");
  });
  it("na entrada sem link nenhum: não aparece", () => {
    h.sessao = { pronto: true, usuario: null };
    montar("/entrar");
    expect(screen.queryByText("Abrir no app Physiq")).toBeNull();
  });
  it("não aparece no APK", () => {
    h.nativo = true;
    montar("/perfil/agenda");
    expect(screen.queryByText("Abrir no app Physiq")).toBeNull();
  });
  it("não aparece no computador", () => {
    ua = DESKTOP;
    montar("/perfil/agenda");
    expect(screen.queryByText("Abrir no app Physiq")).toBeNull();
  });
  it("não aparece no painel, no master nem nas páginas públicas", () => {
    for (const c of ["/painel", "/painel/agenda", "/master/contas", "/f/abc", "/d/abc", "/c/abc", "/p/abc", "/calculator", "/privacidade", "/termos"]) {
      const r = montar(c);
      expect(screen.queryByText("Abrir no app Physiq"), c).toBeNull();
      r.unmount();
    }
  });
  it("logado: espera a casca carregar (sem piscar no carregando)", () => {
    h.casca = { carregando: true, ehProfissional: false };
    montar("/perfil/agenda");
    expect(screen.queryByText("Abrir no app Physiq")).toBeNull();
  });
  it("profissional no \"/\" (a casca o manda ao painel): sem faixa; nas páginas de aluno dele, com faixa", () => {
    h.casca = { carregando: false, ehProfissional: true };
    let r = montar("/");
    expect(screen.queryByText("Abrir no app Physiq")).toBeNull();
    r.unmount();
    r = montar("/perfil/agenda");
    expect(screen.getByText("Abrir no app Physiq")).toBeInTheDocument();
    r.unmount();
    localStorage.setItem("physiq_area", "aluno"); // usou o app de aluno por último: o "/" abre o app
    montar("/");
    expect(link()!.getAttribute("href")).toContain("intent://physiqcalc.com.br/#Intent;");
  });
  it("espera a sessão (sem piscar antes de saber quem é)", () => {
    h.sessao = { pronto: false, usuario: null };
    montar("/perfil/agenda");
    expect(screen.queryByText("Abrir no app Physiq")).toBeNull();
  });
  it("sem armazenamento: aparece e fecha sem quebrar", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    montar("/perfil/agenda");
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByText("Abrir no app Physiq")).toBeNull();
  });
});
