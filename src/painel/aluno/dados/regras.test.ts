import { describe, expect, it } from "vitest";
import {
  AJUSTES, ajustesVisiveis, alturaEmMetros, ATALHOS_FLUXO, cadastroParaTreino, corpoDoAluno, faixaDeIdade, formDoPerfil, idadeDe,
  linhaDoCabecalho, linhaDoPerfil, linkLigado, MENSAGEM_MENOR_DE_16, mensagemErroPerfil, mudancas, objetivoDoAluno, observacaoDoAjuste, rotaDoAtalho, textoDoLink, validarCPF,
  validarForm, whatsappDoAluno,
} from "./regras";
import { perfil } from "@/test/fixturesPerfilAluno";

describe("W14 — cabeçalho da tela 7", () => {
  it("\"28 anos · 1,78 m · objetivo: definição · aluno desde mar/2026\"", () => {
    expect(linhaDoCabecalho(perfil(), null, "2026-09-30")).toBe("28 anos · 1,78 m · objetivo: definição · aluno desde mar/2026");
  });
  it("só o que existe; o Treino dá altura, idade e o \"desde\" mais antigo (quem veio do Calc)", () => {
    const p = perfil({ nascimento: null, objetivo: null, ultima_antropometria: null, criado_em: "2026-09-29T09:00:00Z" });
    expect(linhaDoCabecalho(p, null, "2026-09-30")).toBe("aluno desde set/2026");
    expect(linhaDoCabecalho(p, { altura: 175, peso: 80, idade: 31, data_nascimento: null, created_at: "2025-01-10T10:00:00Z" }, "2026-09-30"))
      .toBe("31 anos · 1,75 m · aluno desde jan/2025");
  });
  it("idade: aniversário ainda não chegou no ano; altura em metros por engano (1.78) vira cm", () => {
    expect(idadeDe("1998-10-01", "2026-09-30")).toBe(27);
    expect(idadeDe("1998-09-30", "2026-09-30")).toBe(28);
    expect(idadeDe(null)).toBeNull();
    expect(alturaEmMetros(178)).toBe("1,78 m");
    expect(alturaEmMetros(1.78)).toBe("1,78 m");
    expect(corpoDoAluno({ ultima_antropometria: { data: "2026-01-01", peso: 70, altura: 1.65 } })).toEqual({ alturaCm: 165, pesoKg: 70, fonte: "antropometria" });
    expect(corpoDoAluno({ ultima_antropometria: null }, { altura: 180, peso: 90 }).fonte).toBe("treino");
  });
  it("objetivo do profissional ou o do aluno do app", () => {
    expect(objetivoDoAluno({ objetivo: " hipertrofia ", objetivo_app: null })).toBe("hipertrofia");
    expect(objetivoDoAluno({ objetivo: null, objetivo_app: "ganhar_massa" })).toBe("ganhar massa");
  });
  it("Mensagem (P24): WhatsApp do telefone com o 55; sem telefone, nada", () => {
    expect(whatsappDoAluno("(11) 98765-4321")).toBe("https://wa.me/5511987654321");
    expect(whatsappDoAluno("5511987654321")).toBe("https://wa.me/5511987654321");
    expect(whatsappDoAluno("1234")).toBeNull();
    expect(whatsappDoAluno(null)).toBeNull();
  });
});

describe("W14 — Editar dados (C33)", () => {
  it("o formulário parte da matrícula; o que falta vem do Treino (o cadastro que o Calc guardava)", () => {
    const f = formDoPerfil(perfil({ nascimento: null, genero: null }), { nome: "R", email: null, sexo: "male", idade: 28, data_nascimento: "1998-03-10",
      peso: 84.2, altura: 178, foto_url: null, created_at: null });
    expect(f.nascimento).toBe("1998-03-10");
    expect(f.genero).toBe("masculino");
    expect(f.altura).toBe("178");
    expect(f.peso).toBe("84,2");
    expect(f.telefone).toBe("(11) 98765-4321");
  });
  it("valida antes de mandar", () => {
    const f = formDoPerfil(perfil());
    expect(validarForm(f, "2026-09-30")).toBeNull();
    expect(validarForm({ ...f, nome: "R" })).toMatch(/nome/);
    expect(validarForm({ ...f, nascimento: "2030-01-01" }, "2026-09-30")).toMatch(/nascimento/);
    expect(validarForm({ ...f, telefone: "123" })).toMatch(/telefone/);
    expect(validarForm({ ...f, cpf: "111.111.111-11" })).toMatch(/CPF/);
    expect(validarForm({ ...f, email: "sem-arroba" })).toMatch(/e-mail/);
    expect(validarForm({ ...f, altura: "1,78" })).toMatch(/centímetros/);
    expect(validarCPF("529.982.247-25")).toBe(true);
  });
  it("manda só o que mudou; altura/peso vão para o Treino", () => {
    const ini = formDoPerfil(perfil());
    const { principal, treino } = mudancas({ ...ini, telefone: "(11) 91111-2222", altura: "179" }, ini);
    expect(principal).toEqual({ telefone: "11911112222" });
    expect(treino).toEqual({ altura: 179 });
    expect(mudancas(ini, ini)).toEqual({ principal: {}, treino: {} });
  });
  it("o cadastro no formato do Banco do Treino (sexo male/female, idade pelo nascimento)", () => {
    const f = { ...formDoPerfil(perfil()), altura: "178", peso: "84,2" };
    expect(cadastroParaTreino(f, "2026-09-30")).toEqual({ nome: "Rafael Moura", sexo: "male", data_nascimento: "1998-03-10", idade: 28, altura: 178, peso: 84.2 });
  });
  it("erros do servidor em frase", () => {
    expect(mensagemErroPerfil("sem_acesso")).toMatch(/responsável/);
    expect(mensagemErroPerfil("telefone_invalido")).toMatch(/DDD/);
    expect(mensagemErroPerfil("xyz")).toMatch(/Tente de novo/);
  });
  it("hml-12 (H-30): o gatilho da idade mínima (menor_de_16) vira a frase da regra dos menores", () => {
    expect(MENSAGEM_MENOR_DE_16).toBe("O Physiq é para quem tem 16 anos ou mais. Não cadastre menores de 16.");
    expect(mensagemErroPerfil("menor_de_16")).toBe(MENSAGEM_MENOR_DE_16);
    // o erro do gatilho chega como a mensagem do Postgres (o PostgREST repassa o texto do raise)
    expect(mensagemErroPerfil("MENOR_DE_16")).toBe(MENSAGEM_MENOR_DE_16);
  });
});

describe("hml-12 (H-30) — a faixa de idade da regra dos menores", () => {
  it("menor de 16, de 16 a 17 e adulto, pela idade completa em São Paulo; sem data = null", () => {
    expect(faixaDeIdade("2010-10-09", "2026-10-08")).toBe("menor_16"); // faz 16 amanhã
    expect(faixaDeIdade("2010-10-08", "2026-10-08")).toBe("16_17");
    expect(faixaDeIdade("2008-10-09", "2026-10-08")).toBe("16_17"); // faz 18 amanhã
    expect(faixaDeIdade("2008-10-08", "2026-10-08")).toBe("adulto");
    expect(faixaDeIdade(null, "2026-10-08")).toBeNull();
    expect(faixaDeIdade("", "2026-10-08")).toBeNull();
    expect(faixaDeIdade("2027-01-01", "2026-10-08")).toBeNull(); // data no futuro não tem idade
  });
});

describe("W14 (F2, R12) — os 4 ajustes", () => {
  it("o texto do link fala do envio de fotos (F1); diário e link só com Nutrição", () => {
    expect(AJUSTES.find((a) => a.chave === "acesso_link")?.rotulo).toBe("Envio de fotos pelo link");
    expect(ajustesVisiveis(perfil()).map((a) => a.chave)).toEqual(["acesso_app", "mensagens_automaticas", "diario_alimentar", "acesso_link"]);
    expect(ajustesVisiveis(perfil({ modulos: ["treino"] })).map((a) => a.chave)).toEqual(["acesso_app", "mensagens_automaticas"]);
  });
  it("o aviso de cada ajuste para ESTE aluno", () => {
    expect(observacaoDoAjuste("acesso_app", perfil({ tem_login: false }))).toMatch(/não tem login/);
    expect(observacaoDoAjuste("mensagens_automaticas", perfil({ telefone: null }))).toMatch(/Sem telefone/);
    expect(observacaoDoAjuste("acesso_link", perfil({ ajustes: { ...perfil().ajustes, diario_alimentar: false } }))).toMatch(/diário/);
    expect(observacaoDoAjuste("acesso_app", perfil())).toBeNull();
  });
  it("o link do diário só funciona com o diário e o envio pelo link ligados", () => {
    const a = perfil().ajustes;
    expect(linkLigado(a)).toEqual({ ligado: true, motivo: null });
    expect(linkLigado({ ...a, diario_alimentar: false }).ligado).toBe(false);
    expect(linkLigado({ ...a, acesso_link: false }).motivo).toMatch(/pelo link/);
    expect(textoDoLink("Rafael Moura", "https://x/d/abc")).toBe("Oi, Rafael! Este é o link do seu diário alimentar: mande por ele as fotos das suas refeições.\nhttps://x/d/abc");
  });
});

describe("W14 — Fluxo de consulta (os 7 atalhos do Nutri)", () => {
  it("cada atalho abre a aba do Physiq (ou a Agenda) com o formulário — o site antigo saiu na W28", () => {
    expect(ATALHOS_FLUXO.map((a) => a.chave)).toEqual(["consulta", "agendar", "anamnese", "antropometria", "planejamento", "orientacao", "manipulados"]);
    expect(rotaDoAtalho(ATALHOS_FLUXO[0], "/painel/alunos/t1", "p1")).toBe("/painel/alunos/t1/prontuario?nova=consulta");
    expect(rotaDoAtalho(ATALHOS_FLUXO[1], "/painel/alunos/t1", "p1")).toBe("/painel/agenda?aluno=p1&novo=1");
    expect(rotaDoAtalho(ATALHOS_FLUXO[3], "/painel/alunos/t1", "p1")).toBe("/painel/alunos/t1/avaliacao?nova=antropometria");
    expect(rotaDoAtalho(ATALHOS_FLUXO[6], "/painel/alunos/t1", "p1")).toBe("/painel/alunos/t1/dieta?novo=manipulado");
  });
});

describe("W14 — as ações da W13 no perfil", () => {
  it("o perfil vira a linha da lista (mesmas ações e confirmações)", () => {
    const l = linhaDoPerfil(perfil({ bloqueado: true }));
    expect(l).toMatchObject({ id: "p1", rota_id: "p1", nome: "Rafael Moura", bloqueado: true, ativo: true, tem_login: true, pagamento: null });
  });
});
