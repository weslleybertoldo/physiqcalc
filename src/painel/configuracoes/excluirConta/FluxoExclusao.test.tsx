import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Conferencia } from "./api";

// W2 da loja — Configurações › Excluir minha conta: confere (nada muda) → baixa os prontuários (dono) → digita EXCLUIR → exclui e
// cai na página /excluir-conta com o resumo. Na versão da loja, nada de preço, "grátis" ou botão que leve a pagar.
const h = vi.hoisted(() => ({
  loja: false,
  conferencia: null as unknown,
  erroConferencia: null as null | { codigo: string; extra?: Record<string, unknown> },
  excluir: vi.fn(),
  zip: vi.fn(),
  salvar: vi.fn(),
  sair: vi.fn(async () => {}),
}));
vi.mock("@/lib/distribuicao", () => ({
  get ehLoja() {
    return h.loja;
  },
  get DISTRIBUICAO() {
    return h.loja ? "play" : "site";
  },
}));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ sair: h.sair }) }));
vi.mock("./api", async (orig) => {
  const real = await orig<typeof import("./api")>();
  return {
    ...real,
    conferirExclusaoProfissional: async () => {
      if (h.erroConferencia) throw new real.ErroExclusao(h.erroConferencia.codigo, h.erroConferencia.extra ?? {});
      return h.conferencia;
    },
    excluirContaProfissional: (t: string) => h.excluir(t),
  };
});
vi.mock("./zip", () => ({ montarZipDeProntuarios: (...a: unknown[]) => h.zip(...a), salvarZip: (...a: unknown[]) => h.salvar(...a) }));

import { FluxoExclusao } from "./FluxoExclusao";

const DONO: Conferencia = {
  ok: true, simulacao: true, perfil: "dono", nome: "Diana Dono", equipes: [], ex_equipes: 0, sem_conta: null, aluno: null,
  treino: { apaga: { treino_historico: 2, tb_treino_series: 9 }, mantem: { treinos_montados: 1 }, cobrancas: { plano: 0, alunos: 0 } },
  cobrancas_a_cancelar: 2,
  contas: [{
    id: "c1", nome: "W2L Consultoria Diana", origem: "nova", plano: "treino_nutricao", situacao: "teste", eu_nutri: true,
    alunos: { total: 2, para_o_app: 1, guardados: 1, lista: [{ nome: "Alice Aluna", destino: "app" }, { nome: "Bruno Sem Login", destino: "guardado" }] },
    membros: [{ nome: "Eduardo Equipe", email: "w2l.equipe@teste.app", papeis: ["personal"], convite: false }],
    convites_pendentes: 1,
    cobrancas: { plano: 1, alunos: 1 },
    prontuarios: [{ paciente_id: "p1", conta_id: "c1", nome: "Alice Aluna", registros: 1, restritos: 0 }, { paciente_id: "p2", conta_id: "c1", nome: "Bruno Sem Login", registros: 2, restritos: 0 }],
  }],
};
const MEMBRO: Conferencia = {
  ...DONO, perfil: "membro", nome: "Marcos", contas: [], cobrancas_a_cancelar: 0,
  equipes: [{ conta_nome: "W2L Estúdio Daniel", dono_nome: "Daniel", papeis: ["personal"], alunos_treino: 1, alunos_nutricao: 0 }],
};

let destino: { pathname: string; state: unknown } | null = null;
function Espiao() {
  const l = useLocation();
  destino = { pathname: l.pathname, state: l.state };
  return <div data-pagina-falsa>excluir-conta</div>;
}
const montar = () =>
  render(
    <MemoryRouter initialEntries={["/painel/configuracoes/excluir-conta"]}>
      <Routes>
        <Route path="/painel/configuracoes/excluir-conta" element={<FluxoExclusao />} />
        <Route path="/excluir-conta" element={<Espiao />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  h.loja = false;
  h.conferencia = DONO;
  h.erroConferencia = null;
  h.excluir.mockReset();
  h.zip.mockReset();
  h.salvar.mockReset();
  h.sair.mockClear();
  destino = null;
});

describe("Configurações › Excluir minha conta (W2 da loja)", () => {
  it("dono: conferência (alunos, equipe, cobrança, prontuários) → baixa o ZIP → EXCLUIR → exclui e mostra o resumo na página pública", async () => {
    h.zip.mockResolvedValue({ nome: "physiq-prontuarios-2026-10-06.zip", bytes: new Uint8Array([1]), pdfs: ["a.pdf", "b.pdf"] });
    h.salvar.mockResolvedValue("baixado");
    h.excluir.mockResolvedValue({ ok: true, perfil: "dono", resultado: { contas: ["W2L Consultoria Diana"], alunos_para_o_app: 1, alunos_guardados: 2, membros_removidos: 1,
      equipes_que_saiu: 0, cobrancas_canceladas: 2, treino: { login: "removido" }, arquivos: 0 } });
    montar();
    expect(await screen.findByText("Antes de excluir, confira o que acontece")).toBeInTheDocument();
    expect(screen.getByText(/1 aluno com login vira aluno do app, sem profissional, com 7 dias grátis/)).toBeInTheDocument();
    expect(screen.getByText(/Alice Aluna · app/)).toBeInTheDocument();
    expect(screen.getByText("Eduardo Equipe")).toBeInTheDocument();
    expect(screen.getByText(/w2l\.equipe@teste\.app/)).toBeInTheDocument();
    expect(screen.getByText(/A cobrança automática do plano desta conta é cancelada agora/)).toBeInTheDocument();
    expect(screen.getByText(/2 pacientes com prontuário/)).toBeInTheDocument();
    expect(screen.getByText(/1 convite pendente é cancelado/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText("Baixe os prontuários antes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Baixar prontuários \(\.zip\)/ }));
    expect(await screen.findByText(/Pronto: physiq-prontuarios-2026-10-06\.zip \(2 PDFs\)/)).toBeInTheDocument();
    expect(h.salvar).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByText(/A conta W2L Consultoria Diana é encerrada e 1 profissional perde o acesso/)).toBeInTheDocument();
    const botao = document.querySelector("[data-exclusao-confirmar]") as HTMLButtonElement;
    expect(botao).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Para confirmar, digite EXCLUIR"), { target: { value: "excluir" } });
    expect(botao).not.toBeDisabled();
    fireEvent.click(botao);
    await waitFor(() => expect(h.excluir).toHaveBeenCalledWith("excluir"));
    await waitFor(() => expect(destino?.pathname).toBe("/excluir-conta"));
    expect(destino?.state).toMatchObject({ excluida: { contas: ["W2L Consultoria Diana"], cobrancas_canceladas: 2, nome: "Diana Dono" } });
    await waitFor(() => expect(h.sair).toHaveBeenCalled());
  });

  it("dono: 'Não preciso baixar' libera o Continuar com o aviso", async () => {
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Continuar" }));
    const continuar = await screen.findByRole("button", { name: "Continuar" });
    expect(continuar).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Não preciso baixar\. Entendo que, depois de excluir, não terei mais acesso/));
    expect(continuar).not.toBeDisabled();
    expect(h.zip).not.toHaveBeenCalled();
  });

  it("membro: sai da equipe (alunos sem responsável), sem o passo de baixar", async () => {
    h.conferencia = MEMBRO;
    montar();
    expect(await screen.findByText("Equipe de W2L Estúdio Daniel")).toBeInTheDocument();
    expect(screen.getByText(/O seu aluno fica na conta, sem responsável, para o dono atribuir/)).toBeInTheDocument();
    expect(screen.queryByText(/Baixar prontuários/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText("Você sai da equipe de W2L Estúdio Daniel e o seu login é apagado. Não dá para desfazer.")).toBeInTheDocument();
  });

  it("master: recusado, com o contato do suporte", async () => {
    h.erroConferencia = { codigo: "profissional", extra: { motivo: "master" } };
    montar();
    expect(await screen.findByText(/Contas master não são excluídas pelo app/)).toBeInTheDocument();
    expect(document.querySelector("[data-exclusao-suporte]")).not.toBeNull();
    expect(screen.queryByLabelText("Para confirmar, digite EXCLUIR")).toBeNull();
  });

  it("o Mercado Pago não confirmou o cancelamento: a mensagem diz que nada foi excluído e dá para tentar de novo", async () => {
    h.conferencia = { ...DONO, contas: [{ ...DONO.contas[0], prontuarios: [] }] };
    h.excluir.mockRejectedValue(new (await import("./api")).ErroExclusao("cobranca_nao_cancelada"));
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Continuar" }));
    fireEvent.change(await screen.findByLabelText("Para confirmar, digite EXCLUIR"), { target: { value: "EXCLUIR" } });
    fireEvent.click(document.querySelector("[data-exclusao-confirmar]") as HTMLButtonElement);
    expect(await screen.findByText(/O Mercado Pago não confirmou agora o cancelamento da cobrança automática\. Nada foi excluído/)).toBeInTheDocument();
    expect(destino).toBeNull();
  });

  it("versão da loja: nada de preço, 'grátis', Mercado Pago ou botão de pagar em nenhum passo", async () => {
    h.loja = true;
    h.zip.mockResolvedValue({ nome: "physiq-prontuarios-2026-10-06.zip", bytes: new Uint8Array([1]), pdfs: ["a.pdf"] });
    h.salvar.mockResolvedValue("baixado");
    const { container } = montar();
    await screen.findByText("Antes de excluir, confira o que acontece");
    const proibido = /R\$|grátis|Mercado Pago|pague|assine|pagar agora|Pix/i;
    expect(container.textContent).not.toMatch(proibido);
    expect(screen.getByText(/1 aluno com login continua usando o app, agora sem profissional/)).toBeInTheDocument();
    expect(screen.getByText(/A cobrança automática do plano desta conta é cancelada agora/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByText("Baixe os prontuários antes");
    expect(container.textContent).not.toMatch(proibido);
    fireEvent.click(screen.getByRole("button", { name: /Baixar prontuários/ }));
    await screen.findByText(/Pronto:/);
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByLabelText("Para confirmar, digite EXCLUIR");
    expect(container.textContent).not.toMatch(proibido);
  });

  it("versão da loja: a recusa da cobrança no cartão do aluno não mostra botão de pagamentos", async () => {
    h.loja = true;
    h.erroConferencia = { codigo: "assinatura_ativa" };
    montar();
    expect(await screen.findByText(/Cancele em Perfil › Pagamentos/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Abrir Pagamentos/ })).toBeNull();
  });
});
