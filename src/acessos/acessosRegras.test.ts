// Physiq W-A P2 — as regras PURAS da função acessos (supabase-principal/functions/_shared/acessos-regras.ts): as mesmas que rodam na borda.
// Positivo: ler e salvar montam a RPC certa com os parâmetros DA MIGRATION (lidos do 20261012200000_wa1_acessos.sql, nome por nome); a volta
// só com a whitelist. Negativo: ação fora da lista, aluno que não é uuid, treino_series (vai pela treino-acessos, no Treino), nível que não é
// da chave, campos a mais no corpo (caem), código desconhecido da RPC (vira erro_interno, inesperado) e o status de cada código.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACOES_DE_ACESSOS, CAMPOS_DA_VOLTA, CHAVES_DE_ACESSO, NIVEIS_DA_CHAVE, RPC_DE_ACESSOS, STATUS_DO_ERRO_ACESSOS, chamadaDeAcessos,
  lerPedidoDeAcessos, statusDoErroAcessos, voltaDosAcessos,
} from "../../supabase-principal/functions/_shared/acessos-regras";

const ALUNO = "11111111-1111-4111-8111-111111111111";
const MIGRATION = readFileSync(resolve(__dirname, "../../supabase-principal/migrations/20261012200000_wa1_acessos.sql"), "utf-8");

/** Os parâmetros de uma função da migration, na ordem (o PostgREST chama a RPC pelo NOME de cada um). */
function parametros(sql: string, funcao: string): string[] {
  const m = new RegExp(`create or replace function \\{schema\\}\\.${funcao}\\(([^)]*)\\)`).exec(sql);
  if (!m) throw new Error(`a migration não tem ${funcao}`);
  return m[1].split(",").map((p) => p.trim().split(/\s+/)[0]).filter(Boolean);
}

describe("W-A P2: as regras da função acessos", () => {
  it("as listas: as 2 ações, as 4 chaves e os níveis de cada uma — as mesmas da acessos_salvar (o banco)", () => {
    expect([...ACOES_DE_ACESSOS]).toEqual(["ler", "salvar"]);
    expect([...CHAVES_DE_ACESSO]).toEqual(["acesso_app", "diario_alimentar", "acesso_link", "dieta"]);
    expect(MIGRATION).toContain("p_chave not in ('acesso_app', 'diario_alimentar', 'acesso_link', 'dieta')");
    expect(MIGRATION).toContain("(p_chave = 'dieta' and p_valor not in ('ver', 'mexer'))");
    expect(MIGRATION).toContain("(p_chave <> 'dieta' and p_valor not in ('bloqueado', 'liberado'))");
    expect(NIVEIS_DA_CHAVE).toEqual({
      acesso_app: ["bloqueado", "liberado"], diario_alimentar: ["bloqueado", "liberado"], acesso_link: ["bloqueado", "liberado"], dieta: ["ver", "mexer"],
    });
  });

  it("a RPC de cada ação com os parâmetros da migration (nome por nome)", () => {
    const ler = lerPedidoDeAcessos({ acao: "ler", aluno: ALUNO });
    const salvar = lerPedidoDeAcessos({ acao: "salvar", aluno: ALUNO, chave: "dieta", valor: "mexer" });
    if (!ler.ok || !salvar.ok) throw new Error("um pedido válido foi recusado");
    const c1 = chamadaDeAcessos(ler.pedido);
    const c2 = chamadaDeAcessos(salvar.pedido);
    expect(c1).toEqual({ rpc: RPC_DE_ACESSOS.ler, args: { p_aluno: ALUNO } });
    expect(c2).toEqual({ rpc: RPC_DE_ACESSOS.salvar, args: { p_aluno: ALUNO, p_chave: "dieta", p_valor: "mexer" } });
    expect(Object.keys(c1.args)).toEqual(parametros(MIGRATION, "acessos_ler"));
    expect(Object.keys(c2.args)).toEqual(parametros(MIGRATION, "acessos_salvar"));
  });

  it("o aluno vai em minúsculas; os campos a mais do corpo caem (paciente_id, user_id, por, alterado_por)", () => {
    const r = lerPedidoDeAcessos({ acao: "salvar", aluno: ALUNO.toUpperCase(), chave: "acesso_app", valor: "bloqueado", paciente_id: ALUNO, user_id: ALUNO, por: ALUNO, alterado_por: ALUNO });
    expect(r).toEqual({ ok: true, pedido: { acao: "salvar", aluno: ALUNO, chave: "acesso_app", valor: "bloqueado" } });
    if (r.ok) expect(chamadaDeAcessos(r.pedido).args).toEqual({ p_aluno: ALUNO, p_chave: "acesso_app", p_valor: "bloqueado" });
  });

  it.each([
    [{}, "acao_invalida", undefined],
    [{ acao: "LER", aluno: ALUNO }, "acao_invalida", undefined],
    [{ acao: "apagar", aluno: ALUNO }, "acao_invalida", undefined],
    [{ acao: ["ler"], aluno: ALUNO }, "acao_invalida", undefined],
    [{ action: "ler", aluno: ALUNO }, "acao_invalida", undefined],
    [{ acao: "ler" }, "dados_invalidos", "aluno"],
    [{ acao: "ler", aluno: "x" }, "dados_invalidos", "aluno"],
    [{ acao: "ler", aluno: 1 }, "dados_invalidos", "aluno"],
    [{ acao: "salvar", aluno: ALUNO, chave: "treino_series", valor: "ver" }, "dados_invalidos", "chave"],
    [{ acao: "salvar", aluno: ALUNO, valor: "ver" }, "dados_invalidos", "chave"],
    [{ acao: "salvar", aluno: ALUNO, chave: "dieta", valor: "liberado" }, "dados_invalidos", "valor"],
    [{ acao: "salvar", aluno: ALUNO, chave: "acesso_app", valor: "mexer" }, "dados_invalidos", "valor"],
    [{ acao: "salvar", aluno: ALUNO, chave: "acesso_link" }, "dados_invalidos", "valor"],
    [{ acao: "salvar", aluno: ALUNO, chave: "acesso_link", valor: true }, "dados_invalidos", "valor"],
  ])("recusa %j → %s (%s)", (corpo, erro, campo) => {
    expect(lerPedidoDeAcessos(corpo as Record<string, unknown>)).toEqual(campo ? { ok: false, erro, campo } : { ok: false, erro });
  });

  it("a volta: só a whitelist (os ids internos ficam no servidor); a recusa da RPC com o código; código desconhecido → erro_interno (inesperado)", () => {
    const daRpc = {
      ok: true, paciente_id: ALUNO, user_id: "u", conta_id: "c", treino_user_id: "t", tem_login: true, conta_modulos: ["treino", "nutricao"],
      modulos: ["treino"], tem_nutricionista: false, pode_mudar: true, linhas: { dieta: "ver" }, mudancas: {},
    };
    const v = voltaDosAcessos(daRpc);
    expect(Object.keys(v).sort()).toEqual(["ok", ...CAMPOS_DA_VOLTA].sort());
    for (const k of ["user_id", "conta_id", "treino_user_id"]) expect(v).not.toHaveProperty(k);
    expect(voltaDosAcessos({ ok: false, erro: "sem_nutricao" })).toEqual({ ok: false, erro: "sem_nutricao", inesperado: false });
    expect(voltaDosAcessos({ ok: false, erro: "xpto" })).toEqual({ ok: false, erro: "erro_interno", inesperado: true });
    expect(voltaDosAcessos({ ok: false, erro: "erro_interno" })).toEqual({ ok: false, erro: "erro_interno", inesperado: true });
    expect(voltaDosAcessos(null)).toEqual({ ok: false, erro: "erro_interno", inesperado: true });
    expect(voltaDosAcessos([])).toEqual({ ok: false, erro: "erro_interno", inesperado: true });
  });

  it("o status de cada código (os da spec §5.2); o desconhecido = 500", () => {
    expect(STATUS_DO_ERRO_ACESSOS).toMatchObject({
      dados_invalidos: 400, acao_invalida: 400, ajuste_invalido: 400, sem_login: 401, sem_acesso: 403, aluno_inexistente: 404,
      sem_login_do_aluno: 409, sem_nutricao: 409, corpo_grande: 413, muitas_acoes: 429, erro_interno: 500,
    });
    expect(statusDoErroAcessos("xpto")).toBe(500);
    expect(statusDoErroAcessos(undefined)).toBe(500);
  });

  it("todo código que a migration devolve de propósito tem status (lidos do SQL)", () => {
    const daMigration = new Set([...MIGRATION.matchAll(/'erro', '([a-z_]+)'/g)].map((m) => m[1]));
    expect(daMigration.size).toBeGreaterThanOrEqual(5);
    for (const c of daMigration) expect(STATUS_DO_ERRO_ACESSOS[c], c).toBeDefined();
  });
});
