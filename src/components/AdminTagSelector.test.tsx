import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: invokeMock } },
  DB_SCHEMA: "public",
}));

import AdminTagSelector from "./AdminTagSelector";

const tags = [
  { id: "t1", nome: "Iniciante", cor: "#22c55e" },
  { id: "t2", nome: "Online", cor: "#3b82f6" },
];

beforeEach(() => {
  invokeMock.mockReset();
});

describe("AdminTagSelector", () => {
  it("carrega catálogo + tags do usuário com UMA chamada (getUserTagsCompleto) e marca as selecionadas", async () => {
    invokeMock.mockResolvedValueOnce({ data: { tags, tagIds: ["t2"] }, error: null });
    render(<AdminTagSelector userId="u1" />);
    await waitFor(() => expect(screen.getByText("Iniciante")).toBeInTheDocument());
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("admin-tags", { body: { action: "getUserTagsCompleto", userId: "u1" } });
    expect(screen.getByText("Online")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Iniciante")).toHaveAttribute("aria-pressed", "false");
  });

  it("clicar numa tag grava o conjunto novo (setUserTags) e reflete na tela", async () => {
    invokeMock.mockResolvedValueOnce({ data: { tags, tagIds: ["t2"] }, error: null });
    invokeMock.mockResolvedValueOnce({ data: { ok: true }, error: null });
    render(<AdminTagSelector userId="u1" />);
    await waitFor(() => expect(screen.getByText("Iniciante")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Iniciante"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    expect(invokeMock).toHaveBeenLastCalledWith("admin-tags", { body: { action: "setUserTags", userId: "u1", tagIds: ["t2", "t1"] } });
    expect(screen.getByText("Iniciante")).toHaveAttribute("aria-pressed", "true");
  });

  it("sem tags cadastradas → mensagem de vazio; erro da edge → não explode", async () => {
    invokeMock.mockResolvedValueOnce({ data: { tags: [], tagIds: [] }, error: null });
    render(<AdminTagSelector userId="u1" />);
    await waitFor(() => expect(screen.getByText(/Nenhuma tag criada/)).toBeInTheDocument());
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    render(<AdminTagSelector userId="u2" />);
    await waitFor(() => expect(screen.getAllByText(/Nenhuma tag criada/).length).toBe(2));
  });
});
