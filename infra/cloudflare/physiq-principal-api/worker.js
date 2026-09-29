// physiq-principal-api: proxy transparente pro BANCO PRINCIPAL do Physiq (Supabase hkxvtsbwctxkrqzkkdoz — o do Nutri).
// Tudo que chega em api-principal.physiqcalc.com.br/<caminho> vai pra ORIGIN/<caminho>, mesmo método, mesmos headers
// (apikey, authorization, prefer, range, x-schema...), mesmo body. Sem cache no Cloudflare (cache: "no-store") e sem
// seguir redirects (o 302 do /auth/v1/authorize tem que voltar pro navegador). Mesma receita do physiqcalc-api
// (docs/api-dominio-proprio.md). O callback do OAuth continua no host da Supabase (não passa por aqui).
const ORIGIN = "https://hkxvtsbwctxkrqzkkdoz.supabase.co";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/healthz") {
      return new Response("physiq-principal-api ok", { status: 200, headers: { "cache-control": "no-store" } });
    }
    const target = ORIGIN + url.pathname + url.search;
    const headers = new Headers(request.headers);
    headers.delete("host");
    const init = {
      method: request.method,
      headers,
      redirect: "manual",
      cache: "no-store",
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
    }
    return fetch(target, init);
  },
};
