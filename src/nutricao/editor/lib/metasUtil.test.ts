// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/metasUtil.test.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { describe, expect, it } from "vitest";
import {
  ATALHOS_DIAS, DIAS_SEMANA, FIM_DE_SEMANA, MODELOS_PADRAO, SEG_A_SEX, TODOS_OS_DIAS, alternarDia, atalhoDosDias, contarAtivas, diasParaAttr, filtrarMetas,
  formInicialMeta, formParaRegistroMeta, formatarDataMeta, inserirMeta, mesmosDias, metaParaForm, modeloInicial, nomeArquivoPDFMetas, normalizarDescricao,
  normalizarDias, ordenarMetas, ordenarModelosMeta, textoContagemMetas, textoDias, textoInicio, textoPausadas, validarMeta, validarModeloMeta, type FormMeta,
} from "./metasUtil";

const hoje = new Date(2026, 8, 19, 10, 0, 0); // 19/09/2026

describe("dias da semana", () => {
  it("7 dias ISO, segunda a domingo, com curto e nome", () => {
    expect(DIAS_SEMANA.map((d) => d.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(DIAS_SEMANA.map((d) => d.curto)).toEqual(["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]);
    expect(DIAS_SEMANA[0].nome).toBe("Segunda-feira");
    expect(DIAS_SEMANA[6].nome).toBe("Domingo");
  });
  it("atalhos: todos, Seg a Sex, fim de semana", () => {
    expect(ATALHOS_DIAS.map((a) => a.atalho)).toEqual(["todos", "semana", "fim"]);
    expect(TODOS_OS_DIAS).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(SEG_A_SEX).toEqual([1, 2, 3, 4, 5]);
    expect(FIM_DE_SEMANA).toEqual([6, 7]);
  });
  it("normalizarDias: únicos, 1..7, ordenados; lixo vira []", () => {
    expect(normalizarDias([5, 1, 3, 1, "7", 0, 8, 2.7, null])).toEqual([1, 2, 3, 5, 7]);
    expect(normalizarDias(null)).toEqual([]);
    expect(normalizarDias("1,2")).toEqual([]);
    expect(mesmosDias([7, 1], [1, 7, 7])).toBe(true);
    expect(mesmosDias([1], [1, 2])).toBe(false);
    expect(diasParaAttr([3, 1, 5])).toBe("1,3,5");
  });
  it("textoDias", () => {
    expect(textoDias([1, 2, 3, 4, 5, 6, 7])).toBe("Todos os dias");
    expect(textoDias([1, 2, 3, 4, 5])).toBe("Seg a Sex");
    expect(textoDias([6, 7])).toBe("Fim de semana");
    expect(textoDias([1, 3, 5])).toBe("Seg, Qua e Sex");
    expect(textoDias([5, 1, 2, 4])).toBe("Seg, Ter, Qui e Sex");
    expect(textoDias([2])).toBe("Ter");
    expect(textoDias([1, 7])).toBe("Seg e Dom");
    expect(textoDias([])).toBe("Nenhum dia");
    expect(textoDias(undefined)).toBe("Nenhum dia");
  });
  it("alternarDia liga/desliga e mantém a ordem", () => {
    expect(alternarDia([1, 3, 5], 3)).toEqual([1, 5]);
    expect(alternarDia([1, 5], 3)).toEqual([1, 3, 5]);
    expect(alternarDia([], 7)).toEqual([7]);
    expect(alternarDia([7], 7)).toEqual([]);
  });
  it("atalhoDosDias acha o atalho exato", () => {
    expect(atalhoDosDias([1, 2, 3, 4, 5, 6, 7])).toBe("todos");
    expect(atalhoDosDias([5, 4, 3, 2, 1])).toBe("semana");
    expect(atalhoDosDias([7, 6])).toBe("fim");
    expect(atalhoDosDias([1, 3, 5])).toBeNull();
    expect(atalhoDosDias([])).toBeNull();
  });
});

describe("validação", () => {
  it("validarMeta: título 2–120, descrição ≤ 1000, pelo menos 1 dia", () => {
    expect(validarMeta("Beber água", "", [1])).toBeNull();
    expect(validarMeta("A", "", [1])).toMatch(/título/i);
    expect(validarMeta("  ", "", [1])).toMatch(/título/i);
    expect(validarMeta("x".repeat(121), "", [1])).toBe("Título muito longo");
    expect(validarMeta("Beber água", "d".repeat(1001), [1])).toBe("Descrição muito longa");
    expect(validarMeta("Beber água", "", [])).toMatch(/1 dia/);
    expect(validarMeta("Beber água", "", [9])).toMatch(/1 dia/);
  });
  it("validarModeloMeta fala do modelo", () => {
    expect(validarModeloMeta("", "", [1])).toMatch(/modelo/);
    expect(validarModeloMeta("Meta", "", [1, 2])).toBeNull();
  });
});

describe("ordenação, filtro e contagem", () => {
  const metas = [
    { id: "a", ativa: true, created_at: "2026-09-19T10:00:00Z" },
    { id: "b", ativa: false, created_at: "2026-09-19T12:00:00Z" },
    { id: "c", ativa: true, created_at: "2026-09-19T11:00:00Z" },
  ];
  it("ordenarMetas: ativas primeiro, depois a mais recente", () => {
    expect(ordenarMetas(metas).map((m) => m.id)).toEqual(["c", "a", "b"]);
  });
  it("inserirMeta substitui pelo id ou acrescenta, já ordenado", () => {
    expect(inserirMeta(metas, { id: "b", ativa: true, created_at: "2026-09-19T12:00:00Z" }).map((m) => m.id)).toEqual(["b", "c", "a"]);
    expect(inserirMeta(metas, { id: "d", ativa: false, created_at: "2026-09-18T12:00:00Z" }).map((m) => m.id)).toEqual(["c", "a", "b", "d"]);
  });
  it("filtrarMetas esconde as pausadas por padrão", () => {
    expect(filtrarMetas(metas, false).map((m) => m.id)).toEqual(["a", "c"]);
    expect(filtrarMetas(metas, true)).toHaveLength(3);
    expect(contarAtivas(metas)).toBe(2);
  });
  it("textoContagemMetas / textoPausadas", () => {
    expect(textoContagemMetas(0, 0)).toBe("Nenhuma meta");
    expect(textoContagemMetas(1, 1)).toBe("1 meta · 1 ativa");
    expect(textoContagemMetas(2, 1)).toBe("2 metas · 1 ativa");
    expect(textoContagemMetas(3, 2)).toBe("3 metas · 2 ativas");
    expect(textoContagemMetas(2, 0)).toBe("2 metas · nenhuma ativa");
    expect(textoPausadas(0)).toBe("nenhuma pausada");
    expect(textoPausadas(1)).toBe("1 pausada");
    expect(textoPausadas(2)).toBe("2 pausadas");
  });
});

describe("modelos", () => {
  it("5 modelos padrão com título, descrição e dias válidos", () => {
    expect(MODELOS_PADRAO).toHaveLength(5);
    expect(MODELOS_PADRAO.map((m) => m.titulo)).toEqual([
      "Beber 2 litros de água", "Caminhar 30 minutos", "Dormir de 7 a 8 horas", "Comer 3 porções de frutas", "Sem refrigerante e doces",
    ]);
    for (const m of MODELOS_PADRAO) {
      expect(m.descricao.length).toBeGreaterThan(20);
      expect(validarMeta(m.titulo, m.descricao, m.dias_semana)).toBeNull();
      expect(normalizarDias(m.dias_semana)).toEqual(m.dias_semana);
    }
    expect(textoDias(MODELOS_PADRAO[1].dias_semana)).toBe("Seg, Qua e Sex");
    expect(textoDias(MODELOS_PADRAO[4].dias_semana)).toBe("Seg a Sex");
  });
  it("ordenarModelosMeta: favoritos primeiro, depois alfabético; modeloInicial = o 1º", () => {
    const lista = [
      { id: "1", favorito: false, titulo: "Zebra" },
      { id: "2", favorito: true, titulo: "Comer frutas" },
      { id: "3", favorito: true, titulo: "Água" },
      { id: "4", favorito: false, titulo: "Andar" },
    ];
    expect(ordenarModelosMeta(lista).map((m) => m.id)).toEqual(["3", "2", "4", "1"]);
    expect(modeloInicial(lista)?.id).toBe("3");
    expect(modeloInicial([])).toBeNull();
  });
});

describe("formulário ⇄ registro", () => {
  it("formInicialMeta copia o modelo; em branco = todos os dias", () => {
    const f = formInicialMeta({ id: "m1", titulo: "Caminhar", descricao: "30 min", dias_semana: [5, 1, 3] });
    expect(f).toEqual({ modeloId: "m1", titulo: "Caminhar", descricao: "30 min", dias: [1, 3, 5], ativa: true, salvarComoModelo: false });
    const b = formInicialMeta(null);
    expect(b.modeloId).toBe("");
    expect(b.titulo).toBe("");
    expect(b.dias).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(b.ativa).toBe(true);
  });
  it("metaParaForm lê a meta gravada", () => {
    expect(metaParaForm({ titulo: "Dormir", descricao: null, dias_semana: [7, 6], ativa: false })).toEqual({
      modeloId: "", titulo: "Dormir", descricao: "", dias: [6, 7], ativa: false, salvarComoModelo: false,
    });
  });
  it("formParaRegistroMeta normaliza título, descrição e dias", () => {
    const f: FormMeta = { modeloId: "", titulo: "  Beber   água  ", descricao: "linha 1  \r\n\r\nlinha 2 \n", dias: [3, 1, 1], ativa: true, salvarComoModelo: true };
    expect(formParaRegistroMeta(f)).toEqual({ modelo_id: null, titulo: "Beber água", descricao: "linha 1\n\nlinha 2", dias_semana: [1, 3], ativa: true });
    expect(formParaRegistroMeta({ ...f, modeloId: "m1", ativa: false }).modelo_id).toBe("m1");
    expect(formParaRegistroMeta({ ...f, ativa: false }).ativa).toBe(false);
    expect(normalizarDescricao(null)).toBe("");
  });
});

describe("datas e PDF", () => {
  it("formatarDataMeta / textoInicio usam parseISO", () => {
    expect(formatarDataMeta("2026-09-19")).toBe("19/09/2026");
    expect(formatarDataMeta("")).toBe("—");
    expect(textoInicio("2026-09-01")).toBe("desde 01/09/2026");
    expect(textoInicio(null)).toBe("");
  });
  it("nomeArquivoPDFMetas", () => {
    expect(nomeArquivoPDFMetas("Maria José da Silva", hoje)).toBe("metas-maria-jose-da-silva-20260919.pdf");
    expect(nomeArquivoPDFMetas("", hoje)).toBe("metas-paciente-20260919.pdf");
  });
});
