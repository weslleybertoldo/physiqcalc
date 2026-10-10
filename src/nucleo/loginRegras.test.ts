import { describe, expect, it } from "vitest";
import {
  contaLegadoCalc,
  professorDoCalcDeVerdade,
  deveTrocarSenha,
  ehLoginGoogle,
  emailDeTeste,
  faixaDoPlanoCalc,
  origemPermitida,
  senhaAleatoria,
  type ProfessorCalc,
} from "../../supabase-principal/functions/_shared/login-regras";
import * as treino from "../../supabase/functions/_shared/espelho/regras";
import { emailDeTeste as emailDeTesteDoStaging } from "./contasTeste";

// Regras do pos-login e do vincular-aluno (banco principal, W3). As de sessão são cópias das da trocar-token do Treino:
// aqui confere que as 2 cópias concordam (e a do StagingGate do app).
const jwt = (payload: Record<string, unknown>) => `x.${btoa(JSON.stringify(payload)).replace(/=+$/, "")}.y`;
const usuarioGoogle = {
  id: "u1", email: "rafa@gmail.com", email_confirmed_at: "2026-09-01",
  identities: [{ provider: "google", identity_data: { email: "rafa@gmail.com", email_verified: true } }, { provider: "email", identity_data: {} }],
};

describe("sessão (igual à trocar-token)", () => {
  it("login Google exige amr oauth E identidade Google com o mesmo e-mail verificado", () => {
    const oauth = treino.claimsDoJwt(jwt({ amr: [{ method: "oauth" }] }));
    const senha = treino.claimsDoJwt(jwt({ amr: [{ method: "password" }] }));
    for (const f of [ehLoginGoogle, treino.ehLoginGoogle]) {
      expect(f(oauth, usuarioGoogle)).toBe(true);
      expect(f(senha, usuarioGoogle)).toBe(false);
      expect(f(oauth, { ...usuarioGoogle, identities: [{ provider: "google", identity_data: { email: "outro@gmail.com", email_verified: true } }] })).toBe(false);
      expect(f(oauth, { ...usuarioGoogle, identities: [{ provider: "google", identity_data: { email: "rafa@gmail.com", email_verified: false } }] })).toBe(false);
    }
  });
  it("contas de teste do staging (P26): as 3 cópias concordam", () => {
    const casos = ["teste@teste.com", "aluno.teste.claude@physiqnutri.app", "admin.teste.claude@physiqcalc.app", "rafa@gmail.com",
      "teste@gmail.com", "x.teste@physiqcalc.app.evil.com", "TESTE@TESTE.COM"];
    for (const e of casos) {
      expect(emailDeTeste(e)).toBe(treino.emailDeTeste(e));
      expect(emailDeTesteDoStaging(e)).toBe(treino.emailDeTeste(e));
    }
    expect(emailDeTeste("rafa@gmail.com")).toBe(false);
    expect(emailDeTeste("aluno.teste.claude@physiqnutri.app")).toBe(true);
  });
});

describe("P25 — 1ª entrada com o Google numa conta criada com senha", () => {
  it("troca a senha só uma vez e só quando havia senha", () => {
    expect(deveTrocarSenha({ loginGoogle: true, temIdentidadeEmail: true, temSenha: true, jaTrocou: false })).toBe(true);
    expect(deveTrocarSenha({ loginGoogle: true, temIdentidadeEmail: true, temSenha: true, jaTrocou: true })).toBe(false);
    expect(deveTrocarSenha({ loginGoogle: true, temIdentidadeEmail: true, temSenha: false, jaTrocou: false })).toBe(false); // criado pelo script 01, sem senha
    expect(deveTrocarSenha({ loginGoogle: false, temIdentidadeEmail: true, temSenha: true, jaTrocou: false })).toBe(false);
  });
  it("senha aleatória forte", () => {
    const a = senhaAleatoria();
    expect(a).toMatch(/^[0-9a-f]{48}$/);
    expect(senhaAleatoria()).not.toBe(a);
  });
});

describe("conta legado_calc (ponte do pos-login = script 01 para uma pessoa)", () => {
  const prof = (o: Partial<ProfessorCalc> = {}): ProfessorCalc => ({
    codigo_convite: "PROF-X", nome: "X", status: "ativo", plano_nome: "Studio", trial_ate: null, adesao_paga_em: null,
    ciclo_vence_em: null, anual_ate: null, cobranca_pausada: false, acesso_liberado_ate: null, master: false, ...o,
  });
  const HOJE = "2026-09-29";
  it("faixa do plano (spec 6.3)", () => {
    expect(["Start", "Studio", "Pro", "Ilimitado", null].map((n) => faixaDoPlanoCalc(n))).toEqual(["f10", "f30", "f100", "livre", "f10"]);
    expect(faixaDoPlanoCalc(null, true)).toBe("livre");
  });
  it("master isento; suspenso; cobrança pausada vira isenta", () => {
    expect(contaLegadoCalc(prof({ master: true }), HOJE)).toMatchObject({ situacao: "isenta", isenta_motivo: "master" });
    expect(contaLegadoCalc(prof({ status: "suspenso" }), HOJE).situacao).toBe("suspensa");
    expect(contaLegadoCalc(prof({ cobranca_pausada: true }), HOJE)).toMatchObject({ situacao: "isenta", isenta_motivo: "pausada pelo master" });
  });
  it("teste, ciclo com 7 dias de tolerância, anual e liberação", () => {
    expect(contaLegadoCalc(prof({ trial_ate: "2026-10-02" }), HOJE)).toMatchObject({ situacao: "teste", teste_ate: "2026-10-02" });
    expect(contaLegadoCalc(prof({ trial_ate: "2026-09-01" }), HOJE).situacao).toBe("vencida");
    expect(contaLegadoCalc(prof({ adesao_paga_em: "2026-08-01", ciclo_vence_em: "2026-09-25" }), HOJE)).toMatchObject({ situacao: "ativa", tolerancia_dias: 7, vence_em: "2026-09-25" });
    expect(contaLegadoCalc(prof({ adesao_paga_em: "2026-08-01", ciclo_vence_em: "2026-09-10" }), HOJE)).toMatchObject({ situacao: "vencida", tolerancia_dias: 7 });
    expect(contaLegadoCalc(prof({ anual_ate: "2027-01-01", adesao_paga_em: "2026-01-01", ciclo_vence_em: "2026-09-10" }), HOJE)).toMatchObject({ situacao: "ativa", tolerancia_dias: 0, vence_em: "2027-01-01" });
    expect(contaLegadoCalc(prof({ acesso_liberado_ate: "2026-10-29" }), HOJE)).toMatchObject({ situacao: "ativa", vence_em: "2026-10-29" });
    expect(contaLegadoCalc(prof(), HOJE).situacao).toBe("vencida");
  });
});

describe("CORS das funções do login", () => {
  it("aceita o Physiq, o staging, o APK e o dev local nas portas do projeto", () => {
    for (const o of ["https://physiqcalc.com.br", "https://www.physiqcalc.com.br", "https://physiqcalc-staging.vercel.app", "capacitor://localhost", "https://localhost", "http://localhost:5173", "http://localhost:8080"]) {
      expect(origemPermitida(o)).toBe(true);
    }
    for (const o of ["https://evil.com", "http://localhost:3000", "https://physiqcalc.com.br.evil.com", null]) {
      expect(origemPermitida(o)).toBe(false);
    }
  });
});

describe("W4 — a ponte do pos-login só vale para professor do Calc de verdade", () => {
  const base = { codigo_convite: "PROF-X", nome: "X", status: "ativo", plano_nome: null, trial_ate: null, adesao_paga_em: null, ciclo_vence_em: null,
    anual_ate: null, cobranca_pausada: false, acesso_liberado_ate: null, master: false };
  it("a linha que o espelho criou (só acesso) não vira conta legado_calc; a do Calc (plano, teste, adesão, anual) vira", () => {
    expect(professorDoCalcDeVerdade({ ...base, acesso_liberado_ate: "2026-10-13" })).toBe(false);
    expect(professorDoCalcDeVerdade({ ...base, plano_nome: "Start" })).toBe(true);
    expect(professorDoCalcDeVerdade({ ...base, trial_ate: "2026-10-01" })).toBe(true);
    expect(professorDoCalcDeVerdade({ ...base, adesao_paga_em: "2026-09-01", ciclo_vence_em: "2026-10-01" })).toBe(true);
    expect(professorDoCalcDeVerdade({ ...base, anual_ate: "2027-01-01" })).toBe(true);
    expect(professorDoCalcDeVerdade({ ...base, cobranca_pausada: true })).toBe(true);
    expect(professorDoCalcDeVerdade({ ...base, master: true })).toBe(true);
  });
});
