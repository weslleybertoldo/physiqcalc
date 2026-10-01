import { describe, expect, it } from "vitest";
// Physiq W21 — porta dos testes de src/lib/preconsultaUtil.test.ts do PhysiqNutri (main 294887a) + o que mudou no Physiq (link no
// domínio do ambiente, origens por papel, resumo sem a situação — o chip mostra).
import { QUESTIONARIOS_PADRAO, lerPerguntas, pontuacaoMaxima, type Pergunta } from "@/nutricao/prontuario/lib/questionariosUtil";
import {
  ORIGENS, SLUG_ALFABETO, SLUG_TAMANHO, agruparPorOrigem, caminhoPublico, copiaDeFormulario, formParaRegistroFormulario, formularioDeAnamnese, formularioDeQuestionario, formularioEmBranco,
  formularioParaForm, gerarSlug, lerOrigem, mensagemErroRpc, normalizarSlug, ordenarFormularios, perguntaTextoVazia, perguntasDeAnamnese, resumoFormulario, slugValido, temResultado,
  origensPara, textoAtivo, textoContagemFormularios, textoGrupoOrigem, textoOrigem, textoResultadoPublico, urlPublica, validarFormulario, validarRespostaPublica,
} from "./preconsultaUtil";
import { origemDoLink } from "./link";

const disbiose = QUESTIONARIOS_PADRAO[0];
const modeloAnamnese = { id: "m1", titulo: "Anamnese geral (padrão)", perguntas: ["Qual é o seu objetivo?", " Tem alguma  alergia? ", "", 42, { texto: "Usa medicamentos?" }] };
const P = (extra: Partial<Pergunta>): Pergunta => ({ id: "p1", texto: "Pergunta", tipo: "escala", max: 4, pontos_sim: 1, opcoes: [], ...extra });

describe("origem", () => {
  it("lerOrigem/textoOrigem/textoGrupoOrigem", () => {
    expect(ORIGENS.map((o) => o.valor)).toEqual(["anamnese", "questionario", "personalizado"]);
    expect(lerOrigem("anamnese")).toBe("anamnese");
    expect(lerOrigem("lixo")).toBe("personalizado");
    expect(textoOrigem("anamnese")).toBe("Pré-anamnese");
    expect(textoOrigem("questionario")).toBe("Questionário de saúde");
    expect(textoOrigem("personalizado")).toBe("Personalizado");
    expect(ORIGENS.find((o) => o.valor === "personalizado")?.rotulo).toBe("Em branco");
    expect(textoGrupoOrigem("questionario")).toBe("Questionários de saúde");
    expect(textoGrupoOrigem("personalizado")).toBe("Personalizados");
  });
});

describe("slug e link", () => {
  it("gerarSlug: 8 chars do alfabeto sem 0/o/1/l; aleatório injetável", () => {
    expect(SLUG_ALFABETO).not.toMatch(/[0o1l]/);
    expect(gerarSlug(SLUG_TAMANHO, () => 0)).toBe("aaaaaaaa");
    expect(gerarSlug(SLUG_TAMANHO, () => 0.999999)).toBe("99999999");
    const s = gerarSlug();
    expect(s).toHaveLength(8);
    expect(slugValido(s)).toBe(true);
    expect(gerarSlug()).not.toBe(gerarSlug());
  });
  it("slugValido/normalizarSlug/caminhoPublico/urlPublica", () => {
    expect(slugValido("abcd2345")).toBe(true);
    expect(slugValido(" ABCD2345 ")).toBe(true);
    expect(slugValido("abcd0345")).toBe(false);
    expect(slugValido("abc")).toBe(false);
    expect(normalizarSlug(" XyZ ")).toBe("xyz");
    expect(caminhoPublico("abcd2345")).toBe("/f/abcd2345");
    expect(urlPublica("abcd2345", "https://physiqcalc.com.br")).toBe("https://physiqcalc.com.br/f/abcd2345");
    expect(urlPublica(" ABCD2345 ", "https://physiqcalc-staging.vercel.app/")).toBe("https://physiqcalc-staging.vercel.app/f/abcd2345");
  });
});

describe("perguntas de anamnese", () => {
  it("cada texto vira pergunta de texto com id p<n>; ignora vazio e número; aceita objeto com texto", () => {
    const ps = perguntasDeAnamnese(modeloAnamnese.perguntas);
    expect(ps.map((p) => [p.id, p.texto, p.tipo])).toEqual([["p1", "Qual é o seu objetivo?", "texto"], ["p2", "Tem alguma alergia?", "texto"], ["p3", "Usa medicamentos?", "texto"]]);
    expect(perguntasDeAnamnese(null)).toEqual([]);
    expect(perguntaTextoVazia().tipo).toBe("texto");
  });
});

describe("formulário ⇄ registro", () => {
  it("formularioEmBranco: personalizado, 1 linha, sem faixas, ativo", () => {
    const f = formularioEmBranco();
    expect(f.origem).toBe("personalizado");
    expect(f.perguntas).toHaveLength(1);
    expect(f.faixas).toEqual([]);
    expect(f.ativo).toBe(true);
    expect(f.origemId).toBeNull();
  });
  it("formularioDeAnamnese: título do modelo, perguntas em texto, sem faixas", () => {
    const f = formularioDeAnamnese(modeloAnamnese);
    expect(f.origem).toBe("anamnese");
    expect(f.origemId).toBe("m1");
    expect(f.titulo).toBe("Anamnese geral (padrão)");
    expect(f.perguntas.map((p) => p.tipo)).toEqual(["texto", "texto", "texto"]);
    expect(f.faixas).toEqual([]);
    expect(formularioDeAnamnese({ id: "m2", titulo: "Vazio", perguntas: [] }).perguntas[0].tipo).toBe("texto");
  });
  it("formularioDeQuestionario: perguntas e as 3 faixas copiadas", () => {
    const f = formularioDeQuestionario({ id: "q1", titulo: disbiose.titulo, descricao: disbiose.descricao, perguntas: disbiose.perguntas, faixas: disbiose.faixas });
    expect(f.origem).toBe("questionario");
    expect(f.origemId).toBe("q1");
    expect(f.perguntas).toHaveLength(10);
    expect(f.perguntas[0]).toEqual({ texto: disbiose.perguntas[0].texto, tipo: "escala", max: "4", pontosSim: "1", opcoes: "" });
    expect(f.faixas.map((x) => [x.min, x.max, x.rotulo, x.nivel])).toEqual([["0", "10", "Baixa suspeita", "baixo"], ["11", "20", "Suspeita moderada", "moderado"], ["21", "40", "Alta suspeita", "alto"]]);
  });
  it("formParaRegistroFormulario: normaliza; faixas só na origem questionario", () => {
    const fq = formularioDeQuestionario({ id: "q1", titulo: "  Disbiose   intestinal ", descricao: "d", perguntas: disbiose.perguntas, faixas: disbiose.faixas });
    const rq = formParaRegistroFormulario({ ...fq, ativo: false });
    expect(rq.titulo).toBe("Disbiose intestinal");
    expect(rq.origem).toBe("questionario");
    expect(rq.origem_id).toBe("q1");
    expect(rq.perguntas.map((p) => p.id)).toEqual(disbiose.perguntas.map((p) => p.id));
    expect(rq.faixas).toEqual(disbiose.faixas);
    expect(rq.ativo).toBe(false);
    const fp = { ...formularioEmBranco(), titulo: "Meu form", perguntas: [{ texto: "Já fez dieta?", tipo: "sim_nao" as const, max: "4", pontosSim: "2", opcoes: "" }, { texto: "Objetivo", tipo: "texto" as const, max: "4", pontosSim: "1", opcoes: "" }] };
    const rp = formParaRegistroFormulario(fp);
    expect(rp.faixas).toEqual([]);
    expect(rp.perguntas).toEqual([P({ id: "p1", texto: "Já fez dieta?", tipo: "sim_nao", pontos_sim: 2 }), P({ id: "p2", texto: "Objetivo", tipo: "texto" })]);
  });
  it("formularioParaForm: lê o registro (origem inválida vira personalizado; anamnese vazia = linha de texto)", () => {
    const f = formularioParaForm({ titulo: "T", descricao: null, origem: "questionario", origem_id: null, perguntas: disbiose.perguntas, faixas: disbiose.faixas, ativo: false });
    expect(f.faixas).toHaveLength(3);
    expect(f.ativo).toBe(false);
    expect(f.descricao).toBe("");
    const g = formularioParaForm({ titulo: "T", descricao: "", origem: "xx", origem_id: "z", perguntas: disbiose.perguntas, faixas: disbiose.faixas, ativo: true });
    expect(g.origem).toBe("personalizado");
    expect(g.faixas).toEqual([]);
    const h = formularioParaForm({ titulo: "T", descricao: "", origem: "anamnese", origem_id: null, perguntas: [], faixas: [], ativo: true });
    expect(h.perguntas[0].tipo).toBe("texto");
  });
  it("copiaDeFormulario: '(cópia)', mesma origem/perguntas/faixas, ativa", () => {
    const c = copiaDeFormulario({ titulo: "Disbiose", descricao: "d", origem: "questionario", origem_id: "q1", perguntas: disbiose.perguntas, faixas: disbiose.faixas });
    expect(c.titulo).toBe("Disbiose (cópia)");
    expect(c.origem).toBe("questionario");
    expect(c.perguntas).toHaveLength(10);
    expect(c.faixas).toEqual(disbiose.faixas);
    expect(c.ativo).toBe(true);
    expect(copiaDeFormulario({ titulo: "X", descricao: null, origem: "personalizado", origem_id: null, perguntas: [], faixas: disbiose.faixas }).faixas).toEqual([]);
  });
});

describe("validações", () => {
  const base = formularioDeQuestionario({ id: "q1", titulo: disbiose.titulo, descricao: "", perguntas: disbiose.perguntas, faixas: disbiose.faixas });
  it("validarFormulario: título, perguntas (regras da W19) e faixas só no questionário", () => {
    expect(validarFormulario(base)).toBeNull();
    expect(validarFormulario({ ...base, titulo: "S" })).toMatch(/título ao formulário/);
    expect(validarFormulario({ ...base, perguntas: [] })).toMatch(/pelo menos 1 pergunta/);
    expect(validarFormulario({ ...base, perguntas: [{ ...base.perguntas[0], texto: "" }] })).toMatch(/Pergunta 1/);
    expect(validarFormulario({ ...base, faixas: [] })).toMatch(/3 faixas/);
    expect(validarFormulario({ ...base, origem: "personalizado", faixas: [] })).toBeNull();
    expect(validarFormulario({ ...formularioEmBranco(), titulo: "Ok", perguntas: [{ texto: "Dieta?", tipo: "multipla", max: "4", pontosSim: "1", opcoes: "Sim=1" }] })).toMatch(/2 a 10 opções/);
  });
  it("validarRespostaPublica: nome, e-mail, telefone, ≥ 1 resposta", () => {
    const ps = lerPerguntas(disbiose.perguntas);
    expect(validarRespostaPublica("", "", "", ps, {})).toMatch(/seu nome/);
    expect(validarRespostaPublica("Fulana", "sem-arroba", "", ps, { p1: 4 })).toBe("E-mail inválido");
    expect(validarRespostaPublica("Fulana", "", "1".repeat(31), ps, { p1: 4 })).toBe("Telefone muito longo");
    expect(validarRespostaPublica("Fulana", "", "", [], { p1: 4 })).toMatch(/sem perguntas/);
    expect(validarRespostaPublica("Fulana", "", "", ps, {})).toMatch(/pelo menos 1/);
    expect(validarRespostaPublica("Fulana", "", "", ps, { p1: "4" })).toMatch(/pelo menos 1/);
    expect(validarRespostaPublica("Fulana", "f@x.com", "11 99999-0000", ps, { p1: 4 })).toBeNull();
  });
  it("mensagemErroRpc traduz os códigos da RPC", () => {
    expect(mensagemErroRpc(new Error("formulario_nao_encontrado"))).toMatch(/não encontrado/);
    expect(mensagemErroRpc({ message: "sem_respostas" })).toMatch(/pelo menos 1/);
    expect(mensagemErroRpc("muitas_respostas")).toMatch(/muitas respostas/);
    expect(mensagemErroRpc(new Error("nome_invalido"))).toMatch(/nome/);
    expect(mensagemErroRpc(new Error("TypeError: Failed to fetch"))).toMatch(/conexão/);
    expect(mensagemErroRpc(null)).toMatch(/Não foi possível/);
  });
});

describe("resultado público e listas", () => {
  it("temResultado/textoResultadoPublico", () => {
    expect(temResultado([])).toBe(false);
    expect(temResultado(disbiose.faixas)).toBe(true);
    expect(textoResultadoPublico({ pontuacao: 13, faixa: "Suspeita moderada", nivel: "moderado" }, pontuacaoMaxima(lerPerguntas(disbiose.perguntas)))).toBe("13/40 pontos · Suspeita moderada");
    expect(textoResultadoPublico({ pontuacao: 2, faixa: "", nivel: "" }, 2)).toBe("2/2 pontos");
  });
  it("ordenarFormularios (ativos → inativos, alfabético) e agruparPorOrigem (só grupos com itens, na ordem)", () => {
    const lista = [
      { titulo: "Zeta", ativo: true, origem: "personalizado" },
      { titulo: "Alfa", ativo: false, origem: "personalizado" },
      { titulo: "Beta", ativo: true, origem: "questionario" },
      { titulo: "Ana", ativo: true, origem: "personalizado" },
    ];
    expect(ordenarFormularios(lista).map((f) => f.titulo)).toEqual(["Ana", "Beta", "Zeta", "Alfa"]);
    const grupos = agruparPorOrigem(lista);
    expect(grupos.map((g) => [g.origem, g.rotulo, g.itens.map((i) => i.titulo)])).toEqual([
      ["questionario", "Questionários de saúde", ["Beta"]],
      ["personalizado", "Personalizados", ["Ana", "Zeta", "Alfa"]],
    ]);
  });
  it("contagens e resumo", () => {
    expect(textoContagemFormularios(0)).toBe("Nenhum formulário");
    expect(textoContagemFormularios(1)).toBe("1 formulário");
    expect(textoContagemFormularios(3)).toBe("3 formulários");
    expect(textoAtivo(true)).toBe("Ativo");
    expect(resumoFormulario({ perguntas: disbiose.perguntas, slug: "abcd2345" })).toBe("10 perguntas · /f/abcd2345");
  });
});

describe("W21 — Physiq: origens por papel e o link do ambiente", () => {
  it("origensPara: a nutricionista (com Nutrição) monta das 3 origens; o personal e o dono sem nutri, só em branco", () => {
    expect(origensPara(true)).toEqual(["anamnese", "questionario", "personalizado"]);
    expect(origensPara(false)).toEqual(["personalizado"]);
  });
  it("origemDoLink: no dev local vale a própria origem; fora dele (produção, staging, APK) o site do ambiente — nunca o https://localhost do APK", () => {
    expect(origemDoLink(true, "http://localhost:5173")).toBe("http://localhost:5173");
    expect(origemDoLink(true, "http://127.0.0.1:8080")).toBe("http://127.0.0.1:8080");
    const site = origemDoLink(false, "https://localhost");
    expect(["https://physiqcalc.com.br", "https://physiqcalc-staging.vercel.app"]).toContain(site);
    expect(origemDoLink(false, "http://localhost:5173")).toBe(site);
    expect(origemDoLink(true, "https://www.physiqcalc.com.br")).toBe(site);
  });
});
