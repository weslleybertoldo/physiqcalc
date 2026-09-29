import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { props } = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
vi.mock("@/financeiro/ui/FinanceiroDoAluno", () => ({
  FinanceiroDoAluno: (p: Record<string, unknown>) => { props.push(p); return <div data-testid="financeiro-do-aluno" />; },
}));

import PlanoCobrancaAluno from "./PlanoCobrancaAluno";

describe("PlanoCobrancaAluno (W6: o Financeiro do aluno do banco principal)", () => {
  it.each([["espelho" as const], ["editar" as const]])("%s: mostra o Financeiro do aluno, compacto, pelo id recebido", (modo) => {
    props.length = 0;
    render(<PlanoCobrancaAluno userId="u1" modo={modo} inicial={{ plano_nome: "Amigos", mensalidade_valor: 150 }} />);
    expect(screen.getByTestId("financeiro-do-aluno")).toBeInTheDocument();
    expect(props.at(-1)).toMatchObject({ alunoId: "u1", compacto: true });
  });
});
