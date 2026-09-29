import { describe, it, expect } from "vitest";
import {
  acessoProfessor,
  claimsDoJwt,
  decidirVinculo,
  ehLoginGoogle,
  ehPersonalComTreino,
  emailConfirmado,
  emailDeTeste,
  escolherMatriculaTreino,
  linhasEspelhoMembros,
  papelTreino,
  segredoConfere,
  sexoTreino,
  statusDoPerfil,
  type ContaResumo,
  type MatriculaResumo,
  type MembroResumo,
  type ResumoNucleo,
} from "../../supabase/functions/_shared/espelho/regras";

// ---------- fábricas ----------
const conta = (o: Partial<ContaResumo> = {}): ContaResumo => ({
  id: "c1", nome: "Conta", origem: "nova", modulos: ["treino", "nutricao"], situacao: "ativa", cobranca_legada: false,
  acesso_ate: "2026-10-30", alunos_bloqueados_em: null, alunos_bloqueados_msg: null, ...o,
});
const membro = (o: Partial<MembroResumo> = {}): MembroResumo => ({
  conta_id: "c1", papeis: ["personal"], status: "ativo", codigo_convite: "PROF-A", conta: conta(), ...o,
});
const matricula = (o: Partial<MatriculaResumo> = {}): MatriculaResumo => ({
  paciente_id: "p1", conta_id: "c1", ativo: true, excluida: false, bloqueada: false, personal_id: "pers-1", nome: "Aluno",
  genero: "masculino", nascimento: "1990-01-01", criado_em: "2026-09-01T00:00:00Z", conta: conta(), ...o,
});
const resumo = (o: Partial<ResumoNucleo> = {}): ResumoNucleo => ({
  principal_user_id: "u1", email: "a@b.com", nome: "A", master: false, membros: [], matriculas: [], alunos_de_treino: [], ...o,
});
const jwt = (payload: Record<string, unknown>) => {
  // JWT de verdade = base64url dos BYTES UTF-8 do JSON
  const b64 = (o: unknown) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "HS256" })}.${b64(payload)}.assinatura`;
};
const usuarioGoogle = (email = "Aluna@Gmail.com", verificado: unknown = true) => ({
  id: "u1", email: email.toLowerCase(), email_confirmed_at: "2026-09-29T00:00:00Z",
  identities: [{ provider: "google", identity_data: { email, email_verified: verificado } }],
});

describe("claimsDoJwt", () => {
  it("lê o payload (inclusive acento)", () => {
    expect(claimsDoJwt(jwt({ sub: "u1", nome: "João", amr: [{ method: "oauth" }] }))).toMatchObject({ sub: "u1", nome: "João" });
  });
  it("token quebrado → null", () => {
    expect(claimsDoJwt("abc")).toBeNull();
    expect(claimsDoJwt("a.%%%.c")).toBeNull();
  });
});

describe("e-mail confirmado (spec 7.4)", () => {
  it("exige e-mail e confirmação", () => {
    expect(emailConfirmado({ id: "u", email: "a@b.com", email_confirmed_at: "2026-01-01" })).toBe(true);
    expect(emailConfirmado({ id: "u", email: "a@b.com", confirmed_at: "2026-01-01" })).toBe(true);
    expect(emailConfirmado({ id: "u", email: "a@b.com" })).toBe(false);
    expect(emailConfirmado({ id: "u", email: "", email_confirmed_at: "2026-01-01" })).toBe(false);
  });
});

describe("login Google = sessão OAuth + identidade Google com o mesmo e-mail verificado", () => {
  it("OAuth + identidade Google verificada → true (e-mail sem diferença de maiúsculas)", () => {
    expect(ehLoginGoogle({ amr: [{ method: "oauth", timestamp: 1 }] }, usuarioGoogle())).toBe(true);
  });
  it("sessão por senha, mesmo com identidade Google → false (e-mail e senha nunca procura por e-mail)", () => {
    expect(ehLoginGoogle({ amr: [{ method: "password" }] }, usuarioGoogle())).toBe(false);
  });
  it("OAuth sem identidade Google → false", () => {
    expect(ehLoginGoogle({ amr: [{ method: "oauth" }] }, { id: "u", email: "a@b.com", identities: [{ provider: "email", identity_data: {} }] })).toBe(false);
  });
  it("identidade Google com OUTRO e-mail ou não verificado → false", () => {
    expect(ehLoginGoogle({ amr: [{ method: "oauth" }] }, { ...usuarioGoogle("outro@gmail.com"), email: "vitima@gmail.com" })).toBe(false);
    expect(ehLoginGoogle({ amr: [{ method: "oauth" }] }, usuarioGoogle("aluna@gmail.com", false))).toBe(false);
    const semVerificacao = { ...usuarioGoogle("aluna@gmail.com"), identities: [{ provider: "google", identity_data: { email: "aluna@gmail.com" } }] };
    expect(ehLoginGoogle({ amr: [{ method: "oauth" }] }, semVerificacao)).toBe(false);
  });
  it("sem claims → false", () => {
    expect(ehLoginGoogle(null, usuarioGoogle())).toBe(false);
  });
});

describe("decidir o vínculo (quem é quem no Banco do Treino)", () => {
  it("vínculo gravado manda sempre", () => {
    expect(decidirVinculo({ temVinculo: true, loginGoogle: false, treinoIdPorEmail: "t1" })).toBe("usar_vinculo");
  });
  it("Google sem vínculo: acha pelo e-mail ou cria", () => {
    expect(decidirVinculo({ temVinculo: false, loginGoogle: true, treinoIdPorEmail: "t1" })).toBe("vincular_por_email");
    expect(decidirVinculo({ temVinculo: false, loginGoogle: true, treinoIdPorEmail: null })).toBe("criar");
  });
  it("e-mail e senha sem vínculo: e-mail que já existe no Treino = conflito (ninguém toma a conta do outro)", () => {
    expect(decidirVinculo({ temVinculo: false, loginGoogle: false, treinoIdPorEmail: "t1" })).toBe("conflito");
    expect(decidirVinculo({ temVinculo: false, loginGoogle: false, treinoIdPorEmail: null })).toBe("criar");
  });
});

describe("staging só com conta de teste (P26)", () => {
  it.each([
    ["admin.teste.claude@physiqcalc.app", true], ["aluno1.teste.claude@physiqcalc.app", true], ["teste@teste.com", true],
    ["teste@physiqnutri.app", true], ["master.teste@physiqnutri.app", true], ["personal.teste.claude@physiqnutri.app", true],
    ["weslley@gmail.com", false], ["teste@gmail.com", false], ["cliente@physiqnutri.app", false], ["", false],
  ])("%s → %s", (email, esperado) => {
    expect(emailDeTeste(email)).toBe(esperado);
  });
});

describe("papel no Treino (app_metadata.role)", () => {
  it("personal ativo numa conta com Treino → professor", () => {
    expect(papelTreino(resumo({ membros: [membro()] }), null)).toBe("professor");
  });
  it("personal numa conta só de Nutrição → sem papel", () => {
    expect(papelTreino(resumo({ membros: [membro({ conta: conta({ modulos: ["nutricao"] }) })] }), null)).toBeNull();
  });
  it("dono sem papel de personal → sem papel (spec: professor só pra personal)", () => {
    expect(papelTreino(resumo({ membros: [membro({ papeis: ["dono"] })] }), null)).toBeNull();
  });
  it("personal removido perde o professor", () => {
    expect(papelTreino(resumo({ membros: [membro({ status: "removido" })] }), "professor")).toBeNull();
  });
  it("aluno → sem papel", () => {
    expect(papelTreino(resumo({ matriculas: [matricula()] }), null)).toBeNull();
  });
  it("master → master; admin do Treino continua admin", () => {
    expect(papelTreino(resumo({ master: true }), null)).toBe("master");
    expect(papelTreino(resumo({ master: true }), "admin")).toBe("admin");
  });
  it("admin/master do Treino nunca é rebaixado sozinho", () => {
    expect(papelTreino(resumo(), "admin")).toBe("admin");
    expect(papelTreino(resumo({ membros: [membro()] }), "master")).toBe("master");
  });
  it("ehPersonalComTreino", () => {
    expect(ehPersonalComTreino(resumo({ membros: [membro()] }))).toBe(true);
    expect(ehPersonalComTreino(resumo({ membros: [membro({ status: "convidado" })] }))).toBe(false);
  });
});

describe("matrícula que manda no treino do aluno", () => {
  it("ignora excluída e conta sem Treino", () => {
    expect(escolherMatriculaTreino([matricula({ excluida: true }), matricula({ paciente_id: "p2", conta: conta({ modulos: ["nutricao"] }) })])).toBeNull();
  });
  it("prefere ativa, depois com personal, depois a mais nova (caso P7: treino numa conta, dieta na outra)", () => {
    const a = matricula({ paciente_id: "a", ativo: false, criado_em: "2026-09-10" });
    const b = matricula({ paciente_id: "b", personal_id: null, criado_em: "2026-09-11" });
    const c = matricula({ paciente_id: "c", criado_em: "2026-09-05" });
    const d = matricula({ paciente_id: "d", criado_em: "2026-09-08" });
    expect(escolherMatriculaTreino([a, b, c, d])?.paciente_id).toBe("d");
    const nutri = matricula({ paciente_id: "n", conta_id: "c2", conta: conta({ id: "c2", modulos: ["nutricao"] }) });
    expect(escolherMatriculaTreino([nutri, c])?.paciente_id).toBe("c");
  });
});

describe("status do perfil (bloqueio pelo profissional — R10)", () => {
  it("bloqueada → bloqueado; desbloqueou → ativo; senão não mexe", () => {
    expect(statusDoPerfil(matricula({ bloqueada: true }), "ativo")).toBe("bloqueado");
    expect(statusDoPerfil(matricula(), "bloqueado")).toBe("ativo");
    expect(statusDoPerfil(matricula(), null)).toBeNull();
    expect(statusDoPerfil(matricula(), "ativo")).toBe("ativo");
  });
});

describe("sexo do Calc", () => {
  it("masculino/feminino → male/female; outro/vazio não mexe", () => {
    expect(sexoTreino("masculino")).toBe("male");
    expect(sexoTreino("feminino")).toBe("female");
    expect(sexoTreino("outro")).toBeNull();
    expect(sexoTreino(null)).toBeNull();
  });
});

describe("acesso do personal no Treino", () => {
  it("não é personal com Treino → null", () => {
    expect(acessoProfessor(resumo({ membros: [membro({ papeis: ["nutricionista"] })] }))).toBeNull();
  });
  it("conta nova: espelha o acesso e liga a ponte (acesso_liberado_ate + status)", () => {
    expect(acessoProfessor(resumo({ membros: [membro()] }))).toEqual({
      nucleo_acesso_ate: "2026-10-30",
      ponte: { acesso_liberado_ate: "2026-10-30", status: "ativo" },
      alunos_bloqueados_em: null, alunos_bloqueados_msg: null, codigo_convite: "PROF-A",
    });
  });
  it("conta legada (cobrança de hoje até a W28): só o nucleo_acesso_ate, sem ponte", () => {
    const r = acessoProfessor(resumo({ membros: [membro({ conta: conta({ origem: "legado_calc", cobranca_legada: true, acesso_ate: null }) })] }));
    expect(r?.ponte).toBeNull();
    expect(r?.nucleo_acesso_ate).toBeNull();
  });
  it("personal em 2 contas: maior acesso; suspensa em todas → status suspenso", () => {
    const r = acessoProfessor(resumo({ membros: [
      membro({ conta_id: "c1", conta: conta({ id: "c1", acesso_ate: "2026-10-01" }) }),
      membro({ conta_id: "c2", conta: conta({ id: "c2", acesso_ate: "2026-12-01" }) }),
    ] }));
    expect(r?.nucleo_acesso_ate).toBe("2026-12-01");
    const s = acessoProfessor(resumo({ membros: [membro({ conta: conta({ situacao: "suspensa", acesso_ate: null }) })] }));
    expect(s?.ponte).toEqual({ acesso_liberado_ate: null, status: "suspenso" });
  });
  it("master bloqueou os alunos da conta → vai pro Treino", () => {
    const r = acessoProfessor(resumo({ membros: [membro({ conta: conta({ alunos_bloqueados_em: "2026-09-29T10:00:00Z", alunos_bloqueados_msg: "Pausado" }) })] }));
    expect(r).toMatchObject({ alunos_bloqueados_em: "2026-09-29T10:00:00Z", alunos_bloqueados_msg: "Pausado" });
  });
});

describe("linhas do physiq_espelho_membros", () => {
  it("uma por conta; ativo só se o membro está ativo", () => {
    expect(linhasEspelhoMembros(resumo({ membros: [
      membro({ conta_id: "c1", papeis: ["dono", "personal"] }),
      membro({ conta_id: "c2", status: "removido" }),
    ] }))).toEqual([
      { conta_id: "c1", papeis: ["dono", "personal"], ativo: true },
      { conta_id: "c2", papeis: ["personal"], ativo: false },
    ]);
  });
});

describe("segredo do espelho em tempo constante", () => {
  const s = "a".repeat(64);
  it("igual → true; diferente, vazio ou segredo curto → false", () => {
    expect(segredoConfere(s, s)).toBe(true);
    expect(segredoConfere("b".repeat(64), s)).toBe(false);
    expect(segredoConfere("", s)).toBe(false);
    expect(segredoConfere("curto", "curto")).toBe(false);
  });
});
