import { describe, expect, it } from "vitest";
// Physiq W21 — porta dos testes de src/lib/respostasPreconsultaUtil.test.ts do PhysiqNutri (main 294887a) + o que mudou no Physiq
// (aluno no lugar de paciente, "novas" = sem aluno, ?aluno=, links do painel, quem importa).
import type { Pergunta } from "@/nutricao/prontuario/lib/questionariosUtil";
import {
  FILTROS_VAZIOS, anamneseDaResposta, aplicacaoDaResposta, chaveTexto, dadosAlunoDaResposta, ehNova, filtrosAtivos, filtrosDaURL,
  filtrosParaURL, iniciaisDe, linkAluno, linkImportada, motivoSemImportar, origemDaResposta, podeDesligar, podeImportar, pontosDaResposta,
  respostasDoMes, respostasPorFormulario, respostasPorSemana, situacaoFormulario, sugerirAluno, textoConfirmarImportar, textoContagemRespostas, textoImportada, textoSituacaoFormulario,
  textoSugestao, tipoImportacao, titulosFormularios, filtrosParaBanco, normalizarPaginaRespostas, type FormularioDaResposta, type RespostaBase,
} from "./respostasUtil";

const FORM_Q: FormularioDaResposta = { id: "f1", titulo: "Disbiose", origem: "questionario", origem_id: "q1", slug: "abcdefgh", ativo: true, deleted_at: null };
const FORM_A: FormularioDaResposta = { id: "f2", titulo: "Pré-anamnese", origem: "anamnese", origem_id: "m1", slug: "bcdefghj", ativo: false, deleted_at: null };
const PERG: Pergunta[] = [
  { id: "p1", texto: "Já fez dieta?", tipo: "sim_nao", max: 4, pontos_sim: 2, opcoes: [] },
  { id: "p2", texto: "Objetivo", tipo: "texto", max: 4, pontos_sim: 1, opcoes: [] },
  { id: "p3", texto: "Sono", tipo: "escala", max: 4, pontos_sim: 1, opcoes: [] },
];
const FAIXAS = [
  { min: 0, max: 2, rotulo: "Baixa", nivel: "baixo" },
  { min: 3, max: 4, rotulo: "Média", nivel: "moderado" },
  { min: 5, max: 10, rotulo: "Alta", nivel: "alto" },
];
// instante que cai em 19/09 em qualquer fuso entre UTC-15 e UTC+8 (o vitest pode rodar em UTC ou em America/Sao_Paulo)
const QUANDO = "2026-09-19T15:30:00.000+00:00";
const base = (extra: Partial<RespostaBase> = {}): RespostaBase => ({
  id: "r1",
  formulario_id: "f2",
  titulo: "Smoke Form",
  perguntas: PERG,
  faixas: [],
  respostas: { p1: true, p2: "Emagrecer" },
  pontuacao: 2,
  faixa: "",
  nivel: "",
  nome: "Fulana Teste",
  email: "Fulana@Exemplo.com",
  telefone: "(11) 98888-1234",
  paciente_id: null,
  respondido_em: QUANDO,
  created_at: "2026-09-19T15:30:00.500+00:00",
  importada_em: null,
  importada_tipo: null,
  importada_id: null,
  formulario: FORM_A,
  ...extra,
});
const ALUNOS = [
  { id: "a", nome: "Ana Silva", email: "ana@exemplo.com", telefone: "11977776666" },
  { id: "b", nome: "Fulana Teste", email: null, telefone: null },
  { id: "c", nome: "Carlos", email: "carlos@exemplo.com", telefone: "5511988881234" },
];

describe("contagens", () => {
  it("textoContagemRespostas/ehNova (nova = viva e sem aluno — o critério do Nutri)", () => {
    expect(textoContagemRespostas(0)).toBe("Nenhuma resposta");
    expect(textoContagemRespostas(1)).toBe("1 resposta");
    expect(textoContagemRespostas(3)).toBe("3 respostas");
    expect(ehNova(base())).toBe(true);
    expect(ehNova(base({ paciente_id: "a" }))).toBe(false);
    expect(ehNova(base({ deleted_at: QUANDO }))).toBe(false);
  });
});

describe("filtros", () => {
  const params = (o: Record<string, string>) => ({ get: (k: string) => (k in o ? o[k] : null) });
  it("filtrosDaURL ⇄ filtrosParaURL (só o preenchido entra)", () => {
    expect(filtrosDaURL(params({}))).toEqual(FILTROS_VAZIOS);
    const f = filtrosDaURL(params({ formulario: " Disbiose ", q: "  ana ", sem: "1", aluno: " a1 " }));
    expect(f).toEqual({ formulario: "Disbiose", busca: "ana", soNovas: true, aluno: "a1" });
    expect(filtrosParaURL(f)).toEqual({ formulario: "Disbiose", q: "ana", sem: "1", aluno: "a1" });
    expect(filtrosParaURL(FILTROS_VAZIOS)).toEqual({});
    expect(filtrosAtivos(FILTROS_VAZIOS)).toBe(false);
    expect(filtrosAtivos({ ...FILTROS_VAZIOS, soNovas: true })).toBe(true);
    expect(filtrosAtivos({ ...FILTROS_VAZIOS, aluno: "a" })).toBe(true);
  });
  it("titulosFormularios: únicos sem caixa/acento, alfabéticos", () => {
    expect(titulosFormularios([{ titulo: "Disbiose" }, { titulo: "disbiose" }, { titulo: " Pré-anamnese " }, { titulo: "" }, { titulo: "Cafeína" }])).toEqual(["Cafeína", "Disbiose", "Pré-anamnese"]);
  });
  it("chaveTexto", () => {
    expect(chaveTexto("  José  ANTÔNIO ")).toBe("jose antonio");
    expect(chaveTexto(null)).toBe("");
  });
});

describe("origem, situação e pontuação", () => {
  it("origemDaResposta/tipoImportacao: questionário pelo embed ou pelas faixas; anamnese pelo embed; removido → personalizado", () => {
    expect(origemDaResposta(base({ formulario: FORM_Q }))).toBe("questionario");
    expect(origemDaResposta(base({ formulario: null, faixas: FAIXAS }))).toBe("questionario");
    expect(origemDaResposta(base({ formulario: FORM_A }))).toBe("anamnese");
    expect(origemDaResposta(base({ formulario: null, formulario_id: null }))).toBe("personalizado");
    expect(tipoImportacao(base({ formulario: FORM_Q }))).toBe("questionario");
    expect(tipoImportacao(base({ formulario: FORM_A }))).toBe("anamnese");
    expect(tipoImportacao(base({ formulario: null }))).toBe("anamnese");
  });
  it("situacaoFormulario", () => {
    expect(situacaoFormulario(base({ formulario: FORM_Q, formulario_id: "f1" }))).toBe("ativo");
    expect(situacaoFormulario(base({ formulario: FORM_A }))).toBe("inativo");
    expect(situacaoFormulario(base({ formulario: { ...FORM_Q, deleted_at: QUANDO } }))).toBe("excluido");
    expect(situacaoFormulario(base({ formulario: null, formulario_id: null }))).toBe("removido");
    expect(textoSituacaoFormulario("ativo")).toBe("");
    expect(textoSituacaoFormulario("removido")).toBe("formulário removido");
  });
  it("pontosDaResposta: pontos gravados, máximo pela cópia, badge só com faixas", () => {
    const p = pontosDaResposta(base());
    expect(p).toEqual({ pontos: 2, max: 6, temFaixas: false, faixa: "", nivel: "", respondidas: 2, total: 3 });
    const q = pontosDaResposta(base({ faixas: FAIXAS, pontuacao: "4", faixa: "Média", nivel: "moderado", respostas: { p1: true, p3: 2 } }));
    expect(q).toEqual({ pontos: 4, max: 6, temFaixas: true, faixa: "Média", nivel: "moderado", respondidas: 2, total: 3 });
    expect(pontosDaResposta(base({ pontuacao: null, nivel: "lixo" })).pontos).toBe(0);
  });
});

describe("ligar a um aluno", () => {
  it("sugerirAluno: e-mail → telefone (tolera DDI) → nome → null", () => {
    expect(sugerirAluno(base({ email: "ANA@exemplo.com", telefone: "", nome: "Outra" }), ALUNOS)).toEqual({ aluno: ALUNOS[0], por: "email" });
    expect(sugerirAluno(base({ email: "", telefone: "(11) 98888-1234", nome: "Outra" }), ALUNOS)).toEqual({ aluno: ALUNOS[2], por: "telefone" });
    expect(sugerirAluno(base({ email: "ninguem@exemplo.com", telefone: "1234", nome: "fulana  teste" }), ALUNOS)).toEqual({ aluno: ALUNOS[1], por: "nome" });
    expect(sugerirAluno(base({ email: "ninguem@exemplo.com", telefone: "(11) 90000-0000", nome: "Ninguém" }), ALUNOS)).toBeNull();
    expect(textoSugestao("email")).toBe("mesmo e-mail");
  });
  it("dadosAlunoDaResposta: 1 linha, e-mail em minúsculas", () => {
    expect(dadosAlunoDaResposta(base({ nome: "  Fulana   Teste ", email: " Fulana@Exemplo.com ", telefone: " (11) 98888-1234 " }))).toEqual({ nome: "Fulana Teste", email: "fulana@exemplo.com", telefone: "(11) 98888-1234" });
  });
});

describe("importação", () => {
  it("podeImportar/podeDesligar/textoImportada/linkImportada (a seção do Prontuário da W18)", () => {
    expect(podeImportar(base())).toBe(false);
    expect(podeImportar(base({ paciente_id: "a" }))).toBe(true);
    expect(podeImportar(base({ paciente_id: "a", importada_em: QUANDO }))).toBe(false);
    expect(podeDesligar(base({ paciente_id: "a" }))).toBe(true);
    expect(podeDesligar(base({ paciente_id: "a", importada_em: QUANDO }))).toBe(false);
    expect(textoImportada(base())).toBe("");
    expect(textoImportada(base({ importada_em: QUANDO, importada_tipo: "questionario" }))).toBe("Importada para questionário em 19/09");
    expect(textoImportada(base({ importada_em: QUANDO, importada_tipo: "anamnese" }))).toBe("Importada para anamnese em 19/09");
    expect(linkImportada(base({ paciente_id: "a", importada_em: QUANDO, importada_tipo: "questionario" }))).toBe("/painel/alunos/a/prontuario?secao=questionarios");
    expect(linkImportada(base({ paciente_id: "a", importada_em: QUANDO, importada_tipo: "anamnese" }))).toBe("/painel/alunos/a/prontuario?secao=anamnese");
    expect(linkImportada(base({ paciente_id: "a" }))).toBe("");
    expect(linkAluno("a b")).toBe("/painel/alunos/a%20b");
    expect(linkAluno(null)).toBe("");
  });
  it("anamneseDaResposta: todas as perguntas, não respondida vira '', data = hora da resposta, texto livre com quem respondeu", () => {
    const a = anamneseDaResposta(base());
    expect(a.titulo).toBe("Smoke Form");
    expect(a.data).toBe(QUANDO);
    expect(a.conteudo).toEqual([
      { pergunta: "Já fez dieta?", resposta: "Sim" },
      { pergunta: "Objetivo", resposta: "Emagrecer" },
      { pergunta: "Sono", resposta: "" },
    ]);
    expect(a.texto_livre).toMatch(/^Pré-consulta respondida por Fulana Teste \(Fulana@Exemplo.com · \(11\) 98888-1234\) em 19\/09\/2026 \d{2}:\d{2}$/);
    expect(anamneseDaResposta(base({ titulo: "", email: "", telefone: "" })).titulo).toBe("Pré-consulta");
    expect(anamneseDaResposta(base({ email: "", telefone: "" })).texto_livre).not.toContain("(");
  });
  it("aplicacaoDaResposta: cópia + pontuação gravada; questionario_id só na origem questionário; data local yyyy-MM-dd", () => {
    const r = base({ formulario: FORM_Q, formulario_id: "f1", titulo: "Disbiose", faixas: FAIXAS, pontuacao: 4, faixa: "Média", nivel: "moderado", respostas: { p1: true, p3: 2 } });
    const ap = aplicacaoDaResposta(r);
    expect(ap.questionario_id).toBe("q1");
    expect(ap.titulo).toBe("Disbiose");
    expect(ap.perguntas).toEqual(PERG);
    expect(ap.faixas).toEqual(FAIXAS);
    expect(ap.respostas).toEqual({ p1: true, p3: 2 });
    expect(ap.pontuacao).toBe(4);
    expect(ap.faixa).toBe("Média");
    expect(ap.nivel).toBe("moderado");
    expect(ap.data).toBe("2026-09-19");
    expect(ap.observacao).toBe("Importada da pré-consulta (Fulana Teste · Fulana@Exemplo.com)");
    // origem anamnese: o origem_id é um MODELO de anamnese, não pode ir pra questionario_id
    expect(aplicacaoDaResposta(base({ formulario: FORM_A })).questionario_id).toBeNull();
    expect(aplicacaoDaResposta(base({ formulario: null })).questionario_id).toBeNull();
    expect(aplicacaoDaResposta(base({ formulario: FORM_Q, pontuacao: "13" })).pontuacao).toBe(13);
  });
  it("textoConfirmarImportar", () => {
    expect(textoConfirmarImportar(base({ formulario: FORM_Q }), "Ana")).toContain("uma aplicação de questionário de saúde no prontuário de Ana");
    expect(textoConfirmarImportar(base(), "")).toContain("uma anamnese no prontuário de o aluno ligado");
  });
});

describe("W21 — quem importa e os números", () => {
  const nutri = { uid: "n1", souNutri: true, souDono: false };
  it("motivoSemImportar: só a nutricionista; com aluno ligado, que tenha nutrição e seja dela (ou ela é a dona) — como o banco (W3/W18)", () => {
    const ligada = base({ paciente_id: "a" });
    expect(motivoSemImportar(ligada, nutri, { id: "a", nutricionista_id: "n1" })).toBeNull();
    expect(motivoSemImportar(ligada, { ...nutri, souNutri: false }, { id: "a", nutricionista_id: "n1" })).toMatch(/nutricionista/);
    expect(motivoSemImportar(base(), nutri, null)).toMatch(/Ligue a resposta/);
    expect(motivoSemImportar(ligada, nutri, null)).toMatch(/não está na sua lista/);
    expect(motivoSemImportar(ligada, nutri, { id: "a", nutricionista_id: null })).toMatch(/não tem nutrição/);
    expect(motivoSemImportar(ligada, nutri, { id: "a", nutricionista_id: "outra" })).toMatch(/responsável/);
    expect(motivoSemImportar(ligada, { ...nutri, souDono: true }, { id: "a", nutricionista_id: "outra" })).toBeNull();
    expect(motivoSemImportar(base({ paciente_id: "a", importada_em: QUANDO }), nutri, { id: "a", nutricionista_id: "n1" })).toMatch(/já foi importada/);
  });
  it("respostasPorFormulario/respostasDoMes/iniciaisDe", () => {
    const m = respostasPorFormulario([base({ formulario_id: "f1" }), base({ formulario_id: "f1", paciente_id: "a" }), base({ formulario_id: null }), base({ formulario_id: "f2" })]);
    expect(m.get("f1")).toEqual({ total: 2, novas: 1 });
    expect(m.get("f2")).toEqual({ total: 1, novas: 1 });
    expect(m.size).toBe(2);
    const hoje = new Date(2026, 9, 15, 12);
    expect(respostasDoMes([{ respondido_em: new Date(2026, 9, 1, 9).toISOString() }, { respondido_em: new Date(2026, 8, 30, 9).toISOString() }], hoje)).toBe(1);
    const agora = new Date(2026, 9, 15, 12);
    const dias = (n: number) => new Date(agora.getTime() - n * 86400000).toISOString();
    expect(respostasPorSemana([{ respondido_em: dias(1) }, { respondido_em: dias(2) }, { respondido_em: dias(8) }, { respondido_em: dias(60) }], agora)).toEqual([0, 0, 0, 0, 0, 0, 1, 2]);
    // W27: a mesma função de iniciais do Avatar (W25) — primeira e última palavra, só letras
    expect(iniciaisDe("  ana  maria silva ")).toBe("AS");
    expect(iniciaisDe("Conta Teste (prova)")).toBe("CP");
    expect(iniciaisDe("(Ana) 2026")).toBe("A");
    expect(iniciaisDe("")).toBe("?");
  });
});

// hml-14b (B21): a lista vem do banco (respostas_da_conta) — os filtros da URL viram os do banco e a resposta vira a página da tela
describe("hml-14b — a página das respostas vem do banco", () => {
  it("filtrosParaBanco: só o que está preenchido; novas = 'true'; a busca e o título vão como a pessoa digitou (o banco normaliza)", () => {
    expect(filtrosParaBanco(FILTROS_VAZIOS)).toEqual({});
    expect(filtrosParaBanco({ formulario: "  Pré-anamnese ", busca: " Zé  Último ", soNovas: true, aluno: "a1" }))
      .toEqual({ formulario: "Pré-anamnese", q: "Zé Último", novas: "true", aluno: "a1" });
  });

  it("normalizarPaginaRespostas: os números, os títulos (sem repetir, em ordem) e o aluno do filtro", () => {
    const p = normalizarPaginaRespostas<{ id: string }>({
      ok: true, total: 41, total_conta: 50, novas: 3, titulos: ["Pré-anamnese", "disbiose", "pre-anamnese", 7], aluno: { id: "a1", nome: "Zé Último" },
      itens: [{ id: "r1" }],
    });
    expect(p).toEqual({ itens: [{ id: "r1" }], total: 41, totalConta: 50, novas: 3, titulos: ["disbiose", "Pré-anamnese"], alunoFiltro: { id: "a1", nome: "Zé Último" } });
    expect(normalizarPaginaRespostas({ ok: true, total: 0, total_conta: 0, novas: 0, itens: [], titulos: [], aluno: null })?.alunoFiltro).toBeNull();
  });

  it("formato inesperado → null (a tela mostra o erro, nunca uma lista vazia no lugar)", () => {
    expect(normalizarPaginaRespostas(null)).toBeNull();
    expect(normalizarPaginaRespostas({ ok: false, erro: "sem_acesso" })).toBeNull();
    expect(normalizarPaginaRespostas({ ok: true, itens: [], total: "41", total_conta: 41, novas: 0 })).toBeNull();
    expect(normalizarPaginaRespostas({ ok: true, total: 1, total_conta: 1, novas: 0 })).toBeNull();
  });
});
