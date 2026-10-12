// Physiq hml-20c (decisão da sessão principal na etapa 2: a série lista → assinar custava +0,5 s no Diário e no Dashboard) — a página do
// Diário e o "Diário de hoje" pedem as miniaturas NA MESMA IDA (o com_urls: o servidor assina as linhas que ele mesmo leu); a lib guarda
// as URLs no cache dela e o urlsAssinadas (o useMiniaturas de hoje) serve dali, sem ir ao servidor; o renovar (a imagem que falhou) e a
// linha sem URL vão ao diario_urls como antes. A assinatura e o tipo das libs não mudam (a linha volta SEM o campo url).
import { beforeEach, describe, expect, it, vi } from "vitest";

type Item = { q: string } & Record<string, unknown>;
const h = vi.hoisted(() => ({
  corpos: [] as Array<{ acao: string; itens: Item[] }>,
  linhas: [] as Array<Record<string, unknown>>,
  assinaturas: [] as Array<{ bucket: string; caminhos: string[] }>,
}));
vi.mock("@/integrations/principal/client", async () => {
  const { lerPeloModulo } = await import("@/test/nutricaoFalsa");
  const banco = {
    from: () => ({ select: () => ({ data: h.linhas, error: null, count: h.linhas.length }) }),
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: (caminhos: string[]) => {
          h.assinaturas.push({ bucket, caminhos });
          return { data: caminhos.map((p) => ({ path: p, error: null, signedUrl: `https://hkxv.supabase.co/storage/v1/object/sign/${bucket}/${p}?token=t` })), error: null };
        },
      }),
    },
  };
  const ler = lerPeloModulo(banco, { userId: "c3c3c3c3-0000-4000-8000-000000000003" });
  return {
    PRINCIPAL_SCHEMA: "staging",
    PRINCIPAL_URL: "https://principal.teste.invalid",
    principal: {
      functions: {
        invoke: async (_f: string, o: { body: { acao: string; itens: Item[] } }) => {
          h.corpos.push(JSON.parse(JSON.stringify(o.body)));
          return ler(o.body);
        },
      },
      from: (t: string) => {
        throw new Error(`leitura direta na tabela ${t}`);
      },
    },
  };
});

import { listarDiarioDaConta, listarDiarioPaginaComDias, urlsAssinadas } from "./diario";

const CONTA = "e5e5e5e5-0000-4000-8000-000000000005";
const R1 = "0a0a0a0a-0000-4000-8000-000000000001";
const R2 = "0a0a0a0a-0000-4000-8000-000000000002";
const R3 = "0a0a0a0a-0000-4000-8000-000000000003";
const linha = (id: string, path: string | null) => ({ id, data_hora: "2026-10-12T15:00:00.000Z", path, paciente: { id: "p", conta_id: CONTA } });
const URL_DE = (p: string) => `https://principal.teste.invalid/storage/v1/object/sign/diario-staging/${p}?token=t`;
const consultasDe = (i: number) => h.corpos[i].itens.map((x) => x.q);

beforeEach(() => {
  h.corpos = [];
  h.assinaturas = [];
  h.linhas = [linha(R1, "n/a/1.png"), linha(R2, "n/a/2.png"), linha(R3, null)];
});

describe("hml-20c — a lista do diário com as miniaturas na MESMA ida (com_urls) e o cache da lib", () => {
  it("a página do Diário: 1 ida com o com_urls; as linhas voltam SEM o url (o tipo de hoje) e o urlsAssinadas serve do cache, sem ir ao servidor", async () => {
    const p = await listarDiarioPaginaComDias(CONTA, "u1", { deIso: "2026-10-06T03:00:00.000Z", alunoId: "", soNaoReagidas: false }, 1);
    expect(h.corpos).toHaveLength(1);
    expect(h.corpos[0].itens[0]).toMatchObject({ q: "diario_pagina", com_urls: true });
    expect(h.assinaturas).toEqual([{ bucket: "diario-staging", caminhos: ["n/a/1.png", "n/a/2.png"] }]);
    expect(p.itens.map((x) => Object.keys(x).includes("url"))).toEqual([false, false, false]);
    const urls = await urlsAssinadas(p.itens);
    expect(urls).toEqual({ [R1]: URL_DE("n/a/1.png"), [R2]: URL_DE("n/a/2.png") });
    expect(h.corpos).toHaveLength(1); // nenhuma ida a mais (antes: o diario_urls em série)
  });

  it("o \"Diário de hoje\" do Dashboard: 1 ida com o com_urls e as miniaturas do cache", async () => {
    const regs = await listarDiarioDaConta(CONTA, "u1", "2026-10-12T03:00:00.000Z");
    expect(consultasDe(0)).toEqual(["diario_hoje"]);
    expect(h.corpos[0].itens[0]).toMatchObject({ com_urls: true });
    expect(regs.every((r) => !("url" in r))).toBe(true);
    expect(await urlsAssinadas(regs.slice(0, 6))).toEqual({ [R1]: URL_DE("n/a/1.png"), [R2]: URL_DE("n/a/2.png") });
    expect(h.corpos).toHaveLength(1);
  });

  it("o cache é de 1 uso: o renovar (a imagem que falhou) e o id que não veio na lista vão ao diario_urls, como hoje", async () => {
    const regs = await listarDiarioDaConta(CONTA, "u1", "2026-10-12T03:00:00.000Z");
    await urlsAssinadas(regs);
    expect(h.corpos).toHaveLength(1);
    const de_novo = await urlsAssinadas([regs[0]]);
    expect(consultasDe(1)).toEqual(["diario_urls"]);
    expect(h.corpos[1].itens[0].ids).toEqual([R1]);
    expect(de_novo[R1]).toBe(URL_DE("n/a/1.png")); // (o banco falso daqui não filtra pelos ids: o servidor de verdade relê só o R1)
  });

  it("o cache vence antes da URL (a URL vale 1 h): passado o prazo, a miniatura vai ao diario_urls", async () => {
    const agora = Date.now();
    const relogio = vi.spyOn(Date, "now").mockReturnValue(agora);
    try {
      const regs = await listarDiarioDaConta(CONTA, "u1", "2026-10-12T03:00:00.000Z");
      relogio.mockReturnValue(agora + 51 * 60_000);
      await urlsAssinadas([regs[1]]);
      expect(consultasDe(1)).toEqual(["diario_urls"]);
    } finally {
      relogio.mockRestore();
    }
  });
});
