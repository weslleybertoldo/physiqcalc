import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { pegadaBloqueia } from "../../../../supabase-principal/functions/_shared/conta-aluno-regras";

// hml-09 (H-23) — a delete-my-account do Banco do Treino: o modo app (JWT do Treino, sem o segredo — o botão da TreinosPage antiga)
// apagava DE VEZ o login de qualquer papel e saiu (410 migrado); pelo staging, o modo servidor recusa quem também tem dado em
// produção (o Auth é o mesmo nos 2 ambientes). A função roda no Deno e não importa aqui: o teste lê a fonte.
const fonte = readFileSync(resolve(__dirname, "../../../../supabase/functions/delete-my-account/index.ts"), "utf8");
const regrasDoPrincipal = readFileSync(resolve(__dirname, "../../../../supabase-principal/functions/_shared/conta-aluno-regras.ts"), "utf8");
const servidor = fonte.slice(fonte.indexOf("async function modoServidor("), fonte.indexOf("Deno.serve("));
const handler = fonte.slice(fonte.indexOf("Deno.serve("));

describe("delete-my-account (Treino): o modo app saiu", () => {
  it("nenhum hard delete: todo deleteUser( é o soft delete (…, true)", () => {
    const chamadas = [...fonte.matchAll(/deleteUser\(([^)]*)\)/g)].map((m) => m[1]);
    expect(chamadas.length).toBeGreaterThan(0);
    for (const args of chamadas) expect(args).toMatch(/, true$/);
  });
  it("sem o segredo: o OPTIONS segue 200 com CORS e o resto é 410, antes de qualquer from( ou rpc(", () => {
    const preflight = handler.indexOf('if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });');
    const segredo = handler.indexOf('if (req.headers.get("x-espelho-segredo")) {');
    const migrado = handler.indexOf('return jsonErr("migrado", 410, origin);');
    expect(preflight).toBeGreaterThan(0);
    expect(segredo).toBeGreaterThan(preflight);
    expect(migrado).toBeGreaterThan(segredo);
    // o banco só é alcançado pelo modo servidor (atrás do segredo): no handler, nada lê nem apaga
    expect(handler).not.toMatch(/\.from\(|\.rpc\(|createClient\(|deleteUser\(|getUser\(/);
    // depois do modo servidor, só o 410 e o fim da função
    expect(handler.slice(handler.indexOf("return await modoServidor(req);")).replace(/\/\/.*$/gm, "").replace(/\s+/g, " ").trim())
      .toBe('return await modoServidor(req); } return jsonErr("migrado", 410, origin); });');
    // o 410 vai com CORS (o APK antigo lê o erro) e no formato { ok: false, error }
    const jsonErr = fonte.slice(fonte.indexOf("function jsonErr("), fonte.indexOf("\n}\n", fonte.indexOf("function jsonErr(")));
    expect(jsonErr).toContain("JSON.stringify({ ok: false, error: msg })");
    expect(jsonErr).toContain("...corsHeaders(origin)");
    // nada do fluxo antigo sobrou (limite de tentativas, os 12 deletes, a palavra e a trava pelo user_metadata)
    for (const velho of ["check_rate_limit", "DELETE_MY_ACCOUNT", "SUPABASE_ANON_KEY", "conta_real_protegida", "tb_treino_series", "user_metadata"]) {
      expect(fonte).not.toContain(velho);
    }
  });
});

describe("delete-my-account (Treino): pelo staging, quem tem dado em produção não é conferido nem excluído", () => {
  it("a trava vem depois de achar o id e antes do sem_vinculo, em todas as ações menos o exportar", () => {
    const id = servidor.indexOf("const treinoId = (v as { treino_user_id?: string } | null)?.treino_user_id ?? null;");
    const trava = servidor.indexOf('if ((currentSchema() as string) === "staging" && acao !== "exportar") {');
    const semVinculo = servidor.indexOf("if (!treinoId) return jsonServidor({ ok: true, sem_vinculo: true, dados: null });");
    expect(id).toBeGreaterThan(0);
    expect(trava).toBeGreaterThan(id);
    expect(semVinculo).toBeGreaterThan(trava);
    const bloco = servidor.slice(trava, semVinculo);
    expect(bloco).toContain('await admin.rpc("physiq_pegada_em_producao", { p_principal: principalId, p_treino: treinoId });');
    // erro do banco → o catch do modo servidor (500, falha fechada)
    expect(bloco).toContain("if (epg) throw epg;");
    expect(servidor).toContain('return jsonServidor({ ok: false, erro: "interno" }, 500);');
    expect(bloco).toContain('if (pegadaBloqueia(pg)) return jsonServidor({ ok: false, erro: "conta_real_no_staging", motivo: "dados_em_producao" }, 403);');
    // antes da trava, só a leitura do vínculo (nenhuma ação roda)
    expect(servidor.slice(0, trava).match(/\.rpc\(/g)).toBeNull();
  });
  it("a regra é a MESMA do principal (as 2 cópias concordam)", () => {
    const corpo = (texto: string) => {
      const i = texto.indexOf("function pegadaBloqueia(resposta: unknown): boolean {");
      expect(i).toBeGreaterThanOrEqual(0);
      return texto.slice(i, texto.indexOf("\n}\n", i));
    };
    expect(corpo(fonte)).toBe(corpo(regrasDoPrincipal));
    expect(pegadaBloqueia({ em_producao: false, colunas: [] })).toBe(false);
    expect(pegadaBloqueia({ em_producao: true, colunas: ["public.physiq_identidades.principal_user_id"] })).toBe(true);
  });
});
