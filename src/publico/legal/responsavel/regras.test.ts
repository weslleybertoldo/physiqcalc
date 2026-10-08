import { describe, expect, it } from "vitest";
import {
  chaveResponsavel, dadosDaRetirada, dadosDoRegistro, dataDoRegistro, FORM_VAZIO, FORMAS, mensagemErroResponsavel, MENSAGEM_RESPONSAVEL,
  normalizarResponsavel, problemaDoResponsavel, textoDoRegistro, VINCULOS, type FormResponsavel,
} from "./regras";

// hml-12 (H-30, §4.3 T9; P7) — as regras puras do consentimento do responsável (o banco confere tudo de novo: aqui os mesmos códigos).

const pronto: FormResponsavel = { nome: "Maria Souza", vinculo: "mae", forma: "presencial", confirmo: true };

describe("o formulário do responsável", () => {
  it("os valores do contrato com o banco (vínculo e como foi dado) e os rótulos da tela", () => {
    expect(VINCULOS).toEqual([
      { valor: "mae", rotulo: "Mãe" },
      { valor: "pai", rotulo: "Pai" },
      { valor: "responsavel_legal", rotulo: "Responsável legal" },
    ]);
    expect(FORMAS).toEqual([
      { valor: "presencial", rotulo: "Pessoalmente" },
      { valor: "documento_assinado", rotulo: "Documento assinado" },
      { valor: "mensagem_escrita", rotulo: "Mensagem escrita" },
    ]);
  });

  it("o 1º problema, com o código do banco: nome (2 a 120), vínculo, como foi dado e a caixa", () => {
    expect(problemaDoResponsavel(FORM_VAZIO)).toBe("nome_invalido");
    expect(problemaDoResponsavel({ ...pronto, nome: "  M  " })).toBe("nome_invalido");
    expect(problemaDoResponsavel({ ...pronto, nome: "M".repeat(121) })).toBe("nome_invalido");
    expect(problemaDoResponsavel({ ...pronto, nome: "M".repeat(120) })).toBeNull();
    expect(problemaDoResponsavel({ ...pronto, vinculo: "" })).toBe("vinculo_invalido");
    expect(problemaDoResponsavel({ ...pronto, vinculo: "tio" as FormResponsavel["vinculo"] })).toBe("vinculo_invalido");
    expect(problemaDoResponsavel({ ...pronto, forma: "" })).toBe("forma_invalida");
    expect(problemaDoResponsavel({ ...pronto, confirmo: false })).toBe("falta_confirmar");
    expect(problemaDoResponsavel(pronto)).toBeNull();
  });

  it("o p_dados do registro e da retirada (o contrato da aluno_responsavel_registrar), com a origem do aceite", () => {
    expect(dadosDoRegistro({ ...pronto, nome: "  Maria   Souza " }, "site")).toEqual({
      acao: "registrar", nome: "Maria Souza", vinculo: "mae", forma: "presencial", confirmo: true, origem: "site",
    });
    expect(dadosDaRetirada("apk")).toEqual({ acao: "retirar", origem: "apk" });
  });

  it("a consulta da seção muda com a data de nascimento (o 'Editar dados' troca a data → a faixa é lida de novo)", () => {
    expect(chaveResponsavel("p1", "2009-06-01")).toEqual(["aluno-responsavel", "p1", "2009-06-01"]);
    expect(chaveResponsavel("p1", null)).toEqual(["aluno-responsavel", "p1", null]);
    expect(chaveResponsavel("p1")).toEqual(chaveResponsavel("p1", null));
    expect(chaveResponsavel("p1", "2009-06-01")).not.toEqual(chaveResponsavel("p1", "2010-06-01"));
  });
});

describe("o registro na ficha", () => {
  const registro = { nome: "Maria Souza", vinculo: "mae", forma: "presencial", em: "2026-10-08T15:30:00Z", por: "Lucas Ferreira" };

  it("\"Maria Souza (mãe) · pessoalmente · 08/10/2026 · registrado por Lucas Ferreira\"", () => {
    expect(textoDoRegistro(registro)).toBe("Maria Souza (mãe) · pessoalmente · 08/10/2026 · registrado por Lucas Ferreira");
    expect(textoDoRegistro({ ...registro, vinculo: "responsavel_legal", forma: "mensagem_escrita" }))
      .toBe("Maria Souza (responsável legal) · mensagem escrita · 08/10/2026 · registrado por Lucas Ferreira");
  });

  it("o que falta sai da frase; vínculo desconhecido fica como veio", () => {
    expect(textoDoRegistro({ ...registro, por: null, em: null })).toBe("Maria Souza (mãe) · pessoalmente");
    expect(textoDoRegistro({ ...registro, vinculo: "avo", forma: "documento_assinado" })).toBe(
      "Maria Souza (avo) · documento assinado · 08/10/2026 · registrado por Lucas Ferreira",
    );
  });

  it("a data é o dia em São Paulo (01:30 UTC do dia 9 ainda é dia 8 lá)", () => {
    expect(dataDoRegistro("2026-10-09T01:30:00Z")).toBe("08/10/2026");
    expect(dataDoRegistro("2026-10-09T03:30:00Z")).toBe("09/10/2026");
    expect(dataDoRegistro(null)).toBe("");
    expect(dataDoRegistro("ontem")).toBe("");
  });
});

describe("a resposta do banco (aluno_responsavel)", () => {
  it("o formato da tela", () => {
    expect(normalizarResponsavel({
      ok: true, ligado: true, faixa: "16_17", pode_editar: true,
      atual: { nome: " Maria Souza ", vinculo: "mae", forma: "presencial", em: "2026-10-08T15:30:00Z", por: "Lucas Ferreira" },
    })).toEqual({
      ligado: true, faixa: "16_17", pode_editar: true,
      atual: { nome: "Maria Souza", vinculo: "mae", forma: "presencial", em: "2026-10-08T15:30:00Z", por: "Lucas Ferreira" },
    });
  });

  it("o que não dá para ler vira o neutro (sem seção): versão desligada, faixa desconhecida, registro sem nome, lixo", () => {
    const neutro = { ligado: false, faixa: null, pode_editar: false, atual: null };
    expect(normalizarResponsavel(null)).toEqual(neutro);
    expect(normalizarResponsavel("x")).toEqual(neutro);
    expect(normalizarResponsavel({ ok: true, ligado: false, faixa: null, pode_editar: false, atual: null })).toEqual(neutro);
    expect(normalizarResponsavel({ ligado: true, faixa: "17", pode_editar: "sim" }).faixa).toBeNull();
    expect(normalizarResponsavel({ ligado: true, faixa: "16_17", pode_editar: "sim" }).pode_editar).toBe(false);
    expect(normalizarResponsavel({ ligado: true, faixa: "16_17", atual: { nome: " ", vinculo: "mae" } }).atual).toBeNull();
    expect(normalizarResponsavel({ ligado: true, faixa: "menor_16", atual: { nome: "Ana", vinculo: null, forma: 3 } }).atual).toEqual({
      nome: "Ana", vinculo: "", forma: "", em: null, por: null,
    });
  });
});

describe("as frases dos erros", () => {
  it("cada código do banco tem a frase dele (a origem inválida é defeito do app: a genérica)", () => {
    for (const codigo of [
      "sem_acesso", "textos_desligados", "conta_real_no_staging", "nao_e_16_17", "nome_invalido", "vinculo_invalido", "forma_invalida",
      "falta_confirmar", "sem_registro_vigente",
    ]) {
      expect(MENSAGEM_RESPONSAVEL[codigo], codigo).toBeTruthy();
      expect(mensagemErroResponsavel(codigo)).toBe(MENSAGEM_RESPONSAVEL[codigo]);
    }
    expect(mensagemErroResponsavel("origem_invalida")).toBe("Não deu certo agora. Tente de novo.");
    expect(mensagemErroResponsavel("nao_e_16_17")).toBe("O registro do responsável é só para alunos de 16 ou 17 anos. Confira a data de nascimento.");
  });

  it("sem internet (a do app e a do navegador) e o desconhecido", () => {
    expect(mensagemErroResponsavel("sem_internet")).toBe("Sem conexão. Tente de novo quando a internet voltar.");
    expect(mensagemErroResponsavel("TypeError: Failed to fetch")).toBe("Sem conexão. Tente de novo quando a internet voltar.");
    expect(mensagemErroResponsavel("xyz")).toBe("Não deu certo agora. Tente de novo.");
    expect(mensagemErroResponsavel(null)).toBe("Não deu certo agora. Tente de novo.");
  });
});
