import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ComponentType } from "react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// hml-11 (H-28, D5) — Perfil › Meu plano (aluno sem profissional): o resumo dos Termos de assinatura sobre o Assinar/Pagar (Decreto
// 7.962/2013, art. 4º, I), SÓ no build de staging até a virada, e nunca na versão da Google Play. A condição do Vite é lida quando a
// tela carrega: cada teste importa a tela de novo com o schema do build. O resto da tela é testado em src/app-aluno/loja.test.tsx.
const h = vi.hoisted(() => ({ loja: false, plano: vi.fn(), importouResumo: 0 }));
vi.mock("@/lib/distribuicao", () => ({
  get ehLoja() {
    return h.loja;
  },
  get DISTRIBUICAO() {
    return h.loja ? "play" : "site";
  },
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" }, registerPlugin: () => ({}) }));
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "public", supabase: {} }));
// sem o cliente de verdade: cada import de novo (resetModules) criaria outro
vi.mock("@/integrations/principal/client", () => ({ principal: { rpc: vi.fn(), functions: { invoke: vi.fn() } } }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ recarregarSituacao: async () => null }) }));
vi.mock("@/app-aluno/sozinho/api", async (orig) => ({ ...(await orig<typeof import("@/app-aluno/sozinho/api")>()), buscarMeuPlano: () => h.plano() }));
// conta quando a tela pede o resumo (o import() que a produção corta)
vi.mock("@/publico/legal/ResumoAntesDePagar", async (orig) => {
  h.importouResumo += 1;
  return orig<typeof import("@/publico/legal/ResumoAntesDePagar")>();
});

const dia = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const PLANOS_APP = [
  { codigo: "app_treino", nome: "Treino", valor: 29.9, modulos: ["treino"], descricao: null },
  { codigo: "app_treino_alimentacao", nome: "Treino + Alimentação", valor: 49.9, modulos: ["treino", "nutricao"], descricao: null },
];
/** o aluno do app nos dias grátis (o Assinar aparece) */
const meuPlano = (m: Record<string, unknown> = {}) => ({
  teste_dias: 7, planos: PLANOS_APP, com_profissional: false,
  matricula: { paciente_id: "pa", ativo: true, plano: "app_treino", plano_nome: "Treino", valor: 29.9, modulos: ["treino"], objetivo: "ganhar_massa",
    teste_de: dia(-2), teste_ate: dia(5), pago_ate: dia(5), pausada: false, encerrada_em: null, encerrada_motivo: null, aguardando: false, assinatura: null, ...m },
});

async function meuPlanoDoBuild(schema: "staging" | "public") {
  vi.stubEnv("VITE_DB_SCHEMA", schema);
  vi.resetModules();
  return (await import("./MeuPlano")).default;
}

function montar(Tela: ComponentType) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter useTransitions={false} initialEntries={["/perfil/meu-plano"]}>
        <Routes>
          <Route path="*" element={<Tela />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.loja = false;
  h.importouResumo = 0;
  h.plano.mockReset();
  h.plano.mockResolvedValue(meuPlano());
});
afterAll(() => {
  vi.unstubAllEnvs();
});

describe("Perfil › Meu plano — hml-11: o resumo antes de pagar só no staging", () => {
  it("staging: o resumo do plano do app logo acima do 'Assinar por R$ 29,90/mês', com os links", async () => {
    montar(await meuPlanoDoBuild("staging"));
    const assinar = await screen.findByRole("button", { name: /Assinar por R\$\s?29,90\/mês/ }, { timeout: 5000 });
    const resumo = await waitFor(
      () => {
        const el = document.querySelector('[data-resumo-antes-de-pagar="meu-plano"]');
        if (!el) throw new Error("o resumo ainda não apareceu");
        return el;
      },
      { timeout: 5000 },
    );
    expect(h.importouResumo).toBe(1);
    expect(resumo.compareDocumentPosition(assinar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(resumo.textContent).toContain("Aluno sem profissional:");
    expect(resumo.textContent).not.toContain("Profissional:");
    expect(resumo.querySelector('[data-link-legal="assinatura"]')?.getAttribute("href")).toBe("/assinatura");
    expect(resumo.querySelector('[data-link-legal="politica"]')?.getAttribute("href")).toBe("/privacidade");
  });

  it("staging, com a cobrança automática já ligada (sem o Pagar): sem o resumo", async () => {
    h.plano.mockResolvedValue(meuPlano({ teste_ate: dia(-20), pago_ate: dia(10), assinatura: { status: "authorized", valor: 29.9, proximo_vencimento: dia(10) } }));
    montar(await meuPlanoDoBuild("staging"));
    expect(await screen.findByText(/Cobrança automática no cartão ligada/, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(document.querySelector("[data-meu-plano-pagar]")).toBeNull();
    expect(document.querySelector("[data-resumo-antes-de-pagar]")).toBeNull();
    expect(h.importouResumo).toBe(0);
  });

  it("versão da Google Play (staging): nunca o resumo", async () => {
    h.loja = true;
    montar(await meuPlanoDoBuild("staging"));
    expect(await screen.findByText(/Grátis até/, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(document.querySelector("[data-resumo-antes-de-pagar]")).toBeNull();
    expect(h.importouResumo).toBe(0);
  });

  it("produção: sem o resumo (o import nem acontece) e o Assinar igual a hoje", async () => {
    montar(await meuPlanoDoBuild("public"));
    expect(await screen.findByRole("button", { name: /Assinar por R\$\s?29,90\/mês/ }, { timeout: 5000 })).toBeInTheDocument();
    expect(document.querySelector("[data-resumo-antes-de-pagar]")).toBeNull();
    expect(h.importouResumo).toBe(0);
  });
});
