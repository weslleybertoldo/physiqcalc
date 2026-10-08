// Teste do Worker physiq-principal-api (hml-05c, 08/10/2026). Rodar: node --test infra/cloudflare/physiq-principal-api/worker.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHmac } from "node:crypto";
import worker, { RPCS_COM_LIMITE, assinarIp, chaveDoIp, rpcPublica } from "./worker.js";

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

async function pedido(caminho, cabecalhos) {
  const vistos = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (alvo, init) => {
    vistos.push({ alvo, headers: init.headers });
    return new Response("ok", { status: 200 });
  };
  try {
    const req = new Request(`https://api-principal.physiqcalc.com.br${caminho}`, { method: "POST", body: "{}", headers: cabecalhos });
    await worker.fetch(req, { PROXY_SEGREDO: "segredo-de-teste" });
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
