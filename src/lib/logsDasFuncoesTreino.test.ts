import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Homologação hml-10 (H-24 e H-26, D1, D2 e D6) — guarda nas FONTES das funções do Banco do Treino publicadas nesta W (elas rodam
// no Deno; aqui só se lê o código, como o scripts/ci/sem-master.sh da hml-08). Nas 12 e em todo arquivo que elas carregam
// (import relativo, de arquivo em arquivo), fora o _shared/log.ts — o único lugar que escreve no console:
//   · nenhum console.* (tudo passa pelo log em JSON: criarLog(<slug>, { avisar: avisarErro }));
//   · nenhum JSON.stringify( nem .text( dentro de uma chamada de log (corpo de resposta nunca vai para o log);
//   · o catch final chama log.excecao(<o erro>) e devolve a MESMA resposta de antes; todo catch que devolve 5xx passa pelo log.
// Controle positivo: os detectores acham o padrão nas 10 funções que esta W não publica e em amostras escritas aqui; comentário e
// texto entre aspas não contam (a "estrutura" do código tira os 2), e o leitor confere o próprio trabalho (parênteses e chaves
// fecham em todo arquivo lido).
// hml-14 (H-51 item 7, D10): master-financeiro e master-planos viraram CASCAS (410 "migrado" a tudo, sem import, segredo, banco
// nem log — o molde da mp-assinar do principal) e saem da lista das 12; a guarda delas é a de baixo (e a do console continua).
const raiz = resolve(__dirname, "../..");
const FUNCOES = resolve(raiz, "supabase/functions");
const LOG = resolve(FUNCOES, "_shared/log.ts");
const ler = (arquivo: string) => readFileSync(arquivo, "utf-8");
const rel = (arquivo: string) => relative(raiz, arquivo);
const indice = (slug: string) => resolve(FUNCOES, slug, "index.ts");

/** As 12 do Treino publicadas na hml-10 (spec §3.1 e §4), menos as 2 que viraram casca na hml-14 (CASCAS, abaixo). */
const PUBLICADAS = [
  "trocar-token",
  "admin-delete-user",
  "admin-list-users",
  "mp-webhook",
  "master-professores",
  "professor-convites",
  "vincular-professor",
  "mp-payments",
  "espelho-nucleo",
  "delete-my-account",
] as const;

/** hml-14 (D10): respondem 410 {"error":"migrado"} a qualquer pedido (fora o preflight, com o CORS de antes). */
const CASCAS = ["master-financeiro", "master-planos"] as const;

/**
 * As 10 do Treino que esta W NÃO publica (P4, spec §2 D1): só têm console com a mensagem do erro (b: nada de corpo de resposta,
 * objeto inteiro ou dado pessoal) e o app as chama — o 5xx delas chega pelo aviso do app (D5). Ficam fora da guarda até a W que
 * as publicar; aí elas trocam o console pelo log e vêm para a lista de cima.
 */
const FORA: Record<string, string> = {
  "admin-avaliacoes": "1 console (b): a mensagem do erro da RPC pode_ver_aluno_treino_por",
  "admin-get-overrides": "1 console (b): a mensagem do erro da RPC pode_ver_aluno_treino_por",
  "admin-get-user": "1 console (b): a mensagem do erro da RPC pode_ver_aluno_treino_por",
  "admin-get-workout-plan": "1 console (b): a mensagem do erro da RPC pode_ver_aluno_treino_por",
  "admin-relatorio": "2 console (b): a mensagem do erro das RPCs pode_ver_aluno_treino_por e contas_onde_sou_dono_treino",
  "admin-semana-treinos": "2 console (b): a mensagem do erro das RPCs pode_ver_aluno_treino_por e contas_onde_sou_dono_treino",
  "admin-tags": "1 console (b): a mensagem do erro da RPC pode_ver_aluno_treino_por",
  "admin-update-user": "1 console (b): a mensagem do erro da RPC pode_ver_aluno_treino_por",
  "painel-resumo-treino": "1 console (b): a mensagem do erro do catch final, cortada em 300",
  "treino-leitura": "2 console (b): a mensagem do erro ao assinar as fotos e a do catch final, com a ação",
};

/**
 * A resposta do catch final de cada uma — a MESMA de antes da hml-10 (D6: só o log muda), fora as 2 que a hml-14 (H-32) trocou de
 * propósito: o mp-webhook responde 500 (antes 200: o aviso se perdia; agora o MP manda de novo) e o status-lite da mp-payments
 * responde "bloqueado" (falha fechada: o app antigo libera quando recebe erro).
 */
const RESPOSTA_DO_CATCH_FINAL: Record<(typeof PUBLICADAS)[number], string> = {
  "trocar-token": 'return erro("erro_interno", 500, origin);',
  "admin-delete-user": 'return jsonErr("internal", 500, origin);',
  "admin-list-users": 'return jsonErr("internal", 500, origin);',
  "mp-webhook": 'return new Response("erro", { status: 500 });',
  "master-professores": 'return jsonErr("internal", 500, origin);',
  "professor-convites": 'return jsonErr("internal", 500, origin);',
  "vincular-professor": 'return jsonErr("internal", 500, origin);',
  "mp-payments": "return jsonOk(statusLite(true), origin);",
  // a espelho-nucleo não tem catch em volta de tudo: o final é o de cada resumo, que anota o erro e segue para o próximo
  "espelho-nucleo": 'resultados.push({ principal_user_id: pid, resultado: "erro", erro: String((e as { message?: string })?.message || e).slice(0, 200) });',
  "delete-my-account": 'return jsonServidor({ ok: false, erro: "interno" }, 500);',
};

// ───────────────────────── o leitor ─────────────────────────

/**
 * A "estrutura" do código: a mesma fonte (mesmo tamanho, mesmas quebras de linha) com os comentários e o miolo dos textos ('…',
 * "…" e `…` — o ${…} continua código) e das regex literais trocados por espaço. Os detectores procuram nela: o que está dentro
 * de comentário ou de texto não conta, e os parênteses e as chaves que sobram são só os do código.
 */
function estrutura(fonte: string): string {
  const s = fonte.split("");
  const n = fonte.length;
  const apagar = (de: number, ate: number) => {
    for (let k = de; k < ate && k < n; k++) if (s[k] !== "\n") s[k] = " ";
  };
  const abertos: number[] = []; // para cada ${ aberto: quantas chaves já estavam abertas antes dele
  let chaves = 0;
  let anterior = ""; // o último pedaço de código (sinal ou palavra): decide se uma / abre regex ou é divisão
  let i = 0;

  // o miolo de um template, a partir de i (logo depois do ` ou do } de um ${…}): para no ` que fecha ou no próximo ${
  const template = () => {
    const ini = i;
    while (i < n) {
      if (fonte[i] === "\\") {
        i += 2;
        continue;
      }
      if (fonte[i] === "`") {
        apagar(ini, i);
        i++;
        anterior = "`";
        return;
      }
      if (fonte[i] === "$" && fonte[i + 1] === "{") {
        apagar(ini, i);
        abertos.push(chaves);
        chaves++;
        i += 2;
        anterior = "{";
        return;
      }
      i++;
    }
    apagar(ini, n);
  };

  while (i < n) {
    const c = fonte[i];
    const d = fonte[i + 1];
    if (c === "/" && d === "/") {
      const fim = fonte.indexOf("\n", i);
      const ate = fim < 0 ? n : fim;
      apagar(i, ate);
      i = ate;
      continue;
    }
    if (c === "/" && d === "*") {
      const fim = fonte.indexOf("*/", i + 2);
      const ate = fim < 0 ? n : fim + 2;
      apagar(i, ate);
      i = ate;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && fonte[j] !== c && fonte[j] !== "\n") j += fonte[j] === "\\" ? 2 : 1;
      apagar(i + 1, j);
      i = j + 1;
      anterior = c;
      continue;
    }
    if (c === "`") {
      i++;
      template();
      continue;
    }
    if (c === "/" && (/^[(,=:[!&|?{};+\-*%<>~^]?$/.test(anterior) || /^(return|typeof|case|in|of|throw|new|void|delete)$/.test(anterior))) {
      // regex literal: até a / que fecha (fora de [...]), com os escapes; depois, as flags
      let j = i + 1;
      let classe = false;
      while (j < n && fonte[j] !== "\n") {
        if (fonte[j] === "\\") {
          j += 2;
          continue;
        }
        if (fonte[j] === "[") classe = true;
        else if (fonte[j] === "]") classe = false;
        else if (fonte[j] === "/" && !classe) break;
        j++;
      }
      apagar(i + 1, j);
      i = j + 1;
      while (i < n && /[a-z]/i.test(fonte[i])) i++;
      anterior = ")";
      continue;
    }
    if (c === "{") chaves++;
    else if (c === "}") {
      if (abertos.length && abertos[abertos.length - 1] === chaves - 1) {
        abertos.pop();
        chaves--;
        i++;
        template();
        continue;
      }
      chaves--;
    }
    if (/[\w$]/.test(c)) {
      let j = i;
      while (j < n && /[\w$]/.test(fonte[j])) j++;
      anterior = fonte.slice(i, j);
      i = j;
      continue;
    }
    if (!/\s/.test(c)) anterior = c;
    i++;
  }
  return s.join("");
}

/** O fim (exclusivo) do trecho que começa no ( ou { da posição `abre` da estrutura. */
function fechamento(est: string, abre: number): number {
  const fecha = est[abre] === "(" ? ")" : "}";
  let nivel = 0;
  for (let i = abre; i < est.length; i++) {
    if (est[i] === est[abre]) nivel++;
    else if (est[i] === fecha && --nivel === 0) return i + 1;
  }
  throw new Error(`sem fechamento na posição ${abre}`);
}

interface Trecho {
  /** o trecho na estrutura (código, sem texto nem comentário) */
  codigo: string;
  /** o mesmo trecho na fonte, como está escrito */
  fonte: string;
}

/** As chamadas de log (log.info / aviso / erro / excecao): os argumentos, do ( ao ). */
function chamadasDeLog(fonte: string): Trecho[] {
  const est = estrutura(fonte);
  return [...est.matchAll(/\blog\.(?:info|aviso|erro|excecao)\s*\(/g)].map((m) => {
    const abre = (m.index ?? 0) + m[0].length - 1;
    const fim = fechamento(est, abre);
    return { codigo: est.slice(abre, fim), fonte: fonte.slice(abre, fim) };
  });
}

/** Os catch do arquivo (não o .catch das promessas), na ordem: a variável do erro e o bloco. */
function blocosCatch(fonte: string): Array<Trecho & { variavel: string | null }> {
  const est = estrutura(fonte);
  return [...est.matchAll(/(?<![.\w$])catch\s*(?:\(\s*([A-Za-z_$][\w$]*)\s*\))?\s*\{/g)].map((m) => {
    const abre = (m.index ?? 0) + m[0].length - 1;
    const fim = fechamento(est, abre);
    return { variavel: m[1] ?? null, codigo: est.slice(abre, fim), fonte: fonte.slice(abre, fim) };
  });
}

const consoles = (fonte: string) => [...estrutura(fonte).matchAll(/\bconsole\s*\.\s*[A-Za-z]+/g)].length;
/** Argumento de log com corpo de resposta (JSON.stringify ou .text) — só no código: dentro de texto entre aspas não conta. */
const corpoNoLog = (chamada: Trecho) => /\bJSON\s*\.\s*stringify\s*\(|\.\s*text\s*\(/.test(chamada.codigo);
const chamaExcecao = (bloco: { codigo: string; variavel: string | null }) =>
  bloco.variavel !== null && new RegExp(`\\blog\\.excecao\\(\\s*${bloco.variavel.replace(/\$/g, "\\$")}\\b`).test(bloco.codigo);
/** O bloco devolve 5xx (um return com 500…599; o "status = 599" da falta de rede, sem return, não conta). */
const devolve5xx = (bloco: Trecho) => /\breturn\b[^;]*\b5\d\d\b/.test(bloco.codigo);
const passaPeloLog = (bloco: Trecho) => /\blog\.(?:erro|excecao)\s*\(/.test(bloco.codigo);

/** Os arquivos que a função carrega: o index.ts e, de import em import, os relativos (./x.ts, ../_shared/…). Os de URL ficam fora. */
function arquivosDa(slug: string): string[] {
  const vistos = new Set<string>();
  const pilha = [indice(slug)];
  while (pilha.length) {
    const atual = pilha.pop() as string;
    if (vistos.has(atual)) continue;
    vistos.add(atual);
    for (const m of ler(atual).matchAll(/\b(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)) pilha.push(resolve(dirname(atual), m[1]));
  }
  return [...vistos].sort();
}

const doTreino = [...new Set([...PUBLICADAS, ...CASCAS].flatMap(arquivosDa))].sort();
const semOLog = doTreino.filter((a) => a !== LOG);

// ───────────────────────── os testes ─────────────────────────

describe("hml-10: toda função do Treino está numa das listas (as publicadas na hml-10, as cascas da hml-14 ou as 10 que ficam, com o porquê)", () => {
  it("as pastas de supabase/functions são exatamente as 10 publicadas + as 2 cascas + as 10", () => {
    const pastas = readdirSync(FUNCOES)
      .filter((p) => p !== "_shared" && statSync(resolve(FUNCOES, p)).isDirectory())
      .sort();
    expect(pastas).toEqual([...PUBLICADAS, ...CASCAS, ...Object.keys(FORA)].sort());
    expect([...PUBLICADAS, ...CASCAS].filter((p) => p in FORA)).toEqual([]);
    expect(PUBLICADAS.filter((p) => (CASCAS as readonly string[]).includes(p))).toEqual([]);
  });

  it("o leitor segue os imports: as publicadas carregam o log, o aviso do Treino e o saneador, e as peças de cada uma", () => {
    const relativos = doTreino.map(rel);
    for (const arquivo of [
      "supabase/functions/_shared/log.ts",
      "supabase/functions/_shared/avisar-erro.ts",
      "supabase/functions/_shared/erros.ts",
      "supabase/functions/_shared/espelho/aplicar.ts",
      "supabase/functions/_shared/espelho/regras.ts",
      "supabase/functions/mp-webhook/regras.ts",
      // hml-14: o tempo do MP (mp-webhook) e as páginas (master-professores); o cobertura.ts da mp-payments ficou só para o Vitest
      "supabase/functions/_shared/tempo.ts",
      "supabase/functions/_shared/paginas.ts",
    ]) {
      expect(relativos).toContain(arquivo);
    }
    for (const slug of PUBLICADAS) {
      expect(arquivosDa(slug).map(rel), slug).toEqual(expect.arrayContaining(["supabase/functions/_shared/log.ts", "supabase/functions/_shared/avisar-erro.ts"]));
    }
  });

  it("o leitor confere o próprio trabalho: em cada arquivo lido, sem texto e sem comentário, parênteses, chaves e colchetes fecham", () => {
    for (const arquivo of [...doTreino, ...Object.keys(FORA).map(indice)]) {
      const fonte = ler(arquivo);
      const est = estrutura(fonte);
      expect(est.length, rel(arquivo)).toBe(fonte.length);
      expect(est.split("\n").length, rel(arquivo)).toBe(fonte.split("\n").length);
      for (const [abre, fecha] of [["(", ")"], ["{", "}"], ["[", "]"]]) {
        expect(est.split(abre).length, `${rel(arquivo)} ${abre}${fecha}`).toBe(est.split(fecha).length);
      }
    }
  });
});

describe("hml-10 (H-24, D1): nenhum console.* nas publicadas, nas cascas nem nos arquivos que elas carregam (fora o _shared/log.ts)", () => {
  it.each(semOLog.map(rel))("%s", (arquivo) => {
    expect(consoles(ler(resolve(raiz, arquivo)))).toBe(0);
  });

  it.each(PUBLICADAS)("%s cria o log com o próprio nome e o aviso do Treino (que manda ao principal)", (slug) => {
    const fonte = ler(indice(slug));
    expect(fonte).toMatch(/^import \{[^}]*\bcriarLog\b[^}]*\} from "\.\.\/_shared\/log\.ts";$/m);
    expect(fonte).toContain('import { avisarErro } from "../_shared/avisar-erro.ts";');
    expect(fonte).toContain(`const log = criarLog("${slug}", { avisar: avisarErro });`);
  });

  it("o espelho (aplicar.ts) não cria log: recebe o de quem chama (trocar-token ou espelho-nucleo), e as 2 passam o delas", () => {
    const aplicar = ler(resolve(FUNCOES, "_shared/espelho/aplicar.ts"));
    expect(aplicar).not.toMatch(/criarLog\(/);
    expect(aplicar).toMatch(/export async function aplicarResumo\(\s*db: SupabaseClient,\s*authAdmin: SupabaseClient,\s*log: Log,/);
    for (const slug of ["trocar-token", "espelho-nucleo"]) {
      expect(ler(indice(slug)), slug).toMatch(/aplicarResumo\(db, authAdmin, log, /);
    }
  });
});

describe("hml-10 (H-24, D2): corpo de resposta nunca vai para o log", () => {
  it.each(semOLog.map(rel))("%s: nenhum JSON.stringify( nem .text( dentro de uma chamada de log", (arquivo) => {
    const chamadas = chamadasDeLog(ler(resolve(raiz, arquivo)));
    expect(chamadas.filter(corpoNoLog).map((c) => c.fonte)).toEqual([]);
  });

  it("trocar-token: o generate_link e o verify lançam só o código com o status (sem o corpo do GoTrue, que traz e-mail e token)", () => {
    const fonte = ler(indice("trocar-token"));
    expect(fonte).toContain("throw new Error(`generate_link_${g.status}`);");
    expect(fonte).toContain("throw new Error(`verify_${v.status}`);");
    expect(fonte).not.toMatch(/JSON\.stringify\((?:link|sessao)\)/);
    // a espelho-resumo fora: só o status e o código de erro dela
    const resumo = chamadasDeLog(fonte).find((c) => c.fonte.includes('"espelho_resumo_respondeu"'));
    expect(resumo?.fonte).toMatch(/status: r\.status, externo: \{ principal_erro: corpo\?\.error \?\? corpo\?\.erro \}/);
  });

  it.each(["admin-list-users", "master-professores"])(
    "%s: o erro da lista (o PostgREST pode devolver o filtro com o termo de busca) vai sem a mensagem — só código e status",
    (slug) => {
      const lista = chamadasDeLog(ler(indice(slug))).filter((c) => c.fonte.includes('"lista_falhou"'));
      expect(lista).toHaveLength(1);
      expect(lista[0].fonte).toMatch(/\bstatus\b/);
      expect(lista[0].fonte).toContain("pg: error.code");
      expect(lista[0].fonte).not.toMatch(/\bmsg\b|message|\berror\b(?!\.code)/);
    },
  );

  it("mp-payments (hml-14, D10): só o status-lite ficou — sem token nem API do MP, então nenhuma resposta do MP chega ao log", () => {
    // até a hml-13 eram 5 falhas do MP (código morto e o reembolso) logando só os códigos (externoMp)
    const fonte = ler(indice("mp-payments"));
    expect(fonte).not.toMatch(/MP_ACCESS_TOKEN|api\.mercadopago\.com|externoMp/);
    expect(chamadasDeLog(fonte).filter((c) => /codigo: "mp_/.test(c.fonte))).toEqual([]);
  });
});

describe("hml-10 (H-26, D6): o catch final chama log.excecao e devolve a mesma resposta de antes", () => {
  it.each(PUBLICADAS)("%s", (slug) => {
    const blocos = blocosCatch(ler(indice(slug)));
    const final = blocos[blocos.length - 1];
    expect(final, "sem catch").toBeDefined();
    expect(chamaExcecao(final), final.fonte).toBe(true);
    expect(final.fonte).toContain(RESPOSTA_DO_CATCH_FINAL[slug]);
  });

  it.each(semOLog.map(rel))("%s: todo catch que devolve 5xx passa pelo log", (arquivo) => {
    const calados = blocosCatch(ler(resolve(raiz, arquivo))).filter((b) => devolve5xx(b) && !passaPeloLog(b));
    expect(calados.map((b) => b.fonte)).toEqual([]);
  });
});

/** O que uma casca não pode ter: import, segredo, banco, rede, log ou console (o detector, na estrutura do código). */
const PROIBIDO_NA_CASCA = /^\s*import\b|\bDeno\s*\.\s*env\b|\bcreateClient\s*\(|\.\s*(?:from|rpc)\s*\(|\bfetch\s*\(|\blog\s*\.|\bconsole\s*\./m;

describe("hml-14 (H-51 item 7, D10): as cascas respondem 410 migrado a tudo, com o CORS de antes, sem segredo nem banco", () => {
  it.each(CASCAS)("%s: sem import, segredo, banco, rede, log, console nem catch — só o index.ts", (slug) => {
    const fonte = ler(indice(slug));
    expect(estrutura(fonte).match(PROIBIDO_NA_CASCA)).toBeNull();
    expect(arquivosDa(slug).map(rel)).toEqual([`supabase/functions/${slug}/index.ts`]);
    expect(blocosCatch(fonte)).toEqual([]);
  });

  it.each(CASCAS)("%s: o preflight com o CORS de antes; qualquer outro pedido → 410 {\"error\":\"migrado\"}", (slug) => {
    const fonte = ler(indice(slug));
    expect(fonte).toContain('if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });');
    expect(fonte).toContain('const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://physiqcalc.vercel.app";');
    expect(fonte).toContain('"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-schema"');
    expect(fonte).toMatch(/return new Response\(JSON\.stringify\(\{ error: "migrado" \}\), \{ status: 410, headers: \{ "Content-Type": "application\/json", \.\.\.corsHeaders\(origin\) \} \}\);/);
    expect(fonte).toContain("178f5d6"); // o código de antes, no cabeçalho
  });

  it("mp-payments e master-professores: a ação que não vive mais responde 410 antes do login (sem banco)", () => {
    for (const [slug, viva, login] of [
      ["mp-payments", 'if (body?.action !== "status-lite") return jsonErr("migrado", 410, origin);', "await requireUser(req)"],
      ["master-professores", 'if (action !== "list") return jsonErr("migrado", 410, origin);', 'await requireMaster(req, "master-professores")'],
    ]) {
      const serve = ler(indice(slug)).split("Deno.serve(")[1] ?? "";
      expect(serve.indexOf(viva), slug).toBeGreaterThan(-1);
      expect(serve.indexOf(viva), slug).toBeLessThan(serve.indexOf(login));
    }
  });
});

describe("hml-10: controle positivo (os detectores acham o que procuram — senão a guarda ficaria oca e passaria sempre)", () => {
  it.each(Object.entries(FORA))("%s ainda tem console (%s): o detector acha", (slug) => {
    expect(consoles(ler(indice(slug)))).toBeGreaterThan(0);
  });

  it("chamada de log com corpo de resposta é achada; a mesma palavra dentro de texto ou de comentário não conta", () => {
    const achados = (fonte: string) => chamadasDeLog(fonte).filter(corpoNoLog).length;
    expect(achados('log.erro({ codigo: "mp_pix_falhou", msg: JSON.stringify(pay).slice(0, 500) });')).toBe(1);
    expect(achados('log.info({ codigo: "repasse", msg: (await res.text()).slice(0, 200) });')).toBe(1);
    expect(achados('log.excecao(e, {\n  codigo: "x",\n  msg: String(await r.text()),\n});')).toBe(1);
    expect(achados('log.erro({ codigo: "x", msg: "o JSON.stringify(pay) não vai" });')).toBe(0);
    expect(achados('// log.erro({ codigo: "x", msg: JSON.stringify(pay) });\nlog.info({ codigo: "ok" });')).toBe(0);
    expect(achados('const t = await r.text(); log.erro({ codigo: "x", externo: { principal_erro: codigo(t) } });')).toBe(0);
  });

  it("catch final sem log.excecao é achado (o console de antes, o catch que engolia o erro, o log.excecao de outra variável)", () => {
    const final = (fonte: string) => {
      const blocos = blocosCatch(fonte);
      return chamaExcecao(blocos[blocos.length - 1]);
    };
    expect(final('try { a(); } catch (e) {\n  console.error("x", e);\n  return jsonErr("internal", 500, origin);\n}')).toBe(false);
    expect(final('try { a(); } catch (_e) { return jsonErr("internal", 500, origin); }')).toBe(false);
    expect(final("try { a(); } catch { return jsonErr(\"internal\", 500, origin); }")).toBe(false);
    expect(final("try { a(); } catch (e) { log.excecao(outro, { acao }); return x; }")).toBe(false);
    expect(final("try { a(); } catch (e) { log.excecao(e, { acao, schema }); return x; }")).toBe(true);
    // o .catch de promessa não é catch: o final continua sendo o do try
    expect(final("try { await p.catch((e) => log.excecao(e)); } catch (e) { return x; }")).toBe(false);
    expect(blocosCatch("const x = await r.json().catch(() => ({}));")).toHaveLength(0);
    // catch que devolve 5xx sem passar pelo log é achado
    const [calado] = blocosCatch('try { a(); } catch (e) { return erro("principal_indisponivel", 502, origin); }');
    expect(devolve5xx(calado) && !passaPeloLog(calado)).toBe(true);
  });

  it("hml-14: o detector das cascas acha import, segredo, banco, rede, log e console; o mesmo texto em comentário ou entre aspas não conta", () => {
    const acha = (fonte: string) => PROIBIDO_NA_CASCA.test(estrutura(fonte));
    for (const ruim of [
      'import { criarLog } from "../_shared/log.ts";',
      'const URL_ = Deno.env.get("SUPABASE_URL")!;',
      "const db = createClient(a, b);",
      'await admin.from("physiq_pagamentos").update({});',
      'await admin.rpc("physiq_aluno_bloqueado", {});',
      "const r = await fetch(url);",
      'log.excecao(e, { acao: "x" });',
      'console.error("x");',
    ]) {
      expect(acha(ruim), ruim).toBe(true);
    }
    expect(acha('// import x; Deno.env.get("A"); fetch(u)\nconst t = "createClient( .from( log.erro( console.log(";')).toBe(false);
    expect(acha(ler(indice("mp-payments")))).toBe(true); // a mp-payments não é casca: lê o banco e loga
  });

  it("o leitor não se perde com // e aspas dentro de texto, de template e de regex", () => {
    const fonte = [
      'const url = "https://x.supabase.co/functions/v1/a"; // comentário com "aspas" e (parêntese',
      "const r = /[^\\s\"'<>]*\\/\\//g; const t = `a ${b ? `c${d}` : \"}\"} e`;",
      "/* bloco com { e ( */ log.erro({ codigo: \"x\", msg: JSON.stringify(p) });",
    ].join("\n");
    const est = estrutura(fonte);
    expect(est.length).toBe(fonte.length);
    expect(est).not.toMatch(/supabase|comentário|bloco|aspas/);
    expect(chamadasDeLog(fonte).filter(corpoNoLog)).toHaveLength(1);
    for (const [abre, fecha] of [["(", ")"], ["{", "}"], ["[", "]"]]) expect(est.split(abre).length).toBe(est.split(fecha).length);
  });
});
