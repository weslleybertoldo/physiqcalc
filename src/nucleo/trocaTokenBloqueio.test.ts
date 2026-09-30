import { describe, expect, it } from "vitest";
import { MENSAGEM_TROCA, depoisDaFalha, erroDaResposta, retentavel, tentativasAutomaticas } from "./trocaToken";

describe("W13 — a trocar-token recusa o aluno bloqueado pelo profissional (403 aluno_bloqueado)", () => {
  it("vira o erro 'bloqueado' (sem tentar sozinho nem pausar: desbloqueou, a próxima abertura troca)", () => {
    expect(erroDaResposta(403, "aluno_bloqueado")).toBe("bloqueado");
    expect(erroDaResposta(403, "conta_real_no_staging")).toBe("staging");
    expect(erroDaResposta(403, "email_nao_confirmado")).toBe("email");
    expect(retentavel("bloqueado")).toBe(false);
    expect(tentativasAutomaticas("bloqueado")).toBe(0);
    expect(depoisDaFalha("bloqueado", 0)).toEqual({ tentarEm: null, pausarPor: null });
    expect(MENSAGEM_TROCA.bloqueado).toBe("Acesso pausado pelo seu profissional.");
  });
});
