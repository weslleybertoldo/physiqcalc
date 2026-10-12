// src/financeiro/ui/useFinanceiroDoAluno.test.tsx
// Physiq W2 (Task 15) — as ações do Financeiro do aluno no PAINEL (o `agir`): o erro da pagamentos-aluno vira a frase do PROFISSIONAL onde a
// global fala com o aluno — o 409 mp_conta_indisponivel da Task 9 (a conexão do Mercado Pago dele caiu) chega também no cancelar, no estornar
// e no registrar do painel, e lá nunca pode dizer "avise o seu profissional". O erro passa pelo acaoFinanceiro de verdade (só o invoke é falso).
import type { ReactNode } from "react";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/integrations/principal/client", () => ({ principal: { functions: { invoke: (...a: unknown[]) => h.invoke(...a) } } }));

import { toast } from "sonner";
import { mensagemErroFinanceiro } from "../regras";
import { useFinanceiroDoAluno } from "./useFinanceiroDoAluno";

/** o erro do supabase-js para um status ≠ 2xx: o corpo da função no `context` (a Response) */
const erroDaFuncao = (status: number, erro: string) => ({
  data: null,
  error: { name: "FunctionsHttpError", context: new Response(JSON.stringify({ ok: false, erro }), { status, headers: { "Content-Type": "application/json" } }) },
});

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const envoltorio = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  // ativo = false: só o agir (sem a leitura do prof_aluno)
  return renderHook(() => useFinanceiroDoAluno("a1", false), { wrapper: envoltorio });
}

beforeEach(() => {
  h.invoke.mockReset();
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
});

describe("useFinanceiroDoAluno — o agir do painel (W2)", () => {
  it("a conexão do Mercado Pago do profissional caída: a frase dele (conectar de novo), nunca a do aluno", async () => {
    h.invoke.mockResolvedValueOnce(erroDaFuncao(409, "mp_conta_indisponivel"));
    const { result } = montar();
    expect(await result.current.agir("prof_cobranca_cancelar", { cobranca_id: "x" }, "Cobrança cancelada.")).toBeNull();
    expect(h.invoke).toHaveBeenCalledWith("pagamentos-aluno", { body: { acao: "prof_cobranca_cancelar", cobranca_id: "x" } });
    expect(toast.error).toHaveBeenCalledWith("A conexão com o seu Mercado Pago caiu. Conecte de novo em Configurações › Recebimento.");
    expect(toast.error).not.toHaveBeenCalledWith(mensagemErroFinanceiro("mp_conta_indisponivel"));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("os outros códigos seguem com a frase global (o estorno pelo app do MP, a automática de outra conta, a mensalidade só do dono, o desconhecido)", async () => {
    const { result } = montar();
    for (const codigo of ["mp_reembolso_pelo_app_do_mp", "mp_outra_conta", "so_o_dono"]) {
      h.invoke.mockResolvedValueOnce(erroDaFuncao(409, codigo));
      await result.current.agir("prof_reembolsar", { cobranca_id: "x" });
      expect(toast.error).toHaveBeenLastCalledWith(mensagemErroFinanceiro(codigo));
    }
    h.invoke.mockResolvedValueOnce(erroDaFuncao(500, "xyz"));
    await result.current.agir("prof_reembolsar", { cobranca_id: "x" });
    expect(toast.error).toHaveBeenLastCalledWith("Não deu certo agora. Tente de novo.");
  });

  it("deu certo: o aviso de ok e a resposta (nenhum erro)", async () => {
    h.invoke.mockResolvedValueOnce({ data: { ok: true, n: 1 }, error: null });
    const { result } = montar();
    expect(await result.current.agir("prof_registrar", { cobranca_id: "x" }, "Pagamento registrado.")).toEqual({ ok: true, n: 1 });
    expect(toast.success).toHaveBeenCalledWith("Pagamento registrado.");
    expect(toast.error).not.toHaveBeenCalled();
  });
});
