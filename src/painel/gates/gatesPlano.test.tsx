import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { conta } from "@/test/fixturesNucleo";

const h = vi.hoisted(() => ({ conta: null as unknown, ehDono: true, ehMaster: false }));
vi.mock("@/nucleo/conta", () => ({ useConta: () => ({ conta: h.conta, ehDono: h.ehDono, ehMaster: h.ehMaster }) }));

import GatePlano from "./GatePlano";
import FaixaAvisoPlano from "./FaixaAvisoPlano";

// relógio simulado (só o Date): hoje = 29/09/2026 no relógio de São Paulo
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-29T15:00:00Z"));
  localStorage.clear();
  h.ehDono = true;
  h.ehMaster = false;
});
afterEach(() => vi.useRealTimers());

function montar(el: React.ReactNode, caminho = "/painel/alunos") {
  return render(<MemoryRouter initialEntries={[caminho]}>{el}</MemoryRouter>);
}
const pagina = <div>página do painel</div>;

describe("GatePlano — conta nova: trava no dia seguinte ao vencimento (6.2)", () => {
  it("no dia do vencimento ainda abre; no dia seguinte trava com 'Pagar agora' para o dono", () => {
    h.conta = conta({ situacao: "ativa", teste_ate: null, vence_em: "2026-09-29" });
    const r = montar(<GatePlano>{pagina}</GatePlano>);
    expect(screen.getByText("página do painel")).toBeInTheDocument();
    r.unmount();
    h.conta = conta({ situacao: "ativa", teste_ate: null, vence_em: "2026-09-28" });
    montar(<GatePlano>{pagina}</GatePlano>);
    expect(screen.queryByText("página do painel")).toBeNull();
    expect(screen.getByText("Seu plano venceu em 28/09/2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pagar agora/ })).toBeInTheDocument();
    expect(screen.getByText(/Seus alunos continuam usando o app/)).toBeInTheDocument();
  });
  it("teste acabado trava; o dono abre a aba Plano para pagar", () => {
    h.conta = conta({ situacao: "teste", teste_ate: "2026-09-28" });
    montar(<GatePlano>{pagina}</GatePlano>, "/painel/configuracoes/plano");
    expect(screen.getByText("página do painel")).toBeInTheDocument();
  });
  it("outro membro vê 'Fale com <dono>' e não tem o Pagar (nem na aba Plano)", () => {
    h.ehDono = false;
    h.conta = conta({ situacao: "vencida", teste_ate: "2026-09-10", vence_em: null, papeis: ["personal"], dono_nome: "Lucas Ferreira" });
    montar(<GatePlano>{pagina}</GatePlano>, "/painel/configuracoes/plano");
    expect(screen.getByText("Fale com Lucas Ferreira.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pagar agora/ })).toBeNull();
  });
  it("suspensa: 'Fale com o suporte', sem Pagar", () => {
    h.conta = conta({ situacao: "suspensa", vence_em: "2027-01-01" });
    montar(<GatePlano>{pagina}</GatePlano>);
    expect(screen.getByText("Conta suspensa")).toBeInTheDocument();
    expect(screen.getByText("Fale com o suporte do Physiq.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pagar agora/ })).toBeNull();
  });
  it("legado, isenta, em dia e o master: não trava", () => {
    for (const c of [
      conta({ origem: "legado_calc", situacao: "vencida", vence_em: "2026-01-01" }),
      conta({ origem: "legado_nutri", situacao: "vencida", vence_em: "2026-01-01" }),
      conta({ situacao: "isenta", vence_em: "2020-01-01" }),
      conta({ situacao: "ativa", vence_em: "2026-10-30" }),
    ]) {
      h.conta = c;
      const r = montar(<GatePlano>{pagina}</GatePlano>);
      expect(screen.getByText("página do painel")).toBeInTheDocument();
      r.unmount();
    }
    h.ehMaster = true;
    h.conta = conta({ situacao: "vencida", vence_em: "2026-01-01" });
    montar(<GatePlano>{pagina}</GatePlano>);
    expect(screen.getByText("página do painel")).toBeInTheDocument();
  });
});

describe("FaixaAvisoPlano — −7, −2, −1 e 0 (6.2)", () => {
  it("5 dias antes: faixa com o valor e o Pagar; o X guarda aviso-plano:<conta>:<vence>:<marco>", () => {
    h.conta = conta({ situacao: "ativa", teste_ate: null, vence_em: "2026-10-04", valor_mensal: 59.9 });
    montar(<FaixaAvisoPlano>{pagina}</FaixaAvisoPlano>);
    expect(screen.getByText(/Seu plano de R\$\s?59,90 vence em 5 dias \(04\/10\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pagar" })).toBeInTheDocument();
    expect(screen.getByText("página do painel")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fechar o aviso" }));
    expect(screen.queryByText(/vence em 5 dias/)).toBeNull();
    expect(localStorage.getItem("aviso-plano:c1:2026-10-04:7")).toBe("1");
  });
  it("o marco fechado não volta; o próximo marco (−2) volta", () => {
    localStorage.setItem("aviso-plano:c1:2026-10-01:7", "1");
    h.conta = conta({ situacao: "ativa", teste_ate: null, vence_em: "2026-10-01" });
    montar(<FaixaAvisoPlano>{pagina}</FaixaAvisoPlano>);
    expect(screen.getByText(/vence em 2 dias/)).toBeInTheDocument();
  });
  it("fim do teste avisa com 'Escolher plano'; outro membro vê 'Fale com'", () => {
    h.conta = conta({ situacao: "teste", teste_ate: "2026-09-29" });
    const r = montar(<FaixaAvisoPlano>{pagina}</FaixaAvisoPlano>);
    expect(screen.getByText(/Seu teste grátis termina hoje/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Escolher plano" })).toBeInTheDocument();
    r.unmount();
    h.ehDono = false;
    montar(<FaixaAvisoPlano>{pagina}</FaixaAvisoPlano>);
    expect(screen.getByText(/Fale com Lucas/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Escolher plano" })).toBeNull();
  });
  it("cartão recorrente, vencimento longe, legado e master: sem faixa", () => {
    for (const c of [
      conta({ situacao: "ativa", teste_ate: null, vence_em: "2026-10-02", assinatura: { status: "authorized", proximo_vencimento: null, valor: 59.9 } }),
      conta({ situacao: "ativa", teste_ate: null, vence_em: "2026-10-20" }),
      conta({ origem: "legado_calc", situacao: "ativa", vence_em: "2026-10-01" }),
    ]) {
      h.conta = c;
      const r = montar(<FaixaAvisoPlano>{pagina}</FaixaAvisoPlano>);
      expect(document.querySelector("[data-faixa-aviso-plano]")).toBeNull();
      r.unmount();
    }
    h.ehMaster = true;
    h.conta = conta({ situacao: "ativa", teste_ate: null, vence_em: "2026-10-01" });
    montar(<FaixaAvisoPlano>{pagina}</FaixaAvisoPlano>);
    expect(document.querySelector("[data-faixa-aviso-plano]")).toBeNull();
  });
});
