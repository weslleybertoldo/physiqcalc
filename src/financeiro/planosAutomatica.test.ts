// src/financeiro/planosAutomatica.test.ts
// Physiq W-P (§7 I1): toda mudança do valor do próximo pagamento com a automática ligada faz o PUT /preapproval; o MP é simulado.
import { describe, expect, it, vi } from "vitest";
import { novoValorDaAutomatica } from "../../supabase-principal/functions/_shared/planos-automatica";

const ativa = { mp_preapproval_id: "pre-1", status: "authorized", valor: 100, payload: {} };

describe("I1 — o valor da cobrança automática acompanha o próximo pagamento", () => {
  it("sem automática ligada (ou simulada) não chama o MP", async () => {
    const put = vi.fn();
    expect(await novoValorDaAutomatica(null, 90, put)).toBe("sem_automatica");
    expect(await novoValorDaAutomatica({ ...ativa, status: "cancelled" }, 90, put)).toBe("sem_automatica");
    expect(await novoValorDaAutomatica({ ...ativa, mp_preapproval_id: "sim-1" }, 90, put)).toBe("sem_automatica");
    expect(await novoValorDaAutomatica({ ...ativa, payload: { simulada: true } }, 90, put)).toBe("sem_automatica");
    expect(put).not.toHaveBeenCalled();
  });
  it("mesmo valor não chama o MP", async () => {
    const put = vi.fn();
    expect(await novoValorDaAutomatica(ativa, 100, put)).toBe("igual");
    expect(put).not.toHaveBeenCalled();
  });
  it("valor novo → PUT com o valor em BRL", async () => {
    const put = vi.fn(async () => ({ status: 200, body: { id: "pre-1" } }));
    expect(await novoValorDaAutomatica(ativa, 83.33, put)).toBe("atualizada");
    expect(put).toHaveBeenCalledWith("pre-1", { auto_recurring: { transaction_amount: 83.33, currency_id: "BRL" } });
  });
  it("o MP recusa ou a rede cai → falhou (quem chama avisa o dono)", async () => {
    expect(await novoValorDaAutomatica(ativa, 90, async () => ({ status: 400, body: { message: "x" } as { id?: unknown } }))).toBe("falhou");
    expect(await novoValorDaAutomatica(ativa, 90, async () => { throw new Error("rede"); })).toBe("falhou");
  });
});
