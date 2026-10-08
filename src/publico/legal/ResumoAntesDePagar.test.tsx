import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import ResumoAntesDePagar, { type TelaQueVende } from "./ResumoAntesDePagar";
import { resumoDaAssinatura } from "./assinatura";
import { VENDEDOR } from "./versao";

// hml-11 (H-28, D5) — o resumo dos Termos de assinatura antes de pagar (Decreto 7.962/2013, art. 4º, I): os itens da seção Resumo
// do texto, com o negrito, sem o bloco do outro público, e os links que abrem os documentos completos em outra aba.
function abrir(tela: TelaQueVende) {
  render(
    <MemoryRouter>
      <ResumoAntesDePagar tela={tela} />
    </MemoryRouter>,
  );
  return document.querySelector(`[data-resumo-antes-de-pagar="${tela}"]`) as HTMLElement;
}

const negritos = (el: HTMLElement) => [...el.querySelectorAll("strong")].map((s) => s.textContent?.replace(/\u00a0/g, " "));
const texto = (el: HTMLElement) => (el.textContent ?? "").replace(/\u00a0/g, " ");

describe("ResumoAntesDePagar", () => {
  it("plano do profissional: o bloco do profissional (teste de 14 dias), sem o do plano do app", () => {
    const resumo = abrir("plano-profissional");
    expect(resumo).not.toBeNull();
    expect(resumo.querySelectorAll(":scope > div > ul > li")).toHaveLength(resumoDaAssinatura("profissional").length);
    expect(negritos(resumo)).toContain("Profissional:");
    expect(negritos(resumo)).not.toContain("Aluno sem profissional:");
    expect(texto(resumo)).toContain("14 dias grátis no Treino + Nutrição");
    expect(texto(resumo)).not.toContain("R$ 29,90");
  });

  it.each(["sem-profissional", "meu-plano"] as const)("%s: o bloco do plano do app (preços e 7 dias), sem o do profissional", (tela) => {
    const resumo = abrir(tela);
    expect(resumo).not.toBeNull();
    expect(negritos(resumo)).toContain("Aluno sem profissional:");
    expect(negritos(resumo)).not.toContain("Profissional:");
    expect(texto(resumo)).toContain("Treino, R$ 29,90 por mês, ou Treino + Alimentação, R$ 49,90 por mês");
    expect(texto(resumo)).toContain("7 dias grátis, sem cartão");
  });

  it("quem vende e as cláusulas que limitam direitos, em negrito (desistência, fora do prazo, renovação, bloqueio)", () => {
    const resumo = abrir("meu-plano");
    expect(texto(resumo)).toContain(`${VENDEDOR.nome}, pessoa física, CPF ${VENDEDOR.cpf}`);
    expect(negritos(resumo)).toEqual(
      expect.arrayContaining([
        "7 dias depois de um pagamento",
        "Fora desse prazo, o que já foi pago não é devolvido, nem em parte",
        "cobrança automática no cartão, que renova todo mês até você cancelar",
        "O bloqueio não apaga dados",
      ]),
    );
  });

  it("os links abrem os Termos de assinatura e a Política em outra aba (o pagamento fica onde está)", () => {
    const resumo = abrir("plano-profissional");
    const assinatura = resumo.querySelector('[data-link-legal="assinatura"]') as HTMLAnchorElement;
    const politica = resumo.querySelector('[data-link-legal="politica"]') as HTMLAnchorElement;
    expect(assinatura.textContent).toBe("Termos de assinatura");
    expect(assinatura.getAttribute("href")).toBe("/assinatura");
    expect(politica.textContent).toBe("Política de Privacidade");
    expect(politica.getAttribute("href")).toBe("/privacidade");
    for (const a of [assinatura, politica]) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toContain("noopener");
    }
  });
});
