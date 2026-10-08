// physiq-principal-api: proxy transparente pro BANCO PRINCIPAL do Physiq (Supabase hkxvtsbwctxkrqzkkdoz — o do Nutri).
// Tudo que chega em api-principal.physiqcalc.com.br/<caminho> vai pra ORIGIN/<caminho>, mesmo método, mesmos headers
// (apikey, authorization, prefer, range, x-schema...), mesmo body. Sem cache no Cloudflare (cache: "no-store") e sem
// seguir redirects (o 302 do /auth/v1/authorize tem que voltar pro navegador). Mesma receita do physiqcalc-api
// (docs/api-dominio-proprio.md). O callback do OAuth continua no host da Supabase (não passa por aqui).
//
// W8b (limite de tentativas no login): no pedido que o Worker repassa, a Cloudflare troca o IP de quem chamou pelo IP do Worker
// (2a06:98c0:3600::103) — as funções da borda veriam todo mundo como um IP só. Nas chamadas de função (/functions/v1/…) o Worker
// manda o IP de verdade em x-physiq-ip junto com o segredo do proxy (x-physiq-proxy, secret PROXY_SEGREDO do Worker = o mesmo
// segredo das funções do principal); a função só acredita no x-physiq-ip com o segredo certo. O que o aparelho mandar nesses 2
// cabeçalhos é descartado. O resto do tráfego (auth, rest, storage) segue igual.
const ORIGIN = "https://hkxvtsbwctxkrqzkkdoz.supabase.co";

// hml-05c (homologação, H-17): as 3 RPCs públicas (sem login: diário e pré-consulta) também levam o IP de verdade — o banco conta
// os pedidos por hash do IP. Caminho normalizado ("//" e "/" no fim). Teste: node --test infra/cloudflare/physiq-principal-api/worker.test.mjs
const RPC_PUBLICAS = /^\/rest\/v1\/rpc\/(preconsulta_responder|diario_listar|diario_enviar)$/;
export function levaIp(caminho) {
  if (caminho.startsWith("/functions/v1/")) return true;
  return RPC_PUBLICAS.test(caminho.replace(/\/{2,}/g, "/").replace(/\/+$/, ""));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/healthz") {
      return new Response("physiq-principal-api ok", { status: 200, headers: { "cache-control": "no-store" } });
    }
    const target = ORIGIN + url.pathname + url.search;
    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("x-physiq-ip");
    headers.delete("x-physiq-proxy");
    const segredo = env && typeof env.PROXY_SEGREDO === "string" ? env.PROXY_SEGREDO : "";
    const ip = request.headers.get("cf-connecting-ip");
    if (segredo && ip && levaIp(url.pathname)) {
      headers.set("x-physiq-ip", ip);
      headers.set("x-physiq-proxy", segredo);
    }
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
