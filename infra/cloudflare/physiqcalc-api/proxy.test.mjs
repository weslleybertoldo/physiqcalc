// Teste do proxy do Worker physiqcalc-api com uma anon legada FALSA (o hash dela no lugar do da real).
// Rodar: node --test infra/cloudflare/physiqcalc-api/
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { criarProxy, ORIGIN } from "./proxy.js";

const ANON_FALSA = "eyJ" + "x".repeat(60) + "." + "y".repeat(80) + "." + "z".repeat(63);
const PUBLISHABLE = "sb_publishable_teste123";
const SERVICE_ROLE_FALSA = "eyJ" + "s".repeat(216);
const JWT_DO_USUARIO = "eyJ" + "u".repeat(300);
const env = { TREINO_PUBLISHABLE: PUBLISHABLE };

function montar() {
  const pedidos = [];
  const proxy = criarProxy({
    anonSha256: createHash("sha256").update(ANON_FALSA).digest("hex"),
    anonTamanho: ANON_FALSA.length,
    buscar: async (alvo, init) => {
      pedidos.push({ alvo, init });
      return new Response("ok", { status: 200 });
    },
  });
  return { proxy, pedidos };
}

test("healthz responde sem chamar a Supabase", async () => {
  const { proxy, pedidos } = montar();
  const r = await proxy.fetch(new Request("https://api.physiqcalc.com.br/healthz"), env);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "physiqcalc-api ok");
  assert.equal(pedidos.length, 0);
});

test("anon legada sem sessão: apikey e Bearer viram a publishable; o resto do pedido segue igual", async () => {
  const { proxy, pedidos } = montar();
  const corpo = JSON.stringify({ a: 1 });
  await proxy.fetch(
    new Request("https://api.physiqcalc.com.br/rest/v1/tb_exercicios?select=id,nome&limit=5", {
      method: "POST",
      headers: { apikey: ANON_FALSA, Authorization: `Bearer ${ANON_FALSA}`, Prefer: "return=minimal", "x-schema": "staging", Host: "api.physiqcalc.com.br" },
      body: corpo,
    }),
    env,
  );
  const { alvo, init } = pedidos[0];
  assert.equal(alvo, `${ORIGIN}/rest/v1/tb_exercicios?select=id,nome&limit=5`);
  assert.equal(init.method, "POST");
  assert.equal(init.headers.get("apikey"), PUBLISHABLE);
  assert.equal(init.headers.get("authorization"), `Bearer ${PUBLISHABLE}`);
  assert.equal(init.headers.get("prefer"), "return=minimal");
  assert.equal(init.headers.get("x-schema"), "staging");
  assert.equal(init.headers.get("host"), null);
  assert.equal(init.redirect, "manual");
  assert.equal(init.cache, "no-store");
  assert.equal(await new Response(init.body).text(), corpo);
});

test("com sessão: o JWT do usuário fica; só o apikey legado vira a publishable", async () => {
  const { proxy, pedidos } = montar();
  await proxy.fetch(
    new Request("https://api.physiqcalc.com.br/functions/v1/admin-get-user", { headers: { apikey: ANON_FALSA, authorization: `bearer ${JWT_DO_USUARIO}` } }),
    env,
  );
  const { init } = pedidos[0];
  assert.equal(init.headers.get("apikey"), PUBLISHABLE);
  assert.equal(init.headers.get("authorization"), `bearer ${JWT_DO_USUARIO}`);
  assert.equal(init.body, undefined);
});

test("Bearer em minúsculas com a anon legada também é trocado", async () => {
  const { proxy, pedidos } = montar();
  await proxy.fetch(new Request("https://api.physiqcalc.com.br/auth/v1/user", { headers: { authorization: `bearer ${ANON_FALSA}` } }), env);
  assert.equal(pedidos[0].init.headers.get("authorization"), `Bearer ${PUBLISHABLE}`);
});

test("service_role (ou qualquer outra chave) passa sem mexer — nunca vira chave de servidor", async () => {
  const { proxy, pedidos } = montar();
  await proxy.fetch(
    new Request("https://api.physiqcalc.com.br/rest/v1/x", { headers: { apikey: SERVICE_ROLE_FALSA, Authorization: `Bearer ${SERVICE_ROLE_FALSA}` } }),
    env,
  );
  assert.equal(pedidos[0].init.headers.get("apikey"), SERVICE_ROLE_FALSA);
  assert.equal(pedidos[0].init.headers.get("authorization"), `Bearer ${SERVICE_ROLE_FALSA}`);
});

test("?apikey= legado vira a publishable sem remontar o resto da query", async () => {
  const { proxy, pedidos } = montar();
  const busca = `?select=id,nome&or=(a.eq.1,b.eq.2)&nome=ilike.*jo%C3%A3o*&apikey=${ANON_FALSA}&vsn=1.0.0`;
  await proxy.fetch(new Request(`https://api.physiqcalc.com.br/realtime/v1/websocket${busca}`), env);
  assert.equal(
    pedidos[0].alvo,
    `${ORIGIN}/realtime/v1/websocket?select=id,nome&or=(a.eq.1,b.eq.2)&nome=ilike.*jo%C3%A3o*&apikey=${PUBLISHABLE}&vsn=1.0.0`,
  );
});

test("sem o secret TREINO_PUBLISHABLE é só o proxy de antes", async () => {
  const { proxy, pedidos } = montar();
  await proxy.fetch(new Request("https://api.physiqcalc.com.br/rest/v1/x?apikey=" + ANON_FALSA, { headers: { apikey: ANON_FALSA } }), {});
  assert.equal(pedidos[0].init.headers.get("apikey"), ANON_FALSA);
  assert.ok(pedidos[0].alvo.endsWith(`apikey=${ANON_FALSA}`));
});

test("valor do mesmo tamanho mas outra chave não é trocado", async () => {
  const { proxy, pedidos } = montar();
  const parecida = ANON_FALSA.slice(0, -1) + "w";
  await proxy.fetch(new Request("https://api.physiqcalc.com.br/rest/v1/x", { headers: { apikey: parecida } }), env);
  assert.equal(pedidos[0].init.headers.get("apikey"), parecida);
});
