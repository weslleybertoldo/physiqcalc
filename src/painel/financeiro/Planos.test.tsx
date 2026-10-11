// src/painel/financeiro/Planos.test.tsx
// Physiq W-P — Painel › Financeiro › Planos: a lista (período, valor, formas, alunos, "Completar"), só o dono edita, desativar pede a
// confirmação do app e o novo plano grava o que a tela validou. A função é falsa.
// Decisões do Weslley (10/10/2026): ponto 1 — só o dono (e o master) vê a aba Planos, como a mensalidade (403 so_o_dono = o aviso,
// nunca quebra); ponto 2 — mudar o valor de um plano põe as cobranças automáticas dos alunos numa fila (`{ enfileiradas }`) e a tela
// avisa; a função de antes (`{ atualizadas, falharam }`) continua aceita.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";

const h = vi.hoisted(() => ({
  planos: vi.fn(), salvar: vi.fn(), ativar: vi.fn(), ok: vi.fn(), erro: vi.fn(),
  f: null as unknown, resumo: null as unknown,
}));
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => h.ok(...a), error: (...a: unknown[]) => h.erro(...a) } }));
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "staging", supabase: {} }));
vi.mock("@/financeiro/api", async (orig) => ({
  ...(await orig<typeof import("@/financeiro/api")>()),
  buscarPlanosDaConta: (...a: unknown[]) => h.planos(...a),
  salvarPlano: (...a: unknown[]) => h.salvar(...a),
  ativarPlano: (...a: unknown[]) => h.ativar(...a),
}));
// a página inteira (só no último bloco): a conta e o resumo da conta vêm daqui; o Resumo é um marcador
vi.mock("./useFinanceiro", async (orig) => ({
  ...(await orig<typeof import("./useFinanceiro")>()),
  useFinanceiroConta: () => h.f,
  useResumoDaConta: () => h.resumo,
}));
vi.mock("./Resumo", () => ({ default: () => <div data-resumo-marcador /> }));

import { ErroFinanceiro } from "@/financeiro/api";
import { avisoDasAutomaticas } from "@/financeiro/regras";
import Financeiro from "@/painel/paginas/Financeiro";
import { abaDaUrl, abaVisivel } from "./financeiroUtil";
import Planos from "./Planos";

const ANUAL = { id: "pl1", nome: "Anual", valor: 1000, meses: 12, modalidades: ["avista", "mensal"], max_parcelas_cartao: null,
  valor_parcela_mensal: null, ativo: true, completo: true, parcela: 83.33, alunos: 2 };
const SO_NOME = { ...ANUAL, id: "pl2", nome: "Amigos", valor: null, meses: 1, modalidades: ["avista"], completo: false, parcela: null, alunos: 5 };
const resposta = (x: Record<string, unknown> = {}) => ({ ok: true, modo: "pix_manual", app: false, pode_editar: true,
  modalidades_da_conta: ["avista", "mensal"], planos: [ANUAL, SO_NOME], ...x });
const montar = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ProvedorConfirmar>
        <Planos f={{ contaId: "c1" } as never} />
      </ProvedorConfirmar>
    </QueryClientProvider>,
  );

beforeEach(() => {
  h.planos.mockReset().mockResolvedValue(resposta());
  h.salvar.mockReset().mockResolvedValue({ ok: true });
  h.ativar.mockReset().mockResolvedValue({ ok: true });
  h.ok.mockReset();
  h.erro.mockReset();
});

describe("Painel › Financeiro › Planos (W-P)", () => {
  it("lista com o valor, a parcela, quantos alunos e o 'Completar' do plano só com nome", async () => {
    montar();
    await waitFor(() => expect(document.querySelector('[data-plano-card="pl1"]')).not.toBeNull());
    expect(document.querySelector('[data-plano-card="pl1"]')!.textContent).toContain("12× de R$ 83,33");
    expect(document.querySelector('[data-plano-card="pl1"] [data-plano-alunos]')!.textContent).toBe("2 alunos");
    expect(document.querySelector('[data-plano-card="pl2"] [data-plano-completar]')).not.toBeNull();
  });
  it("quem não é dono só vê", async () => {
    h.planos.mockResolvedValue(resposta({ pode_editar: false }));
    montar();
    await waitFor(() => expect(document.querySelector("[data-lista-planos]")).not.toBeNull());
    expect(document.querySelector("[data-novo-plano]")).toBeNull();
    expect(document.querySelector("[data-editar-plano]")).toBeNull();
  });
  it("desativar pede a confirmação do app e só então grava", async () => {
    montar();
    await waitFor(() => expect(document.querySelector('[data-ativar-plano="pl1"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-ativar-plano="pl1"]')!);
    await waitFor(() => expect(document.querySelector("[data-confirmar-ok]")).not.toBeNull());
    expect(h.ativar).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(h.ativar).toHaveBeenCalledWith("c1", "pl1", false));
  });
  it("novo plano: grava o que a tela validou", async () => {
    montar();
    await waitFor(() => expect(document.querySelector("[data-novo-plano]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-novo-plano]")!);
    await waitFor(() => expect(document.querySelector("[data-plano-nome]")).not.toBeNull());
    fireEvent.change(document.querySelector("[data-plano-nome]")!, { target: { value: "Semestral" } });
    fireEvent.change(document.querySelector("[data-plano-meses]")!, { target: { value: "6" } });
    fireEvent.change(document.querySelector("[data-plano-valor]")!, { target: { value: "600" } });
    fireEvent.click(document.querySelector('[data-plano-modalidade="mensal"]')!);
    fireEvent.click(document.querySelector("[data-plano-salvar]")!);
    await waitFor(() => expect(h.salvar).toHaveBeenCalledWith("c1", { nome: "Semestral", meses: 6, valor: 600, modalidades: ["avista", "mensal"],
      max_parcelas_cartao: null, valor_parcela_mensal: null }));
  });

  it("a validação da tela barra antes de ir ao servidor (sem forma de pagar)", async () => {
    montar();
    await waitFor(() => expect(document.querySelector("[data-novo-plano]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-novo-plano]")!);
    await waitFor(() => expect(document.querySelector("[data-plano-nome]")).not.toBeNull());
    fireEvent.change(document.querySelector("[data-plano-nome]")!, { target: { value: "Trimestral" } });
    fireEvent.change(document.querySelector("[data-plano-valor]")!, { target: { value: "300" } });
    fireEvent.click(document.querySelector('[data-plano-modalidade="avista"]')!);
    fireEvent.click(document.querySelector("[data-plano-salvar]")!);
    await waitFor(() => expect(screen.getByText("Marque pelo menos uma forma de pagar.")).toBeInTheDocument());
    expect(h.salvar).not.toHaveBeenCalled();
  });

  it("editar o valor com alunos na cobrança automática: grava com o id e avisa que elas vão ser atualizadas (a fila — ponto 2)", async () => {
    h.salvar.mockResolvedValue({ ok: true, plano: ANUAL, automaticas: { enfileiradas: 2 } });
    montar();
    await waitFor(() => expect(document.querySelector('[data-editar-plano="pl1"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-editar-plano="pl1"]')!);
    await waitFor(() => expect((document.querySelector("[data-plano-valor]") as HTMLInputElement | null)?.value).toBe("1000,00"));
    fireEvent.change(document.querySelector("[data-plano-valor]")!, { target: { value: "1200" } });
    fireEvent.click(document.querySelector("[data-plano-salvar]")!);
    await waitFor(() => expect(h.salvar).toHaveBeenCalledWith("c1", { id: "pl1", nome: "Anual", meses: 12, valor: 1200, modalidades: ["avista", "mensal"],
      max_parcelas_cartao: null, valor_parcela_mensal: null }));
    await waitFor(() => expect(h.ok).toHaveBeenCalledWith("Plano salvo.",
      expect.objectContaining({ description: "As cobranças automáticas dos alunos vão ser atualizadas em instantes." })));
  });

  it("erro do servidor ao salvar fica no formulário, em português (forma de pagar com aluno nela)", async () => {
    h.salvar.mockRejectedValue(new ErroFinanceiro("modalidade_em_uso", { alunos: 3 }));
    montar();
    await waitFor(() => expect(document.querySelector('[data-editar-plano="pl1"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-editar-plano="pl1"]')!);
    await waitFor(() => expect((document.querySelector('[data-plano-modalidade="mensal"]') as HTMLInputElement | null)?.checked).toBe(true));
    fireEvent.click(document.querySelector('[data-plano-modalidade="mensal"]')!);
    fireEvent.click(document.querySelector("[data-plano-salvar]")!);
    await waitFor(() => expect(h.salvar).toHaveBeenCalledWith("c1", expect.objectContaining({ id: "pl1", modalidades: ["avista"] })));
    await waitFor(() => expect(screen.getByText("Há alunos nessa forma de pagar. Passe-os para outra antes de tirar.")).toBeInTheDocument());
    expect(h.ok).not.toHaveBeenCalled();
  });

  it("ponto 1: prof_planos com 403 so_o_dono mostra o aviso (sem lista, sem botões, sem quebrar)", async () => {
    h.planos.mockRejectedValue(new ErroFinanceiro("so_o_dono"));
    montar();
    await waitFor(() => expect(document.querySelector("[data-planos-so-do-dono]")).not.toBeNull());
    expect(document.querySelector("[data-lista-planos]")).toBeNull();
    expect(document.querySelector("[data-novo-plano]")).toBeNull();
  });

  it("schema sem os planos (409 planos_indisponivel): o aviso de erro com a frase dele", async () => {
    h.planos.mockRejectedValue(new ErroFinanceiro("planos_indisponivel"));
    montar();
    await waitFor(() => expect(screen.getByText("Os planos ainda não chegaram a este ambiente.")).toBeInTheDocument());
    expect(document.querySelector("[data-lista-planos]")).toBeNull();
  });
});

describe("W-P — o aviso das cobranças automáticas depois de salvar (ponto 2: os 2 formatos)", () => {
  it("a fila da Task 8b ({ enfileiradas }) e a troca na hora da função de antes ({ atualizadas, falharam })", () => {
    const fila = "As cobranças automáticas dos alunos vão ser atualizadas em instantes.";
    expect(avisoDasAutomaticas({ ok: true, automaticas: { enfileiradas: 3 } })).toBe(fila);
    expect(avisoDasAutomaticas({ ok: true, enfileiradas: 1 })).toBe(fila);
    expect(avisoDasAutomaticas({ ok: true, automaticas: { enfileiradas: 0 } })).toBeNull();
    expect(avisoDasAutomaticas({ ok: true, automaticas: { atualizadas: 2, falharam: 0 } })).toBe("As cobranças automáticas dos alunos já estão com o valor novo.");
    expect(avisoDasAutomaticas({ ok: true, automaticas: { atualizadas: 1, falharam: 1 } }))
      .toBe("Não deu para mudar a cobrança automática de 1 aluno. Confira no financeiro dele.");
    expect(avisoDasAutomaticas({ ok: true, automaticas: { atualizadas: 0, falharam: 3 } }))
      .toBe("Não deu para mudar a cobrança automática de 3 alunos. Confira no financeiro de cada um.");
    expect(avisoDasAutomaticas({ ok: true, automaticas: { atualizadas: 0, falharam: 0 } })).toBeNull();
    expect(avisoDasAutomaticas({ ok: true })).toBeNull();
    expect(avisoDasAutomaticas(null)).toBeNull();
  });
});

describe("W-P — ponto 1: a aba Planos é só do dono e do master", () => {
  it("?aba=planos de quem não é dono nem master cai no Resumo; as outras abas não mudam", () => {
    expect(abaDaUrl(new URLSearchParams("aba=planos"))).toBe("planos");
    expect(abaDaUrl(new URLSearchParams("aba=planos"), true)).toBe("planos");
    expect(abaDaUrl(new URLSearchParams("aba=planos"), false)).toBe("resumo");
    expect(abaDaUrl(new URLSearchParams("aba=mensalidades"), false)).toBe("mensalidades");
    expect(abaVisivel("planos", false)).toBe(false);
    expect(abaVisivel("planos", true)).toBe(true);
    expect(abaVisivel("recibos", false)).toBe(true);
  });

  const conta = { id: "c1", nome: "Consultoria Ferreira", profissionais: 2, papeis: ["personal"] };
  const paginaCom = (dono: boolean, resumoDono: boolean | undefined, endereco = "/painel/financeiro?aba=planos") => {
    h.f = { conta, contaId: "c1", uid: "u1", dono, pronto: true, categorias: { data: [] }, categoriasCarregando: false, categoriasErro: false,
      recarregar: vi.fn(async () => {}) };
    h.resumo = { data: resumoDono === undefined ? undefined : { ok: true, dono: resumoDono, alunos: [], pendentes: [] } };
    return render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[endereco]}>
          <ProvedorConfirmar>
            <Financeiro />
          </ProvedorConfirmar>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };
  const abas = () => [...document.querySelectorAll("[data-aba-financeiro-botao]")].map((b) => b.getAttribute("data-aba-financeiro-botao"));

  it("profissional da equipe (nem dono nem master): sem a aba e o link ?aba=planos abre o Resumo, sem pedir os planos", async () => {
    paginaCom(false, false);
    expect(abas()).toEqual(["resumo", "mensalidades", "lancamentos", "recibos", "categorias"]);
    expect(document.querySelector("[data-pagina-financeiro-painel]")?.getAttribute("data-aba-financeiro")).toBe("resumo");
    expect(document.querySelector("[data-resumo-marcador]")).not.toBeNull();
    expect(h.planos).not.toHaveBeenCalled();
  });

  it("dono: a aba depois de Mensalidades e o ?aba=planos abre a lista", async () => {
    paginaCom(true, undefined);
    expect(abas()).toEqual(["resumo", "mensalidades", "planos", "lancamentos", "recibos", "categorias"]);
    await waitFor(() => expect(document.querySelector('[data-plano-card="pl1"]')).not.toBeNull());
    expect(h.planos).toHaveBeenCalledWith("c1");
  });

  it("master (o servidor diz dono no resumo da conta, mesmo sem o papel): vê a aba", async () => {
    paginaCom(false, true);
    expect(abas()).toContain("planos");
    await waitFor(() => expect(document.querySelector("[data-lista-planos]")).not.toBeNull());
  });
});
