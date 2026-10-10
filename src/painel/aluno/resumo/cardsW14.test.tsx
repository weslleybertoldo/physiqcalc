import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { perfil } from "@/test/fixturesPerfilAluno";
import type { PerfilAluno } from "../dados/tipos";

const h = vi.hoisted(() => ({
  perfil: vi.fn(),
  ajuste: vi.fn(),
  dados: vi.fn(),
  link: vi.fn(),
  mensagens: vi.fn(),
  ligar: vi.fn(),
  fechar: vi.fn(),
  responsavel: vi.fn(),
}));
vi.mock("../dados/api", () => ({
  ErroPerfil: class extends Error {
    constructor(public codigo: string) {
      super(codigo);
    }
  },
  buscarPerfilAluno: h.perfil,
  salvarAjusteAluno: h.ajuste,
  salvarDadosAluno: h.dados,
  gerarNovoLink: h.link,
  buscarDadosTreino: vi.fn(),
  salvarNoTreino: vi.fn(),
  buscarMensagensDesligadas: h.mensagens,
  ligarMensagensParaTodos: h.ligar,
  fecharAvisoMensagens: h.fechar,
}));
// hml-12: a seção do responsável (o Vitest roda como o build de staging: o card a carrega) lê pela API dela, aqui sem rede
vi.mock("@/publico/legal/responsavel/api", () => ({
  ErroResponsavel: class extends Error {},
  buscarResponsavel: h.responsavel,
  registrarResponsavel: vi.fn(),
  retirarResponsavel: vi.fn(),
}));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ treino: { estado: "desnecessario", erro: null } }) }));
vi.mock("@/nucleo/conta", () => ({ useConta: () => ({ conta: { id: "c1" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import CardAjustesAluno from "./CardAjustesAluno";
import CardDadosAluno from "./CardDadosAluno";
import CardFluxoConsulta from "./CardFluxoConsulta";
import CardLinkDiario from "./CardLinkDiario";
import CardResumoPrivado from "./CardResumoPrivado";
import Cabecalho from "../Cabecalho";
import FaixaMensagensDesligadas from "@/painel/gates/FaixaMensagensDesligadas";

const montar = (ui: React.ReactNode) =>
  render(
    <MemoryRouter useTransitions={false}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
  h.perfil.mockResolvedValue(perfil());
  h.responsavel.mockResolvedValue({ ligado: true, faixa: "adulto", pode_editar: true, atual: null });
});

describe("W14 — cabeçalho da tela 7", () => {
  it("linha, chips TREINO · LUCAS / NUTRIÇÃO · CAMILA e Mensagem no WhatsApp do aluno", async () => {
    montar(<Cabecalho alunoId="p1" />);
    expect(await screen.findByText("Rafael Moura")).toBeInTheDocument();
    expect(screen.getByText(/^28 anos · 1,78 m · objetivo: definição · aluno desde mar\/2026$/)).toBeInTheDocument();
    expect(screen.getByText("TREINO · LUCAS")).toBeInTheDocument();
    expect(screen.getByText("NUTRIÇÃO · CAMILA")).toBeInTheDocument();
  });
  it("bloqueado e desativado aparecem como chips; erro de acesso vira a frase da tela", async () => {
    h.perfil.mockResolvedValue(perfil({ bloqueado: true }));
    const r = montar(<Cabecalho alunoId="p1" />);
    expect(await screen.findByText("BLOQUEADO")).toBeInTheDocument();
    r.unmount();
    h.perfil.mockRejectedValue(new Error("sem_acesso"));
    montar(<Cabecalho alunoId="p1" />);
    expect(await screen.findByText("Não deu para abrir este aluno")).toBeInTheDocument();
    expect(screen.getByText(/Só o dono da conta ou o profissional responsável/)).toBeInTheDocument();
  });
});

describe("W14 — cards do Resumo", () => {
  it("Dados do aluno: cadastro, idade, corpo da antropometria e o WhatsApp", async () => {
    montar(<CardDadosAluno alunoId="p1" />);
    expect(await screen.findByText("10/03/1998 · 28 anos")).toBeInTheDocument();
    expect(screen.getByText("(11) 98765-4321")).toBeInTheDocument();
    expect(screen.getByText("1,78 m")).toBeInTheDocument();
    expect(screen.getByText("84,2 kg")).toBeInTheDocument();
    expect(screen.getByText(/Altura e peso da antropometria de 14\/06\/2026/)).toBeInTheDocument();
    expect(screen.getByLabelText("Abrir no WhatsApp")).toHaveAttribute("href", "https://wa.me/5511987654321");
  });
  it("hml-12 (H-30): no build de staging, a seção do responsável entra logo depois da grade, lida pelo id da rota", async () => {
    h.perfil.mockResolvedValue(perfil({ nascimento: "2009-06-01" }));
    h.responsavel.mockResolvedValue({ ligado: true, faixa: "16_17", pode_editar: true, atual: null });
    montar(<CardDadosAluno alunoId="p1" />);
    const secao = await waitFor(() => {
      const el = document.querySelector('[data-secao-responsavel="16_17"]');
      if (!el) throw new Error("a seção do responsável ainda não carregou");
      return el;
    });
    expect(h.responsavel).toHaveBeenCalledWith("p1");
    expect(document.querySelector("[data-dados-grade]")!.nextElementSibling).toBe(secao);
    expect(secao.querySelector("[data-responsavel-registrar]")).not.toBeNull();
  });
  it("Ajustes: os 4 (com o texto novo do link) e o interruptor grava o ajuste", async () => {
    h.ajuste.mockResolvedValue({ acesso_app: true, mensagens_automaticas: true, diario_alimentar: true, acesso_link: true });
    montar(<CardAjustesAluno alunoId="p1" />);
    expect(await screen.findByText("Envio de fotos pelo link")).toBeInTheDocument();
    const msgs = screen.getByRole("switch", { name: "Mensagens automáticas no WhatsApp" });
    expect(msgs).toHaveAttribute("aria-checked", "false");
    fireEvent.click(msgs);
    await waitFor(() => expect(h.ajuste).toHaveBeenCalledWith("p1", "mensagens_automaticas", true));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Mensagens automáticas no WhatsApp" })).toHaveAttribute("aria-checked", "true"));
  });
  it("Ajustes: aluno só de treino não vê diário nem link; sem login, o acesso ao app fica travado com o aviso", async () => {
    h.perfil.mockResolvedValue(perfil({ modulos: ["treino"], tem_login: false, ajustes: { acesso_app: false, mensagens_automaticas: false, diario_alimentar: true, acesso_link: true } }));
    montar(<CardAjustesAluno alunoId="p1" />);
    expect(await screen.findByText("Acesso ao app")).toBeInTheDocument();
    expect(screen.queryByText("Diário alimentar com fotos")).toBeNull();
    expect(screen.getByRole("switch", { name: "Acesso ao app" })).toBeDisabled();
    expect(screen.getByText(/ainda não tem login/)).toBeInTheDocument();
  });
  it("Link do diário: /d/<código> (F1); desligado nos ajustes mostra o motivo; só com Nutrição", async () => {
    const r = montar(<CardLinkDiario alunoId="p1" />);
    const url = await waitFor(() => document.querySelector("[data-link-diario]")!.getAttribute("data-link-diario"));
    expect(url).toMatch(/\/d\/abc234xyz9$/);
    expect(screen.getByText("LIGADO")).toBeInTheDocument();
    r.unmount();
    h.perfil.mockResolvedValue(perfil({ ajustes: { acesso_app: true, mensagens_automaticas: false, diario_alimentar: true, acesso_link: false } }));
    const r2 = montar(<CardLinkDiario alunoId="p1" />);
    expect(await screen.findByText("DESLIGADO")).toBeInTheDocument();
    expect(screen.getByText(/envio de fotos pelo link está desligado/)).toBeInTheDocument();
    r2.unmount();
    h.perfil.mockResolvedValue(perfil({ modulos: ["treino"] }));
    montar(<CardLinkDiario alunoId="p1" />);
    await waitFor(() => expect(h.perfil).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector("[data-card-link-diario]")).toBeNull());
  });
  it("Resumo privado: salva o texto (o aluno não vê)", async () => {
    h.dados.mockResolvedValue(perfil({ resumo: "Lesão no joelho" }) as PerfilAluno);
    montar(<CardResumoPrivado alunoId="p1" />);
    const campo = await screen.findByPlaceholderText(/Informações e histórico/);
    fireEvent.change(campo, { target: { value: "Lesão no joelho" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    await waitFor(() => expect(h.dados).toHaveBeenCalledWith("p1", { resumo: "Lesão no joelho" }));
  });
  it("Fluxo de consulta: os 7 atalhos (a aba nova quando existe — W18: consulta e anamnese no Prontuário); some sem Nutrição", async () => {
    // H5: o card é de quem é nutri (a regra clínica da W18)
    h.perfil.mockResolvedValue(perfil({ eu: { id: "u1", dono: true, personal: true, nutricionista: true, master: false } }));
    const r = montar(<CardFluxoConsulta alunoId="p1" />);
    await waitFor(() => expect(document.querySelectorAll("[data-atalho]").length).toBe(7));
    expect(document.querySelector('[data-atalho="consulta"]')?.getAttribute("href")).toBe("/painel/alunos/p1/prontuario?nova=consulta");
    expect(document.querySelector('[data-atalho="anamnese"]')?.getAttribute("href")).toBe("/painel/alunos/p1/prontuario?nova=anamnese");
    // W20: "Agendar" abre a Agenda nova já com o aluno (era o site antigo até a W20)
    expect(document.querySelector('[data-atalho="agendar"]')?.getAttribute("href")).toBe("/painel/agenda?aluno=p1&novo=1");
    r.unmount();
    h.perfil.mockResolvedValue(perfil({ conta_modulos: ["treino"], modulos: ["treino"], eu: { id: "u1", dono: true, personal: true, nutricionista: true, master: false } }));
    montar(<CardFluxoConsulta alunoId="p1" />);
    await waitFor(() => expect(h.perfil).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector("[data-card-fluxo-consulta]")).toBeNull());
  });
  it("H5 (achado 4 do FIM-1b): o Fluxo de consulta é só de quem é nutri — o personal e o dono sem papel de nutri não veem", async () => {
    // o personal responsável (sem papel de nutri)
    h.perfil.mockResolvedValue(perfil({ eu: { id: "u2", dono: false, personal: true, nutricionista: false, master: false } }));
    const r1 = montar(<CardFluxoConsulta alunoId="p1" />);
    await waitFor(() => expect(h.perfil).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector("[data-card-fluxo-consulta]")).toBeNull());
    r1.unmount();
    // o dono + personal sem papel de nutri (o fixture padrão)
    h.perfil.mockResolvedValue(perfil());
    const r2 = montar(<CardFluxoConsulta alunoId="p1" />);
    await waitFor(() => expect(h.perfil).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(document.querySelector("[data-card-fluxo-consulta]")).toBeNull());
    r2.unmount();
    // a nutricionista da conta (não precisa ser a responsável: ela lê o clínico) e o master veem
    h.perfil.mockResolvedValue(perfil({ eu: { id: "u3", dono: false, personal: false, nutricionista: true, master: false } }));
    const r3 = montar(<CardFluxoConsulta alunoId="p1" />);
    await waitFor(() => expect(document.querySelectorAll("[data-atalho]").length).toBe(7));
    r3.unmount();
    h.perfil.mockResolvedValue(perfil({ eu: { id: "u4", dono: false, personal: false, nutricionista: false, master: true } }));
    montar(<CardFluxoConsulta alunoId="p1" />);
    await waitFor(() => expect(document.querySelectorAll("[data-atalho]").length).toBe(7));
  });
});

describe("W14 (P15) — aviso único das mensagens desligadas", () => {
  const lista = [
    { id: "a", rota_id: "a", nome: "Beatriz Lima", telefone: "11911110000" },
    { id: "b", rota_id: "b", nome: "Marina Alves", telefone: "11922220000" },
  ];
  it("o número = a lista; \"Ligar para todos\" liga exatamente os da lista e o aviso some", async () => {
    h.mensagens.mockResolvedValue({ mostrar: true, whatsapp: true, visto: null, total: 2, alunos: lista });
    h.ligar.mockResolvedValue(2);
    montar(<FaixaMensagensDesligadas><div>a página</div></FaixaMensagensDesligadas>);
    expect(await screen.findByText(/2 alunos estão com as mensagens automáticas do WhatsApp desligadas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ver quais/ }));
    expect(await screen.findByText("Marina Alves")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-mensagens-aluno]").length).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: /Ligar para os 2/ }));
    await waitFor(() => expect(h.ligar).toHaveBeenCalledWith(["a", "b"]));
    await waitFor(() => expect(document.querySelector("[data-faixa-mensagens]")).toBeNull());
    expect(screen.getByText("a página")).toBeInTheDocument();
  });
  it("já visto (ou sem WhatsApp no Physiq) → só a página", async () => {
    h.mensagens.mockResolvedValue({ mostrar: false, whatsapp: true, visto: { em: "x" }, total: 2, alunos: lista });
    montar(<FaixaMensagensDesligadas><div>a página</div></FaixaMensagensDesligadas>);
    expect(await screen.findByText("a página")).toBeInTheDocument();
    await waitFor(() => expect(h.mensagens).toHaveBeenCalled());
    expect(document.querySelector("[data-faixa-mensagens]")).toBeNull();
  });
});
