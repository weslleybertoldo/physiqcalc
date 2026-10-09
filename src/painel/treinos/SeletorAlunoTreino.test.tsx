import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AlunoDaLista, QuemMexe } from "./tipos";

// hml-14d (B19 · D26): o seletor de aluno do Histórico/Relatório busca no banco do Treino (admin-list-users) — aqui o
// listarAlunos é falso; a buscarAlunosDoTreino e o seletor são os de verdade (o pedido sai com q, limit 20, ordem nome).
const h = vi.hoisted(() => ({ listar: vi.fn() }));
vi.mock("@/lib/saasApi", () => ({ listarAlunos: h.listar }));
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "staging", supabase: { functions: { invoke: vi.fn() }, from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock("@/integrations/principal/client", () => ({ PRINCIPAL_SCHEMA: "staging", principal: { rpc: vi.fn(), auth: { getSession: vi.fn() }, functions: { invoke: vi.fn() } } }));

import { SeletorAlunoTreino } from "./SeletorAlunoTreino";

const PROF: QuemMexe = { meuId: "u-lucas", master: false, staff: true };
const MASTER: QuemMexe = { meuId: "u-master", master: true, staff: true };
const user = (i: number, nome = `Aluno ${String(i).padStart(2, "0")}`) => ({ id: `t${i}`, nome, email: `a${i}@x.com`, foto_url: null });
const resposta = (users: ReturnType<typeof user>[], total = users.length) => ({ users, total, limit: 20, offset: 0 });
function adiado<T>() {
  let resolver: (v: T) => void = () => undefined;
  let rejeitar: (e: unknown) => void = () => undefined;
  const promessa = new Promise<T>((r, j) => { resolver = r; rejeitar = j; });
  return { promessa, resolver, rejeitar };
}

function Casca({ q = PROF, todos, aoMudar }: { q?: QuemMexe; todos?: string; aoMudar?: (a: AlunoDaLista | null) => void }) {
  const [valor, setValor] = useState<AlunoDaLista | null>(null);
  return (
    <>
      <SeletorAlunoTreino contexto="historico" q={q} valor={valor} aoMudar={(a) => { setValor(a); aoMudar?.(a); }} todos={todos} />
      <span data-testid="valor">{valor?.id ?? "nenhum"}</span>
    </>
  );
}
const campo = () => document.querySelector("[data-seletor-aluno-treino-busca]") as HTMLInputElement;

beforeEach(() => {
  h.listar.mockReset();
});

describe("SeletorAlunoTreino (hml-14d · B19): busca no banco do Treino, 20 por vez, resposta velha descartada", () => {
  it("ao abrir busca na hora: 20 em ordem de nome + '20 de 41 — refine a busca'; o pedido leva q, limit 20, offset 0 e ordem 'nome'", async () => {
    h.listar.mockResolvedValue(resposta(Array.from({ length: 20 }, (_, i) => user(i + 1)), 41));
    render(<Casca />);
    expect(document.querySelector("[data-seletor-aluno-treino-lista]")).toBeNull(); // fechado não busca
    expect(h.listar).not.toHaveBeenCalled();
    fireEvent.focus(campo());
    await waitFor(() => expect(document.querySelectorAll("[data-opcao-aluno-treino]")).toHaveLength(20));
    expect(h.listar).toHaveBeenCalledWith({ q: undefined, limit: 20, offset: 0, ordem: "nome", professorId: undefined });
    const mais = document.querySelector("[data-seletor-aluno-treino-mais]")!;
    expect(mais.textContent).toBe("20 de 41 — refine a busca");
    expect(mais.getAttribute("data-total")).toBe("41");
    expect(document.querySelector('[data-seletor-aluno-treino="historico"]')).not.toBeNull();
    expect(document.querySelector("[data-seletor-aluno]")).toBeNull();
  });

  it("digitando: espera 300 ms; a resposta velha que chega depois da nova é descartada", async () => {
    const aoAbrir = adiado<ReturnType<typeof resposta>>();
    const ra = adiado<ReturnType<typeof resposta>>();
    const raf = adiado<ReturnType<typeof resposta>>();
    h.listar.mockReturnValueOnce(aoAbrir.promessa).mockReturnValueOnce(ra.promessa).mockReturnValueOnce(raf.promessa);
    render(<Casca />);
    fireEvent.focus(campo());
    await waitFor(() => expect(h.listar).toHaveBeenCalledTimes(1));
    fireEvent.change(campo(), { target: { value: "ra" } });
    expect(h.listar).toHaveBeenCalledTimes(1); // ainda dentro dos 300 ms
    await waitFor(() => expect(h.listar).toHaveBeenCalledTimes(2), { timeout: 1500 });
    expect(h.listar.mock.calls[1][0]).toMatchObject({ q: "ra", limit: 20, ordem: "nome" });
    fireEvent.change(campo(), { target: { value: "  raf  " } });
    await waitFor(() => expect(h.listar).toHaveBeenCalledTimes(3), { timeout: 1500 });
    expect(h.listar.mock.calls[2][0]).toMatchObject({ q: "raf" });
    await act(async () => raf.resolver(resposta([user(7, "Rafael Moura")])));
    await waitFor(() => expect([...document.querySelectorAll("[data-opcao-aluno-treino]")].map((e) => e.getAttribute("data-opcao-aluno-treino"))).toEqual(["t7"]));
    // as velhas chegam depois: a tela não muda
    await act(async () => {
      ra.resolver(resposta([user(1, "Rafaela"), user(2, "Rayane")]));
      aoAbrir.resolver(resposta([user(3)]));
    });
    expect([...document.querySelectorAll("[data-opcao-aluno-treino]")].map((e) => e.getAttribute("data-opcao-aluno-treino"))).toEqual(["t7"]);
    expect(document.querySelector("[data-seletor-aluno-treino-lista]")?.getAttribute("data-termo")).toBe("raf");
  });

  it("escolher: o aluno vai para quem usa e a lista fecha; o nome fica no campo; 'Todos os alunos' volta a nenhum", async () => {
    const aoMudar = vi.fn();
    h.listar.mockResolvedValue(resposta([user(1, "José da Silva"), user(2, "Marina")]));
    render(<Casca todos="Todos os alunos" aoMudar={aoMudar} />);
    fireEvent.focus(campo());
    fireEvent.click(await screen.findByText("José da Silva"));
    expect(aoMudar).toHaveBeenLastCalledWith({ id: "t1", nome: "José da Silva", email: "a1@x.com", foto_url: null });
    expect(screen.getByTestId("valor").textContent).toBe("t1");
    expect(document.querySelector("[data-seletor-aluno-treino-lista]")).toBeNull();
    expect(campo().placeholder).toBe("José da Silva");
    expect(document.querySelector("[data-seletor-aluno-treino]")?.getAttribute("data-seletor-aluno-treino-valor")).toBe("t1");
    fireEvent.focus(campo());
    fireEvent.click(await screen.findByText("Todos os alunos", { selector: "[data-opcao-aluno-treino-todos] span" }));
    expect(aoMudar).toHaveBeenLastCalledWith(null);
    expect(screen.getByTestId("valor").textContent).toBe("nenhum");
  });

  it("setas e Enter escolhem; busca sem resultado diz 'Nenhum aluno com essa busca.'", async () => {
    h.listar.mockImplementation(async ({ q }: { q?: string }) => (q ? resposta([]) : resposta([user(1), user(2)])));
    render(<Casca />);
    fireEvent.focus(campo());
    await waitFor(() => expect(document.querySelectorAll("[data-opcao-aluno-treino]")).toHaveLength(2));
    fireEvent.keyDown(campo(), { key: "ArrowDown" });
    fireEvent.keyDown(campo(), { key: "ArrowDown" });
    fireEvent.keyDown(campo(), { key: "Enter" });
    expect(screen.getByTestId("valor").textContent).toBe("t2");
    fireEvent.focus(campo());
    fireEvent.change(campo(), { target: { value: "zzz" } });
    expect(await screen.findByText("Nenhum aluno com essa busca.")).toBeInTheDocument();
  });

  it("erro da busca: o aviso com 'Tentar de novo' (nunca 'nenhum aluno'), e tentar busca de novo", async () => {
    h.listar.mockRejectedValueOnce(new Error("rate_limited")).mockResolvedValue(resposta([user(5)]));
    render(<Casca />);
    fireEvent.focus(campo());
    const erro = await waitFor(() => {
      const e = document.querySelector("[data-seletor-aluno-treino-erro]");
      if (!e) throw new Error("sem o aviso");
      return e;
    });
    expect(erro.textContent).toContain("Não deu para buscar os alunos agora.");
    expect(document.querySelector("[data-seletor-aluno-treino-vazio]")).toBeNull();
    fireEvent.click(document.querySelector("[data-seletor-aluno-treino-tentar]")!);
    await waitFor(() => expect(document.querySelectorAll("[data-opcao-aluno-treino]")).toHaveLength(1));
    expect(h.listar).toHaveBeenCalledTimes(2);
  });

  it("o master busca nos alunos dele (professorId = ele, como o select de antes)", async () => {
    h.listar.mockResolvedValue(resposta([user(1)]));
    render(<Casca q={MASTER} />);
    fireEvent.focus(campo());
    await waitFor(() => expect(h.listar).toHaveBeenCalledWith({ q: undefined, limit: 20, offset: 0, ordem: "nome", professorId: "u-master" }));
  });
});
