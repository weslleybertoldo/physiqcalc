// Teste do Worker physiq-principal-api (hml-05c, 08/10/2026; troca da anon legada, hml-16, 09/10/2026).
// Rodar: node --test infra/cloudflare/physiq-principal-api/worker.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, createHmac } from "node:crypto";
import worker, { ANON_LEGADA_SHA256, ANON_LEGADA_TAMANHO, ORIGIN, RPCS_COM_LIMITE, assinarIp, chaveDoIp, criarProxy, rpcPublica } from "./worker.js";

test("rpcPublica: as 9 RPCs públicas (caminho normalizado); o resto não", () => {
  assert.equal(RPCS_COM_LIMITE.length, 9);
  for (const nome of RPCS_COM_LIMITE) assert.equal(rpcPublica(`/rest/v1/rpc/${nome}`), true, nome);
  for (const c of ["/rest/v1/rpc/diario_enviar/", "/rest/v1//rpc/preconsulta_responder", "/rest/v1/rpc/diario_link//"]) {
    assert.equal(rpcPublica(c), true, c);
  }
  for (const c of ["/functions/v1/entrar-senha", "/rest/v1/rpc/outra_funcao", "/rest/v1/pacientes", "/auth/v1/token", "/rest/v1/rpc/diario_listar_x",
                   "/rest/v1/rpc/xdiario_link", "/rest/v1/rpc/diario_pasta_valida", "/rest/v1/rpc/cadastro_link_enviar"]) {
    assert.equal(rpcPublica(c), false, c);
  }
});

async function pedido(caminho, cabecalhos, env = { PROXY_SEGREDO: "segredo-de-teste" }) {
  const vistos = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (alvo, init) => {
    vistos.push({ alvo, headers: init.headers });
    return new Response("ok", { status: 200 });
  };
  try {
    const req = new Request(`https://api-principal.physiqcalc.com.br${caminho}`, { method: "POST", body: "{}", headers: cabecalhos });
    await worker.fetch(req, env);
  } finally {
    globalThis.fetch = original;
  }
  return vistos[0];
}

test("assinatura = HMAC-SHA256(segredo, 'ip:minuto') em hex (o banco confere igual com o pgcrypto)", async () => {
  const esperado = createHmac("sha256", "segredo-de-teste").update("203.0.113.9:29000000").digest("hex");
  assert.equal(await assinarIp("segredo-de-teste", "203.0.113.9", 29000000), esperado);
});

test("RPC pública leva o IP de verdade e a assinatura, NUNCA o segredo; o que o aparelho manda é descartado", async () => {
  const v = await pedido("/rest/v1/rpc/diario_listar", { "cf-connecting-ip": "203.0.113.9", "x-physiq-ip": "1.1.1.1", "x-physiq-proxy": "falso", "x-physiq-assinatura": "falsa" });
  assert.equal(v.headers.get("x-physiq-ip"), "203.0.113.9");
  assert.equal(v.headers.get("x-physiq-proxy"), null);
  assert.match(v.headers.get("x-physiq-assinatura"), /^[0-9a-f]{64}$/);
});

test("função da borda segue levando o IP com o segredo (como antes)", async () => {
  const v = await pedido("/functions/v1/entrar-senha", { "cf-connecting-ip": "203.0.113.9" });
  assert.equal(v.headers.get("x-physiq-ip"), "203.0.113.9");
  assert.equal(v.headers.get("x-physiq-proxy"), "segredo-de-teste");
});

test("tabela comum não leva IP, segredo nem assinatura (e o que o aparelho manda sai)", async () => {
  const v = await pedido("/rest/v1/pacientes", { "cf-connecting-ip": "203.0.113.9", "x-physiq-ip": "1.1.1.1", "x-physiq-proxy": "falso", "x-physiq-assinatura": "falsa" });
  assert.equal(v.headers.get("x-physiq-ip"), null);
  assert.equal(v.headers.get("x-physiq-proxy"), null);
  assert.equal(v.headers.get("x-physiq-assinatura"), null);
});

// H-46: teto geral por IP (binding LIMITE)
function limitador(respostas) {
  const chaves = [];
  return { chaves, limit: async ({ key }) => { chaves.push(key); const r = respostas.shift(); if (r instanceof Error) throw r; return { success: r }; } };
}

async function comTeto(metodo, caminho, env, ip = "2804:14c:65a1:4000::abcd") {
  const original = globalThis.fetch;
  let foi = 0;
  globalThis.fetch = async () => { foi += 1; return new Response("ok", { status: 200 }); };
  try {
    const req = new Request(`https://api-principal.physiqcalc.com.br${caminho}`, { method: metodo, headers: { "cf-connecting-ip": ip } });
    const r = await worker.fetch(req, env);
    return { status: r.status, corpo: await r.text(), foi };
  } finally {
    globalThis.fetch = original;
  }
}

test("chaveDoIp: IPv4 inteiro; IPv6 pela rede /64", () => {
  assert.equal(chaveDoIp("203.0.113.9"), "203.0.113.9");
  assert.equal(chaveDoIp("2001:db8:1:2:3:4:5:6"), "2001:db8:1:2::/64");
  assert.equal(chaveDoIp("2001:db8::1"), "2001:db8:0:0::/64");
  assert.equal(chaveDoIp("2804:14c:65a1:4000::abcd"), chaveDoIp("2804:14c:65a1:4000:1:2:3:4"));
});

test("teto: acima do limite → 429 muitos_pedidos sem ir à origem; abaixo segue; a chave é a /64", async () => {
  const lim = limitador([true, false]);
  const ok = await comTeto("GET", "/rest/v1/pacientes", { LIMITE: lim });
  assert.equal(ok.status, 200);
  assert.equal(ok.foi, 1);
  const barrado = await comTeto("POST", "/rest/v1/rpc/diario_link", { LIMITE: lim });
  assert.equal(barrado.status, 429);
  assert.equal(barrado.foi, 0);
  assert.equal(JSON.parse(barrado.corpo).message, "muitos_pedidos");
  assert.deepEqual(lim.chaves, ["2804:14c:65a1:4000::/64", "2804:14c:65a1:4000::/64"]);
});

test("teto: preflight e /healthz não contam; sem binding ou com o limitador falhando, segue", async () => {
  const lim = limitador([]);
  assert.equal((await comTeto("OPTIONS", "/rest/v1/pacientes", { LIMITE: lim })).status, 200);
  assert.equal((await comTeto("GET", "/healthz", { LIMITE: lim })).status, 200);
  assert.equal(lim.chaves.length, 0);
  assert.equal((await comTeto("GET", "/rest/v1/pacientes", {})).status, 200);
  assert.equal((await comTeto("GET", "/rest/v1/pacientes", { LIMITE: limitador([new Error("fora do ar")]) })).status, 200);
});

// hml-16 (H-35): troca da anon legada pela publishable — os casos do physiqcalc-api (proxy.test.mjs), com uma anon legada FALSA
// (o hash dela no lugar do da real).
const ANON_FALSA = "eyJ" + "x".repeat(60) + "." + "y".repeat(80) + "." + "z".repeat(63);
const PUBLISHABLE = "sb_publishable_teste123";
const SERVICE_ROLE_FALSA = "eyJ" + "s".repeat(216);
const JWT_DO_USUARIO = "eyJ" + "u".repeat(300);
const env = { PRINCIPAL_PUBLISHABLE: PUBLISHABLE };
const BASE = "https://api-principal.physiqcalc.com.br";

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

test("a anon legada no código: só o SHA-256 (64 hex) e o tamanho (208), nunca a chave", () => {
  assert.match(ANON_LEGADA_SHA256, /^[0-9a-f]{64}$/);
  assert.equal(ANON_LEGADA_TAMANHO, 208);
});

test("healthz responde sem chamar a Supabase", async () => {
  const { proxy, pedidos } = montar();
  const r = await proxy.fetch(new Request(`${BASE}/healthz`), env);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "physiq-principal-api ok");
  assert.equal(pedidos.length, 0);
});

test("anon legada sem sessão: apikey e Bearer viram a publishable; o resto do pedido segue igual", async () => {
  const { proxy, pedidos } = montar();
  const corpo = JSON.stringify({ a: 1 });
  await proxy.fetch(
    new Request(`${BASE}/rest/v1/pacientes?select=id,nome&limit=5`, {
      method: "POST",
      headers: { apikey: ANON_FALSA, Authorization: `Bearer ${ANON_FALSA}`, Prefer: "return=minimal", "Content-Profile": "staging", Host: "api-principal.physiqcalc.com.br" },
      body: corpo,
    }),
    env,
  );
  const { alvo, init } = pedidos[0];
  assert.equal(alvo, `${ORIGIN}/rest/v1/pacientes?select=id,nome&limit=5`);
  assert.equal(init.method, "POST");
  assert.equal(init.headers.get("apikey"), PUBLISHABLE);
  assert.equal(init.headers.get("authorization"), `Bearer ${PUBLISHABLE}`);
  assert.equal(init.headers.get("prefer"), "return=minimal");
  assert.equal(init.headers.get("content-profile"), "staging");
  assert.equal(init.headers.get("host"), null);
  assert.equal(init.redirect, "manual");
  assert.equal(init.cache, "no-store");
  assert.equal(await new Response(init.body).text(), corpo);
});

test("com sessão: o JWT do usuário fica; só o apikey legado vira a publishable", async () => {
  const { proxy, pedidos } = montar();
  await proxy.fetch(new Request(`${BASE}/functions/v1/alunos`, { headers: { apikey: ANON_FALSA, authorization: `bearer ${JWT_DO_USUARIO}` } }), env);
  const { init } = pedidos[0];
  assert.equal(init.headers.get("apikey"), PUBLISHABLE);
  assert.equal(init.headers.get("authorization"), `bearer ${JWT_DO_USUARIO}`);
  assert.equal(init.body, undefined);
});

test("Bearer em minúsculas com a anon legada também é trocado", async () => {
  const { proxy, pedidos } = montar();
  await proxy.fetch(new Request(`${BASE}/auth/v1/user`, { headers: { authorization: `bearer ${ANON_FALSA}` } }), env);
  assert.equal(pedidos[0].init.headers.get("authorization"), `Bearer ${PUBLISHABLE}`);
});

test("service_role (ou qualquer outra chave) passa sem mexer — nunca vira chave de servidor", async () => {
  const { proxy, pedidos } = montar();
  await proxy.fetch(new Request(`${BASE}/rest/v1/x`, { headers: { apikey: SERVICE_ROLE_FALSA, Authorization: `Bearer ${SERVICE_ROLE_FALSA}` } }), env);
  assert.equal(pedidos[0].init.headers.get("apikey"), SERVICE_ROLE_FALSA);
  assert.equal(pedidos[0].init.headers.get("authorization"), `Bearer ${SERVICE_ROLE_FALSA}`);
});

test("?apikey= legado vira a publishable sem remontar o resto da query", async () => {
  const { proxy, pedidos } = montar();
  const busca = `?select=id,nome&or=(a.eq.1,b.eq.2)&nome=ilike.*jo%C3%A3o*&apikey=${ANON_FALSA}&vsn=1.0.0`;
  await proxy.fetch(new Request(`${BASE}/realtime/v1/websocket${busca}`), env);
  assert.equal(
    pedidos[0].alvo,
    `${ORIGIN}/realtime/v1/websocket?select=id,nome&or=(a.eq.1,b.eq.2)&nome=ilike.*jo%C3%A3o*&apikey=${PUBLISHABLE}&vsn=1.0.0`,
  );
});

test("sem o secret PRINCIPAL_PUBLISHABLE (ou só com espaços) é só o proxy de antes", async () => {
  for (const semSecret of [{}, { PROXY_SEGREDO: "segredo-de-teste" }, { PRINCIPAL_PUBLISHABLE: "  \n" }]) {
    const { proxy, pedidos } = montar();
    await proxy.fetch(new Request(`${BASE}/rest/v1/x?apikey=${ANON_FALSA}`, { headers: { apikey: ANON_FALSA, authorization: `Bearer ${ANON_FALSA}` } }), semSecret);
    assert.equal(pedidos[0].init.headers.get("apikey"), ANON_FALSA);
    assert.equal(pedidos[0].init.headers.get("authorization"), `Bearer ${ANON_FALSA}`);
    assert.ok(pedidos[0].alvo.endsWith(`apikey=${ANON_FALSA}`));
  }
});

test("valor do mesmo tamanho mas outra chave não é trocado", async () => {
  const { proxy, pedidos } = montar();
  const parecida = ANON_FALSA.slice(0, -1) + "w";
  await proxy.fetch(new Request(`${BASE}/rest/v1/x`, { headers: { apikey: parecida } }), env);
  assert.equal(pedidos[0].init.headers.get("apikey"), parecida);
});

test("a troca não mexe no IP: a função leva a publishable e o IP com o segredo; a RPC pública, a publishable e a assinatura", async () => {
  const { proxy, pedidos } = montar();
  const comTudo = { ...env, PROXY_SEGREDO: "segredo-de-teste" };
  const ip = { "cf-connecting-ip": "203.0.113.9" };
  await proxy.fetch(new Request(`${BASE}/functions/v1/entrar-senha`, { method: "POST", body: "{}", headers: { ...ip, apikey: ANON_FALSA, Authorization: `Bearer ${ANON_FALSA}` } }), comTudo);
  await proxy.fetch(new Request(`${BASE}/rest/v1/rpc/diario_link`, { method: "POST", body: "{}", headers: { ...ip, apikey: ANON_FALSA, "x-physiq-proxy": "falso" } }), comTudo);
  const [funcao, rpc] = pedidos.map((x) => x.init.headers);
  assert.equal(funcao.get("apikey"), PUBLISHABLE);
  assert.equal(funcao.get("authorization"), `Bearer ${PUBLISHABLE}`);
  assert.equal(funcao.get("x-physiq-ip"), "203.0.113.9");
  assert.equal(funcao.get("x-physiq-proxy"), "segredo-de-teste");
  assert.equal(rpc.get("apikey"), PUBLISHABLE);
  assert.equal(rpc.get("x-physiq-ip"), "203.0.113.9");
  assert.equal(rpc.get("x-physiq-proxy"), null);
  assert.match(rpc.get("x-physiq-assinatura"), /^[0-9a-f]{64}$/);
});

test("o Worker publicado (export default) confere pela constante da real: a anon FALSA passa sem troca", async () => {
  const v = await pedido("/rest/v1/pacientes", { apikey: ANON_FALSA, authorization: `Bearer ${ANON_FALSA}` }, env);
  assert.equal(v.alvo, `${ORIGIN}/rest/v1/pacientes`);
  assert.equal(v.headers.get("apikey"), ANON_FALSA);
  assert.equal(v.headers.get("authorization"), `Bearer ${ANON_FALSA}`);
});
