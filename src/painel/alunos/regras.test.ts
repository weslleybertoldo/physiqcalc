import { describe, expect, it } from "vitest";
import {
  FILTROS_PADRAO,
  acoesDoAluno,
  chipsDosModulos,
  filtrosAtivos,
  filtrosParaServidor,
  limiteAtingido,
  linhaFina,
  mensagemErroAlunos,
  montarCSV,
  normalizarLista,
  rotaDoAluno,
  selosDoAluno,
  textoVagas,
  type AlunoLinha,
} from "./regras";

function aluno(o: Partial<AlunoLinha> = {}): AlunoLinha {
  return {
    id: "p1", rota_id: "t1", treino_user_id: "t1", tem_login: true, nome: "Rafael Moura", email: "rafael@x.com", telefone: "82999990000",
    foto_url: null, tags: [], ativo: true, bloqueado: false, bloqueado_em: null, bloqueio_msg: null, conta_excluida: false, origem: "calc",
    criado_em: "2026-03-10T12:00:00Z", atualizado_em: "2026-09-01T12:00:00Z", modulos: ["treino", "nutricao"],
    personal: { id: "u-lucas", nome: "Lucas Ferreira" }, nutricionista: { id: "u-camila", nome: "Camila Rocha" },
    pagamento: null, comprovante: false, sou_eu: false, ...o,
  };
}
const dono = { id: "u-dono", dono: true, personal: true, nutricionista: false };
const lucas = { id: "u-lucas", dono: false, personal: true, nutricionista: false };
const outro = { id: "u-x", dono: false, personal: true, nutricionista: false };

describe("W13 — lista de alunos: chips e selos (tela 7, C27)", () => {
  it("módulos com o responsável, como a tela 7 (TREINO · LUCAS / NUTRIÇÃO · CAMILA)", () => {
    expect(chipsDosModulos(aluno()).map((c) => [c.tom, c.rotulo])).toEqual([["t", "TREINO · LUCAS"], ["n", "NUTRIÇÃO · CAMILA"]]);
  });
  it("sem nenhum responsável (W5: saiu da equipe) → SEM RESPONSÁVEL", () => {
    expect(chipsDosModulos(aluno({ modulos: [], personal: null, nutricionista: null })).map((c) => c.rotulo)).toEqual(["SEM RESPONSÁVEL"]);
  });
  it("selos: bloqueado, conta excluída, desativado, pago até, pendente e comprovante", () => {
    expect(selosDoAluno(aluno({ bloqueado: true })).map((s) => s.marca)).toEqual(["bloqueado"]);
    expect(selosDoAluno(aluno({ ativo: false, conta_excluida: true })).map((s) => s.rotulo)).toEqual(["CONTA EXCLUÍDA"]);
    expect(selosDoAluno(aluno({ ativo: false })).map((s) => s.rotulo)).toEqual(["DESATIVADO"]);
    expect(selosDoAluno(aluno({ pagamento: { s: "pago", ate: "2026-10-19T12:00:00Z" } })).map((s) => s.rotulo)).toEqual(["PAGO ATÉ 19/10"]);
    expect(selosDoAluno(aluno({ pagamento: { s: "pendente", ate: null }, comprovante: true })).map((s) => s.marca)).toEqual(["comprovante", "pendente"]);
  });
  it("linha fina: contato · desde mês/ano; rota pelo id do Treino (ou a matrícula)", () => {
    expect(linhaFina(aluno())).toBe("rafael@x.com · desde mar/2026");
    expect(linhaFina(aluno({ email: null }))).toBe("(82) 99999-0000 · desde mar/2026");
    expect(rotaDoAluno(aluno())).toBe("/painel/alunos/t1");
    expect(rotaDoAluno(aluno({ rota_id: "p9" }))).toBe("/painel/alunos/p9");
  });
});

describe("W13 — vagas do plano e limite da faixa (C96, spec 6.4 e 9)", () => {
  it("texto e limite atingido", () => {
    expect(textoVagas({ em_uso: 9, limite: 10, origem: "nova", faixa: "f10" })).toBe("9 de 10 alunos ativos");
    expect(textoVagas({ em_uso: 12, limite: null, origem: "legado_nutri", faixa: "livre" })).toBe("12 alunos ativos · sem limite");
    expect(limiteAtingido({ em_uso: 10, limite: 10, origem: "nova", faixa: "f10" })).toBe(true);
    expect(limiteAtingido({ em_uso: 9, limite: 10, origem: "nova", faixa: "f10" })).toBe(false);
    expect(limiteAtingido({ em_uso: 500, limite: null, origem: "legado_nutri", faixa: "livre" })).toBe(false);
  });
  it("a recusa do servidor vira a mensagem da W4 com o uso atual (dono e membro)", () => {
    expect(mensagemErroAlunos("limite_plano", { limite: 10, em_uso: 10, sou_dono: true }))
      .toBe("Seu plano permite 10 alunos ativos. Mude de faixa em Configurações › Plano. (10 de 10 em uso)");
    expect(mensagemErroAlunos("limite_plano", { limite: 10, em_uso: 10, sou_dono: false, dono_nome: "Lucas" }))
      .toBe("O plano da conta permite 10 alunos ativos. Fale com Lucas.");
    expect(mensagemErroAlunos("outro_profissional")).toBe("Este aluno já está com outro profissional.");
    expect(mensagemErroAlunos("codigo_que_nao_existe")).toBe("Não deu certo agora. Tente de novo.");
  });
});

describe("W13 — menu ⋮ (C31): quem pode (dono, responsável; a regra também está no banco)", () => {
  it("dono e responsável gerem; outro membro não", () => {
    expect(acoesDoAluno(aluno(), dono)).toMatchObject({ abrir: true, pdf: true, bloquear: true, desbloquear: false, desativar: true, remover: true });
    expect(acoesDoAluno(aluno(), lucas)).toMatchObject({ bloquear: true, remover: true });
    expect(acoesDoAluno(aluno(), outro)).toMatchObject({ abrir: true, bloquear: false, desativar: false, remover: false });
  });
  it("bloqueado mostra Desbloquear; desativado mostra Reativar; conta excluída não reativa; sem Treino não tem PDF", () => {
    expect(acoesDoAluno(aluno({ bloqueado: true }), dono)).toMatchObject({ bloquear: false, desbloquear: true });
    expect(acoesDoAluno(aluno({ ativo: false }), dono)).toMatchObject({ desativar: false, reativar: true, bloquear: false });
    expect(acoesDoAluno(aluno({ ativo: false, conta_excluida: true }), dono)).toMatchObject({ reativar: false });
    expect(acoesDoAluno(aluno({ treino_user_id: null }), dono).pdf).toBe(false);
  });
});

describe("W13 — filtros e leitura da resposta", () => {
  it("padrão = Ativos (o número do menu) e só manda o que está preenchido", () => {
    expect(filtrosAtivos(FILTROS_PADRAO)).toBe(false);
    expect(filtrosParaServidor(FILTROS_PADRAO)).toEqual({ situacao: "ativos" });
    expect(filtrosParaServidor({ ...FILTROS_PADRAO, q: " ana ", responsavel: "sem", pagamento: "pendente" }))
      .toEqual({ situacao: "ativos", q: "ana", responsavel: "sem", pagamento: "pendente" });
    expect(filtrosAtivos({ ...FILTROS_PADRAO, situacao: "bloqueados" })).toBe(true);
  });
  it("normaliza a resposta do banco sem quebrar com campo faltando", () => {
    const l = normalizarLista({ ok: true, total: "3", itens: [{ ...aluno(), modulos: ["treino", "x"], tags: null }], contagens: { ativos: 3 } });
    expect(l?.total).toBe(3);
    expect(l?.itens[0].modulos).toEqual(["treino"]);
    expect(l?.itens[0].tags).toEqual([]);
    expect(l?.contagens).toEqual({ ativos: 3, bloqueados: 0, desativados: 0, excluidas: 0, todos: 0 });
    expect(normalizarLista({ ok: false, erro: "sem_acesso" })).toBeNull();
  });
});

describe("W13 — exportar CSV (N-66)", () => {
  it("BOM, separador ; e o que a lista mostra", () => {
    const csv = montarCSV([aluno({ tags: ["VIP", "Manhã"], pagamento: { s: "pago", ate: "2026-10-19T12:00:00Z" } }), aluno({ nome: "Ana; Souza", ativo: false })]);
    expect(csv.startsWith("﻿Nome;E-mail;Telefone;Módulos;Personal;Nutricionista;Tags;Situação;Pagamento;Cadastro\r\n")).toBe(true);
    expect(csv).toContain("Rafael Moura;rafael@x.com;(82) 99999-0000;Treino + Nutrição;Lucas Ferreira;Camila Rocha;VIP, Manhã;Ativo;Pago até 19/10;10/03/2026");
    expect(csv).toContain('"Ana; Souza"');
    expect(csv).toContain(";Desativado;");
  });
  it("célula que começa com fórmula vira texto (sem injeção no Excel)", () => {
    expect(montarCSV([aluno({ nome: "=HYPERLINK(1)" })])).toContain("'=HYPERLINK(1)");
  });
});
