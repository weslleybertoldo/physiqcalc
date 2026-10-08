import { afterEach, describe, expect, it, vi } from "vitest";
import { situacao, conta as contaSituacao } from "@/test/fixturesNucleo";
import type { Conferencia, ContaDoDono } from "./api";
import {
  destinoDaExclusao, listaApaga, listaFica, lotesParaBaixar, nomeDoZip, nomeUnico, papeisLegiveis, precisaBaixar, prontuariosDaConferencia,
  resumoDaConfirmacao, textoDosAlunos, textoDosAlunosDaEquipe, textosDaCobranca,
} from "./regras";

const contaDono = (extra: Partial<ContaDoDono> = {}): ContaDoDono => ({
  id: "c1", nome: "W2L Consultoria", origem: "nova", plano: "treino_nutricao", situacao: "teste", eu_nutri: true,
  alunos: { total: 2, para_o_app: 1, guardados: 1, lista: [{ nome: "Alice", destino: "app" }, { nome: "Bruno", destino: "guardado" }] },
  membros: [{ nome: "Eduardo", email: "e@x.app", papeis: ["personal"], convite: false }],
  convites_pendentes: 0,
  cobrancas: { plano: 1, alunos: 2 },
  prontuarios: [{ paciente_id: "p1", conta_id: "c1", nome: "Alice", registros: 1, restritos: 0 }, { paciente_id: "p2", conta_id: "c1", nome: "Bruno", registros: 2, restritos: 1 }],
  ...extra,
});

// hml-11 (D5): a frase da cobrança depende do build (VITE_DB_SCHEMA); cada teste dela diz qual
afterEach(() => {
  vi.unstubAllEnvs();
});

const conferencia = (extra: Partial<Conferencia> = {}): Conferencia => ({
  ok: true, simulacao: true, perfil: "dono", nome: "Diana", contas: [contaDono()], equipes: [], ex_equipes: 0, sem_conta: null, aluno: null,
  treino: { apaga: { treino_historico: 4, tb_treino_series: 30 }, mantem: { treinos_montados: 3, exercicios_proprios: 1 }, cobrancas: { plano: 0, alunos: 0 } },
  cobrancas_a_cancelar: 3,
  ...extra,
});

describe("excluir conta do profissional — os textos da conferência", () => {
  it("site: alunos com login vão para o app com 7 dias grátis; os outros ficam guardados", () => {
    expect(textoDosAlunos(contaDono(), false)).toBe(
      "2 alunos: 1 aluno com login vira aluno do app, sem profissional, com 7 dias grátis; 1 fica guardado sem acesso (sem login, inativo ou com outro profissional).");
  });
  it("loja: o mesmo, sem 'grátis' (nada de venda na versão da Google Play)", () => {
    const t = textoDosAlunos(contaDono({ alunos: { total: 3, para_o_app: 3, guardados: 0, lista: [] } }), true);
    expect(t).toBe("3 alunos: 3 alunos com login continuam usando o app, agora sem profissional.");
    expect(t).not.toMatch(/grátis|R\$|assin|pag/i);
  });
  it("sem alunos", () => {
    expect(textoDosAlunos(contaDono({ alunos: { total: 0, para_o_app: 0, guardados: 0, lista: [] } }), false)).toBe("Nenhum aluno na conta agora.");
  });
  it("cobrança: só informação (cancelada, sem reembolso) — nenhum valor e nenhum 'pague'", () => {
    vi.stubEnv("VITE_DB_SCHEMA", "public"); // hml-11: a frase de hoje é a da produção
    const l = textosDaCobranca(contaDono());
    expect(l).toEqual([
      "A cobrança automática do plano desta conta é cancelada agora (sem reembolso do que já foi pago).",
      "As cobranças automáticas de 2 alunos para você também são canceladas.",
    ]);
    expect(l.join(" ")).not.toMatch(/R\$|pague|assine|pix/i);
    expect(textosDaCobranca(contaDono({ cobrancas: { plano: 0, alunos: 1 } }))).toEqual(["A cobrança automática de 1 aluno para você também é cancelada."]);
    expect(textosDaCobranca(contaDono({ cobrancas: { plano: 0, alunos: 0 } }))).toEqual([]);
  });
  it("hml-11 (D5): no staging, 'sem reembolso' vira a desistência em 7 dias dos Termos de assinatura novos (ainda só informação)", () => {
    vi.stubEnv("VITE_DB_SCHEMA", "staging");
    const l = textosDaCobranca(contaDono());
    expect(l).toEqual([
      "A cobrança automática do plano desta conta é cancelada agora (o que já foi pago não volta, salvo a desistência em até 7 dias depois do pagamento).",
      "As cobranças automáticas de 2 alunos para você também são canceladas.",
    ]);
    expect(l.join(" ")).not.toMatch(/R\$|pague|assine|pix|sem reembolso/i);
  });
  it("o membro que sai: os alunos dele ficam sem responsável (singular e plural)", () => {
    expect(textoDosAlunosDaEquipe(1)).toBe("O seu aluno fica na conta, sem responsável, para o dono atribuir a outro profissional.");
    expect(textoDosAlunosDaEquipe(3)).toMatch(/^Os seus 3 alunos ficam na conta/);
    expect(textoDosAlunosDaEquipe(0)).toBe("Você não é responsável por nenhum aluno agora.");
  });
  it("papéis legíveis da equipe", () => {
    expect(papeisLegiveis(["personal", "nutricionista"])).toBe("Personal e Nutricionista");
    expect(papeisLegiveis(["dono"])).toBe("Equipe");
  });
  it("o que é apagado e o que fica (com o porquê da guarda)", () => {
    const apaga = listaApaga(conferencia({ aluno: { matriculas: 1, contas: ["X"], apaga: { diario_alimentar: 2, metas_concluidas: 1 }, mantem: {} } }));
    expect(apaga[0]).toMatch(/O seu login no Physiq/);
    expect(apaga).toContain("O seu histórico de treino pessoal: 4 treinos feitos e 30 séries");
    expect(apaga).toContain("O que você enviou como aluno: fotos do diário e refeições/metas marcadas (3)");
    const fica = listaFica(conferencia());
    expect(fica[0]).toMatch(/Res\. CFN 594\/2017 e Lei 13\.787\/2018: 20 anos/);
    expect(fica).toContain("Os treinos e exercícios que você montou para os alunos (4) continuam com eles.");
  });
  it("a frase da última confirmação", () => {
    expect(resumoDaConfirmacao(conferencia())).toBe(
      "A conta W2L Consultoria é encerrada e 1 profissional perde o acesso, 3 cobranças automáticas são canceladas e o seu login é apagado. Não dá para desfazer.");
    expect(resumoDaConfirmacao(conferencia({ perfil: "membro", contas: [], equipes: [{ conta_nome: "Estúdio", dono_nome: "Daniel", papeis: ["personal"],
      alunos_treino: 1, alunos_nutricao: 0 }], cobrancas_a_cancelar: 0 })))
      .toBe("Você sai da equipe de Estúdio e o seu login é apagado. Não dá para desfazer.");
  });
});

describe("excluir conta do profissional — os prontuários (1 PDF por paciente)", () => {
  it("o passo de baixar só aparece com prontuário guardado nas contas dele", () => {
    expect(precisaBaixar(conferencia())).toBe(true);
    expect(precisaBaixar(conferencia({ contas: [contaDono({ prontuarios: [] })] }))).toBe(false);
    expect(precisaBaixar(conferencia({ perfil: "membro", contas: [] }))).toBe(false);
    expect(prontuariosDaConferencia(conferencia({ sem_conta: { alunos: 1, prontuarios: [{ paciente_id: "p9", conta_id: null, nome: "Antigo", registros: 1, restritos: 0 }] } })))
      .toHaveLength(3);
  });
  it("os pedidos ao banco: por conta e em lotes", () => {
    const ps = Array.from({ length: 27 }, (_, i) => ({ paciente_id: `p${i}`, conta_id: i < 26 ? "c1" : null, nome: `P${i}`, registros: 1, restritos: 0 }));
    const lotes = lotesParaBaixar(ps, 25);
    expect(lotes.map((l) => [l.conta, l.pacientes.length])).toEqual([["c1", 25], ["c1", 1], [null, 1]]);
  });
  it("nomes de arquivo: o ZIP sem nome de ninguém e os PDFs sem repetir", () => {
    expect(nomeDoZip("2026-10-06")).toBe("physiq-prontuarios-2026-10-06.zip");
    expect(nomeDoZip("lixo")).toMatch(/^physiq-prontuarios-\d{4}-\d{2}-\d{2}\.zip$/);
    const usados = new Set<string>();
    expect(nomeUnico("prontuario-ana-2026-10-06.pdf", usados)).toBe("prontuario-ana-2026-10-06.pdf");
    expect(nomeUnico("prontuario-ana-2026-10-06.pdf", usados)).toBe("prontuario-ana-2026-10-06-2.pdf");
  });
});

describe("a página /excluir-conta leva cada um à tela certa", () => {
  it("profissional (e master) no painel › Configurações; aluno e quem não tem nada no Perfil do app", () => {
    expect(destinoDaExclusao(situacao({ contas: [contaSituacao()] }))).toBe("/painel/configuracoes/excluir-conta");
    expect(destinoDaExclusao(situacao({ master: true }))).toBe("/painel/configuracoes/excluir-conta");
    expect(destinoDaExclusao(situacao({ contas: [] }))).toBe("/perfil?excluir=1");
    expect(destinoDaExclusao(null)).toBe("/perfil?excluir=1");
  });
});
