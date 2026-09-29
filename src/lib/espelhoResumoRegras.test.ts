import { describe, it, expect } from "vitest";
import {
  ACESSO_SEM_LIMITE,
  acessoAteDaConta,
  contasOndeEPersonalComTreino,
  modulosDoPlano,
  montarResumo,
  proximaTentativaMs,
  somarDias,
  type EntradaResumo,
  type LinhaConta,
} from "../../supabase-principal/functions/_shared/resumo-regras";
import { acessoProfessor, escolherMatriculaTreino, papelTreino, type ResumoNucleo } from "../../supabase/functions/_shared/espelho/regras";

const linhaConta = (o: Partial<LinhaConta> = {}): LinhaConta => ({
  id: "c1", nome: "Conta", origem: "nova", plano: "treino_nutricao", situacao: "ativa", teste_ate: null, vence_em: "2026-10-10",
  tolerancia_dias: 0, cobranca_legada: false, alunos_bloqueados_em: null, alunos_bloqueados_msg: null, ...o,
});

describe("módulos do plano", () => {
  it("treino, nutrição, os dois e desconhecido", () => {
    expect(modulosDoPlano("treino")).toEqual(["treino"]);
    expect(modulosDoPlano("nutricao")).toEqual(["nutricao"]);
    expect(modulosDoPlano("treino_nutricao")).toEqual(["treino", "nutricao"]);
    expect(modulosDoPlano("x")).toEqual([]);
  });
});

describe("acesso da conta (inclusive) — spec 6.2/6.3", () => {
  it("somarDias atravessa o mês", () => {
    expect(somarDias("2026-10-28", 7)).toBe("2026-11-04");
  });
  it("conta nova ativa/vencida: vence_em, tolerância 0 (bloqueia no dia seguinte)", () => {
    expect(acessoAteDaConta(linhaConta())).toBe("2026-10-10");
    expect(acessoAteDaConta(linhaConta({ situacao: "vencida" }))).toBe("2026-10-10");
  });
  it("legado Calc: + 7 dias de tolerância", () => {
    expect(acessoAteDaConta(linhaConta({ tolerancia_dias: 7 }))).toBe("2026-10-17");
  });
  it("teste = teste_ate; isenta = sem limite; suspensa/cancelada = sem acesso", () => {
    expect(acessoAteDaConta(linhaConta({ situacao: "teste", teste_ate: "2026-10-13" }))).toBe("2026-10-13");
    expect(acessoAteDaConta(linhaConta({ situacao: "isenta", vence_em: null }))).toBe(ACESSO_SEM_LIMITE);
    expect(acessoAteDaConta(linhaConta({ situacao: "suspensa" }))).toBeNull();
    expect(acessoAteDaConta(linhaConta({ situacao: "cancelada" }))).toBeNull();
  });
  it("legado antes da virada (sem vence_em) → sem data", () => {
    expect(acessoAteDaConta(linhaConta({ origem: "legado_calc", cobranca_legada: true, vence_em: null }))).toBeNull();
  });
});

describe("contas em que é personal com Treino", () => {
  it("só membro ativo, com papel personal, em conta com Treino", () => {
    const contas = [linhaConta({ id: "c1" }), linhaConta({ id: "c2", plano: "nutricao" }), linhaConta({ id: "c3" })];
    expect(contasOndeEPersonalComTreino([
      { conta_id: "c1", papeis: ["personal"], status: "ativo", codigo_convite: null },
      { conta_id: "c2", papeis: ["personal"], status: "ativo", codigo_convite: null },
      { conta_id: "c3", papeis: ["personal"], status: "removido", codigo_convite: null },
    ], contas)).toEqual(["c1"]);
  });
});

describe("fila do espelho", () => {
  it("espera 1, 2, 4, 8 min… com teto de 60 min", () => {
    expect([1, 2, 3, 4, 10].map(proximaTentativaMs)).toEqual([60_000, 120_000, 240_000, 480_000, 3_600_000]);
  });
});

describe("resumo do núcleo = contrato com o Treino", () => {
  const entrada: EntradaResumo = {
    principal_user_id: "u1", email: "p@x.com", nome: "Personal", role_perfil: "pessoa", role_jwt: null,
    membros: [{ conta_id: "c1", papeis: ["dono", "personal", "intruso"], status: "ativo", codigo_convite: "PROF-P" }],
    contas: [linhaConta({ situacao: "teste", teste_ate: "2026-10-13", vence_em: null })],
    matriculas: [{ id: "m1", conta_id: "c1", ativo: true, deleted_at: null, acesso_bloqueado_em: null, personal_id: "u9", nome: "Aluno",
                   genero: "feminino", nascimento: "1999-02-02", created_at: "2026-09-01T00:00:00Z" }],
    alunos_de_treino: [{ user_id: "u5", conta_id: "c1" }],
  };

  it("monta o resumo que o Treino entende (o tipo casa com ResumoNucleo) e as regras do Treino funcionam em cima dele", () => {
    const r: ResumoNucleo = montarResumo(entrada);
    expect(r.master).toBe(false);
    expect(r.membros[0].papeis).toEqual(["dono", "personal"]);
    expect(r.membros[0].conta?.acesso_ate).toBe("2026-10-13");
    expect(r.matriculas[0]).toMatchObject({ paciente_id: "m1", excluida: false, bloqueada: false, criado_em: "2026-09-01T00:00:00Z" });
    expect(r.alunos_de_treino).toEqual([{ principal_user_id: "u5", conta_id: "c1" }]);
    expect(papelTreino(r, null)).toBe("professor");
    expect(acessoProfessor(r)?.ponte).toEqual({ acesso_liberado_ate: "2026-10-13", status: "ativo" });
    expect(escolherMatriculaTreino(r.matriculas)?.paciente_id).toBe("m1");
  });

  it("master pelo perfil ou pelo JWT", () => {
    expect(montarResumo({ ...entrada, role_perfil: "master" }).master).toBe(true);
    expect(montarResumo({ ...entrada, role_perfil: null, role_jwt: "master" }).master).toBe(true);
  });

  it("matrícula excluída ou bloqueada chega marcada", () => {
    const r = montarResumo({ ...entrada, matriculas: [{ ...entrada.matriculas[0], deleted_at: "2026-09-20", acesso_bloqueado_em: "2026-09-21" }] });
    expect(r.matriculas[0]).toMatchObject({ excluida: true, bloqueada: true });
  });
});
