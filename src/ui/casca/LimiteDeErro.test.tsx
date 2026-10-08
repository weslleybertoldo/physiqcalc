import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Physiq hml-10 (H-26 e H-48, D5 · S2) — a tela de erro de uma parte: texto fixo + o código do aviso (a message do erro não aparece
// mais; o erro de chunk velho fica como estava) e 1 aviso por erro, inclusive nos limites silenciosos (src/lib/avisoDeErro.ts —
// aqui um falso que devolve o código; quem descarta o chunk velho é ele).
const h = vi.hoisted(() => ({ avisar: vi.fn((_aviso: unknown) => "a1b2c3d4") }));
vi.mock("@/lib/avisoDeErro", () => ({ avisarErro: h.avisar }));

import { LimiteDeErro } from "./LimiteDeErro";

const MENSAGEM = "falhou para maria.teste@exemplo.com (telefone (82) 99999-1234)";

function Bomba({ armada, mensagem = MENSAGEM }: { armada: { valor: boolean }; mensagem?: string }) {
  if (armada.valor) throw new TypeError(mensagem);
  return <p>parte em pé</p>;
}

beforeEach(() => {
  h.avisar.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LimiteDeErro — tela de erro de uma parte (S2)", () => {
  it("título e texto fixos com o código; a message não aparece; o resto da tela continua", () => {
    render(
      <div>
        <p>menu do painel</p>
        <LimiteDeErro nome="aba do aluno Treino">
          <Bomba armada={{ valor: true }} />
        </LimiteDeErro>
      </div>,
    );
    expect(screen.getByText("Não deu para abrir esta parte")).toBeInTheDocument();
    const codigo = document.querySelector("[data-codigo-erro]");
    expect(codigo?.getAttribute("data-codigo-erro")).toBe("a1b2c3d4");
    expect(codigo?.parentElement?.textContent).toBe("Tente de novo. Se continuar, fale com o suporte (código a1b2c3d4).");
    expect(screen.getByText("menu do painel")).toBeInTheDocument();
    const texto = document.body.textContent ?? "";
    for (const proibido of [MENSAGEM, "maria", "99999-1234", "Erro inesperado"]) expect(texto, proibido).not.toContain(proibido);
  });

  it("1 aviso por erro: origem tela, o próprio erro e o nome da parte como lugar (sem nome: 'parte da tela')", () => {
    render(
      <LimiteDeErro nome="aba do aluno Treino">
        <Bomba armada={{ valor: true }} />
      </LimiteDeErro>,
    );
    render(
      <LimiteDeErro>
        <Bomba armada={{ valor: true }} mensagem="outra" />
      </LimiteDeErro>,
    );
    expect(h.avisar).toHaveBeenCalledTimes(2);
    expect(h.avisar.mock.calls[0][0]).toEqual({ origem: "tela", mensagem: expect.any(TypeError), lugar: "aba do aluno Treino" });
    expect((h.avisar.mock.calls[0][0] as { mensagem: Error }).mensagem.message).toBe(MENSAGEM);
    expect(h.avisar.mock.calls[1][0]).toMatchObject({ origem: "tela", lugar: "parte da tela" });
  });

  it("silencioso: some sem mostrar nada e avisa do mesmo jeito", () => {
    const { container } = render(
      <LimiteDeErro silencioso nome="aviso AvisoMudanca">
        <Bomba armada={{ valor: true }} />
      </LimiteDeErro>,
    );
    expect(container.innerHTML).toBe("");
    expect(h.avisar).toHaveBeenCalledTimes(1);
    expect(h.avisar.mock.calls[0][0]).toMatchObject({ origem: "tela", lugar: "aviso AvisoMudanca" });
  });

  it("chunk velho depois de um deploy: a tela de hoje ('Tem versão nova do Physiq'), sem código", () => {
    render(
      <LimiteDeErro nome="painel">
        <Bomba armada={{ valor: true }} mensagem="Failed to fetch dynamically imported module: https://physiqcalc.com.br/assets/Painel-abc.js" />
      </LimiteDeErro>,
    );
    expect(screen.getByText("Tem versão nova do Physiq")).toBeInTheDocument();
    expect(screen.getByText("Toque em tentar de novo para carregar a versão atual.")).toBeInTheDocument();
    expect(document.querySelector("[data-codigo-erro]")).toBeNull();
  });

  it("'Tentar de novo' volta a parte", () => {
    const armada = { valor: true };
    render(
      <LimiteDeErro nome="card">
        <Bomba armada={armada} />
      </LimiteDeErro>,
    );
    armada.valor = false;
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(screen.getByText("parte em pé")).toBeInTheDocument();
    expect(document.querySelector("[data-codigo-erro]")).toBeNull();
  });
});
