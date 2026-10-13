// Physiq W-A P2 — as regras PURAS da função aluno-dia (supabase-principal/functions/_shared/aluno-dia-regras.ts): as mesmas que rodam na borda.
// O CONTRATO: cada leitura (q) e cada gravação chama a RPC da migration com os parâmetros de lá, nome por nome, e a lista cobre TODAS as RPCs da
// pessoa da wa2 e da wa3 (nenhuma esquecida, nenhuma inventada). A FORMA: os limites do banco (nome, detalhe, "HH:MM", dias, gramas, porções,
// macros, itens, ids, janela, termo, página), o texto conferido aparado e mandado CRU, os campos de fora caindo (dono, paciente_id, origem,
// criada_por) e o status de cada código.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACOES_DO_ALUNO_DIA, LEITURAS, LIMITES, RPCS_DO_ALUNO_DIA, STATUS_DO_ERRO_ALUNO_DIA, ehData, pedidoDoAlunoDia, statusDoErroAlunoDia,
  voltaDoAlunoDia,
} from "../../supabase-principal/functions/_shared/aluno-dia-regras";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const HOJE = "2026-10-13";
const SQL = ["20261012210000_wa2_rotinas.sql", "20261012220000_wa3_dieta_livre.sql"]
  .map((f) => readFileSync(resolve(__dirname, "../../supabase-principal/migrations", f), "utf-8")).join("\n");
/** As funções de LGPD da wa3 (geradas com o corpo vivo, em maiúsculas) não são da aluno-dia. */
const DA_LGPD = new Set(["exportar_dados_aluno", "excluir_dados_aluno", "excluir_conta_profissional"]);

function parametros(funcao: string): string[] {
  const m = new RegExp(`create or replace function \\{schema\\}\\.${funcao}\\(([^)]*)\\)`).exec(SQL);
  if (!m) throw new Error(`as migrations não têm ${funcao}`);
  return m[1].split(",").map((p) => p.trim().split(/\s+/)[0]).filter(Boolean);
}

/** Um corpo VÁLIDO de cada leitura e de cada gravação (o que os clientes mandam). */
const VALIDOS: Record<string, Record<string, unknown>> = {
  "ler:rotinas": { acao: "ler", q: "rotinas", de: HOJE, ate: HOJE },
  "ler:dia": { acao: "ler", q: "dia", dia: HOJE },
  "ler:biblioteca": { acao: "ler", q: "biblioteca" },
  "ler:alimentos": { acao: "ler", q: "alimentos", termo: "arroz", pagina: 0 },
  "ler:aluno_rotinas": { acao: "ler", q: "aluno_rotinas", aluno: A, de: "2026-10-07", ate: HOJE },
  "ler:aluno_dia": { acao: "ler", q: "aluno_dia", aluno: A, de: "2026-09-13", ate: HOJE },
  rotina_salvar: { acao: "rotina_salvar", id: null, dados: { nome: "Creatina", detalhe: "5 g", tipo: "suplemento", horario: "08:00", dias_semana: [1, 2, 3, 4, 5, 6, 7], lembrete: true } },
  rotina_arquivar: { acao: "rotina_arquivar", id: A },
  rotina_marcar: { acao: "rotina_marcar", id: A, dia: HOJE, feita: true },
  rotinas_ordenar: { acao: "rotinas_ordenar", ids: [A, B] },
  dia_adicionar: { acao: "dia_adicionar", dia: HOJE, dados: { refeicao_id: A, alimento_id: B, quantidade_g: 150 } },
  dia_tirar: { acao: "dia_tirar", dia: HOJE, item: A },
  dia_desfazer: { acao: "dia_desfazer", id: A },
  extra_salvar: { acao: "extra_salvar", id: null, dados: { dia: HOJE, nome: "Lanche", horario: "16:00", ja_comi: true } },
  extra_excluir: { acao: "extra_excluir", id: A },
  extra_marcar: { acao: "extra_marcar", id: A, feita: false },
  alimento_salvar: { acao: "alimento_salvar", id: null, dados: { nome: "Pão", porcao_g: 50, energia_kcal: 280, proteina_g: 9, carboidrato_g: 55, lipidio_g: 3, fibra_g: 2 } },
  alimento_excluir: { acao: "alimento_excluir", id: A },
  receita_salvar: { acao: "receita_salvar", id: null, dados: { nome: "Vitamina", porcoes: 2, itens: [{ alimento_id: A, quantidade_g: 200 }, { aluno_alimento_id: B, quantidade_g: 100 }] } },
  receita_excluir: { acao: "receita_excluir", id: A },
  prof_rotina_salvar: { acao: "prof_rotina_salvar", aluno: A, id: null, dados: { nome: "Remédio", tipo: "remedio", horario: "20:00", lembrete: true } },
  prof_rotina_arquivar: { acao: "prof_rotina_arquivar", aluno: A, id: B },
};

const recusa = (corpo: Record<string, unknown>) => pedidoDoAlunoDia(corpo);

describe("W-A P2: o contrato da aluno-dia com as migrations", () => {
  it.each(Object.entries(VALIDOS))("%s → a RPC da lista com os parâmetros da migration (nome por nome)", (_nome, corpo) => {
    const r = pedidoDoAlunoDia(corpo);
    if (!r.ok) throw new Error(`recusado: ${JSON.stringify(r)}`);
    expect(RPCS_DO_ALUNO_DIA).toContain(r.pedido.rpc);
    expect(Object.keys(r.pedido.args)).toEqual(parametros(r.pedido.rpc));
  });

  it("a lista cobre TODAS as RPCs da pessoa da wa2 e da wa3 (nenhuma esquecida, nenhuma inventada) e os casos válidos cobrem cada uma", () => {
    const daPessoa = [...SQL.matchAll(/create or replace function \{schema\}\.([a-z_]+)\(/g)].map((m) => m[1])
      .filter((f) => !f.startsWith("wa_") && !DA_LGPD.has(f));
    expect([...new Set(RPCS_DO_ALUNO_DIA)].sort()).toEqual([...new Set(daPessoa)].sort());
    expect(Object.keys(VALIDOS)).toHaveLength(Object.keys(LEITURAS).length + ACOES_DO_ALUNO_DIA.length);
  });

  it("o módulo de cada pedido: rotinas (as do aluno), dieta (o dia, a biblioteca, a busca) e profissional (aluno_* e prof_*)", () => {
    const modulo = (k: string) => { const r = pedidoDoAlunoDia(VALIDOS[k]); return r.ok ? r.pedido.modulo : null; };
    expect(["ler:rotinas", "rotina_salvar", "rotina_marcar", "rotinas_ordenar"].map(modulo)).toEqual(["rotinas", "rotinas", "rotinas", "rotinas"]);
    expect(["ler:dia", "ler:biblioteca", "ler:alimentos", "dia_adicionar", "receita_salvar"].map(modulo)).toEqual(["dieta", "dieta", "dieta", "dieta", "dieta"]);
    expect(["ler:aluno_rotinas", "ler:aluno_dia", "prof_rotina_salvar", "prof_rotina_arquivar"].map(modulo)).toEqual(["profissional", "profissional", "profissional", "profissional"]);
  });
});

describe("W-A P2: a forma (os limites do banco) — o que cai, o que passa, o que é recusado", () => {
  it("os campos de fora caem: dono, paciente_id, origem, criada_por (no corpo e no dados); o id em minúsculas; o texto vai CRU", () => {
    const r = pedidoDoAlunoDia({ acao: "rotina_salvar", id: A.toUpperCase(), dono_user_id: B, dados: { nome: "  Creatina   da manhã ", dono_user_id: B, paciente_id: B, origem: "profissional", criada_por: B } });
    expect(r).toEqual({ ok: true, pedido: { modulo: "rotinas", acao: "rotina_salvar", q: null, rpc: "rotina_salvar", args: { p_id: A, p_dados: { nome: "  Creatina   da manhã " } } } });
    const p = pedidoDoAlunoDia({ acao: "prof_rotina_salvar", aluno: A, dados: { nome: "X", paciente_id: B } });
    expect(p.ok && p.pedido.args).toEqual({ p_aluno: A, p_id: null, p_dados: { nome: "X" } });
  });

  it("a janela: até 31 dias (ate − de ≤ 30) e na ordem; datas que existem", () => {
    expect(pedidoDoAlunoDia({ acao: "ler", q: "rotinas", de: "2026-09-13", ate: HOJE }).ok).toBe(true);
    expect(recusa({ acao: "ler", q: "rotinas", de: "2026-09-12", ate: HOJE })).toEqual({ ok: false, erro: "dados_invalidos", campo: "ate" });
    expect(recusa({ acao: "ler", q: "rotinas", de: HOJE, ate: "2026-10-12" })).toEqual({ ok: false, erro: "dados_invalidos", campo: "ate" });
    expect(ehData("2026-02-28")).toBe(true);
    for (const d of ["2026-02-30", "13/10/2026", "2026-1-3", "", 20261013, null]) expect(ehData(d), String(d)).toBe(false);
    expect(LIMITES.janelaDias).toBe(31);
  });

  it("a busca: termo ≤ 60 (aparado), página inteira 0–50 (sem página = 0)", () => {
    const sem = pedidoDoAlunoDia({ acao: "ler", q: "alimentos", termo: "arroz" });
    expect(sem.ok && sem.pedido.args).toEqual({ p_termo: "arroz", p_pagina: 0 });
    expect(pedidoDoAlunoDia({ acao: "ler", q: "alimentos", termo: `  ${"a".repeat(60)}  `, pagina: 50 }).ok).toBe(true);
    expect(recusa({ acao: "ler", q: "alimentos", termo: "a".repeat(61) })).toEqual({ ok: false, erro: "dados_invalidos", campo: "termo" });
    for (const pagina of [51, -1, 1.5, "1"]) expect(recusa({ acao: "ler", q: "alimentos", termo: "arroz", pagina })).toEqual({ ok: false, erro: "dados_invalidos", campo: "pagina" });
  });

  it.each([
    ["sem ação", {}, "acao_invalida", undefined],
    ["ação desconhecida", { acao: "apagar_tudo" }, "acao_invalida", undefined],
    ["o disfarçado {action: ler}", { action: "ler", q: "rotinas", de: HOJE, ate: HOJE }, "acao_invalida", undefined],
    ["q desconhecido", { acao: "ler", q: "xpto" }, "dados_invalidos", "q"],
    ["q ausente", { acao: "ler" }, "dados_invalidos", "q"],
    ["dia que não existe", { acao: "ler", q: "dia", dia: "2026-02-30" }, "dados_invalidos", "dia"],
    ["aluno_rotinas sem aluno", { acao: "ler", q: "aluno_rotinas", de: HOJE, ate: HOJE }, "dados_invalidos", "aluno"],
    ["rotina nova sem nome", { acao: "rotina_salvar", dados: { tipo: "habito" } }, "dados_invalidos", "nome"],
    ["nome com 61 (aparado)", { acao: "rotina_salvar", dados: { nome: "a".repeat(61) } }, "dados_invalidos", "nome"],
    ["nome só de espaços", { acao: "rotina_salvar", dados: { nome: "    " } }, "dados_invalidos", "nome"],
    ["detalhe com 121", { acao: "rotina_salvar", dados: { nome: "X", detalhe: "d".repeat(121) } }, "dados_invalidos", "detalhe"],
    ["tipo fora", { acao: "rotina_salvar", dados: { nome: "X", tipo: "vitamina" } }, "dados_invalidos", "tipo"],
    ["horário 8:00", { acao: "rotina_salvar", dados: { nome: "X", horario: "8:00" } }, "dados_invalidos", "horario"],
    ["horário 24:00", { acao: "rotina_salvar", dados: { nome: "X", horario: "24:00" } }, "dados_invalidos", "horario"],
    ["dias vazio", { acao: "rotina_salvar", dados: { nome: "X", dias_semana: [] } }, "dados_invalidos", "dias_semana"],
    ["dia 8", { acao: "rotina_salvar", dados: { nome: "X", dias_semana: [1, 8] } }, "dados_invalidos", "dias_semana"],
    ["8 dias", { acao: "rotina_salvar", dados: { nome: "X", dias_semana: [1, 2, 3, 4, 5, 6, 7, 1] } }, "dados_invalidos", "dias_semana"],
    ["lembrete sem horário (nova)", { acao: "rotina_salvar", dados: { nome: "X", lembrete: true } }, "dados_invalidos", "horario"],
    ["lembrete com horário null", { acao: "rotina_salvar", id: A, dados: { lembrete: true, horario: null } }, "dados_invalidos", "horario"],
    ["lembrete não booleano", { acao: "rotina_salvar", dados: { nome: "X", horario: "08:00", lembrete: "sim" } }, "dados_invalidos", "lembrete"],
    ["dados não objeto", { acao: "rotina_salvar", dados: [1] }, "dados_invalidos", "dados"],
    ["id ruim", { acao: "rotina_salvar", id: "x", dados: { nome: "X" } }, "dados_invalidos", "id"],
    ["marcar sem feita", { acao: "rotina_marcar", id: A, dia: HOJE }, "dados_invalidos", "feita"],
    ["ordenar vazio", { acao: "rotinas_ordenar", ids: [] }, "dados_invalidos", "ids"],
    ["ordenar 31", { acao: "rotinas_ordenar", ids: Array.from({ length: 31 }, (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`) }, "dados_invalidos", "ids"],
    ["ordenar repetido", { acao: "rotinas_ordenar", ids: [A, A] }, "dados_invalidos", "ids"],
    ["adicionar em 2 lugares", { acao: "dia_adicionar", dia: HOJE, dados: { refeicao_id: A, extra_id: B, alimento_id: A, quantidade_g: 10 } }, "dados_invalidos", "lugar"],
    ["adicionar sem lugar", { acao: "dia_adicionar", dia: HOJE, dados: { alimento_id: A, quantidade_g: 10 } }, "dados_invalidos", "lugar"],
    ["adicionar 2 origens", { acao: "dia_adicionar", dia: HOJE, dados: { refeicao_id: A, alimento_id: A, aluno_alimento_id: B, quantidade_g: 10 } }, "dados_invalidos", "origem"],
    ["adicionar 0 g", { acao: "dia_adicionar", dia: HOJE, dados: { refeicao_id: A, alimento_id: B, quantidade_g: 0 } }, "dados_invalidos", "quantidade_g"],
    ["adicionar 10000 g", { acao: "dia_adicionar", dia: HOJE, dados: { refeicao_id: A, alimento_id: B, quantidade_g: 10000 } }, "dados_invalidos", "quantidade_g"],
    ["receita em gramas", { acao: "dia_adicionar", dia: HOJE, dados: { refeicao_id: A, aluno_receita_id: B, quantidade_g: 100 } }, "dados_invalidos", "quantidade_g"],
    ["receita 21 porções", { acao: "dia_adicionar", dia: HOJE, dados: { refeicao_id: A, aluno_receita_id: B, porcoes: 21 } }, "dados_invalidos", "porcoes"],
    ["alimento em porções", { acao: "dia_adicionar", dia: HOJE, dados: { refeicao_id: A, alimento_id: B, porcoes: 1 } }, "dados_invalidos", "porcoes"],
    ["tirar sem item", { acao: "dia_tirar", dia: HOJE }, "dados_invalidos", "item"],
    ["extra nova sem dia", { acao: "extra_salvar", dados: { nome: "Lanche" } }, "dados_invalidos", "dia"],
    ["extra muda o dia", { acao: "extra_salvar", id: A, dados: { dia: HOJE } }, "dados_invalidos", "dia"],
    ["extra nome 41", { acao: "extra_salvar", dados: { dia: HOJE, nome: "n".repeat(41) } }, "dados_invalidos", "nome"],
    ["alimento 1001 kcal", { acao: "alimento_salvar", dados: { nome: "X", energia_kcal: 1001 } }, "dados_invalidos", "energia_kcal"],
    ["alimento 101 g de proteína", { acao: "alimento_salvar", dados: { nome: "X", proteina_g: 101 } }, "dados_invalidos", "proteina_g"],
    ["alimento porção 0", { acao: "alimento_salvar", dados: { nome: "X", porcao_g: 0 } }, "dados_invalidos", "porcao_g"],
    ["receita nova sem itens", { acao: "receita_salvar", dados: { nome: "X" } }, "dados_invalidos", "itens"],
    ["receita 1,5 porção", { acao: "receita_salvar", dados: { nome: "X", porcoes: 1.5, itens: [{ alimento_id: A, quantidade_g: 10 }] } }, "dados_invalidos", "porcoes"],
    ["receita 31 itens", { acao: "receita_salvar", dados: { nome: "X", itens: Array.from({ length: 31 }, () => ({ alimento_id: A, quantidade_g: 10 })) } }, "dados_invalidos", "itens"],
    ["item com os 2 ids", { acao: "receita_salvar", dados: { nome: "X", itens: [{ alimento_id: A, aluno_alimento_id: B, quantidade_g: 10 }] } }, "dados_invalidos", "itens"],
    ["prof sem aluno", { acao: "prof_rotina_salvar", dados: { nome: "X" } }, "dados_invalidos", "aluno"],
    ["prof arquivar sem id", { acao: "prof_rotina_arquivar", aluno: A }, "dados_invalidos", "id"],
  ])("recusa: %s", (_nome, corpo, erro, campo) => {
    expect(recusa(corpo as Record<string, unknown>)).toEqual(campo ? { ok: false, erro, campo } : { ok: false, erro });
  });

  it("passa: a mudança parcial (só o horário), o detalhe null/vazio, o lembrete sem horário numa rotina que já existe (o banco decide)", () => {
    for (const dados of [{ horario: "09:00" }, { detalhe: null }, { detalhe: "" }, { lembrete: true }]) {
      expect(pedidoDoAlunoDia({ acao: "rotina_salvar", id: A, dados }).ok, JSON.stringify(dados)).toBe(true);
    }
  });
});

describe("W-A P2: a volta e o status", () => {
  it("a volta é o jsonb da RPC; a recusa com o código conhecido; o resto → erro_interno (inesperado)", () => {
    expect(voltaDoAlunoDia({ ok: true, rotinas: [], feitas: [], hoje: HOJE })).toEqual({ ok: true, rotinas: [], feitas: [], hoje: HOJE });
    expect(voltaDoAlunoDia({ ok: false, erro: "dieta_travada" })).toEqual({ ok: false, erro: "dieta_travada", inesperado: false });
    expect(voltaDoAlunoDia({ ok: false, erro: "xpto" })).toEqual({ ok: false, erro: "erro_interno", inesperado: true });
    expect(voltaDoAlunoDia("x")).toEqual({ ok: false, erro: "erro_interno", inesperado: true });
  });

  it("o status de cada código da spec §5.2 e de cada código que as RPCs da aluno-dia devolvem", () => {
    expect(STATUS_DO_ERRO_ALUNO_DIA).toMatchObject({
      dados_invalidos: 400, acao_invalida: 400, sem_login: 401, sem_acesso: 403, nao_encontrado: 404, aluno_inexistente: 404,
      dieta_travada: 409, sem_login_do_aluno: 409, so_do_aluno: 409, limite: 409, corpo_grande: 413, muitas_acoes: 429, erro_interno: 500,
    });
    const daLgpd = new Set(["assinatura_ativa", "cobranca_ativa", "conta_legada", "nao_profissional", "profissional"]);
    for (const c of new Set([...SQL.matchAll(/'erro', '([a-z_]+)'/g)].map((m) => m[1]))) {
      if (!daLgpd.has(c)) expect(STATUS_DO_ERRO_ALUNO_DIA[c], c).toBeDefined();
    }
    expect(statusDoErroAlunoDia("xpto")).toBe(500);
  });
});
