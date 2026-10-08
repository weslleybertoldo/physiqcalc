import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { conta, situacao } from "@/test/fixturesNucleo";
import { ROTA_EXCLUIR_CONTA, guardarPedidoExclusao, pedidoExclusaoPendente } from "@/lib/pedidoExclusao";
import { CONTATO_SUPORTE, linkDoSuporte } from "@/nucleo/suporte";
import type { Situacao } from "@/nucleo/situacao";
import { FRASE_BACKUPS } from "./privacidade/textos";

// W2 da loja — /excluir-conta (a URL do formulário "Segurança dos dados" da Google Play): sem login explica o caminho no app e no site
// e o que é apagado/guardado; "Entrar para excluir" → login → a tela de exclusão certa; depois de excluir, o resumo.
const h = vi.hoisted(() => ({
  loja: false,
  sessao: { pronto: true, usuario: null, situacao: null, erroSituacao: null } as {
    pronto: boolean; usuario: { id: string; email: string } | null; situacao: Situacao | null; erroSituacao: unknown;
  },
}));
vi.mock("@/lib/distribuicao", () => ({
  get ehLoja() {
    return h.loja;
  },
  get DISTRIBUICAO() {
    return h.loja ? "play" : "site";
  },
}));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));

import ExcluirConta from "./ExcluirConta";

let onde: { pathname: string; search: string; state: unknown } | null = null;
function Espiao() {
  const l = useLocation();
  onde = { pathname: l.pathname, search: l.search, state: l.state };
  return <div data-espiao>{l.pathname}</div>;
}
const abrir = (state?: unknown) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: ROTA_EXCLUIR_CONTA, state }]}>
      <Routes>
        <Route path={ROTA_EXCLUIR_CONTA} element={<ExcluirConta />} />
        <Route path="*" element={<Espiao />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.clear();
  h.loja = false;
  h.sessao = { pronto: true, usuario: null, situacao: null, erroSituacao: null };
  onde = null;
});

describe("/excluir-conta — sem login", () => {
  it("o caminho no app (aluno e profissional), o que é apagado, o que fica e por quê, e o contato do suporte", () => {
    abrir();
    expect(screen.getByRole("heading", { name: "Excluir a sua conta do Physiq" })).toBeInTheDocument();
    expect(screen.getByText(/Perfil › Excluir minha conta\./)).toBeInTheDocument();
    expect(screen.getByText(/Configurações › Excluir minha conta\./)).toBeInTheDocument();
    expect(screen.getByText(/não dá mais para entrar com ele/)).toBeInTheDocument();
    expect(screen.getByText(/Res\. CFN 594\/2017 e Lei 13\.787\/2018: 20 anos/)).toBeInTheDocument();
    expect(screen.getByText(/a cobrança automática do plano é cancelada/)).toBeInTheDocument();
    const suporte = screen.getByRole("link", { name: CONTATO_SUPORTE });
    expect(suporte.getAttribute("href")).toBe(linkDoSuporte("Excluir minha conta"));
  });
  it("W3/W4 da loja: as cópias de segurança com a MESMA frase da política — em até 30 dias, sem o 'até 7 dias'", () => {
    const { container } = abrir();
    expect(container.querySelector("[data-secao-excluir='guardado'] [data-frase-backups]")?.textContent).toBe(FRASE_BACKUPS);
    // hml-11 (A2): a frase passou a dizer a cópia diária cifrada da hml-07 — o prazo é o mesmo
    expect(container.textContent).toMatch(/são cifradas, guardadas no Brasil e apagadas em até 30 dias depois de feitas/);
    expect(container.textContent).not.toMatch(/até 7 dias/);
  });
  it("'Entrar para excluir' guarda o pedido e leva ao login voltando para esta página", () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: /Entrar para excluir/ }));
    expect(pedidoExclusaoPendente()).toBe(true);
    expect(onde).toMatchObject({ pathname: "/entrar", state: { de: ROTA_EXCLUIR_CONTA } });
  });
  it("versão da loja: sem 'grátis', preço ou como pagar", () => {
    h.loja = true;
    const { container } = abrir();
    expect(container.textContent).not.toMatch(/R\$|grátis|Mercado Pago|pague|assine|Pix/i);
    expect(screen.getByText(/os alunos com login continuam usando o app, sem profissional/)).toBeInTheDocument();
    expect(container.querySelector("[data-frase-backups]")?.textContent).toBe(FRASE_BACKUPS);
  });
});

describe("/excluir-conta — com login", () => {
  it("conectado sem ter pedido aqui: mostra a conta e o botão leva à tela certa (profissional → painel)", async () => {
    h.sessao = { pronto: true, usuario: { id: "u1", email: "w2l.dono@teste.app" }, situacao: situacao({ contas: [conta()] }), erroSituacao: null };
    abrir();
    expect(screen.getByText(/Você está conectado como/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Continuar para excluir/ }));
    expect(onde?.pathname).toBe("/painel/configuracoes/excluir-conta");
  });
  it("voltou do login pedido aqui: vai direto para a exclusão (aluno → Perfil, a folha abre sozinha) e o pedido é apagado", async () => {
    guardarPedidoExclusao();
    h.sessao = { pronto: true, usuario: { id: "u2", email: "w2l.aluno@teste.app" }, situacao: situacao({ contas: [] }), erroSituacao: null };
    abrir();
    await waitFor(() => expect(onde).toMatchObject({ pathname: "/perfil", search: "?excluir=1" }));
    expect(pedidoExclusaoPendente()).toBe(false);
  });
  it("depois de excluir: 'Sua conta foi excluída' com o resumo (sem pedir login)", () => {
    abrir({ excluida: { contas: ["W2L Consultoria"], alunos_para_o_app: 1, alunos_guardados: 2, membros_removidos: 1, equipes_que_saiu: 0, cobrancas_canceladas: 2,
      treino: { login: "removido" }, arquivos: 0, nome: "Diana" } });
    expect(screen.getByRole("heading", { name: "Sua conta foi excluída" })).toBeInTheDocument();
    expect(screen.getByText("A conta W2L Consultoria foi encerrada.")).toBeInTheDocument();
    expect(screen.getByText("1 aluno com login continua no app, sem profissional.")).toBeInTheDocument();
    expect(screen.getByText("2 cobranças automáticas foram canceladas.")).toBeInTheDocument();
    expect(screen.getByText("O seu login foi apagado: não dá mais para entrar com ele.")).toBeInTheDocument();
  });
});
