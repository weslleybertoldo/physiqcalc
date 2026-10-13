// Physiq hml-21d (H-43 · jeito 2, etapa 3) — a função conta no Vitest, parte 3: o `ler` q=aluno_treino (o editor do Aluno › Treino acha o
// usuário do Treino do aluno da rota antes das funções do Treino — src/treino/editor/api.ts, acharAlunoNoTreino). Por ACRÉSCIMO: a 21a e a
// 21b não mudam (os testes delas seguem verdes; a lista do contaServidor21b.test.ts ganhou o item novo pela regra da DECISÃO 03:25).
// Positivo: a MESMA RPC (aluno_treino) com o MESMO argumento (p_aluno) que a lib mandava, como a pessoa; o valor volta como veio.
// Negativo: o aluno que não é uuid → dados_invalidos (nada vai ao banco); o dono/aluno de outro campo do corpo cai; o raise de propósito
// da w14_matricula_da_rota (sem_login, sem_acesso, aluno_inexistente) volta como o código, SEM o log.excecao (a lição do PAROU 06:28 da 21b);
// o inesperado → erro_interno sem a mensagem. E a RPC só LÊ (stable, sem insert/update/delete — por isso fica no `ler`, não vira ação).
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { type FonteRpc, type RespostaDeItem } from "../../supabase-principal/functions/_shared/leitura-lote";
import { atenderLeitura } from "../../supabase-principal/functions/_shared/leitura-servidor";
import {
  CATALOGO_CONTA, CONSULTAS_DA_21D, CONSULTAS_TREINO_DA_CONTA, ERROS_DA_MATRICULA_DA_ROTA, TODAS_AS_CONSULTAS, consultaDaConta,
} from "../../supabase-principal/functions/_shared/conta-leituras";

const RAIZ = resolve(__dirname, "../..");
const EU = "33333333-3333-4333-8333-333333333333";
const ALUNO = "a1111111-1111-4111-8111-111111111111";
const OUTRO = "99999999-9999-4999-8999-999999999999";

async function ler(itens: unknown[], rpc: (nome: string, args: Record<string, unknown>) => { data: unknown; error: unknown }) {
  const rpcs: Array<{ nome: string; args: Record<string, unknown> }> = [];
  const log = { info: vi.fn(), aviso: vi.fn(), erro: vi.fn(), excecao: vi.fn() };
  const comoPessoa = {
    rpc: (nome: string, args: Record<string, unknown>) => (rpcs.push({ nome, args }), Promise.resolve(rpc(nome, args))),
    from: () => {
      throw new Error("a aluno_treino não lê tabela");
    },
    storage: { from: () => ({}) },
  };
  const r = await atenderLeitura({ schema: "staging", corpo: { acao: "ler", itens }, userId: EU, comoPessoa, log } as never, CATALOGO_CONTA);
  return { r, itens: r.ok ? (r as { itens: RespostaDeItem[] }).itens : [], rpcs, log };
}

describe("hml-21d — a conta: q=aluno_treino (o editor do Aluno › Treino)", () => {
  it("a consulta da 21d: a RPC aluno_treino com o p_aluno do param (o que a lib mandava) e os códigos da w14_matricula_da_rota", () => {
    expect(Object.keys(CONSULTAS_TREINO_DA_CONTA)).toEqual(["aluno_treino"]);
    expect(CONSULTAS_DA_21D).toEqual(["aluno_treino"]);
    expect(TODAS_AS_CONSULTAS.at(-1)).toBe("aluno_treino");
    const f = CONSULTAS_TREINO_DA_CONTA.aluno_treino.fonte as FonteRpc;
    expect([f.rpc, f.args, f.erros]).toEqual(["aluno_treino", { p_aluno: "aluno" }, ERROS_DA_MATRICULA_DA_ROTA]);
    expect([...ERROS_DA_MATRICULA_DA_ROTA]).toEqual(["sem_login", "sem_acesso", "aluno_inexistente"]);
    expect(consultaDaConta("aluno_treino")).toBe(CONSULTAS_TREINO_DA_CONTA.aluno_treino);
    expect(Object.keys(CONSULTAS_TREINO_DA_CONTA.aluno_treino.params)).toEqual(["aluno"]);
  });

  it("o `ler`: a RPC como a pessoa, o MESMO argumento; o valor como veio; o dono/aluno de outro campo do corpo cai", async () => {
    const valor = { ok: true, paciente_id: ALUNO, user_id: OUTRO, treino_user_id: null, conta_id: OUTRO };
    const { itens, rpcs } = await ler([{ q: "aluno_treino", aluno: ALUNO.toUpperCase(), p_aluno: OUTRO, user_id: OUTRO, professor_id: OUTRO }], () => ({ data: valor, error: null }));
    expect(itens).toEqual([{ ok: true, valor }]);
    expect(rpcs).toEqual([{ nome: "aluno_treino", args: { p_aluno: ALUNO } }]);
  });

  it("o raise de propósito da w14_matricula_da_rota volta como o código (sem log.excecao); o inesperado → erro_interno sem a mensagem", async () => {
    for (const erro of ERROS_DA_MATRICULA_DA_ROTA) {
      const { itens, log } = await ler([{ q: "aluno_treino", aluno: ALUNO }], () => ({ data: null, error: { code: "P0001", message: erro } }));
      expect(itens, erro).toEqual([{ ok: false, erro }]);
      expect(log.excecao, erro).not.toHaveBeenCalled();
    }
    const x = await ler([{ q: "aluno_treino", aluno: ALUNO }], () => ({ data: null, error: { code: "XX000", message: "detalhe interno do banco" } }));
    expect(x.itens).toEqual([{ ok: false, erro: "erro_interno" }]);
    expect(JSON.stringify(x.itens)).not.toContain("detalhe");
    expect(x.log.excecao).toHaveBeenCalledTimes(1);
  });

  it("o aluno que não é uuid (ou nenhum) → dados_invalidos e nada vai ao banco", async () => {
    const { itens, rpcs } = await ler([{ q: "aluno_treino" }, { q: "aluno_treino", aluno: "a1" }, { q: "aluno_treino", aluno: 3 }], () => ({ data: null, error: null }));
    expect(itens).toEqual([{ ok: false, erro: "dados_invalidos" }, { ok: false, erro: "dados_invalidos" }, { ok: false, erro: "dados_invalidos" }]);
    expect(rpcs).toEqual([]);
  });

  it("a RPC aluno_treino só LÊ (a última definição: stable, sem insert/update/delete) — por isso fica no `ler` e não vira ação (decisão 13)", () => {
    const sql = readFileSync(resolve(RAIZ, "supabase-principal/migrations/20260930200000_w16_dieta.sql"), "utf-8");
    const ini = sql.indexOf("create or replace function {schema}.aluno_treino(");
    const corpo = sql.slice(ini, sql.indexOf("$$;", ini));
    expect(corpo).toMatch(/language plpgsql stable security definer set search_path = ''/);
    expect(corpo).not.toMatch(/\b(insert|update|delete)\b/i);
    // e nenhuma migration depois da W16 redefine a aluno_treino
    const depois = readdirSync(resolve(RAIZ, "supabase-principal/migrations")).filter((f) => f > "20260930200000_w16_dieta.sql")
      .filter((f) => readFileSync(resolve(RAIZ, "supabase-principal/migrations", f), "utf-8").includes(".aluno_treino("));
    expect(depois).toEqual([]);
  });
});
