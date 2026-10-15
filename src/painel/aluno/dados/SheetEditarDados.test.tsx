import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { perfil } from "@/test/fixturesPerfilAluno";
import type { PerfilAluno, PerfilTreinoAluno } from "./tipos";

// hml-25 (H-137): a folha "Editar dados" repunha o formulário (e limpava os avisos de e-mail/CPF repetidos) a cada `inicial` novo —
// a troca do Treino que terminava com a folha aberta, a rebusca do perfil — e o Salvar, sem diferença, fechava sem gravar. Agora repõe
// tudo só quando a folha ABRE; com ela aberta, o `inicial` novo mescla (o campo tocado fica, o não tocado recebe o valor novo).
// O tocado só vale enquanto o valor difere da base: o campo mexido e devolvido ao valor da base recebe o novo (revisão da hml-25).

const h = vi.hoisted(() => ({
  estado: "trocando",
  dados: vi.fn(),
  noTreino: vi.fn(),
  livre: vi.fn(),
  sucesso: vi.fn(),
  erro: vi.fn(),
}));
vi.mock("./api", () => ({
  ErroPerfil: class extends Error {
    constructor(public codigo: string, public extra: Record<string, unknown> = {}) {
      super(codigo);
    }
  },
  buscarPerfilAluno: vi.fn(),
  buscarDadosTreino: vi.fn(),
  salvarDadosAluno: h.dados,
  salvarNoTreino: h.noTreino,
}));
vi.mock("@/nucleo/dadoLivre", () => ({ conferirDadoLivre: h.livre }));
// a sessão do Banco do Treino: "trocando" (a troca ainda não terminou) → "pronto" (terminou com a folha aberta)
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ treino: { estado: h.estado, erro: null } }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("sonner", () => ({ toast: { success: h.sucesso, error: h.erro } }));

import { SheetEditarDados } from "./SheetEditarDados";

/** O que o admin-get-user devolve do aluno com treino (a altura e o peso de lá). */
const TREINO: PerfilTreinoAluno = {
  nome: "Rafael Moura", email: null, sexo: "male", idade: 28, data_nascimento: "1998-03-10", peso: 84.2, altura: 178, foto_url: null, created_at: null,
};
const REPETIDO = /Já existe um aluno com este e-mail\./;

function folha(o: { perfil: PerfilAluno; treino: PerfilTreinoAluno | null; aberto?: boolean; aoFechar?: () => void }) {
  return <SheetEditarDados aberto={o.aberto ?? true} aoFechar={o.aoFechar ?? (() => {})} perfil={o.perfil} treino={o.treino} alunoId="p1" />;
}

function montar(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(ui, { wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> });
}

const campo = (marca: string) => document.body.querySelector<HTMLInputElement>(`[data-editar-${marca}]`);
const digitar = (marca: string, valor: string) => fireEvent.change(campo(marca)!, { target: { value: valor } });
const salvar = () => fireEvent.click(document.body.querySelector("[data-editar-salvar]")!);

beforeEach(() => {
  h.estado = "trocando";
  h.dados.mockReset();
  h.noTreino.mockReset();
  h.livre.mockReset();
  h.sucesso.mockReset();
  h.erro.mockReset();
});

describe("Editar dados › o dado que chega com a folha aberta (hml-25, H-137)", () => {
  it("(a) a troca do Treino termina com a folha aberta: o nome digitado FICA e a altura/peso do Treino aparecem", async () => {
    const p = perfil({ treino_user_id: "t1" });
    const r = montar(folha({ perfil: p, treino: null }));
    expect(campo("nome")).toHaveValue("Rafael Moura");
    expect(campo("altura")).toBeNull();
    expect(document.body.querySelector("[data-editar-corpo-aviso]")).not.toBeNull();
    digitar("nome", "Rafael Moura Silva");
    h.estado = "pronto";
    r.rerender(folha({ perfil: p, treino: TREINO }));
    await waitFor(() => expect(campo("altura")).toHaveValue("178"));
    expect(campo("peso")).toHaveValue("84,2");
    expect(campo("nome")).toHaveValue("Rafael Moura Silva");
  });

  it("(b) a rebusca do perfil com a folha aberta: o campo tocado fica; o não tocado recebe o valor novo", () => {
    h.estado = "desnecessario";
    const r = montar(folha({ perfil: perfil(), treino: null }));
    digitar("nome", "Rafael Moura Silva");
    // outro objeto com os mesmos valores (a leitura devolve o `agora` de novo a cada vez)
    r.rerender(folha({ perfil: perfil({ agora: "2026-09-30T19:46:00Z" }), treino: null }));
    expect(campo("nome")).toHaveValue("Rafael Moura Silva");
    expect(campo("apelido")).toHaveValue("Rafa");
    // um campo que a pessoa NÃO tocou chega com valor novo (gravado em outro lugar)
    r.rerender(folha({ perfil: perfil({ apelido: "Rafinha", agora: "2026-09-30T19:47:00Z" }), treino: null }));
    expect(campo("apelido")).toHaveValue("Rafinha");
    expect(campo("nome")).toHaveValue("Rafael Moura Silva");
  });

  it("(c) o Salvar depois da mescla manda SÓ o que a pessoa mudou em relação à base nova", async () => {
    const aoFechar = vi.fn();
    const r = montar(folha({ perfil: perfil({ treino_user_id: "t1" }), treino: null, aoFechar }));
    digitar("nome", "Rafael Moura Silva");
    h.estado = "pronto";
    r.rerender(folha({ perfil: perfil({ treino_user_id: "t1", apelido: "Rafinha" }), treino: TREINO, aoFechar }));
    await waitFor(() => expect(campo("altura")).toHaveValue("178"));
    h.dados.mockResolvedValue(perfil({ treino_user_id: "t1", nome: "Rafael Moura Silva", apelido: "Rafinha" }));
    h.noTreino.mockResolvedValue(undefined);
    salvar();
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
    expect(h.dados).toHaveBeenCalledTimes(1);
    expect(h.dados).toHaveBeenCalledWith("p1", { nome: "Rafael Moura Silva" });
    // o nome mudou: o cadastro vai também ao Banco do Treino, com a altura e o peso que chegaram (não tocados)
    expect(h.noTreino).toHaveBeenCalledWith("t1", expect.objectContaining({ nome: "Rafael Moura Silva", altura: 178, peso: 84.2 }));
  });

  it("(d) fechar e abrir de novo repõe tudo: o digitado, o erro e o aviso de repetido somem; vale o que chegou com ela fechada", async () => {
    h.estado = "desnecessario";
    h.livre.mockResolvedValue({ email_livre: false, cpf_livre: true });
    const r = montar(folha({ perfil: perfil(), treino: null }));
    digitar("email", "outra@teste.com");
    fireEvent.blur(campo("email")!);
    expect(await screen.findByText(REPETIDO)).toBeInTheDocument();
    digitar("nome", "R");
    salvar();
    expect(await screen.findByText("Escreva o nome do aluno.")).toBeInTheDocument();
    r.rerender(folha({ perfil: perfil(), treino: null, aberto: false }));
    r.rerender(folha({ perfil: perfil({ apelido: "Rafinha" }), treino: null, aberto: false }));
    r.rerender(folha({ perfil: perfil({ apelido: "Rafinha" }), treino: null, aberto: true }));
    expect(campo("nome")).toHaveValue("Rafael Moura");
    expect(campo("email")).toHaveValue("rafa@teste.com");
    expect(campo("apelido")).toHaveValue("Rafinha");
    expect(screen.queryByText(REPETIDO)).toBeNull();
    expect(document.body.querySelector("[data-editar-erro]")).toBeNull();
    expect(h.dados).not.toHaveBeenCalled();
  });

  it("(e) o aviso de e-mail repetido NÃO some quando o inicial muda com a folha aberta (e o Salvar segue travado)", async () => {
    h.livre.mockResolvedValue({ email_livre: false, cpf_livre: true });
    const aoFechar = vi.fn();
    const p = perfil({ treino_user_id: "t1" });
    const r = montar(folha({ perfil: p, treino: null, aoFechar }));
    digitar("email", "outra@teste.com");
    fireEvent.blur(campo("email")!);
    expect(await screen.findByText(REPETIDO)).toBeInTheDocument();
    expect(h.livre).toHaveBeenCalledWith({ email: "outra@teste.com", pacienteId: "p1" });
    h.estado = "pronto";
    r.rerender(folha({ perfil: p, treino: TREINO, aoFechar }));
    await waitFor(() => expect(campo("altura")).toHaveValue("178"));
    expect(screen.getByText(REPETIDO)).toBeInTheDocument();
    expect(campo("email")).toHaveValue("outra@teste.com");
    salvar();
    expect(h.dados).not.toHaveBeenCalled();
    expect(aoFechar).not.toHaveBeenCalled();
  });

  it("(f) a data mexida e apagada antes da troca do Treino: a data do Treino aparece e o Salvar manda SÓ o nome (não apaga a data de lá)", async () => {
    const aoFechar = vi.fn();
    const p = perfil({ treino_user_id: "t1", nascimento: null });
    const r = montar(folha({ perfil: p, treino: null, aoFechar }));
    expect(campo("nascimento")).toHaveValue("");
    digitar("nascimento", "1999-01-01");
    digitar("nascimento", "");
    h.estado = "pronto";
    r.rerender(folha({ perfil: p, treino: TREINO, aoFechar }));
    await waitFor(() => expect(campo("altura")).toHaveValue("178"));
    // voltou ao valor da base: não é mais tocado e recebe a data do Treino (o principal sem data → a do Treino, no formDoPerfil)
    expect(campo("nascimento")).toHaveValue("1998-03-10");
    digitar("nome", "Rafael Moura Silva");
    h.dados.mockResolvedValue(perfil({ treino_user_id: "t1", nascimento: null, nome: "Rafael Moura Silva" }));
    h.noTreino.mockResolvedValue(undefined);
    salvar();
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
    expect(h.dados).toHaveBeenCalledTimes(1);
    expect(h.dados).toHaveBeenCalledWith("p1", { nome: "Rafael Moura Silva" });
    expect(h.noTreino).toHaveBeenCalledTimes(1);
    expect(h.noTreino).toHaveBeenCalledWith("t1", expect.objectContaining({ nome: "Rafael Moura Silva", data_nascimento: "1998-03-10" }));
  });

  it("(g) o apelido mexido e devolvido ao original: a rebusca traz o apelido novo e o Salvar manda SÓ o nome", async () => {
    h.estado = "desnecessario";
    const aoFechar = vi.fn();
    const r = montar(folha({ perfil: perfil(), treino: null, aoFechar }));
    digitar("nome", "Rafael Moura Silva");
    digitar("apelido", "Rafa M");
    digitar("apelido", "Rafa");
    // o apelido gravado em outro lugar chega com a folha aberta
    r.rerender(folha({ perfil: perfil({ apelido: "Rafinha", agora: "2026-09-30T19:47:00Z" }), treino: null, aoFechar }));
    expect(campo("apelido")).toHaveValue("Rafinha");
    expect(campo("nome")).toHaveValue("Rafael Moura Silva");
    h.dados.mockResolvedValue(perfil({ nome: "Rafael Moura Silva", apelido: "Rafinha" }));
    salvar();
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
    expect(h.dados).toHaveBeenCalledTimes(1);
    expect(h.dados).toHaveBeenCalledWith("p1", { nome: "Rafael Moura Silva" });
    expect(h.noTreino).not.toHaveBeenCalled();
  });

  it("(h) o Salvar no vão da troca do Treino (a altura mudada e a sessão de lá saiu de pronto): avisa que a altura e o peso não chegaram", async () => {
    h.estado = "pronto";
    const aoFechar = vi.fn();
    const p = perfil({ treino_user_id: "t1" });
    const r = montar(folha({ perfil: p, treino: TREINO, aoFechar }));
    expect(campo("altura")).toHaveValue("178");
    digitar("altura", "180");
    // a sessão do Treino sai de "pronto" com a folha aberta (a troca refeita): a altura e o peso somem da folha
    h.estado = "trocando";
    r.rerender(folha({ perfil: p, treino: TREINO, aoFechar }));
    expect(campo("altura")).toBeNull();
    salvar();
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
    expect(h.erro).toHaveBeenCalledWith("O cadastro foi salvo, mas a altura e o peso não chegaram ao treino. Tente de novo.");
    expect(h.noTreino).not.toHaveBeenCalled();
    expect(h.dados).not.toHaveBeenCalled();
    // o resto do fluxo não muda (o mesmo da falha do salvarNoTreino)
    expect(h.sucesso).toHaveBeenCalledWith("Dados salvos.");
  });
});
