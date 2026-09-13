import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pwa, ultimoApkMock, baixarMock, toastMock } = vi.hoisted(() => ({
  pwa: { canInstall: false, isInstalled: false, promptInstall: vi.fn(async () => {}) },
  ultimoApkMock: vi.fn(),
  baixarMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/hooks/usePWAInstall", () => ({ usePWAInstall: () => pwa }));
vi.mock("@/lib/apkRelease", () => ({
  ultimoApk: ultimoApkMock,
  baixarNoNavegador: baixarMock,
  RELEASES_PAGE: "https://github.com/weslleybertoldo/physiqcalc/releases/latest",
}));
vi.mock("sonner", () => ({ toast: toastMock }));

import InstalarMenu from "./InstalarMenu";

const UA_ANDROID = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36";
const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const setUA = (ua: string) => Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });

/** clica em "Instalar" e devolve o popup */
const abrir = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Instalar" }));
  return await screen.findByRole("dialog");
};
const popupFechado = () => waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

beforeEach(() => {
  pwa.canInstall = false;
  pwa.isInstalled = false;
  setUA(UA_ANDROID);
});
afterEach(() => vi.clearAllMocks());

describe("InstalarMenu (site)", () => {
  it("mostra só 'Instalar'; o clique abre o popup com App Web em cima e APK Android embaixo", async () => {
    render(<InstalarMenu />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("App Web")).toBeNull();
    const dlg = await abrir();
    const aw = within(dlg).getByRole("button", { name: /app web/i });
    const apk = within(dlg).getByRole("button", { name: /apk android/i });
    expect(aw.compareDocumentPosition(apk) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(dlg).getByText("Instalar o PhysiqCalc")).toBeInTheDocument();
  });

  it("App Web com prompt nativo instala direto e fecha o popup", async () => {
    pwa.canInstall = true;
    render(<InstalarMenu />);
    const dlg = await abrir();
    fireEvent.click(within(dlg).getByRole("button", { name: /app web/i }));
    await waitFor(() => expect(pwa.promptInstall).toHaveBeenCalledTimes(1));
    await popupFechado();
    expect(toastMock.info).not.toHaveBeenCalled();
  });

  it("App Web sem prompt no iPhone mostra a frase Compartilhar → Adicionar à Tela de Início (sem guia)", async () => {
    setUA(UA_IPHONE);
    render(<InstalarMenu />);
    const dlg = await abrir();
    fireEvent.click(within(dlg).getByRole("button", { name: /app web/i }));
    await waitFor(() => expect(toastMock.info).toHaveBeenCalledTimes(1));
    expect(String(toastMock.info.mock.calls[0][0])).toBe('Toque em "Compartilhar" → "Adicionar à Tela de Início"');
    expect(pwa.promptInstall).not.toHaveBeenCalled();
    await popupFechado();
  });

  it("App Web sem prompt no Android mostra a frase do menu ⋮", async () => {
    render(<InstalarMenu />);
    const dlg = await abrir();
    fireEvent.click(within(dlg).getByRole("button", { name: /app web/i }));
    await waitFor(() => expect(toastMock.info).toHaveBeenCalledTimes(1));
    expect(String(toastMock.info.mock.calls[0][0])).toBe('Toque no menu ⋮ → "Adicionar à tela inicial"');
  });

  it("já instalado: App Web desabilitado com aviso", async () => {
    pwa.isInstalled = true;
    render(<InstalarMenu />);
    const dlg = await abrir();
    expect(within(dlg).getByRole("button", { name: /já instalado/i })).toBeDisabled();
  });

  it("APK Android baixa o .apk da última release e fecha o popup", async () => {
    ultimoApkMock.mockResolvedValue({
      version: "2.119",
      url: "https://github.com/weslleybertoldo/physiqcalc/releases/download/v2.119/PhysiqCalc-v2.119.apk",
    });
    render(<InstalarMenu />);
    const dlg = await abrir();
    fireEvent.click(within(dlg).getByRole("button", { name: /apk android/i }));
    await waitFor(() =>
      expect(baixarMock).toHaveBeenCalledWith("https://github.com/weslleybertoldo/physiqcalc/releases/download/v2.119/PhysiqCalc-v2.119.apk"),
    );
    expect(toastMock.success).toHaveBeenCalled();
    await popupFechado();
  });

  it("APK Android sem API → página de releases", async () => {
    ultimoApkMock.mockResolvedValue(null);
    render(<InstalarMenu />);
    const dlg = await abrir();
    fireEvent.click(within(dlg).getByRole("button", { name: /apk android/i }));
    await waitFor(() => expect(baixarMock).toHaveBeenCalledWith("https://github.com/weslleybertoldo/physiqcalc/releases/latest"));
    expect(toastMock.error).toHaveBeenCalled();
  });
});
