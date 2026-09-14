import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { convitesMock, toastSuccessMock } = vi.hoisted(() => ({ convitesMock: vi.fn(), toastSuccessMock: vi.fn() }));
vi.mock("@/lib/saasApi", async () => {
  const real = await vi.importActual<typeof import("@/lib/saasApi")>("@/lib/saasApi");
  return { ...real, professorConvites: convitesMock };
});
vi.mock("sonner", () => ({ toast: { success: toastSuccessMock, error: vi.fn() } }));

import { ConviteAlunoConteudo } from "./ConviteAlunoDialog";

/** As 2 primeiras chamadas do componente são "link" e "list"; a 3ª é o convite por e-mail. */
function mockCarga() {
  convitesMock.mockResolvedValueOnce({ codigo: "PROF-TESTE", url: "https://physiqcalc.com.br/?prof=PROF-TESTE" });
  convitesMock.mockResolvedValueOnce({ convites: [] });
}

async function convidar(email = "aluno@teste.com") {
  render(<ConviteAlunoConteudo />);
  await waitFor(() => expect(convitesMock).toHaveBeenCalledTimes(2));
  fireEvent.change(screen.getByPlaceholderText("email@do.aluno"), { target: { value: email } });
  fireEvent.click(screen.getByText("Convidar"));
}

beforeEach(() => {
  convitesMock.mockReset();
  toastSuccessMock.mockReset();
});

describe("ConviteAlunoConteudo — convite por e-mail", () => {
  it("avisa que o e-mail foi enviado quando a edge devolve emailEnviado", async () => {
    mockCarga();
    convitesMock.mockResolvedValueOnce({ vinculado: false, convite: { id: "c1" }, emailEnviado: true });
    convitesMock.mockResolvedValue({ codigo: "PROF-TESTE", url: "u", convites: [] });
    await convidar();
    await waitFor(() => expect(screen.getByText(/Enviamos um e-mail com o link/)).toBeInTheDocument());
    expect(toastSuccessMock).toHaveBeenCalledWith("Convite enviado por e-mail.");
  });

  it("cai no WhatsApp quando o e-mail não foi enviado", async () => {
    mockCarga();
    convitesMock.mockResolvedValueOnce({ vinculado: false, convite: { id: "c1" }, emailEnviado: false });
    convitesMock.mockResolvedValue({ codigo: "PROF-TESTE", url: "u", convites: [] });
    await convidar();
    await waitFor(() => expect(screen.getByText(/Mande o link pelo WhatsApp/)).toBeInTheDocument());
    expect(toastSuccessMock).toHaveBeenCalledWith("Convite registrado.");
  });
});
