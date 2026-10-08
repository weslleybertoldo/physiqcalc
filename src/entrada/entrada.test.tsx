import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { chaveRegistro } from "@/lib/rateLimitLogin";

const h = vi.hoisted(() => {
  (globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = "3.2";
  return {
    entrarComEmail: vi.fn(), entrarComGoogle: vi.fn(), vincularCodigo: vi.fn(), situacao: null as unknown, pendente: null as string | null,
    rpc: vi.fn(), recarregar: vi.fn(async () => null), previa: vi.fn(),
    // W8b: o captcha invisível (Turnstile) da tela de e-mail e senha
    token: vi.fn(async () => "token-captcha"), usado: vi.fn(),
  };
});
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "public", supabase: {} }));
vi.mock("@/lib/profPendente", () => ({ lerProfPendente: () => h.pendente, limparProfPendente: () => {} }));
vi.mock("@/nucleo/sessao", () => ({
  useSessao: () => ({
    entrarComEmail: h.entrarComEmail, entrarComGoogle: h.entrarComGoogle, vincularCodigo: h.vincularCodigo, situacao: h.situacao,
    usuario: { id: "u1", email: "rafa@gmail.com" }, sair: async () => {}, recarregarSituacao: h.recarregar,
  }),
}));
vi.mock("@/integrations/principal/client", () => ({ principal: { rpc: h.rpc } }));
vi.mock("@/nucleo/captcha", () => ({ useCaptcha: () => ({ refCaixa: { current: null }, estado: "pronto", obterToken: h.token, usado: h.usado }) }));
// W7: a prévia do código (nome, foto e tipo do profissional) antes do vínculo
vi.mock("@/nucleo/vinculo", async (orig) => ({ ...(await orig<typeof import("@/nucleo/vinculo")>()), previaDoCodigo: (c: string) => h.previa(c) }));

import Entrar from "./Entrar";
import EntrarEmail from "./EntrarEmail";
import BoasVindas from "./BoasVindas";
import TenhoCodigo from "./onboarding/TenhoCodigo";
import CriarConta from "./onboarding/CriarConta";
import { textoErroEntrar, textoErroServidor } from "./pecas/textos";

const EMAIL = "conta@teste.com";
const ERRO_CREDENCIAL = { erro: { status: 400, code: "invalid_credentials", message: "Invalid login credentials" } };
// W7b: a opção "Treinar sem profissional" das Boas-vindas lê os planos do app (react-query)
const abrir = (el: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>);

function preencher(senha = "senha-errada") {
  fireEvent.change(screen.getByPlaceholderText("voce@email.com"), { target: { value: EMAIL } });
  fireEvent.change(screen.getByPlaceholderText("Sua senha"), { target: { value: senha } });
}
async function tentar(vezes: number) {
  for (let i = 1; i <= vezes; i++) {
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(h.entrarComEmail).toHaveBeenCalledTimes(i));
  }
}
const registro = () => {
  const bruto = localStorage.getItem(chaveRegistro(EMAIL));
  return bruto ? JSON.parse(bruto) : null;
};

beforeEach(() => {
  localStorage.clear();
  h.entrarComEmail.mockReset();
  h.entrarComGoogle.mockReset();
  h.vincularCodigo.mockReset();
  h.previa.mockReset();
  h.situacao = null;
  h.pendente = null;
  h.rpc.mockReset();
  h.recarregar.mockClear();
});

describe("Entrar (tela 1)", () => {
  it("Google e e-mail e senha; o link do profissional aparece; 'Sou profissional' explica o cadastro com 14 dias (W4)", async () => {
    h.pendente = "PROF-LUCAS-FERREIRA";
    h.entrarComGoogle.mockResolvedValue({});
    abrir(<Entrar />);
    expect(screen.getByText("PROF-LUCAS-FERREIRA")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Entrar com Google/ }));
    await waitFor(() => expect(h.entrarComGoogle).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("link", { name: /Entrar com e-mail e senha/ })).toHaveAttribute("href", "/entrar/email");
    fireEvent.click(screen.getByRole("button", { name: /Sou profissional/ }));
    expect(screen.getByText(/a conta nasce com 14 dias grátis/)).toBeInTheDocument();
    expect(screen.queryByText(/abre em breve/)).toBeNull();
  });
  it("erro do Google vira mensagem", async () => {
    h.entrarComGoogle.mockResolvedValue({ erro: "x" });
    abrir(<Entrar />);
    fireEvent.click(screen.getByRole("button", { name: /Entrar com Google/ }));
    expect(await screen.findByText("Não foi possível abrir o Google. Tente de novo.")).toBeInTheDocument();
  });
});

describe("Entrar com e-mail e senha — o limite de tentativas mora no servidor (W8b)", () => {
  const agoraIso = () => new Date().toISOString();
  const emMs = (ms: number) => new Date(Date.now() + ms).toISOString();

  it("manda e-mail, senha e o token do captcha; senha errada sem bloqueio mostra o erro e não guarda nada", async () => {
    h.entrarComEmail.mockResolvedValue({ erro: { status: 0, code: "senha_errada", bloqueado_ate: null, bloqueado_de_vez: false, agora: agoraIso() } });
    abrir(<EntrarEmail />);
    preencher();
    await tentar(1);
    expect(h.entrarComEmail).toHaveBeenCalledWith(EMAIL, "senha-errada", "token-captcha");
    expect(h.usado).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText("E-mail ou senha incorretos.")).toBeInTheDocument());
    expect(registro()).toBeNull();
  });
  it("H-47: e-mail sem ponto no domínio não sai do aparelho (nem o captcha é pedido)", async () => {
    h.token.mockClear();
    h.entrarComEmail.mockClear();
    abrir(<EntrarEmail />);
    fireEvent.change(screen.getByPlaceholderText("voce@email.com"), { target: { value: "teste@sem-ponto" } });
    fireEvent.change(screen.getByPlaceholderText("Sua senha"), { target: { value: "qualquer-senha" } });
    fireEvent.submit(document.querySelector("[data-form-email]")!);
    expect(await screen.findByText("Confira o e-mail.")).toBeInTheDocument();
    expect(h.entrarComEmail).not.toHaveBeenCalled();
    expect(h.token).not.toHaveBeenCalled();
  });
  it("o servidor bloqueou (4ª errada → 1 min): contador, botão travado com a MESMA senha e o aparelho não chama de novo", async () => {
    h.entrarComEmail.mockResolvedValue({ erro: { status: 0, code: "senha_errada", bloqueado_ate: emMs(60_000), bloqueado_de_vez: false, agora: agoraIso() } });
    abrir(<EntrarEmail />);
    preencher();
    await tentar(1);
    await waitFor(() => expect(screen.getByText(/Muitas tentativas/)).toBeInTheDocument());
    expect(screen.getByText(/Muitas tentativas/).textContent).toMatch(/Tente de novo em (1:00|0:5\d)/);
    const botao = screen.getByRole("button", { name: "Aguarde" });
    expect(botao).toBeDisabled();
    fireEvent.submit(botao.closest("form") as HTMLFormElement);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(h.entrarComEmail).toHaveBeenCalledTimes(1);
    expect(registro()).toMatchObject({ deVez: false, motivo: "conta" });
    // uma senha NOVA (a que o profissional criou) pode tentar: quem decide é o servidor
    fireEvent.change(screen.getByPlaceholderText("Sua senha"), { target: { value: "senha-nova-8" } });
    expect(screen.getByRole("button", { name: "Entrar" })).not.toBeDisabled();
  });
  it("bloqueio de vez: a frase dele, o botão do Google (que destrava) e nada de contador", async () => {
    h.entrarComEmail.mockResolvedValue({ erro: { status: 0, code: "bloqueado_de_vez", bloqueado_ate: null, bloqueado_de_vez: true, agora: agoraIso() } });
    h.entrarComGoogle.mockResolvedValue({});
    abrir(<EntrarEmail />);
    preencher("senha-certa");
    await tentar(1);
    expect(await screen.findByText(/Conta bloqueada por tentativas\. Peça uma senha nova ao seu profissional ou entre com o Google/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Conta bloqueada" })).toBeDisabled();
    expect(registro()).toMatchObject({ deVez: true });
    fireEvent.click(screen.getByRole("button", { name: /Entrar com Google/ }));
    await waitFor(() => expect(h.entrarComGoogle).toHaveBeenCalledTimes(1));
  });
  it("muitas tentativas da mesma rede: contador próprio", async () => {
    h.entrarComEmail.mockResolvedValue({ erro: { status: 0, code: "muitas_tentativas_rede", bloqueado_ate: emMs(15 * 60_000), agora: agoraIso() } });
    abrir(<EntrarEmail />);
    preencher();
    await tentar(1);
    expect(await screen.findByText(/Muitas tentativas desta rede/)).toBeInTheDocument();
  });
  it("entrou: apaga o aviso guardado do e-mail", async () => {
    localStorage.setItem(chaveRegistro(EMAIL), JSON.stringify({ bloqueadoAte: null, deVez: true, motivo: "conta", em: Date.now() }));
    h.entrarComEmail.mockResolvedValue({});
    abrir(<EntrarEmail />);
    preencher("senha-certa");
    await tentar(1);
    await waitFor(() => expect(registro()).toBeNull());
  });
  it("sem internet, captcha recusado e servidor fora: a frase certa e nada guardado", async () => {
    for (const [code, frase] of [
      ["rede", "Não foi possível entrar. Confira a internet e tente de novo."],
      ["captcha_invalido", "Não conseguimos confirmar que é você. Tente de novo."],
      ["indisponivel", "Não foi possível entrar agora. Tente de novo em instantes."],
      ["acesso_desativado", "Este acesso está desativado. Fale com o seu profissional."],
    ] as const) {
      h.entrarComEmail.mockReset();
      h.entrarComEmail.mockResolvedValue({ erro: { status: 0, code } });
      const r = abrir(<EntrarEmail />);
      preencher();
      await tentar(1);
      await waitFor(() => expect(screen.getByText(frase)).toBeInTheDocument());
      expect(registro()).toBeNull();
      r.unmount();
    }
  });
  it("frases do Auth e do servidor", () => {
    expect(textoErroEntrar({ status: 429 })).toMatch(/Muitas tentativas/);
    expect(textoErroEntrar({ code: "user_banned" })).toMatch(/desativado/);
    expect(textoErroEntrar({ code: "invalid_credentials" })).toBe("E-mail ou senha incorretos.");
    expect(textoErroEntrar(null)).toBe("");
    expect(textoErroServidor("senha_errada")).toBe("E-mail ou senha incorretos.");
    expect(textoErroServidor("bloqueado_de_vez")).toMatch(/Peça uma senha nova ao seu profissional ou entre com o Google/);
    expect(textoErroServidor("em_andamento")).toMatch(/Aguarde/);
    expect(textoErroServidor("qualquer")).toMatch(/Tente de novo em instantes/);
  });
});

describe("Boas-vindas e 'Tenho um código'", () => {
  it("opção do código + 'Sou profissional' com 14 dias grátis (W4 — o cadastro abriu)", async () => {
    h.situacao = { sem_nada: true, nome: "Rafael Moura" };
    abrir(<BoasVindas />);
    expect(screen.getByText("Rafael")).toBeInTheDocument();
    expect(await screen.findByText("Tenho um código do meu profissional")).toBeInTheDocument();
    expect(await screen.findByText("14 DIAS GRÁTIS")).toBeInTheDocument();
    expect(screen.getByText("Sou profissional")).toBeInTheDocument();
    expect(screen.queryByText("EM BREVE")).toBeNull();
  });
  const LUCAS = { nome: "Lucas Ferreira", foto_url: null, tipo_perfil: "personal", papeis: ["personal"] };
  it("código preenchido pelo link; a prévia recusa (P7) com a frase da spec e nada é vinculado", async () => {
    h.pendente = "PROF-X";
    h.previa.mockResolvedValue({ ok: false, erro: "outro_profissional", jaEra: false, contaNome: "Consultoria", modulos: ["treino"], profissional: LUCAS });
    abrir(<TenhoCodigo />);
    expect(screen.getByDisplayValue("PROF-X")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Entrar na lista" }));
    expect(await screen.findByText("Este aluno já está com outro profissional.")).toBeInTheDocument();
    expect(screen.getByText("Lucas Ferreira")).toBeInTheDocument();
    expect(h.previa).toHaveBeenCalledWith("PROF-X");
    expect(h.vincularCodigo).not.toHaveBeenCalled();
  });
  it("W7: o popup mostra nome e tipo do profissional; Cancelar não vincula; Confirmar vincula e mostra a confirmação", async () => {
    h.previa.mockResolvedValue({ ok: true, erro: null, jaEra: false, contaNome: "Consultoria Ferreira", modulos: ["treino"], profissional: LUCAS });
    h.vincularCodigo.mockResolvedValue({ ok: true, profissional: "Lucas Ferreira" });
    abrir(<TenhoCodigo />);
    fireEvent.change(screen.getByPlaceholderText("PROF-NOME-SOBRENOME"), { target: { value: "prof-lucas" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar na lista" }));
    expect(await screen.findByText("PERSONAL TRAINER (ED. FÍSICA)")).toBeInTheDocument();
    expect(screen.getByText("Lucas Ferreira")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByText("PERSONAL TRAINER (ED. FÍSICA)")).toBeNull());
    expect(h.vincularCodigo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Entrar na lista" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(h.vincularCodigo).toHaveBeenCalledWith("PROF-LUCAS"));
    expect(await screen.findByText(/Você entrou na lista de Lucas Ferreira/)).toBeInTheDocument();
  });
  it("W7: código que não existe → erro claro no popup, sem vínculo", async () => {
    h.previa.mockResolvedValue({ ok: false, erro: "codigo_invalido", jaEra: false, contaNome: null, modulos: [], profissional: null });
    abrir(<TenhoCodigo />);
    fireEvent.change(screen.getByPlaceholderText("PROF-NOME-SOBRENOME"), { target: { value: "prof-nada" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar na lista" }));
    expect(await screen.findByText("Não achamos esse código. Confira com o seu profissional.")).toBeInTheDocument();
    expect(h.vincularCodigo).not.toHaveBeenCalled();
  });
});

describe("Boas-vindas › 'Sou profissional' (W4)", () => {
  const preencherConta = () => {
    fireEvent.click(screen.getByRole("button", { name: "Criar minha conta" }));
    expect(screen.getByDisplayValue("Rafael Moura")).toBeInTheDocument(); // começa com o nome da pessoa
    fireEvent.change(screen.getByPlaceholderText("Ex.: Consultoria Ferreira"), { target: { value: "Consultoria Moura" } });
  };
  it("cria a conta com o tipo de perfil e o registro → teste de 14 dias e o painel", async () => {
    h.situacao = { sem_nada: true, nome: "Rafael Moura" };
    h.rpc.mockResolvedValue({ data: { ok: true, conta_id: "c9", teste_ate: "2026-10-13" }, error: null });
    abrir(<CriarConta />);
    preencherConta();
    fireEvent.click(screen.getByRole("radio", { name: /Personal trainer/ }));
    fireEvent.change(screen.getByPlaceholderText("CREF 000000-G/UF"), { target: { value: "CREF 012345-G/PE" } });
    fireEvent.click(screen.getByRole("button", { name: /Criar conta com 14 dias grátis/ }));
    expect(await screen.findByText(/Sua conta está no teste até 13\/10/)).toBeInTheDocument();
    expect(h.rpc).toHaveBeenCalledWith("criar_minha_conta", { p_nome: "Consultoria Moura", p_tipo: "personal", p_registro: "CREF 012345-G/PE" });
    expect(h.recarregar).toHaveBeenCalled();
  });
  it("sem o tipo de perfil não envia; recusa do servidor vira a frase", async () => {
    h.situacao = { sem_nada: true, nome: "Rafael Moura" };
    abrir(<CriarConta />);
    preencherConta();
    fireEvent.click(screen.getByRole("button", { name: /Criar conta com 14 dias grátis/ }));
    expect(await screen.findByText("Escolha como você atende.")).toBeInTheDocument();
    expect(h.rpc).not.toHaveBeenCalled();
    h.rpc.mockResolvedValue({ data: { ok: false, erro: "ja_tem_conta" }, error: null });
    fireEvent.click(screen.getByRole("radio", { name: /Nutricionista/ }));
    fireEvent.click(screen.getByRole("button", { name: /Criar conta com 14 dias grátis/ }));
    expect(await screen.findByText(/Você já faz parte de uma conta de profissional/)).toBeInTheDocument();
    expect(h.rpc).toHaveBeenCalledWith("criar_minha_conta", { p_nome: "Consultoria Moura", p_tipo: "nutricionista", p_registro: null });
  });
});
