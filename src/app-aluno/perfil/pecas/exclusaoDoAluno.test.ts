import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  caminhoDoPedidoDoAluno,
  respostaParaOAluno,
} from "../../../../supabase-principal/functions/_shared/exclusao-aluno-regras";
import { excluirContaProfissional, type DepsExclusao } from "../../../../supabase-principal/functions/_shared/exclusao-profissional-regras";

// "Excluir minha conta" que funciona sempre (31/10/2026, agente F) — o caminho do ALUNO da excluir-minha-conta (sem `fluxo`: o APK
// antigo, o site antigo e a volta da folha nova) com quem já foi membro de equipe. Antes: o login saía de vez (hard delete) e o
// "set null" do conta_membros.user_id quebrava o CHECK conta_membros_pessoa_ou_convite → 500 e o login ficava (o caso 2 do E,
// reproduzido no staging 31/10 20:06:48Z). Agora a borda pergunta ao banco e quem já foi profissional sai pela ORDEM DO PROFISSIONAL
// (soft delete; a linha de equipe fica de âncora), com a resposta no formato do aluno.

const CONF_ALUNO = {
  ok: true, simulacao: true, matriculas: ["m1"],
  apaga: { diario_alimentar: 1, refeicoes_concluidas: 0, metas_concluidas: 0, avisos: 1, perfil: 1, whatsapp_pendentes_cancelados: 0, rotinas_e_dieta: 0 },
  mantem: { matriculas: 1, agendamentos: 0, cobrancas: 0, recibos: 0, antropometrias: 0, planos_alimentares: 0, prontuario: 0 },
  arquivos: [],
};
const CONF_EX = {
  ok: true, simulacao: true, perfil: "ex_profissional", nome: "Fernanda", contas_dono: [], equipes: [], ex_equipes: 1, sem_conta: null,
  aluno: null, arquivos: [],
};

describe("excluir-minha-conta, caminho do aluno: por onde o pedido segue (a conferência do profissional, nada muda nela)", () => {
  it("só aluno (o banco diz nao_profissional) → o caminho de sempre (o login sai de vez)", () => {
    expect(caminhoDoPedidoDoAluno({ ok: false, erro: "nao_profissional" })).toEqual({ caminho: "aluno" });
  });
  it("quem já foi membro de equipe (o banco confere como profissional) → a ordem do profissional (soft delete)", () => {
    expect(caminhoDoPedidoDoAluno(CONF_EX)).toEqual({ caminho: "profissional" });
    expect(caminhoDoPedidoDoAluno({ ...CONF_EX, perfil: "membro" })).toEqual({ caminho: "profissional" });
  });
  it("outra recusa do banco → recusa com o mesmo código (nada é apagado)", () => {
    expect(caminhoDoPedidoDoAluno({ ok: false, erro: "assinatura_ativa" })).toEqual({ caminho: "recusa", erro: "assinatura_ativa", motivo: null });
    expect(caminhoDoPedidoDoAluno({ ok: false, erro: "profissional", motivo: "master" })).toEqual({ caminho: "recusa", erro: "profissional", motivo: "master" });
  });
  it("resposta estranha → recusa erro_interno (falha fechada: nunca cai no hard delete por engano)", () => {
    for (const r of [null, undefined, {}, [], "ok", 0, { ok: "true" }, { ok: false }, { erro: "" }]) {
      expect(caminhoDoPedidoDoAluno(r)).toEqual({ caminho: "recusa", erro: "erro_interno", motivo: null });
    }
  });
});

describe("a resposta da ordem do profissional no formato do app do aluno", () => {
  it("simular: { ok, simulacao, apaga, mantem } com o que sai e o que fica (principal do aluno + Treino)", () => {
    const r = respostaParaOAluno({ status: 200, corpo: { ok: true, simulacao: true, perfil: "ex_profissional",
      treino: { apaga: { tb_treino_series: 3 }, mantem: { physiq_avaliacoes: 1 }, cobrancas: { plano: 0, alunos: 0 } } } }, CONF_ALUNO, true);
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({
      ok: true, simulacao: true, perfil: "ex_profissional",
      apaga: { principal: CONF_ALUNO.apaga, treino: { tb_treino_series: 3 } },
      mantem: { principal: CONF_ALUNO.mantem, treino: { physiq_avaliacoes: 1 } },
    });
  });
  it("simular sem vínculo no Treino → treino null (o app mostra só o principal)", () => {
    const r = respostaParaOAluno({ status: 200, corpo: { ok: true, simulacao: true, treino: null } }, CONF_ALUNO, true);
    expect(r.corpo.apaga).toEqual({ principal: CONF_ALUNO.apaga, treino: null });
  });
  it("excluir: { ok, apaga, mantem } com o login e os arquivos que saíram", () => {
    const r = respostaParaOAluno({ status: 200, corpo: { ok: true, perfil: "ex_profissional",
      resultado: { contas: [], arquivos: 2, treino: { login: "removido" } } } }, CONF_ALUNO, false);
    expect(r.status).toBe(200);
    expect(r.corpo.ok).toBe(true);
    expect((r.corpo.apaga as Record<string, unknown>).principal).toEqual({ ...CONF_ALUNO.apaga, arquivos: 2, login: 1 });
    expect((r.corpo.apaga as Record<string, unknown>).treino).toEqual({ login: "removido" });
    expect((r.corpo.mantem as Record<string, unknown>).principal).toEqual(CONF_ALUNO.mantem);
  });
  it("recusa (palavra errada, Treino fora, cobrança que não cancelou, erro) → a MESMA resposta, o mesmo HTTP", () => {
    for (const rec of [
      { status: 400, corpo: { ok: false, erro: "confirmacao_invalida" } },
      { status: 502, corpo: { ok: false, erro: "treino_indisponivel" } },
      { status: 502, corpo: { ok: false, erro: "cobranca_nao_cancelada", canceladas: 0, falhas: 1 } },
      { status: 500, corpo: { ok: false, erro: "erro_interno", play_cancelada: true } },
    ]) {
      expect(respostaParaOAluno(rec, CONF_ALUNO, false)).toEqual(rec);
    }
  });
});

describe("o ex-membro pelo caminho do aluno: a ordem do profissional fecha o login por SOFT delete (antes: hard delete → 500)", () => {
  // o que o banco faz no hard delete do ex-membro: o CHECK conta_membros_pessoa_ou_convite barra (o 500 de antes)
  const hardDelete = async () => {
    throw new Error('new row for relation "conta_membros" violates check constraint "conta_membros_pessoa_ou_convite"');
  };
  function deps(chamadas: string[]): DepsExclusao {
    const anota = <T>(n: string, v: T) => { chamadas.push(n); return v; };
    return {
      conferir: async () => anota("conferir", CONF_EX),
      excluir: async () => anota("excluir", { ...CONF_EX, simulacao: false }),
      treino: async (acao) => anota(`treino:${acao}`, { passo: "sem_vinculo" as const, corpo: {} }),
      cancelarPlano: async () => anota("plano", true),
      cancelarDosAlunos: async () => anota("alunos", { canceladas: 0, falhas: 0 }),
      cancelarSolta: async () => anota("solta", true),
      dispararEspelho: async () => { anota("espelho", null); },
      apagarArquivos: async () => anota("arquivos", 0),
      apagarLogin: async () => { anota("login:soft", null); },
    };
  }
  it("o caminho de antes (hard delete do login) quebra no CHECK — a reprodução do 500", async () => {
    await expect(hardDelete()).rejects.toThrow(/conta_membros_pessoa_ou_convite/);
  });
  it("agora: roteado para a ordem do profissional → 200, o login sai por soft delete e por último", async () => {
    expect(caminhoDoPedidoDoAluno(CONF_EX).caminho).toBe("profissional");
    const chamadas: string[] = [];
    const r = await excluirContaProfissional({ simular: false, confirmacao: "EXCLUIR", papelAuth: "" }, deps(chamadas));
    const fim = respostaParaOAluno(r, CONF_ALUNO, false);
    expect(fim.status).toBe(200);
    expect(fim.corpo.ok).toBe(true);
    expect(chamadas.at(-1)).toBe("login:soft");
    expect(chamadas).not.toContain("hard");
  });
});

describe("a borda usa a regra (o código da excluir-minha-conta)", () => {
  const borda = readFileSync(resolve(__dirname, "../../../../supabase-principal/functions/excluir-minha-conta/index.ts"), "utf-8");
  it("pergunta ao banco ANTES de mexer em algo e manda o ex-profissional pela ordem do profissional", () => {
    const iConf = borda.indexOf('db.rpc("excluir_conta_profissional"');
    const iRota = borda.indexOf("caminhoDoPedidoDoAluno(");
    const iTreino = borda.indexOf('chamarTreino(schema, "conferir"');
    const iPlay = borda.indexOf("cancelarPlayNaExclusao(");
    const iHard = borda.indexOf("auth.admin.deleteUser(user.id)");
    expect(iConf).toBeGreaterThan(0);
    expect(iRota).toBeGreaterThan(iConf);
    // antes do Treino, da Play e do login: nada muda antes da decisão
    expect(iRota).toBeLessThan(iTreino);
    expect(iRota).toBeLessThan(iPlay);
    expect(iRota).toBeLessThan(iHard);
    expect(borda).toMatch(/excluirContaProfissionalNaBorda\(\{[^}]*simular[,\s]/);
    expect(borda).toContain("respostaParaOAluno(");
  });
});
