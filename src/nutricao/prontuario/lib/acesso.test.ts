import { describe, expect, it } from "vitest";
import { perfil } from "@/test/fixturesPerfilAluno";
import { SECOES_PRONTUARIO, acessoDoProntuario, ajudaVisibilidade, papelDaAnotacao, secaoDaUrl, textoAnotacoes } from "./acesso";

// O aluno da tela 7: Rafael Moura, personal Lucas (u1, dono + personal), nutricionista Camila (u2).
const eu = (o: Partial<{ id: string; dono: boolean; personal: boolean; nutricionista: boolean; master: boolean }>) => ({
  id: "x", dono: false, personal: false, nutricionista: false, master: false, ...o,
});

describe("W18 — seções do prontuário (spec 4.5)", () => {
  it("anotações + as 9 seções clínicas do Nutri, nesta ordem", () => {
    expect(SECOES_PRONTUARIO.map((s) => s.id)).toEqual([
      "anotacoes", "consultas", "anamnese", "questionarios", "exames", "avaliacao-integrada", "gestacional", "farmaco-nutrientes",
      "documentos", "anexos",
    ]);
    expect(SECOES_PRONTUARIO.filter((s) => !s.clinica).map((s) => s.id)).toEqual(["anotacoes"]);
  });

  it("?secao= (inclusive o redirecionamento de /pacientes/:id/<seção>) e ?nova= dos atalhos", () => {
    const de = (q: string) => secaoDaUrl(new URLSearchParams(q));
    expect(de("")).toBe("anotacoes");
    expect(de("secao=prontuario")).toBe("anotacoes");
    expect(de("secao=farmaco-nutrientes")).toBe("farmaco-nutrientes");
    expect(de("secao=avaliacao-integrada")).toBe("avaliacao-integrada");
    expect(de("nova=consulta")).toBe("consultas");
    expect(de("nova=anamnese")).toBe("anamnese");
    expect(de("nova=anotacao")).toBe("anotacoes");
    expect(de("secao=qualquer")).toBe("anotacoes");
    expect(de("nova=orientacao")).toBe("anotacoes");
  });
});

describe("W18 — quem vê e quem muda (spec 4.1, P3, P4)", () => {
  it("nutricionista responsável: tudo; o padrão da anotação dela é \"Só nutricionistas\"", () => {
    const a = acessoDoProntuario(perfil({ eu: eu({ id: "u2", nutricionista: true }) }));
    expect(a).toEqual({ clinico: true, editarClinico: true, visibilidades: ["nutricionistas", "equipe"] });
  });

  it("personal responsável (sem papel de nutri): só as anotações \"Equipe\"", () => {
    const a = acessoDoProntuario(perfil({ eu: eu({ id: "u3", personal: true }), personal: { id: "u3", nome: "Bruno Lima" } }));
    expect(a).toEqual({ clinico: false, editarClinico: false, visibilidades: ["equipe"] });
  });

  it("dono sem papel de nutricionista: anotações conforme a visibilidade (só \"Equipe\"), nada clínico", () => {
    const a = acessoDoProntuario(perfil({ eu: eu({ id: "u1", dono: true, personal: true }) }));
    expect(a.clinico).toBe(false);
    expect(a.visibilidades).toEqual(["equipe"]);
  });

  it("dono que também é nutricionista: tudo, e muda o clínico mesmo sem ser o responsável", () => {
    const a = acessoDoProntuario(perfil({ eu: eu({ id: "u9", dono: true, nutricionista: true }) }));
    expect(a).toEqual({ clinico: true, editarClinico: true, visibilidades: ["nutricionistas", "equipe"] });
  });

  it("nutricionista da conta que acompanha o aluno como personal: vê o clínico, não muda", () => {
    const a = acessoDoProntuario(perfil({ eu: eu({ id: "u1", personal: true, nutricionista: true }) }));
    expect(a.clinico).toBe(true);
    expect(a.editarClinico).toBe(false);
  });

  it("master: tudo; paciente sem conta (site antigo): a nutri dona dele", () => {
    expect(acessoDoProntuario(perfil({ eu: eu({ master: true, dono: true }) })).editarClinico).toBe(true);
    expect(acessoDoProntuario(perfil({ conta_id: null, eu: eu({ id: "u2" }) })).clinico).toBe(true);
    expect(acessoDoProntuario(perfil({ conta_id: null, eu: eu({ id: "u7" }) })).clinico).toBe(false);
  });
});

describe("W18 — o papel com que a anotação é assinada", () => {
  it("\"Só nutricionistas\" é da nutricionista; na \"Equipe\", o papel em relação ao aluno", () => {
    const camila = perfil({ eu: eu({ id: "u2", nutricionista: true }) });
    expect(papelDaAnotacao(camila, "nutricionistas")).toBe("nutricionista");
    expect(papelDaAnotacao(camila, "equipe")).toBe("nutricionista");
    const lucas = perfil({ eu: eu({ id: "u1", dono: true, personal: true }) });
    expect(papelDaAnotacao(lucas, "equipe")).toBe("personal");
    const donoSo = perfil({ eu: eu({ id: "u8", dono: true }) });
    expect(papelDaAnotacao(donoSo, "equipe")).toBe("dono");
    expect(papelDaAnotacao(perfil({ eu: eu({ master: true }) }), "equipe")).toBe("master");
  });

  it("textos da tela", () => {
    expect(textoAnotacoes(0)).toBe("Nenhuma anotação");
    expect(textoAnotacoes(1)).toBe("1 anotação");
    expect(textoAnotacoes(4)).toBe("4 anotações");
    expect(ajudaVisibilidade("nutricionistas")).toMatch(/personal não vê/);
    expect(ajudaVisibilidade("equipe")).toMatch(/Todos que acompanham/);
  });
});
