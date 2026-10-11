// src/financeiro/ui/PlanoDoAluno.test.tsx
// Physiq W-P — ficha do aluno: o modo de hoje igual (B1); plano com período manda plano + modalidade + início; só as modalidades que
// o plano e a conta aceitam; trocar para o período todo com a automática ligada pede a confirmação do app e manda cancelar_automatica.
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";
import type { FinanceiroProfissional } from "../tipos";
import { hojeSP } from "../regras";

import { FormPlanoDoAluno } from "./PlanoDoAluno";

const h = vi.hoisted(() => ({ agir: vi.fn(), salvo: vi.fn() }));
const ANUAL = { id: "pl1", nome: "Anual", valor: 1000, ativo: true, meses: 12, modalidades: ["avista", "cartao_parcelado", "mensal"] as const,
  max_parcelas_cartao: 10, valor_parcela_mensal: null };
const SO_NOME = { id: "pl2", nome: "Amigos", valor: null, ativo: true, meses: 1, modalidades: ["avista"] as const, max_parcelas_cartao: null, valor_parcela_mensal: null };

function dados(x: Partial<FinanceiroProfissional> = {}): FinanceiroProfissional {
  return {
    ok: true, ambiente: "staging", simulacao: true, hoje: hojeSP(), agora: new Date().toISOString(),
    aluno: { paciente_id: "p1", treino_user_id: "t1", nome: "Rafael Moura", email: null, cpf: null, foto_url: null, ativo: true, tags: [], conta_id: "c1", conta_nome: "Lucas", tem_login: true },
    permissoes: { master: false, dono: true, responsavel: true, mensalidade: true },
    conta: { id: "c1", nome: "Lucas", modo: "pix_manual", bloquear: false, origem: "nova", chave: null, modalidades: ["avista", "mensal"] },
    planos: [ANUAL as never, SO_NOME as never],
    mensalidade: { valor: 99.9, plano_id: null, plano: null, pausada: false, pago_ate: null, desde: null, coberta: false, modalidade: null, meses: 1 },
    assinatura: null, cobrancas: [], ...x,
  } as FinanceiroProfissional;
}
const montar = (d: FinanceiroProfissional) =>
  render(<ProvedorConfirmar><MemoryRouter><FormPlanoDoAluno d={d} agir={h.agir} aoSalvo={h.salvo} /></MemoryRouter></ProvedorConfirmar>);

beforeEach(() => {
  h.agir.mockReset().mockResolvedValue({ mensalidade: { valor: 83.33 } });
  h.salvo.mockReset();
});

describe("ficha do aluno › plano (W-P)", () => {
  it("modo de hoje: o valor livre continua e manda plano_modalidade: null", async () => {
    montar(dados());
    expect(document.querySelector("[data-form-mensalidade]")!.getAttribute("data-modo-plano")).toBe("hoje");
    fireEvent.change(document.querySelector("[data-mensalidade-valor]")!, { target: { value: "120" } });
    fireEvent.click(document.querySelector("[data-mensalidade-salvar]")!);
    await waitFor(() => expect(h.agir).toHaveBeenCalledWith("prof_definir", { aluno: "p1", valor: 120, plano_aluno_id: null, plano_modalidade: null }, "Plano e mensalidade salvos."));
  });
  it("plano só com nome continua no modo de hoje", () => {
    montar(dados());
    fireEvent.change(document.querySelector("[data-mensalidade-plano]")!, { target: { value: "pl2" } });
    expect(document.querySelector("[data-form-mensalidade]")!.getAttribute("data-modo-plano")).toBe("hoje");
  });
  it("plano sem meses (a função ou o schema de antes da W-P: só nome e valor) também fica no modo de hoje", () => {
    montar(dados({ planos: [{ id: "pl3", nome: "Antigo", valor: 150, ativo: true }] }));
    fireEvent.change(document.querySelector("[data-mensalidade-plano]")!, { target: { value: "pl3" } });
    expect(document.querySelector("[data-form-mensalidade]")!.getAttribute("data-modo-plano")).toBe("hoje");
    expect(document.querySelector('[data-mensalidade-plano] option[value="pl3"]')!.textContent).toBe("Antigo (sem período)");
  });
  it("plano com período: só as modalidades da conta (Pix manual: sem cartão parcelado) e o 1º vencimento", async () => {
    montar(dados());
    fireEvent.change(document.querySelector("[data-mensalidade-plano]")!, { target: { value: "pl1" } });
    const opcoes = [...document.querySelectorAll("[data-mensalidade-modalidade] option")].map((o) => (o as HTMLOptionElement).value);
    expect(opcoes).toEqual(["", "avista", "mensal"]);
    fireEvent.change(document.querySelector("[data-mensalidade-modalidade]")!, { target: { value: "mensal" } });
    expect(document.querySelector("[data-mensalidade-previsto]")!.textContent).toBe("Cada pagamento: R$ 83,33");
    fireEvent.click(document.querySelector("[data-mensalidade-salvar]")!);
    await waitFor(() => expect(h.agir).toHaveBeenCalledWith("prof_definir", { aluno: "p1", plano_aluno_id: "pl1", plano_modalidade: "mensal",
      plano_valor_negociado: null, inicio: hojeSP() }, "Plano do aluno salvo."));
    expect(h.salvo).toHaveBeenCalledWith("Anual", 83.33);
  });
  it("período todo com a automática ligada: confirma no app e manda cancelar_automatica", async () => {
    montar(dados({ assinatura: { id: "a1", status: "authorized", valor: 99.9, proximo_vencimento: null, sandbox: false, simulada: false, init_point: null } }));
    fireEvent.change(document.querySelector("[data-mensalidade-plano]")!, { target: { value: "pl1" } });
    fireEvent.change(document.querySelector("[data-mensalidade-modalidade]")!, { target: { value: "avista" } });
    fireEvent.click(document.querySelector("[data-mensalidade-salvar]")!);
    await waitFor(() => expect(document.querySelector("[data-confirmar-ok]")).not.toBeNull());
    expect(h.agir).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(h.agir).toHaveBeenCalledWith("prof_definir", expect.objectContaining({ plano_modalidade: "avista", cancelar_automatica: true }), "Plano do aluno salvo."));
  });
});
