// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/farmacoUtil.test.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { describe, expect, it } from "vitest";
import {
  agruparCongeladas, casaMedicamento, congelarInteracoes, congelarMedicamentos, contarAltas, cruzar, filtrarBase, gravidadeMaxima, gravidadeMaximaCruzamento,
  interacoesDoMedicamento, lerInteracoesJson, lerMedicamentosJson, lerSinonimos, montarParecer, nomeArquivoPDFFarmaco, normalizarMedicamento, ordenarInteracoes,
  ordenarMedicamentos, resumoCruzamento, sugerirMedicamentos, textoAnalise, textoContagemMedicamentos, textoPreviaInteracoes, tituloPadraoAnalise, totalInteracoes,
  validarAnalise, validarInteracao, validarMedicamento, type InteracaoBase, type MedicamentoBase,
} from "./farmacoUtil";

const inter = (id: string, medicamento: string, sinonimos: string[], nutriente: string, gravidade: string, dona: string | null = null): InteracaoBase => ({
  id, nutricionista_id: dona, codigo: dona ? null : `sistema:${id}`, medicamento, sinonimos, classe: "", nutriente, efeito: `efeito ${id}`, gravidade, conduta: `conduta ${id}`, fonte: "",
});
const med = (id: string, medicamento: string, ativo = true, extra: Partial<MedicamentoBase> = {}): MedicamentoBase => ({
  id, medicamento, dose: "", posologia: "", inicio: null, ativo, observacao: "", created_at: `2026-09-19T10:00:0${id.length}Z`, ...extra,
});

const base: InteracaoBase[] = [
  inter("i1", "Metformina", ["Glifage", "Glucoformin"], "Vitamina B12", "moderada"),
  inter("i2", "Metformina", ["Glifage", "Glucoformin"], "Ácido fólico", "baixa"),
  inter("i3", "Levotiroxina", ["Puran T4", "Synthroid"], "Cálcio e laticínios", "alta"),
  inter("i4", "Levotiroxina", ["Puran T4", "Synthroid"], "Café", "moderada"),
  inter("i5", "Omeprazol", ["Pantoprazol"], "Magnésio", "moderada"),
  inter("i6", "Smoke Remedio", ["SmokeRem"], "Nutriente Smoke", "alta", "nutri-1"),
];

describe("normalização e casamento", () => {
  it("normaliza sem acento, caixa e espaços", () => {
    expect(normalizarMedicamento("  Ácido   Fólico ")).toBe("acido folico");
    expect(normalizarMedicamento(null)).toBe("");
  });
  it("casa pelo genérico, pelo sinônimo e pelo prefixo seguido de espaço", () => {
    expect(casaMedicamento("metformina", base[0])).toBe(true);
    expect(casaMedicamento("METFORMINA 850 mg", base[0])).toBe(true);
    expect(casaMedicamento("glifage xr", base[0])).toBe(true);
    expect(casaMedicamento("Puran T4", base[2])).toBe(true);
    expect(casaMedicamento("puran t4 50 mcg", base[2])).toBe(true);
    expect(casaMedicamento("smokerem 10 mg", base[5])).toBe(true);
  });
  it("não casa parcial sem espaço, vazio nem outro remédio", () => {
    expect(casaMedicamento("metf", base[0])).toBe(false);
    expect(casaMedicamento("metformina850", base[0])).toBe(false);
    expect(casaMedicamento("", base[0])).toBe(false);
    expect(casaMedicamento("Omeprazol", base[0])).toBe(false);
  });
  it("sugere nomes distintos a partir de 2 letras, os que começam primeiro, até o máximo", () => {
    expect(sugerirMedicamentos(base, "m")).toEqual([]);
    expect(sugerirMedicamentos(base, "metf")).toEqual(["Metformina"]);
    expect(sugerirMedicamentos(base, "ra")).toEqual(["Omeprazol", "Pantoprazol", "Puran T4"]);
    expect(sugerirMedicamentos(base, "me")).toEqual(["Metformina", "Omeprazol", "Smoke Remedio"]);
    expect(sugerirMedicamentos(base, "puran")).toEqual(["Puran T4"]);
    expect(sugerirMedicamentos(base, "o", 8)).toEqual([]);
    expect(sugerirMedicamentos(base, "o ", 8)).toEqual([]);
    expect(sugerirMedicamentos(base, "ra", 2)).toEqual(["Omeprazol", "Pantoprazol"]);
  });
  it("interações do medicamento: 1x por id, gravidade desc e nutriente", () => {
    const l = interacoesDoMedicamento("levotiroxina 50", [...base, base[2]]);
    expect(l.map((i) => i.id)).toEqual(["i3", "i4"]);
    expect(interacoesDoMedicamento("dipirona", base)).toEqual([]);
  });
});

describe("cruzamento", () => {
  const meds = [med("m1", "Puran T4"), med("m2", "metformina 850"), med("m3", "Omeprazol", false), med("m4", "Dipirona")];
  const c = cruzar(meds, base);
  it("só os ativos, por nome, cada um com as suas interações", () => {
    expect(c.map((g) => g.medicamento.id)).toEqual(["m4", "m2", "m1"]);
    expect(c.map((g) => g.interacoes.map((i) => i.id))).toEqual([[], ["i1", "i2"], ["i3", "i4"]]);
    expect(totalInteracoes(c)).toBe(4);
    expect(contarAltas(c)).toBe(1);
    expect(gravidadeMaximaCruzamento(c)).toBe("alta");
    expect(gravidadeMaxima([])).toBeNull();
    expect(gravidadeMaxima([{ gravidade: "baixa" }, { gravidade: "moderada" }, { gravidade: "x" }])).toBe("moderada");
  });
  it("resumo", () => {
    expect(resumoCruzamento(c)).toBe("3 medicamentos · 4 interações · 1 alta");
    expect(resumoCruzamento(cruzar([med("m1", "Metformina")], base))).toBe("1 medicamento · 2 interações");
    expect(resumoCruzamento(cruzar([med("m1", "Dipirona")], base))).toBe("1 medicamento · nenhuma interação");
    expect(resumoCruzamento([])).toBe("nenhum medicamento em uso");
  });
  it("parecer em markdown simples", () => {
    const p = montarParecer(c);
    expect(p).toContain("## Dipirona\n- sem interação conhecida na base");
    expect(p).toContain("## metformina 850\n- **Vitamina B12** (moderada): conduta i1\n- **Ácido fólico** (baixa): conduta i2");
    expect(p).toContain("## Puran T4\n- **Cálcio e laticínios** (alta): conduta i3");
    expect(p.split("\n\n")).toHaveLength(3);
  });
  it("prévia", () => {
    expect(textoPreviaInteracoes(c[1].interacoes)).toBe("2 interações conhecidas: Vitamina B12 (moderada), Ácido fólico (baixa)");
    expect(textoPreviaInteracoes([])).toBe("sem interação conhecida na base");
  });
  it("congela e lê de volta (ida-e-volta pelo JSON)", () => {
    const m = congelarMedicamentos(c);
    const i = congelarInteracoes(c);
    expect(m).toEqual([
      { medicamento: "Dipirona", dose: "", posologia: "" },
      { medicamento: "metformina 850", dose: "", posologia: "" },
      { medicamento: "Puran T4", dose: "", posologia: "" },
    ]);
    expect(i.map((x) => [x.medicamento, x.nutriente, x.gravidade, x.origem])).toEqual([
      ["metformina 850", "Vitamina B12", "moderada", "sistema"],
      ["metformina 850", "Ácido fólico", "baixa", "sistema"],
      ["Puran T4", "Cálcio e laticínios", "alta", "sistema"],
      ["Puran T4", "Café", "moderada", "sistema"],
    ]);
    expect(lerMedicamentosJson(JSON.parse(JSON.stringify(m)))).toEqual(m);
    expect(lerInteracoesJson(JSON.parse(JSON.stringify(i)))).toEqual(i);
    expect(lerMedicamentosJson("x")).toEqual([]);
    expect(lerInteracoesJson([{ medicamento: "A" }, { medicamento: "A", nutriente: "B", gravidade: "zzz", origem: "propria" }])).toEqual([
      { id: "", medicamento: "A", nutriente: "B", efeito: "", gravidade: "moderada", conduta: "", origem: "propria" },
    ]);
    const grupos = agruparCongeladas(m, [...i, { id: "x", medicamento: "Orfa", nutriente: "N", efeito: "", gravidade: "alta", conduta: "", origem: "propria" }]);
    expect(grupos.map((g) => [g.medicamento.medicamento, g.interacoes.length])).toEqual([["Dipirona", 0], ["metformina 850", 2], ["Puran T4", 2], ["Orfa", 1]]);
    expect(textoAnalise({ medicamentos: m, interacoes: i })).toBe("3 medicamentos · 4 interações · gravidade máx. alta");
    expect(textoAnalise({ medicamentos: [m[0]], interacoes: [] })).toBe("1 medicamento · nenhuma interação");
  });
});

describe("formulários", () => {
  it("valida o medicamento", () => {
    const f = { medicamento: "", interacaoId: null, dose: "", posologia: "", inicio: "", observacao: "" };
    expect(validarMedicamento(f, "2026-09-19")).toBe("Informe o medicamento");
    expect(validarMedicamento({ ...f, medicamento: "Metformina", inicio: "2026-09-20" }, "2026-09-19")).toBe("O início não pode ser no futuro");
    expect(validarMedicamento({ ...f, medicamento: "Metformina", inicio: "2026-13-01" }, "2026-09-19")).toBe("Data de início inválida");
    expect(validarMedicamento({ ...f, medicamento: "Metformina", dose: "x".repeat(301) }, "2026-09-19")).toBe("Textos com até 300 caracteres");
    expect(validarMedicamento({ ...f, medicamento: "Metformina", inicio: "2026-09-19" }, "2026-09-19")).toBeNull();
  });
  it("sinônimos por vírgula sem vazio nem duplicado", () => {
    expect(lerSinonimos(" Glifage , glucoformin,, GLIFAGE ,Glucoformín ")).toEqual(["Glifage", "glucoformin"]);
    expect(lerSinonimos("")).toEqual([]);
  });
  it("valida a interação", () => {
    const f = { medicamento: "", sinonimos: "", classe: "", nutriente: "", efeito: "", gravidade: "moderada" as const, conduta: "", fonte: "" };
    expect(validarInteracao(f)).toBe("Informe o medicamento");
    expect(validarInteracao({ ...f, medicamento: "X" })).toBe("Informe o nutriente");
    expect(validarInteracao({ ...f, medicamento: "X", nutriente: "N" })).toBe("Descreva o efeito");
    expect(validarInteracao({ ...f, medicamento: "X", nutriente: "N", efeito: "E" })).toBe("Descreva a conduta");
    expect(validarInteracao({ ...f, medicamento: "X", nutriente: "N", efeito: "E", conduta: "C", gravidade: "x" as never })).toBe("Escolha a gravidade");
    expect(validarInteracao({ ...f, medicamento: "X", nutriente: "N", efeito: "E", conduta: "C" })).toBeNull();
  });
  it("valida a análise e monta o título padrão", () => {
    expect(validarAnalise({ titulo: " ", parecer: "" })).toBe("Dê um título à análise");
    expect(validarAnalise({ titulo: "T", parecer: "x".repeat(8001) })).toBe("Parecer com até 8000 caracteres");
    expect(validarAnalise({ titulo: "T", parecer: "" })).toBeNull();
    expect(tituloPadraoAnalise(new Date(2026, 8, 19))).toBe("Análise fármaco-nutriente — 19/09/2026");
  });
});

describe("ordenação, filtros e textos", () => {
  it("medicamentos: ativos primeiro, depois nome", () => {
    const l = ordenarMedicamentos([med("a", "Zinco", false), med("b", "ácido", true), med("c", "Beta", true)]);
    expect(l.map((m) => m.id)).toEqual(["b", "c", "a"]);
  });
  it("interações: gravidade desc, medicamento, nutriente", () => {
    expect(ordenarInteracoes(base).map((i) => i.id)).toEqual(["i3", "i6", "i4", "i1", "i5", "i2"]);
  });
  it("filtra a base por busca, gravidade e origem", () => {
    expect(filtrarBase(base, "glifage", "", "todas").map((i) => i.id)).toEqual(["i1", "i2"]);
    expect(filtrarBase(base, "", "alta", "todas").map((i) => i.id)).toEqual(["i3", "i6"]);
    expect(filtrarBase(base, "", "", "propria").map((i) => i.id)).toEqual(["i6"]);
    expect(filtrarBase(base, "acido", "", "sistema").map((i) => i.id)).toEqual(["i2"]);
    expect(filtrarBase(base, "b12", "alta", "todas")).toEqual([]);
  });
  it("textos", () => {
    expect(textoContagemMedicamentos(2, 3)).toBe("2 medicamentos em uso · 1 suspenso");
    expect(textoContagemMedicamentos(1, 1)).toBe("1 medicamento em uso");
    expect(textoContagemMedicamentos(0, 2)).toBe("0 medicamentos em uso · 2 suspensos");
    expect(nomeArquivoPDFFarmaco("Ana Júlia de Souza", new Date(2026, 8, 19))).toBe("ana-julia-de-souza-farmaco-nutrientes-2026-09-19.pdf");
  });
});
