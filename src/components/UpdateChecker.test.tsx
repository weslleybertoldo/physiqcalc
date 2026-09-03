import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { isNativeMock } = vi.hoisted(() => {
  // `__APP_VERSION__` é injetado pelo Vite (define) — no vitest não existe
  (globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = "2.112";
  return { isNativeMock: vi.fn(() => false) };
});
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: isNativeMock, getPlatform: () => "web" } }));
vi.mock("@/lib/apkUpdater", () => ({ downloadAndInstall: vi.fn() }));

import UpdateChecker, { ATRASO_CHECK_UPDATE_MS } from "./UpdateChecker";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  isNativeMock.mockReturnValue(false);
});

describe("UpdateChecker", () => {
  it("na web nunca consulta o GitHub", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<UpdateChecker />);
    act(() => {
      vi.advanceTimersByTime(ATRASO_CHECK_UPDATE_MS * 3);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it("no APK consulta a release só depois do atraso", async () => {
    isNativeMock.mockReturnValue(true);
    const fetchMock = vi.fn().mockResolvedValue({ ok: false } as Response);
    vi.stubGlobal("fetch", fetchMock);
    render(<UpdateChecker />);
    act(() => {
      vi.advanceTimersByTime(ATRASO_CHECK_UPDATE_MS - 1);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/releases/latest");
  });

  it("desmontar antes do atraso cancela a consulta", () => {
    isNativeMock.mockReturnValue(true);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = render(<UpdateChecker />);
    unmount();
    act(() => {
      vi.advanceTimersByTime(ATRASO_CHECK_UPDATE_MS * 2);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
