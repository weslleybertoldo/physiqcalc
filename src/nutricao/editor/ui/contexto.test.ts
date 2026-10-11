// Physiq hml-19a (H-81) — o useAuth() das seções da nutrição devolve o MESMO objeto entre renders enquanto a pessoa é a mesma. Antes nascia
// um objeto novo a cada render, e todo efeito/callback com [user] rodava de novo a cada render (o laço da Anamnese: 227 POST em ~10 s;
// o de Questionários e Exames: ~21 GET/s em profiles).
import { renderHook } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ usuario: null as null | { id: string; email?: string | null } }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: h.usuario }) }));

import { useAuth } from "./contexto";

beforeEach(() => {
  h.usuario = { id: "u1", email: "nutri@teste.com" };
});

describe("hml-19a (H-81) — useAuth() estável", () => {
  it("devolve o MESMO objeto entre renders — também quando a sessão troca o objeto da mesma pessoa (o refresh do token)", () => {
    const { result, rerender } = renderHook(() => useAuth());
    const primeiro = result.current;
    rerender();
    rerender();
    expect(Object.is(result.current, primeiro)).toBe(true);
    h.usuario = { id: "u1", email: "nutri@teste.com" };
    rerender();
    expect(Object.is(result.current, primeiro)).toBe(true);
    expect(Object.is(result.current.user, primeiro.user)).toBe(true);
    expect(result.current.user).toEqual({ id: "u1", email: "nutri@teste.com" });
  });

  it("troca de pessoa (ou de e-mail) → objeto novo; sem login → user null", () => {
    const { result, rerender } = renderHook(() => useAuth());
    const a = result.current;
    h.usuario = { id: "u2", email: "outra@teste.com" };
    rerender();
    expect(result.current).not.toBe(a);
    expect(result.current.user?.id).toBe("u2");
    const b = result.current;
    h.usuario = { id: "u2", email: null };
    rerender();
    expect(result.current).not.toBe(b);
    h.usuario = null;
    rerender();
    expect(result.current.user).toBeNull();
  });

  it("um efeito com [user] roda 1 vez em 10 renders da mesma pessoa (a causa do H-81) e de novo só quando a pessoa muda", () => {
    const efeito = vi.fn();
    const { rerender } = renderHook(() => {
      const { user } = useAuth();
      useEffect(() => {
        efeito(user?.id);
      }, [user]);
    });
    for (let i = 0; i < 10; i++) rerender();
    expect(efeito).toHaveBeenCalledTimes(1);
    h.usuario = { id: "u3", email: "nova@teste.com" };
    rerender();
    expect(efeito).toHaveBeenCalledTimes(2);
    expect(efeito).toHaveBeenLastCalledWith("u3");
  });
});
