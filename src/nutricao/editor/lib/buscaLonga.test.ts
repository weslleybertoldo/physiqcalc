// Physiq hml-20c (revisão ⚪4) — a busca com o termo ou a palavra acima do teto do servidor (o termo 500, a palavra 100 — TEXTO_FILTRO_MAX e
// PALAVRA_MAX de _shared/nutricao-leituras.ts) é CORTADA no front antes de mandar: a palavra longa colada dá "nenhum resultado", como antes
// (o ilike/a RPC não achava nada), e não o "pedido fora do formato" (dados_invalidos) do servidor. O pedido roda no MÓDULO DE VERDADE do
// servidor (o motor e o catálogo, src/test/nutricaoFalsa.ts) sobre um banco falso vazio; cada param chega no teto.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PALAVRA_MAX, TEXTO_FILTRO_MAX } from "../../../../supabase-principal/functions/_shared/nutricao-leituras";

const EU = "c3c3c3c3-0000-4000-8000-000000000003";
const CONTA = "e5e5e5e5-0000-4000-8000-000000000005";
type Item = { q: string } & Record<string, unknown>;
const h = vi.hoisted(() => ({ corpos: [] as Array<{ acao: string; itens: Item[] }>, respostas: [] as unknown[], eu: "c3c3c3c3-0000-4000-8000-000000000003" }));
vi.mock("@/integrations/principal/client", async () => {
  const { lerPeloModulo } = await import("@/test/nutricaoFalsa");
  const vazio = { data: [], error: null, count: 0 };
  const banco = {
    from: () => ({ select: () => vazio }),
    rpc: (nome: string) => ({
      data:
        nome === "receitas_da_nutricionista" ? { ok: true, ids: [], total: 0, total_geral: 0, favoritas: 0, por_grupo: {} }
          : nome === "respostas_da_conta" ? { ok: true, total: 0, total_conta: 0, novas: 0, titulos: [], aluno: null, itens: [] }
            : null,
      error: null,
    }),
  };
  const ler = lerPeloModulo(banco, { userId: h.eu });
  return {
    PRINCIPAL_SCHEMA: "staging",
    PRINCIPAL_URL: "https://principal.teste.invalid",
    principalConfigurado: true,
    principal: {
      functions: {
        invoke: async (_f: string, o: { body: { acao: string; itens: Item[] } }) => {
          h.corpos.push(JSON.parse(JSON.stringify(o.body)));
          const r = await ler(o.body);
          h.respostas.push(r.data);
          return r;
        },
      },
      from: (t: string) => {
        throw new Error(`leitura direta na tabela ${t}`);
      },
      rpc: (f: string) => {
        throw new Error(`RPC direta ${f}`);
      },
    },
  };
});

import { listarAlimentosDoPainel } from "@/painel/dietas/alimentosPainel";
import { listarRespostasPagina } from "@/painel/preconsulta/dados";
import { listarAlimentos, paramsDaBusca } from "./alimentos";
import { listarReceitasPagina, nomesParaCopia } from "./receitas";

const LONGA = "abacaxi".repeat(40); // 280 caracteres, uma palavra só (o colar sem querer)
const itemDe = (q: string): Item => {
  const it = h.corpos.flatMap((c) => c.itens).find((x) => x.q === q);
  if (!it) throw new Error(`nenhum item ${q}`);
  return it;
};

beforeEach(() => {
  h.corpos = [];
  h.respostas = [];
});

describe("hml-20c (revisão ⚪4) — a busca corta o termo e a palavra no teto do servidor ANTES de mandar", () => {
  it("os tetos do front são os do servidor (uma constante só): o termo 500, a palavra 100", () => {
    expect([TEXTO_FILTRO_MAX, PALAVRA_MAX]).toEqual([500, 100]);
  });

  it("alimentos (o editor e o painel): a palavra longa vai cortada em 100 e o termo em 500 → nenhum resultado, sem erro", async () => {
    expect(await listarAlimentos({ q: `${LONGA} arroz`, grupo: "g".repeat(600), fonte: "" }, 0, 12)).toEqual({ itens: [], total: 0 });
    const it = itemDe("alimentos_busca");
    expect(it.palavras).toEqual([LONGA.slice(0, PALAVRA_MAX), "arroz"]);
    expect(String(it.grupo)).toHaveLength(TEXTO_FILTRO_MAX);
    h.corpos = [];
    expect(await listarAlimentosDoPainel({ q: LONGA, grupo: "", fonte: "" }, EU, 0, 20)).toEqual({ itens: [], total: 0 });
    expect(itemDe("alimentos_busca").palavras).toEqual([LONGA.slice(0, PALAVRA_MAX)]);
    // o termo enorme é cortado em 500 ANTES de partir (o "arroz" fica só com o "a"; o "feijao" sai) — e as palavras seguem no máximo 6
    const p = paramsDaBusca({ q: `${"x".repeat(498)} arroz feijao`, grupo: "", fonte: "" });
    expect(p.palavras).toEqual(["x".repeat(PALAVRA_MAX), "a"]);
    expect(paramsDaBusca({ q: "a b c d e f g h", grupo: "", fonte: "" }).palavras).toHaveLength(6);
    // a busca normal não muda
    expect(paramsDaBusca({ q: "Arroz Integral", grupo: "Cereais", fonte: "taco" })).toEqual({ palavras: ["arroz", "integral"], grupo: "Cereais", fonte: "taco" });
  });

  it("receitas: o termo da página e o nome-base da cópia no teto de 500 → nenhum resultado, sem erro", async () => {
    const r = await listarReceitasPagina({ q: `${LONGA} ${LONGA} ${LONGA}`, grupo: "", favoritas: false }, 1);
    expect(r.itens).toEqual([]);
    const filtros = itemDe("receitas_pagina").filtros as Record<string, string>;
    expect(filtros.q.length).toBeLessThanOrEqual(TEXTO_FILTRO_MAX);
    expect(filtros.q.startsWith(LONGA)).toBe(true);
    expect(await nomesParaCopia(EU, "N".repeat(700))).toEqual([]);
    expect(String(itemDe("receita_nome").base)).toHaveLength(TEXTO_FILTRO_MAX);
  });

  it("respostas da Pré-consulta: a busca, o formulário e o aluno do filtro no teto de 500 → a página vazia, sem erro", async () => {
    const p = await listarRespostasPagina(CONTA, { busca: "y".repeat(800), formulario: "z".repeat(600), aluno: "w".repeat(501), soNovas: true }, 1);
    expect(p.itens).toEqual([]);
    const filtros = itemDe("respostas_da_conta").filtros as Record<string, string>;
    expect(filtros).toEqual({ q: "y".repeat(TEXTO_FILTRO_MAX), formulario: "z".repeat(TEXTO_FILTRO_MAX), aluno: "w".repeat(TEXTO_FILTRO_MAX), novas: "true" });
  });

  it("o controle: sem o corte, o servidor recusaria (dados_invalidos) — a palavra de 101 e o termo de 501", async () => {
    const { lerPeloModulo } = await import("@/test/nutricaoFalsa");
    const ler = lerPeloModulo({ from: () => ({ select: () => ({ data: [], error: null, count: 0 }) }), rpc: () => ({ data: null, error: null }) }, { userId: EU });
    const r = await ler({
      acao: "ler",
      itens: [{ q: "alimentos_busca", palavras: ["a".repeat(PALAVRA_MAX + 1)], offset: 0, limite: 12 }, { q: "receita_nome", base: "b".repeat(TEXTO_FILTRO_MAX + 1) },
        { q: "respostas_da_conta", conta: CONTA, filtros: { q: "c".repeat(TEXTO_FILTRO_MAX + 1) }, offset: 0, limite: 20 }],
    });
    expect((r.data as { itens: unknown[] }).itens).toEqual([{ ok: false, erro: "dados_invalidos" }, { ok: false, erro: "dados_invalidos" }, { ok: false, erro: "dados_invalidos" }]);
  });
});
