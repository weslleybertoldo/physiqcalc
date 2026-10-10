import { useEffect, useState, type ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type NavigateFunction } from "react-router-dom";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { LegalSituacao, Situacao } from "@/nucleo/situacao";
import { situacao as fixture } from "@/test/fixturesNucleo";

// hml-12 (H-30, §4.2) — a porta do aceite: o invólucro do App.tsx (só no build de staging). Quem não aceitou a versão vigente vê a
// tela do aceite, e as rotas e os avisos globais nem montam; as públicas e a exclusão passam (sem os avisos); a trava de idade vale
// até sem internet.
const h = vi.hoisted(() => ({
  usuario: null as null | { id: string },
  situacao: null as unknown,
  carregando: false,
  online: true,
  aceitar: null as unknown as Mock<(...a: unknown[]) => unknown>,
  recarregar: null as unknown as Mock<(...a: unknown[]) => unknown>,
  sair: null as unknown as Mock<(...a: unknown[]) => unknown>,
  avisoMontou: 0,
  navegar: null as unknown as NavigateFunction,
}));

vi.mock("@/nucleo/sessao", () => ({
  useSessao: () => ({
    usuario: h.usuario,
    situacao: h.situacao,
    carregandoSituacao: h.carregando,
    sair: h.sair,
    recarregarSituacao: h.recarregar,
  }),
}));
vi.mock("@/ui/premium/useOnline", () => ({ useOnline: () => h.online }));
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "staging", supabase: {} }));
vi.mock("./api", () => ({ aceitarNoAcesso: (...a: unknown[]) => h.aceitar(...a) }));

import PortaDoAceite from "./PortaDoAceite";

const legal = (o: Partial<LegalSituacao> = {}): LegalSituacao => ({
  versao: "2026-10-08",
  aceite_pendente: false,
  saude_pendente: false,
  nascimento_pendente: false,
  menor: null,
  ...o,
});
const comLegal = (l: LegalSituacao | null | undefined): Situacao => fixture({ legal: l });

/** Um aviso global de mentira (o popup do ?prof=, "o Physiq mudou"…): conta quando monta. */
function AvisoFalso() {
  useEffect(() => {
    h.avisoMontou += 1;
  }, []);
  return <div data-testid="aviso" />;
}

/** Onde o app está (fora da porta) e o navigate para o teste trocar de rota mesmo com a porta na frente. */
function Onde() {
  const l = useLocation();
  h.navegar = useNavigate();
  return <output data-testid="onde">{`${l.pathname}${l.search}`}</output>;
}

/** Como o App.tsx monta: as rotas como filhos e os avisos globais à parte. */
const arvore = (rota: string, rotas: ReactNode = <div data-testid="app">o app</div>) => (
  <MemoryRouter useTransitions={false} initialEntries={[rota]}>
    <PortaDoAceite avisos={<AvisoFalso />}>{rotas}</PortaDoAceite>
    <Onde />
  </MemoryRouter>
);

function abrir(rota = "/") {
  const r = render(arvore(rota));
  /** a sessão trocou a situação (no app, o contexto renderiza de novo; aqui, o rerender com o h.situacao novo) */
  const deNovo = () => r.rerender(arvore(rota));
  return { ...r, deNovo };
}

const tela = () => document.querySelector("[data-aceite-no-acesso]");
const onde = () => screen.getByTestId("onde").textContent;

/** Imita o Perfil do aluno (Perfil.tsx): com ?excluir=1 abre a folha de exclusão e apaga o ?excluir da URL ao abrir. */
function PerfilFalso() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const [folha] = useState(() => new URLSearchParams(search).get("excluir") === "1");
  useEffect(() => {
    if (new URLSearchParams(search).has("excluir")) navigate({ pathname: "/perfil", search: "" }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na abertura, como o Perfil
  }, []);
  return <div data-testid="perfil">{folha && <div data-testid="folha-excluir">Excluir minha conta</div>}</div>;
}

/** Imita a /excluir-conta com login (ExcluirConta.tsx): leva direto à tela de exclusão do aluno. */
function ExcluirContaComLogin() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/perfil?excluir=1", { replace: true });
  }, [navigate]);
  return null;
}

const rotasDoPerfil = (
  <Routes>
    <Route path="/perfil" element={<PerfilFalso />} />
    <Route path="/excluir-conta" element={<ExcluirContaComLogin />} />
    <Route path="*" element={<div data-testid="app">o app</div>} />
  </Routes>
);

beforeEach(() => {
  h.usuario = { id: "u1" };
  h.situacao = comLegal(legal());
  h.carregando = false;
  h.online = true;
  h.avisoMontou = 0;
  h.aceitar = vi.fn();
  h.recarregar = vi.fn(async () => null);
  h.sair = vi.fn(async () => {});
});

describe("PortaDoAceite (hml-12)", () => {
  it("sem `legal` (servidor antigo, cache de antes), desligado ou sem login: os filhos", () => {
    h.situacao = comLegal(undefined);
    const r = abrir();
    expect(screen.getByTestId("app")).toBeInTheDocument();
    expect(tela()).toBeNull();
    r.unmount();

    h.situacao = comLegal(legal({ versao: null }));
    const r2 = abrir();
    expect(screen.getByTestId("app")).toBeInTheDocument();
    r2.unmount();

    h.usuario = null;
    h.situacao = comLegal(legal({ aceite_pendente: true }));
    abrir();
    expect(screen.getByTestId("app")).toBeInTheDocument();
    expect(tela()).toBeNull();
  });

  it("nada pendente: os filhos e os avisos globais montam", () => {
    abrir("/treino");
    expect(screen.getByTestId("app")).toBeInTheDocument();
    expect(h.avisoMontou).toBe(1);
  });

  it("aceite pendente: a tela do aceite, e as rotas e os avisos globais NÃO montam", () => {
    h.situacao = comLegal(legal({ aceite_pendente: true }));
    abrir("/painel");
    expect(tela()).not.toBeNull();
    expect(tela()?.getAttribute("data-aceite-no-acesso")).toBe("2026-10-08");
    expect(screen.queryByTestId("app")).toBeNull();
    expect(screen.queryByTestId("aviso")).toBeNull();
    expect(h.avisoMontou).toBe(0);
  });

  it.each(["/privacidade", "/termos", "/assinatura", "/perfil?excluir=1", "/painel/configuracoes/excluir-conta", "/excluir-conta", "/f/abcd2345"])(
    "%s passa com o aceite pendente (as públicas e a exclusão), sem os avisos globais",
    (rota) => {
      h.situacao = comLegal(legal({ aceite_pendente: true, menor: "menor_16" }));
      abrir(rota);
      expect(screen.getByTestId("app")).toBeInTheDocument();
      expect(tela()).toBeNull();
      expect(screen.queryByTestId("aviso")).toBeNull();
      expect(h.avisoMontou).toBe(0);
    },
  );

  it("rota livre: com pendência, só as rotas (o popup do ?prof=, 'o Physiq mudou'… esperam o aceite); sem pendência, os avisos montam", () => {
    for (const pendente of [legal({ aceite_pendente: true }), legal({ saude_pendente: true }), legal({ menor: "sem_responsavel" })]) {
      h.situacao = comLegal(pendente);
      const r = abrir("/termos");
      expect(screen.getByTestId("app")).toBeInTheDocument();
      expect(screen.queryByTestId("aviso")).toBeNull();
      r.unmount();
    }
    expect(h.avisoMontou).toBe(0);

    h.situacao = comLegal(legal());
    abrir("/termos");
    expect(screen.getByTestId("app")).toBeInTheDocument();
    expect(screen.getByTestId("aviso")).toBeInTheDocument();
    expect(h.avisoMontou).toBe(1);
  });

  it("aceitou na rota livre: os avisos montam junto, sem desmontar as rotas", async () => {
    h.situacao = comLegal(legal({ aceite_pendente: true }));
    const r = abrir("/termos");
    expect(screen.queryByTestId("aviso")).toBeNull();
    const app = screen.getByTestId("app");
    h.situacao = comLegal(legal());
    r.deNovo();
    await waitFor(() => expect(h.avisoMontou).toBe(1));
    expect(screen.getByTestId("app")).toBe(app);
  });

  it("Excluir minha conta com o aceite pendente: o Perfil apaga o ?excluir=1 ao abrir e a folha continua; saiu do /perfil, a porta volta", async () => {
    h.situacao = comLegal(legal({ aceite_pendente: true }));
    render(arvore("/perfil?excluir=1", rotasDoPerfil));
    await waitFor(() => expect(onde()).toBe("/perfil"));
    expect(screen.getByTestId("folha-excluir")).toBeInTheDocument();
    expect(tela()).toBeNull();
    expect(screen.queryByTestId("aviso")).toBeNull();

    // saiu para outra rota: a porta volta a valer
    act(() => void h.navegar("/treino"));
    expect(tela()).not.toBeNull();
    expect(screen.queryByTestId("perfil")).toBeNull();
    // e o /perfil sem o ?excluir=1 não passa mais
    act(() => void h.navegar("/perfil"));
    expect(tela()).not.toBeNull();
    expect(screen.queryByTestId("folha-excluir")).toBeNull();
  });

  it("a /excluir-conta com login leva ao /perfil?excluir=1, e a folha continua depois que o Perfil limpa a URL (a trava de idade também)", async () => {
    h.situacao = comLegal(legal({ menor: "menor_16" }));
    render(arvore("/excluir-conta", rotasDoPerfil));
    await waitFor(() => expect(onde()).toBe("/perfil"));
    expect(screen.getByTestId("folha-excluir")).toBeInTheDocument();
    expect(document.querySelector("[data-tela-menor]")).toBeNull();
  });

  it("a exclusão do painel continua livre enquanto a pessoa fica nela", () => {
    h.situacao = comLegal(legal({ aceite_pendente: true }));
    render(arvore("/painel/configuracoes/excluir-conta"));
    expect(screen.getByTestId("app")).toBeInTheDocument();
    act(() => void h.navegar("/painel"));
    expect(tela()).not.toBeNull();
  });

  it("/perfil sem excluir=1 e as Boas-vindas não passam", () => {
    h.situacao = comLegal(legal({ aceite_pendente: true }));
    const r = abrir("/perfil");
    expect(tela()).not.toBeNull();
    r.unmount();
    abrir("/boas-vindas");
    expect(tela()).not.toBeNull();
  });

  it("pendente sem internet: o app abre (D9); a situação carregando: a tela de carregar", () => {
    h.situacao = comLegal(legal({ aceite_pendente: true, saude_pendente: true }));
    h.online = false;
    const r = abrir();
    expect(screen.getByTestId("app")).toBeInTheDocument();
    r.unmount();

    h.online = true;
    h.carregando = true;
    abrir();
    expect(document.querySelector("[data-carregando-tela]")).not.toBeNull();
    expect(screen.queryByTestId("app")).toBeNull();
    expect(tela()).toBeNull();
  });

  it("a trava de idade: menor_16 e sem_responsavel, até sem internet; o app não monta", () => {
    h.situacao = comLegal(legal({ menor: "menor_16" }));
    const r = abrir();
    expect(document.querySelector('[data-tela-menor="menor_16"]')).not.toBeNull();
    expect(screen.getByRole("heading", { name: "O Physiq é para quem tem 16 anos ou mais" })).toBeInTheDocument();
    expect(screen.queryByTestId("app")).toBeNull();
    r.unmount();

    h.situacao = comLegal(legal({ menor: "sem_responsavel" }));
    h.online = false;
    abrir("/treino");
    expect(document.querySelector('[data-tela-menor="sem_responsavel"]')).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Falta a autorização do seu responsável" })).toBeInTheDocument();
    expect(screen.queryByTestId("app")).toBeNull();
    // a trava tem o Sair (o da TelaTrava) e o Excluir minha conta
    fireEvent.click(document.querySelector("[data-trava-sair]")!);
    expect(h.sair).toHaveBeenCalled();
    expect(document.querySelector("[data-tela-menor] [data-aceite-excluir]")?.getAttribute("href")).toBe("/perfil?excluir=1");
    // sem internet não há o que conferir
    expect(document.querySelector("[data-tela-menor-conferir]")).toBeNull();
  });

  it("a trava de idade: 'Conferir de novo' recarrega a situação; o profissional registrou o responsável → o app abre", () => {
    h.situacao = comLegal(legal({ menor: "sem_responsavel" }));
    const liberada = comLegal(legal());
    h.recarregar.mockImplementation(async () => {
      h.situacao = liberada;
      return liberada;
    });
    const r = abrir("/treino");
    const conferir = document.querySelector<HTMLButtonElement>("[data-tela-menor] [data-tela-menor-conferir]");
    expect(conferir?.textContent?.trim()).toBe("Conferir de novo");
    fireEvent.click(conferir!);
    expect(h.recarregar).toHaveBeenCalledTimes(1);
    r.deNovo();
    expect(screen.getByTestId("app")).toBeInTheDocument();
    expect(document.querySelector("[data-tela-menor]")).toBeNull();
  });

  it("aceitar → recarregarSituacao → os filhos (e os avisos) montam", async () => {
    h.situacao = comLegal(legal({ aceite_pendente: true }));
    const aceita = comLegal(legal());
    h.aceitar.mockResolvedValue({ ok: true, legal: legal() });
    h.recarregar.mockImplementation(async () => {
      h.situacao = aceita;
      return aceita;
    });
    abrir("/treino");
    fireEvent.click(document.querySelector("[data-aceite-caixa]")!);
    fireEvent.click(document.querySelector("[data-aceitar]")!);
    expect(await screen.findByTestId("app")).toBeInTheDocument();
    expect(h.recarregar).toHaveBeenCalledTimes(1);
    // o findBy pode voltar antes do efeito do aviso rodar: espera ele montar
    await waitFor(() => expect(h.avisoMontou).toBe(1));
    expect(tela()).toBeNull();
  });

  it("aceitou mas a recarga falhou: vale o `legal` que o banco devolveu (quem aceitou não fica preso)", async () => {
    h.situacao = comLegal(legal({ aceite_pendente: true }));
    h.aceitar.mockResolvedValue({ ok: true, legal: legal() });
    h.recarregar.mockResolvedValue(null);
    abrir();
    fireEvent.click(document.querySelector("[data-aceite-caixa]")!);
    fireEvent.click(document.querySelector("[data-aceitar]")!);
    expect(await screen.findByTestId("app")).toBeInTheDocument();
  });

  it("aceitou, a recarga falhou e a situação mudou por outro motivo (o spread do marcarAvisoMudanca): a tela do aceite não volta", async () => {
    const pendente = comLegal(legal({ aceite_pendente: true }));
    h.situacao = pendente;
    h.aceitar.mockResolvedValue({ ok: true, legal: legal() });
    h.recarregar.mockResolvedValue(null);
    const r = abrir();
    fireEvent.click(document.querySelector("[data-aceite-caixa]")!);
    fireEvent.click(document.querySelector("[data-aceitar]")!);
    expect(await screen.findByTestId("app")).toBeInTheDocument();

    // outro objeto de situação, com o MESMO `legal` (o spread): continua liberado
    h.situacao = { ...pendente, aviso_mudanca: { publico: "calc", ativo: true, titulo: null, texto: null, versao: "3.80", visto: true } };
    r.deNovo();
    expect(screen.getByTestId("app")).toBeInTheDocument();
    expect(tela()).toBeNull();

    // uma situação nova do banco (outro `legal`) volta a valer: ainda pendente → a tela do aceite
    h.situacao = comLegal(legal({ aceite_pendente: true }));
    r.deNovo();
    expect(tela()).not.toBeNull();
  });

  it("aceitou e o banco devolveu a trava: a tela da trava", async () => {
    h.situacao = comLegal(legal({ aceite_pendente: true }));
    h.aceitar.mockResolvedValue({ ok: true, legal: legal({ menor: "sem_responsavel" }) });
    abrir();
    fireEvent.click(document.querySelector("[data-aceite-caixa]")!);
    fireEvent.click(document.querySelector("[data-aceitar]")!);
    await waitFor(() => expect(document.querySelector('[data-tela-menor="sem_responsavel"]')).not.toBeNull());
    expect(screen.queryByTestId("app")).toBeNull();
  });
});
