import { afterEach, describe, expect, it } from "vitest";
import { CHAVE_AVISADAS, consultasParaAvisar, gravarAvisadas, idDaNotificacao, lerAvisadas, textoDoAviso } from "./avisoLocal";

const agora = new Date("2026-10-01T12:00:00Z");
const c = (id: string, inicio: string, status = "agendado", extra: Record<string, unknown> = {}) =>
  ({ id, inicio, fim: new Date(new Date(inicio).getTime() + 3600_000).toISOString(), status, profissional: "Lucas Ferreira", origem: "profissional", ...extra });

describe("aviso no aparelho da consulta nova (W20, sem push)", () => {
  afterEach(() => localStorage.removeItem(CHAVE_AVISADAS));

  it("só as futuras esperando o aluno, marcadas pelo profissional e ainda não avisadas — da mais perto para a mais longe", () => {
    const lista = [
      c("b", "2026-10-20T17:00:00Z"),
      c("a", "2026-10-15T17:00:00Z", "encaixe"),
      c("ja", "2026-10-16T17:00:00Z"),
      c("passada", "2026-09-30T17:00:00Z"),
      c("confirmada", "2026-10-17T17:00:00Z", "paciente_confirmou"),
      c("dele", "2026-10-18T17:00:00Z", "agendado", { origem: "aluno" }),
      c("inteiro", "2026-10-19T03:00:00Z", "agendado", { dia_inteiro: true }),
    ];
    expect(consultasParaAvisar(lista, new Set(["ja"]), agora).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("o texto: 1 consulta (data e quem) ou várias (quantas e a próxima)", () => {
    expect(textoDoAviso([])).toBeNull();
    expect(textoDoAviso([c("a", "2026-10-15T17:00:00Z")])).toEqual({
      titulo: "Consulta para confirmar",
      corpo: "qui, 15/10 às 14:00 com Lucas Ferreira. Toque para confirmar, reagendar ou desistir.",
    });
    expect(textoDoAviso([c("a", "2026-10-15T17:00:00Z"), c("b", "2026-10-20T17:00:00Z")])?.titulo).toBe("2 consultas para confirmar");
  });

  it("id estável entre 3000 e 3899 (não colide com as do treino) e as avisadas ficam guardadas no aparelho", () => {
    const id = idDaNotificacao("0e5e1eb3-55cb-424d-8ed1-fd7efef02b7e");
    expect(id).toBe(idDaNotificacao("0e5e1eb3-55cb-424d-8ed1-fd7efef02b7e"));
    expect(id).toBeGreaterThanOrEqual(3000);
    expect(id).toBeLessThan(3900);
    gravarAvisadas(new Set(["x", "y"]));
    expect([...lerAvisadas()]).toEqual(["x", "y"]);
    localStorage.setItem(CHAVE_AVISADAS, "{quebrado");
    expect(lerAvisadas().size).toBe(0);
  });
});
