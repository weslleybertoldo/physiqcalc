// hml-18b (H-83): a folha "Trocar exercício" SAI mostrando o exercício que estava aberto — o pai zera o alvo ao fechar e, antes, a
// folha renderizava vazia durante a animação de saída. O PainelDeslizante é trocado por um falso que mostra o que a folha entrega a
// ele (aberta ou não), já que no jsdom a saída do Radix acaba na hora.
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { CATALOGO_81, exercicio81 } from "@/test/catalogoEquivalencia";

const db = {
  getAll: vi.fn(async (sql: string) => (sql.includes("FROM tb_exercicios ORDER BY nome") ? CATALOGO_81 : [])),
  execute: vi.fn(async () => undefined),
};
vi.mock("@powersync/react", () => ({ usePowerSync: () => db }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/ui/premium/Sheet", () => ({
  PainelDeslizante: ({ aberto, descricao, children }: { aberto: boolean; descricao?: ReactNode; children?: ReactNode }) => (
    <div data-folha-falsa={aberto ? "aberta" : "fechando"}>
      <div data-folha-descricao>{descricao}</div>
      {children}
    </div>
  ),
}));

import { TrocarExercicio, type AlvoTrocarExercicio } from "./TrocarExercicio";

function alvoDe(nome: string): AlvoTrocarExercicio {
  const e = exercicio81(nome);
  return {
    userId: "u1",
    exercicio: { id: e.id, nome: e.nome, grupo_muscular: e.grupo_muscular, subgrupo: e.subgrupo, imagem_url: null },
    pessoal: false,
    origemId: e.id,
    substituindo: null,
    idsNoTreino: [e.id],
    grupoId: "g1",
    grupoNome: "Peito + tríceps",
    grupoPessoal: false,
    slotIdx: 0,
    dateKey: "2026-09-30",
    dateLabel: "Qua 30/09",
    academia: null,
  };
}

describe("hml-18b (H-83) — a saída da folha Trocar exercício", () => {
  it("ao fechar (alvo null), a folha fecha com o mesmo exercício e as mesmas opções na tela — não sai vazia", async () => {
    const r = render(<TrocarExercicio alvo={alvoDe("Rosca Martelo na Polia")} aoFechar={vi.fn()} />);
    await waitFor(() => expect(document.querySelectorAll("[data-trocar-opcao]").length).toBeGreaterThan(0));
    const opcoes = document.querySelectorAll("[data-trocar-opcao]").length;
    r.rerender(<TrocarExercicio alvo={null} aoFechar={vi.fn()} />);
    expect(document.querySelector("[data-folha-falsa]")?.getAttribute("data-folha-falsa")).toBe("fechando");
    expect(screen.getByText(/Sai Rosca Martelo na Polia/)).toBeInTheDocument();
    expect(document.querySelectorAll("[data-trocar-opcao]").length).toBe(opcoes);
  });

  it("nunca aberta: a folha fechada e vazia (nada a mostrar nem a animar)", () => {
    render(<TrocarExercicio alvo={null} aoFechar={vi.fn()} />);
    expect(document.querySelector("[data-folha-falsa]")?.getAttribute("data-folha-falsa")).toBe("fechando");
    expect(document.querySelector("[data-trocar-opcao]")).toBeNull();
    expect(screen.queryByText(/Sai /)).toBeNull();
  });

  it("abrir de novo com OUTRO exercício recarrega e mostra o novo (o reinício segue o alvo de verdade)", async () => {
    const r = render(<TrocarExercicio alvo={alvoDe("Rosca Martelo na Polia")} aoFechar={vi.fn()} />);
    await waitFor(() => expect(document.querySelectorAll("[data-trocar-opcao]").length).toBeGreaterThan(0));
    r.rerender(<TrocarExercicio alvo={null} aoFechar={vi.fn()} />);
    const chamadas = db.getAll.mock.calls.length;
    r.rerender(<TrocarExercicio alvo={alvoDe("Rosca Martelo com Halteres")} aoFechar={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Sai Rosca Martelo com Halteres/)).toBeInTheDocument());
    expect(db.getAll.mock.calls.length).toBeGreaterThan(chamadas);
  });
});
