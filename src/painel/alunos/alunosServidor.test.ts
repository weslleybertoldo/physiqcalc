import { describe, expect, it } from "vitest";
import {
  acaoApp,
  acaoPublica,
  acaoRepasse,
  assuntoConviteAluno,
  erroParaApkAntigo,
  htmlConviteAluno,
  linkConviteAluno,
  modeloConviteAluno,
  oQueVaiAcompanhar,
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
  it("molde C (H3): a inicial de quem convidou, Convidou você · nome · conta, as linhas e o botão Entrar e aceitar", () => {
    const c = { email: "rafael.moura@exemplo.com", modulos: ["treino", "nutricao"], conta: "Consultoria Ferreira", quem: "Lucas Ferreira", responsavel: null, link: linkConviteAluno("public") };
    const m = modeloConviteAluno(c);
    expect(m.rotulo).toBe("Convite");
    expect(m.destaques).toEqual([{ visual: { tipo: "pessoa", iniciais: "LF" }, olho: "Convidou você", titulo: "Lucas Ferreira", sub: "Consultoria Ferreira" }]);
    expect(m.linhas.map((l) => [l.icone ?? l.iniciais, l.rotulo, l.valor])).toEqual([
      ["lista", "Você vai acompanhar", "Treino e alimentação"],
      ["email", "Entre com este e-mail", "rafael.moura@exemplo.com"],
      ["escudo", "Como aceitar", "Pelo botão Entrar com Google"],
    ]);
    expect(m.preheader).toBe("Lucas Ferreira (Consultoria Ferreira) convidou você para acompanhar o seu treino e a sua alimentação pelo Physiq.");
    const html = htmlConviteAluno(c);
    expect(html).toContain("Olá! <strong");
    expect(html).toContain(">Lucas Ferreira</strong> (Consultoria Ferreira) convidou você para acompanhar o seu treino e a sua alimentação pelo Physiq.");
    expect(html).toContain(">Entrar e aceitar</a>");
    expect(html).toContain("O botão abre o Physiq. Se não abrir, use o link:");
    expect(html).toContain("Se você não esperava este convite, ignore este e-mail.");
    // outra pessoa acompanha: a linha "Quem vai acompanhar você" (com as iniciais dela); o mesmo nome não repete
    const outro = modeloConviteAluno({ ...c, modulos: ["nutricao"], responsavel: "Camila Rocha" });
    expect(outro.linhas.map((l) => l.rotulo)).toEqual(["Você vai acompanhar", "Quem vai acompanhar você", "Entre com este e-mail", "Como aceitar"]);
    expect(outro.linhas[1]).toMatchObject({ iniciais: "CR", valor: "Camila Rocha" });
    expect(modeloConviteAluno({ ...c, responsavel: "Lucas Ferreira" }).linhas).toHaveLength(3);
    // conta vazia: sem "()" na frase e sem a linha de baixo do destaque
    const semConta = modeloConviteAluno({ ...c, conta: " " });
    expect(semConta.destaques![0].sub).toBeNull();
    expect(htmlConviteAluno({ ...c, conta: "" })).not.toContain("()");
    expect(textoConviteAluno({ ...c, conta: "" })).not.toContain("()");
    expect(oQueVaiAcompanhar(["treino"])).toBe("Treino");
    expect(oQueVaiAcompanhar(["nutricao"])).toBe("Alimentação");
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
