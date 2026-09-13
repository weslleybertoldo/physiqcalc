import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { PlanoStatus } from "@/lib/saasApi";

const { invokeMock, ctx } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  ctx: { status: null as unknown, recarregar: vi.fn() },
}));
vi.mock("@/lib/mpClient", () => ({ invokeMp: invokeMock, gravarStatusCache: vi.fn(), lerStatusCache: vi.fn(() => null) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: vi.fn() } }, DB_SCHEMA: "public" }));
vi.mock("@/layouts/AdminLayout", () => ({ usePlanoStatus: () => ctx }));

import PlanosPage from "./PlanosPage";

const isento: PlanoStatus = {
  isento: true,
  professor: {
    id: "m", nome: "Weslley", email: null, status: "ativo", codigo_convite: "PROF-WESLLEY-BERTOLDO", plano_id: null,
    trial_ate: null, adesao_paga_em: null, ciclo_inicio: null, ciclo_vence_em: null, ciclo_valor: null,
    anual_ate: null, cobranca_pausada: false, acesso_liberado_ate: null, alunos_bloqueados_em: null, alunos: 12, adesao: 500, tolerancia: 7, trial_dias: 14,
  },
  plano: null,
  planos: [{ id: "pl1", nome: "Start", min_alunos: 1, max_alunos: 10, valor_mensal: 39.9, valor_anual: null, ativo: true }],
  adesao: 500, tolerancia: 7, trialDias: 14, acessoOk: true, travado: false, diasAtraso: null,
  pagamentos: [], assinatura: null, avisos: [], hoje: "2026-09-13",
};

describe("Admin › Planos pro master (isento): mesma visão dos professores, sem atalho pro Master (pedido 13/09/2026)", () => {
  it("não mostra o bloco 'Conta master' nem 'Gerenciar planos'; mostra o resumo e o histórico do professor", () => {
    ctx.status = isento;
    render(
      <MemoryRouter>
        <PlanosPage />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Gerenciar planos")).toBeNull();
    expect(screen.queryByText(/dono da plataforma/)).toBeNull();
    expect(document.querySelector("[data-plano-master]")).toBeNull();
    expect(document.querySelector("[data-plano-lista-master]")).toBeNull();
    expect(document.querySelector("[data-plano-resumo]")).not.toBeNull();
    expect(screen.getByText("Nenhum pagamento do plano ainda.")).toBeInTheDocument();
    // isento não paga nem muda de plano → sem card "Mudar de plano" e sem "fale com o administrador"
    expect(document.querySelector("[data-plano-mudar]")).toBeNull();
    expect(screen.queryByText(/ainda não definiu o seu plano/)).toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
