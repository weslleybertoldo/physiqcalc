/**
 * Card do plano no pé do menu (tela 6: chips dos módulos, "Plano Treino + Nutrição", "Renova em 12/08 · cartão") para as
 * CONTAS NOVAS (W4) — situação, teste e vencimento reais da conta. As legadas continuam na regra de hoje (P9,
 * src/nucleo/planoLegado.ts). Regra pura, testada em regras.test.ts.
 */
import type { PlanoCasca } from "@/ui/casca/dadosCasca";
import type { ContaSituacao } from "../situacao";
import { NOME_PLANO_CARTAO, dataBR, diasEntre, ehPlano, fimDoAcesso, hojeSP, situacaoEfetiva } from "./regras";

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
      // o último dia com acesso (o mesmo da faixa de aviso e do "Acesso até" do Plano)
      const dias = fim ? diasEntre(hoje, fim) : 99;
      return { ...base, linha: dias === 0 ? "Vence hoje · Pix" : `Vence em ${dataBR(fim ?? c.vence_em)} · Pix`, tom: dias <= 7 ? "aviso" : "ok" };
    }
    default:
      return { ...base, linha: fim ? `Venceu em ${dataBR(fim)}` : "Plano vencido", tom: "erro" };
  }
}
