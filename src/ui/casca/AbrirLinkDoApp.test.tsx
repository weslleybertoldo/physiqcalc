import { useEffect } from "react";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Physiq H2 — no APK, o link do site que abriu o app (frio ou já aberto) leva à tela dele: com login, depois que a casca assentou;
// sem login, fica para a entrada (depois de entrar); nas Boas-vindas é esquecido; no site só é esquecido (a pessoa já está lá).
const h = vi.hoisted(() => ({
  nativo: true,
  sessao: { pronto: true, usuario: { id: "u1" } as null | { id: string }, situacao: { sem_nada: false } as null | { sem_nada: boolean }, erroSituacao: false },
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => h.nativo }, registerPlugin: () => ({}) }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));

import { AbrirLinkDoApp } from "./AbrirLinkDoApp";
import { _zerarParaTestes, destinoGuardado, guardarDestino, receberLink } from "@/lib/linksDoApp";

function Onde() {
  const l = useLocation();
  return <span data-testid="onde">{`${l.pathname}${l.search}`}</span>;
}
function montar(inicio = "/treino") {
  return render(
    <MemoryRouter useTransitions={false} initialEntries={[inicio]}>
      <AbrirLinkDoApp />
      <Routes>
        <Route path="*" element={<Onde />} />
      </Routes>
    </MemoryRouter>,
  );
}
const onde = () => screen.getByTestId("onde").textContent;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  sessionStorage.clear();
  _zerarParaTestes();
  h.nativo = true;
  h.sessao = { pronto: true, usuario: { id: "u1" }, situacao: { sem_nada: false }, erroSituacao: false };
});
afterEach(() => vi.useRealTimers());

describe("H2 — abrir o app NA tela do link", () => {
  it("app aberto (appUrlOpen): o link do e-mail da agenda leva à Agenda", () => {
    montar("/treino");
    act(() => {
      receberLink("https://physiqcalc.com.br/perfil/agenda");
    });
    expect(onde()).toBe("/treino"); // espera a casca assentar
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onde()).toBe("/perfil/agenda");
    expect(destinoGuardado()).toBeNull();
  });
  it("app fechado (getLaunchUrl antes da casca): ao montar com login, vai ao destino guardado", () => {
    guardarDestino("/dieta?ver=metas");
    montar("/");
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onde()).toBe("/dieta?ver=metas");
  });
  it("os redirecionamentos da abertura adiam a troca (a do link fica por último)", () => {
    guardarDestino("/perfil/agenda");
    // a casca manda o "/" para a aba de abertura 50 ms depois (quando os dados dela chegam)
    function AberturaAtrasada() {
      const navigate = useNavigate();
      useEffect(() => {
        const t = setTimeout(() => navigate("/treino", { replace: true }), 50);
        return () => clearTimeout(t);
      }, [navigate]);
      return <Onde />;
    }
    render(
      <MemoryRouter useTransitions={false} initialEntries={["/"]}>
        <AbrirLinkDoApp />
        <Routes>
          <Route path="/" element={<AberturaAtrasada />} />
          <Route path="*" element={<Onde />} />
        </Routes>
      </MemoryRouter>,
    );
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(onde()).toBe("/treino"); // o redirecionamento da abertura adiou a troca do link
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onde()).toBe("/perfil/agenda");
  });
  it("sem login: não navega e o destino fica para depois de entrar", () => {
    h.sessao = { pronto: true, usuario: null, situacao: null, erroSituacao: false };
    montar("/entrar");
    act(() => {
      receberLink("https://physiqcalc.com.br/perfil/agenda");
      vi.advanceTimersByTime(200);
    });
    expect(onde()).toBe("/entrar");
    expect(destinoGuardado()).toBe("/perfil/agenda");
  });
  it("logado ainda sem a situação: espera", () => {
    h.sessao = { pronto: true, usuario: { id: "u1" }, situacao: null, erroSituacao: false };
    montar("/");
    act(() => {
      receberLink("https://physiqcalc.com.br/perfil/agenda");
      vi.advanceTimersByTime(200);
    });
    expect(onde()).toBe("/");
    expect(destinoGuardado()).toBe("/perfil/agenda");
  });
  it("na entrada (a RotaEntrada leva ao destino), não interfere", () => {
    guardarDestino("/perfil/agenda");
    montar("/entrar/email");
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onde()).toBe("/entrar/email");
    expect(destinoGuardado()).toBe("/perfil/agenda");
  });
  it("conta sem nada (Boas-vindas): o destino é esquecido", () => {
    h.sessao = { pronto: true, usuario: { id: "u1" }, situacao: { sem_nada: true }, erroSituacao: false };
    guardarDestino("/perfil/agenda");
    montar("/boas-vindas");
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onde()).toBe("/boas-vindas");
    expect(destinoGuardado()).toBeNull();
  });
  it("já na tela do link: só esquece", () => {
    guardarDestino("/perfil/agenda");
    montar("/perfil/agenda");
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onde()).toBe("/perfil/agenda");
    expect(destinoGuardado()).toBeNull();
  });
  it("no site: não navega (a pessoa já está na página do link) e esquece o destino", () => {
    h.nativo = false;
    guardarDestino("/perfil/agenda");
    montar("/treino");
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onde()).toBe("/treino");
    expect(destinoGuardado()).toBeNull();
  });
  it("o link do profissional (?prof=) e a volta do Google não trocam de tela", () => {
    montar("/treino");
    act(() => {
      receberLink("https://physiqcalc.com.br/?prof=PROF-X");
      receberLink("com.bertoldo.physiqcalc://login-callback?code=abc");
      vi.advanceTimersByTime(200);
    });
    expect(onde()).toBe("/treino");
  });
});
