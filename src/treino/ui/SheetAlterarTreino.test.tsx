import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";

// hml-18a (H-40, B) — "Trocar o treino do dia" › apagar um treino próprio: a confirmação é a do app (era window.confirm). No local e no
// staging o treino do aluno não abre (o build de staging não tem PowerSync desde a H-14): este caso é o que o E2E não alcança lá.

const h = vi.hoisted(() => ({ execute: vi.fn(async () => undefined), getAll: vi.fn(async () => []) }));
vi.mock("@powersync/react", () => ({ usePowerSync: () => ({ execute: h.execute, getAll: h.getAll }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { SheetAlterarTreino } from "./SheetAlterarTreino";

function montar() {
  return render(
    <ProvedorConfirmar>
      <SheetAlterarTreino
        aberto
        aoMudar={() => {}}
        userId="u1"
        titulo="Trocar o treino de hoje"
        gruposProfissional={[{ id: "g1", nome: "Peito e tríceps" }]}
        gruposPessoais={[{ id: "m1", nome: "Meu treino de casa" }]}
        permiteDescanso={false}
        aoEscolher={() => {}}
      />
    </ProvedorConfirmar>,
  );
}

const apagou = () => h.execute.mock.calls.some((c: unknown[]) => String(c[0]).startsWith("DELETE FROM tb_grupos_treino_usuario"));

beforeEach(() => {
  h.execute.mockClear();
});

describe("Trocar o treino do dia › apagar o treino próprio (hml-18a)", () => {
  it("pede a confirmação do app: Cancelar não apaga; Apagar apaga (e nenhum diálogo do navegador)", async () => {
    const nativo = vi.spyOn(window, "confirm");
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Apagar Meu treino de casa" }));
    let dialogo = await screen.findByRole("alertdialog");
    expect(dialogo).toHaveTextContent('Apagar o treino "Meu treino de casa"?');
    expect(dialogo).toHaveTextContent("Não dá para desfazer.");
    expect(dialogo.querySelector("[data-confirmar-ok]")).toHaveTextContent("Apagar");
    fireEvent.click(dialogo.querySelector("[data-confirmar-cancelar]")!);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(apagou()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Apagar Meu treino de casa" }));
    dialogo = await screen.findByRole("alertdialog");
    fireEvent.click(dialogo.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(apagou()).toBe(true));
    expect(h.execute).toHaveBeenCalledWith("DELETE FROM tb_grupos_treino_usuario WHERE id = ? AND user_id = ?", ["m1", "u1"]);
    expect(nativo).not.toHaveBeenCalled();
    nativo.mockRestore();
  });
});
