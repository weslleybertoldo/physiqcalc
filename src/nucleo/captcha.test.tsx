import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TURNSTILE_SITE_KEY, useCaptcha, type TurnstileApi } from "./captcha";

/** O Turnstile de mentira: guarda a caixa e as opções de cada render; o teste chama o callback para entregar o token. */
type Render = { el: HTMLElement; opcoes: { sitekey: string; action?: string; callback?: (t: string) => void } };
let renders: Render[] = [];
let api: TurnstileApi;

beforeEach(() => {
  renders = [];
  api = {
    render: vi.fn((el: HTMLElement | string, opcoes: Render["opcoes"]) => {
      renders.push({ el: el as HTMLElement, opcoes });
      return `w${renders.length}`;
    }),
    reset: vi.fn(),
    remove: vi.fn(),
    execute: vi.fn(),
  };
  // o script do Cloudflare JÁ carregado (2ª tela da sessão, cache): é o caso em que o widget do /c/ não montava
  window.turnstile = api;
});

afterEach(() => {
  delete window.turnstile;
});

/** Igual ao /c/: a caixa do captcha só existe depois que o formulário aparece ("Abrindo o cadastro" antes). */
function Tela({ comCaixa }: { comCaixa: boolean }) {
  const captcha = useCaptcha("cadastro");
  const [tok, setTok] = useState("—");
  return (
    <div>
      {comCaixa ? <div ref={captcha.refCaixa} data-testid="caixa" data-captcha={captcha.estado} /> : <p>Abrindo o cadastro</p>}
      <button onClick={() => void captcha.obterToken().then(setTok)}>token</button>
      <span data-testid="tok">{tok}</span>
    </div>
  );
}

describe("hml-15b (H-78) — useCaptcha: o widget monta quando a caixa entra na tela", () => {
  it("script carregado ANTES do formulário: monta assim que a caixa aparece, e o token chega", async () => {
    const tela = render(<Tela comCaixa={false} />);
    await act(async () => {}); // o carregarTurnstile já resolveu (window.turnstile) sem caixa nenhuma na tela
    expect(api.render).not.toHaveBeenCalled();

    tela.rerender(<Tela comCaixa />);
    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    expect(renders[0].el).toBe(screen.getByTestId("caixa"));
    expect(renders[0].opcoes).toMatchObject({ sitekey: TURNSTILE_SITE_KEY, action: "cadastro" });
    await waitFor(() => expect(screen.getByTestId("caixa").getAttribute("data-captcha")).toBe("pronto"));

    fireEvent.click(screen.getByText("token"));
    act(() => renders[0].opcoes.callback?.("tok-cadastro"));
    await waitFor(() => expect(screen.getByTestId("tok").textContent).toBe("tok-cadastro"));
  });

  it("1ª abertura: o script começa a carregar com a tela, ANTES da caixa, e o widget monta quando ela aparece", async () => {
    delete window.turnstile;
    const tela = render(<Tela comCaixa={false} />);
    const script = document.querySelector<HTMLScriptElement>("script[data-physiq-turnstile]");
    expect(script?.src).toContain("challenges.cloudflare.com/turnstile/v0/api.js");

    window.turnstile = api; // o script do Cloudflare carregou, e o formulário ainda não chegou
    script?.dispatchEvent(new Event("load"));
    await act(async () => {});
    expect(api.render).not.toHaveBeenCalled();

    tela.rerender(<Tela comCaixa />);
    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    expect(renders[0].el).toBe(screen.getByTestId("caixa"));
    script?.remove();
  });

  it("caixa na tela desde o começo (o /entrar/email): monta uma vez só", async () => {
    render(<Tela comCaixa />);
    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    expect(renders[0].el).toBe(screen.getByTestId("caixa"));
    await act(async () => {});
    expect(api.render).toHaveBeenCalledTimes(1);
  });

  it("a caixa sai da tela (cadastro enviado) ou a tela fecha: o widget é removido", async () => {
    const tela = render(<Tela comCaixa />);
    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    tela.rerender(<Tela comCaixa={false} />);
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith("w1"));

    tela.rerender(<Tela comCaixa />);
    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(2));
    tela.unmount();
    expect(api.remove).toHaveBeenCalledWith("w2");
  });
});
