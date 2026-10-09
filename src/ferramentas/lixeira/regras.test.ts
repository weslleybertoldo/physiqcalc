import { describe, expect, it } from "vitest";
import {
  AVISO_LIXEIRA, CHAVES_LIXEIRA, DIAS_LIXEIRA, TIPOS_LIXEIRA, abaInicial, abasDaPessoa, contagemZerada, diasParaPurga, ehTipoLixeira,
  infoTipo, mensagemDaRecusa, normalizarLixeira, ordenarItens, rotaDoItem, textoConfirmarApagar, textoContagem, textoPurga, textoVazioAba, tituloDoItem,
  type ItemLixeira,
} from "./regras";

// Physiq W26 — as regras da Lixeira portadas do lixeiraUtil.test.ts do PhysiqNutri (W32), com as rotas e as abas do Physiq.
const D1 = "2026-09-20T15:00:00+00:00"; // mais recente
const D2 = "2026-09-19T15:00:00+00:00";
const D3 = "2026-09-01T15:00:00+00:00";
const AGORA = new Date("2026-09-20T15:00:00+00:00");

const bruto = {
  ok: true,
  ve_clinico: true,
  tem_nutricao: true,
  itens: [
    { tipo: "resposta", id: "r1", titulo: "Pré-consulta inicial", detalhe: "Carla", paciente_id: null, paciente_nome: null, excluido_em: D2, pode_restaurar: true, pode_apagar: true },
    { tipo: "anamnese", id: "a1", titulo: "Anamnese geral", detalhe: null, paciente_id: "pac1", paciente_nome: "Joana Ação", excluido_em: D1, pode_restaurar: true, pode_apagar: true },
    { tipo: "antropometria", id: "t1", titulo: "Antropometria", detalhe: "2026-09-10", paciente_id: "pac1", paciente_nome: "Joana Ação", excluido_em: D1, pode_restaurar: true, pode_apagar: true },
    { tipo: "plano", id: "p1", titulo: "Plano 1800 kcal", detalhe: null, paciente_id: "pac1", paciente_nome: "Joana Ação", excluido_em: D3, pode_restaurar: false, pode_apagar: false },
    // o banco nunca deixa apagar aluno; mesmo se viesse true, a tela não mostra
    { tipo: "paciente", id: "pac1", titulo: "Joana Ação", detalhe: "joana@teste.com", paciente_id: null, paciente_nome: null, excluido_em: D2, pode_restaurar: true, pode_apagar: true },
    { tipo: "desconhecido", id: "x", excluido_em: D1 },
    { tipo: "plano", id: "", excluido_em: D1 },
  ],
};

describe("Lixeira — tipos e abas", () => {
  it("5 abas na ordem do site antigo; só o aluno fica até restaurar; as 3 clínicas", () => {
    expect(CHAVES_LIXEIRA).toEqual(["resposta", "anamnese", "antropometria", "plano", "paciente"]);
    expect(TIPOS_LIXEIRA.filter((t) => t.mantido).map((t) => t.id)).toEqual(["paciente"]);
    expect(TIPOS_LIXEIRA.filter((t) => t.clinico).map((t) => t.id)).toEqual(["anamnese", "antropometria", "plano"]);
    expect(infoTipo("plano").plural).toBe("Planos alimentares");
    expect(infoTipo("paciente").plural).toBe("Alunos");
    expect(ehTipoLixeira("plano")).toBe(true);
    expect(ehTipoLixeira("todos")).toBe(false);
    expect(DIAS_LIXEIRA).toBe(30);
    expect(AVISO_LIXEIRA).toContain("30 dias");
  });
  it("quem não é nutricionista da conta não tem as abas clínicas (W18)", () => {
    expect(abasDaPessoa(true).map((a) => a.id)).toEqual(CHAVES_LIXEIRA);
    expect(abasDaPessoa(false).map((a) => a.id)).toEqual(["resposta", "paciente"]);
  });
});

describe("Lixeira — normalizar e ordenar", () => {
  const l = normalizarLixeira(bruto)!;
  it("ignora item estranho e ordena: mais recente primeiro, empate pela ordem das abas", () => {
    expect(l.itens.map((i) => `${i.tipo}:${i.id}`)).toEqual(["anamnese:a1", "antropometria:t1", "resposta:r1", "paciente:pac1", "plano:p1"]);
    expect(l.veClinico).toBe(true);
    expect(l.temNutricao).toBe(true);
  });
  it("aluno nunca tem 'apagar de vez'; o resto segue o banco", () => {
    expect(l.itens.find((i) => i.tipo === "paciente")?.pode_apagar).toBe(false);
    expect(l.itens.find((i) => i.tipo === "plano")?.pode_restaurar).toBe(false);
    expect(l.itens.find((i) => i.tipo === "anamnese")?.pode_apagar).toBe(true);
  });
  it("resposta com erro do banco ou vazia → null (a tela mostra o erro)", () => {
    expect(normalizarLixeira({ ok: false, erro: "sem_acesso" })).toBeNull();
    expect(normalizarLixeira(null)).toBeNull();
    expect(normalizarLixeira({ ok: true })).toEqual({ veClinico: false, temNutricao: false, itens: [] });
  });
  it("desempata pelo id", () => {
    const base: ItemLixeira = { tipo: "plano", id: "b", titulo: "B", detalhe: null, paciente_id: null, paciente_nome: null, excluido_em: D1, pode_restaurar: true, pode_apagar: true };
    expect(ordenarItens([base, { ...base, id: "a" }]).map((i) => i.id)).toEqual(["a", "b"]);
  });
  it("hml-14b (B21): a resposta paginada traz a aba, os números das abas (os que faltam = 0) e o total da aba com a busca", () => {
    const pag = normalizarLixeira({
      ok: true, ve_clinico: false, tem_nutricao: true, tipo: "paciente", totais: { paciente: 41, resposta: 2, lixo: 9, plano: -1 }, total: 3,
      itens: [bruto.itens[4]],
    })!;
    expect(pag.itens.map((i) => i.id)).toEqual(["pac1"]);
    expect(pag.pagina).toEqual({ tipo: "paciente", totais: { resposta: 2, anamnese: 0, antropometria: 0, plano: 0, paciente: 41 }, total: 3 });
    // aba estranha → a 1ª; sem o total da aba = formato inesperado (a tela mostra o erro, nunca a lista vazia)
    expect(normalizarLixeira({ ok: true, tipo: "x", totais: {}, total: 0, itens: [] })?.pagina?.tipo).toBe("resposta");
    expect(normalizarLixeira({ ok: true, tipo: "paciente", totais: { paciente: 1 }, itens: [] })).toBeNull();
    // o formato de antes (APK antigo) continua sem a página
    expect(normalizarLixeira(bruto)?.pagina).toBeUndefined();
  });
  it("títulos por tipo", () => {
    expect(tituloDoItem(l.itens.find((i) => i.id === "r1")!)).toBe("Pré-consulta inicial · Carla");
    expect(tituloDoItem(l.itens.find((i) => i.id === "t1")!)).toBe("Antropometria de 10/09/2026");
    expect(tituloDoItem(l.itens.find((i) => i.id === "pac1")!)).toBe("Joana Ação");
  });
});

describe("Lixeira — abas e textos", () => {
  // os números das abas vêm do banco (hml-14b); aqui, 1 em cada
  const c = { resposta: 1, anamnese: 1, antropometria: 1, plano: 1, paciente: 1 };
  it("os números zerados (antes da página do banco chegar)", () => {
    expect(contagemZerada()).toEqual({ resposta: 0, anamnese: 0, antropometria: 0, plano: 0, paciente: 0 });
  });
  it("aba da URL vale se a pessoa tem a aba; senão a 1ª com itens", () => {
    const todas = abasDaPessoa(true);
    expect(abaInicial(todas, c, "plano")).toBe("plano");
    expect(abaInicial(abasDaPessoa(false), c, "plano")).toBe("resposta");
    expect(abaInicial(todas, { ...c, resposta: 0 }, null)).toBe("anamnese");
    expect(abaInicial(abasDaPessoa(false), { resposta: 0, anamnese: 0, antropometria: 0, plano: 0, paciente: 0 }, "x")).toBe("resposta");
  });
  it("textos", () => {
    expect(textoContagem(0)).toBe("Lixeira vazia");
    expect(textoContagem(1)).toBe("1 item na lixeira");
    expect(textoContagem(5)).toBe("5 itens na lixeira");
    expect(textoVazioAba("plano", "")).toBe("Nenhum plano alimentar na lixeira.");
    expect(textoVazioAba("plano", "x")).toBe("Nenhum item com essa busca.");
    expect(textoConfirmarApagar("Plano 1800 kcal")).toBe('"Plano 1800 kcal" será apagado de vez e não poderá ser restaurado.');
  });
});

describe("Lixeira — 30 dias, rotas e recusas", () => {
  it("dias para a purga: 30 − dias inteiros, mínimo 0; aluno = fica", () => {
    expect(diasParaPurga("plano", D1, AGORA)).toBe(30);
    expect(diasParaPurga("plano", D2, AGORA)).toBe(29);
    expect(diasParaPurga("plano", "2026-08-01T15:00:00+00:00", AGORA)).toBe(0);
    expect(diasParaPurga("paciente", D3, AGORA)).toBeNull();
    expect(textoPurga(null)).toBe("fica até você restaurar");
    expect(textoPurga(0)).toBe("apaga de vez hoje");
    expect(textoPurga(1)).toBe("apaga de vez em 1 dia");
    expect(textoPurga(12)).toBe("apaga de vez em 12 dias");
  });
  it("Abrir leva às telas do Physiq", () => {
    expect(rotaDoItem({ tipo: "paciente", id: "pac1", paciente_id: null })).toBe("/painel/alunos/pac1");
    expect(rotaDoItem({ tipo: "resposta", id: "r1", paciente_id: null })).toBe("/painel/pre-consulta?aba=respostas");
    expect(rotaDoItem({ tipo: "anamnese", id: "a1", paciente_id: "pac1" })).toBe("/painel/alunos/pac1/prontuario");
    expect(rotaDoItem({ tipo: "antropometria", id: "t1", paciente_id: "pac1" })).toBe("/painel/alunos/pac1/avaliacao");
    expect(rotaDoItem({ tipo: "plano", id: "p1", paciente_id: "pac1" })).toBe("/painel/alunos/pac1/dieta");
    expect(rotaDoItem({ tipo: "plano", id: "p1", paciente_id: null })).toBeNull();
  });
  it("frases das recusas: W16b (e-mail/CPF), P7, limite da faixa, permissão", () => {
    expect(mensagemDaRecusa("email_repetido")).toBe("Já existe um aluno com este e-mail.");
    expect(mensagemDaRecusa("cpf_repetido")).toBe("Já existe um aluno com este CPF.");
    expect(mensagemDaRecusa("outro_profissional")).toBe("Este aluno já está com outro profissional.");
    expect(mensagemDaRecusa("ja_na_lista")).toMatch(/já está na sua lista/);
    expect(mensagemDaRecusa("limite_plano", { limite: 10, em_uso: 10, sou_dono: true })).toMatch(/10 alunos ativos/);
    expect(mensagemDaRecusa("sem_acesso")).toMatch(/não pode mexer/);
    expect(mensagemDaRecusa("aluno_nao_apaga")).toMatch(/ficam aqui até você restaurar/);
    expect(mensagemDaRecusa("qualquer_outro")).toMatch(/Tente de novo/);
  });
});
