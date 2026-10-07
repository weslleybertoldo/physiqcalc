import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { matricula, situacao } from "@/test/fixturesNucleo";

const h = vi.hoisted(() => ({
  // `__APP_VERSION__` é injetado pelo Vite (define) — no vitest não existe
  versao: ((globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = "3.6"),
  sessao: {} as Record<string, unknown>,
  perfil: {} as Record<string, unknown>,
  agenda: [] as Array<Record<string, unknown>>,
  resumo: null as null | Array<Record<string, unknown>>,
  conferencia: null as null | Record<string, unknown>,
  erroConferencia: null as null | string,
  excluir: vi.fn(),
  previa: vi.fn(),
  // W2 da loja: a folha pergunta antes ao caminho do profissional (null = só aluno → "nao_profissional")
  profissional: null as null | Record<string, unknown>,
}));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));
vi.mock("@/financeiro/useResumoFinanceiro", () => ({ useResumoFinanceiro: () => ({ resumo: h.resumo, carregando: false, erro: false }) }));
vi.mock("@/app-aluno/perfil/pecas/api", async (orig) => {
  const real = await orig<typeof import("@/app-aluno/perfil/pecas/api")>();
  return {
    ...real,
    meuPerfilAluno: async () => h.perfil,
    minhaAgenda: async () => h.agenda,
    conferirExclusao: async () => {
      if (h.erroConferencia) throw new real.ErroPerfil(h.erroConferencia);
      return h.conferencia;
    },
    excluirMinhaConta: (t: string) => h.excluir(t),
  };
});

vi.mock("@/painel/configuracoes/excluirConta/api", async (orig) => {
  const real = await orig<typeof import("@/painel/configuracoes/excluirConta/api")>();
  return {
    ...real,
    conferirExclusaoProfissional: async () => {
      if (!h.profissional) throw new real.ErroExclusao("nao_profissional");
      return h.profissional;
    },
  };
});

vi.mock("@/nucleo/vinculo", async (orig) => ({ ...(await orig<typeof import("@/nucleo/vinculo")>()), previaDoCodigo: (c: string) => h.previa(c) }));

import Perfil from "./Perfil";
import { PerfilReduzido } from "@/app-aluno/gates/pecas/PerfilReduzido";

function montar(reduzido = false, rota = "/perfil") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tela = reduzido ? (
    <PerfilReduzido motivo="bloqueio-master" titulo="Acesso pausado" mensagem="Regularize com o Lucas.">
      <Perfil />
    </PerfilReduzido>
  ) : (
    <Perfil />
  );
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[rota]}>{tela}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const sair = vi.fn(async () => {});

beforeEach(() => {
  localStorage.clear();
  h.sessao = {
    usuario: { id: "u1", email: "rafael@teste.com" },
    situacao: situacao({ nome: "Rafael Moura", modulos_aluno: ["treino", "nutricao"], matriculas: [matricula({ modulos: ["treino", "nutricao"] })] }),
    sair,
    vincularCodigo: vi.fn(async () => ({ ok: false, erro: "codigo_invalido" })),
    recarregarSituacao: vi.fn(async () => null),
  };
  h.perfil = {
    nome: "Rafael Moura", foto_url: null, foto_propria: null, aluno_desde: "2026-03-10T12:00:00Z", objetivo: "Definição",
    profissionais: [
      { id: "u9", papel: "personal", nome: "Lucas Ferreira", foto_url: null, whatsapp: "+5582999990000", conta_nome: "Consultoria" },
      { id: "u8", papel: "nutricionista", nome: "Camila Rocha", foto_url: null, whatsapp: null, conta_nome: "Consultoria" },
    ],
  };
  h.agenda = [{ id: "a1", inicio: "2099-07-18T13:00:00Z", fim: "2099-07-18T14:00:00Z", status: "agendado", titulo: "Retorno", profissional: "Camila Rocha", papel: "nutricionista" }];
  h.resumo = null;
  h.conferencia = null;
  h.erroConferencia = null;
  h.excluir.mockReset();
  h.previa.mockReset();
  h.profissional = null;
  sair.mockClear();
});

describe("aba Perfil (tela 5)", () => {
  it("completo: card, Meus profissionais (WhatsApp só com número), as linhas e Exportar/Excluir/Sair", async () => {
    montar();
    expect(await screen.findByText("Aluno desde mar/2026 · Objetivo: definição")).toBeInTheDocument();
    expect(screen.getByText("TREINO")).toBeInTheDocument();
    expect(screen.getByText("NUTRIÇÃO")).toBeInTheDocument();
    expect(await screen.findByText("Lucas Ferreira")).toBeInTheDocument();
    expect(screen.getByText("Personal trainer")).toBeInTheDocument();
    expect(screen.getByText("Nutricionista")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /no WhatsApp/ })).toHaveLength(1);
    for (const l of ["Agenda", "Pagamentos", "Lembrete de treino", "Som do descanso", "Aparência", "Exportar meus dados", "Excluir minha conta", "Sair"]) {
      expect(screen.getByText(l)).toBeInTheDocument();
    }
    expect(await screen.findByText("sáb, 18/07")).toBeInTheDocument();
    expect(screen.getByText("Bip")).toBeInTheDocument();
    expect(screen.getByText("Escuro")).toBeInTheDocument();
    expect(screen.getByText("Desligado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Conta" })).toBeInTheDocument();
  });

  it("W3 da loja: embaixo do Sair, os links da política de privacidade e dos termos", async () => {
    montar();
    expect(await screen.findByText("Aluno desde mar/2026 · Objetivo: definição")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Política de privacidade" }).getAttribute("href")).toBe("/privacidade");
    expect(screen.getByRole("link", { name: "Termos de uso" }).getAttribute("href")).toBe("/termos");
  });

  it("lembrete e som vêm das chaves de hoje do aparelho", async () => {
    localStorage.setItem("physiq_workout_reminder", JSON.stringify({ hour: 18, minute: 30, enabled: true }));
    localStorage.setItem("physiq_som_descanso", "sino");
    montar();
    expect(await screen.findByText("18:30")).toBeInTheDocument();
    expect(screen.getByText("Sino")).toBeInTheDocument();
  });

  it("só Nutrição: sem Lembrete de treino e sem Som do descanso", async () => {
    h.sessao.situacao = situacao({ modulos_aluno: ["nutricao"], matriculas: [matricula({ modulos: ["nutricao"] })] });
    montar();
    expect(await screen.findByText("Agenda")).toBeInTheDocument();
    expect(screen.queryByText("Lembrete de treino")).toBeNull();
    expect(screen.queryByText("Som do descanso")).toBeNull();
    expect(screen.getByText("NUTRIÇÃO")).toBeInTheDocument();
    expect(screen.queryByText("TREINO")).toBeNull();
  });

  it("sem profissional: o campo do código; errado → erro no popup; certo → popup com nome e tipo, Confirmar vincula", async () => {
    h.perfil = { ...h.perfil, profissionais: [] };
    const vincular = vi.fn(async () => ({ ok: true, profissional: "Lucas Ferreira" }));
    h.sessao.vincularCodigo = vincular;
    h.previa.mockResolvedValueOnce({ ok: false, erro: "codigo_invalido", jaEra: false, contaNome: null, modulos: [], profissional: null });
    montar();
    expect(await screen.findByText("Tenho um código do meu profissional")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Código do profissional"), { target: { value: "prof-nao-existe" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar na lista" }));
    expect(await screen.findByText("Não achamos esse código. Confira com o seu profissional.")).toBeInTheDocument();
    expect(h.previa).toHaveBeenCalledWith("PROF-NAO-EXISTE");
    fireEvent.click(document.querySelector("[data-vinculo-fechar]") as HTMLButtonElement);
    await waitFor(() => expect(document.querySelector("[data-popup-vinculo]")).toBeNull());
    expect(vincular).not.toHaveBeenCalled();
    h.previa.mockResolvedValueOnce({
      ok: true, erro: null, jaEra: false, contaNome: "Consultoria", modulos: ["treino", "nutricao"],
      profissional: { nome: "Lucas Ferreira", foto_url: null, tipo_perfil: null, papeis: ["personal"] },
    });
    fireEvent.change(screen.getByLabelText("Código do profissional"), { target: { value: "prof-lucas" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar na lista" }));
    expect(await screen.findByText("PERSONAL TRAINER (ED. FÍSICA)")).toBeInTheDocument();
    expect(screen.getByText(/receber o treino e a dieta pelo Physiq/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(vincular).toHaveBeenCalledWith("PROF-LUCAS"));
    expect(await screen.findByText(/Pronto! Você entrou na lista de Lucas Ferreira/)).toBeInTheDocument();
  });

  it("reduzido (aluno bloqueado — spec 9): só Sair, Exportar e Excluir", async () => {
    montar(true);
    expect(await screen.findByText("Acesso pausado")).toBeInTheDocument();
    expect(screen.getByText(/Regularize com o Lucas/)).toBeInTheDocument();
    expect(screen.getByText("Exportar meus dados")).toBeInTheDocument();
    expect(screen.getByText("Excluir minha conta")).toBeInTheDocument();
    expect(screen.getByText("Sair")).toBeInTheDocument();
    for (const l of ["Meus profissionais", "Agenda", "Pagamentos", "Lembrete de treino", "Som do descanso", "Aparência"]) {
      expect(screen.queryByText(l)).toBeNull();
    }
    expect(screen.queryByRole("button", { name: "Conta" })).toBeNull();
    // W3 da loja: a política continua à mão para quem está bloqueado
    expect(screen.getByRole("link", { name: "Política de privacidade" })).toBeInTheDocument();
  });

  it("Excluir: confere antes, o botão só liga com EXCLUIR digitado e então exclui e sai", async () => {
    h.conferencia = {
      ok: true, simulacao: true,
      apaga: { principal: { diario_alimentar: 2 }, treino: { treino_historico: 6, tb_treino_series: 28 } },
      mantem: { principal: { matriculas: 1, cobrancas: 3 }, treino: { physiq_avaliacoes: 5 } },
    };
    h.excluir.mockResolvedValue({ ok: true });
    montar();
    fireEvent.click(await screen.findByText("Excluir minha conta"));
    expect(await screen.findByText(/6 treino\(s\) feito\(s\) e 28 série\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/Avaliações e fotos de avaliação \(5\)/)).toBeInTheDocument();
    const botao = document.querySelector("[data-excluir-confirmar]") as HTMLButtonElement;
    expect(botao).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Para confirmar, digite EXCLUIR"), { target: { value: "EXCLUI" } });
    expect(botao).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Para confirmar, digite EXCLUIR"), { target: { value: "excluir" } });
    expect(botao).not.toBeDisabled();
    fireEvent.click(botao);
    await waitFor(() => expect(h.excluir).toHaveBeenCalledWith("excluir"));
    await waitFor(() => expect(sair).toHaveBeenCalled());
  });

  it("Excluir de quem é profissional: recusa apontando o painel › Configurações (W2 da loja — nada é excluído)", async () => {
    h.erroConferencia = "profissional";
    montar();
    fireEvent.click(await screen.findByText("Excluir minha conta"));
    expect(await screen.findByText(/a exclusão é feita no painel, em Configurações › Excluir minha conta/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Excluir no painel/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("Para confirmar, digite EXCLUIR")).toBeNull();
    expect(h.excluir).not.toHaveBeenCalled();
  });

  it("W2 da loja: o caminho do profissional reconhece o dono — a folha aponta o painel sem chamar o \"Excluir\" do aluno", async () => {
    h.profissional = { ok: true, simulacao: true, perfil: "dono", nome: "Sofia", contas: [], equipes: [], ex_equipes: 0, sem_conta: null, aluno: null, treino: null,
      cobrancas_a_cancelar: 0 };
    h.conferencia = { ok: true, simulacao: true, apaga: { principal: {}, treino: null }, mantem: { principal: {}, treino: null } };
    montar();
    fireEvent.click(await screen.findByText("Excluir minha conta"));
    expect(await screen.findByRole("button", { name: /Excluir no painel/ })).toBeInTheDocument();
    expect(document.querySelector('[data-estado-excluir="profissional-dono"]')).not.toBeNull();
    expect(screen.queryByLabelText("Para confirmar, digite EXCLUIR")).toBeNull();
  });

  it("W2 da loja: quem já foi membro de equipe (sem painel) exclui ali mesmo, pelo fluxo do profissional", async () => {
    h.profissional = { ok: true, simulacao: true, perfil: "ex_profissional", nome: "Ex Membro", contas: [], equipes: [], ex_equipes: 1, sem_conta: null,
      aluno: { matriculas: 1, contas: ["Consultoria"], apaga: {}, mantem: {} }, treino: null, cobrancas_a_cancelar: 0 };
    montar();
    fireEvent.click(await screen.findByText("Excluir minha conta"));
    expect(await screen.findByText("Antes de excluir, confira o que acontece")).toBeInTheDocument();
    expect(screen.getByText(/o que você registrou para os alunos de uma equipe fica com a conta da equipe/i)).toBeInTheDocument();
    expect(document.querySelector("[data-excluir-fluxo-profissional]")).not.toBeNull();
    expect(h.excluir).not.toHaveBeenCalled();
  });

  it("W2 da loja: /perfil?excluir=1 (a página /excluir-conta) abre direto o Excluir minha conta", async () => {
    h.conferencia = { ok: true, simulacao: true, apaga: { principal: {}, treino: null }, mantem: { principal: { matriculas: 1 }, treino: null } };
    montar(false, "/perfil?excluir=1");
    expect(await screen.findByLabelText("Para confirmar, digite EXCLUIR")).toBeInTheDocument();
    expect(document.querySelector("[data-sheet-excluir]")).not.toBeNull();
  });
});
