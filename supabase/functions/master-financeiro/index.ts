// Physiq hml-14 (H-51 item 7, D10/P4, 08/10/2026): master-financeiro do Banco do Treino DESLIGADA — qualquer pedido (fora o
// preflight) responde 410 {"error":"migrado"}, o molde da mp-assinar do principal (hml-06). Era a cobrança dos professores do
// SaaS do Calc (12/09/2026); desde a virada W28 (02/10/2026) a cobrança das contas é a master-financeiro e a master-contas do
// banco principal, e TODA ação daqui já respondia 410 "migrado" logo depois do login do master: o resto do arquivo (7
// leituras e 5 gravações sem conferir o erro, o fetch do Mercado Pago sem tempo) não rodava mais. O código de antes está no
// histórico do git (178f5d6). Fica publicada (P4): despublicar = o APK/site antigo recebe 404 em vez de "migrado".
// O OPTIONS responde com o MESMO CORS de antes. Não lê segredo nem banco (não há mais o que ler).
// Publicar SÓ ASSIM: scripts/deploy_function.sh uxwpwdbbnlticxgtzcsb supabase/functions master-financeiro true

const ALLOWED_ORIGINS = new Set([
  "https://physiqcalc.vercel.app",
  "https://physiqcalc.com.br",
  "https://www.physiqcalc.com.br",
  "https://physiqcalc-staging.vercel.app",
  "capacitor://localhost",
  "https://localhost",
  "http://localhost:8080",
  "http://localhost:5173",
]);
function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://physiqcalc.vercel.app";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-schema",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

Deno.serve((req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  return new Response(JSON.stringify({ error: "migrado" }), { status: 410, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
});
