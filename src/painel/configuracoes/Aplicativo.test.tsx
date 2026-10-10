import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// hml-17 (H-39): Configurações › Aplicativo — a consulta da release que falhou (sem rede, rate limit, mais de 8 s) dizia, no APK,
// "Você está na mais nova" (o ultimoApk devolvia null na falha). Agora: "não deu para verificar" com Tentar de novo.
const h = vi.hoisted(() => ({
  versao: ((globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = "3.4"),
  nativo: false,
  verificar: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => h.nativo, getPlatform: () => (h.nativo ? "android" : "web") }, registerPlugin: () => ({}) }));
vi.mock("@/lib/apkUpdater", () => ({ downloadAndInstall: vi.fn() }));
vi.mock("@/hooks/usePWAInstall", () => ({ usePWAInstall: () => ({ canInstall: false, isInstalled: false, promptInstall: vi.fn() }) }));
vi.mock("@/lib/apkRelease", () => ({
  ultimoApkOuErro: (...a: unknown[]) => h.verificar(...a),
  ultimoApk: vi.fn(async () => null),
  baixarNoNavegador: vi.fn(),
  RELEASES_PAGE: "https://x",
}));

import Aplicativo from "./Aplicativo";

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter useTransitions={false}>
        <Aplicativo />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.nativo = false;
  h.verificar.mockReset();
});

describe("Configurações › Aplicativo — a release que não deu para verificar (hml-17)", () => {
  it("APK: a consulta falhou → \"Não deu para verificar — tentar de novo\" (nunca \"Você está na mais nova\"), sem EM DIA; tocar refaz", async () => {
    h.nativo = true;
    h.verificar.mockRejectedValue(new Error("release sem resposta"));
    montar();
    await waitFor(() => expect(document.querySelector("[data-app-verificar-erro]")).not.toBeNull());
    expect(screen.getByRole("button", { name: /Não deu para verificar — tentar de novo/ })).toBeInTheDocument();
    expect(screen.queryByText("Você está na mais nova")).toBeNull();
    expect(screen.queryByText("EM DIA")).toBeNull();
    expect(screen.getByText("não deu para verificar")).toBeInTheDocument();
    const antes = h.verificar.mock.calls.length;
    h.verificar.mockReset().mockResolvedValue({ version: "3.4", url: "https://x/Physiq-v3.4.apk" });
    fireEvent.click(screen.getByRole("button", { name: /Não deu para verificar — tentar de novo/ }));
    expect(await screen.findByText("Você está na mais nova")).toBeInTheDocument();
    expect(h.verificar.mock.calls.length).toBeGreaterThan(0);
    expect(antes).toBeGreaterThan(0);
    expect(document.querySelector("[data-app-verificar-erro]")).toBeNull();
    expect(screen.getByText("EM DIA")).toBeInTheDocument();
  });

  it("site: a consulta falhou → o APK mais novo \"—\" com \"não deu para verificar\" e Tentar de novo ao lado do Baixar", async () => {
    h.verificar.mockRejectedValueOnce(new Error("release HTTP 403"));
    montar();
    await waitFor(() => expect(document.querySelector("[data-app-verificar-erro]")).not.toBeNull());
    expect(screen.getByText("não deu para verificar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Baixar o APK/ })).toBeInTheDocument();
    h.verificar.mockResolvedValueOnce({ version: "9.1", url: "https://x/Physiq-v9.1.apk" });
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("v9.1")).toBeInTheDocument();
    expect(screen.queryByText("não deu para verificar")).toBeNull();
  });

  it("controle: a release respondeu com a versão instalada → \"Você está na mais nova\" e EM DIA, sem aviso", async () => {
    h.nativo = true;
    h.verificar.mockResolvedValue({ version: "3.4", url: "https://x/Physiq-v3.4.apk" });
    montar();
    expect(await screen.findByText("Você está na mais nova")).toBeInTheDocument();
    expect(screen.getByText("EM DIA")).toBeInTheDocument();
    expect(document.querySelector("[data-app-verificar-erro]")).toBeNull();
  });
});
