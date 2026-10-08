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

  // hml-12 (H-30): o `legal` da minha_situacao (o aceite e os consentimentos) — dado, vai para todos os builds
  it("legal: passa como veio; versão nula = desligado (nada pendente); falta ou forma estranha → null", () => {
    const pendente = { versao: "2026-10-08", aceite_pendente: true, saude_pendente: false, nascimento_pendente: true, menor: "sem_responsavel" };
    expect(normalizarSituacao({ user_id: "u1", legal: pendente })!.legal).toEqual(pendente);
    expect(normalizarSituacao({ user_id: "u1", legal: { versao: null } })!.legal).toEqual({
      versao: null, aceite_pendente: false, saude_pendente: false, nascimento_pendente: false, menor: null,
    });
    // servidor antigo (sem o campo) e formas estranhas: null (a porta do aceite deixa passar)
    expect(normalizarSituacao({ user_id: "u1" })!.legal).toBeNull();
    expect(normalizarSituacao({ user_id: "u1", legal: "2026-10-08" })!.legal).toBeNull();
    expect(normalizarSituacao({ user_id: "u1", legal: {} })!.legal).toBeNull();
    expect(normalizarSituacao({ user_id: "u1", legal: { ...pendente, versao: "8/10/2026" } })!.legal).toBeNull();
    expect(normalizarSituacao({ user_id: "u1", legal: { ...pendente, aceite_pendente: "sim" } })!.legal).toBeNull();
    expect(normalizarSituacao({ user_id: "u1", legal: { versao: "2026-10-08" } })!.legal).toBeNull();
    // a trava desconhecida não trava
    expect(normalizarSituacao({ user_id: "u1", legal: { ...pendente, menor: "outra" } })!.legal?.menor).toBeNull();
    expect(normalizarSituacao({ user_id: "u1", legal: { ...pendente, menor: "menor_16" } })!.legal?.menor).toBe("menor_16");
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
  it("aluno em 2 contas (P7): a matrícula livre (só de Nutrição) mantém o app aberto", () => {
    const s = situacao({ matriculas: [matricula({ conta_alunos_bloqueados_em: "2026-09-28T10:00:00Z" }), matricula({ id: "p2", conta_id: "c2", modulos: ["nutricao"] })] });
    expect(bloqueioDoMaster(s).bloqueado).toBe(false);
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
