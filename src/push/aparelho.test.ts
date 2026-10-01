import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  plataforma: "web",
  plugins: new Set<string>(),
  firebase: true as boolean | "erro",
  push: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    createChannel: vi.fn(),
    register: vi.fn(),
    unregister: vi.fn(),
    addListener: vi.fn(),
  },
  rpc: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => h.plataforma,
    isNativePlatform: () => h.plataforma !== "web",
    isPluginAvailable: (n: string) => h.plugins.has(n),
  },
  registerPlugin: () => ({
    disponivel: async () => {
      if (h.firebase === "erro") throw new Error("não implementado");
      return { disponivel: h.firebase };
    },
  }),
}));
vi.mock("@capacitor/push-notifications", () => ({ PushNotifications: h.push }));
vi.mock("@/integrations/principal/client", () => ({ principal: { rpc: (...a: unknown[]) => h.rpc(...a) } }));

import { _zerarParaTestes, esquecerAparelhoPush, ouvir, permissaoAtual, pushDisponivel, registrar, salvarToken } from "./aparelho";
import { guardarToken, tokenGuardado } from "./regras";

const TOKEN = "fGx1y2z3:APA91bH-exemplo_de_token.do-FCM";

function android(firebase: boolean | "erro" = true) {
  h.plataforma = "android";
  h.plugins = new Set(["PushNotifications", "PushFirebase"]);
  h.firebase = firebase;
}

beforeEach(() => {
  localStorage.clear();
  _zerarParaTestes();
  h.plataforma = "web";
  h.plugins = new Set();
  h.firebase = true;
  for (const f of Object.values(h.push)) f.mockReset();
  h.push.createChannel.mockResolvedValue(undefined);
  h.push.register.mockResolvedValue(undefined);
  h.push.unregister.mockResolvedValue(undefined);
  h.push.addListener.mockResolvedValue({ remove: vi.fn() });
  h.rpc.mockReset();
  h.rpc.mockResolvedValue({ data: { ok: true }, error: null });
});

describe("W20c — só o APK Android COM o Firebase registra o push", () => {
  it("no site (web): indisponível e nada é chamado (nem o register, nem os ouvintes)", async () => {
    expect(await pushDisponivel()).toBe(false);
    await registrar();
    await ouvir({ aoToken: vi.fn(), aoReceber: vi.fn(), aoTocar: vi.fn() });
    expect(h.push.register).not.toHaveBeenCalled();
    expect(h.push.addListener).not.toHaveBeenCalled();
  });
  it("APK sem o Firebase (sem google-services.json): indisponível — o register (que derrubaria o app) nunca é chamado", async () => {
    android(false);
    expect(await pushDisponivel()).toBe(false);
    await registrar();
    expect(h.push.register).not.toHaveBeenCalled();
  });
  it("APK antigo/sem o plugin nativo PushFirebase: indisponível", async () => {
    android(true);
    h.plugins = new Set(["PushNotifications"]);
    expect(await pushDisponivel()).toBe(false);
    _zerarParaTestes();
    android("erro");
    expect(await pushDisponivel()).toBe(false);
  });
  it("APK com o Firebase: cria o canal \"Avisos\" (importância alta) 1 vez e registra", async () => {
    android(true);
    expect(await pushDisponivel()).toBe(true);
    await registrar();
    await registrar();
    expect(h.push.createChannel).toHaveBeenCalledTimes(1);
    expect(h.push.createChannel).toHaveBeenCalledWith(expect.objectContaining({ id: "avisos", name: "Avisos", importance: 4 }));
    expect(h.push.register).toHaveBeenCalledTimes(2);
  });
  it("permissão: erro do plugin = negada (não pede de novo, não quebra)", async () => {
    android(true);
    h.push.checkPermissions.mockRejectedValue(new Error("x"));
    expect(await permissaoAtual()).toBe("denied");
    h.push.checkPermissions.mockResolvedValue({ receive: "prompt" });
    expect(await permissaoAtual()).toBe("prompt");
  });
  it("ouvintes ligados 1 vez; o token que chega é entregue ao handler atual", async () => {
    android(true);
    const a1 = vi.fn();
    const a2 = vi.fn();
    await ouvir({ aoToken: a1, aoReceber: vi.fn(), aoTocar: vi.fn() });
    await ouvir({ aoToken: a2, aoReceber: vi.fn(), aoTocar: vi.fn() });
    expect(h.push.addListener).toHaveBeenCalledTimes(4);
    const registro = h.push.addListener.mock.calls.find((c) => c[0] === "registration")![1] as (t: { value: string }) => void;
    registro({ value: TOKEN });
    expect(a1).not.toHaveBeenCalled();
    expect(a2).toHaveBeenCalledWith(TOKEN);
  });
});

describe("W20c — o token no banco principal", () => {
  it("salvar: push_registrar com o token, a plataforma e a versão; guarda para apagar ao sair", async () => {
    expect(await salvarToken("u1", TOKEN)).toBe(true);
    expect(h.rpc).toHaveBeenCalledWith("push_registrar", { p_token: TOKEN, p_plataforma: "android", p_versao: null });
    expect(tokenGuardado()).toEqual({ uid: "u1", token: TOKEN });
  });
  it("token inválido não vai ao banco; erro do banco não guarda", async () => {
    expect(await salvarToken("u1", "curto")).toBe(false);
    expect(h.rpc).not.toHaveBeenCalled();
    h.rpc.mockResolvedValue({ data: null, error: { message: "sem_login" } });
    expect(await salvarToken("u1", TOKEN)).toBe(false);
    expect(tokenGuardado()).toBeNull();
  });
  it("sair: apaga no banco (push_esquecer) e no FCM (unregister) e esquece o guardado", async () => {
    android(true);
    guardarToken("u1", TOKEN);
    await esquecerAparelhoPush();
    expect(h.rpc).toHaveBeenCalledWith("push_esquecer", { p_token: TOKEN });
    expect(h.push.unregister).toHaveBeenCalled();
    expect(tokenGuardado()).toBeNull();
  });
  it("sair sem token guardado (site, ou push nunca ligado): não chama nada", async () => {
    await esquecerAparelhoPush();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.push.unregister).not.toHaveBeenCalled();
  });
  it("sair sem internet não trava: no máximo 3 s", async () => {
    vi.useFakeTimers();
    try {
      android(true);
      guardarToken("u1", TOKEN);
      h.rpc.mockReturnValue(new Promise(() => undefined));
      const p = esquecerAparelhoPush();
      await vi.advanceTimersByTimeAsync(3100);
      await expect(p).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
