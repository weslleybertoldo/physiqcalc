import { describe, expect, it } from "vitest";
import { travaDoInadimplente } from "@/financeiro/regras";
import type { CobrancaVista, FinanceiroProfissional } from "@/financeiro/tipos";
import { perfil } from "@/test/fixturesPerfilAluno";
import {
  LANCAMENTOS_VISIVEIS, bloqueadoPorPagamento, modulosDoPerfil, podeVerDiarioDoAluno, resumoDaTrava, rotaDoDiarioDoAluno, rotaDosLancamentosDoAluno,
} from "./regras";

const agora = new Date("2026-10-02T15:00:00Z");
const dia = (n: number) => new Date(agora.getTime() + n * 86_400_000).toISOString();
const diaSP = (n: number) => new Date(agora.getTime() + n * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

function cobranca(p: Partial<CobrancaVista> = {}): CobrancaVista {
  return {
    id: "cb1", paciente_id: "p1", tipo: "mensalidade", descricao: "Mensalidade", valor: 249, vencimento: diaSP(-40), status: "paga", forma: "pix_manual",
    metodo: null, mes_ref: null, pago_em: dia(-40), enviado_em: null, cobre_de: null, cobre_ate: null, comprovante: false, comprovante_pdf: false,
    recusado_motivo: null, recusado_em: null, reembolsado_em: null, mp_status: null, mp: false, mp_simulado: false, transacao_id: null, pix_qr: null,
    pix_copia_cola: null, pix_expira_em: null, criado_por: null, confirmado_em: null, created_at: dia(-40), ...p,
  };
}

function financeiro(p: Partial<FinanceiroProfissional> = {}, conta: Partial<FinanceiroProfissional["conta"]> = {}): FinanceiroProfissional {
  return {
    ok: true, ambiente: "staging", simulacao: true, hoje: diaSP(0), agora: agora.toISOString(),
    aluno: { paciente_id: "p1", treino_user_id: "t1", nome: "Rafael Moura", email: "r@teste.com", cpf: null, foto_url: null, ativo: true, tags: [], conta_id: "c1", conta_nome: "Conta", tem_login: true },
    permissoes: { master: false, dono: true, responsavel: true, mensalidade: true },
    conta: { id: "c1", nome: "Conta", modo: "pix_manual", bloquear: true, origem: "nova", chave: null, ...conta },
    planos: [], mensalidade: { valor: 249, plano_id: null, plano: "Mensal", pausada: false, pago_ate: dia(20), desde: dia(-60), coberta: true },
    assinatura: null, cobrancas: [], ...p,
  };
}

describe("H4 (N-64) — selo \"BLOQUEADO (pagamento)\": a MESMA regra da trava do app (travaDoInadimplente), sem mudar a regra", () => {
  const vencida = { valor: 249, plano_id: null, plano: "Mensal", pausada: false, pago_ate: dia(-3), desde: dia(-60), coberta: false };
  it("conta que bloqueia o inadimplente + mensalidade vencida → selo (e a trava do app diz o mesmo)", () => {
    const d = financeiro({ mensalidade: vencida });
    expect(bloqueadoPorPagamento(d, true, agora)).toBe(true);
    expect(travaDoInadimplente(resumoDaTrava(d)!, agora)).toBe(true);
  });
  it("sem selo: a conta não bloqueia, em dia, comprovante aguardando, cobrança pausada ou aluno desativado", () => {
    expect(bloqueadoPorPagamento(financeiro({ mensalidade: vencida }, { bloquear: false }), true, agora)).toBe(false);
    expect(bloqueadoPorPagamento(financeiro(), true, agora)).toBe(false);
    expect(bloqueadoPorPagamento(financeiro({
      mensalidade: vencida, cobrancas: [cobranca({ status: "aguardando_confirmacao", vencimento: diaSP(-3) })],
    }), true, agora)).toBe(false);
    expect(bloqueadoPorPagamento(financeiro({ mensalidade: { ...vencida, pausada: true } }), true, agora)).toBe(false);
    expect(bloqueadoPorPagamento(financeiro({ mensalidade: vencida }), false, agora)).toBe(false);
    expect(bloqueadoPorPagamento(null, true, agora)).toBe(false);
  });
  it("cobrança avulsa em aberto e vencida também trava (como no app); a de amanhã, não", () => {
    expect(bloqueadoPorPagamento(financeiro({ cobrancas: [cobranca({ id: "a1", tipo: "avulsa", status: "aberta", vencimento: diaSP(-1) })] }), true, agora)).toBe(true);
    expect(bloqueadoPorPagamento(financeiro({ cobrancas: [cobranca({ id: "a1", tipo: "avulsa", status: "aberta", vencimento: diaSP(1) })] }), true, agora)).toBe(false);
  });
  it("quem não vê a mensalidade (P6: membro que não é o dono) não ganha selo — sem ela o selo mentiria", () => {
    const d = financeiro({ mensalidade: null, permissoes: { master: false, dono: false, responsavel: true, mensalidade: false } });
    expect(resumoDaTrava(d)).toBeNull();
    expect(bloqueadoPorPagamento(d, true, agora)).toBe(false);
  });
  it("o resumo montado tem o que a financeiro_do_aluno manda ao app (bloqueio da conta, mensalidade, abertas, aguardando)", () => {
    const r = resumoDaTrava(financeiro({
      mensalidade: vencida,
      cobrancas: [cobranca({ id: "a1", tipo: "avulsa", status: "aberta", vencimento: diaSP(5), valor: 80, descricao: "Avaliação" }), cobranca({ id: "a2", tipo: "avulsa", status: "aguardando_confirmacao" })],
    }));
    expect(r).toMatchObject({
      bloquear_inadimplente: true, mensalidade_valor: 249, pausada: false, pago_ate: vencida.pago_ate, aguardando: false, aguardando_avulsas: 1,
      abertas: [{ id: "a1", descricao: "Avaliação", valor: 80, vencimento: diaSP(5) }],
    });
  });
});

describe("H4 (C57/N-5) — abas do perfil para o master que abre aluno de outra conta", () => {
  const ativa = { id: "c-master", modulos: ["treino"] as ("treino" | "nutricao")[] };
  it("master + aluno de outra conta → os módulos da conta do aluno", () => {
    expect(modulosDoPerfil(ativa, perfil({ conta_id: "c1", conta_modulos: ["treino", "nutricao"] }), true)).toEqual(["treino", "nutricao"]);
    expect(modulosDoPerfil(null, perfil({ conta_id: "c1", conta_modulos: ["nutricao"] }), true)).toEqual(["nutricao"]);
  });
  it("profissional (não master), aluno da conta ativa ou perfil carregando → os módulos da conta ativa (a regra de sempre)", () => {
    expect(modulosDoPerfil(ativa, perfil({ conta_id: "c1", conta_modulos: ["nutricao"] }), false)).toEqual(["treino"]);
    expect(modulosDoPerfil({ id: "c1", modulos: ["treino", "nutricao"] }, perfil({ conta_id: "c1" }), true)).toEqual(["treino", "nutricao"]);
    expect(modulosDoPerfil(ativa, undefined, true)).toEqual(["treino"]);
    expect(modulosDoPerfil(null, undefined, false)).toEqual(["treino"]);
    expect(modulosDoPerfil(ativa, perfil({ conta_id: null, conta_modulos: [] }), true)).toEqual(["treino"]);
  });
});

describe("H4 (N-27) — \"Ver diário\" no Resumo: só para quem vê o Diário (regra clínica W18/W24)", () => {
  const conta = (papeis: string[], modulos = ["treino", "nutricao"], id = "c1") => ({ id, papeis, modulos });
  it("nutricionista da conta (com Nutrição) e o master veem; o link abre o Diário só deste aluno", () => {
    expect(podeVerDiarioDoAluno(conta(["nutricionista"]), perfil(), false)).toBe(true);
    expect(podeVerDiarioDoAluno(conta(["dono"]), perfil(), true)).toBe(true);
    expect(rotaDoDiarioDoAluno("p 1")).toBe("/painel/dietas?aba=diario&aluno=p%201");
  });
  it("não veem: personal ou dono sem o papel de nutri, conta sem Nutrição, aluno sem Nutrição, aluno de OUTRA conta, sem conta ativa", () => {
    expect(podeVerDiarioDoAluno(conta(["dono", "personal"]), perfil(), false)).toBe(false);
    expect(podeVerDiarioDoAluno(conta(["nutricionista"], ["treino"]), perfil(), false)).toBe(false);
    expect(podeVerDiarioDoAluno(conta(["nutricionista"]), perfil({ modulos: ["treino"] }), false)).toBe(false);
    expect(podeVerDiarioDoAluno(conta(["nutricionista"], ["treino", "nutricao"], "c9"), perfil(), true)).toBe(false);
    expect(podeVerDiarioDoAluno(null, perfil(), true)).toBe(false);
  });
});

describe("H4 (N-45) — Financeiro do aluno: \"Ver todos\" e o caminho para editar/estornar no Financeiro", () => {
  it("os 12 mais recentes por padrão", () => {
    expect(LANCAMENTOS_VISIVEIS).toBe(12);
  });
  it("Lançamentos filtrados pelo nome, do 1º lançamento do aluno até hoje", () => {
    expect(rotaDosLancamentosDoAluno("Rafael Moura", ["2026-09-30", "2025-01-15", "2026-03-02"], "2026-10-02"))
      .toBe("/painel/financeiro?aba=lancamentos&q=Rafael+Moura&de=2025-01-15&ate=2026-10-02");
    // lançamento com data no futuro (agendado): o período vai até ele
    expect(rotaDosLancamentosDoAluno("Ana", ["2026-12-01"], "2026-10-02")).toBe("/painel/financeiro?aba=lancamentos&q=Ana&de=2026-10-02&ate=2026-12-01");
    expect(rotaDosLancamentosDoAluno(" ", [], "2026-10-02")).toBe("/painel/financeiro?aba=lancamentos");
  });
});
