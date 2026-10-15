import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACOES,
  acaoDoLog,
  periodoDoVolumeValido,
  respostaDoResolver,
  VOLUME_PRATICADO_MAX_DIAS,
} from "../../supabase/functions/admin-semana-treinos/regras";
import { codigoValido } from "../../supabase/functions/_shared/erros";

// hml-14 (H-51 item 5 e H-32) — as decisões puras da admin-semana-treinos: o que o resolverAluno responde e o período que o
// volumePraticado aceita.
const TREINO_ID = "dddddddd-0000-4000-8000-000000000004";

describe("respostaDoResolver (H-51 item 5): sem vínculo e sem acesso respondem IGUAL", () => {
  it("com vínculo e quem chama vê o aluno → o id do Treino", () => {
    expect(respostaDoResolver(TREINO_ID, true)).toEqual({ resposta: { treino_user_id: TREINO_ID }, semAcesso: false });
  });

  it("sem vínculo → { treino_user_id: null }, sem log", () => {
    expect(respostaDoResolver(null, false)).toEqual({ resposta: { treino_user_id: null }, semAcesso: false });
    expect(respostaDoResolver(null, true)).toEqual({ resposta: { treino_user_id: null }, semAcesso: false });
  });

  it("com vínculo que quem chama NÃO vê → a mesma resposta de sem vínculo (antes: 403), e o semAcesso vai só para o log", () => {
    const semAcesso = respostaDoResolver(TREINO_ID, false);
    expect(semAcesso).toEqual({ resposta: { treino_user_id: null }, semAcesso: true });
    // o que sai para quem chama é idêntico, byte a byte
    expect(JSON.stringify(semAcesso.resposta)).toBe(JSON.stringify(respostaDoResolver(null, false).resposta));
  });
});

describe("periodoDoVolumeValido (H-32, D9): no máximo 31 dias", () => {
  it("a semana que a tela pede (7 dias) vale", () => {
    expect(periodoDoVolumeValido("2026-10-05", "2026-10-11")).toBe(true);
  });

  it("1 dia (início = fim) vale", () => {
    expect(periodoDoVolumeValido("2026-10-09", "2026-10-09")).toBe(true);
  });

  it("31 dias (contando o 1º e o último) vale; 32 não", () => {
    expect(VOLUME_PRATICADO_MAX_DIAS).toBe(31);
    expect(periodoDoVolumeValido("2026-01-01", "2026-01-31")).toBe(true);
    expect(periodoDoVolumeValido("2026-01-01", "2026-02-01")).toBe(false);
  });

  it("60 dias → não vale (a prova da spec §4)", () => {
    expect(periodoDoVolumeValido("2026-08-01", "2026-09-29")).toBe(false);
  });

  it("atravessa o ano e o fevereiro bissexto contando os dias certos", () => {
    expect(periodoDoVolumeValido("2025-12-15", "2026-01-14")).toBe(true); // 31 dias
    expect(periodoDoVolumeValido("2028-02-01", "2028-03-02")).toBe(true); // 2028 é bissexto: 31 dias
    expect(periodoDoVolumeValido("2028-02-01", "2028-03-03")).toBe(false); // 32
  });

  it("início depois do fim → não vale", () => {
    expect(periodoDoVolumeValido("2026-10-11", "2026-10-05")).toBe(false);
  });

  it("data que não existe, fora do formato ou que não é texto → não vale", () => {
    expect(periodoDoVolumeValido("2026-02-30", "2026-03-01")).toBe(false);
    expect(periodoDoVolumeValido("2026-13-01", "2026-13-02")).toBe(false);
    expect(periodoDoVolumeValido("2026-10-5", "2026-10-11")).toBe(false);
    expect(periodoDoVolumeValido("2026-10-05T00:00:00Z", "2026-10-11")).toBe(false);
    expect(periodoDoVolumeValido(["2026-10-05"], "2026-10-11")).toBe(false);
    expect(periodoDoVolumeValido(undefined, "2026-10-11")).toBe(false);
    expect(periodoDoVolumeValido(null, null)).toBe(false);
    expect(periodoDoVolumeValido(20261005, 20261011)).toBe(false);
  });
});

// ───────────────────────── hml-24 (H-127) ─────────────────────────

const RAIZ = resolve(__dirname, "../..");
const INDICE = readFileSync(resolve(RAIZ, "supabase/functions/admin-semana-treinos/index.ts"), "utf-8");
const MIGRATION = readFileSync(resolve(RAIZ, "supabase/migrations/20261015100000_hml24_prescricao_atomica.sql"), "utf-8");

/**
 * O fonte com os comentários e o miolo dos textos ("…", '…', `…`) trocados por espaço — o MESMO tamanho e as mesmas quebras de linha
 * (as posições batem com o fonte); o detector só olha o código. Para os blocos das ações (sem regex literal dentro).
 */
function semTexto(fonte: string): string {
  const s = fonte.split("");
  const apagar = (de: number, ate: number) => {
    for (let k = de; k < ate && k < s.length; k++) if (s[k] !== "\n") s[k] = " ";
  };
  let i = 0;
  while (i < fonte.length) {
    const c = fonte[i];
    if (c === "/" && fonte[i + 1] === "/") {
      const fim = fonte.indexOf("\n", i);
      const ate = fim < 0 ? fonte.length : fim;
      apagar(i, ate);
      i = ate;
    } else if (c === "/" && fonte[i + 1] === "*") {
      const fim = fonte.indexOf("*/", i + 2);
      const ate = fim < 0 ? fonte.length : fim + 2;
      apagar(i, ate);
      i = ate;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < fonte.length && fonte[j] !== c) j += fonte[j] === "\\" ? 2 : 1;
      apagar(i + 1, j);
      i = j + 1;
    } else {
      i++;
    }
  }
  return s.join("");
}

/** O bloco `if (action === "<acao>") { … }` do index.ts, como está escrito (as chaves contadas no código, sem os textos). */
function blocoDaAcao(fonte: string, acao: string): string {
  const ini = fonte.indexOf(`if (action === "${acao}") {`);
  if (ini < 0) return "";
  const resto = fonte.slice(ini);
  const est = semTexto(resto);
  let nivel = 0;
  for (let i = est.indexOf("{"); i < est.length; i++) {
    if (est[i] === "{") nivel++;
    else if (est[i] === "}" && --nivel === 0) return resto.slice(0, i + 1);
  }
  return "";
}

/** Gravação direta numa tabela pelo supabase-js (no código; comentário e texto não contam). */
const GRAVA_DIRETO = /\.\s*(?:insert|update|upsert|delete)\s*\(/;

/** Os parâmetros da RPC na migration (create or replace function %1$I.<nome>(p_a tipo, …)). */
function parametrosDaRpc(nome: string): string[] {
  const m = new RegExp(String.raw`create or replace function %1\$I\.${nome}\(([^)]*)\)`).exec(MIGRATION);
  return m ? m[1].split(",").map((p) => p.trim().split(/\s+/)[0]) : [];
}

/** As chaves do objeto da chamada `admin.rpc("<nome>", { … })` no bloco. */
function chavesDaChamada(bloco: string, nome: string): string[] {
  const ini = bloco.indexOf(`admin.rpc("${nome}", {`);
  if (ini < 0) return [];
  const abre = bloco.indexOf("{", ini);
  const fim = bloco.indexOf("}", abre);
  return [...bloco.slice(abre + 1, fim).matchAll(/\b(p_[a-z_]+)\s*:/g)].map((x) => x[1]);
}

describe("acaoDoLog (hml-24, H-127): a ação do log do catch final, no formato fixo do log", () => {
  it("a ação conhecida vira snake_case (o 'setPrescricao' cru viraria '?' no log)", () => {
    expect(acaoDoLog("setPrescricao")).toBe("set_prescricao");
    expect(acaoDoLog("setObservacao")).toBe("set_observacao");
    expect(acaoDoLog("quemRecebeLista")).toBe("quem_recebe_lista");
    expect(acaoDoLog("get")).toBe("get");
    expect(codigoValido("setPrescricao")).toBe("");
  });

  it("todas as ações conhecidas saem no formato do log ([a-z0-9_], até 48) e são diferentes entre si", () => {
    const todas = ACOES.map(acaoDoLog);
    for (const a of todas) expect(codigoValido(a), a).toBe(a);
    expect(new Set(todas).size).toBe(ACOES.length);
  });

  it("o que não é uma ação conhecida → 'desconhecida' (o corpo do pedido nunca vai para o log)", () => {
    for (const ruim of ["setprescricao", "SetPrescricao", "setPrescricao ", "e-mail@x.com", "drop table", "", 12, null, undefined, { action: "get" }, ["get"]]) {
      expect(acaoDoLog(ruim), String(ruim)).toBe("desconhecida");
    }
  });

  it("guarda de fonte: as ações da lista são exatamente as do index.ts (ação nova sem entrar aqui = 'desconhecida' no log)", () => {
    const doIndice = [...new Set([...INDICE.matchAll(/action === "([A-Za-z]+)"/g)].map((m) => m[1]))];
    expect([...doIndice].sort()).toEqual([...ACOES].sort());
  });

  it("o catch final loga a exceção com a ação e o schema e devolve a MESMA resposta (a guarda do log confere o resto)", () => {
    const fim = INDICE.slice(INDICE.lastIndexOf("} catch (e) {"));
    expect(fim).toMatch(/^\} catch \(e\) \{[\s\S]*?log\.excecao\(e, \{ acao: acaoDoLog\(body\?\.action\), schema: currentSchema\(\) \}\);\s*return jsonErr\("internal", 500, origin\);\s*\}\s*\}\);\s*$/);
  });
});

describe("hml-24 (H-127): o setPrescricao e o setObservacao gravam só pela RPC (a gravação na chave, sem o 'lê e depois insere')", () => {
  for (const [acao, rpc] of [["setPrescricao", "prescricao_salvar"], ["setObservacao", "observacao_salvar"]] as const) {
    it(`${acao}: nenhum .insert/.update/.upsert/.delete nem .from("tb_series_padrao_usuario"); a RPC ${rpc} com o error conferido`, () => {
      const bloco = blocoDaAcao(INDICE, acao);
      expect(bloco.length).toBeGreaterThan(200);
      const codigo = semTexto(bloco);
      expect(codigo).not.toMatch(GRAVA_DIRETO);
      expect(bloco).not.toContain('.from("tb_series_padrao_usuario")');
      expect(bloco).toMatch(new RegExp(String.raw`const \{ (?:data, )?error \} = await admin\.rpc\("${rpc}", \{[^}]*\}\);\s*if \(error\) throw error;`));
      expect([...bloco.matchAll(/\.rpc\(/g)]).toHaveLength(1);
    });

    it(`${acao}: os parâmetros da chamada são exatamente os da ${rpc} na migration (o PostgREST acha a função pelos nomes)`, () => {
      const daMigration = parametrosDaRpc(rpc);
      expect(daMigration.length).toBeGreaterThanOrEqual(4);
      expect(chavesDaChamada(blocoDaAcao(INDICE, acao), rpc).sort()).toEqual([...daMigration].sort());
    });
  }

  it("o setPrescricao responde o 'prescricao' com o que a RPC devolveu (as mesmas chaves de antes, na migration)", () => {
    expect(blocoDaAcao(INDICE, "setPrescricao")).toContain("return okJson({ ok: true, prescricao: data }, origin);");
    const retorno = /returning jsonb_build_object\(([\s\S]*?)\)\s*into v;/.exec(MIGRATION.slice(MIGRATION.indexOf("prescricao_salvar(")))?.[1] ?? "";
    expect([...retorno.matchAll(/'([a-z_]+)', t\./g)].map((m) => m[1]).sort()).toEqual(
      ["carga_sugerida_kg", "descanso_segundos", "exercicio_id", "exercicio_usuario_id", "grupo_id", "grupo_usuario_id", "num_series", "reps_alvo", "updated_at"]);
    expect(blocoDaAcao(INDICE, "setObservacao")).toContain("return okJson({ ok: true, observacao: obs }, origin);");
  });

  it("controle positivo: o detector acha a gravação direta (o setSeriesPadrao de hoje grava assim) e ignora comentário e texto", () => {
    const series = semTexto(blocoDaAcao(INDICE, "setSeriesPadrao"));
    expect(series).toMatch(GRAVA_DIRETO);
    expect(semTexto('await admin.from("t").insert({ a: 1 });')).toMatch(GRAVA_DIRETO);
    expect(semTexto('// await admin.from("t").insert({ a: 1 });\nconst x = ".update(";')).not.toMatch(GRAVA_DIRETO);
    expect(blocoDaAcao('if (action === "x") { const a = "}"; if (b) { c(); } }\nresto', "x")).toBe('if (action === "x") { const a = "}"; if (b) { c(); } }');
  });
});
