import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// play-W6 — o vínculo e a exclusão avisam que a assinatura da Google Play é cancelada (o servidor cancela: vale até o fim do mês
// pago, sem devolver — decisão 7). Quem sabe da Play é o resumo do aluno (financeiro_do_aluno.play); a prévia da vincular-aluno não muda.
const h = vi.hoisted(() => ({ loja: false, resumo: null as unknown }));
vi.mock("@/lib/distribuicao", () => ({
  get ehLoja() {
    return h.loja;
  },
}));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ sair: async () => {}, vincularCodigo: async () => ({ ok: true }), usuario: { id: "u1" } }) }));
vi.mock("@/financeiro/useResumoFinanceiro", () => ({ useResumoFinanceiro: () => ({ resumo: h.resumo, carregando: false, erro: false }) }));
vi.mock("@/nucleo/vinculo", async (orig) => ({
  ...(await orig<typeof import("@/nucleo/vinculo")>()),
  previaDoCodigo: async () => ({
    ok: true, erro: null, jaEra: false, contaNome: "Consultoria Ferreira", modulos: ["treino"],
    profissional: { nome: "Lucas Ferreira", foto_url: null, tipo_perfil: "personal", papeis: ["personal"] },
    app: { valor: 29.9, plano: "Treino", assinatura_ativa: false },
  }),
}));
vi.mock("@/painel/configuracoes/excluirConta/api", async (orig) => {
  const real = await orig<typeof import("@/painel/configuracoes/excluirConta/api")>();
  return { ...real, conferirExclusaoProfissional: async () => { throw new real.ErroExclusao("nao_profissional"); } };
});
vi.mock("@/app-aluno/perfil/pecas/api", async (orig) => ({
  ...(await orig<typeof import("@/app-aluno/perfil/pecas/api")>()),
  conferirExclusao: async () => ({ ok: true, simulacao: true, apaga: { principal: {}, treino: null }, mantem: { principal: { matriculas: 1 }, treino: null } }),
}));

import { MENSAGEM_ERRO_CONTA } from "@/app-aluno/perfil/pecas/api";
import { SheetExcluir } from "@/app-aluno/perfil/pecas/SheetExcluir";
import { ConfirmarVinculo } from "@/ui/vinculo/ConfirmarVinculo";

const comPlay = (estado = "ativa") => [{ paciente_id: "pa", app: true, play: { estado, renova: estado !== "cancelada", expira_em: "2026-11-16T13:00:00Z", produto: "app_treino" } }];

beforeEach(() => {
  h.loja = false;
  h.resumo = null;
});

describe("o vínculo avisa", () => {
  it("com a Play viva: 'a assinatura da Google Play é cancelada (vale até o fim do mês pago, sem devolução)'", async () => {
    h.resumo = comPlay();
    render(<MemoryRouter useTransitions={false}><ConfirmarVinculo codigo="ABC123" aberto aoFechar={() => {}} /></MemoryRouter>);
    const aviso = await waitFor(() => {
      const el = document.querySelector("[data-vinculo-app]");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(aviso.textContent).toMatch(/e a assinatura da Google Play é cancelada \(vale até o fim do mês pago, sem devolução\)\. Daqui em diante/);
  });
  it("sem a Play (ou já cancelada), o aviso de sempre; na loja, sem o preço do banco", async () => {
    h.resumo = comPlay("cancelada");
    h.loja = true;
    render(<MemoryRouter useTransitions={false}><ConfirmarVinculo codigo="ABC123" aberto aoFechar={() => {}} /></MemoryRouter>);
    const aviso = await waitFor(() => {
      const el = document.querySelector("[data-vinculo-app]");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(aviso.textContent).not.toMatch(/Google Play/);
    expect(aviso.textContent).not.toMatch(/R\$/);
  });
});

describe("a exclusão avisa (o servidor cancela antes de apagar; o Google falhou → nada apagado)", () => {
  it("com a Play viva: o aviso antes de confirmar", async () => {
    h.resumo = comPlay();
    render(<MemoryRouter useTransitions={false}><SheetExcluir aberto aoMudar={() => {}} /></MemoryRouter>);
    expect(await screen.findByText(/A sua assinatura da Google Play é cancelada antes de excluir/)).toBeInTheDocument();
  });
  it("sem ela, nenhum aviso da Play; a recusa nova tem a frase própria", async () => {
    render(<MemoryRouter useTransitions={false}><SheetExcluir aberto aoMudar={() => {}} /></MemoryRouter>);
    await screen.findByText(/Vai ser apagado/);
    expect(document.querySelector("[data-excluir-play]")).toBeNull();
    expect(MENSAGEM_ERRO_CONTA.play_nao_cancelada).toMatch(/Nada foi apagado/);
  });
});
