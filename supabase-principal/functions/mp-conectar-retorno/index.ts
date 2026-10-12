// Physiq W2 — mp-conectar-retorno (banco principal): a VOLTA do OAuth do Mercado Pago. O dono tocou em "Conectar com o Mercado Pago"
// (pagamentos-aluno › prof_mp_conectar: o state de uso único em {schema}.mp_conexoes + o PKCE cifrado), entrou na conta dele no MP e
// autorizou; o MP manda o NAVEGADOR para cá:
//   GET https://api-principal.physiqcalc.com.br/functions/v1/mp-conectar-retorno/<public|staging>?code=TG-…&state=…   (ou ?error=…&state=…)
// Sem JWT (verify_jwt = false). A segurança é o state: 32 bytes aleatórios, só o sha256 no banco, vale 10 min e UMA vez (UPDATE condicional).
// Com o state certo: troca o code no POST /oauth/token (o client das funções; o redirect GRAVADO na conexão; o verifier decifrado;
// test_token "true" só no staging) → guarda o par CIFRADO na própria conexão (resultado 'confirmar') → 302 para o site do schema
// (/painel/configuracoes/recebimento?mp=confirmar&c=<id da conexão>). NÃO grava a integração (revisão I8): quem grava é a confirmação, COMO
// A PESSOA que começou (prof_mp_confirmar → recebimento_mp_confirmar). A volta é FIXA por schema: nada da URL decide para onde vai (sem open
// redirect); o schema vem do CAMINHO (a URI cadastrada no MP é uma por schema). Sempre o site (no APK, o Conectar abre o site — decisão 6).
// Resultados (o ?mp= da volta — TEXTO_DO_RETORNO): confirmar · negado (o dono não autorizou) · vencido (o state certo, passados os 10 min) ·
// invalido (state usado, inexistente ou de outro schema; code fora do formato; a troca recusada — MENOR 14) · falhou (MP fora, sem a
// configuração, erro) · conta_de_teste (conta de teste na produção ou de verdade no staging — MENOR 20). Método que não é GET, schema
// fora do caminho, state fora do formato ou o schema ainda sem a W2 → invalido, sem gastar nada.
// Nunca: code, state, verifier ou token no log, na resposta ou na URL de volta (o log leva o id da conta, o resultado e o ms); a resposta leva
// Referrer-Policy: no-referrer (MENOR 15: o site não recebe o Referer com o code e o state) e Cache-Control: no-store.
// Rota pública: limite por IP — ipDoPedido com o PROXY_SEGREDO (o caminho cadastrado é o domínio próprio, pelo Worker api-principal, que
// repassa o GET com a busca e devolve o 302 sem seguir).
// Publicar SÓ ASSIM: scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions mp-conectar-retorno false
// Segredos: MP_CLIENT_ID, MP_CLIENT_SECRET (no staging, os _STAGING se existirem), MP_TOKENS_CHAVE, PROXY_SEGREDO (+ os automáticos);
// MP_OAUTH_PKCE=0 desliga o PKCE (o mesmo do prof_mp_conectar). MP_API_BASE: só no Deno local (o simulador).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { chaveDoAmbiente, dadoAssociado, decifrar } from "../_shared/cifra-mp.ts";
import { ipDoPedido } from "../_shared/entrar-senha-regras.ts";
import { criarLog } from "../_shared/log.ts";
import { guardarParaConfirmar, oauthDoAmbiente, pkceLigado, schemaTemW2, trocarCodigo, type ContextoMpConta } from "../_shared/mp-conta.ts";
import { destinoDoRetorno, ehEstado, sha256Hex, type ResultadoDoRetorno, type Schema } from "../_shared/mp-conta-regras.ts";
import { ORCAMENTO_MS, prazo } from "../_shared/tempo.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PROXY_SEGREDO = Deno.env.get("PROXY_SEGREDO") ?? null;
const SITE: Record<Schema, string> = { public: "https://physiqcalc.com.br", staging: "https://physiqcalc-staging.vercel.app" };
const SEM_CACHE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const log = criarLog("mp-conectar-retorno", { avisar: avisarErro });
const clientes = new Map<Schema, SupabaseClient>();
const dbDe = (s: Schema) => clientes.get(s) ?? clientes.set(s, createClient(SUPABASE_URL, SERVICE_ROLE, {
  db: { schema: s as "public" }, auth: { persistSession: false } })).get(s)!;
const janela = new Map<string, number[]>();
function permitido(chave: string, max = 30, ms = 60_000): boolean {
  const agora = Date.now();
  const lista = (janela.get(chave) ?? []).filter((t) => agora - t < ms);
  if (lista.length >= max) return false;
  lista.push(agora);
  janela.set(chave, lista);
  if (janela.size > 5000) janela.clear();
  return true;
}
const voltar = (schema: Schema | null, r: ResultadoDoRetorno, conexao?: string) =>
  new Response(null, { status: 302, headers: { Location: destinoDoRetorno(SITE[schema ?? "public"], r, conexao), ...SEM_CACHE } });

Deno.serve(async (req) => {
  const inicio = performance.now();
  const prazoDoPedido = prazo(ORCAMENTO_MS.usuario);
  const url = new URL(req.url);
  const ultimo = (url.pathname.split("/").filter(Boolean).pop() || "").toLowerCase();
  const schema: Schema | null = ultimo === "public" || ultimo === "staging" ? ultimo : null;
  if (req.method !== "GET" || !schema) return voltar(schema, "invalido");
  if (!permitido(ipDoPedido(req.headers, PROXY_SEGREDO) ?? "sem-ip")) {
    return new Response("muitos pedidos", { status: 429, headers: { "Content-Type": "text/plain; charset=utf-8", ...SEM_CACHE } });
  }
  const estado = url.searchParams.get("state");
  if (!ehEstado(estado)) return voltar(schema, "invalido");
  const db = dbDe(schema);
  const ms = () => Math.round(performance.now() - inicio);
  let ref: string | null = null;                                          // a conta da conexão, quando achada (o log do catch)
  try {
    if (!(await schemaTemW2(db, schema))) return voltar(schema, "invalido");
    const hash = await sha256Hex(estado);
    // o uso único: só a 1ª volta com o state certo, dentro dos 10 min, pega a conexão (as outras: 0 linhas)
    const { data, error } = await db.from("mp_conexoes").update({ usado_em: new Date().toISOString() }).eq("estado_hash", hash)
      .is("usado_em", null).gt("expira_em", new Date().toISOString()).select("id, conta_id, verificador, redirect_uri").maybeSingle();
    if (error) throw error;
    const con = data as { id: string; conta_id: string; verificador: string; redirect_uri: string } | null;
    if (!con) {
      const { data: velho, error: ev } = await db.from("mp_conexoes").select("usado_em").eq("estado_hash", hash).maybeSingle();
      if (ev) throw ev;
      const v = velho as { usado_em: string | null } | null;
      const r: ResultadoDoRetorno = v && !v.usado_em ? "vencido" : "invalido";
      log.info({ codigo: "mp_conectar_volta", schema, resultado: r, ms: ms() });
      return voltar(schema, r);
    }
    ref = con.conta_id;
    const fim = async (r: ResultadoDoRetorno) => {
      // o "confirmar" já foi gravado pelo guardarParaConfirmar; os outros fecham a conexão aqui
      if (r !== "confirmar") {
        const { error: er } = await db.from("mp_conexoes").update({ resultado: r }).eq("id", con.id);
        if (er) log.excecao(er, { codigo: "mp_conexao_resultado_falhou", schema, ref: con.conta_id });
      }
      log.info({ codigo: "mp_conectar_volta", schema, ref: con.conta_id, resultado: r, ms: ms() });
      return voltar(schema, r, r === "confirmar" ? con.id : undefined);
    };
    if (url.searchParams.get("error")) return await fim("negado");
    const codigo = url.searchParams.get("code") ?? "";
    if (!/^[A-Za-z0-9_-]{8,300}$/.test(codigo)) return await fim("invalido");
    const chave = await chaveDoAmbiente();
    const oauth = oauthDoAmbiente(schema);                                // no staging, o client de teste se houver (plano B do I6)
    if (!chave || !oauth) {
      log.erro({ codigo: "mp_oauth_nao_configurado", schema, ref: con.conta_id });
      return await fim("falhou");
    }
    const ctx: ContextoMpConta = { schema, log, prazo: prazoDoPedido, chave, oauth };
    const verificador = await decifrar(con.verificador, dadoAssociado(schema, con.conta_id, "pkce"), chave);
    const troca = await trocarCodigo(ctx, { codigo, redirect: con.redirect_uri, verificador: pkceLigado() ? verificador : null,
      teste: schema === "staging" });
    // MENOR 14: o MP recusou (invalid_grant — o code já usado, o PKCE, o redirect) → "invalido" ("Toque em Conectar de novo"); fora → "falhou"
    if (!troca.ok) return await fim(troca.motivo === "recusado" ? "invalido" : "falhou");
    return await fim(await guardarParaConfirmar(db, ctx, con, troca.token));
  } catch (e) {
    log.excecao(e, { schema, acao: "mp_conectar_volta", ref });
    return voltar(schema, "falhou");
  }
});
