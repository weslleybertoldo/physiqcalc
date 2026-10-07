import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { conta } from "@/test/fixturesNucleo";
import { CONTATO_SUPORTE } from "@/nucleo/suporte";

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
  it("W2 da loja: Excluir minha conta abre com o painel travado — para o dono e para o membro — e a tela de plano vencido tem o atalho", () => {
    h.conta = conta({ situacao: "teste", teste_ate: "2026-09-28" });
    const r = montar(<GatePlano>{pagina}</GatePlano>, "/painel/configuracoes/excluir-conta");
    expect(screen.getByText("página do painel")).toBeInTheDocument();
    r.unmount();
    h.ehDono = false;
    h.conta = conta({ situacao: "suspensa", vence_em: "2027-01-01", papeis: ["personal"] });
    const r2 = montar(<GatePlano>{pagina}</GatePlano>, "/painel/configuracoes/excluir-conta");
    expect(screen.getByText("página do painel")).toBeInTheDocument();
    r2.unmount();
    montar(<GatePlano>{pagina}</GatePlano>, "/painel/alunos");
    expect(screen.getByRole("button", { name: /Excluir minha conta/ })).toBeInTheDocument();
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
  it("suspensa: 'Fale com o suporte', sem Pagar — H4: com o contato de verdade (a constante única do suporte)", () => {
    h.conta = conta({ situacao: "suspensa", vence_em: "2027-01-01" });
    montar(<GatePlano>{pagina}</GatePlano>);
    expect(screen.getByText("Conta suspensa")).toBeInTheDocument();
    expect(screen.getByText(/Fale com o suporte do Physiq:/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: CONTATO_SUPORTE });
    expect(link.getAttribute("href")).toMatch(new RegExp(`^mailto:${CONTATO_SUPORTE.replace(/[.]/g, "\\.")}\\?subject=`));
    expect(screen.queryByRole("button", { name: /Pagar agora/ })).toBeNull();
  });
  it("H4 (N-22): membro (não dono) de conta suspensa também vê a tela da suspensão no lugar do painel, com o contato", () => {
    h.ehDono = false;
    h.conta = conta({ situacao: "suspensa", vence_em: "2027-01-01", papeis: ["personal"], dono_nome: "Lucas Ferreira" });
    montar(<GatePlano>{pagina}</GatePlano>, "/painel/alunos");
    expect(screen.queryByText("página do painel")).toBeNull();
    expect(screen.getByText("Conta suspensa")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: CONTATO_SUPORTE })).toBeInTheDocument();
    // a suspensão não é "Fale com o dono" (o dono também não resolve): é o suporte
    expect(screen.queryByText("Fale com Lucas Ferreira.")).toBeNull();
  });
  it("H4: plano vencido NÃO mostra o contato do suporte (quem resolve é o dono, pagando)", () => {
    h.conta = conta({ situacao: "ativa", teste_ate: null, vence_em: "2026-09-20" });
    montar(<GatePlano>{pagina}</GatePlano>);
    expect(screen.queryByRole("link", { name: CONTATO_SUPORTE })).toBeNull();
  });
  it("legado com a cobrança antiga (cobranca_legada), isenta, em dia, conta do app e o master: não trava", () => {
    for (const c of [
      conta({ origem: "legado_calc", cobranca_legada: true, situacao: "vencida", vence_em: "2026-01-01" }),
      conta({ origem: "legado_nutri", cobranca_legada: true, situacao: "vencida", vence_em: "2026-01-01" }),
      conta({ situacao: "isenta", vence_em: "2020-01-01" }),
      conta({ situacao: "ativa", vence_em: "2026-10-30" }),
      conta({ origem: "app", situacao: "vencida", vence_em: "2026-01-01" }),
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

describe("GatePlano — W28: legada com cobranca_legada = false trava pelo núcleo", () => {
  it("legado Nutri vencido trava como a conta nova", () => {
    h.conta = conta({ origem: "legado_nutri", cobranca_legada: false, regras_legadas: true, plano: "nutricao", modulos: ["nutricao"],
      situacao: "ativa", teste_ate: null, vence_em: "2026-09-20" });
    montar(<GatePlano>{pagina}</GatePlano>);
    expect(screen.queryByText("página do painel")).toBeNull();
    expect(screen.getByText("Seu plano venceu em 20/09/2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pagar agora/ })).toBeInTheDocument();
  });
  it("legado Calc: abre nos 7 dias de tolerância; depois trava com 'venceu em' = o vencimento (sem os 7 dias)", () => {
    const calc = (vence: string) => conta({ origem: "legado_calc", cobranca_legada: false, regras_legadas: true, plano: "treino", modulos: ["treino"],
      situacao: "ativa", teste_ate: null, vence_em: vence, tolerancia_dias: 7 });
    h.conta = calc("2026-09-22"); // último dia com acesso = 29/09 (hoje)
    const r = montar(<GatePlano>{pagina}</GatePlano>);
    expect(screen.getByText("página do painel")).toBeInTheDocument();
    r.unmount();
    h.conta = calc("2026-09-21"); // acabou em 28/09
    montar(<GatePlano>{pagina}</GatePlano>);
    expect(screen.queryByText("página do painel")).toBeNull();
    expect(screen.getByText("Seu plano venceu em 21/09/2026")).toBeInTheDocument();
    expect(screen.getByText(/Os 7 dias de tolerância depois do vencimento acabaram/)).toBeInTheDocument();
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
  it("cartão recorrente, vencimento longe, legado com a cobrança antiga e master: sem faixa", () => {
    for (const c of [
      conta({ situacao: "ativa", teste_ate: null, vence_em: "2026-10-02", assinatura: { status: "authorized", proximo_vencimento: null, valor: 59.9 } }),
      conta({ situacao: "ativa", teste_ate: null, vence_em: "2026-10-20" }),
      conta({ origem: "legado_calc", cobranca_legada: true, situacao: "ativa", vence_em: "2026-10-01" }),
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

describe("FaixaAvisoPlano — W28: legado no núcleo (cobranca_legada = false)", () => {
  const calc = (o: Record<string, unknown> = {}) => conta({ origem: "legado_calc", cobranca_legada: false, regras_legadas: true, plano: "treino",
    modulos: ["treino"], situacao: "ativa", teste_ate: null, tolerancia_dias: 7, valor_mensal: 39.9, ...o });
  it("tolerância: 'pague até' urgente com Pagar; o X vale só hoje (a chave leva o dia)", () => {
    h.conta = calc({ vence_em: "2026-09-25" }); // venceu 25/09; o painel abre até 02/10
    const r = montar(<FaixaAvisoPlano>{pagina}</FaixaAvisoPlano>);
    expect(screen.getByText(/^Mensalidade de R\$\s?39,90 venceu em 25\/09\. Pague até 02\/10 para não perder o acesso\.$/)).toBeInTheDocument();
    expect(document.querySelector("[data-faixa-aviso-plano]")?.getAttribute("data-faixa-aviso-plano")).toBe("tolerancia");
    expect(document.querySelector("[data-faixa-aviso-plano]")?.className).toContain("border-rosa/35");
    expect(screen.getByRole("button", { name: "Pagar" })).toBeInTheDocument();
    expect(screen.getByText("página do painel")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fechar o aviso" }));
    expect(localStorage.getItem("aviso-plano:c1:2026-09-25:tolerancia:2026-09-29")).toBe("1");
    r.unmount();
    vi.setSystemTime(new Date("2026-09-30T15:00:00Z")); // no dia seguinte volta
    montar(<FaixaAvisoPlano>{pagina}</FaixaAvisoPlano>);
    expect(screen.getByText(/Pague até 02\/10/)).toBeInTheDocument();
  });
  it("tolerância para outro membro: 'Fale com <dono>' sem o Pagar", () => {
    h.ehDono = false;
    h.conta = calc({ vence_em: "2026-09-25", papeis: ["personal"], dono_nome: "Lucas Ferreira" });
    montar(<FaixaAvisoPlano>{pagina}</FaixaAvisoPlano>);
    expect(screen.getByText(/Pague até 02\/10 para não perder o acesso\. Fale com Lucas Ferreira\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pagar" })).toBeNull();
  });
  it("antes do vencimento os marcos contam do vence_em (−2 = 2 dias antes do vencimento, não do fim da tolerância)", () => {
    h.conta = calc({ vence_em: "2026-10-01" });
    montar(<FaixaAvisoPlano>{pagina}</FaixaAvisoPlano>);
    expect(screen.getByText(/Seu plano de R\$\s?39,90 vence em 2 dias \(01\/10\)/)).toBeInTheDocument();
  });
  it("legado Nutri no núcleo (sem tolerância): os mesmos marcos da conta nova", () => {
    h.conta = conta({ origem: "legado_nutri", cobranca_legada: false, regras_legadas: true, plano: "nutricao", modulos: ["nutricao"],
      situacao: "ativa", teste_ate: null, vence_em: "2026-09-30", tolerancia_dias: 0, valor_mensal: 80 });
    montar(<FaixaAvisoPlano>{pagina}</FaixaAvisoPlano>);
    expect(screen.getByText(/Seu plano de R\$\s?80,00 vence amanhã \(30\/09\)/)).toBeInTheDocument();
  });
});
