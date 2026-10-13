import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Rotina } from "@/aluno-dia/tipos";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";

const h = vi.hoisted(() => ({
  salvar: vi.fn(),
  arquivar: vi.fn(),
  profSalvar: vi.fn(),
  profArquivar: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/aluno-dia/api", async (orig) => ({
  ...(await orig<typeof import("@/aluno-dia/api")>()),
  salvarRotina: (...a: unknown[]) => h.salvar(...a),
  arquivarRotina: (...a: unknown[]) => h.arquivar(...a),
  profSalvarRotina: (...a: unknown[]) => h.profSalvar(...a),
  profArquivarRotina: (...a: unknown[]) => h.profArquivar(...a),
}));
vi.mock("sonner", () => ({ toast: h.toast }));

import { ErroAlunoDia } from "@/aluno-dia/api";
import { FolhaRotina, type ModoDaFolha } from "./FolhaRotina";

const rotina = (o: Partial<Rotina> = {}): Rotina => ({
  id: "r1", origem: "aluno", paciente_id: null, nome: "Creatina", detalhe: "5 g", tipo: "suplemento", horario: "08:00", dias_semana: [1, 2, 3, 4, 5, 6, 7],
  lembrete: true, ordem: 0, criada_em: "2026-09-01T12:00:00Z", alterada_em: "2026-09-01T12:00:00Z", arquivada_em: null, ...o,
});

function abrir(modo: ModoDaFolha = { tipo: "aluno" }, r: Rotina | null = null) {
  const aoMudar = vi.fn();
  const aoSalvo = vi.fn();
  const aoApagado = vi.fn();
  render(
    <ProvedorConfirmar>
      <FolhaRotina aberta aoMudar={aoMudar} modo={modo} rotina={r} aoSalvo={aoSalvo} aoApagado={aoApagado} />
    </ProvedorConfirmar>,
  );
  return { aoMudar, aoSalvo, aoApagado };
}
// o erro do campo fica DENTRO do <label> (src/entrada/pecas/Campo.tsx): o rótulo é o começo do texto
const campo = (rotulo: string) => screen.getByLabelText(new RegExp(`^${rotulo.replace(/[()]/g, "\\$&")}`)) as HTMLInputElement;

beforeEach(() => {
  for (const f of [h.salvar, h.arquivar, h.profSalvar, h.profArquivar, h.toast, h.toast.success, h.toast.error]) f.mockReset();
  h.salvar.mockImplementation(async (_id: string | null, dados: Record<string, unknown>) => ({ ok: true, rotina: rotina({ id: "nova", ...dados }) }));
  h.profSalvar.mockImplementation(async (_a: string, _id: string | null, dados: Record<string, unknown>) => ({ ok: true, rotina: rotina({ id: "p1", origem: "profissional", ...dados }) }));
  h.arquivar.mockResolvedValue({ ok: true });
  h.profArquivar.mockResolvedValue({ ok: true });
});

describe("W-A P3 — a folha da rotina", () => {
  it("nova (aluno): nome, detalhe, tipo, horário, 'Seg a Sex' e o lembrete → a função com os dados certos; fecha e avisa", async () => {
    const { aoMudar, aoSalvo } = abrir();
    expect(screen.getByRole("switch", { name: "Lembrete" })).toBeDisabled();
    expect(screen.getByText("Escolha um horário para ligar o lembrete.")).toBeInTheDocument();
    fireEvent.change(campo("Nome"), { target: { value: " Losartana " } });
    fireEvent.change(campo("Detalhe (opcional)"), { target: { value: "50 mg" } });
    fireEvent.click(screen.getByRole("radio", { name: "Remédio" }));
    fireEvent.change(campo("Horário (opcional)"), { target: { value: "20:00" } });
    fireEvent.click(document.querySelector('[data-rotina-atalho="semana"]')!);
    fireEvent.click(screen.getByRole("switch", { name: "Lembrete" }));
    fireEvent.click(document.querySelector("[data-rotina-salvar]")!);
    await waitFor(() => expect(h.salvar).toHaveBeenCalledWith(null, {
      nome: "Losartana", detalhe: "50 mg", tipo: "remedio", horario: "20:00", dias_semana: [1, 2, 3, 4, 5], lembrete: true,
    }));
    await waitFor(() => expect(aoSalvo).toHaveBeenCalledWith(expect.objectContaining({ id: "nova" }), true));
    expect(aoMudar).toHaveBeenCalledWith(false);
    expect(h.toast.success).toHaveBeenCalledWith("Rotina criada.");
  });

  it("sem nome: o erro no campo e NENHUMA chamada; sem dia nenhum: o erro dos dias", async () => {
    abrir();
    fireEvent.click(document.querySelector("[data-rotina-salvar]")!);
    expect(await screen.findByText("Dê um nome à rotina.")).toBeInTheDocument();
    fireEvent.change(campo("Nome"), { target: { value: "Água" } });
    for (const d of [1, 2, 3, 4, 5, 6, 7]) fireEvent.click(document.querySelector(`[data-rotina-dia="${d}"]`)!);
    fireEvent.click(document.querySelector("[data-rotina-salvar]")!);
    expect(await screen.findByText("Escolha pelo menos 1 dia.")).toBeInTheDocument();
    expect(h.salvar).not.toHaveBeenCalled();
  });

  it("tirar o horário desliga o lembrete (lembrete só com horário)", () => {
    abrir({ tipo: "aluno" }, rotina());
    expect(screen.getByRole("switch", { name: "Lembrete" })).toHaveAttribute("aria-checked", "true");
    fireEvent.change(campo("Horário (opcional)"), { target: { value: "" } });
    expect(screen.getByRole("switch", { name: "Lembrete" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "Lembrete" })).toBeDisabled();
  });

  it("a do profissional, no app do aluno (P8b): avisa que é dele, muda e APAGA com a confirmação do app", async () => {
    const { aoApagado } = abrir({ tipo: "aluno" }, rotina({ origem: "profissional", paciente_id: "pac-1" }));
    expect(screen.getByText("Criada pelo seu profissional: você pode mudar ou apagar.")).toBeInTheDocument();
    fireEvent.click(document.querySelector("[data-rotina-apagar]")!);
    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo).toHaveTextContent("ele vê que você apagou");
    fireEvent.click(dialogo.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(h.arquivar).toHaveBeenCalledWith("r1"));
    await waitFor(() => expect(aoApagado).toHaveBeenCalledWith("r1"));
    expect(h.profArquivar).not.toHaveBeenCalled();
  });

  it("Cancelar na confirmação não apaga", async () => {
    abrir({ tipo: "aluno" }, rotina());
    fireEvent.click(document.querySelector("[data-rotina-apagar]")!);
    fireEvent.click((await screen.findByRole("alertdialog")).querySelector("[data-confirmar-cancelar]")!);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(h.arquivar).not.toHaveBeenCalled();
  });

  it("modo profissional (a P6 importa): cria e apaga pela matrícula da rota", async () => {
    const { aoSalvo } = abrir({ tipo: "profissional", aluno: "pac-1" });
    fireEvent.change(campo("Nome"), { target: { value: "Água 2 L" } });
    fireEvent.click(document.querySelector("[data-rotina-salvar]")!);
    await waitFor(() => expect(h.profSalvar).toHaveBeenCalledWith("pac-1", null, expect.objectContaining({ nome: "Água 2 L", lembrete: false })));
    await waitFor(() => expect(aoSalvo).toHaveBeenCalled());
    expect(h.salvar).not.toHaveBeenCalled();
  });

  it("a função recusa (limite de 30): a frase fixa do código na folha, a folha fica aberta", async () => {
    h.salvar.mockRejectedValue(new ErroAlunoDia("limite"));
    const { aoMudar } = abrir();
    fireEvent.change(campo("Nome"), { target: { value: "Mais uma" } });
    fireEvent.click(document.querySelector("[data-rotina-salvar]")!);
    expect(await screen.findByText(/Chegou ao limite \(30 rotinas/)).toBeInTheDocument();
    expect(aoMudar).not.toHaveBeenCalledWith(false);
  });
});
