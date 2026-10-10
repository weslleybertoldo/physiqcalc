import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { conta, matricula, situacao } from "@/test/fixturesNucleo";
import type { Situacao } from "@/nucleo/situacao";

const h = vi.hoisted(() => ({
  sessao: {} as Record<string, unknown>,
  auth: { user: { id: "t1" } as null | { id: string } },
  statusTreino: null as null | string,
  online: true,
}));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => h.auth }));
vi.mock("@/ui/premium/useOnline", () => ({ useOnline: () => h.online }));
vi.mock("@powersync/react", () => ({ useQuery: () => ({ data: h.statusTreino ? [{ status: h.statusTreino }] : [], isLoading: false }) }));

import GateBloqueioAluno from "./GateBloqueioAluno";
import { usePerfilReduzido } from "./pecas/modoReduzido";
import { bloqueioDoProfissional } from "./pecas/bloqueioAluno";

function OApp() {
  const r = usePerfilReduzido();
  return <div>{r ? `perfil reduzido: ${r.titulo} — ${r.mensagem}` : "o app"}</div>;
}
function montar(caminho = "/treino") {
  return render(
    <MemoryRouter useTransitions={false} initialEntries={[caminho]}>
      <Routes>
        <Route path="*" element={<GateBloqueioAluno><OApp /></GateBloqueioAluno>} />
      </Routes>
    </MemoryRouter>,
  );
}

const livre = () => situacao({ modulos_aluno: ["treino"], matriculas: [matricula()] });
const bloqueado = (msg: string | null = null) => situacao({ modulos_aluno: ["treino"], matriculas: [matricula({ bloqueada: true, bloqueio_msg: msg })] });
const recarregar = vi.fn(async () => null as Situacao | null);
const tentar = vi.fn();

beforeEach(() => {
  h.sessao = { situacao: livre(), sair: vi.fn(async () => {}), recarregarSituacao: recarregar, treino: { estado: "pronto", erro: null }, tentarTreinoDeNovo: tentar };
  h.auth = { user: { id: "t1" } };
  h.statusTreino = "ativo";
  h.online = true;
  recarregar.mockReset();
  recarregar.mockResolvedValue(null);
  tentar.mockReset();
});

describe("W13 (F5) — GateBloqueioAluno: \"Acesso pausado pelo seu profissional\" (R10, spec 9)", () => {
  it("bloqueado no principal → o app fecha com a mensagem do profissional; Sair e Exportar/Excluir aparecem", () => {
    h.sessao.situacao = bloqueado("Fale comigo para regularizar.");
    montar();
    expect(screen.getByText("Acesso pausado pelo seu profissional")).toBeInTheDocument();
    expect(screen.getByText("Fale comigo para regularizar.")).toBeInTheDocument();
    expect(screen.queryByText("o app")).toBeNull();
    expect(screen.getByRole("button", { name: /Sair/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Exportar ou excluir meus dados/ }));
    expect(screen.getByText("perfil reduzido: Acesso pausado pelo seu profissional — Fale comigo para regularizar.")).toBeInTheDocument();
  });

  it("SEM INTERNET: a situação guardada é de antes do bloqueio, mas o espelho do PowerSync já diz 'bloqueado' → fecha", () => {
    h.online = false;
    h.statusTreino = "bloqueado";
    montar();
    expect(screen.getByText("Acesso pausado pelo seu profissional")).toBeInTheDocument();
    expect(recarregar).not.toHaveBeenCalled();
  });

  it("com internet e o espelho velho: confere no servidor; desbloqueado → abre e refaz a troca de token", async () => {
    h.statusTreino = "bloqueado";
    h.sessao.treino = { estado: "erro", erro: "bloqueado" };
    recarregar.mockResolvedValue(livre());
    montar();
    await act(async () => {});
    expect(recarregar).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("o app")).toBeInTheDocument();
    expect(tentar).toHaveBeenCalled();
  });

  it("desbloqueado (principal e espelho livres) → o app abre; o Perfil é o completo", () => {
    montar("/perfil");
    expect(screen.getByText("o app")).toBeInTheDocument();
  });

  it("/perfil com o app fechado abre no modo reduzido (Sair, Exportar e Excluir)", () => {
    h.sessao.situacao = bloqueado();
    montar("/perfil");
    expect(screen.getByText(/perfil reduzido: Acesso pausado pelo seu profissional/)).toBeInTheDocument();
  });

  it("quem também é profissional nunca é travado aqui (P7)", () => {
    h.sessao.situacao = situacao({ modulos_aluno: ["treino"], contas: [conta()], matriculas: [matricula({ bloqueada: true })] });
    h.statusTreino = "bloqueado";
    montar();
    expect(screen.getByText("o app")).toBeInTheDocument();
  });
});

describe("W13 — bloqueioDoProfissional (regra pura)", () => {
  it("todas as matrículas ativas bloqueadas; uma livre de só Nutrição mantém o app aberto", () => {
    const duas = situacao({
      matriculas: [matricula({ id: "a", bloqueada: true, modulos: ["treino"] }), matricula({ id: "b", conta_id: "c2", modulos: ["nutricao"] })],
    });
    expect(bloqueioDoProfissional(duas).bloqueado).toBe(false);
    expect(bloqueioDoProfissional(duas, { status: "bloqueado" }).bloqueado).toBe(false);
    expect(bloqueioDoProfissional(bloqueado()).fonte).toBe("principal");
    expect(bloqueioDoProfissional(livre(), { status: "bloqueado" }).fonte).toBe("treino");
    expect(bloqueioDoProfissional(livre(), { status: "bloqueado" }, true).bloqueado).toBe(false);
    // desativada não conta como "viva"
    expect(bloqueioDoProfissional(situacao({ matriculas: [matricula({ ativo: false, bloqueada: true })] })).bloqueado).toBe(false);
  });
});
