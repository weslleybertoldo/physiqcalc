import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { VERSAO_TEXTOS } from "../versao";
import CampoNascimento from "./CampoNascimento";
import ConsentimentoSaude, { type ConsentimentoDado, type VarianteConsentimento } from "./ConsentimentoSaude";

// hml-12 (H-30, H8) — o consentimento do dado de saúde, específico e em destaque (art. 11, I), nas 2 variantes: o plano sem
// profissional (app) e a pré-consulta /f/ (preconsulta). E o campo da data de nascimento (18+) que vai junto no plano do app.

function Controlado({ variante, profissional, novaAba, aoMudar }: {
  variante: VarianteConsentimento;
  profissional?: string | null;
  novaAba?: boolean;
  aoMudar: (c: ConsentimentoDado | null) => void;
}) {
  const [c, setC] = useState<ConsentimentoDado | null>(null);
  return (
    <ConsentimentoSaude
      variante={variante}
      profissional={profissional}
      novaAba={novaAba}
      marcado={!!c}
      aoMudar={(novo) => {
        setC(novo);
        aoMudar(novo);
      }}
    />
  );
}

const abrir = (el: React.ReactNode) => render(<MemoryRouter useTransitions={false}>{el}</MemoryRouter>);
const bloco = () => document.querySelector("[data-consentimento-saude]") as HTMLElement;
const caixa = () => document.querySelector("[data-consentimento-saude-caixa]") as HTMLInputElement;

describe("ConsentimentoSaude (hml-12)", () => {
  it("app: o título, o texto (para quê, nunca publicidade, como retirar, o que acontece sem ele) e a caixa", () => {
    const aoMudar = vi.fn();
    abrir(<Controlado variante="app" aoMudar={aoMudar} />);
    expect(bloco().getAttribute("data-consentimento-saude")).toBe("app");
    expect(screen.getByRole("heading", { name: "Seus dados de saúde" })).toBeInTheDocument();
    const texto = bloco().textContent ?? "";
    expect(texto).toContain(
      "No plano sem profissional, o Physiq guarda os dados de saúde que você registra (peso, medidas, fotos de avaliação, treino e alimentação) só para montar e acompanhar o seu treino. Nunca para publicidade.",
    );
    expect(texto).toContain("Você pode retirar este consentimento quando quiser, pelo e-mail bertoldo.code@gmail.com; sem ele, o plano sem profissional não funciona.");
    expect(screen.getByText("Consinto que o Physiq trate os meus dados de saúde para o plano sem profissional.")).toBeInTheDocument();
    // marcar devolve a versão do texto lido e a origem; desmarcar, null
    expect(caixa().checked).toBe(false);
    fireEvent.click(caixa());
    expect(caixa().checked).toBe(true);
    expect(aoMudar).toHaveBeenLastCalledWith({ versao: VERSAO_TEXTOS, origem: "site" });
    fireEvent.click(caixa());
    expect(aoMudar).toHaveBeenLastCalledWith(null);
  });

  it("o link da Política: em outra aba (o formulário fica onde está) ou, na tela do aceite, na mesma janela", () => {
    const r = abrir(<Controlado variante="app" aoMudar={vi.fn()} />);
    const link = () => document.querySelector("[data-consentimento-politica]") as HTMLAnchorElement;
    expect(link().getAttribute("href")).toBe("/privacidade");
    expect(link().getAttribute("target")).toBe("_blank");
    r.unmount();
    abrir(<Controlado variante="app" novaAba={false} aoMudar={vi.fn()} />);
    expect(link().getAttribute("href")).toBe("/privacidade");
    expect(link().getAttribute("target")).toBeNull();
    // o e-mail do suporte abre o e-mail com o assunto
    expect(bloco().querySelector('a[href^="mailto:"]')?.getAttribute("href")).toMatch(/^mailto:bertoldo\.code@gmail\.com\?subject=/);
  });

  it("preconsulta: as respostas vão para quem mandou o formulário; a caixa diz a idade (P8)", () => {
    const aoMudar = vi.fn();
    abrir(<Controlado variante="preconsulta" profissional="Rafael Lima" aoMudar={aoMudar} />);
    expect(bloco().getAttribute("data-consentimento-saude")).toBe("preconsulta");
    expect(bloco().textContent).toContain("As respostas desta pré-consulta são dados de saúde. Elas vão só para Rafael Lima");
    expect(bloco().textContent).toContain("sem ele, as respostas não são enviadas.");
    expect(
      screen.getByText(
        "Consinto que as minhas respostas de saúde sejam enviadas a Rafael Lima e guardadas no Physiq para o meu atendimento. Tenho 18 anos ou mais, ou respondo com o meu responsável.",
      ),
    ).toBeInTheDocument();
    expect(document.querySelector("[data-consentimento-politica]")?.getAttribute("target")).toBe("_blank");
    fireEvent.click(caixa());
    expect(aoMudar).toHaveBeenLastCalledWith({ versao: VERSAO_TEXTOS, origem: "site" });
  });

  it("preconsulta sem o nome de quem mandou: 'o seu profissional'", () => {
    abrir(<Controlado variante="preconsulta" profissional="  " aoMudar={vi.fn()} />);
    expect(bloco().textContent).toContain("Elas vão só para o seu profissional, que as usa");
    expect(bloco().textContent).toContain("sejam enviadas ao meu profissional e guardadas");
  });

  it("desabilitada (enviando): a caixa não muda", () => {
    abrir(<ConsentimentoSaude variante="app" marcado={false} aoMudar={vi.fn()} desabilitado />);
    expect(caixa().disabled).toBe(true);
  });
});

describe("CampoNascimento (hml-12, P4)", () => {
  it("o input de data obrigatório, com a dica do 18+; cada troca devolve a data e o erro pela regra", () => {
    const aoMudar = vi.fn();
    render(<CampoNascimento valor="" aoMudar={aoMudar} />);
    const input = document.querySelector("[data-campo-nascimento] input[type='date']") as HTMLInputElement;
    expect(input.required).toBe(true);
    expect(input.min).toBe("1900-01-01");
    expect(input.max).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(screen.getByLabelText(/Data de nascimento/)).toBe(input);
    expect(screen.getByText("O plano sem profissional é para maiores de 18 anos.")).toBeInTheDocument();
    const ano = new Date().getFullYear();
    fireEvent.change(input, { target: { value: `${ano - 17}-01-01` } });
    expect(aoMudar).toHaveBeenLastCalledWith(`${ano - 17}-01-01`, "menor_de_18");
    fireEvent.change(input, { target: { value: `${ano - 40}-06-15` } });
    expect(aoMudar).toHaveBeenLastCalledWith(`${ano - 40}-06-15`, null);
  });
});
