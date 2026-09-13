import { describe, expect, it, vi } from "vitest";
import type { MpPagamento } from "@/lib/mpClient";

// planoTexto → saasApi → client do Supabase: no CI não existe .env (createClient lança "supabaseUrl is required") → mock
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
  DB_SCHEMA: "public",
}));
import type { PlanoStatus } from "@/lib/saasApi";
import { addDias, ehPixSimulado, faixaAlunos, liberaPagarCicloEm, mensagemErroPlano, pixAberto, podePagarCiclo, situacaoPlano, valorAnualDe, valorMensalDe } from "./planoTexto";

const base: PlanoStatus = {
  isento: false,
  professor: {
    id: "p1", nome: "Prof", email: null, status: "ativo", codigo_convite: "PROF-X", plano_id: "pl1",
    trial_ate: null, adesao_paga_em: "2026-08-13", ciclo_inicio: "2026-08-13", ciclo_vence_em: "2026-09-12", ciclo_valor: 79.9,
    anual_ate: null, cobranca_pausada: false, acesso_liberado_ate: null, alunos_bloqueados_em: null, alunos: 5, adesao: 500, tolerancia: 7, trial_dias: 14,
  },
  plano: { id: "pl1", nome: "Studio", min_alunos: 1, max_alunos: 20, valor_mensal: 79.9, valor_anual: null, ativo: true },
  planos: [], adesao: 500, tolerancia: 7, trialDias: 14, acessoOk: true, travado: false, diasAtraso: -8,
  pagamentos: [], assinatura: null, avisos: [], hoje: "2026-09-04",
};
const mk = (prof: Partial<PlanoStatus["professor"]> = {}, resto: Partial<PlanoStatus> = {}): PlanoStatus =>
  ({ ...base, ...resto, professor: { ...base.professor, ...prof } });

describe("situacaoPlano (linguagem simples)", () => {
  it("em dia: ciclo e próximo pagamento", () => {
    const s = situacaoPlano(base);
    expect(s.badge).toBe("Em dia");
    expect(s.titulo).toContain("13/08/2026 → 12/09/2026");
    expect(s.detalhe).toContain("12/09/2026");
    expect(s.detalhe).toContain("79,90");
  });

  it("vencido dentro da tolerância: dias de atraso e data-limite", () => {
    const s = situacaoPlano(mk({}, { hoje: "2026-09-14", diasAtraso: 2 }));
    expect(s.badge).toBe("Vencido");
    expect(s.titulo).toContain("venceu há 2 dias (12/09/2026)");
    expect(s.titulo).toContain("pague até 19/09/2026");
  });

  it("vence hoje", () => {
    expect(situacaoPlano(mk({}, { hoje: "2026-09-12", diasAtraso: 0 })).titulo).toContain("vence hoje");
  });

  it("travado depois da tolerância", () => {
    const s = situacaoPlano(mk({}, { hoje: "2026-09-25", diasAtraso: 13, travado: true, acessoOk: false }));
    expect(s.badge).toBe("Travado");
    expect(s.titulo).toContain("TRAVADO");
    expect(s.titulo).toContain("7 dias de tolerância");
  });

  it("teste grátis (sem adesão) e trial vencido travado", () => {
    expect(situacaoPlano(mk({ adesao_paga_em: null, ciclo_inicio: null, ciclo_vence_em: null, trial_ate: "2026-09-10" }, { diasAtraso: null })).badge).toBe("Teste grátis");
    const trav = situacaoPlano(mk({ adesao_paga_em: null, ciclo_inicio: null, ciclo_vence_em: null, trial_ate: "2026-09-01" }, { diasAtraso: null, travado: true, acessoOk: false }));
    expect(trav.badge).toBe("Travado");
    expect(trav.titulo).toContain("01/09/2026");
    expect(trav.detalhe).toContain("500,00");
  });

  it("sem adesão e sem trial", () => {
    expect(situacaoPlano(mk({ adesao_paga_em: null, ciclo_vence_em: null }, { diasAtraso: null })).badge).toBe("Sem adesão");
  });

  it("anual, cobrança pausada, liberado pelo master e suspenso têm prioridade", () => {
    expect(situacaoPlano(mk({ anual_ate: "2027-01-01" })).badge).toBe("Anual");
    expect(situacaoPlano(mk({ cobranca_pausada: true }, { travado: true })).badge).toBe("Cobrança pausada");
    const lib = situacaoPlano(mk({ acesso_liberado_ate: "2026-09-30", ciclo_vence_em: "2026-08-30" }, { hoje: "2026-09-04", diasAtraso: 5 }));
    expect(lib.badge).toBe("Liberado");
    expect(lib.detalhe).toContain("30/08/2026");
    expect(situacaoPlano(mk({ status: "suspenso" })).badge).toBe("Suspenso");
  });

  it("conta isenta (master) — selo neutro, sem a palavra Master", () => {
    expect(situacaoPlano(mk({}, { isento: true }))).toMatchObject({ badge: "Sem cobrança", titulo: "Esta conta não tem cobrança de plano." });
  });
});

describe("regras de pagamento do ciclo", () => {
  it("libera 3 dias antes do vencimento", () => {
    expect(liberaPagarCicloEm(base)).toBe("2026-09-09");
    expect(podePagarCiclo(mk({}, { hoje: "2026-09-08" }))).toBe(false);
    expect(podePagarCiclo(mk({}, { hoje: "2026-09-09" }))).toBe(true);
    expect(podePagarCiclo(mk({}, { hoje: "2026-09-12" }))).toBe(true);
    expect(podePagarCiclo(mk({}, { hoje: "2026-09-20" }))).toBe(true);
    expect(podePagarCiclo(mk({ ciclo_vence_em: null }))).toBe(false);
  });

  it("addDias atravessa mês e ano", () => {
    expect(addDias("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDias("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("valores: mensal do ciclo, anual = 10× quando não definido", () => {
    expect(valorMensalDe(base)).toBe(79.9);
    expect(valorMensalDe(mk({ ciclo_valor: null }))).toBe(79.9);
    expect(valorMensalDe(mk({ ciclo_valor: "99.90" }))).toBe(99.9);
    expect(valorAnualDe(base)).toBeCloseTo(799, 5);
    expect(valorAnualDe(mk({}, { plano: { ...base.plano!, valor_anual: "700" } }))).toBe(700);
    expect(valorAnualDe(mk({}, { plano: null }))).toBeNull();
  });

  it("faixa de alunos", () => {
    expect(faixaAlunos({ min_alunos: 1, max_alunos: 20 })).toBe("até 20 alunos");
    expect(faixaAlunos({ min_alunos: 21, max_alunos: 50 })).toBe("de 21 a 50 alunos");
    expect(faixaAlunos({ min_alunos: 51, max_alunos: null })).toBe("a partir de 51 alunos");
    expect(faixaAlunos({ min_alunos: 0, max_alunos: null })).toBe("alunos ilimitados");
  });
});

describe("Pix pendente", () => {
  const agora = Date.parse("2026-09-04T12:00:00Z");
  const pix = (o: Partial<MpPagamento>): MpPagamento => ({
    id: "x", tipo: "pix", valor: 500, mes_ref: "2026-09-01", status: "pending", created_at: "2026-09-04T10:00:00Z",
    pix_qr_code: "000201...", pix_expira_em: "2026-09-07T10:00:00Z", tipo_cobranca: "adesao", ...o,
  });

  it("acha o Pix pendente válido do tipo pedido", () => {
    const lista = [pix({ id: "a", tipo_cobranca: "mensal" }), pix({ id: "b" })];
    expect(pixAberto(lista, "adesao", agora)?.id).toBe("b");
    expect(pixAberto(lista, "mensal", agora)?.id).toBe("a");
    expect(pixAberto(lista, "anual", agora)).toBeNull();
  });

  it("ignora vencido, pago e sem código; mantém o simulado mesmo vencido", () => {
    expect(pixAberto([pix({ pix_expira_em: "2026-09-01T00:00:00Z" })], "adesao", agora)).toBeNull();
    expect(pixAberto([pix({ status: "approved" })], "adesao", agora)).toBeNull();
    expect(pixAberto([pix({ pix_qr_code: null })], "adesao", agora)).toBeNull();
    const sim = pix({ pix_qr_code: "SIMULADO-SANDBOX-MP-INDISPONIVEL", pix_expira_em: "2026-09-01T00:00:00Z", mp_payment_id: "sim-1" });
    expect(pixAberto([sim], "adesao", agora)?.id).toBe("x");
    expect(ehPixSimulado(sim)).toBe(true);
    expect(ehPixSimulado(pix({}))).toBe(false);
  });
});

describe("mensagemErroPlano", () => {
  it("traduz os códigos da edge e cai no fallback", () => {
    expect(mensagemErroPlano("ainda_no_ciclo", { venceEm: "2026-09-12" })).toContain("(12/09/2026)");
    expect(mensagemErroPlano("alunos_acima_do_limite")).toContain("não cabe");
    expect(mensagemErroPlano("xyz", {}, "Falhou")).toBe("Falhou");
  });
});
