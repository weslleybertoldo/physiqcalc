import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null, loading: false, isStaff: false, isMaster: false }) }));
vi.mock("@/lib/mpClient", () => ({ invokeMp: vi.fn() }));

import type { PlanoStatus } from "@/lib/saasApi";
import { planoDoStatusLegado } from "./dadosCasca";

function status(parcial: Omit<Partial<PlanoStatus>, "professor"> & { professor?: Partial<PlanoStatus["professor"]> } = {}): PlanoStatus {
  const { professor, ...resto } = parcial;
  return {
    isento: false,
    plano: { id: "p", nome: "Start", min_alunos: 1, max_alunos: 10, valor_mensal: 49, valor_anual: null, ativo: true },
    planos: [],
    adesao: 500,
    tolerancia: 7,
    trialDias: 14,
    acessoOk: true,
    travado: false,
    diasAtraso: null,
    pagamentos: [],
    assinatura: null,
    avisos: [],
    hoje: "2026-09-29",
    ...resto,
    professor: {
      id: "x", nome: "Lucas", email: null, status: "ativo", codigo_convite: "PROF-X", plano_id: "p",
      trial_ate: null, adesao_paga_em: "2026-01-01", ciclo_inicio: "2026-09-10", ciclo_vence_em: "2026-10-10",
      ciclo_valor: 49, anual_ate: null, cobranca_pausada: false, acesso_liberado_ate: null, alunos_bloqueados_em: null,
      alunos: 7, adesao: 500, tolerancia: 7, trial_dias: 14,
      ...professor,
    },
  } as PlanoStatus;
}

describe("card do plano a partir do plano-status do Calc (regras de hoje)", () => {
  it("em dia: 'Vence em'", () => {
    expect(planoDoStatusLegado(status())).toEqual({ nome: "Plano Start", modulos: ["treino"], linha: "Vence em 10/10", tom: "ok" });
  });
  it("assinatura no cartão: 'Renova em … · cartão'", () => {
    const s = status({ assinatura: { id: "a", status: "authorized", valor: 49, created_at: "", proxima_cobranca: "2026-10-12" } });
    expect(planoDoStatusLegado(s).linha).toBe("Renova em 12/10 · cartão");
  });
  it("master/isento", () => {
    expect(planoDoStatusLegado(status({ isento: true }))).toMatchObject({ nome: "Conta master", linha: "Sem cobrança", tom: "ok" });
  });
  it("teste grátis, vencido na tolerância e travado", () => {
    expect(planoDoStatusLegado(status({ professor: { adesao_paga_em: null, trial_ate: "2026-10-05" } }))).toMatchObject({ linha: "Teste até 05/10", tom: "neutro" });
    expect(planoDoStatusLegado(status({ diasAtraso: 3, professor: { ciclo_vence_em: "2026-09-26" } }))).toMatchObject({ linha: "Venceu em 26/09", tom: "aviso" });
    expect(planoDoStatusLegado(status({ diasAtraso: 0, professor: { ciclo_vence_em: "2026-09-29" } }))).toMatchObject({ linha: "Vence hoje", tom: "aviso" });
    expect(planoDoStatusLegado(status({ travado: true }))).toMatchObject({ linha: "Plano vencido", tom: "erro" });
  });
  it("suspenso, pausado, liberado e anual", () => {
    expect(planoDoStatusLegado(status({ professor: { status: "suspenso" } })).tom).toBe("erro");
    expect(planoDoStatusLegado(status({ professor: { cobranca_pausada: true } })).linha).toBe("Cobrança pausada");
    expect(planoDoStatusLegado(status({ professor: { acesso_liberado_ate: "2026-10-01" } })).linha).toBe("Liberado até 01/10");
    expect(planoDoStatusLegado(status({ professor: { anual_ate: "2027-01-31" } })).linha).toBe("Anual até 31/01");
  });
  it("sem plano definido", () => {
    expect(planoDoStatusLegado(status({ plano: null })).nome).toBe("Plano a definir");
  });
});
