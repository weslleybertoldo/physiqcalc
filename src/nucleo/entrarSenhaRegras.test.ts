import { describe, expect, it } from "vitest";
import {
  IP_DO_WORKER,
  captchaAceito,
  categoriaGoTrue,
  corpoRecusa,
  corpoSenhaErrada,
  hashDoIp,
  hashDoToken,
  ipDoPedido,
  lerPedido,
  normalizarEmail,
  segredoIgual,
} from "../../supabase-principal/functions/_shared/entrar-senha-regras";
import { lerRespostaEntrar } from "./entrarSenha";

// W8b — regras da função entrar-senha (o limite de tentativas NO SERVIDOR) e a leitura da resposta no app.
const cabecalhos = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });
const SEGREDO = "s".repeat(40);

describe("entrar-senha — o pedido", () => {
  it("e-mail normalizado e validado; senha obrigatória (até 200); captcha opcional no pedido (o servidor decide)", () => {
    expect(normalizarEmail("  Aluno@Teste.COM ")).toBe("aluno@teste.com");
    expect(normalizarEmail("sem-arroba")).toBe("");
    expect(lerPedido({ email: "a@b.co", senha: "x", captcha: " tok " })).toEqual({ ok: true, pedido: { email: "a@b.co", senha: "x", captcha: "tok" } });
    expect(lerPedido({ email: "a@b.co", senha: "" })).toEqual({ ok: false, erro: "dados_invalidos" });
    expect(lerPedido({ email: "a@b.co", senha: "x".repeat(201) })).toEqual({ ok: false, erro: "dados_invalidos" });
    expect(lerPedido(null)).toEqual({ ok: false, erro: "dados_invalidos" });
  });
});

describe("entrar-senha — o IP de quem chama", () => {
  it("pelo proxy api-principal: o x-physiq-ip só vale com o segredo do Worker", () => {
    expect(ipDoPedido(cabecalhos({ "x-physiq-ip": "187.65.18.77", "x-physiq-proxy": SEGREDO, "cf-connecting-ip": IP_DO_WORKER }), SEGREDO)).toBe("187.65.18.77");
    // sem o segredo (ou errado), qualquer um poderia inventar o IP: vale o que a Cloudflare pôs — e o IP do Worker não é de ninguém
    expect(ipDoPedido(cabecalhos({ "x-physiq-ip": "1.2.3.4", "x-physiq-proxy": "errado", "cf-connecting-ip": IP_DO_WORKER }), SEGREDO)).toBeNull();
    expect(ipDoPedido(cabecalhos({ "x-physiq-ip": "1.2.3.4", "x-physiq-proxy": SEGREDO }), "")).toBeNull();
  });
  it("direto no supabase.co: o cf-connecting-ip (a Cloudflare recusa o falso); sem nada → null", () => {
    expect(ipDoPedido(cabecalhos({ "cf-connecting-ip": "2804:14c::1" }), SEGREDO)).toBe("2804:14c::1");
    expect(ipDoPedido(cabecalhos({ "x-forwarded-for": "10.0.0.1, 13.248.114.169" }), SEGREDO)).toBe("10.0.0.1");
    expect(ipDoPedido(cabecalhos({}), SEGREDO)).toBeNull();
    expect(ipDoPedido(cabecalhos({ "cf-connecting-ip": "<script>" }), SEGREDO)).toBeNull();
  });
  it("segredo curto nunca confere; hash do IP é estável e não contém o IP", async () => {
    expect(segredoIgual("abc", "abc")).toBe(false);
    expect(segredoIgual(SEGREDO, SEGREDO)).toBe(true);
    const a = await hashDoIp("187.65.18.77", "sal");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashDoIp("187.65.18.77", "sal")).toBe(a);
    expect(await hashDoIp("187.65.18.78", "sal")).not.toBe(a);
    const t = await hashDoToken("0.abc.def");
    expect(t).toMatch(/^[0-9a-f]{64}$/);
    expect(t).not.toBe(await hashDoToken("0.abc.deg"));
  });
});

describe("entrar-senha — a resposta do GoTrue e do captcha", () => {
  it("só senha errada (ou e-mail sem conta — o Auth não diferencia) conta na escada", () => {
    expect(categoriaGoTrue(200, { access_token: "a", refresh_token: "r" })).toBe("ok");
    expect(categoriaGoTrue(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" })).toBe("senha_errada");
    expect(categoriaGoTrue(400, { error_code: "user_banned", msg: "User is banned" })).toBe("desativado");
    expect(categoriaGoTrue(400, { error_code: "email_not_confirmed" })).toBe("nao_confirmado");
    expect(categoriaGoTrue(429, { error_code: "over_request_rate_limit" })).toBe("limite");
    expect(categoriaGoTrue(500, {})).toBe("falha");
    expect(categoriaGoTrue(0, null)).toBe("falha");
    expect(categoriaGoTrue(200, { access_token: "a" })).toBe("falha");
  });
  it("captcha: sucesso e a ação do entrar", () => {
    expect(captchaAceito({ success: true, action: "entrar" })).toBe(true);
    expect(captchaAceito({ success: true })).toBe(true);
    expect(captchaAceito({ success: true, action: "outra" })).toBe(false);
    expect(captchaAceito({ success: false, "error-codes": ["invalid-input-response"] })).toBe(false);
    expect(captchaAceito(null)).toBe(false);
  });
});

describe("entrar-senha — o corpo da resposta e a leitura no app", () => {
  it("recusa antes da senha: bloqueado (tempo), de vez, rede e em andamento", () => {
    expect(corpoRecusa({ motivo: "bloqueado", bloqueado_ate: "2026-09-30T12:05:00Z", agora: "2026-09-30T12:00:00Z" }))
      .toMatchObject({ ok: false, erro: "bloqueado", bloqueado_ate: "2026-09-30T12:05:00Z", bloqueado_de_vez: false });
    expect(corpoRecusa({ motivo: "bloqueado_de_vez", agora: "x" })).toMatchObject({ erro: "bloqueado_de_vez", bloqueado_ate: null, bloqueado_de_vez: true });
    expect(corpoRecusa({ motivo: "ip", bloqueado_ate: "t" })).toMatchObject({ erro: "muitas_tentativas_rede" });
    expect(corpoRecusa({ motivo: "em_andamento" })).toMatchObject({ erro: "em_andamento" });
  });
  it("senha errada: o estado novo da escada (o de vez vira o erro)", () => {
    expect(corpoSenhaErrada({ erros: 2, restam: 2, bloqueado_ate: null, bloqueado_de_vez: false, agora: "a" }))
      .toMatchObject({ erro: "senha_errada", erros: 2, restam: 2, bloqueado_ate: null });
    expect(corpoSenhaErrada({ erros: 9, bloqueado_de_vez: true, agora: "a" })).toMatchObject({ erro: "bloqueado_de_vez", bloqueado_de_vez: true });
  });
  it("o app lê a sessão, os erros conhecidos e trata o resto como indisponível", () => {
    expect(lerRespostaEntrar(200, { ok: true, sessao: { access_token: "a", refresh_token: "r" } })).toMatchObject({ ok: true });
    expect(lerRespostaEntrar(400, { ok: false, erro: "senha_errada", bloqueado_ate: "t", agora: "n", erros: 4, restam: 0 }))
      .toEqual({ ok: false, erro: "senha_errada", bloqueado_ate: "t", bloqueado_de_vez: false, agora: "n", erros: 4, restam: 0 });
    expect(lerRespostaEntrar(423, { ok: false, erro: "bloqueado_de_vez" })).toMatchObject({ erro: "bloqueado_de_vez", bloqueado_de_vez: true });
    expect(lerRespostaEntrar(502, "<html>")).toMatchObject({ ok: false, erro: "indisponivel" });
    expect(lerRespostaEntrar(200, { ok: true })).toMatchObject({ ok: false, erro: "indisponivel" });
  });
});
