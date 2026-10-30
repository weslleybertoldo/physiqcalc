import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { MARCA_BEM_VINDO } from "@/nucleo/restaurarLogin";

// restaurar-login (D5) — o "Bem-vindo de volta, Nome — entramos sozinhos pelo backup do Google." aparece UMA vez depois de entrar sozinho
// no celular novo (a marca que a restauração grava), com o 1º nome da situação; sem a marca (o login de sempre), nada.
const h = vi.hoisted(() => ({ usuario: null as unknown, situacao: null as unknown }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: h.usuario, situacao: h.situacao }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn() } }));

import AvisoBemVindoDeVolta from "./AvisoBemVindoDeVolta";

const UID = "f3513284-3e44-40cc-84bb-d7a39a929e8d";

beforeEach(() => {
  localStorage.clear();
  vi.mocked(toast.success).mockClear();
  h.usuario = { id: UID };
  h.situacao = { user_id: UID, nome: "Lia Ferreira Teste", master: false };
});

describe("aviso 'Bem-vindo de volta' (restaurar-login, D5)", () => {
  it("depois da restauração: 1 vez, com o 1º nome, e a marca sai", () => {
    localStorage.setItem(MARCA_BEM_VINDO, UID);
    const r = render(<AvisoBemVindoDeVolta />);
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Bem-vindo de volta, Lia — entramos sozinhos pelo backup do Google.", { duration: 8000 });
    expect(localStorage.getItem(MARCA_BEM_VINDO)).toBeNull();
    r.unmount();
    render(<AvisoBemVindoDeVolta />);
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("espera a situação (o nome) chegar; sem nome, o aviso sai sem ele", () => {
    localStorage.setItem(MARCA_BEM_VINDO, UID);
    h.situacao = null;
    const r = render(<AvisoBemVindoDeVolta />);
    expect(toast.success).not.toHaveBeenCalled();
    h.situacao = { user_id: UID, nome: null, master: false };
    r.rerender(<AvisoBemVindoDeVolta />);
    expect(toast.success).toHaveBeenCalledWith("Bem-vindo de volta — entramos sozinhos pelo backup do Google.", { duration: 8000 });
  });

  it("sem a marca (o login de sempre) ou com a marca de OUTRA pessoa: nada", () => {
    render(<AvisoBemVindoDeVolta />);
    localStorage.setItem(MARCA_BEM_VINDO, "outra-pessoa");
    render(<AvisoBemVindoDeVolta />);
    expect(toast.success).not.toHaveBeenCalled();
    expect(localStorage.getItem(MARCA_BEM_VINDO)).toBe("outra-pessoa");
  });
});
