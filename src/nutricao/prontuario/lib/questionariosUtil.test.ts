// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/questionariosUtil.test.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { describe, expect, it } from "vitest";
import {
  PERGUNTAS_MAX, QUESTIONARIOS_PADRAO, adicionarPergunta, aplicacaoParaForm, atualizarPergunta, calcularResultado, contarRespondidas, copiaDeQuestionario, dataValida, ehDoSistema,
  faixaDaPontuacao, faixasParaForm, faixasSugeridas, filtrarPorQuestionario, formInicialAplicacao, formParaPergunta, formParaRegistroAplicacao, formParaRegistroQuestionario,
  formQuestionarioVazio, formatarDataQuestionario, formatarPontos, inserirAplicacao, lerFaixas, lerPerguntas, lerRespostas, moverPergunta, nomeArquivoPDFQuestionario,
  normalizarNumero, normalizarPerguntas, normalizarRespostas, opcoesDeTexto, ordenarAplicacoes, ordenarQuestionarios, perguntaParaForm, perguntaVazia, pontuacaoMaxima,
  pontuacaoMaximaForm, pontuar, pontuarPergunta, questionarioParaForm, recalcularAplicacao, removerPergunta, respondida, textoContagemAplicacoes, textoContagemQuestionarios,
  textoDeOpcoes, textoNivel, textoPontuacao, textoResposta, textoRespondidas, titulosAplicados, validarAplicacao, validarQuestionario, type FormFaixa, type FormPergunta, type Pergunta,
} from "./questionariosUtil";

const hoje = new Date(2026, 8, 19, 10, 0, 0); // 19/09/2026
const disbiose = QUESTIONARIOS_PADRAO[0];
const cafeina = QUESTIONARIOS_PADRAO[3];
const P = (extra: Partial<Pergunta>): Pergunta => ({ id: "p1", texto: "Pergunta", tipo: "escala", max: 4, pontos_sim: 1, opcoes: [], ...extra });
const faixasOk: FormFaixa[] = [
  { min: "0", max: "1", rotulo: "Baixo", nivel: "baixo" },
  { min: "2", max: "2", rotulo: "Moderado", nivel: "moderado" },
  { min: "3", max: "4", rotulo: "Alto", nivel: "alto" },
];

describe("números e níveis", () => {
  it("normalizarNumero aceita vírgula ou ponto; formatarPontos usa vírgula", () => {
    expect(normalizarNumero("2,5")).toBe(2.5);
    expect(normalizarNumero(" 3 ")).toBe(3);
    expect(normalizarNumero("abc")).toBeNull();
    expect(normalizarNumero("")).toBeNull();
    expect(formatarPontos(22)).toBe("22");
    expect(formatarPontos(0.5)).toBe("0,5");
    expect(formatarPontos(null)).toBe("0");
  });
  it("textoNivel", () => {
    expect(textoNivel("baixo")).toBe("Baixo");
    expect(textoNivel("moderado")).toBe("Moderado");
    expect(textoNivel("alto")).toBe("Alto");
    expect(textoNivel("")).toBe("Sem faixa");
  });
});

describe("perguntas (jsonb tolerante)", () => {
  it("lerPerguntas completa os campos do tipo, garante id e ignora lixo", () => {
    const lidas = lerPerguntas([
      { id: "p1", texto: "A?", tipo: "escala" },
      { texto: "B?", tipo: "sim_nao", pontos_sim: 3 },
      { id: "p1", texto: "C?", tipo: "multipla", opcoes: [{ texto: "x", pontos: 1 }, { texto: "", pontos: 9 }, { texto: "y", pontos: "2,5" }] },
      { id: "p9", texto: "   ", tipo: "texto" },
      "lixo",
      { id: "p5", texto: "E?", tipo: "invalido", max: 99 },
    ]);
    expect(lidas.map((p) => p.id)).toEqual(["p1", "p2", "p3", "p5"]);
    expect(lidas[0]).toEqual({ id: "p1", texto: "A?", tipo: "escala", max: 4, pontos_sim: 1, opcoes: [] });
    expect(lidas[1].pontos_sim).toBe(3);
    expect(lidas[2].opcoes).toEqual([{ texto: "x", pontos: 1 }, { texto: "y", pontos: 2.5 }]);
    expect(lidas[3].tipo).toBe("escala");
    expect(lidas[3].max).toBe(10);
    expect(lerPerguntas("nada")).toEqual([]);
    expect(lerPerguntas(null)).toEqual([]);
  });
  it("normalizarPerguntas renumera os ids, limita a 60 e tira opções fora da múltipla", () => {
    const muitas = Array.from({ length: 70 }, (_, i) => ({ id: `x${i}`, texto: `P${i}`, tipo: "escala", opcoes: [{ texto: "a", pontos: 1 }] }));
    const norm = normalizarPerguntas(muitas);
    expect(norm).toHaveLength(PERGUNTAS_MAX);
    expect(norm[0].id).toBe("p1");
    expect(norm[59].id).toBe("p60");
    expect(norm[0].opcoes).toEqual([]);
  });
});

describe("pontuação", () => {
  it("pontuarPergunta por tipo e respondida", () => {
    const escala = P({ tipo: "escala", max: 4 });
    const simNao = P({ tipo: "sim_nao", pontos_sim: 3 });
    const multipla = P({ tipo: "multipla", opcoes: [{ texto: "a", pontos: 0 }, { texto: "b", pontos: 2.5 }] });
    const texto = P({ tipo: "texto" });
    expect(pontuarPergunta(escala, 3)).toBe(3);
    expect(pontuarPergunta(escala, 9)).toBe(4);
    expect(pontuarPergunta(escala, undefined)).toBe(0);
    expect(pontuarPergunta(simNao, true)).toBe(3);
    expect(pontuarPergunta(simNao, false)).toBe(0);
    expect(pontuarPergunta(multipla, 1)).toBe(2.5);
    expect(pontuarPergunta(multipla, 5)).toBe(0);
    expect(pontuarPergunta(texto, "qualquer coisa")).toBe(0);
    expect(respondida(escala, 0)).toBe(true);
    expect(respondida(simNao, "sim")).toBe(false);
    expect(respondida(multipla, 1)).toBe(true);
    expect(respondida(multipla, 2)).toBe(false);
    expect(respondida(texto, "  ")).toBe(false);
  });
  it("pontuar, pontuacaoMaxima e contagens", () => {
    const perguntas = [P({ id: "p1", tipo: "escala", max: 4 }), P({ id: "p2", tipo: "sim_nao", pontos_sim: 3 }), P({ id: "p3", tipo: "multipla", opcoes: [{ texto: "a", pontos: 0 }, { texto: "b", pontos: 5 }] }), P({ id: "p4", tipo: "texto" })];
    const respostas = { p1: 2, p2: true, p3: 1, p4: "ok", p9: 100 };
    expect(pontuar(perguntas, respostas)).toBe(10);
    expect(pontuacaoMaxima(perguntas)).toBe(12);
    expect(contarRespondidas(perguntas, respostas)).toBe(4);
    expect(contarRespondidas(perguntas, {})).toBe(0);
    expect(textoRespondidas(3, 10)).toBe("3/10 respondidas");
    expect(textoPontuacao(22, 40)).toBe("22/40 pontos");
    expect(textoPontuacao(0.5, 2)).toBe("0,5/2 pontos");
  });
  it("textoResposta", () => {
    expect(textoResposta(P({ tipo: "escala" }), 3)).toBe("3");
    expect(textoResposta(P({ tipo: "sim_nao" }), true)).toBe("Sim");
    expect(textoResposta(P({ tipo: "sim_nao" }), false)).toBe("Não");
    expect(textoResposta(P({ tipo: "multipla", opcoes: [{ texto: "Nunca", pontos: 0 }] }), 0)).toBe("Nunca");
    expect(textoResposta(P({ tipo: "texto" }), " livre ")).toBe("livre");
    expect(textoResposta(P({ tipo: "escala" }), undefined)).toBe("—");
  });
  it("normalizarRespostas guarda só as respondidas no formato do tipo", () => {
    const perguntas = [P({ id: "p1", tipo: "escala", max: 4 }), P({ id: "p2", tipo: "texto" }), P({ id: "p3", tipo: "sim_nao" })];
    expect(normalizarRespostas(perguntas, { p1: 7.4, p2: "  oi  ", p3: "x", p9: 1 })).toEqual({ p1: 4, p2: "oi" });
    expect(lerRespostas({ a: 1, b: true, c: "x", d: null, e: [1] })).toEqual({ a: 1, b: true, c: "x" });
    expect(lerRespostas([1])).toEqual({});
  });
});

describe("faixas", () => {
  it("lerFaixas, faixaDaPontuacao e faixasSugeridas", () => {
    const faixas = lerFaixas([{ min: 0, max: 10, rotulo: "Baixa", nivel: "baixo" }, { min: 20, max: 11, rotulo: "", nivel: "moderado" }, { min: "21", max: "40", nivel: "errado" }, { min: null, max: 3 }, "x"]);
    expect(faixas).toEqual([
      { min: 0, max: 10, rotulo: "Baixa", nivel: "baixo" },
      { min: 11, max: 20, rotulo: "Moderado", nivel: "moderado" },
      { min: 21, max: 40, rotulo: "Baixo", nivel: "baixo" },
    ]);
    expect(faixaDaPontuacao(faixas, 10)).toEqual({ rotulo: "Baixa", nivel: "baixo" });
    expect(faixaDaPontuacao(faixas, 11)).toEqual({ rotulo: "Moderado", nivel: "moderado" });
    expect(faixaDaPontuacao(faixas, 41)).toBeNull();
    expect(faixasSugeridas(40)).toEqual([
      { min: 0, max: 13, rotulo: "Baixo", nivel: "baixo" },
      { min: 14, max: 26, rotulo: "Moderado", nivel: "moderado" },
      { min: 27, max: 40, rotulo: "Alto", nivel: "alto" },
    ]);
    expect(faixasSugeridas(4)).toEqual([
      { min: 0, max: 1, rotulo: "Baixo", nivel: "baixo" },
      { min: 2, max: 2, rotulo: "Moderado", nivel: "moderado" },
      { min: 3, max: 4, rotulo: "Alto", nivel: "alto" },
    ]);
  });
  it("faixasParaForm sempre devolve 3 linhas", () => {
    expect(faixasParaForm([], 4)).toHaveLength(3);
    expect(faixasParaForm([{ min: 0, max: 5, rotulo: "Ok", nivel: "baixo" }], 10)[0]).toEqual({ min: "0", max: "5", rotulo: "Ok", nivel: "baixo" });
    expect(faixasParaForm([{ min: 0, max: 5, rotulo: "Ok", nivel: "baixo" }], 10)[2].nivel).toBe("alto");
  });
  it("calcularResultado", () => {
    expect(calcularResultado(disbiose.perguntas, disbiose.faixas, { p1: 4, p2: 2, p3: 2, p4: 2, p5: 2, p6: 2, p7: 2, p8: 2, p9: 2, p10: 2 })).toEqual({ pontuacao: 22, faixa: "Alta suspeita", nivel: "alto" });
    expect(calcularResultado(disbiose.perguntas, [], { p1: 4 })).toEqual({ pontuacao: 4, faixa: "", nivel: "" });
  });
});

describe("questionários do sistema", () => {
  it("4 questionários com 8–10 perguntas, 3 faixas contíguas cobrindo a pontuação máxima", () => {
    expect(QUESTIONARIOS_PADRAO.map((q) => q.codigo)).toEqual(["sistema:disbiose", "sistema:rastreamento", "sistema:frequencia", "sistema:cafeina"]);
    for (const q of QUESTIONARIOS_PADRAO) {
      expect(q.perguntas.length).toBeGreaterThanOrEqual(8);
      expect(q.perguntas.length).toBeLessThanOrEqual(10);
      expect(q.perguntas.map((p) => p.id)).toEqual(q.perguntas.map((_, i) => `p${i + 1}`));
      expect(q.faixas).toHaveLength(3);
      expect(q.faixas.map((f) => f.nivel)).toEqual(["baixo", "moderado", "alto"]);
      expect(q.faixas[0].min).toBe(0);
      expect(q.faixas[1].min).toBe(q.faixas[0].max + 1);
      expect(q.faixas[2].min).toBe(q.faixas[1].max + 1);
      expect(q.faixas[2].max).toBeGreaterThanOrEqual(pontuacaoMaxima(q.perguntas));
      expect(lerPerguntas(q.perguntas)).toEqual(q.perguntas);
    }
    expect(pontuacaoMaxima(disbiose.perguntas)).toBe(40);
    expect(pontuacaoMaxima(QUESTIONARIOS_PADRAO[1].perguntas)).toBe(40);
    expect(pontuacaoMaxima(QUESTIONARIOS_PADRAO[2].perguntas)).toBe(40);
    expect(pontuacaoMaxima(cafeina.perguntas)).toBe(36);
  });
  it("frequência alimentar: protetores pontuam quando raros, de risco quando frequentes", () => {
    const freq = QUESTIONARIOS_PADRAO[2];
    expect(pontuarPergunta(freq.perguntas[0], 0)).toBe(4); // frutas nunca
    expect(pontuarPergunta(freq.perguntas[0], 3)).toBe(0); // frutas todo dia
    expect(pontuarPergunta(freq.perguntas[4], 0)).toBe(0); // ultraprocessados nunca
    expect(pontuarPergunta(freq.perguntas[4], 3)).toBe(4); // ultraprocessados todo dia
  });
});

describe("editor de perguntas", () => {
  it("adicionar/atualizar/remover/mover nunca fica sem linha", () => {
    const l1 = adicionarPergunta([perguntaVazia()]);
    expect(l1).toHaveLength(2);
    const l2 = atualizarPergunta(l1, 1, { texto: "Nova", tipo: "sim_nao", pontosSim: "3" });
    expect(l2[1].texto).toBe("Nova");
    expect(l2[0].texto).toBe("");
    const l3 = moverPergunta(l2, 1, -1);
    expect(l3[0].texto).toBe("Nova");
    expect(moverPergunta(l3, 0, -1)).toBe(l3);
    expect(moverPergunta(l3, 1, 1)).toBe(l3);
    expect(removerPergunta(l3, 0)[0].texto).toBe("");
    expect(removerPergunta([perguntaVazia()], 0)).toEqual([perguntaVazia()]);
    const cheio = Array.from({ length: PERGUNTAS_MAX }, perguntaVazia);
    expect(adicionarPergunta(cheio)).toHaveLength(PERGUNTAS_MAX);
  });
  it("opcoesDeTexto ⇄ textoDeOpcoes", () => {
    expect(opcoesDeTexto("Nunca=0\n1 a 2 vezes=1,5\n\nTodo dia = 4\nSem pontos")).toEqual([
      { texto: "Nunca", pontos: 0 },
      { texto: "1 a 2 vezes", pontos: 1.5 },
      { texto: "Todo dia", pontos: 4 },
      { texto: "Sem pontos", pontos: 0 },
    ]);
    expect(textoDeOpcoes([{ texto: "Nunca", pontos: 0 }, { texto: "Todo dia", pontos: 4 }])).toBe("Nunca=0\nTodo dia=4");
    expect(opcoesDeTexto(textoDeOpcoes(cafeina.perguntas[0].opcoes))).toEqual(cafeina.perguntas[0].opcoes);
  });
  it("formParaPergunta e perguntaParaForm", () => {
    const f: FormPergunta = { texto: "  Toma café?  ", tipo: "sim_nao", max: "9", pontosSim: "3", opcoes: "a=1\nb=2" };
    expect(formParaPergunta(f, 8)).toEqual({ id: "p9", texto: "Toma café?", tipo: "sim_nao", max: 4, pontos_sim: 3, opcoes: [] });
    expect(formParaPergunta({ ...f, tipo: "multipla" }, 0).opcoes).toEqual([{ texto: "a", pontos: 1 }, { texto: "b", pontos: 2 }]);
    expect(formParaPergunta({ ...f, tipo: "escala", max: "7,2" }, 0).max).toBe(7);
    expect(perguntaParaForm(cafeina.perguntas[0])).toEqual({ texto: cafeina.perguntas[0].texto, tipo: "multipla", max: "4", pontosSim: "1", opcoes: "Não tomo=0\n1 a 2=1\n3 a 4=3\n5 ou mais=5" });
    expect(pontuacaoMaximaForm([f, { ...f, tipo: "escala", max: "5" }])).toBe(8);
  });
});

describe("validação", () => {
  it("validarQuestionario", () => {
    const ok: FormPergunta[] = [{ texto: "A?", tipo: "escala", max: "4", pontosSim: "1", opcoes: "" }];
    expect(validarQuestionario("Meu questionário", ok, faixasOk)).toBeNull();
    expect(validarQuestionario("M", ok, faixasOk)).toMatch(/título/i);
    expect(validarQuestionario("x".repeat(121), ok, faixasOk)).toMatch(/longo/i);
    expect(validarQuestionario("Ok", [], faixasOk)).toMatch(/1 pergunta/);
    expect(validarQuestionario("Ok", [{ ...ok[0], texto: " " }], faixasOk)).toMatch(/Pergunta 1: escreva/);
    expect(validarQuestionario("Ok", [{ ...ok[0], max: "11" }], faixasOk)).toMatch(/1 a 10/);
    expect(validarQuestionario("Ok", [{ ...ok[0], tipo: "sim_nao", pontosSim: "-1" }], faixasOk)).toMatch(/sim/);
    expect(validarQuestionario("Ok", [{ ...ok[0], tipo: "multipla", opcoes: "só uma=1" }], faixasOk)).toMatch(/2 a 10 opções/);
    expect(validarQuestionario("Ok", ok, faixasOk.slice(0, 2))).toMatch(/3 faixas/);
    expect(validarQuestionario("Ok", ok, [{ ...faixasOk[0], min: "5", max: "1" }, faixasOk[1], faixasOk[2]])).toMatch(/Faixa 1/);
    expect(validarQuestionario("Ok", ok, [{ ...faixasOk[0], min: "x" }, faixasOk[1], faixasOk[2]])).toMatch(/números/);
  });
  it("validarAplicacao", () => {
    expect(validarAplicacao("2026-09-19", disbiose.perguntas, { p1: 4 })).toBeNull();
    expect(validarAplicacao("", disbiose.perguntas, { p1: 4 })).toMatch(/data/i);
    expect(validarAplicacao("2026-09-19", [], { p1: 4 })).toMatch(/questionário/i);
    expect(validarAplicacao("2026-09-19", disbiose.perguntas, {})).toMatch(/pelo menos 1/);
  });
});

describe("listas", () => {
  it("ordenarQuestionarios: favoritos → próprios → sistema, alfabético dentro", () => {
    const lista = [
      { titulo: "Zeta", nutricionista_id: null, favorito: false },
      { titulo: "Beta", nutricionista_id: "n1", favorito: false },
      { titulo: "Alfa", nutricionista_id: null, favorito: false },
      { titulo: "Gama", nutricionista_id: "n1", favorito: true },
      { titulo: "Aba", nutricionista_id: "n1", favorito: false },
    ];
    expect(ordenarQuestionarios(lista).map((q) => q.titulo)).toEqual(["Gama", "Aba", "Beta", "Alfa", "Zeta"]);
    expect(ehDoSistema(lista[0])).toBe(true);
    expect(ehDoSistema(lista[1])).toBe(false);
    expect(textoContagemQuestionarios(0)).toBe("Nenhum questionário");
    expect(textoContagemQuestionarios(4)).toBe("4 questionários");
  });
  it("aplicações: ordem, inserir, filtro e títulos", () => {
    const a1 = { id: "1", titulo: "Disbiose intestinal", data: "2026-09-19", created_at: "2026-09-19T10:00:00Z" };
    const a2 = { id: "2", titulo: "Disbiose intestinal", data: "2026-09-18", created_at: "2026-09-19T11:00:00Z" };
    const a3 = { id: "3", titulo: "Consumo de cafeína", data: "2026-09-19", created_at: "2026-09-19T12:00:00Z" };
    expect(ordenarAplicacoes([a2, a1, a3]).map((a) => a.id)).toEqual(["3", "1", "2"]);
    expect(inserirAplicacao([a1, a2], { ...a1, data: "2026-09-17" }).map((a) => a.id)).toEqual(["2", "1"]);
    expect(filtrarPorQuestionario([a1, a2, a3], "disbiose INTESTINAL").map((a) => a.id)).toEqual(["1", "2"]);
    expect(filtrarPorQuestionario([a1, a2, a3], "")).toHaveLength(3);
    expect(titulosAplicados([a1, a2, a3])).toEqual(["Consumo de cafeína", "Disbiose intestinal"]);
    expect(textoContagemAplicacoes(0)).toBe("Nenhuma aplicação");
    expect(textoContagemAplicacoes(1)).toBe("1 aplicação");
    expect(textoContagemAplicacoes(3)).toBe("3 aplicações");
  });
});

describe("formulário ⇄ registro", () => {
  it("aplicação: copia título/perguntas/faixas e calcula o resultado; edição recalcula pela cópia", () => {
    const f = { ...formInicialAplicacao(hoje), questionarioId: "q1", respostas: { p1: 4, p2: 2, p3: 2, p4: 2, p5: 2, p6: 2, p7: 2, p8: 2, p9: 2, p10: 2, p99: 9 }, observacao: "  obs \n" };
    expect(f.data).toBe("2026-09-19");
    const reg = formParaRegistroAplicacao(f, { id: "q1", titulo: disbiose.titulo, perguntas: disbiose.perguntas, faixas: disbiose.faixas });
    expect(reg.questionario_id).toBe("q1");
    expect(reg.titulo).toBe("Disbiose intestinal");
    expect(reg.perguntas).toEqual(disbiose.perguntas);
    expect(reg.faixas).toEqual(disbiose.faixas);
    expect(reg.respostas.p99).toBeUndefined();
    expect(reg.pontuacao).toBe(22);
    expect(reg.faixa).toBe("Alta suspeita");
    expect(reg.nivel).toBe("alto");
    expect(reg.observacao).toBe("obs");
    expect(aplicacaoParaForm({ questionario_id: null, data: "2026-09-18", respostas: { p1: 1 }, observacao: null })).toEqual({ questionarioId: "", data: "2026-09-18", respostas: { p1: 1 }, observacao: "" });
    const re = recalcularAplicacao({ perguntas: disbiose.perguntas, faixas: disbiose.faixas }, { ...reg.respostas, p1: 0 });
    expect(re.pontuacao).toBe(18);
    expect(re.faixa).toBe("Suspeita moderada");
    expect(re.nivel).toBe("moderado");
    expect(re.respostas.p1).toBe(0);
  });
  it("questionário: vazio, para form, para registro e cópia", () => {
    const vazio = formQuestionarioVazio();
    expect(vazio.perguntas).toEqual([perguntaVazia()]);
    expect(vazio.faixas.map((f) => f.nivel)).toEqual(["baixo", "moderado", "alto"]);
    const form = questionarioParaForm({ titulo: cafeina.titulo, descricao: cafeina.descricao, perguntas: cafeina.perguntas, faixas: cafeina.faixas, favorito: false });
    expect(form.perguntas).toHaveLength(8);
    expect(form.faixas[2]).toEqual({ min: "13", max: "40", rotulo: "Consumo alto", nivel: "alto" });
    const reg = formParaRegistroQuestionario({ ...form, titulo: "  Smoke W19 Cafeína ", perguntas: [...form.perguntas, { texto: "Toma café depois das 18h?", tipo: "sim_nao", max: "4", pontosSim: "3", opcoes: "" }], favorito: true });
    expect(reg.titulo).toBe("Smoke W19 Cafeína");
    expect(reg.perguntas).toHaveLength(9);
    expect(reg.perguntas[8]).toEqual({ id: "p9", texto: "Toma café depois das 18h?", tipo: "sim_nao", max: 4, pontos_sim: 3, opcoes: [] });
    expect(reg.perguntas.slice(0, 8)).toEqual(cafeina.perguntas);
    expect(reg.faixas).toEqual(cafeina.faixas);
    expect(reg.favorito).toBe(true);
    const copia = copiaDeQuestionario({ titulo: cafeina.titulo, descricao: cafeina.descricao, perguntas: cafeina.perguntas, faixas: cafeina.faixas });
    expect(copia.titulo).toBe("Consumo de cafeína (cópia)");
    expect(copia.perguntas).toEqual(cafeina.perguntas);
    expect(copia.favorito).toBe(false);
  });
});

describe("datas e PDF", () => {
  it("dataValida, formatarDataQuestionario e nome do PDF", () => {
    expect(dataValida("2026-09-19")).toBe(true);
    expect(dataValida("2026-13-01")).toBe(false);
    expect(dataValida("")).toBe(false);
    expect(formatarDataQuestionario("2026-09-19")).toBe("19/09/2026");
    expect(formatarDataQuestionario("x")).toBe("—");
    expect(nomeArquivoPDFQuestionario("Smoke W19 Fulana 101010", "Disbiose intestinal", "2026-09-19")).toBe("questionario-smoke-w19-fulana-101010-disbiose-intestinal-20260919.pdf");
    expect(nomeArquivoPDFQuestionario("", "", hoje)).toBe("questionario-paciente-questionario-20260919.pdf");
  });
});
