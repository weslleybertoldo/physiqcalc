// Fixtures do núcleo (W3) para os testes: conta, matrícula e situação no formato da minha_situacao().
import type { ContaSituacao, MatriculaSituacao, Situacao } from "@/nucleo/situacao";

export function conta(o: Partial<ContaSituacao> = {}): ContaSituacao {
  return {
    id: "c1", nome: "Consultoria Ferreira", origem: "nova", plano: "treino_nutricao", modulos: ["treino", "nutricao"], faixa: "f10",
    periodicidade: "mensal", situacao: "teste", teste_ate: "2026-10-13", vence_em: null, tolerancia_dias: 0, cobranca_legada: false,
    isenta_motivo: null, alunos_bloqueados_em: null, alunos_bloqueados_msg: null, dono_id: "u1", dono_nome: "Lucas", membro_id: "m1",
    papeis: ["dono", "personal"], codigo_convite: "PROF-LUCAS", profissionais: 2, alunos_ativos: 5, limite_alunos: 10, ...o,
  };
}

export function matricula(o: Partial<MatriculaSituacao> = {}): MatriculaSituacao {
  return {
    id: "p1", conta_id: "c1", conta_nome: "Consultoria Ferreira", conta_origem: "legado_calc", ativo: true, origem: "calc", modulos: ["treino"],
    bloqueada: false, bloqueio_msg: null, bloqueado_por_pagamento: false, conta_alunos_bloqueados_em: null, conta_alunos_bloqueados_msg: null,
    personal: { id: "u9", nome: "Lucas" }, nutricionista: null, ...o,
  };
}

export function situacao(o: Partial<Situacao> = {}): Situacao {
  return {
    versao: 1, user_id: "u1", email: "a@b.com", nome: "Rafael", foto_url: null, master: false, papel_legado: "pessoa", calc: false,
    contas: [], matriculas: [], modulos_aluno: [], precisa_treino: false, sem_nada: false, legado_nutri: null, aviso_mudanca: null,
    gerado_em: "2026-09-29T09:00:00Z", ...o,
  };
}
