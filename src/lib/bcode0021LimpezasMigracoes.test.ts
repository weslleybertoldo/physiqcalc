import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// bcode-0021 (itens 2, 3 e 4, decisão do dono 22/11/2026: «corrigir no código até 18/12»): os prazos da Política em vigor no
// banco principal, conferidos no texto das migrações — o comportamento (os cortes, a reversa, a idempotência) foi provado num
// Postgres local e roda de novo no staging (e2e/bcode0021). Aqui: cada job tem nome, horário e comando fixos, os cortes deixam
// 1 h de folga contra o prazo, só a service_role executa e cada migração tem a reversa que desfaz.
const raiz = resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(resolve(raiz, rel), "utf-8");
const semComentario = (sql: string) => sql.replace(/--[^\n]*/g, "");

const M2 = "supabase-principal/migrations/20261122150400_limite_ip_limpeza.sql";
const R2 = "supabase-principal/reversas/20261122150400_limite_ip_limpeza_reversa.sql";
const M3 = "supabase-principal/migrations/20261122150500_avisos_erro_30_dias.sql";
const R3 = "supabase-principal/reversas/20261122150500_avisos_erro_30_dias_reversa.sql";
const R10 = "supabase-principal/reversas/20261008110000_hml10_avisos_erro_reversa.sql";
const S4 = "scripts/legal/bcode0021_ip_das_sessoes.sql";

type Job = { nome: string; horario: string; comando: string };
function jobs(sql: string): Job[] {
  return [...semComentario(sql).matchAll(/cron\.schedule\('([^']+)',\s*'([^']+)',\s*\$\$([\s\S]*?)\$\$\)/g)].map((m) => ({
    nome: m[1],
    horario: m[2],
    comando: m[3].replace(/\s+/g, " ").trim(),
  }));
}

describe("item 2: os códigos do IP saem no prazo, sem sorteio", () => {
  const sql = semComentario(ler(M2));

  it("um job de hora em hora (minuto 19) chama a limpeza do mesmo schema", () => {
    expect(jobs(ler(M2))).toEqual([
      { nome: "physiq-limite-ip-limpeza-{schema}", horario: "19 * * * *", comando: "select {schema}.limite_ip_limpar()" },
    ]);
  });

  it("os cortes deixam 1 h de folga: 46 h no login (prazo de 2 dias) e 22 h na hora pública (prazo de 1 dia)", () => {
    expect(sql).toMatch(/delete from \{schema\}\.login_tentativas_ip t where t\.atualizado_em < now\(\) - interval '46 hours'/);
    expect(sql).toMatch(/delete from \{schema\}\.publico_pedidos_ip p where p\.janela < now\(\) - interval '22 hours'/);
  });

  it("pula a tabela que não existe (a reversa da hml-05c apaga a pública)", () => {
    expect(sql).toContain("if to_regclass('{schema}.login_tentativas_ip') is not null then");
    expect(sql).toContain("if to_regclass('{schema}.publico_pedidos_ip') is not null then");
  });

  it("só a service_role executa: definer com search_path vazio, revoke de public, anon e authenticated", () => {
    expect(sql).toMatch(/security definer\s+set search_path = ''/);
    expect(sql).toContain("revoke all on function {schema}.limite_ip_limpar() from public, anon, authenticated;");
    expect(sql).toContain("grant execute on function {schema}.limite_ip_limpar() to service_role;");
    expect(sql).not.toMatch(/grant [^;]*limite_ip_limpar[^;]* to (anon|authenticated|public)/);
  });

  it("a reversa tira o job e a função, e confere", () => {
    const r = semComentario(ler(R2));
    expect(r).toContain("select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'physiq-limite-ip-limpeza-{schema}';");
    expect(r).toContain("drop function if exists {schema}.limite_ip_limpar();");
    expect(r).toMatch(/raise exception/);
  });

  it("controle negativo: a limpeza de antes (o sorteio da w08b) não tem job nem prazo fixo", () => {
    const w08b = semComentario(ler("supabase-principal/migrations/20260930020000_w08b_limite_login.sql"));
    expect(w08b).toMatch(/if random\(\) < 0\.02 then\s+delete from \{schema\}\.login_tentativas_ip/);
    expect(jobs(w08b).filter((j) => j.comando.includes("login_tentativas_ip"))).toEqual([]);
  });
});

describe("item 3: os avisos de erro saem em até 30 dias", () => {
  const sql = semComentario(ler(M3));

  it("um job de hora em hora (minuto 47) apaga as 2 tabelas com corte de 29 dias e 23 horas", () => {
    const [job, ...outros] = jobs(ler(M3));
    expect(outros).toEqual([]);
    expect(job.nome).toBe("physiq-avisos-erro-limpeza-{schema}");
    expect(job.horario).toBe("47 * * * *");
    expect(job.comando).toContain(
      "delete from {schema}.avisos_erro where coalesce(ultimo_aviso_em, primeiro_em) < now() - interval '29 days 23 hours'");
    expect(job.comando).toContain("delete from {schema}.avisos_erro_hora where hora < now() - interval '29 days 23 hours'");
  });

  it("a migração apaga uma vez o que já passou e confere que nada ficou com mais de 30 dias", () => {
    const fora = sql.replace(/\$\$[\s\S]*?\$\$/, "");
    expect(fora).toContain(
      "delete from {schema}.avisos_erro where coalesce(ultimo_aviso_em, primeiro_em) < now() - interval '29 days 23 hours';");
    expect(fora).toContain("delete from {schema}.avisos_erro_hora where hora < now() - interval '29 days 23 hours';");
    expect(fora).toMatch(/sobrou aviso de erro com mais de 30 dias/);
  });

  it("sem as tabelas da hml-10 a migração para (não cria job que falharia de hora em hora)", () => {
    expect(sql.indexOf("falta a hml-10")).toBeLessThan(sql.indexOf("cron.schedule("));
  });

  it("a reversa tira o job; a reversa da hml-10 também, antes de apagar as tabelas", () => {
    const linha = "select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'physiq-avisos-erro-limpeza-{schema}';";
    expect(semComentario(ler(R3))).toContain(linha);
    const r10 = semComentario(ler(R10));
    expect(r10.indexOf(linha)).toBeGreaterThan(-1);
    expect(r10.indexOf(linha)).toBeLessThan(r10.indexOf("drop table if exists {schema}.avisos_erro"));
  });
});

describe("item 4: o IP guardado nas sessões do login", () => {
  const texto = ler(S4);
  const linhas = texto.split("\n");
  const i = linhas.findIndex((l) => l.trim() === "-- @@ compartilhado");
  const deCima = linhas.slice(0, i).join("\n");
  const compartilhado = semComentario(linhas.slice(i + 1).join("\n"));

  it("roda só no bloco compartilhado (auth.sessions é uma só para staging e public)", () => {
    expect(i).toBeGreaterThan(0);
    expect(semComentario(deCima).trim()).toBe("");
  });

  it("apaga só o IP: nenhuma sessão sai", () => {
    expect(compartilhado).toContain("update auth.sessions set ip = null where ip is not null;");
    expect(compartilhado).not.toMatch(/\b(delete|drop|truncate)\b/i);
    expect(compartilhado).not.toMatch(/user_agent|refresh_token/);
  });
});
