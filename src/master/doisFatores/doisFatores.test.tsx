import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// hml-22 (H-22) — as telas e as chamadas do 2FA do master (só no site): a tela do código, o cartão "Verificação em 2 etapas" do
// Master › Configurações, as chamadas ao Auth (mfa.ts) e a função do master que pede o código (api.ts). O Auth é falso: nada vai à rede.
const h = vi.hoisted(() => ({
  sessao: null as unknown,
  sair: vi.fn(async () => {}),
  listFactors: vi.fn(),
  unenroll: vi.fn(),
  enroll: vi.fn(),
  challengeAndVerify: vi.fn(),
  refreshSession: vi.fn(),
  invoke: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/integrations/principal/client", () => ({
  principal: {
    auth: {
      mfa: { listFactors: h.listFactors, unenroll: h.unenroll, enroll: h.enroll, challengeAndVerify: h.challengeAndVerify },
      refreshSession: h.refreshSession,
    },
    functions: { invoke: h.invoke },
  },
}));
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "staging", supabase: {} }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ sessao: h.sessao, sair: h.sair }) }));
vi.mock("sonner", () => ({ toast: h.toast }));

import { chamar, ErroMaster } from "../api";
import { CartaoDoisFatores } from "./CartaoDoisFatores";
import { comecarCadastro, confirmar, relerUsuario } from "./mfa";
import TelaCodigo from "./TelaCodigo";

const verificado = { id: "f1", factor_type: "totp", status: "verified", friendly_name: "Celular", created_at: "2026-10-14T18:59:00Z", updated_at: "2026-10-14T19:01:00Z" };
const pelaMetade = { id: "f-velho", factor_type: "totp", status: "unverified", friendly_name: "Celular", created_at: "2026-10-13T10:00:00Z", updated_at: "2026-10-13T10:00:00Z" };
const lista = (todos: unknown[]) => ({ data: { all: todos, totp: todos.filter((f) => (f as { status: string }).status === "verified"), phone: [], webauthn: [] }, error: null });
const erroAuth = (status: number, code: string) => ({ data: null, error: { name: "AuthApiError", status, code, message: code } });
const CADASTRO = { data: { id: "f-novo", type: "totp", friendly_name: "Celular", totp: { qr_code: "data:image/svg+xml;utf-8,<svg/>", secret: "JBSWY3DPEHPK3PXPJBSWY3DP", uri: "otpauth://totp/x" } }, error: null };

// o input-otp procura o selo do gerenciador de senhas com document.elementFromPoint, que o jsdom não tem
if (typeof document.elementFromPoint !== "function") document.elementFromPoint = () => null;

/** Digita no campo dos 6 números (o input do InputOTP). */
function digitar(codigo: string) {
  const campo = document.querySelector("input[data-2fa-codigo]") as HTMLInputElement | null;
  expect(campo).not.toBeNull();
  fireEvent.change(campo!, { target: { value: codigo } });
}

beforeEach(() => {
  for (const f of [h.sair, h.listFactors, h.unenroll, h.enroll, h.challengeAndVerify, h.refreshSession, h.invoke, h.toast.success, h.toast.error]) f.mockReset();
  h.sessao = { access_token: "x.y.z", user: { id: "u1", factors: [verificado] } };
  h.listFactors.mockResolvedValue(lista([verificado]));
  h.unenroll.mockResolvedValue({ data: { id: "f-velho" }, error: null });
  h.enroll.mockResolvedValue(CADASTRO);
  h.challengeAndVerify.mockResolvedValue({ data: { access_token: "aal2" }, error: null });
  h.refreshSession.mockResolvedValue({ data: { session: null }, error: null });
});
afterEach(() => cleanup());

describe("hml-22 — a tela \"Digite o código do app autenticador\"", () => {
  it("os textos da tela (contrato §2.5), o Entrar, o Sair e o suporte", async () => {
    render(<TelaCodigo />);
    expect(screen.getByText("Verificação em 2 etapas")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Digite o código do app autenticador" })).toBeInTheDocument();
    expect(screen.getByText(/Abra o app autenticador do celular \(Google Authenticator, Microsoft Authenticator ou outro\) e digite os 6 números do Physiq\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Entrar/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Sair/ })).toBeEnabled();
    expect(screen.getByText(/Perdeu o celular\?/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Fale com o suporte." }).getAttribute("href")).toMatch(/^mailto:/);
    await waitFor(() => expect(h.listFactors).toHaveBeenCalledTimes(1));
    expect(h.refreshSession).not.toHaveBeenCalled();
  });

  it("os 6 números conferem sozinhos (1 vez só) no fator da sessão", async () => {
    render(<TelaCodigo />);
    await act(async () => digitar("123456"));
    await waitFor(() => expect(h.challengeAndVerify).toHaveBeenCalledTimes(1));
    expect(h.challengeAndVerify).toHaveBeenCalledWith({ factorId: "f1", code: "123456" });
    expect(screen.getByRole("button", { name: /Conferindo/ })).toBeDisabled();
  });

  it("código errado → \"Código errado…\" e o campo limpo; muitas tentativas → \"Muitas tentativas…\"", async () => {
    h.challengeAndVerify.mockResolvedValueOnce(erroAuth(422, "mfa_verification_failed")).mockResolvedValueOnce(erroAuth(429, "over_request_rate_limit"));
    render(<TelaCodigo />);
    await act(async () => digitar("111111"));
    expect(await screen.findByText("Código errado. Confira o app e tente de novo.")).toBeInTheDocument();
    expect((document.querySelector("input[data-2fa-codigo]") as HTMLInputElement).value).toBe("");
    await act(async () => digitar("222222"));
    expect(await screen.findByText("Muitas tentativas. Espere alguns minutos.")).toBeInTheDocument();
  });

  it("o fator sumiu (o suporte apagou): relê a sessão — ao abrir e no código", async () => {
    h.listFactors.mockResolvedValue(lista([]));
    h.challengeAndVerify.mockResolvedValueOnce(erroAuth(404, "mfa_factor_not_found"));
    render(<TelaCodigo />);
    await waitFor(() => expect(h.refreshSession).toHaveBeenCalledTimes(1));
    await act(async () => digitar("333333"));
    await waitFor(() => expect(h.refreshSession).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Não deu para conferir agora. Tente de novo.")).toBeInTheDocument();
  });

  it("Sair encerra só ESTA sessão (escopo local)", async () => {
    render(<TelaCodigo />);
    fireEvent.click(screen.getByRole("button", { name: /Sair/ }));
    await waitFor(() => expect(h.sair).toHaveBeenCalledWith({ escopo: "local" }));
  });
});

describe("hml-22 — o cartão \"Verificação em 2 etapas\" (Master › Configurações)", () => {
  it("desligada → Ativar: tira o cadastro pela metade, cadastra o TOTP do Physiq e mostra os 2 passos (QR e código em texto)", async () => {
    h.listFactors.mockResolvedValue(lista([pelaMetade]));
    render(<CartaoDoisFatores />);
    expect(await screen.findByText("Desligada")).toBeInTheDocument();
    expect(screen.getByText("Com ela, entrar no painel master pede um código de 6 números do app autenticador, além da senha ou do Google.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ativar/ }));
    expect(await screen.findByText("1. No app autenticador, leia o QR.")).toBeInTheDocument();
    expect(h.unenroll).toHaveBeenCalledWith({ factorId: "f-velho" });
    expect(h.enroll).toHaveBeenCalledWith({ factorType: "totp", issuer: "Physiq", friendlyName: "Celular" });
    expect(h.unenroll.mock.invocationCallOrder[0]).toBeLessThan(h.enroll.mock.invocationCallOrder[0]);
    expect(document.querySelector("img[data-2fa-qr]")?.getAttribute("src")).toBe(`data:image/svg+xml;charset=utf-8,${encodeURIComponent("<svg/>")}`);
    expect(document.querySelector("[data-2fa-segredo]")?.textContent).toBe("JBSW Y3DP EHPK 3PXP JBSW Y3DP");
    expect(screen.getByText("Não dá para ler? Digite este código no app:")).toBeInTheDocument();
    expect(screen.getByText("2. Digite os 6 números que aparecem.")).toBeInTheDocument();
  });

  it("os 6 números certos → Ligada, com o aviso das outras sessões e o \"Ligada desde\"", async () => {
    h.listFactors.mockResolvedValueOnce(lista([])).mockResolvedValueOnce(lista([])).mockResolvedValue(lista([verificado]));
    render(<CartaoDoisFatores />);
    fireEvent.click(await screen.findByRole("button", { name: /Ativar/ }));
    await screen.findByText("1. No app autenticador, leia o QR.");
    await act(async () => digitar("654321"));
    expect(await screen.findByText("Pronto. A verificação está ligada. As outras sessões abertas desta conta foram encerradas.")).toBeInTheDocument();
    expect(h.challengeAndVerify).toHaveBeenCalledWith({ factorId: "f-novo", code: "654321" });
    expect(screen.getByText("Ligada desde 14/10/2026")).toBeInTheDocument();
    expect(document.querySelector("[data-2fa-segredo]")).toBeNull();
  });

  it("código errado no cadastro → a mensagem; segue nos passos", async () => {
    h.listFactors.mockResolvedValue(lista([]));
    h.challengeAndVerify.mockResolvedValueOnce(erroAuth(422, "mfa_verification_failed"));
    render(<CartaoDoisFatores />);
    fireEvent.click(await screen.findByRole("button", { name: /Ativar/ }));
    await screen.findByText("1. No app autenticador, leia o QR.");
    await act(async () => digitar("000000"));
    expect(await screen.findByText("Código errado. Confira o app e tente de novo.")).toBeInTheDocument();
    expect(document.querySelector("[data-2fa-passos]")).not.toBeNull();
  });

  it("já ligada: o chip com a data e o suporte para tirar ou trocar de celular — sem botão de desligar", async () => {
    render(<CartaoDoisFatores />);
    expect(await screen.findByText("Ligada desde 14/10/2026")).toBeInTheDocument();
    expect(screen.getByText("Para tirar ou trocar de celular, fale com o suporte.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ativar|Desligar/ })).toBeNull();
  });
});

describe("hml-22 — as chamadas (mfa.ts) e a função do master que pede o código", () => {
  it("comecarCadastro: tira só os fatores pela metade (nunca o verificado) e devolve o QR e o código em texto", async () => {
    h.listFactors.mockResolvedValue(lista([verificado, pelaMetade]));
    const r = await comecarCadastro();
    expect(h.unenroll).toHaveBeenCalledTimes(1);
    expect(h.unenroll).toHaveBeenCalledWith({ factorId: "f-velho" });
    expect(r).toEqual({ ok: true, valor: { id: "f-novo", qr: "data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E", segredo: CADASTRO.data.totp.secret } });
  });
  it("comecarCadastro e confirmar: o erro do Auth vira o erro da tela (e exceção não escapa)", async () => {
    h.enroll.mockResolvedValueOnce(erroAuth(429, "over_request_rate_limit"));
    h.listFactors.mockResolvedValue(lista([]));
    expect(await comecarCadastro()).toEqual({ ok: false, erro: "muitas" });
    h.challengeAndVerify.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await confirmar("f1", "123456")).toEqual({ ok: false, erro: "falhou" });
  });
  it("relerUsuario renova a sessão (os fatores de agora); sem rede não quebra", async () => {
    await relerUsuario();
    expect(h.refreshSession).toHaveBeenCalledTimes(1);
    h.refreshSession.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(relerUsuario()).resolves.toBeUndefined();
  });
  it("uma master-* responde 403 precisa_2fa: o erro chega à tela e a sessão é relida (o site passa a pedir o código)", async () => {
    h.invoke.mockResolvedValueOnce({
      data: null,
      error: { context: new Response(JSON.stringify({ ok: false, erro: "precisa_2fa" }), { status: 403, headers: { "Content-Type": "application/json" } }) },
    });
    await expect(chamar("master-contas", { acao: "visao_geral" })).rejects.toMatchObject({ codigo: "precisa_2fa" });
    expect(h.refreshSession).toHaveBeenCalledTimes(1);
    h.invoke.mockResolvedValueOnce({
      data: null,
      error: { context: new Response(JSON.stringify({ ok: false, erro: "so_master" }), { status: 403, headers: { "Content-Type": "application/json" } }) },
    });
    await expect(chamar("master-contas", {})).rejects.toBeInstanceOf(ErroMaster);
    expect(h.refreshSession).toHaveBeenCalledTimes(1);
  });
});
