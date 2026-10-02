// Physiq W28 (herdado da W4) — o instante em que o professor perde o acesso tem que ser o MESMO nos 2 bancos: o painel (núcleo,
// travaDoPainel no relógio de São Paulo) e o Banco do Treino (physiq_professor_acesso_ok, que agora olha o nucleo_acesso_ate
// espelhado contra o dia de São Paulo). Antes o Treino comparava com o current_date em UTC e travava às 21:00 do último dia.
import { describe, expect, it } from "vitest";
import { acessoProfessorOk, hojeEmSaoPaulo } from "../../supabase/functions/_shared/espelho/regras";
import { acessoAteDaConta } from "../../supabase-principal/functions/_shared/resumo-regras";
import { hojeSP, travaDoPainel, type DatasConta } from "@/nucleo/cobranca/regras";

/** Instante em São Paulo (UTC−3, sem horário de verão desde 2019). */
const sp = (dataHora: string) => new Date(`${dataHora}-03:00`);
/** A regra ANTIGA do Treino (current_date em UTC), só para mostrar a diferença. */
const antigaUtc = (ate: string, agora: Date) => ate >= agora.toISOString().slice(0, 10);

const contas: Array<{ nome: string; c: DatasConta }> = [
  { nome: "conta nova paga até 10/10", c: { situacao: "ativa", teste_ate: null, vence_em: "2026-10-10", tolerancia_dias: 0 } },
  { nome: "legado Calc no ciclo até 10/10 (+7)", c: { situacao: "ativa", teste_ate: null, vence_em: "2026-10-10", tolerancia_dias: 7 } },
  { nome: "teste até 10/10", c: { situacao: "teste", teste_ate: "2026-10-10", vence_em: null, tolerancia_dias: 0 } },
  { nome: "legado Nutri Pix até 31/10", c: { situacao: "ativa", teste_ate: null, vence_em: "2026-10-31", tolerancia_dias: 0, regra_pix: "30dias" } },
];

const instantes = [
  "2026-10-10T12:00:00", "2026-10-10T20:59:59", "2026-10-10T21:00:00", "2026-10-10T23:59:59", "2026-10-11T00:00:00",
  "2026-10-17T20:59:59", "2026-10-17T21:00:00", "2026-10-17T23:59:59", "2026-10-18T00:00:00", "2026-10-31T23:59:59",
  "2026-11-01T00:00:00", "2026-11-01T02:59:59", "2026-11-01T03:00:00",
];

describe("W28 — acesso do professor: mesmo instante no painel e no Banco do Treino", () => {
  it("hojeEmSaoPaulo = hojeSP do núcleo (o cobranca_hoje do principal)", () => {
    for (const t of instantes) expect(hojeEmSaoPaulo(sp(t))).toBe(hojeSP(sp(t)));
    expect(hojeEmSaoPaulo(sp("2026-10-10T23:59:59"))).toBe("2026-10-10");
    expect(hojeEmSaoPaulo(sp("2026-10-11T00:00:00"))).toBe("2026-10-11");
  });

  for (const { nome, c } of contas) {
    it(`${nome}: o Treino libera exatamente enquanto o painel não trava`, () => {
      const nucleo = acessoAteDaConta({ situacao: c.situacao, teste_ate: c.teste_ate, vence_em: c.vence_em, tolerancia_dias: c.tolerancia_dias });
      for (const t of instantes) {
        const agora = sp(t);
        const painelAberto = !travaDoPainel(c, hojeSP(agora)).travado;
        expect({ t, treino: acessoProfessorOk({ status: "ativo", nucleo_acesso_ate: nucleo }, agora) }).toEqual({ t, treino: painelAberto });
      }
    });
  }

  it("a regra antiga (UTC) travava 3 h antes do painel; a nova, no mesmo instante", () => {
    const ate = "2026-10-10";
    const as21 = sp("2026-10-10T21:00:00");
    expect(antigaUtc(ate, as21)).toBe(false); // antes: já travado às 21:00 de São Paulo
    expect(acessoProfessorOk({ status: "ativo", nucleo_acesso_ate: ate }, as21)).toBe(true); // agora: ainda vale até 23:59:59
    expect(acessoProfessorOk({ status: "ativo", nucleo_acesso_ate: ate }, sp("2026-10-10T23:59:59"))).toBe(true);
    expect(acessoProfessorOk({ status: "ativo", nucleo_acesso_ate: ate }, sp("2026-10-11T00:00:00"))).toBe(false);
  });

  it("sem acesso espelhado, suspenso ou isento", () => {
    const agora = sp("2026-10-10T12:00:00");
    expect(acessoProfessorOk({ status: "ativo", nucleo_acesso_ate: null }, agora)).toBe(false);
    expect(acessoProfessorOk({ status: "suspenso", nucleo_acesso_ate: "2999-12-31" }, agora)).toBe(false);
    expect(acessoProfessorOk({ status: "ativo", nucleo_acesso_ate: "2999-12-31" }, agora)).toBe(true);
    expect(acessoAteDaConta({ situacao: "isenta", teste_ate: null, vence_em: null, tolerancia_dias: 0 })).toBe("2999-12-31");
    expect(acessoAteDaConta({ situacao: "suspensa", teste_ate: null, vence_em: "2026-12-01", tolerancia_dias: 0 })).toBeNull();
  });
});
