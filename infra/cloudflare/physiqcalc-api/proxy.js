// Lógica do Worker physiqcalc-api (o worker.js só liga isto). Separado pra testar com uma chave falsa:
// node --test infra/cloudflare/physiqcalc-api/proxy.test.mjs
//
// Proxy transparente pro projeto Supabase do PhysiqCalc (Banco do Treino): tudo que chega em api.physiqcalc.com.br/<caminho>
// vai pra ORIGIN/<caminho>, mesmo método, mesmos headers (apikey, authorization, prefer, range...), mesmo body. Sem cache
// no Cloudflare (cache: "no-store") e sem seguir redirects (o 302 do /auth/v1/authorize tem que voltar pro navegador).
//
// Troca da chave vazada (04/10/2026): o APK instalado (não atualiza sozinho) e o site antigo mandam a anon LEGADA (JWT) do
// Treino, e as chaves legadas vão ser desligadas. Quando o apikey (cabeçalho ou ?apikey=) ou o Authorization: Bearer é
// EXATAMENTE a anon legada — conferida pelo SHA-256, a chave não fica no código —, o Worker põe no lugar a publishable do
// Treino (secret TREINO_PUBLISHABLE do Worker). Qualquer outra chave passa sem mexer, inclusive a service_role vazada: ela
// morre com as legadas e nunca é trocada por uma chave de servidor. Sem o secret, o Worker é só o proxy de antes.
export const ORIGIN = "https://uxwpwdbbnlticxgtzcsb.supabase.co";
export const ANON_LEGADA_SHA256 = "28ed922480c881c9aac4dfbc7fc3f89795cdf2f12a058bb04490abf42323379a";
export const ANON_LEGADA_TAMANHO = 208;

async function sha256Hex(texto) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Homologação (H-17, 08/10/2026): o login do Treino é só pela troca de token do Physiq (função trocar-token) — login por senha e
// cadastro direto por este endereço ficam barrados (o app não usa; o APK antigo que entrava assim ficou de fora, decisão do dono).
// O resto do Auth (refresh_token, authorize, user, logout) passa igual. Caminho normalizado: "//" e "/" no fim não escapam.
export function barrado(metodo, url) {
  if (metodo !== "POST") return false;
  const caminho = url.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  if (caminho === "/auth/v1/signup") return true;
  return caminho === "/auth/v1/token" && url.searchParams.getAll("grant_type").includes("password");
}

// H-46 (homologação, 08/10/2026): teto geral por IP — só segura enxurrada (um aparelho, ou vários atrás do mesmo IP, fica muito
// abaixo). Binding de rate limiting da Cloudflare (LIMITE, gravado pelo deploy.sh): a conta é por local da Cloudflare e aproximada.
// IPv6 conta pela rede /64 (cada aparelho costuma ter uma /64 inteira). Sem o binding não limita; o preflight (OPTIONS) não conta;
// se o limitador falhar, o pedido segue (ele não pode derrubar a API).
export function chaveDoIp(ip) {
  const v = String(ip || "").trim();
  if (!v.includes(":")) return v;
  const [esq, dir] = v.split("::");
  const a = esq ? esq.split(":") : [];
  const b = dir ? dir.split(":") : [];
  const grupos = v.includes("::") ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b] : a;
  return grupos.slice(0, 4).map((g) => (parseInt(g, 16) || 0).toString(16)).join(":") + "::/64";
}

export async function dentroDoTeto(request, env) {
  const limitador = env && env.LIMITE;
  const ip = request.headers.get("cf-connecting-ip");
  if (request.method === "OPTIONS" || !ip || !limitador || typeof limitador.limit !== "function") return true;
  try {
    const { success } = await limitador.limit({ key: chaveDoIp(ip) });
    return success !== false;
  } catch {
    return true;
  }
}

export function muitosPedidos() {
  return new Response(JSON.stringify({ code: "muitos_pedidos", message: "muitos_pedidos" }), {
    status: 429,
    headers: { "content-type": "application/json", "cache-control": "no-store", "retry-after": "60", "access-control-allow-origin": "*" },
  });
}

export function criarProxy({
  origin = ORIGIN,
  anonSha256 = ANON_LEGADA_SHA256,
  anonTamanho = ANON_LEGADA_TAMANHO,
  buscar = (alvo, init) => fetch(alvo, init),
} = {}) {
  const ehAnonLegada = async (valor) => Boolean(valor) && valor.length === anonTamanho && (await sha256Hex(valor)) === anonSha256;

  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname === "/" || url.pathname === "/healthz") {
        return new Response("physiqcalc-api ok", { status: 200, headers: { "cache-control": "no-store" } });
      }
      if (!(await dentroDoTeto(request, env))) return muitosPedidos();
      if (barrado(request.method, url)) {
        const corpo = { error: "barrado", error_description: "Senha e cadastro direto no Banco do Treino estão desligados: o login é pelo Physiq." };
        return new Response(JSON.stringify(corpo), { status: 403, headers: { "content-type": "application/json", "cache-control": "no-store" } });
      }
      const headers = new Headers(request.headers);
      headers.delete("host");
      let busca = url.search;
      const publishable = env && typeof env.TREINO_PUBLISHABLE === "string" ? env.TREINO_PUBLISHABLE.trim() : "";
      if (publishable) {
        if (await ehAnonLegada(headers.get("apikey"))) headers.set("apikey", publishable);
        const auth = headers.get("authorization") || "";
        if (/^bearer /i.test(auth) && (await ehAnonLegada(auth.slice(7).trim()))) headers.set("authorization", `Bearer ${publishable}`);
        // troca só o valor do ?apikey= (sem remontar a query: os filtros do PostgREST seguem byte a byte iguais)
        const daBusca = url.searchParams.get("apikey");
        if (daBusca && (await ehAnonLegada(daBusca))) busca = busca.replace(`apikey=${daBusca}`, `apikey=${publishable}`);
      }
      const init = { method: request.method, headers, redirect: "manual", cache: "no-store" };
      if (request.method !== "GET" && request.method !== "HEAD") {
        init.body = request.body;
      }
      return buscar(origin + url.pathname + busca, init);
    },
  };
}
