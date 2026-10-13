// Physiq W-A P2 — as regras PURAS da treino-acessos (supabase/functions/_shared/treino-acessos-regras.ts), as mesmas da borda: o CORS = o da
// treino-leitura (lido do arquivo dela), a forma do pedido (acao, não o action da treino-leitura), nível ↔ series_travadas, os parâmetros das 2
// RPCs do principal (os nomes da migration 20261012200000_wa1_acessos.sql), a resposta do principal (quem lê, quem muda, o login, a conta, o id
// do Treino guardado, os módulos; as recusas; o 401; o resto = principal_indisponivel) e o status de cada código.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FREIO, LIMITE_CORPO, ORIGENS_PERMITIDAS, STATUS_DO_ERRO_TREINO_ACESSOS, argsDoLer, argsDoRegistro, corsTreinoAcessos, lerPedidoTreinoAcessos,
  nivelDasSeries, pgDaResposta, registroDeu, respostaDoAcessosLer, schemaDoPedido, statusDoErroTreino, temTreino, travadasDoNivel,
} from "../../supabase/functions/_shared/treino-acessos-regras";

const ALUNO = "11111111-1111-4111-8111-111111111111";
const U = "22222222-2222-4222-8222-222222222222";
const CONTA = "c0000000-0000-4000-8000-00000000000a";
const TREINO = "33333333-3333-4333-8333-333333333333";
const RAIZ = resolve(__dirname, "../..");
const WA1 = readFileSync(resolve(RAIZ, "supabase-principal/migrations/20261012200000_wa1_acessos.sql"), "utf-8");
const LEITURA = readFileSync(resolve(RAIZ, "supabase/functions/treino-leitura/index.ts"), "utf-8");

function parametros(funcao: string): string[] {
  const m = new RegExp(`create or replace function \\{schema\\}\\.${funcao}\\(([^)]*)\\)`).exec(WA1);
  if (!m) throw new Error(`a wa1 não tem ${funcao}`);
  return m[1].split(",").map((p) => p.trim().split(/\s+/)[0]).filter(Boolean);
}

describe("W-A P2: as regras da treino-acessos", () => {
  it("o CORS é o da treino-leitura (as mesmas origens); fora da lista → o site", () => {
    const daLeitura = [...LEITURA.split("const ALLOWED_ORIGINS = new Set([")[1].split("]);")[0].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect([...ORIGENS_PERMITIDAS].sort()).toEqual(daLeitura.sort());
    expect(corsTreinoAcessos("http://localhost:5173")["Access-Control-Allow-Origin"]).toBe("http://localhost:5173");
    expect(corsTreinoAcessos("https://exemplo.example")["Access-Control-Allow-Origin"]).toBe("https://physiqcalc.com.br");
    expect(corsTreinoAcessos(null)["Access-Control-Allow-Headers"]).toBe("authorization, x-client-info, apikey, content-type, x-schema");
  });

  it("o schema: ausente = public (como a treino-leitura e a porta-pessoa); fora da lista = null (400)", () => {
    expect(schemaDoPedido(null)).toBe("public");
    expect(schemaDoPedido(" STAGING ")).toBe("staging");
    expect(schemaDoPedido("xpto")).toBeNull();
  });

  it("a forma: ler { aluno } e salvar { aluno, valor ver|mexer }; o action da treino-leitura não vale; o aluno em minúsculas", () => {
    expect(lerPedidoTreinoAcessos({ acao: "ler", aluno: ALUNO.toUpperCase() })).toEqual({ ok: true, pedido: { acao: "ler", aluno: ALUNO } });
    expect(lerPedidoTreinoAcessos({ acao: "salvar", aluno: ALUNO, valor: "ver", treino_user_id: TREINO })).toEqual({ ok: true, pedido: { acao: "salvar", aluno: ALUNO, valor: "ver" } });
    for (const corpo of [{ action: "get", aluno: ALUNO }, { acao: "ler2", aluno: ALUNO }, [], null, "ler"]) {
      expect(lerPedidoTreinoAcessos(corpo)).toEqual({ ok: false, erro: "acao_invalida" });
    }
    expect(lerPedidoTreinoAcessos({ acao: "ler", aluno: "x" })).toEqual({ ok: false, erro: "dados_invalidos", campo: "aluno" });
    expect(lerPedidoTreinoAcessos({ acao: "salvar", aluno: ALUNO, valor: "travar" })).toEqual({ ok: false, erro: "dados_invalidos", campo: "valor" });
    expect(lerPedidoTreinoAcessos({ acao: "salvar", aluno: ALUNO, valor: true })).toEqual({ ok: false, erro: "dados_invalidos", campo: "valor" });
  });

  it("nível ↔ series_travadas: 'ver' = travadas (true); o resto (false, null, ausente) = 'mexer' — o padrão do Treino", () => {
    expect([true, false, null, undefined].map(nivelDasSeries)).toEqual(["ver", "mexer", "mexer", "mexer"]);
    expect([travadasDoNivel("ver"), travadasDoNivel("mexer")]).toEqual([true, false]);
  });

  it("os parâmetros das 2 RPCs do principal = os da migration (nome por nome)", () => {
    expect(Object.keys(argsDoLer(ALUNO))).toEqual(parametros("acessos_ler"));
    expect(Object.keys(argsDoRegistro(ALUNO, "ver", "mexer"))).toEqual(parametros("acessos_registrar_series"));
    expect(argsDoRegistro(ALUNO, "ver", "mexer")).toEqual({ p_aluno: ALUNO, p_de: "ver", p_para: "mexer" });
  });

  it("a resposta da acessos_ler: o que a função precisa; as recusas com o código; o 401; o resto = principal_indisponivel (inesperado)", () => {
    const ok = { ok: true, paciente_id: ALUNO, user_id: U, conta_id: CONTA, treino_user_id: null, pode_mudar: true, modulos: ["treino", "nutricao", 7] };
    expect(respostaDoAcessosLer(200, ok)).toEqual({ ok: true, userId: U, contaId: CONTA, treinoUserId: null, podeMudar: true, modulos: ["treino", "nutricao"] });
    expect(respostaDoAcessosLer(200, { ...ok, pode_mudar: "sim" })).toMatchObject({ ok: true, podeMudar: false });
    expect(respostaDoAcessosLer(200, { ok: false, erro: "sem_acesso" })).toEqual({ ok: false, erro: "sem_acesso", inesperado: false });
    expect(respostaDoAcessosLer(200, { ok: false, erro: "aluno_inexistente" })).toEqual({ ok: false, erro: "aluno_inexistente", inesperado: false });
    expect(respostaDoAcessosLer(401, { code: "PGRST301" })).toEqual({ ok: false, erro: "sem_login", inesperado: false });
    for (const [st, corpo] of [[200, { ok: false, erro: "xpto" }], [404, { code: "PGRST202" }], [500, null], [503, {}], [200, null]] as const) {
      expect(respostaDoAcessosLer(st, corpo), `${st}`).toEqual({ ok: false, erro: "principal_indisponivel", inesperado: true });
    }
  });

  it("módulo Treino, o registro, o código do Postgres para o log e os limites", () => {
    expect([temTreino(["treino", "nutricao"]), temTreino(["nutricao"]), temTreino([])]).toEqual([true, false, false]);
    expect([registroDeu(200, { ok: true }), registroDeu(200, { ok: false, erro: "sem_acesso" }), registroDeu(500, { ok: true })]).toEqual([true, false, false]);
    expect([pgDaResposta({ code: "PGRST202" }), pgDaResposta({ code: "42501" }), pgDaResposta({ code: "eyJ…" }), pgDaResposta(null)]).toEqual(["PGRST202", "42501", null, null]);
    expect(LIMITE_CORPO).toBe(16 * 1024);
    expect(FREIO).toEqual({ porIp: 120, porPessoa: 60 });
  });

  it("o status de cada código (spec §5.2: 404 sem_treino, 409 sem_modulo, 502 principal_indisponivel); o desconhecido = 500", () => {
    expect(STATUS_DO_ERRO_TREINO_ACESSOS).toMatchObject({
      dados_invalidos: 400, acao_invalida: 400, schema_invalido: 400, sem_login: 401, sem_acesso: 403, aluno_inexistente: 404, sem_treino: 404,
      metodo: 405, sem_modulo: 409, corpo_grande: 413, muitas_acoes: 429, erro_interno: 500, principal_indisponivel: 502,
    });
    expect(statusDoErroTreino("xpto")).toBe(500);
  });
});
