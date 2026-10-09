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
//
// Troca da anon legada (hml-16, H-35, 09/10/2026): os APKs instalados desde a v3.2 (não atualizam sozinhos), o AAB da loja
// e o site antigo mandam a anon LEGADA (JWT) do principal, e as chaves legadas vão ser desligadas. Quando o apikey (cabeçalho
// ou ?apikey=) ou o Authorization: Bearer é EXATAMENTE a anon legada — conferida pelo SHA-256 e pelo tamanho, a chave não fica
// no código —, o Worker põe no lugar a publishable do principal (secret PRINCIPAL_PUBLISHABLE do Worker, gravado pelo
// deploy.sh). Qualquer outra chave passa sem mexer, inclusive a service_role: ela morre com as legadas e nunca é trocada por
// uma chave de servidor. Sem o secret, o Worker é só o proxy de antes. É a mesma troca do physiqcalc-api
// (infra/cloudflare/physiqcalc-api/proxy.js, 04/10/2026); o IP de quem chama (abaixo) não muda.
export const ORIGIN = "https://hkxvtsbwctxkrqzkkdoz.supabase.co";
export const ANON_LEGADA_SHA256 = "e606b707377f46d03e857a20964a74cdc9240e44cb042a02280e1ea2201f244f";
export const ANON_LEGADA_TAMANHO = 208;

async function sha256Hex(texto) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

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

// criarProxy({ anonSha256, anonTamanho, buscar }) existe para o teste trocar a anon legada por uma FALSA e ver o pedido que sairia.
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
        return new Response("physiq-principal-api ok", { status: 200, headers: { "cache-control": "no-store" } });
      }
      if (!(await dentroDoTeto(request, env))) return muitosPedidos();
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
      let busca = url.search;
      const publishable = env && typeof env.PRINCIPAL_PUBLISHABLE === "string" ? env.PRINCIPAL_PUBLISHABLE.trim() : "";
      if (publishable) {
        if (await ehAnonLegada(headers.get("apikey"))) headers.set("apikey", publishable);
        const auth = headers.get("authorization") || "";
        if (/^bearer /i.test(auth) && (await ehAnonLegada(auth.slice(7).trim()))) headers.set("authorization", `Bearer ${publishable}`);
        // troca só o valor do ?apikey= (sem remontar a query: os filtros do PostgREST seguem byte a byte iguais)
        const daBusca = url.searchParams.get("apikey");
        if (daBusca && (await ehAnonLegada(daBusca))) busca = busca.replace(`apikey=${daBusca}`, `apikey=${publishable}`);
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
      return buscar(origin + url.pathname + busca, init);
    },
  };
}

export default criarProxy();
