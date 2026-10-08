// Physiq W2: cópia do physiqnutri (main ca9f66f). A partir daqui as funções do banco principal são publicadas a partir do
// physiqcalc (scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions <slug> <verify_jwt>).
// PhysiqNutri — W46: a porta do AGENTE que roda no celular de casa (Moto G7, Termux + biblioteca Baileys).
// Decisão dele (20/09/2026): "fechamos assim, camera fora do G7" — o WhatsApp fica no celular, a câmera vai pra outro aparelho.
// O celular só faz conexão de SAÍDA: chama esta função a cada poucos segundos, pega o que fazer e devolve o resultado.
// Não há porta aberta nem túnel em casa.
//
// Auth = header x-agente-token comparado com o secret WHATSAPP_AGENTE_TOKEN (verify_jwt=false; o celular não tem JWT de
// usuário e NUNCA recebe a service_role). Schema pelo header x-schema. Ações (body.acao):
//   "tarefas"   o que fazer agora: instâncias a conectar (pedido recente), a derrubar, e a fila de mensagens vencidas
//   "qr"        publica o QR (dataURL) de uma instância — a tela do profissional está fazendo polling esperando isto
//   "conectado" a sessão abriu: grava o número confirmado e zera o QR
//   "caiu"      a sessão caiu/deu erro: status 'desconectado' ou 'erro' com o motivo
//   "ping"      batida de vida (a tela avisa quando o celular está fora do ar)
//   "resultado" marca uma mensagem da fila como enviada ou falhou
// Physiq hml-06 (H-20): a fila sai por reserva com troca condicional (_shared/whatsapp-fila.ts) — tentativas soma a cada saída
// e 2 'tarefas' juntas não pegam a mesma mensagem (antes: tentativas fixo em 1 e o paciente podia receber repetido para sempre).
// Physiq hml-10 (H-26, H-48): o erro inesperado vai para o log (_shared/log.ts: nome, código do Postgres e a mensagem limpa) e
// avisa; a resposta ao celular leva só o código (antes o texto cru do erro ia junto e parava no log do agente).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { criarLog } from "../_shared/log.ts";
import { COLUNAS_FILA, reservarFila, type MensagemFila } from "../_shared/whatsapp-fila.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AGENTE_TOKEN = Deno.env.get("WHATSAPP_AGENTE_TOKEN") || "";
const SCHEMAS = ["public", "staging"];
// pedido de conexão só vale por 5 min (senão o celular ficaria reabrindo sessão de um pedido antigo)
const PEDIDO_VALIDO_MIN = 5;
const MAX_TENTATIVAS = 3;
const LIMITE_FILA = 20;
const log = criarLog("whatsapp-agente", { avisar: avisarErro });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const erro = (codigo: string, status: number) => json({ error: codigo }, status);

/** comparação em tempo constante — o token vive em secret e não deve vazar por timing */
function tokenConfere(recebido: string): boolean {
  if (!AGENTE_TOKEN || AGENTE_TOKEN.length < 20) return false;
  if (recebido.length !== AGENTE_TOKEN.length) return false;
  let diff = 0;
  for (let i = 0; i < recebido.length; i++) diff |= recebido.charCodeAt(i) ^ AGENTE_TOKEN.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  if (req.method !== "POST") return erro("metodo", 405);
  if (!tokenConfere(req.headers.get("x-agente-token") || "")) return erro("token_invalido", 401);
  const schema = (req.headers.get("x-schema") || "public").toLowerCase();
  if (!SCHEMAS.includes(schema)) return erro("schema_invalido", 400);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }
  const acao = String(body?.acao ?? "tarefas");
  const db = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" } });
  const agora = new Date();

  try {
    if (acao === "tarefas") {
      const desde = new Date(agora.getTime() - PEDIDO_VALIDO_MIN * 60 * 1000).toISOString();
      const { data: instancias, error: ei } = await db.from("whatsapp_instancias")
        .select("id, nutricionista_id, status, numero_e164, pedido_em, conectado_em").limit(200);
      if (ei) throw ei;
      const linhas = (instancias ?? []) as Record<string, unknown>[];
      const conectar = linhas.filter((l) => l.status === "aguardando_qr" && typeof l.pedido_em === "string" && l.pedido_em >= desde);
      // pedido velho sem ninguém para ler: volta pra desconectado, a tela para de girar
      const expirados = linhas.filter((l) => l.status === "aguardando_qr" && (typeof l.pedido_em !== "string" || l.pedido_em < desde));
      for (const l of expirados) {
        await db.from("whatsapp_instancias").update({ status: "desconectado", qr_code: null, erro: "pedido expirou" })
          .eq("id", l.id as string);
      }
      const manter = linhas.filter((l) => l.status === "conectado").map((l) => l.nutricionista_id);
      const derrubar = linhas.filter((l) => l.status === "desconectado").map((l) => l.nutricionista_id);

      // fila: só de quem está conectado, vencida, ainda com tentativa sobrando
      let fila: MensagemFila[] = [];
      if (manter.length) {
        const { data: msgs, error: em } = await db.from("mensagens_whatsapp")
          .select(COLUNAS_FILA)
          .eq("status", "pendente").in("nutricionista_id", manter as string[])
          .lte("agendada_para", agora.toISOString()).lt("tentativas", MAX_TENTATIVAS)
          .order("agendada_para", { ascending: true }).limit(LIMITE_FILA);
        if (em) throw em;
        // marca 'enviando' já, com tentativas + 1, e só leva o que ESTA chamada reservou — se o celular morrer no meio, a W47
        // devolve pra pendente pelo cron (na 3ª saída sem resultado, vira 'falhou')
        fila = await reservarFila(db, (msgs ?? []) as MensagemFila[]);
      }
      return json({ conectar, manter, derrubar, fila, agora: agora.toISOString() });
    }

    const instanciaId = typeof body.instancia_id === "string" ? body.instancia_id : "";
    const nutriId = typeof body.nutricionista_id === "string" ? body.nutricionista_id : "";
    const alvo = () => {
      const q = db.from("whatsapp_instancias").update(campos);
      return instanciaId ? q.eq("id", instanciaId) : q.eq("nutricionista_id", nutriId);
    };
    let campos: Record<string, unknown> = {};

    if (acao === "qr") {
      const qr = typeof body.qr_code === "string" ? body.qr_code : "";
      if (!qr.startsWith("data:image/")) return erro("qr_invalido", 400);
      if (qr.length > 200_000) return erro("qr_grande", 400);
      campos = { qr_code: qr, qr_atualizado_em: agora.toISOString(), status: "aguardando_qr", ultimo_ping: agora.toISOString(), erro: null };
    } else if (acao === "conectado") {
      // o celular manda só dígitos (5548999998888); guardamos em E.164 com "+", o formato do resto do app
      const digitos = typeof body.numero_conectado === "string" ? body.numero_conectado.replace(/\D/g, "") : "";
      const numero = digitos.length >= 10 ? `+${digitos}` : "";
      campos = {
        status: "conectado", numero_conectado: numero || null, conectado_em: agora.toISOString(),
        qr_code: null, qr_atualizado_em: null, pedido_em: null, erro: null, ultimo_ping: agora.toISOString(),
      };
    } else if (acao === "caiu") {
      const motivo = typeof body.erro === "string" ? body.erro.slice(0, 300) : null;
      campos = {
        status: body.definitivo === true ? "erro" : "desconectado", erro: motivo,
        qr_code: null, qr_atualizado_em: null, conectado_em: null, numero_conectado: null, ultimo_ping: agora.toISOString(),
      };
    } else if (acao === "ping") {
      campos = { ultimo_ping: agora.toISOString() };
      if (!instanciaId && !nutriId) {
        // ping geral: o celular está vivo, mesmo sem instância conectada
        await db.from("whatsapp_instancias").update(campos).neq("status", "xxx");
        return json({ ok: true, agora: agora.toISOString() });
      }
    } else if (acao === "resultado") {
      const id = typeof body.mensagem_id === "string" ? body.mensagem_id : "";
      if (!id) return erro("sem_mensagem", 400);
      const ok = body.ok === true;
      const { data: salvo, error: er } = await db.from("mensagens_whatsapp").update({
        status: ok ? "enviada" : "falhou",
        enviada_em: ok ? agora.toISOString() : null,
        erro: ok ? null : (typeof body.erro === "string" ? body.erro.slice(0, 300) : "falhou"),
      }).eq("id", id).select("id, status").single();
      if (er) throw er;
      return json({ mensagem: salvo });
    } else {
      return erro("acao_invalida", 400);
    }

    if (!instanciaId && !nutriId) return erro("sem_instancia", 400);
    const { data: salvo, error: es } = await alvo().select("id, status, numero_conectado").single();
    if (es) throw es;
    return json({ instancia: salvo });
  } catch (e) {
    log.excecao(e, { acao, schema });
    return erro("erro_interno", 500);
  }
});
