import { describe, expect, it } from "vitest";
import {
  acaoApp,
  acaoPublica,
  acaoRepasse,
  assuntoConviteAluno,
  erroParaApkAntigo,
  htmlConviteAluno,
  linkConviteAluno,
  rotuloDosModulos,
  statusDoErro,
  statusParaApkAntigo,
  textoConviteAluno,
} from "../../../supabase-principal/functions/_shared/alunos-regras";

// Regras puras da função `alunos` do banco principal (W13): as mesmas que rodam na borda (Deno).
describe("W13 — função alunos: ações aceitas", () => {
  it("app, público e repasse do APK antigo têm listas separadas", () => {
    expect(acaoApp("bloquear")).toBe("bloquear");
    expect(acaoApp("cadastro_enviar")).toBeNull();
    expect(acaoPublica("cadastro_enviar")).toBe("cadastro_enviar");
    expect(acaoPublica("bloquear")).toBeNull();
    expect(acaoRepasse("convidar")).toBe("convidar");
    expect(acaoRepasse("remover")).toBeNull();
  });
  it("status HTTP do erro do banco (limite = 409, sem acesso = 403, desconhecido = 400)", () => {
    expect(statusDoErro("limite_plano")).toBe(409);
    expect(statusDoErro("outro_profissional")).toBe(409);
    expect(statusDoErro("sem_acesso")).toBe(403);
    expect(statusDoErro("sem_login")).toBe(401);
    expect(statusDoErro("muitos_convites")).toBe(429);
    expect(statusDoErro("qualquer")).toBe(400);
  });
});

describe("W13 — e-mail do convite de aluno (Resend, C7/C87)", () => {
  const d = { email: "ana@x.com", modulos: ["treino"], conta: "Consultoria Ferreira", quem: "Lucas Ferreira", responsavel: "Lucas Ferreira", link: linkConviteAluno("public") };
  it("link do ambiente (?convite=1 aceita mesmo já logado no aparelho)", () => {
    expect(linkConviteAluno("public")).toBe("https://physiqcalc.com.br/entrar?convite=1");
    expect(linkConviteAluno("staging")).toBe("https://physiqcalc-staging.vercel.app/entrar?convite=1");
  });
  it("assunto; conta de teste leva o destinatário no assunto", () => {
    expect(assuntoConviteAluno(d)).toBe("Lucas Ferreira convidou você para o Physiq");
    expect(assuntoConviteAluno({ ...d, paraTeste: "w13.aluno.teste.claude@physiqnutri.app" })).toBe("[teste → w13.aluno.teste.claude@physiqnutri.app] Lucas Ferreira convidou você para o Physiq");
  });
  it("corpo escapa HTML e diz o que o aluno vai acompanhar", () => {
    const html = htmlConviteAluno({ ...d, quem: "<b>x</b>" });
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toContain("<b>x</b>");
    expect(rotuloDosModulos(["treino", "nutricao"])).toBe("o seu treino e a sua alimentação");
    expect(rotuloDosModulos(["nutricao"])).toBe("a sua alimentação");
    expect(textoConviteAluno(d)).toContain("https://physiqcalc.com.br/entrar?convite=1");
  });
});

describe("W13 — repasse do APK antigo (professor-convites): vocabulário de hoje", () => {
  it("erros e situações do convite", () => {
    expect(erroParaApkAntigo("outro_profissional")).toBe("aluno_de_outro_professor");
    expect(erroParaApkAntigo("conta_travada")).toBe("plano_vencido");
    expect(erroParaApkAntigo("limite_plano")).toBe("limite_plano");
    expect(statusParaApkAntigo("expirado")).toBe("revogado");
    expect(statusParaApkAntigo("aceito")).toBe("aceito");
  });
});
