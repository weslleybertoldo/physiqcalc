import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// bcode-0021, itens 1 e 7 (decisão do dono 22/11/2026: «corrigir no código até 18/12; texto do 1 numa versão seguinte»): o contrato das
// 4 migrações das contagens por conta e das 4 reversas, lido como texto — o job (nome, minuto e comando), os cortes de 46 h e 22 h, quem
// executa, o gatilho que não quebra o Auth, o physiq.schemas obrigatório no Treino, a guarda por md5 das 2 exportações e a reversa de cada
// uma. Os md5 são calculados AQUI do texto do repo (o corpo entre os delimitadores, com o schema no lugar do marcador — é o prosrc que o
// Postgres grava). O comportamento (cortes, gatilhos, exportação, reversas) foi provado no PGlite; no staging, pelo e2e do bcode-0021.
const raiz = resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(resolve(raiz, rel), "utf-8");
const md5 = (s: string) => createHash("md5").update(s, "utf8").digest("hex");
const semComentario = (sql: string) => sql.replace(/--[^\n]*/g, "");

const M1P = "supabase-principal/migrations/20261122150000_contagens_prazo_e_exclusao.sql";
const R1P = "supabase-principal/reversas/20261122150000_contagens_prazo_e_exclusao_reversa.sql";
const M1T = "supabase/migrations/20261122150100_contagens_prazo_e_exclusao_treino.sql";
const R1T = "supabase/reversas/20261122150100_contagens_prazo_e_exclusao_treino_reversa.sql";
const M7P = "supabase-principal/migrations/20261122150200_exportar_contagens.sql";
const R7P = "supabase-principal/reversas/20261122150200_exportar_contagens_reversa.sql";
const M7T = "supabase/migrations/20261122150300_exportar_contagens_treino.sql";
const R7T = "supabase/reversas/20261122150300_exportar_contagens_treino_reversa.sql";
const WA3 = "supabase-principal/migrations/20261012220000_wa3_dieta_livre.sql";
const W07 = "supabase/migrations/20260929170100_w07_exportar_excluir.sql";

function trecho(texto: string, inicio: string, fim: string): string {
  const i = texto.indexOf(inicio);
  expect(i, `sem «${inicio}»`).toBeGreaterThanOrEqual(0);
  const f = texto.indexOf(fim, i + inicio.length);
  expect(f, `sem «${fim}» depois de «${inicio}»`).toBeGreaterThan(i);
  return texto.slice(i, f + fim.length);
}
function corpoEntre(texto: string, abre: string, fecha: string): string {
  const a = texto.indexOf(abre);
  expect(a, `sem «${abre}»`).toBeGreaterThanOrEqual(0);
  return texto.slice(a + abre.length, texto.indexOf(fecha, a + abre.length));
}
const porSchema = (corpo: string, marca: string) => ({
  staging: md5(corpo.replaceAll(marca, "staging")),
  public: md5(corpo.replaceAll(marca, "public")),
});

// os minutos em que um job roda (o 1º campo do cron: "*", "*/N", "N" ou "a,b")
function minutos(agenda: string): number[] {
  const campo = agenda.trim().split(/\s+/)[0];
  if (campo === "*") return Array.from({ length: 60 }, (_, i) => i);
  if (campo.startsWith("*/")) return Array.from({ length: 60 }, (_, i) => i).filter((m) => m % Number(campo.slice(2)) === 0);
  return campo.split(",").map(Number);
}
function jobsDaPasta(pasta: string): { arquivo: string; nome: string; agenda: string }[] {
  const saida: { arquivo: string; nome: string; agenda: string }[] = [];
  for (const arquivo of readdirSync(resolve(raiz, pasta)).filter((a) => a.endsWith(".sql"))) {
    for (const m of semComentario(ler(`${pasta}/${arquivo}`)).matchAll(/cron\.schedule\(\s*('[^']*'(?:\s*\|\|\s*v_amb)?)\s*,\s*'([^']+)'/g)) {
      saida.push({ arquivo, nome: m[1], agenda: m[2] });
    }
  }
  return saida;
}

describe("bcode-0021 item 1 — principal: a contagem de senhas erradas sai no prazo e com o login", () => {
  const sql = ler(M1P);
  const limpar = trecho(sql, "create or replace function {schema}.login_bloqueios_limpar()", "\n$$;");
  const saiu = trecho(sql, "create or replace function {schema}.login_bloqueios_saiu()", "\n$$;");

  it("a limpeza apaga só a linha sem bloqueio de vez, parada há mais de 46 h, com o bloqueio por tempo e a tentativa já vencidos", () => {
    expect(limpar).toContain("language plpgsql volatile security definer set search_path = '' as $$");
    expect(limpar).toContain(`  delete from {schema}.login_bloqueios b
   where b.bloqueado_de_vez_em is null
     and b.atualizado_em < now() - interval '46 hours'
     and (b.bloqueado_ate is null or b.bloqueado_ate <= now())
     and (b.em_andamento_ate is null or b.em_andamento_ate <= now());`);
    expect(sql).toContain("revoke all on function {schema}.login_bloqueios_limpar() from public, anon, authenticated;");
    expect(sql).toContain("grant execute on function {schema}.login_bloqueios_limpar() to service_role;");
  });

  it("o job: physiq-login-bloqueios-limpeza-{schema}, de hora em hora no minuto 53, com o comando do próprio schema (e a conferência olha o comando)", () => {
    expect(sql).toContain(
      "select cron.schedule('physiq-login-bloqueios-limpeza-{schema}', '53 * * * *', $$select {schema}.login_bloqueios_limpar()$$);");
    expect(sql).toContain("and j.schedule = '53 * * * *' and j.command = 'select {schema}.login_bloqueios_limpar()') then");
    // nenhum outro job do principal roda no minuto 53 (os minutos foram escolhidos livres: */10, */15, 7, 25, 33, 41 e os das 03h)
    const no53 = jobsDaPasta("supabase-principal/migrations").filter((j) => minutos(j.agenda).includes(53));
    expect(no53.map((j) => j.nome)).toEqual(["'physiq-login-bloqueios-limpeza-{schema}'"]);
  });

  it("a saída: 2 gatilhos em auth.users — after delete e after update of email, deleted_at (só quando o e-mail muda ou o soft delete acontece)", () => {
    expect(sql).toContain(`drop trigger if exists physiq_login_bloqueios_apagado_{schema} on auth.users;
create trigger physiq_login_bloqueios_apagado_{schema} after delete on auth.users
  for each row execute function {schema}.login_bloqueios_saiu();`);
    expect(sql).toContain(`drop trigger if exists physiq_login_bloqueios_mudou_{schema} on auth.users;
create trigger physiq_login_bloqueios_mudou_{schema} after update of email, deleted_at on auth.users
  for each row
  when (old.email is distinct from new.email or (new.deleted_at is not null and old.deleted_at is null))
  execute function {schema}.login_bloqueios_saiu();`);
    expect(sql).toContain("revoke all on function {schema}.login_bloqueios_saiu() from public, anon, authenticated;");
  });

  it("o gatilho nunca quebra o Auth: sem a tabela (to_regclass) ou sem e-mail, sai antes do delete; apaga só o e-mail de antes; nenhum raise", () => {
    expect(saiu).toContain("language plpgsql security definer set search_path = '' as $$");
    const guarda = saiu.indexOf("if to_regclass('{schema}.login_bloqueios') is null or old.email is null then\n    return null;");
    expect(guarda).toBeGreaterThan(0);
    expect(saiu.indexOf("delete from {schema}.login_bloqueios where email = lower(btrim(old.email));")).toBeGreaterThan(guarda);
    expect(semComentario(saiu)).not.toMatch(/\braise\b/);
  });

  it("tudo por schema (o script troca {schema}): sem bloco compartilhado; a conferência do fim cobre definer, search_path, quem executa, os 2 gatilhos e o job", () => {
    expect(sql).not.toMatch(/^-- @@ compartilhado$/m);
    const fim = sql.slice(sql.lastIndexOf("do $c$"));
    expect(fim).toContain("pr.prosecdef and coalesce(pr.proconfig, '{}') @> array['search_path=\"\"']");
    expect(fim).toContain("has_function_privilege('anon', v_f, 'execute') or has_function_privilege('authenticated', v_f, 'execute')");
    expect(fim).toContain("has_function_privilege('service_role', '{schema}.login_bloqueios_limpar()', 'execute')");
    expect(fim).toContain("tg.tgfoid = '{schema}.login_bloqueios_saiu()'::regprocedure");
    expect(fim).toMatch(/\) <> 2 then/);
  });

  it("a reversa desfaz tudo: os 2 gatilhos, o job (unschedule) e as 2 funções — e confere que nada sobrou", () => {
    const rev = ler(R1P);
    expect(rev).toContain("drop trigger if exists physiq_login_bloqueios_apagado_{schema} on auth.users;");
    expect(rev).toContain("drop trigger if exists physiq_login_bloqueios_mudou_{schema} on auth.users;");
    expect(rev).toContain("select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'physiq-login-bloqueios-limpeza-{schema}';");
    expect(rev).toContain("drop function if exists {schema}.login_bloqueios_saiu();");
    expect(rev).toContain("drop function if exists {schema}.login_bloqueios_limpar();");
    expect(rev).toContain("raise exception 'reversa bcode-0021: sobrou gatilho, job ou função em {schema}'");
    // os gatilhos saem antes da função deles
    expect(rev.indexOf("drop trigger if exists physiq_login_bloqueios_mudou_{schema}")).toBeLessThan(rev.indexOf("drop function if exists {schema}.login_bloqueios_saiu()"));
  });
});

describe("bcode-0021 item 1 — Treino: a contagem dos limites sai no prazo e com o vínculo", () => {
  const sql = ler(M1T);
  const exigeSchema = /v_amb text := current_setting\('physiq\.schemas', true\);[\s\S]*?if v_amb is null or v_amb not in \('staging', 'public'\) then\s+raise exception 'defina physiq\.schemas = staging ou public \(recebi %\)', v_amb;/;

  it("exige o set physiq.schemas = staging ou public (um schema por chamada; o padrão antigo rodava nos 2) — a migração e a reversa", () => {
    expect(sql).toMatch(exigeSchema);
    expect(ler(R1T)).toMatch(exigeSchema);
    for (const t of [sql, ler(R1T)]) expect(t).not.toContain("ARRAY['public','staging']");
  });

  it("a limpeza corta em 22 h (a maior janela do repo é 1 h) e só o servidor executa", () => {
    expect(sql).toContain("language plpgsql volatile security definer set search_path = '' as $b$");
    expect(sql).toContain("delete from %I.edge_rate_limits where created_at < now() - interval '22 hours';");
    expect(sql).toContain("execute format('revoke all on function %I.physiq_limites_limpar() from public, anon, authenticated', v_amb);");
    expect(sql).toContain("execute format('grant execute on function %I.physiq_limites_limpar() to service_role', v_amb);");
  });

  it("o job: physiq-limites-limpeza-<schema>, minuto 17, com o comando do schema; o pg_cron só é criado se faltar", () => {
    expect(sql).toContain(
      "perform cron.schedule('physiq-limites-limpeza-' || v_amb, '17 * * * *', format('select %I.physiq_limites_limpar()', v_amb));");
    expect(sql).toContain("and j.command = format('select %I.physiq_limites_limpar()', v_amb)) then");
    expect(sql).toMatch(/if not exists \(select 1 from pg_extension where extname = 'pg_cron'\) then\s+create extension pg_cron with schema pg_catalog;\s+end if;/);
    // o único job do banco do Treino (até aqui não havia nenhum)
    expect(jobsDaPasta("supabase/migrations").map((j) => `${j.nome} ${j.agenda}`)).toEqual(["'physiq-limites-limpeza-' || v_amb 17 * * * *"]);
  });

  it("o vínculo que sai (after delete em physiq_identidades, inclusive em cascata) leva a linha gravada pelo id do principal", () => {
    expect(sql).toContain("delete from %I.edge_rate_limits where user_id = old.principal_user_id;");
    expect(sql).toContain(
      "execute format('create trigger %I after delete on %I.physiq_identidades for each row execute function %I.physiq_limites_vinculo_saiu()',");
    expect(sql).toContain("execute format('revoke all on function %I.physiq_limites_vinculo_saiu() from public, anon, authenticated', v_amb);");
    expect(sql).toContain("and tg.tgfoid = format('%I.physiq_limites_vinculo_saiu()', v_amb)::regprocedure) then");
  });

  it("a reversa desfaz: unschedule do job, drop do gatilho e das 2 funções; o pg_cron fica no banco", () => {
    const rev = ler(R1T);
    expect(rev).toContain("perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'physiq-limites-limpeza-' || v_amb;");
    expect(rev).toContain("execute format('drop trigger if exists %I on %I.physiq_identidades', 'physiq_limites_vinculo_' || v_amb, v_amb);");
    expect(rev).toContain("execute format('drop function if exists %I.physiq_limites_vinculo_saiu()', v_amb);");
    expect(rev).toContain("execute format('drop function if exists %I.physiq_limites_limpar()', v_amb);");
    expect(semComentario(rev)).not.toMatch(/drop\s+extension/i);
  });
});

describe("bcode-0021 item 7 — principal: a exportação traz login_bloqueios (só a linha do e-mail do login da pessoa)", () => {
  const sql = ler(M7P);
  const rev = ler(R7P);
  const CREATE = "CREATE OR REPLACE FUNCTION {schema}.exportar_dados_aluno(p_uid uuid)";
  const createWa3 = trecho(ler(WA3), CREATE, "\n$function$;");
  const createNovo = trecho(sql, CREATE, "\n$function$;");
  const BLOCO7 = `  -- bcode-0021 (item 7): a contagem de senhas erradas do login (login_bloqueios, W8b), só a linha do e-mail do login da pessoa
  v_tabelas := v_tabelas || jsonb_build_object(
    'login_bloqueios', (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) from {schema}.login_bloqueios b
                         where b.email = lower(btrim(coalesce(v_login ->> 'email', '')))));

`;
  const wa3 = porSchema(corpoEntre(createWa3, "AS $function$", "$function$"), "{schema}");
  const novo = porSchema(corpoEntre(createNovo, "AS $function$", "$function$"), "{schema}");

  it("o corpo novo = o da wa3 sem mudança + só o bloco do login_bloqueios, antes dos aceites (o resto da exportação fica igual)", () => {
    expect(createNovo).toContain(BLOCO7 + "  -- hml-12 (H-30)");
    expect(createNovo.replace(BLOCO7, "")).toBe(createWa3);
  });

  it("a guarda do começo aceita só o md5 do corpo da wa3 ou do corpo novo, por schema (calculados aqui do texto do repo), antes de trocar", () => {
    const g = /case when '\{schema\}' = 'staging' then array\['([0-9a-f]{32})', '([0-9a-f]{32})'\]\s+else array\['([0-9a-f]{32})', '([0-9a-f]{32})'\] end/.exec(sql);
    expect(g?.slice(1)).toEqual([wa3.staging, novo.staging, wa3.public, novo.public]);
    expect(sql).toContain("if v_md5 is null or v_md5 <> all (");
    expect(g?.index ?? Infinity).toBeLessThan(sql.indexOf(CREATE));
    // a conferência do fim: o md5 do corpo novo
    const c = /case when '\{schema\}' = 'staging' then '([0-9a-f]{32})' else '([0-9a-f]{32})' end/.exec(sql.slice(sql.indexOf(CREATE)));
    expect(c?.slice(1)).toEqual([novo.staging, novo.public]);
  });

  it("só o servidor executa: revoke de public, anon e authenticated, grant à service_role e a conferência do fim", () => {
    expect(createNovo).toContain(" STABLE SECURITY DEFINER\n SET search_path TO ''\nAS $function$");
    expect(sql).toContain("revoke all on function {schema}.exportar_dados_aluno(uuid) from public, anon, authenticated;");
    expect(sql).toContain("grant execute on function {schema}.exportar_dados_aluno(uuid) to service_role;");
    expect(sql).toContain("pg_catalog.has_function_privilege('authenticated', r.oid, 'EXECUTE') or pg_catalog.has_function_privilege('anon', r.oid, 'EXECUTE')");
    expect(sql).toContain("or not pg_catalog.has_function_privilege('service_role', r.oid, 'EXECUTE') then");
  });

  it("a reversa devolve o corpo da wa3 sem mudança (o molde do repo, sem regexp), com guarda e o md5 da wa3 no fim", () => {
    expect(trecho(rev, CREATE, "\n$function$;")).toBe(createWa3);
    const g = /case when '\{schema\}' = 'staging' then array\['([0-9a-f]{32})', '([0-9a-f]{32})'\]\s+else array\['([0-9a-f]{32})', '([0-9a-f]{32})'\] end/.exec(rev);
    expect(g?.slice(1)).toEqual([novo.staging, wa3.staging, novo.public, wa3.public]);
    const c = /case when '\{schema\}' = 'staging' then '([0-9a-f]{32})' else '([0-9a-f]{32})' end/.exec(rev.slice(rev.indexOf(CREATE)));
    expect(c?.slice(1)).toEqual([wa3.staging, wa3.public]);
    expect(semComentario(rev)).not.toMatch(/regexp_replace/);
  });
});

describe("bcode-0021 item 7 — Treino: a exportação traz edge_rate_limits pelos 2 ids da pessoa", () => {
  const sql = ler(M7T);
  const rev = ler(R7T);
  const corpoDe = (t: string) => corpoEntre(trecho(t, "physiq_exportar_aluno(p_user uuid) RETURNS jsonb", "$b$$f$"), "AS $b$", "$b$");
  const corpoW07 = corpoDe(ler(W07));
  const corpoNovo = corpoDe(sql);
  const ASSINATURAS = "FROM %1$I.physiq_assinaturas t WHERE t.user_id = p_user)";
  const EDGE = `
            'edge_rate_limits', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at, t.id), '[]'::jsonb) FROM %1$I.edge_rate_limits t
                                  WHERE t.user_id = p_user
                                     OR t.user_id = (SELECT i.principal_user_id FROM %1$I.physiq_identidades i WHERE i.treino_user_id = p_user))`;
  const w07 = porSchema(corpoW07, "%1$I");
  const novo = porSchema(corpoNovo, "%1$I");

  it("exige o set physiq.schemas = staging ou public — a migração e a reversa", () => {
    for (const t of [sql, rev]) {
      expect(t).toContain("v_amb text := current_setting('physiq.schemas', true);");
      expect(t).toMatch(/IF v_amb IS NULL OR v_amb NOT IN \('staging', 'public'\) THEN\s+RAISE EXCEPTION 'defina physiq\.schemas = staging ou public \(recebi %\)', v_amb;/);
    }
  });

  it("o corpo novo = o da w07 sem mudança, com edge_rate_limits (o id do Treino OU o id do principal pelo vínculo) depois de physiq_assinaturas", () => {
    expect(corpoNovo).toBe(corpoW07.replace(`${ASSINATURAS}),\n`, `${ASSINATURAS},${EDGE}),\n`));
    expect(corpoNovo).not.toBe(corpoW07);
  });

  it("a guarda aceita só o md5 do corpo da w07 ou do corpo novo, por schema (calculados aqui do texto do repo), antes de trocar", () => {
    const g = /CASE v_amb WHEN 'staging' THEN ARRAY\['([0-9a-f]{32})', '([0-9a-f]{32})'\]\s+ELSE ARRAY\['([0-9a-f]{32})', '([0-9a-f]{32})'\] END/.exec(sql);
    expect(g?.slice(1)).toEqual([w07.staging, novo.staging, w07.public, novo.public]);
    expect(sql).toContain("IF v_md5 IS NULL OR v_md5 <> ALL (");
    expect(g?.index ?? Infinity).toBeLessThan(sql.indexOf("CREATE OR REPLACE FUNCTION %1$I.physiq_exportar_aluno"));
    const c = /CASE v_amb WHEN 'staging' THEN '([0-9a-f]{32})' ELSE '([0-9a-f]{32})' END/.exec(sql);
    expect(c?.slice(1)).toEqual([novo.staging, novo.public]);
  });

  it("definer, search_path vazio e só o servidor — a migração confere sozinha (o checar-definer não lê o %1$I)", () => {
    expect(sql).toContain("LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $b$");
    expect(sql).toContain("EXECUTE format('REVOKE ALL ON FUNCTION %I.physiq_exportar_aluno(uuid) FROM PUBLIC, anon, authenticated', v_amb);");
    expect(sql).toContain("EXECUTE format('GRANT EXECUTE ON FUNCTION %I.physiq_exportar_aluno(uuid) TO service_role', v_amb);");
    expect(sql).toContain("p.prosecdef AND coalesce(p.proconfig, '{}') @> ARRAY['search_path=\"\"'] AS definer_sp");
    expect(sql).toContain("IF has_function_privilege('anon', r.oid, 'EXECUTE') OR has_function_privilege('authenticated', r.oid, 'EXECUTE')");
    expect(sql).toContain("OR NOT has_function_privilege('service_role', r.oid, 'EXECUTE') THEN");
  });

  it("a reversa devolve o corpo da w07 sem mudança, com guarda e o md5 da w07 no fim", () => {
    expect(corpoDe(rev)).toBe(corpoW07);
    const g = /CASE v_amb WHEN 'staging' THEN ARRAY\['([0-9a-f]{32})', '([0-9a-f]{32})'\]\s+ELSE ARRAY\['([0-9a-f]{32})', '([0-9a-f]{32})'\] END/.exec(rev);
    expect(g?.slice(1)).toEqual([novo.staging, w07.staging, novo.public, w07.public]);
    const c = /CASE v_amb WHEN 'staging' THEN '([0-9a-f]{32})' ELSE '([0-9a-f]{32})' END/.exec(rev);
    expect(c?.slice(1)).toEqual([w07.staging, w07.public]);
  });
});

describe("bcode-0021 — a ordem e as reversas", () => {
  it("o item 1 vem antes do item 7 em cada banco, tudo depois da D8 (20261121120000); cada migração tem a sua reversa", () => {
    const nome = (rel: string) => rel.slice(rel.lastIndexOf("/") + 1);
    expect(nome(M1P) < nome(M7P)).toBe(true);
    expect(nome(M1T) < nome(M7T)).toBe(true);
    for (const [m, r] of [[M1P, R1P], [M1T, R1T], [M7P, R7P], [M7T, R7T]]) {
      expect(nome(m) > "20261121120000").toBe(true);
      expect(r).toBe(m.replace("/migrations/", "/reversas/").replace(/\.sql$/, "_reversa.sql"));
      expect(ler(r).length).toBeGreaterThan(0);
    }
  });
});
