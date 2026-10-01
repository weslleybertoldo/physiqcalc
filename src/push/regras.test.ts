import { beforeEach, describe, expect, it } from "vitest";
import {
  adiadoRecentemente,
  adiar,
  CHAVE_TOKEN,
  esquecerTokenGuardado,
  guardarToken,
  proximoPasso,
  pushAtivoNoAparelho,
  rotaDoToque,
  tokenGuardado,
} from "./regras";

const TOKEN = "fGx1y2z3:APA91bH-exemplo_de_token.do-FCM";

beforeEach(() => localStorage.clear());

describe("W20c — o push no aparelho: o que fazer ao abrir com sessão", () => {
  it("já permitido → registra calado; ainda não decidiu → pede; negou → nada (segue com sino, e-mail e local)", () => {
    expect(proximoPasso("granted")).toBe("registrar");
    expect(proximoPasso("prompt")).toBe("pedir");
    expect(proximoPasso("prompt-with-rationale")).toBe("pedir");
    expect(proximoPasso("denied")).toBe("nada");
    expect(proximoPasso(undefined)).toBe("nada");
  });
  it("toque na notificação: abre a rota do aviso; sem rota ou rota de fora = o início", () => {
    expect(rotaDoToque({ link: "/perfil/agenda", aviso_id: "x" })).toBe("/perfil/agenda");
    expect(rotaDoToque({ link: "https://outro.site" })).toBe("/");
    expect(rotaDoToque({})).toBe("/");
    expect(rotaDoToque(null)).toBe("/");
  });
});

describe("W20c — o token guardado neste aparelho (para apagar ao sair)", () => {
  it("guarda só token válido; o push fica ativo para a pessoa dona dele", () => {
    guardarToken("u1", "curto");
    expect(tokenGuardado()).toBeNull();
    guardarToken("u1", TOKEN);
    expect(tokenGuardado()).toEqual({ uid: "u1", token: TOKEN });
    expect(pushAtivoNoAparelho("u1")).toBe(true);
    expect(pushAtivoNoAparelho()).toBe(true);
    expect(pushAtivoNoAparelho("u2")).toBe(false);
    esquecerTokenGuardado();
    expect(tokenGuardado()).toBeNull();
    expect(pushAtivoNoAparelho("u1")).toBe(false);
  });
  it("guardado estragado não quebra nada", () => {
    localStorage.setItem(CHAVE_TOKEN, "{não é json");
    expect(tokenGuardado()).toBeNull();
    localStorage.setItem(CHAVE_TOKEN, JSON.stringify({ uid: "u1", token: "x" }));
    expect(tokenGuardado()).toBeNull();
  });
});

describe("W20c — \"Agora não\" no pedido volta a perguntar em 7 dias (por pessoa)", () => {
  it("adiado vale 7 dias e só para quem adiou", () => {
    const agora = new Date("2026-10-01T12:00:00Z");
    expect(adiadoRecentemente("u1", agora)).toBe(false);
    adiar("u1", agora);
    expect(adiadoRecentemente("u1", new Date("2026-10-07T11:00:00Z"))).toBe(true);
    expect(adiadoRecentemente("u1", new Date("2026-10-08T12:00:01Z"))).toBe(false);
    expect(adiadoRecentemente("u2", agora)).toBe(false);
  });
});
