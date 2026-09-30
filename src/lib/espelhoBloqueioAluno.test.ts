import { describe, expect, it } from "vitest";
import { alunoBloqueadoSemStaff, statusDoPerfil, type MatriculaResumo, type ResumoNucleo } from "../../supabase/functions/_shared/espelho/regras";

// W13 (F5, herdado da W6/P7): o servidor também barra o aluno bloqueado (APK ≤ 3.15 não tem a trava nova), nunca o profissional.
function mat(o: Partial<MatriculaResumo> = {}): MatriculaResumo {
  return {
    paciente_id: "p1", conta_id: "c1", ativo: true, excluida: false, bloqueada: false, personal_id: "u-lucas", nome: "Rafael", genero: null,
    nascimento: null, criado_em: "2026-09-01T00:00:00Z", conta: null, ...o,
  };
}
function resumo(o: Partial<ResumoNucleo> = {}): ResumoNucleo {
  return { principal_user_id: "u1", email: "a@b.com", nome: "Rafael", master: false, membros: [], matriculas: [mat()], alunos_de_treino: [], ...o };
}

describe("W13 — alunoBloqueadoSemStaff (trocar-token recusa; o espelho encerra as sessões do Treino)", () => {
  it("só aluno com todas as matrículas vivas bloqueadas → barra", () => {
    expect(alunoBloqueadoSemStaff(resumo({ matriculas: [mat({ bloqueada: true })] }), null)).toBe(true);
    expect(alunoBloqueadoSemStaff(resumo({ matriculas: [mat({ bloqueada: true }), mat({ paciente_id: "p2", ativo: false })] }), null)).toBe(true);
  });
  it("uma matrícula viva sem bloqueio (P7, 2 contas) → não barra; sem matrícula → não barra", () => {
    expect(alunoBloqueadoSemStaff(resumo({ matriculas: [mat({ bloqueada: true }), mat({ paciente_id: "p2" })] }), null)).toBe(false);
    expect(alunoBloqueadoSemStaff(resumo({ matriculas: [] }), null)).toBe(false);
    expect(alunoBloqueadoSemStaff(resumo({ matriculas: [mat({ bloqueada: true, excluida: true })] }), null)).toBe(false);
  });
  it("nunca quem também é profissional ou master (P7)", () => {
    const bloq = [mat({ bloqueada: true })];
    expect(alunoBloqueadoSemStaff(resumo({ matriculas: bloq, master: true }), null)).toBe(false);
    expect(alunoBloqueadoSemStaff(resumo({ matriculas: bloq }), "professor")).toBe(false);
    expect(alunoBloqueadoSemStaff(resumo({ matriculas: bloq, membros: [{ conta_id: "c9", papeis: ["nutricionista"], status: "ativo", codigo_convite: null, conta: null }] }), null)).toBe(false);
    // membro removido não conta como profissional
    expect(alunoBloqueadoSemStaff(resumo({ matriculas: bloq, membros: [{ conta_id: "c9", papeis: ["personal"], status: "removido", codigo_convite: null, conta: null }] }), null)).toBe(true);
  });
  it("o espelho do perfil: bloqueado vale no Treino e desbloquear volta a ativo", () => {
    expect(statusDoPerfil(mat({ bloqueada: true }), "ativo")).toBe("bloqueado");
    expect(statusDoPerfil(mat({ bloqueada: false }), "bloqueado")).toBe("ativo");
  });
});
