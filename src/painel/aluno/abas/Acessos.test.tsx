import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { perfil } from "@/test/fixturesPerfilAluno";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";

const h = vi.hoisted(() => ({ perfil: vi.fn(), ler: vi.fn(), series: vi.fn(), acesso: vi.fn() }));
vi.mock("../dados/api", () => ({ buscarPerfilAluno: h.perfil, ErroPerfil: class extends Error {} }));
vi.mock("@/acessos/api", async (orig) => ({
  ...(await orig<typeof import("@/acessos/api")>()),
  lerAcessos: (...a: unknown[]) => h.ler(...a),
  lerSeries: (...a: unknown[]) => h.series(...a),
  salvarAcesso: vi.fn(),
  salvarSeries: vi.fn(),
}));
vi.mock("../resumo/acesso/api", () => ({ acessoDoAluno: h.acesso, criarAcessoDoAluno: vi.fn(), criarSenhaNovaDoAluno: vi.fn() }));
vi.mock("@/painel/alunos/api", () => ({ acaoNoAluno: vi.fn(), ErroAlunos: class extends Error {} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import Acessos from "./Acessos";

function abrir() {
  render(
    <MemoryRouter useTransitions={false}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ProvedorConfirmar>
          <Acessos alunoId="p1" />
        </ProvedorConfirmar>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
  h.perfil.mockResolvedValue(perfil());
  h.ler.mockResolvedValue({
    ok: true, paciente_id: "p1", tem_login: false, modulos: ["treino", "nutricao"], conta_modulos: ["treino", "nutricao"], tem_nutricionista: true,
    pode_mudar: true, linhas: { acesso_app: "bloqueado", diario_alimentar: "liberado", acesso_link: "liberado", dieta: "ver" }, mudancas: {},
  });
  h.series.mockResolvedValue({ ok: true, series: "mexer", pode_mudar: true });
  h.acesso.mockResolvedValue({ paciente_id: "p1", nome: "Rafael Moura", email: "rafa@teste.com", ativo: true, conta_id: "c1", acesso: null, agora: new Date().toISOString() });
});

describe("W-A P4 — Perfil do aluno › Acessos (spec §4.1)", () => {
  it("o topo com o 1º nome; à esquerda as linhas, à direita o Login do aluno (o card que era do Resumo, igual)", async () => {
    abrir();
    expect(await screen.findByText(/O que Rafael pode fazer no app\. Qualquer profissional dele/)).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('[data-aba-acessos="pronto"]')).not.toBeNull());
    expect(await screen.findByText("Login do aluno")).toBeInTheDocument();
    expect(await screen.findByText("SEM ACESSO")).toBeInTheDocument();
    const grade = document.querySelector('[data-aba-acessos="pronto"]')!.parentElement!;
    expect(grade.className).toContain("grid-cols-1");
    expect(grade.className).toContain("lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]");
    expect(grade.children[1].matches("[data-card-acesso-aluno]")).toBe(true);
    expect(h.ler).toHaveBeenCalledWith("p1");
    expect(h.acesso).toHaveBeenCalledWith("p1");
  });
});
