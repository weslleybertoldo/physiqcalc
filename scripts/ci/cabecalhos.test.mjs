// hml-15 (H-33): a guarda dos cabeçalhos de segurança do site (vercel.json). Rodar: npm run test:node
// (ou node --test scripts/ci/cabecalhos.test.mjs). Lê os arquivos de verdade do repo: quebra no CI antes de o site quebrar.
// Prova viva: e2e/hml15/csp.py (as telas com a CSP, 0 violação fora das esperadas).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const RAIZ = new URL("../../", import.meta.url);
const ler = (rel) => readFileSync(new URL(rel, RAIZ), "utf8");
const vercel = JSON.parse(ler("vercel.json"));

const CHAVES_CSP = ["Content-Security-Policy", "Content-Security-Policy-Report-Only"];
const HOST_STAGING = "physiqcalc-staging.vercel.app";

/** A regra que vale em todas as respostas de todos os hosts (sem `has`). */
const regraGeral = () => {
  const regras = vercel.headers.filter((r) => r.source === "/(.*)" && !r.has);
  assert.equal(regras.length, 1, "o vercel.json tem 1 regra '/(.*)' sem `has` (a dos cabeçalhos de segurança)");
  return regras[0];
};
const cabecalho = (regra, nome) => regra.headers.find((h) => h.key.toLowerCase() === nome.toLowerCase())?.value;

/** A CSP da regra geral (a chave valendo ou a Report-Only — uma das 2, nunca as 2). */
function cspGeral() {
  const presentes = CHAVES_CSP.filter((k) => cabecalho(regraGeral(), k) !== undefined);
  assert.equal(presentes.length, 1, `a regra '/(.*)' tem 1 CSP (${CHAVES_CSP.join(" ou ")}); tem: ${presentes.join(", ") || "nenhuma"}`);
  return cabecalho(regraGeral(), presentes[0]);
}

/** "a b; c d" → Map { a → [b], c → [d] } (nome da diretiva em minúsculas, fontes como vieram). */
export function diretivas(csp) {
  const mapa = new Map();
  for (const parte of csp.split(";")) {
    const [nome, ...fontes] = parte.trim().split(/\s+/).filter(Boolean);
    if (!nome) continue;
    assert.ok(!mapa.has(nome.toLowerCase()), `diretiva repetida na CSP: ${nome}`);
    mapa.set(nome.toLowerCase(), fontes);
  }
  return mapa;
}

/** O `'sha256-…'` de cada `<script>` inline (sem src) de um HTML. */
export function hashesDosScriptsInline(html) {
  return [...html.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)].map(
    (m) => `'sha256-${createHash("sha256").update(m[1], "utf8").digest("base64")}'`,
  );
}

/** A origem de uma URL e, para https, a mesma origem em wss (o PowerSync usa as 2). */
const origem = (url) => new URL(url).origin;

function constante(arquivo, nome) {
  const m = ler(arquivo).match(new RegExp(`\\b${nome}\\s*=\\s*["'\`]([^"'\`]+)["'\`]`));
  assert.ok(m, `${nome} não achada em ${arquivo}`);
  return m[1];
}

test("a regra '/(.*)' manda os 5 cabeçalhos: CSP, nosniff, anti-iframe, Referrer-Policy e Permissions-Policy", () => {
  const r = regraGeral();
  assert.ok(cspGeral().length > 0);
  assert.equal(cabecalho(r, "X-Content-Type-Options"), "nosniff");
  assert.equal(cabecalho(r, "X-Frame-Options"), "DENY");
  assert.equal(cabecalho(r, "Referrer-Policy"), "strict-origin-when-cross-origin");
  const pp = cabecalho(r, "Permissions-Policy") ?? "";
  for (const recurso of ["camera", "microphone", "geolocation"]) assert.match(pp, new RegExp(`(^|,\\s*)${recurso}=\\(\\)`), `Permissions-Policy sem ${recurso}=()`);
  // o que o app usa fica no padrão (self): área de transferência, compartilhar, pagamento, passkeys, tela cheia
  for (const usado of ["clipboard-write", "clipboard-read", "web-share", "payment", "publickey-credentials-get", "fullscreen"]) {
    assert.doesNotMatch(pp, new RegExp(`(^|,\\s*)${usado}=`), `Permissions-Policy não pode mexer em ${usado} (o app usa)`);
  }
});

test("cada <script> inline do index.html tem o sha256 dele no script-src", () => {
  const hashes = hashesDosScriptsInline(ler("index.html"));
  assert.ok(hashes.length >= 1, "o index.html tem o script inline do tema");
  const scriptSrc = diretivas(cspGeral()).get("script-src") ?? [];
  for (const h of hashes) assert.ok(scriptSrc.includes(h), `o script inline do index.html mudou: ponha ${h} no script-src do vercel.json`);
});

test("o script-src não tem 'unsafe-inline' nem curinga solto", () => {
  const d = diretivas(cspGeral());
  for (const nome of ["default-src", "script-src", "script-src-elem", "script-src-attr"]) {
    const fontes = d.get(nome) ?? [];
    assert.ok(!fontes.includes("'unsafe-inline'"), `${nome} com 'unsafe-inline'`);
    for (const f of fontes) assert.ok(!["*", "https:", "http:", "data:", "blob:"].includes(f), `${nome} com o curinga ${f}`);
  }
  assert.ok((d.get("script-src") ?? []).length > 0, "a CSP tem script-src");
});

test("a CSP fecha o básico: default-src, object-src, base-uri, form-action e frame-ancestors; sem coletor de relatório", () => {
  const d = diretivas(cspGeral());
  assert.deepEqual(d.get("default-src"), ["'self'"]);
  assert.ok(["'none'", "blob:"].includes((d.get("object-src") ?? []).join(" ")), "object-src 'none' (ou só blob:, a saída do D4)");
  assert.deepEqual(d.get("base-uri"), ["'none'"]);
  assert.deepEqual(d.get("form-action"), ["'self'"]);
  assert.deepEqual(d.get("frame-ancestors"), ["'none'"]);
  // D7: staging e produção sem coletor (o report-uri é só do servidor local do E2E)
  assert.ok(!d.has("report-uri") && !d.has("report-to"), "sem report-uri/report-to no vercel.json");
});

test("os hosts das constantes do app estão na CSP", () => {
  const d = diretivas(cspGeral());
  const tem = (dir, fonte) => assert.ok((d.get(dir) ?? []).includes(fonte), `${dir} sem ${fonte}`);
  const powersync = constante("src/lib/powersync/instancia.ts", "INSTANCIA_PRODUCAO");
  tem("connect-src", origem(powersync));
  tem("connect-src", origem(powersync).replace(/^https:/, "wss:"));
  tem("connect-src", origem(constante("src/lib/apkRelease.ts", "RELEASES_API")));
  const turnstile = origem(constante("src/nucleo/captcha.ts", "SCRIPT"));
  tem("script-src", turnstile);
  tem("frame-src", turnstile);
  tem("script-src", origem(constante("node_modules/@mercadopago/sdk-js/dist/index.js", "SDK_MERCADOPAGO_URL")));
});

test("o nonce do script-src é o MP_CSP_NONCE do mpInit.ts (o antifraude do Mercado Pago)", () => {
  const nonces = (diretivas(cspGeral()).get("script-src") ?? []).filter((f) => f.startsWith("'nonce-"));
  assert.equal(nonces.length, 1, `1 nonce no script-src (tem ${nonces.length})`);
  const doVercel = nonces[0].slice("'nonce-".length, -1);
  const doApp = constante("src/components/pagamentos/mpInit.ts", "MP_CSP_NONCE");
  assert.equal(doVercel, doApp, "o 'nonce-…' do vercel.json e o MP_CSP_NONCE do mpInit.ts têm que ser iguais");
  assert.match(doApp, /^[A-Za-z0-9+/]{22,}={0,2}$/, "o nonce é base64 com 22+ caracteres");
});

test("o X-Robots-Tag vale só no host do staging", () => {
  assert.equal(cabecalho(regraGeral(), "X-Robots-Tag"), undefined, "a regra geral não pode ter X-Robots-Tag (tiraria a produção do Google)");
  const comRobots = vercel.headers.filter((r) => cabecalho(r, "X-Robots-Tag") !== undefined);
  assert.equal(comRobots.length, 1);
  assert.deepEqual(comRobots[0].has, [{ type: "host", value: HOST_STAGING }]);
  assert.equal(cabecalho(comRobots[0], "X-Robots-Tag"), "noindex, nofollow");
});

test("os Workers da Cloudflare não mandam X-Frame-Options nem frame-ancestors (o anexo em PDF abre em <iframe>)", () => {
  for (const pasta of readdirSync(new URL("infra/cloudflare/", RAIZ))) {
    for (const arquivo of readdirSync(new URL(`infra/cloudflare/${pasta}/`, RAIZ)).filter((a) => a.endsWith(".js"))) {
      const codigo = ler(`infra/cloudflare/${pasta}/${arquivo}`);
      assert.doesNotMatch(codigo, /x-frame-options|frame-ancestors/i, `infra/cloudflare/${pasta}/${arquivo}`);
    }
  }
});

test("as funções da guarda: o hash e as diretivas", () => {
  assert.deepEqual(hashesDosScriptsInline('<script src="/a.js"></script><script>x()</script><script type="module">y()</script>'), [
    `'sha256-${createHash("sha256").update("x()").digest("base64")}'`,
    `'sha256-${createHash("sha256").update("y()").digest("base64")}'`,
  ]);
  assert.deepEqual([...diretivas("default-src 'self'; img-src 'self' data:;").entries()], [["default-src", ["'self'"]], ["img-src", ["'self'", "data:"]]]);
  assert.throws(() => diretivas("img-src a; img-src b"), /repetida/);
});
