import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { conta, situacao } from "@/test/fixturesNucleo";

const h = vi.hoisted(() => ({
  situacao: null as unknown,
  conta: null as unknown,
  status: null as unknown,
}));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ situacao: h.situacao }) }));
vi.mock("@/nucleo/conta", () => ({ useConta: () => ({ conta: h.conta }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "t1" }, isStaff: true }) }));
vi.mock("@/lib/mpClient", () => ({ invokeMp: vi.fn(async () => h.status) }));

import GatePlanoLegado from "./GatePlanoLegado";

function montar(caminho = "/painel/alunos") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[caminho]}>
        <GatePlanoLegado><div>página do painel</div></GatePlanoLegado>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const statusCalc = (o: Record<string, unknown> = {}) => ({
  isento: false, travado: false, diasAtraso: null, tolerancia: 7, hoje: "2026-09-29", plano: { valor_mensal: 39.9 },
  professor: { ciclo_valor: 39.9, ciclo_vence_em: "2026-09-25", cobranca_pausada: false, acesso_liberado_ate: null }, avisos: [], ...o,
});

beforeEach(() => {
  h.situacao = situacao({ contas: [conta()] });
});

describe("GatePlanoLegado — Calc pelo plano-status de hoje", () => {
  it("fora da tolerância: 'Acesso suspenso' (só a aba Plano abre)", async () => {
    h.conta = conta({ origem: "legado_calc", situacao: "vencida" });
    h.status = statusCalc({ travado: true, diasAtraso: 10 });
    montar();
    expect(await screen.findByText("Acesso suspenso")).toBeInTheDocument();
    expect(screen.getByText("Seus alunos continuam treinando normalmente.")).toBeInTheDocument();
  });
  it("na tolerância: faixa 'Pague até' e a página continua", async () => {
    h.conta = conta({ origem: "legado_calc", situacao: "ativa" });
    h.status = statusCalc({ diasAtraso: 4 });
    montar();
    expect(await screen.findByText(/Pague até/)).toBeInTheDocument();
    expect(screen.getByText("página do painel")).toBeInTheDocument();
  });
  it("travado mas na aba Plano: abre para pagar", async () => {
    h.conta = conta({ origem: "legado_calc", situacao: "vencida" });
    h.status = statusCalc({ travado: true });
    montar("/painel/configuracoes/plano");
    expect(await screen.findByText("página do painel")).toBeInTheDocument();
  });
});

describe("GatePlanoLegado — Nutri pela regra do assinaturaUtil", () => {
  it("teste vencido sem pagamento: 'Assinatura pendente' com o caminho para pagar no PhysiqNutri", () => {
    h.conta = conta({ origem: "legado_nutri", plano: "nutricao", modulos: ["nutricao"], situacao: "vencida" });
    h.situacao = situacao({ contas: [h.conta as never], legado_nutri: { role: "nutricionista", teste_ate: "2026-09-01T00:00:00Z", pago_ate: null, isento_assinatura: false, assinatura: null } });
    montar();
    expect(screen.getByText("Assinatura pendente")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Pagar no PhysiqNutri/ })).toHaveAttribute("href", "https://nutri.physiqcalc.com.br/configuracoes");
  });
  it("em teste ou isenta passa", () => {
    h.conta = conta({ origem: "legado_nutri", plano: "nutricao", modulos: ["nutricao"], situacao: "teste" });
    h.situacao = situacao({ legado_nutri: { role: "nutricionista", teste_ate: "2099-01-01T00:00:00Z", pago_ate: null, isento_assinatura: false, assinatura: null } });
    montar();
    expect(screen.getByText("página do painel")).toBeInTheDocument();
  });
  it("conta nova: a trava é da W4 — passa", () => {
    h.conta = conta({ origem: "nova", situacao: "vencida" });
    montar();
    expect(screen.getByText("página do painel")).toBeInTheDocument();
  });
});
