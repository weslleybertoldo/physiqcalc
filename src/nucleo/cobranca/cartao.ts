/**
 * Card do plano no pé do menu (tela 6: chips dos módulos, "Plano Treino + Nutrição", "Renova em 12/08 · cartão") das contas que o
 * NÚCLEO cobra (W4) — situação, teste e vencimento reais da conta. W28: inclui as legadas (cobranca_legada = false; no legado
 * Calc, "Vence em" é o vencimento e, nos dias de tolerância, "Venceu em … · pague até …"). A conta isenta e a do master usam o
 * planoCartaoConta. Regras puras, testadas em regras.test.ts.
 */
import type { PlanoCasca } from "@/ui/casca/dadosCasca";
import type { ContaSituacao } from "../situacao";
import { NOME_PLANO_CARTAO, dataBR, diasEntre, ehPlano, emTolerancia, fimDoAcesso, hojeSP, situacaoEfetiva, vencimentoDoPlano } from "./regras";

/** A assinatura no cartão que a minha_situacao() manda por conta (W4). */
export function assinaturaDaConta(c: Pick<ContaSituacao, "assinatura">): { status: string; proximo_vencimento: string | null; valor: number | null } | null {
  const a = c.assinatura;
  if (!a || typeof a !== "object" || !a.status) return null;
  const valor = a.valor === null || a.valor === undefined || Number.isNaN(Number(a.valor)) ? null : Number(a.valor);
  return { status: a.status, proximo_vencimento: a.proximo_vencimento ?? null, valor };
}

export function recorrenteAtiva(c: Pick<ContaSituacao, "assinatura">): boolean {
  return assinaturaDaConta(c)?.status === "authorized";
}

/** Valor mensal de hoje da conta (a minha_situacao() manda — W4). */
export function valorMensalDaConta(c: Pick<ContaSituacao, "valor_mensal">): number | null {
  const v = c.valor_mensal;
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export function planoCartaoContaNova(c: ContaSituacao, hoje: string = hojeSP()): PlanoCasca {
  const nome = ehPlano(c.plano) ? NOME_PLANO_CARTAO[c.plano] : "Plano";
  const base = { nome, modulos: c.modulos };
  const datas = { situacao: c.situacao, teste_ate: c.teste_ate, vence_em: c.vence_em, tolerancia_dias: c.tolerancia_dias };
  const s = situacaoEfetiva(datas, hoje);
  const fim = fimDoAcesso(datas);
  const assinatura = assinaturaDaConta(c);
  const recorrente = assinatura?.status === "authorized";
  switch (s) {
    case "isenta":
      return { ...base, linha: "Sem cobrança", tom: "ok" };
    case "suspensa":
      return { ...base, linha: "Conta suspensa", tom: "erro" };
    case "cancelada":
      return { ...base, linha: "Conta cancelada", tom: "erro" };
    case "teste": {
      const quase = fim ? diasEntre(hoje, fim) <= 2 : false;
      return { ...base, linha: `Teste até ${dataBR(c.teste_ate)}${recorrente ? " · cartão" : ""}`, tom: quase && !recorrente ? "aviso" : "neutro" };
    }
    case "ativa": {
      if (recorrente) {
        // renova no fim do que já está pago (a 1ª cobrança da assinatura cai no vencimento — o próximo do MP é o mesmo dia)
        const quando = c.vence_em ?? assinatura?.proximo_vencimento?.slice(0, 10) ?? null;
        return { ...base, linha: `Renova em ${dataBR(quando)} · cartão`, tom: "ok" };
      }
      // W28 (legado Calc): nos dias de tolerância o plano já venceu — o painel ainda abre até o "pague até"
      if (emTolerancia(datas, hoje)) return { ...base, linha: `Venceu em ${dataBR(c.vence_em)} · pague até ${dataBR(fim)}`, tom: "erro" };
      // o vencimento (o mesmo da faixa de aviso): sem tolerância é o último dia com acesso; com ela, o vence_em
      const vence = vencimentoDoPlano(datas) ?? fim;
      const dias = vence ? diasEntre(hoje, vence) : 99;
      return { ...base, linha: dias === 0 ? "Vence hoje · Pix" : `Vence em ${dataBR(vence ?? c.vence_em)} · Pix`, tom: dias <= 7 ? "aviso" : "ok" };
    }
    default: {
      // "Venceu em" é o vencimento (no legado Calc, antes dos 7 dias de tolerância)
      const venceu = vencimentoDoPlano(datas) ?? fim;
      return { ...base, linha: venceu ? `Venceu em ${dataBR(venceu)}` : "Plano vencido", tom: "erro" };
    }
  }
}

function dataCurta(d: string | null | undefined): string {
  if (!d) return "";
  const x = new Date(d.length === 10 ? `${d}T12:00:00` : d);
  if (Number.isNaN(x.getTime())) return "";
  return x.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

/**
 * Card do plano da conta isenta e do master (W3): "Sem cobrança" / "Conta master"; para o master numa conta que paga, a linha da
 * situação da conta (teste, vencimento) sem as regras do núcleo.
 */
export function planoCartaoConta(c: ContaSituacao, master = false): PlanoCasca {
  const base = { nome: master && c.situacao === "isenta" ? "Conta master" : NOME_PLANO_CARTAO[c.plano] ?? "Plano", modulos: c.modulos };
  switch (c.situacao) {
    case "isenta":
      return { ...base, linha: "Sem cobrança", tom: "ok" };
    case "teste":
      return { ...base, linha: c.teste_ate ? `Teste até ${dataCurta(c.teste_ate)}` : "Em teste", tom: "neutro" };
    case "ativa":
      return { ...base, linha: c.vence_em ? `Vence em ${dataCurta(c.vence_em)}` : "Conta ativa", tom: "ok" };
    case "vencida":
      return { ...base, linha: c.vence_em ? `Venceu em ${dataCurta(c.vence_em)}` : "Plano vencido", tom: "erro" };
    case "suspensa":
      return { ...base, linha: "Conta suspensa", tom: "erro" };
    default:
      return { ...base, linha: "Conta cancelada", tom: "erro" };
  }
}
