import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ sessao: null as unknown, linhas: [] as unknown[], erro: null as null | { code?: string; message: string } }));

// hml-21a: a lista vai pela função conta (`ler`, q "avisos"); src/test/contaFalsa.ts roda o motor de verdade sobre o MESMO banco falso
vi.mock("@/integrations/principal/client", async () => {
  const { invocarComConta } = await import("@/test/contaFalsa");
  const banco = {
    from: () => ({
      select: () => ({ order: () => ({ limit: async () => ({ data: h.linhas, error: h.erro }) }) }),
      update: () => ({ in: async () => ({ error: null }) }),
    }),
  };
  return {
    principalConfigurado: true,
    principal: { auth: { getSession: async () => ({ data: { session: h.sessao } }) }, ...banco, functions: { invoke: invocarComConta(banco) } },
  };
});

import { buscarAvisos } from "./useAvisos";

beforeEach(() => {
  h.sessao = null;
  h.linhas = [];
  h.erro = null;
});

describe("sino: avisos do banco principal (NF9)", () => {
  it("sem login no principal (antes da W3): sino vazio, sem erro", async () => {
    expect(await buscarAvisos()).toEqual({ disponivel: false, avisos: [] });
  });

  it("com login: lista os avisos da pessoa", async () => {
    h.sessao = { access_token: "x" };
    h.linhas = [{ id: "a1", tipo: "plano_atualizado", titulo: "Seu plano foi atualizado", link: "/dieta", lido_em: null, criado_em: "2026-09-29T10:00:00Z" }];
    const r = await buscarAvisos();
    expect(r.disponivel).toBe(true);
    expect(r.avisos).toHaveLength(1);
  });

  it("erro do banco sobe (a consulta mostra o estado de erro)", async () => {
    h.sessao = { access_token: "x" };
    h.erro = { code: "42501", message: "permission denied" };
    // hml-21a: o erro chega com o código (ErroLeitura) e a frase fixa — a mensagem crua do banco não chega mais à tela
    await expect(buscarAvisos()).rejects.toMatchObject({ codigo: "sem_acesso" });
    await expect(buscarAvisos()).rejects.not.toThrow("permission denied");
  });
});
