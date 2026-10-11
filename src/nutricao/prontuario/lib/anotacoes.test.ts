import { beforeEach, describe, expect, it, vi } from "vitest";

// hml-19a (H-41 · jeito 2): escrever passa pela função nutricao (functions.invoke) — gravar direto na tabela quebra o teste.
const h = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock("@/nutricao/editor/lib/banco", () => ({
  supabase: {
    rpc: h.rpc,
    functions: { invoke: (...a: unknown[]) => h.invoke(...a) },
    from: (t: string) => {
      throw new Error(`gravação direta na tabela ${t}`);
    },
  },
}));
const recusa = (status: number, erro: string) => ({
  data: null,
  error: { name: "FunctionsHttpError", context: new Response(JSON.stringify({ ok: false, erro }), { status, headers: { "Content-Type": "application/json" } }) },
});

import { atualizarAnotacao, criarAnotacao, excluirAnotacao, listarAnotacoes, mensagemDoErro } from "./anotacoes";

beforeEach(() => {
  h.rpc.mockReset();
  h.invoke.mockReset();
});

describe("W18 — anotações da equipe (dados)", () => {
  it("lê pela função aluno_anotacoes (com o limite do card) e normaliza o que vier", async () => {
    h.rpc.mockResolvedValue({
      data: {
        ok: true, paciente_id: "p1", total: 5, clinico: false,
        anotacoes: [{ id: "a1", data: "2026-07-16T13:00:00Z", texto: "Subiu a carga", visibilidade: "equipe", autor_papel: "personal",
          autor_id: "u1", autor_nome: "Lucas Ferreira", autor_foto: null, minha: true, created_at: "2026-07-16T13:01:00Z", updated_at: "2026-07-16T13:01:00Z" },
        { id: "a2", data: "2026-07-02T10:00:00Z", texto: "x", visibilidade: "??", autor_papel: "??", autor_id: "u2" }],
      },
      error: null,
    });
    const r = await listarAnotacoes("rota-1", 3);
    expect(h.rpc).toHaveBeenCalledWith("aluno_anotacoes", { p_aluno: "rota-1", p_limite: 3 });
    expect(r.total).toBe(5);
    expect(r.clinico).toBe(false);
    expect(r.anotacoes[0]).toMatchObject({ id: "a1", visibilidade: "equipe", autor_papel: "personal", minha: true, autor_nome: "Lucas Ferreira" });
    // o que não se reconhece fica do lado mais fechado: "Só nutricionistas", assinada pela nutricionista
    expect(r.anotacoes[1]).toMatchObject({ visibilidade: "nutricionistas", autor_papel: "nutricionista", minha: false, created_at: "2026-07-02T10:00:00Z" });
  });

  it("sem limite = todas; erro do banco vira texto que a pessoa entende", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "sem_acesso" } });
    await expect(listarAnotacoes("p1")).rejects.toThrow("Você não acompanha este aluno.");
    expect(h.rpc).toHaveBeenCalledWith("aluno_anotacoes", { p_aluno: "p1", p_limite: null });
    expect(mensagemDoErro('new row violates row-level security policy for table "registros_prontuario"')).toBe(
      "Você não pode gravar essa anotação para este aluno.",
    );
  });

  it("grava a visibilidade e o papel junto pela nutricao (o banco confere — restritiva da W18); o autor é quem chama (o servidor põe)", async () => {
    h.invoke.mockResolvedValue({ data: { ok: true, linha: { id: "a1" } }, error: null });
    await criarAnotacao("u1", "p1", "personal", { data: "2026-07-16", hora: "10:30", texto: "  Técnica boa.  ", visibilidade: "equipe" });
    expect(h.invoke).toHaveBeenCalledTimes(1);
    const [funcao, { body }] = h.invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(funcao).toBe("nutricao");
    expect(body).toMatchObject({ acao: "anotacao_criar", paciente_id: "p1", visibilidade: "equipe", autor_papel: "personal", texto: "Técnica boa." });
    expect(body).not.toHaveProperty("nutricionista_id");
    expect(new Date(String(body.data)).getHours()).toBe(10);
  });

  it("editar/excluir: 0 linhas (não é o autor) vira aviso; o resto passa", async () => {
    h.invoke.mockResolvedValueOnce(recusa(404, "nao_encontrado"));
    await expect(atualizarAnotacao("a9", "nutricionista", { data: "2026-07-16", hora: "10:30", texto: "x", visibilidade: "nutricionistas" })).rejects.toThrow(
      "Só quem escreveu a anotação pode mudar.",
    );
    h.invoke.mockResolvedValueOnce({ data: { ok: true }, error: null });
    await expect(excluirAnotacao("a1")).resolves.toBeUndefined();
    expect((h.invoke.mock.calls[1][1] as { body: unknown }).body).toEqual({ id: "a1", acao: "anotacao_excluir" });
  });

  it("o RLS recusando (papel ou visibilidade que a pessoa não tem) → a frase de antes, não a do banco", async () => {
    h.invoke.mockResolvedValueOnce(recusa(403, "sem_acesso"));
    await expect(criarAnotacao("u1", "p1", "personal", { data: "2026-07-16", hora: "10:30", texto: "x", visibilidade: "nutricionistas" })).rejects.toThrow(
      "Você não pode gravar essa anotação para este aluno.",
    );
  });
});

describe("hml-14d (B21 · D33) — a aba em páginas: o p_offset só vai quando pagina", () => {
  it("com offset: { p_aluno, p_limite, p_offset } e a 'ultima' de todas; sem offset: a chamada de antes, sem p_offset nem ultima", async () => {
    h.rpc.mockResolvedValue({
      data: { ok: true, paciente_id: "p1", total: 41, clinico: true, offset: 20, limite: 20, ultima: { id: "a0", data: "2026-10-01T10:00:00Z" },
        anotacoes: [{ id: "a20", data: "2026-08-01T10:00:00Z", texto: "x", visibilidade: "equipe", autor_papel: "personal", autor_id: "u1" }] },
      error: null,
    });
    const pagina = await listarAnotacoes("p1", 20, 20);
    expect(h.rpc).toHaveBeenLastCalledWith("aluno_anotacoes", { p_aluno: "p1", p_limite: 20, p_offset: 20 });
    expect(pagina).toMatchObject({ total: 41, ultima: { id: "a0", data: "2026-10-01T10:00:00Z" } });
    expect(pagina.anotacoes.map((a) => a.id)).toEqual(["a20"]);

    const semLimite = await listarAnotacoes("p1", undefined, 0);
    expect(h.rpc).toHaveBeenLastCalledWith("aluno_anotacoes", { p_aluno: "p1", p_limite: 20, p_offset: 0 });
    expect(semLimite.ultima).toEqual({ id: "a0", data: "2026-10-01T10:00:00Z" });

    h.rpc.mockResolvedValue({ data: { ok: true, paciente_id: "p1", total: 0, clinico: true, anotacoes: [], offset: 0, limite: 20, ultima: null }, error: null });
    expect((await listarAnotacoes("p1", 20, 0)).ultima).toBeNull();

    h.rpc.mockResolvedValue({ data: { ok: true, paciente_id: "p1", total: 2, clinico: true, anotacoes: [] }, error: null });
    const todas = await listarAnotacoes("p1");
    expect(h.rpc).toHaveBeenLastCalledWith("aluno_anotacoes", { p_aluno: "p1", p_limite: null });
    expect("ultima" in todas).toBe(false);
  });
});
