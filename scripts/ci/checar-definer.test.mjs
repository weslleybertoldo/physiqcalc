// hml-13: testes do scripts/ci/checar-definer.mjs. Rodar: npm run test:node (ou node --test scripts/ci/checar-definer.test.mjs)
import assert from "node:assert/strict";
import { test } from "node:test";
import { checarPastas } from "./checar-definer.mjs";

const P = "supabase-principal/migrations";
const BASE = { arquivo: "20260101000000_base.sql", sql: "create function {schema}.velha(p uuid) returns int language sql security definer set search_path = '' as $$ select 1 $$;\nrevoke all on function {schema}.velha(uuid) from public, anon;\ngrant execute on function {schema}.velha(uuid) to authenticated;" };
const rodar = (...novos) => checarPastas({ [P]: [BASE, ...novos.map((sql, i) => ({ arquivo: `2026101000000${i}_nova.sql`, sql }))] }, "20261008235959");

test("definer nova sem revoke: acusa PUBLIC, anon e a escolha do logado", () => {
  const { problemas } = rodar("create or replace function {schema}.f(p uuid) returns int language sql stable security definer set search_path = '' as $$ select 1 $$;");
  assert.equal(problemas.length, 3);
  assert.match(problemas.join("\n"), /\(R2\)[\s\S]*\(R3\)[\s\S]*\(R3b\)/);
});

test("definer nova do servidor (revoke de public, anon, authenticated + grant service_role): passa", () => {
  const { problemas, checadas } = rodar(`create function {schema}.f(p uuid, q text) returns int language plpgsql security definer set search_path = '' as $f$ begin return 1; end $f$;
revoke all on function {schema}.f(uuid, text) from public, anon, authenticated;
grant execute on function {schema}.f(uuid, text) to service_role;`);
  assert.deepEqual(problemas, []);
  assert.equal(checadas, 1);
});

test("definer nova do app (revoke public, anon + grant authenticated): passa", () => {
  const { problemas } = rodar(`create function {schema}.f() returns int language sql security definer set search_path = '' as $$ select 1 $$;
revoke all on function {schema}.f() from public, anon;
grant execute on function {schema}.f() to authenticated, service_role;`);
  assert.deepEqual(problemas, []);
});

test("sem search_path: acusa mesmo numa troca (create or replace de função que já existe)", () => {
  const { problemas } = rodar("create or replace function {schema}.velha(p uuid) returns int language sql security definer as $$ select 2 $$;");
  assert.equal(problemas.length, 1);
  assert.match(problemas[0], /search_path \(R1\)/);
});

test("troca de função que já existe (mesmo nome e nº de args) não precisa repetir o revoke", () => {
  const { problemas, checadas } = rodar("create or replace function {schema}.velha(p_outro uuid) returns int language sql security definer set search_path = '' as $$ select 2 $$;");
  assert.deepEqual(problemas, []);
  assert.equal(checadas, 1);
});

test("mesmo nome com OUTRA quantidade de args é função nova (overload): acusa", () => {
  const { problemas } = rodar("create or replace function {schema}.velha(p uuid, q int) returns int language sql security definer set search_path = '' as $$ select 2 $$;");
  assert.equal(problemas.length, 3);
});

test("drop + create da mesma função = nova: acusa sem o revoke", () => {
  const { problemas } = rodar("drop function if exists {schema}.velha(uuid);\ncreate function {schema}.velha(p uuid) returns int language sql security definer set search_path = '' as $$ select 3 $$;");
  assert.equal(problemas.length, 3);
});

test("grant a anon numa definer fora da lista: acusa (R4); nas de propósito, passa", () => {
  const ruim = rodar("grant execute on function {schema}.velha(uuid) to anon;");
  assert.match(ruim.problemas.join("\n"), /\(R4\)/);
  const ok = rodar(`create function {schema}.diario_link(p_codigo text) returns jsonb language plpgsql volatile security definer set search_path = '' as $$ begin return null; end $$;
revoke all on function {schema}.diario_link(text) from public;
grant execute on function {schema}.diario_link(text) to anon, authenticated, service_role;`);
  assert.deepEqual(ok.problemas, []);
});

test("SQL dinâmico do banco do Treino (execute format com %I) também é lido", () => {
  const { problemas } = checarPastas({ "supabase/migrations": [{ arquivo: "20261010000000_x.sql", sql: `do $$ begin
  execute format('create or replace function %I.g() returns int language sql security definer set search_path = '''' as $b$ select 1 $b$', 'public');
  execute format('revoke all on function %I.g() from public, anon, authenticated', 'public');
end $$;` }] }, "20261008235959");
  assert.deepEqual(problemas, []);
});

test("gatilho definer: só exige o search_path; invoker não entra", () => {
  const { problemas, checadas } = rodar(`create function {schema}.t() returns trigger language plpgsql security definer set search_path = '' as $$ begin return new; end $$;
create function {schema}.i() returns int language sql security invoker as $$ select 1 $$;
grant execute on function {schema}.i() to anon;`);
  assert.deepEqual(problemas, []);
  assert.equal(checadas, 1);
});

test("migration antiga (antes da âncora) não é checada", () => {
  const { problemas, checadas } = checarPastas({ [P]: [{ arquivo: "20261001000000_velha.sql", sql: "create function {schema}.f() returns int language sql security definer as $$ select 1 $$;" }] }, "20261008235959");
  assert.deepEqual(problemas, []);
  assert.equal(checadas, 0);
});
