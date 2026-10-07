import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// W3 da loja: a política muda com a versão do build (o GitHub só fora da Google Play)
const h = vi.hoisted(() => ({ loja: false }));
vi.mock("@/lib/distribuicao", () => ({
  get ehLoja() {
    return h.loja;
  },
  get DISTRIBUICAO() {
    return h.loja ? "play" : "site";
  },
}));

import Calculadora from "./Calculadora";
import Privacidade from "./Privacidade";
import { ESTADO_ABERTA_PELO_APP, FRASE_BACKUPS, SERVICOS_TERCEIROS, servicosDaVersao } from "./privacidade/textos";

// Physiq W26 — as páginas públicas novas (C13, C63): /privacidade = /termos e /calculator, sem login, na marca Physiq.
const abrir = (no: React.ReactNode, caminho: string) => render(<MemoryRouter initialEntries={[caminho]}>{no}</MemoryRouter>);
const servicosNaTela = () => [...document.querySelectorAll("[data-servico]")].map((s) => s.getAttribute("data-servico"));

beforeEach(() => {
  h.loja = false;
});

describe("/privacidade e /termos (C13)", () => {
  it("política e termos do Physiq: as 8 seções, LGPD com Exportar/Excluir no Perfil e os 2 bancos", () => {
    abrir(<Privacidade />, "/privacidade");
    const secoes = [...document.querySelectorAll("[data-secao-privacidade]")].map((s) => s.getAttribute("data-secao-privacidade"));
    expect(secoes).toEqual(["quem-somos", "dados", "uso", "armazenamento", "terceiros", "direitos", "retencao", "termos"]);
    expect(screen.getByText("Política de Privacidade e Termos")).toBeInTheDocument();
    expect(document.body.textContent).toContain("Perfil › Exportar meus dados");
    expect(document.body.textContent).toContain("Perfil › Excluir minha conta");
    expect(document.body.textContent).toContain("sa-east-1");
    expect(document.body.textContent).not.toMatch(/PhysiqNutri|PhysiqCalc/);
    expect(document.querySelector("[data-pagina-privacidade]")?.getAttribute("data-rota")).toBe("privacidade");
  });

  it("/termos abre a mesma página já na parte dos termos", () => {
    const rolar = vi.fn();
    Element.prototype.scrollIntoView = rolar;
    abrir(<Privacidade />, "/termos");
    expect(document.querySelector("[data-pagina-privacidade]")?.getAttribute("data-rota")).toBe("termos");
    expect(rolar).toHaveBeenCalled();
  });
});

describe("/privacidade — W3 da loja (serviços de terceiros, saúde, backups)", () => {
  it("a data nova e os 9 serviços conferidos no código, cada um com o que recebe", () => {
    abrir(<Privacidade />, "/privacidade");
    // W4 da loja: a frase dos backups com o prazo entrou em 7/10/2026
    expect(document.querySelector("[data-atualizada-em]")?.textContent).toBe("Última atualização: 7 de outubro de 2026");
    expect(servicosNaTela()).toEqual(["supabase", "powersync", "cloudflare", "vercel", "google", "resend", "mercado-pago", "whatsapp", "github"]);
    const t = document.querySelector("[data-servicos-terceiros]")?.textContent ?? "";
    for (const nome of ["Supabase", "PowerSync", "Cloudflare", "Vercel", "Google", "Resend", "Mercado Pago", "WhatsApp", "GitHub"]) expect(t).toContain(nome);
    expect(t).toContain("Firebase Cloud Messaging");
    expect(t).toContain("Turnstile");
    expect(t).toMatch(/número do cartão é digitado no formulário do próprio Mercado Pago/);
    expect(t).toMatch(/sem empresa intermediária/);
    // o Play Billing ainda não existe (W6): nada de citá-lo
    expect(document.body.textContent).not.toMatch(/Billing|faturamento do Google/i);
    expect(document.body.textContent).toMatch(/Quem instala pela Google Play/);
  });

  it("os dados de saúde (LGPD art. 11), o aviso de não ser dispositivo médico e a frase dos backups com o prazo de 30 dias (W4)", () => {
    abrir(<Privacidade />, "/privacidade");
    expect(document.querySelector("[data-dados-saude]")?.textContent).toMatch(/dados pessoais sensíveis \(LGPD, art\. 11\)/);
    expect(document.body.textContent).toMatch(/não é um dispositivo médico e não diagnostica, não trata nem substitui o\s+acompanhamento de um profissional de saúde/);
    expect(document.querySelector("[data-secao-privacidade='retencao'] [data-frase-backups]")?.textContent).toBe(FRASE_BACKUPS);
    expect(document.body.textContent).not.toMatch(/7 dias/);
    // decisão de 06/10/2026 ("A"): as do provedor e as manuais, apagadas em até 30 dias — o único prazo da frase
    expect(FRASE_BACKUPS).toMatch(/as automáticas do provedor e as feitas antes de manutenções/);
    expect(FRASE_BACKUPS).toMatch(/são apagadas em até 30 dias depois de feitas; até lá, ficam protegidas e não são usadas para outro fim/);
    expect(FRASE_BACKUPS.match(/\d+/g)).toEqual(["30"]);
  });

  it("versão da Google Play: o GitHub (instalador e atualização do APK do site) não aparece; o resto é igual", () => {
    h.loja = true;
    abrir(<Privacidade />, "/privacidade");
    expect(servicosNaTela()).toEqual(["supabase", "powersync", "cloudflare", "vercel", "google", "resend", "mercado-pago", "whatsapp"]);
    expect(document.body.textContent).not.toMatch(/GitHub|instalador/);
    expect(servicosDaVersao(true)).toHaveLength(SERVICOS_TERCEIROS.length - 1);
  });

  it("aberta por um link do app: o Voltar volta para a tela de onde veio; sem ele, vai para o início", () => {
    render(
      <MemoryRouter initialEntries={["/perfil", { pathname: "/privacidade", state: ESTADO_ABERTA_PELO_APP }]} initialIndex={1}>
        <Routes>
          <Route path="/privacidade" element={<Privacidade />} />
          <Route path="/perfil" element={<div data-tela-perfil>perfil</div>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Voltar/ }));
    expect(document.querySelector("[data-tela-perfil]")).not.toBeNull();
  });

  it("aberta direto (sem o state do app): o Voltar é o link para o início, como antes", () => {
    abrir(<Privacidade />, "/privacidade");
    expect(screen.getByRole("link", { name: /Voltar/ }).getAttribute("href")).toBe("/");
  });
});

describe("/calculator (C63)", () => {
  it("sem login: composição corporal e comparativo; o PDF só com dado", () => {
    localStorage.clear();
    abrir(<Calculadora />, "/calculator");
    expect(screen.getByText("Calculadora de composição corporal")).toBeInTheDocument();
    expect((document.querySelector("[data-btn-pdf-composicao]") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Comparativo" }));
    expect(document.querySelector("[data-comparativo]")).not.toBeNull();
    expect((document.querySelector("[data-btn-pdf-comparativo]") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(document.querySelector('[data-campo-peso-lado="ref"]')!, { target: { value: "82" } });
    expect((document.querySelector("[data-btn-pdf-comparativo]") as HTMLButtonElement).disabled).toBe(false);
  });
});
