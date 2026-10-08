import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { codigosDoMp } from "../../supabase-principal/functions/_shared/cobranca-regras";
import { faltaNoEmail } from "../../supabase-principal/functions/_shared/enviar-aluno-regras";
import { motivoDoCaptcha } from "../../supabase-principal/functions/_shared/entrar-senha-regras";
import { criarLog } from "../../supabase-principal/functions/_shared/log";

// Homologação hml-10 (D2, D3, D6 e D10 no banco PRINCIPAL — H-24, H-25, H-26, H-48) — guarda nas fontes das funções publicadas
// desta W (as funções rodam no Deno: aqui só se confere o código delas, como o sem-master.sh da hml-08):
//   - nenhum console. na função nem nos _shared que ela importa (o único lugar que escreve no console é o _shared/log.ts);
//   - nenhum JSON.stringify( nem .text() dentro de uma chamada de log (o corpo de resposta não vai para o log);
//   - todo catch final chama log.excecao (log + aviso ao Weslley), com a resposta de antes;
//   - D3: sem reserva com valor de produção (RESEND_FROM, SITE_URL e LOGIN_IP_SAL); D10: a resposta de erro leva só o código.
// O detector procura também em comentário, de propósito: a regra fica simples e sem leitor de TypeScript.
const FUNCOES_DIR = resolve(__dirname, "../../supabase-principal/functions");
const ler = (rel: string) => readFileSync(resolve(FUNCOES_DIR, rel), "utf-8");

/** As publicadas desta W no principal: as 20, as 2 master que vão pela master-porta e a erro-avisar (nova). */
const FUNCOES = [
  "agenda-avisar", "aluno-enviar", "alunos", "convites", "cobranca-conta", "entrar-senha", "espelho-enviar", "espelho-resumo",
  "excluir-minha-conta", "exportar-meus-dados", "master-contas", "mp-webhook", "mp-webhook-aluno", "mp-webhook-conta",
  "pagamentos-aluno", "pos-login", "push-enviar", "vincular-aluno", "whatsapp-agente", "whatsapp-conectar",
  "master-financeiro", "master-planos", "erro-avisar",
];
const MASTER = ["master-contas", "master-financeiro", "master-planos"];
/** Onde mora o catch final: na index.ts, menos nas 3 master-* (servir, da master-porta) e na erro-avisar (atenderPedido). */
const CATCH_FINAL: Record<string, string> = {
  ...Object.fromEntries(MASTER.map((f) => [f, "_shared/master-porta.ts"])),
  "erro-avisar": "_shared/erro-avisar-regras.ts",
};
const LOG = "_shared/log.ts";

/** Os arquivos do repo que um arquivo importa (import/export … from "./…" ou "../…"; também `import type`). */
function importados(rel: string): string[] {
  const fonte = ler(rel);
  const saida: string[] = [];
  for (const m of fonte.matchAll(/\bfrom\s*["'](\.{1,2}\/[^"']+)["']/g)) {
    const alvo = relative(FUNCOES_DIR, resolve(FUNCOES_DIR, dirname(rel), m[1]));
    if (existsSync(resolve(FUNCOES_DIR, alvo))) saida.push(alvo);
  }
  return saida;
}

/** A função e tudo o que ela importa do repo (o fecho), menos o _shared/log.ts. */
function arquivosDa(funcao: string): string[] {
  const vistos = new Set<string>();
  const fila = [`${funcao}/index.ts`];
  while (fila.length) {
    const rel = fila.shift()!;
    if (vistos.has(rel)) continue;
    vistos.add(rel);
    fila.push(...importados(rel));
  }
  vistos.delete(LOG);
  return [...vistos].sort();
}

const linhaDe = (fonte: string, pos: number) => fonte.slice(0, pos).split("\n").length;

/** As linhas com console. ou console[ (também em comentário). */
function acharConsoles(fonte: string): number[] {
  return [...fonte.matchAll(/\bconsole\s*[.[]/g)].map((m) => linhaDe(fonte, m.index!));
}

/** Do `abre` (a posição do "(" ou do "{") até o fecho dele, pulando o que está dentro de aspas. Devolve a posição do fecho. */
function fimDoGrupo(fonte: string, abre: number): number {
  const par: Record<string, string> = { "(": ")", "{": "}" };
  const inicio = fonte[abre];
  const fim = par[inicio];
  let nivel = 0;
  for (let i = abre; i < fonte.length; i++) {
    const c = fonte[i];
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < fonte.length && fonte[i] !== c; i++) if (fonte[i] === "\\") i++;
      continue;
    }
    if (c === inicio) nivel++;
    else if (c === fim && --nivel === 0) return i;
  }
  return fonte.length;
}

/** Cada chamada de log (log.info/aviso/erro/excecao, também c.log e p.log) com o texto dos argumentos. */
function chamadasDeLog(fonte: string): Array<{ linha: number; argumentos: string }> {
  return [...fonte.matchAll(/\blog\.(?:info|aviso|erro|excecao)\s*\(/g)].map((m) => {
    const abre = m.index! + m[0].length - 1;
    return { linha: linhaDe(fonte, m.index!), argumentos: fonte.slice(abre + 1, fimDoGrupo(fonte, abre)) };
  });
}
const corpoNoLog = (argumentos: string) => /JSON\.stringify\(|\.text\(\)/.test(argumentos);

/** O último `} catch (x) {` do arquivo (o catch final) e o bloco dele; "" se não há. */
function catchFinal(fonte: string): { pos: number; bloco: string } {
  const todos = [...fonte.matchAll(/\}\s*catch\s*\(\s*[A-Za-z_$][\w$]*\s*\)\s*\{/g)];
  const ultimo = todos[todos.length - 1];
  if (!ultimo) return { pos: -1, bloco: "" };
  const abre = ultimo.index! + ultimo[0].length - 1;
  return { pos: ultimo.index!, bloco: fonte.slice(abre, fimDoGrupo(fonte, abre) + 1) };
}

describe("hml-10: os detectores acham o que procuram (controle positivo)", () => {
  it("console. e console[ — em código e em comentário; nome parecido não conta", () => {
    expect(acharConsoles('const a = 1;\n  console.error("x", e);\n')).toEqual([2]);
    expect(acharConsoles('globalThis.console.log(1);\nconsole["warn"]("x");\n// console.info aqui também')).toEqual([1, 2, 3]);
    expect(acharConsoles("const consoleDoApp = 1;\nlog.erro({ codigo: \"x\" });")).toEqual([]);
  });
  it("corpo de resposta dentro de uma chamada de log (JSON.stringify ou .text()); fora dela, não conta", () => {
    const fonte = [
      'log.erro({ codigo: "mp_pix_falhou", msg: JSON.stringify(pay).slice(0, 400) });',
      "c.log.aviso({ codigo: \"x\", msg: (await r.text()).slice(0, 300) });",
      'const texto = await r.text(); log.info({ codigo: "ok", status: r.status, msg: `a ) ${"b"}` });',
    ].join("\n");
    const chamadas = chamadasDeLog(fonte);
    expect(chamadas.map((c) => c.linha)).toEqual([1, 2, 3]);
    expect(chamadas.map((c) => corpoNoLog(c.argumentos))).toEqual([true, true, false]);
  });
  it("o catch final é o último `} catch (x) {`; sem log.excecao ele não passa", () => {
    const fonte = "try { a(); } catch (e) { log.excecao(e); }\ntry { b(); } catch { c(); }\ntry { d(); } catch (err) {\n  return erro({ x: 1 });\n}";
    const { bloco } = catchFinal(fonte);
    expect(bloco).toBe("{\n  return erro({ x: 1 });\n}");
    expect(bloco).not.toContain("log.excecao(");
    expect(catchFinal("sem catch").pos).toBe(-1);
  });
});

describe("hml-10 (D2/D6): as funções do principal desta W", () => {
  const todos = [...new Set(FUNCOES.flatMap(arquivosDa))].sort();

  it("o fecho dos imports pega as 23 funções e os _shared que escreviam no console (fora o log.ts)", () => {
    for (const f of FUNCOES) expect(todos, f).toContain(`${f}/index.ts`);
    for (const s of ["app-sem-profissional", "exclusao-profissional", "treino-servidor", "financeiro-mp", "master-porta",
      "avisar-erro", "erro-avisar-regras", "erros"]) {
      expect(todos).toContain(`_shared/${s}.ts`);
    }
    expect(todos).not.toContain(LOG);
  });

  it.each(FUNCOES)("%s: nenhum console. na função nem nos _shared que ela importa", (funcao) => {
    const achados = arquivosDa(funcao).flatMap((rel) => acharConsoles(ler(rel)).map((linha) => `${rel}:${linha}`));
    expect(achados).toEqual([]);
  });

  it("nenhum JSON.stringify( nem .text() dentro de uma chamada de log", () => {
    const achados = todos.flatMap((rel) =>
      chamadasDeLog(ler(rel)).filter((c) => corpoNoLog(c.argumentos)).map((c) => `${rel}:${c.linha}`));
    expect(achados).toEqual([]);
    // e as chamadas existem (o detector não passa por não achar nada)
    expect(todos.reduce((n, rel) => n + chamadasDeLog(ler(rel)).length, 0)).toBeGreaterThan(100);
  });

  it.each(FUNCOES)("%s: o catch final chama log.excecao", (funcao) => {
    const rel = CATCH_FINAL[funcao] ?? `${funcao}/index.ts`;
    const fonte = ler(rel);
    const { pos, bloco } = catchFinal(fonte);
    expect(pos, rel).toBeGreaterThan(-1);
    if (fonte.includes("Deno.serve(")) expect(pos, rel).toBeGreaterThan(fonte.indexOf("Deno.serve("));
    expect(bloco, rel).toContain("log.excecao(");
  });

  it.each(FUNCOES.filter((f) => !MASTER.includes(f)))("%s: o log tem o nome da função e avisa (avisarErro)", (funcao) => {
    expect(ler(`${funcao}/index.ts`)).toContain(`criarLog("${funcao}", { avisar: avisarErro })`);
  });

  it("as 3 master: o log nasce na master-porta com o nome que cada uma passa ao servir", () => {
    expect(ler("_shared/master-porta.ts")).toContain("criarLog(nome, { avisar: avisarErro })");
    for (const f of MASTER) expect(ler(`${f}/index.ts`)).toContain(`servir("${f}", `);
  });
});

describe("hml-10 (D2): do Mercado Pago, só os códigos", () => {
  afterEach(() => vi.restoreAllMocks());
  const RECUSA_DO_MP = {
    message: "Invalid user identification number of pagador@exemplo.com",
    error: "bad_request",
    status: 400,
    cause: [{ code: 2067, description: "Invalid user identification number", data: "12/10/2026 Maria Pagadora" }],
    status_detail: "cc_rejected_other_reason",
    payer: { email: "pagador@exemplo.com", identification: { number: "12345678909" } },
  };

  it("error, cause[].code e status_detail; nada da mensagem, da descrição nem de quem paga", () => {
    expect(codigosDoMp(RECUSA_DO_MP)).toEqual({ mp_erro: "bad_request", mp_causas: [2067], mp_status_detail: "cc_rejected_other_reason" });
    expect(codigosDoMp(null)).toEqual({});
    expect(codigosDoMp("erro")).toEqual({});
    expect(codigosDoMp({ message: "rede" })).toEqual({}); // o mpFetch sem resposta (status 599)
    expect(codigosDoMp({ error: "x", cause: { code: 1 } })).toEqual({ mp_erro: "x" });
  });

  it("a linha do log com a recusa do MP não leva e-mail, nome, documento nem a mensagem", () => {
    const linhas: string[] = [];
    vi.spyOn(console, "error").mockImplementation((texto: unknown) => void linhas.push(String(texto)));
    criarLog("cobranca-conta", { avisar: null }).erro({
      codigo: "mp_pix_falhou", schema: "public", acao: "pix_criar", ref: "0b9c6f1e-2a3b-4c5d-8e9f-001122334455", status: 400,
      externo: codigosDoMp(RECUSA_DO_MP),
    });
    expect(linhas).toHaveLength(1);
    expect(JSON.parse(linhas[0])).toEqual({
      nivel: "erro", funcao: "cobranca-conta", codigo: "mp_pix_falhou", schema: "public", acao: "pix_criar",
      ref: "0b9c6f1e-2a3b-4c5d-8e9f-001122334455", status: 400,
      externo: { mp_erro: "bad_request", mp_causas: [2067], mp_status_detail: "cc_rejected_other_reason" },
    });
    expect(linhas[0]).not.toMatch(/pagador|Maria|12345678909|Invalid user/);
  });

  it("os (a) do principal usam os códigos: cobranca-conta, pagamentos-aluno, app-sem-profissional e exclusao-profissional", () => {
    const contar = (rel: string, codigo: string) =>
      chamadasDeLog(ler(rel)).filter((c) => c.argumentos.includes(`codigo: "${codigo}"`) && c.argumentos.includes("codigosDoMp(")).length;
    expect(contar("cobranca-conta/index.ts", "mp_pix_falhou")).toBe(1);
    expect(contar("cobranca-conta/index.ts", "mp_cartao_falhou")).toBe(1);
    expect(contar("cobranca-conta/index.ts", "mp_assinatura_falhou")).toBe(1);
    for (const codigo of ["mp_pix_falhou", "mp_cartao_falhou", "mp_assinatura_falhou", "mp_valor_assinatura_app_falhou", "mp_reembolso_falhou"]) {
      expect(contar("pagamentos-aluno/index.ts", codigo), codigo).toBe(1);
    }
    expect(contar("_shared/app-sem-profissional.ts", "mp_cancelar_falhou")).toBe(1);
    expect(contar("_shared/exclusao-profissional.ts", "mp_cancelar_falhou")).toBe(1);
  });

  it("espelho-enviar: a recusa da espelho-nucleo vira espelho_nucleo_<status>, sem o corpo dela", () => {
    const fonte = ler("espelho-enviar/index.ts");
    expect(fonte).toContain("if (resp.status !== 200) throw new Error(`espelho_nucleo_${resp.status}`);");
    expect(fonte).not.toMatch(/texto\.slice\(/);
  });
});

describe("hml-10 (D3): sem reserva com valor de produção", () => {
  const EMAIL = ["agenda-avisar", "aluno-enviar", "alunos", "convites"];
  const tudo = { resendApiKey: "chave-de-teste", resendFrom: "Physiq <teste@exemplo.com>", siteUrl: "https://exemplo.com" };

  it("faltaNoEmail: chave e remetente sempre; SITE_URL só na produção", () => {
    expect(faltaNoEmail("public", tudo)).toEqual([]);
    expect(faltaNoEmail("staging", { ...tudo, siteUrl: "" })).toEqual([]);
    expect(faltaNoEmail("public", { ...tudo, siteUrl: "" })).toEqual(["SITE_URL"]);
    expect(faltaNoEmail("staging", { ...tudo, resendFrom: "" })).toEqual(["RESEND_FROM"]);
    expect(faltaNoEmail("public", { resendApiKey: "", resendFrom: "", siteUrl: "" })).toEqual(["RESEND_API_KEY", "RESEND_FROM", "SITE_URL"]);
  });

  it.each(EMAIL)("%s: RESEND_FROM e SITE_URL sem valor fixo; a falta volta como o sem_resend de sempre e avisa", (funcao) => {
    const fonte = ler(`${funcao}/index.ts`);
    expect(fonte).not.toMatch(/Deno\.env\.get\("(RESEND_FROM|SITE_URL)"\)\s*(\?\?|\|\|)\s*"[^"]/);
    expect(fonte).toContain('const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "";');
    expect(fonte).toContain('const SITE_URL = Deno.env.get("SITE_URL") ?? "";');
    const envio = fonte.slice(fonte.indexOf("async function enviarEmail("), fonte.indexOf('fetch("https://api.resend.com/emails"'));
    expect(envio).toMatch(
      /const falta = faltaNoEmail\(schema, \{ resendApiKey: RESEND_API_KEY, resendFrom: RESEND_FROM, siteUrl: SITE_URL \}\);\s*if \(falta\.length\) \{\s*log\.erro\(\{ codigo: "sem_configuracao", schema, .*\);\n\s*return \{ id: null, erro: "sem_resend" \};\s*\}/,
    );
  });

  it("agenda-avisar e aluno-enviar: e-mail que não saiu desfaz a reserva (o mesmo caminho do sem_resend)", () => {
    expect(ler("agenda-avisar/index.ts")).toMatch(/if \(envio\.erro !== null && ids\.length\) \{[\s\S]{0,300}?db\.rpc\("agenda_reserva_email_falhou"/);
    expect(ler("aluno-enviar/index.ts")).toMatch(/if \(envio\.erro !== null && typeof e\.aviso_id === "string"\) \{[\s\S]{0,400}?db\.rpc\("aluno_enviar_plano_falhou"/);
  });

  it("entrar-senha: sem LOGIN_IP_SAL (ou curto) → 503 indisponivel + log.erro, antes de ler o pedido (falha fechada)", () => {
    const fonte = ler("entrar-senha/index.ts");
    expect(fonte).not.toContain("SERVICE_ROLE.slice(");
    expect(fonte).toContain('const LOGIN_IP_SAL = Deno.env.get("LOGIN_IP_SAL") || "";');
    expect(fonte).toContain("const SAL_MINIMO = 16;");
    const trava = fonte.indexOf("if (LOGIN_IP_SAL.length < SAL_MINIMO) {");
    expect(trava).toBeGreaterThan(fonte.indexOf("Deno.serve("));
    expect(trava).toBeLessThan(fonte.indexOf("lerPedido(await req.json()"));
    const bloco = fonte.slice(trava, fimDoGrupo(fonte, fonte.indexOf("{", trava)) + 1);
    expect(bloco).toContain('log.erro({ codigo: "sem_configuracao", schema');
    expect(bloco).toContain('return json({ ok: false, erro: "indisponivel" }, 503, origin);');
  });

  it("motivoDoCaptcha: o 1º código do siteverify no formato do log; sem código, acao_diferente", () => {
    expect(motivoDoCaptcha({ success: false, "error-codes": ["invalid-input-response", "timeout-or-duplicate"] })).toBe("invalid_input_response");
    expect(motivoDoCaptcha({ success: true, action: "entrar" })).toBe("acao_diferente");
    expect(motivoDoCaptcha(null)).toBe("acao_diferente");
  });
});

describe("hml-10 (D10): a resposta de erro leva só o código", () => {
  it.each(["whatsapp-conectar", "whatsapp-agente", "espelho-enviar"])("%s: sem detalhe e sem o texto do erro na resposta", (funcao) => {
    const fonte = ler(`${funcao}/index.ts`);
    expect(fonte).not.toContain("detalhe");
    expect(fonte).not.toMatch(/String\(e\)/);
    expect(fonte).not.toMatch(/json\(\{[^}]*\.message/);
  });
  it("o catch das 2 do WhatsApp devolve só o erro_interno", () => {
    expect(catchFinal(ler("whatsapp-conectar/index.ts")).bloco).toContain('return erro("erro_interno", 500, origin);');
    expect(catchFinal(ler("whatsapp-agente/index.ts")).bloco).toContain('return erro("erro_interno", 500);');
    expect(ler("whatsapp-conectar/index.ts")).toContain("const erro = (codigo: string, status: number, origin: string | null) => json({ error: codigo }, status, origin);");
    expect(ler("whatsapp-agente/index.ts")).toContain("const erro = (codigo: string, status: number) => json({ error: codigo }, status);");
  });
});
