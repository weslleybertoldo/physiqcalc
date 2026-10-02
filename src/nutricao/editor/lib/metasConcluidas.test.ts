import { describe, expect, it, vi } from "vitest";

vi.mock("./banco", () => ({ supabase: {} }));
import { diasDaMeta, resumoDaMeta } from "./metasConcluidas";

// 28/09/2026 é segunda; os 7 dias até sábado 04/10
const dias = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];

describe("H5 — N-40: a nutri vê os ✓ das metas que o aluno marcou", () => {
  it("cada dia: valia (dia da semana e já tinha começado) e se o aluno marcou", () => {
    const meta = { id: "m1", dias_semana: [1, 3, 5], inicio: "2026-09-29" }; // seg, qua, sex; começou na terça
    const r = diasDaMeta(meta, [{ meta_id: "m1", data: "2026-09-30" }, { meta_id: "m2", data: "2026-10-02" }], dias);
    expect(r.map((d) => [d.dia.slice(8), d.vale, d.feita])).toEqual([
      ["28", false, false], // segunda, mas antes do início
      ["29", false, false],
      ["30", true, true], // quarta marcada
      ["01", false, false],
      ["02", true, false], // sexta: o ✓ é de outra meta
      ["03", false, false],
      ["04", false, false],
    ]);
    expect(resumoDaMeta(r)).toEqual({ feitas: 1, devidas: 2, texto: "1 de 2 dias" });
  });
  it("todos os dias; nenhum dia; um ✓ fora do dia aparece mas não conta", () => {
    const todos = diasDaMeta({ id: "a", dias_semana: [1, 2, 3, 4, 5, 6, 7], inicio: null }, dias.map((d) => ({ meta_id: "a", data: d })), dias);
    expect(resumoDaMeta(todos).texto).toBe("7 de 7 dias");
    const nenhum = diasDaMeta({ id: "b", dias_semana: [], inicio: null }, [{ meta_id: "b", data: "2026-09-28" }], dias);
    expect(nenhum[0]).toEqual({ dia: "2026-09-28", vale: false, feita: true });
    expect(resumoDaMeta(nenhum)).toEqual({ feitas: 0, devidas: 0, texto: "nenhum dia da meta no período" });
  });
});
