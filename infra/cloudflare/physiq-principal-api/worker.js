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

// hml-05c (homologação, H-17): as 9 RPCs públicas (sem login, pelo código do link: diário, pré-consulta e cadastro) levam o IP de
// verdade para o banco contar os pedidos por IP — mas SEM o segredo (o pedido ao PostgREST pode ir para os logs): vai a assinatura
// HMAC-SHA256(segredo, "ip:minuto"), que o banco confere com o segredo guardado no Vault (physiq_proxy_segredo). A lista tem que ser a
// mesma do banco (supabase-principal/migrations/20261008020000_hml05c_limite_ip_publico.sql): RPC limitada sem a assinatura cairia
// no balde do IP do Worker. Caminho normalizado ("//" e "/" no fim).
// Teste: node --test infra/cloudflare/physiq-principal-api/worker.test.mjs
export const RPCS_COM_LIMITE = [
  "diario_link", "diario_listar", "diario_enviar", "diario_paciente",
  "preconsulta_formulario", "preconsulta_responder",
  "cadastro_link_info", "cadastro_publico_info", "cadastro_publico_enviar",
];
const RPC_PUBLICAS = new RegExp(`^/rest/v1/rpc/(${RPCS_COM_LIMITE.join("|")})$`);
export function rpcPublica(caminho) {
  return RPC_PUBLICAS.test(caminho.replace(/\/{2,}/g, "/").replace(/\/+$/, ""));
}

export async function assinarIp(segredo, ip, minuto = Math.floor(Date.now() / 60000)) {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(`${ip}:${minuto}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
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
    headers.delete("x-physiq-assinatura");
    const segredo = env && typeof env.PROXY_SEGREDO === "string" ? env.PROXY_SEGREDO : "";
    const ip = request.headers.get("cf-connecting-ip");
    if (segredo && ip && rpcPublica(url.pathname)) {
      headers.set("x-physiq-ip", ip);
      headers.set("x-physiq-assinatura", await assinarIp(segredo, ip));
    } else if (segredo && ip && url.pathname.startsWith("/functions/v1/")) {
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
