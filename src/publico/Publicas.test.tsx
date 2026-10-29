import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import Calculadora from "./Calculadora";
import { FRASE_BACKUPS, SERVICOS_TERCEIROS, servicosDaVersao } from "./privacidade/textos";

// Physiq W26 — as páginas públicas novas (C13, C63). A virada (29/10/2026): a Política de antes (src/publico/Privacidade.tsx) saiu —
// /privacidade, /termos e /assinatura são a página legal (src/publico/legal/, com os testes dela). As frases que a Política e a
// /excluir-conta dizem igual continuam em src/publico/privacidade/textos.ts e são conferidas aqui.
const abrir = (no: React.ReactNode, caminho: string) => render(<MemoryRouter useTransitions={false} initialEntries={[caminho]}>{no}</MemoryRouter>);

describe("src/publico/privacidade/textos.ts — as frases da Política e da /excluir-conta (um lugar só)", () => {
  it("os 11 serviços de terceiros, cada um com o que recebe; na versão da Google Play, sem o GitHub", () => {
    expect(servicosDaVersao(false).map((s) => s.id)).toEqual(["supabase", "powersync", "cloudflare", "vercel", "google", "google-play", "resend", "mercado-pago", "whatsapp", "telegram", "github"]);
    expect(servicosDaVersao(true).map((s) => s.id)).toEqual(["supabase", "powersync", "cloudflare", "vercel", "google", "google-play", "resend", "mercado-pago", "whatsapp", "telegram"]);
    expect(servicosDaVersao(true)).toHaveLength(SERVICOS_TERCEIROS.length - 1);
    for (const s of SERVICOS_TERCEIROS) expect(s.texto.length, s.id).toBeGreaterThan(20);
  });

  it("hml-11 (A2): o push leva só o texto fixo; o Telegram dos avisos de erro tira os dados pessoais", () => {
    const servico = (id: string) => SERVICOS_TERCEIROS.find((s) => s.id === id)?.texto ?? "";
    expect(servico("google")).not.toMatch(/texto do aviso/);
    expect(servico("google")).toMatch(/um texto curto, fixo para cada tipo de aviso \(por exemplo, "Tem novidade na sua agenda\."\), sem nome nem valor/);
    expect(servico("telegram")).toMatch(/avisos de erro do app e do servidor/);
    expect(servico("telegram")).toMatch(/tira e-mail, CPF, telefone, endereço IP, códigos de acesso e números longos/);
    // play-W6 (decisão 12 — correção de FATO): a assinatura pela Google Play existe; o Physiq manda só o código da matrícula
    expect(servico("google-play")).toMatch(/assinatura do plano do app feita na versão da Google Play/);
    expect(servico("google-play")).toMatch(/o número do cartão e os dados de quem paga não passam pelo Physiq/);
  });

  it("a frase das cópias de segurança: a cópia diária cifrada e as manuais, apagadas em até 30 dias (o único prazo)", () => {
    expect(FRASE_BACKUPS).toMatch(/a cópia diária e as feitas antes de manutenções/);
    expect(FRASE_BACKUPS).toMatch(/são cifradas, guardadas no Brasil e apagadas em até 30 dias depois de feitas; até lá, não são usadas para outro fim/);
    expect(FRASE_BACKUPS).not.toMatch(/provedor/);
    expect(FRASE_BACKUPS.match(/\d+/g)).toEqual(["30"]);
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
