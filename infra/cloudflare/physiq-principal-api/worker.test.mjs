// Teste do Worker physiq-principal-api (hml-05c, 08/10/2026). Rodar: node --test infra/cloudflare/physiq-principal-api/worker.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHmac } from "node:crypto";
import worker, { assinarIp, rpcPublica } from "./worker.js";

test("rpcPublica: as 3 RPCs públicas (caminho normalizado); o resto não", () => {
  for (const c of ["/rest/v1/rpc/diario_listar", "/rest/v1/rpc/diario_enviar/", "/rest/v1//rpc/preconsulta_responder"]) {
    assert.equal(rpcPublica(c), true, c);
  }
  for (const c of ["/functions/v1/entrar-senha", "/rest/v1/rpc/outra_funcao", "/rest/v1/pacientes", "/auth/v1/token", "/rest/v1/rpc/diario_listar_x"]) {
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
