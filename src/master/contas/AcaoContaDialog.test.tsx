import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContaLinha, PrecoPlano } from "../tipos";

// W28 — Master › Contas › "Mudar plano" numa conta com o preço e as regras de hoje (regras_legadas): o aviso de que ela sai do
// legado (o servidor tira o preço travado), com o preço da tabela nova.
const h = vi.hoisted(() => ({ planos: vi.fn(), acaoConta: vi.fn() }));
vi.mock("../api", () => ({
  planos: h.planos,
  acaoConta: h.acaoConta,
  cancelarAssinatura: vi.fn(),
  reenviarAviso: vi.fn(),
  registrarPagamento: vi.fn(),
  ErroMaster: class ErroMaster extends Error {
    constructor(public codigo: string, public extra: Record<string, unknown> = {}) {
      super(codigo);
    }
  },
}));

import { AcaoContaDialog } from "./AcaoContaDialog";

function conta(c: Partial<ContaLinha> = {}): ContaLinha {
  return {
    id: "c1", nome: "Studio Ana", origem: "legado_calc", plano: "treino", modulos: ["treino"], faixa: "f10", periodicidade: "mensal",
    situacao: "ativa", situacao_efetiva: "ativa", teste_ate: null, vence_em: "2026-11-02", tolerancia_dias: 7, valor_travado: 29.9, valor_mensal: 29.9,
    regra_pix: "mes", cobranca_legada: false, regras_legadas: true, isenta_motivo: null, recebimento_modo: "pix_manual", bloquear_app_inadimplente: false,
    alunos_bloqueados_em: null, alunos_bloqueados_msg: null, criado_em: "2026-10-01T10:00:00Z", eh_app: false, dono: null, membros: 1, convidados: 0,
    alunos_ativos: 3, alunos_total: 3, limite_alunos: 10, assinatura: null, legado_nutri: null, ultima_fatura: null, chave_pix: null, ...c,
  };
}

const preco = (plano: PrecoPlano["plano"], faixa: PrecoPlano["faixa"], valor: number): PrecoPlano => ({
  id: `${plano}:${faixa}`, plano, faixa, min_alunos: 1, max_alunos: 10, valor_mensal: valor, valor_anual: valor * 10, ativo: true, ordem: 1, contas: 0,
});

function montar(c: ContaLinha) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AcaoContaDialog conta={c} acao="plano" aoFechar={() => {}} aoFeito={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.planos.mockReset();
  h.acaoConta.mockReset();
  h.planos.mockResolvedValue({ precos: [preco("treino", "f10", 39.9), preco("treino_nutricao", "f10", 59.9)], historico: [], config: {}, tolerancia_legado_calc: 7 });
});

describe("Master › Mudar plano — W28: sai do preço e das regras de hoje", () => {
  it("com regras_legadas: avisa antes, com o preço de hoje e o da tabela nova do plano escolhido", async () => {
    montar(conta());
    const aviso = await screen.findByText(/Esta conta tem o preço e as regras de hoje\./);
    expect(aviso.closest("[data-aviso-sai-do-legado]")?.textContent).toMatch(
      /Ao trocar de plano, o preço de hoje \(R\$\s?29,90\/mês\) e as regras de hoje deixam de valer: passam a ser os da tabela nova \(a partir do próximo pagamento\)\./);
    fireEvent.change(document.querySelector("[data-campo-plano]") as HTMLSelectElement, { target: { value: "treino_nutricao" } });
    await waitFor(() => expect(document.querySelector("[data-aviso-sai-do-legado]")?.textContent).toMatch(/\(R\$\s?59,90\/mês, a partir do próximo pagamento\)/));
    expect(h.planos).toHaveBeenCalled();
  });
  it("sem regras_legadas (conta nova ou já fora do legado): sem o aviso e sem buscar a tabela", () => {
    montar(conta({ origem: "nova", regras_legadas: false, valor_travado: null, tolerancia_dias: 0 }));
    expect(screen.getByText("Mudar plano ou faixa")).toBeInTheDocument();
    expect(document.querySelector("[data-aviso-sai-do-legado]")).toBeNull();
    expect(h.planos).not.toHaveBeenCalled();
  });
});
