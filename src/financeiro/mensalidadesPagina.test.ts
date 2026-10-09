import { describe, expect, it } from "vitest";
import {
  PaginaInvalida,
  casaComABusca,
  lerPagina,
  paginaDasMensalidades,
  palavrasDaBusca,
  seloDaMensalidade,
  type AlunoDoResumo,
} from "../../supabase-principal/functions/pagamentos-aluno/mensalidades";
import { badgeDoAluno } from "./api";

// hml-14b (B21): a tela Mensalidades recebe só a página do servidor (pagamentos-aluno › prof_resumo com `pagina`). A regra é a que a
// tela aplicava no navegador: a ordem (comprovante → pendente → em dia → parada; por nome), os números da conta e o selo.
const AGORA = new Date("2026-10-09T15:00:00Z");
const DEPOIS = "2026-11-01T12:00:00Z";
const ANTES = "2026-09-01T12:00:00Z";
const aluno = (i: number, p: Partial<AlunoDoResumo> = {}): AlunoDoResumo => ({
  paciente_id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, treino_user_id: null, nome: `Aluno ${String(i).padStart(2, "0")}`,
  email: null, ativo: true, mensalidade_valor: 249, plano: null, pausada: false, pago_ate: DEPOIS, desde: null, aguardando: null, abertas: 0, ...p,
});

describe("prof_resumo com `pagina` — a página da tela Mensalidades no servidor", () => {
  it("sem `pagina` (ou null) = a resposta de hoje; inteiro ≥ 1 (número ou texto) = a página; o resto é inválido", () => {
    expect(lerPagina(undefined)).toBeNull();
    expect(lerPagina(null)).toBeNull();
    expect(lerPagina(3)).toBe(3);
    expect(lerPagina("2")).toBe(2);
    for (const ruim of [0, -1, 1.5, "abc", "", NaN, {}, [], true]) expect(() => lerPagina(ruim)).toThrow(PaginaInvalida);
  });

  it("o selo é o MESMO do painel (badgeDoAluno): pago, pendente, parada ou sem mensalidade = nenhum", () => {
    const casos: Array<Partial<AlunoDoResumo>> = [
      { pago_ate: DEPOIS }, { pago_ate: ANTES }, { pago_ate: null }, { pausada: true }, { mensalidade_valor: null }, { mensalidade_valor: 0 },
    ];
    for (const c of casos) {
      const a = aluno(1, c);
      expect(seloDaMensalidade(a, AGORA)).toBe(badgeDoAluno(a, AGORA)?.s ?? null);
    }
  });

  it("41 com mensalidade: 20 por página, o total e a última com 1; a ordem é a da tela (comprovante, pendente, em dia, parada; nome)", () => {
    const alunos = [
      ...Array.from({ length: 37 }, (_, i) => aluno(i + 10)),
      aluno(5, { nome: "Zé Pendente", pago_ate: ANTES }),
      aluno(6, { nome: "Ana Parada", pausada: true }),
      aluno(7, { nome: "Bia Comprovante", pago_ate: ANTES, aguardando: "cobranca-1" }),
      aluno(8, { nome: "Caio Pendente", pago_ate: null }),
      aluno(90, { nome: "Sem Valor", mensalidade_valor: null }),
      aluno(91, { nome: "Outro Sem", mensalidade_valor: null }),
    ];
    const p1 = paginaDasMensalidades(alunos, { pagina: 1, paginaSem: 1, busca: "", agora: AGORA });
    expect([p1.total, p1.alunos.length, p1.por_pagina]).toEqual([41, 20, 20]);
    expect(p1.alunos.slice(0, 4).map((a) => a.nome)).toEqual(["Bia Comprovante", "Caio Pendente", "Zé Pendente", "Aluno 10"]);
    const p3 = paginaDasMensalidades(alunos, { pagina: 3, paginaSem: 1, busca: "", agora: AGORA });
    expect(p3.alunos.map((a) => a.nome)).toEqual(["Ana Parada"]);
    // as 3 páginas juntas = todos, sem repetir
    const todas = [1, 2, 3].flatMap((pagina) => paginaDasMensalidades(alunos, { pagina, paginaSem: 1, busca: "", agora: AGORA }).alunos.map((a) => a.paciente_id));
    expect(new Set(todas).size).toBe(41);
    expect(p1.sem).toEqual({ pagina: 1, total: 2, alunos: [alunos[42], alunos[41]] }); // "Outro Sem" antes de "Sem Valor"
    expect(p1.contagens).toEqual({ alunos: 43, com_mensalidade: 41, em_dia: 37, pendentes: 3, sem_mensalidade: 2 });
    // página além do fim: vazia, com o total (a tela vai para a última)
    expect(paginaDasMensalidades(alunos, { pagina: 9, paginaSem: 1, busca: "", agora: AGORA })).toMatchObject({ total: 41, alunos: [] });
  });

  it("a busca: sem acento, nome ou e-mail, todas as palavras; vale para as 2 listas e não mexe nos números da conta", () => {
    const alunos = [aluno(1, { nome: "José Último" }), aluno(2, { nome: "Maria", email: "ze.ultimo@x.com" }), aluno(3, { nome: "João" }),
      aluno(4, { nome: "Zélia Última", mensalidade_valor: null })];
    expect(palavrasDaBusca("  ZÉ   último ")).toEqual(["ze", "ultimo"]);
    expect(palavrasDaBusca(null)).toEqual([]);
    expect(casaComABusca(alunos[0], ["jose", "ultimo"])).toBe(true);
    const p = paginaDasMensalidades(alunos, { pagina: 1, paginaSem: 1, busca: "ultim", agora: AGORA });
    expect(p.alunos.map((a) => a.nome)).toEqual(["José Último", "Maria"]);
    expect([p.total, p.sem.total, p.sem.alunos[0].nome]).toEqual([2, 1, "Zélia Última"]);
    expect(p.contagens.alunos).toBe(4);
  });
});
