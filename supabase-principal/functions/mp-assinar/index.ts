// Physiq hml-06 (H-19, 08/10/2026): mp-assinar DESLIGADA — qualquer pedido (fora o preflight) responde 410 {"error":"migrado"}, o
// mesmo padrão das ações migradas da mp-payments do Treino. Era a assinatura do profissional do PhysiqNutri (W42–W50); desde a
// virada W28 (02/10/2026) a cobrança da conta é a cobranca-conta (Configurações › Plano, no mesmo Mercado Pago) e o site
// antigo do Nutri redireciona para o Physiq: nenhuma chamada desde 02/10 ~08h. Ela usava o token de PRODUÇÃO também no
// staging (o motivo — "o sandbox não tem /preapproval" — está superado: a cobranca-conta cria a assinatura pendente com a
// credencial de teste) e criou Pix do staging no MP de produção. Os avisos das cobranças antigas seguem no mp-webhook
// (?schema=), que repassa para a mp-webhook-conta. O código de antes está no histórico do git (29bf5cf).
// O OPTIONS responde com o MESMO CORS de antes (e2e/w02/proxy_principal.py confere pelo proxy). Não lê mais segredo nenhum.
// Publicar SÓ ASSIM: scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions mp-assinar true

// Physiq W2 (spec 7.2) + W28: as origens do Physiq (as do Nutri saíram na virada); no local, as portas do Physiq (5173/8080)
const ORIGEM_PHYSIQ = /^(https:\/\/(www\.)?physiqcalc\.com\.br|https:\/\/physiqcalc-staging\.vercel\.app|https:\/\/localhost|capacitor:\/\/localhost)$/;
function origemPermitida(origin: string | null): boolean {
  if (!origin) return false;
  if (ORIGEM_PHYSIQ.test(origin)) return true;
  return /^http:\/\/localhost:(5173|8080)$/.test(origin);
}
function cors(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origemPermitida(origin) ? origin! : "https://physiqcalc.com.br",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-schema",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

Deno.serve((req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  return new Response(JSON.stringify({ error: "migrado" }), { status: 410, headers: { "Content-Type": "application/json", ...cors(origin) } });
});
