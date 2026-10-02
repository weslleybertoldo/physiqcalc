import { beforeEach, describe, expect, it } from "vitest";
import {
  bloqueioDoMaster,
  destinoDepoisDoLogin,
  ehProfissional,
  erroDoVinculo,
  escolherConta,
  guardarSituacao,
  lerSituacaoGuardada,
  limparSituacoes,
  normalizarCodigo,
  normalizarSituacao,
  regraDoPlano,
  rotuloDoPapel,
} from "./situacao";
import { conta, matricula, situacao } from "@/test/fixturesNucleo";

beforeEach(() => localStorage.clear());

describe("normalizarSituacao (o JSON da minha_situacao)", () => {
  it("sem user_id não é situação", () => {
    expect(normalizarSituacao(null)).toBeNull();
    expect(normalizarSituacao({ contas: [] })).toBeNull();
  });
  it("tolera campo faltando e filtra módulos desconhecidos", () => {
    const s = normalizarSituacao({ user_id: "u1", modulos_aluno: ["treino", "xyz"], contas: [{ id: "c", modulos: ["nutricao", 3], papeis: null }] })!;
    expect(s.modulos_aluno).toEqual(["treino"]);
    expect(s.contas[0].modulos).toEqual(["nutricao"]);
    expect(s.contas[0].papeis).toEqual([]);
    expect(s.matriculas).toEqual([]);
    expect(s.precisa_treino).toBe(false);
  });
});

describe("cache no aparelho (abre sem internet)", () => {
  it("guarda por pessoa e limpa tudo no sair", () => {
    guardarSituacao(situacao({ user_id: "u1" }));
    guardarSituacao(situacao({ user_id: "u2" }));
    expect(lerSituacaoGuardada("u1")?.user_id).toBe("u1");
    expect(lerSituacaoGuardada("u3")).toBeNull();
    limparSituacoes();
    expect(lerSituacaoGuardada("u1")).toBeNull();
    expect(lerSituacaoGuardada("u2")).toBeNull();
  });
});

describe("papéis e conta ativa (spec 4.1, NF13)", () => {
  it("profissional = master ou membro de conta", () => {
    expect(ehProfissional(situacao())).toBe(false);
    expect(ehProfissional(situacao({ master: true }))).toBe(true);
    expect(ehProfissional(situacao({ contas: [conta()] }))).toBe(true);
  });
  it("conta escolhida vale enquanto a pessoa for membro; senão a 1ª", () => {
    const s = situacao({ contas: [conta({ id: "a" }), conta({ id: "b" })] });
    expect(escolherConta(s, "b")?.id).toBe("b");
    expect(escolherConta(s, "sumiu")?.id).toBe("a");
    expect(escolherConta(situacao(), "a")).toBeNull();
  });
  it("rótulo do papel do menu do usuário", () => {
    expect(rotuloDoPapel(situacao({ master: true }), null)).toBe("Master");
    expect(rotuloDoPapel(situacao(), conta({ papeis: ["dono", "personal"] }))).toBe("Personal trainer");
    expect(rotuloDoPapel(situacao(), conta({ papeis: ["nutricionista"] }))).toBe("Nutricionista");
    expect(rotuloDoPapel(situacao(), conta({ papeis: ["personal", "nutricionista"] }))).toBe("Personal e nutricionista");
    expect(rotuloDoPapel(situacao(), conta({ papeis: ["dono"] }))).toBe("Dono da conta");
    expect(rotuloDoPapel(situacao(), null)).toBe("Aluno");
  });
  it("regra da trava de plano: legada com a cobrança antiga (cobranca_legada) continua nas telas antigas", () => {
    expect(regraDoPlano(conta({ origem: "legado_calc", cobranca_legada: true, situacao: "ativa" }), situacao())).toBe("calc");
    expect(regraDoPlano(conta({ origem: "legado_nutri", cobranca_legada: true, situacao: "vencida" }), situacao())).toBe("nutri");
    expect(regraDoPlano(conta({ origem: "nova" }), situacao())).toBe("nova");
    expect(regraDoPlano(conta({ situacao: "isenta" }), situacao())).toBe("isenta");
    expect(regraDoPlano(conta({ origem: "legado_calc", cobranca_legada: true }), situacao({ master: true }))).toBe("isenta");
    expect(regraDoPlano(conta({ origem: "legado_nutri", cobranca_legada: true, situacao: "isenta" }), situacao())).toBe("isenta");
    expect(regraDoPlano(null, situacao())).toBe("isenta");
  });
  it("W28: legada com cobranca_legada = false (depois do script da virada) vai para o núcleo", () => {
    expect(regraDoPlano(conta({ origem: "legado_calc", cobranca_legada: false, regras_legadas: true, tolerancia_dias: 7 }), situacao())).toBe("nova");
    expect(regraDoPlano(conta({ origem: "legado_nutri", cobranca_legada: false, regras_legadas: true, situacao: "vencida" }), situacao())).toBe("nova");
    expect(regraDoPlano(conta({ origem: "legado_nutri", cobranca_legada: false, situacao: "isenta" }), situacao())).toBe("isenta");
  });
});

describe("destino depois do login (spec 4.2)", () => {
  it("sem nada → Boas-vindas; senão a página pedida ou o início", () => {
    expect(destinoDepoisDoLogin(situacao({ sem_nada: true }), "/treino")).toBe("/boas-vindas");
    expect(destinoDepoisDoLogin(situacao(), "/evolucao")).toBe("/evolucao");
    expect(destinoDepoisDoLogin(situacao(), "/entrar/email")).toBe("/");
    expect(destinoDepoisDoLogin(situacao(), "https://fora.com")).toBe("/");
    expect(destinoDepoisDoLogin(null, null)).toBe("/");
  });
});

describe("bloqueio dos alunos pelo master (C101)", () => {
  it("conta do aluno bloqueada no núcleo → Acesso pausado com a mensagem", () => {
    const s = situacao({ matriculas: [matricula({ conta_alunos_bloqueados_em: "2026-09-28T10:00:00Z", conta_alunos_bloqueados_msg: "Fale com o Lucas" })] });
    expect(bloqueioDoMaster(s)).toEqual({ bloqueado: true, mensagem: "Fale com o Lucas" });
  });
  it("bloqueio do painel master antigo (Treino) também fecha o app do aluno do Calc", () => {
    expect(bloqueioDoMaster(situacao({ matriculas: [matricula()] }), { bloqueadoPeloMaster: true }).bloqueado).toBe(true);
    expect(bloqueioDoMaster(situacao({ calc: true }), { bloqueadoPeloMaster: true }).bloqueado).toBe(true);
  });
  it("aluno em 2 contas (P7): a matrícula só de Nutrição livre mantém o app aberto", () => {
    const s = situacao({ matriculas: [matricula(), matricula({ id: "p2", conta_id: "c2", modulos: ["nutricao"] })] });
    expect(bloqueioDoMaster(s, { bloqueadoPeloMaster: true }).bloqueado).toBe(false);
  });
  it("profissional nunca é travado; sem bloqueio passa", () => {
    expect(bloqueioDoMaster(situacao({ contas: [conta()], matriculas: [matricula({ conta_alunos_bloqueados_em: "x" })] })).bloqueado).toBe(false);
    expect(bloqueioDoMaster(situacao({ matriculas: [matricula()] })).bloqueado).toBe(false);
    expect(bloqueioDoMaster(null).bloqueado).toBe(false);
  });
});

describe("código do profissional", () => {
  it("normaliza o que a pessoa digita", () => {
    expect(normalizarCodigo("  prof-lucas ferreira ")).toBe("PROF-LUCAS-FERREIRA");
  });
  it("erro desconhecido vira erro_interno", () => {
    expect(erroDoVinculo("outro_profissional")).toBe("outro_profissional");
    expect(erroDoVinculo("xpto")).toBe("erro_interno");
    expect(erroDoVinculo(undefined)).toBe("erro_interno");
  });
});
