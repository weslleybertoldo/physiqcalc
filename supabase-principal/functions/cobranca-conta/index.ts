// Physiq W4 — cobranca-conta (banco principal): a cobrança da CONTA do profissional (spec §6.2, §6.5 e §6.6). Junta o
// mp-assinar do Nutri e as ações plano-* do mp-payments do Calc, no Mercado Pago da conta do Weslley (o mesmo dos 2 apps).
// Só o DONO da conta usa; conta isenta não paga. W28 (virada): as contas legadas (legado_calc / legado_nutri) passam a pagar
// aqui depois do 03_cobranca_legada.py (cobranca_legada = false), com o preço e as regras de hoje (regras_legadas — 6.3/P9):
// o valor travado vale só no plano/faixa atual; outro plano/faixa = preço da tabela, e trocar tira a conta do legado (o
// gatilho contas_sai_do_legado faz no banco). Enquanto cobranca_legada = true a conta segue recusada (telas antigas).
//
// POST, headers: Authorization: Bearer <access_token do principal> · x-schema: public|staging. Corpo: { acao, conta_id?, ... }
//   status               conta, preços, alunos, faturas, assinatura e Pix aberto (confere no MP o que ainda pode mudar)
//   pix_criar            { plano, faixa, meses } Pix de 72 h (reaproveita o aberto igual; fecha o aberto diferente)
//   pix_status           { fatura_id } confere no MP — a tela chama a cada 5 s e no "Já paguei"
//   cartao_pagar         { plano, faixa, meses, card_token, payment_method_id, issuer_id } cartão à vista (Brick)
//   assinar              { plano, faixa, card_token } cobrança mensal automática no cartão (1ª cobrança no fim do teste ou do
//                        mês pago; sem cobertura, na hora). No STAGING o MP não tem assinatura com cartão no sandbox: cria a
//                        assinatura PENDENTE (checkout do MP) com a credencial de teste. { checkout: true } sem card_token =
//                        assinatura PENDENTE com o link do checkout do Mercado Pago (init_point) para pagar lá
//   cancelar_assinatura
//   mudar_plano          { plano, faixa } conta ativa: subir vale na hora, descer só se os alunos couberem; o preço novo
//                        vale no próximo pagamento e a assinatura no cartão passa ao valor novo
//   simular_aprovacao    { fatura_id } SÓ STAGING — aprova a fatura (o Pix do sandbox não se paga)
//   simular_recorrente   SÓ STAGING — uma cobrança aprovada da assinatura (o sandbox não cobra)
// Referência externa: physiq:<schema>:conta:<conta_id>:<mensal|anual|recorrente>[:<fatura_id>]; notification_url por cobrança
// → mp-webhook-conta?schema=<schema> (a configuração global do app do MP, dos apps antigos, não muda).
// verify_jwt = true. Publicar: scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions cobranca-conta true
// Segredos: MP_ACCESS_TOKEN_PROD (produção), MP_ACCESS_TOKEN_TEST (staging), MP_TEST_PAYER_EMAIL (+ os automáticos).
// hml-10 (H-24, H-26): log em JSON pelo _shared/log.ts — do Mercado Pago, só o status e os códigos (error, cause, status_detail),
// nunca o corpo; o catch final avisa (log.excecao) e devolve o mesmo 500.
// hml-14 (H-32): um prazo por pedido (ORCAMENTO_MS.usuario) em toda ida ao MP; erro do banco lança (o catch final responde 500)
// em toda leitura que alimenta a resposta e em toda gravação que muda a cobrança; o mudar_plano lê o Pix aberto e a assinatura
// ANTES de mexer (antes, o Pix lido com erro virava "nenhum": seguia aberto com o preço antigo e, pago, voltava o plano antigo).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { criarLog } from "../_shared/log.ts";
import { emailDeTeste, origemPermitida } from "../_shared/login-regras.ts";
import {
  PIX_EXPIRA_HORAS,
  avaliarMudanca,
  codigosDoMp,
  descricaoCobranca,
  ehFaixa,
  ehPlano,
  ehUuid,
  erroDeCartao,
  hojeSP,
  inicioDaAssinatura,
  mpTransitorio,
  precoDoPlano,
  recusaDoSandbox,
  referenciaConta,
  situacaoEm,
  statusAberto,
  statusDaAssinatura,
  statusDaFatura,
  type AssinaturaMp,
  type Faixa,
  type PagamentoMp,
  type PlanoConta,
  type SituacaoConta,
} from "../_shared/cobranca-regras.ts";
import {
  COLUNAS_ASSINATURA,
  COLUNAS_FATURA,
  aplicarStatus,
  credencialDoSchema,
  espelhoAssinatura,
  mpFetch,
  registrarCobrancaRecorrente,
  tokenMp,
  type AssinaturaConta,
  type Fatura,
  type Schema,
} from "../_shared/cobranca-mp.ts";
import { ORCAMENTO_MS, prazo } from "../_shared/tempo.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SCHEMAS: Schema[] = ["public", "staging"];
const SITE: Record<Schema, string> = { public: "https://physiqcalc.com.br", staging: "https://physiqcalc-staging.vercel.app" };
const ACOES = ["status", "pix_criar", "pix_status", "cartao_pagar", "assinar", "cancelar_assinatura", "mudar_plano",
  "simular_aprovacao", "simular_recorrente"];
const log = criarLog("cobranca-conta", { avisar: avisarErro });

function cors(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origemPermitida(origin) ? origin! : "https://physiqcalc.com.br",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-schema",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });
const erro = (codigo: string, status: number, origin: string | null, extra: Record<string, unknown> = {}) =>
  json({ ok: false, erro: codigo, ...extra }, status, origin);

// limite simples por pessoa (cada instância da função): 40 chamadas por minuto — a tela confere o Pix a cada 5 s
const janela = new Map<string, number[]>();
function permitido(chave: string, max = 40, ms = 60_000): boolean {
  const agora = Date.now();
  const lista = (janela.get(chave) ?? []).filter((t) => agora - t < ms);
  if (lista.length >= max) return false;
  lista.push(agora);
  janela.set(chave, lista);
  return true;
}

interface Conta {
  id: string;
  nome: string;
  dono_id: string | null;
  origem: string;
  plano: PlanoConta;
  faixa: Faixa;
  periodicidade: string;
  situacao: SituacaoConta;
  teste_ate: string | null;
  vence_em: string | null;
  tolerancia_dias: number;
  valor_travado: number | null;
  regra_pix: string;
  cobranca_legada: boolean;
  regras_legadas: boolean;
  isenta_motivo: string | null;
}
const COLUNAS_CONTA = "id, nome, dono_id, origem, plano, faixa, periodicidade, situacao, teste_ate, vence_em, tolerancia_dias, valor_travado, regra_pix, cobranca_legada, regras_legadas, isenta_motivo";

interface Preco {
  plano: PlanoConta;
  faixa: Faixa;
  min_alunos: number;
  max_alunos: number | null;
  valor_mensal: number;
  valor_anual: number | null;
  ordem: number;
}

function voltaDoCheckout(origin: string | null, schema: Schema): string {
  const base = origin && /^https:\/\/((www\.)?physiqcalc\.com\.br|physiqcalc-staging\.vercel\.app)$/.test(origin) ? origin : SITE[schema];
  return `${base}/painel/configuracoes/plano?assinatura=ok`;
}

function precoDe(conta: Conta, precos: Preco[], plano: string, faixa: string, meses: number): number | null {
  const linha = precos.find((p) => p.plano === plano && p.faixa === faixa) ?? null;
  // W28: na conta com o preço de hoje (regras_legadas) o valor travado vale só para o plano/faixa dela — outro = a tabela
  const travadoVale = conta.valor_travado !== null && (!conta.regras_legadas || (plano === conta.plano && faixa === conta.faixa));
  return precoDoPlano({
    valorTravado: travadoVale ? Number(conta.valor_travado) : null,
    tabela: linha ? { valor_mensal: Number(linha.valor_mensal), valor_anual: linha.valor_anual === null ? null : Number(linha.valor_anual) } : null,
    meses,
  });
}

function maxAlunos(precos: Preco[], plano: string, faixa: string): number | null {
  if (faixa === "livre") return null;
  const linha = precos.find((p) => p.plano === plano && p.faixa === faixa);
  if (linha && linha.max_alunos !== null) return Number(linha.max_alunos);
  return faixa === "f10" ? 10 : faixa === "f30" ? 30 : faixa === "f100" ? 100 : null;
}

Deno.serve(async (req) => {
  const p = prazo(ORCAMENTO_MS.usuario); // hml-14 (H-32): o prazo do pedido inteiro — vai em toda ida ao MP ({ prazo: p })
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return erro("metodo", 405, origin);
  const schema = (req.headers.get("x-schema") || "public").toLowerCase() as Schema;
  if (!SCHEMAS.includes(schema)) return erro("schema_invalido", 400, origin);
  const credencial = credencialDoSchema(schema);
  if (!tokenMp(credencial)) return erro("mp_nao_configurado", 500, origin);

  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return erro("missing_auth", 401, origin);
  const token = auth.slice(7);
  const authAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: u, error: eu } = await authAdmin.auth.getUser(token);
  if (eu || !u?.user) return erro("invalid_token", 401, origin);
  const user = u.user;
  const email = String(user.email || "").trim().toLowerCase();
  if (schema === "staging" && !emailDeTeste(email)) return erro("conta_real_no_staging", 403, origin);
  if (!permitido(`${schema}:${user.id}`)) return erro("rate_limited", 429, origin);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const acao = ACOES.includes(String(body.acao)) ? String(body.acao) : "status";
  const db = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" }, auth: { persistSession: false } });
  const hoje = hojeSP();
  const notificacao = `${SUPABASE_URL}/functions/v1/mp-webhook-conta?schema=${schema}`;
  const pagador = credencial === "test" ? (Deno.env.get("MP_TEST_PAYER_EMAIL") || email) : email;

  try {
    // ---- a conta: a pedida (se a pessoa é dona) ou a conta nova de que ela é dona ----
    let contaId = ehUuid(body.conta_id) ? String(body.conta_id) : null;
    if (!contaId) {
      const { data, error } = await db.from("conta_membros").select("conta_id, contas!inner(origem, cobranca_legada, criado_em)")
        .eq("user_id", user.id).eq("status", "ativo").contains("papeis", ["dono"]).eq("contas.cobranca_legada", false)
        .neq("contas.origem", "app").limit(1);
      if (error) throw error; // hml-14: o erro virava 404 sem_conta
      contaId = ((data ?? []) as Array<{ conta_id: string }>)[0]?.conta_id ?? null;
    }
    if (!contaId) return erro("sem_conta", 404, origin);
    const { data: membro } = await db.from("conta_membros").select("id").eq("conta_id", contaId).eq("user_id", user.id)
      .eq("status", "ativo").contains("papeis", ["dono"]).maybeSingle();
    if (!membro) return erro("so_o_dono", 403, origin);
    const { data: contaRow, error: ec } = await db.from("contas").select(COLUNAS_CONTA).eq("id", contaId).maybeSingle();
    if (ec) throw ec;
    if (!contaRow) return erro("sem_conta", 404, origin);
    const conta = contaRow as Conta;
    if (conta.cobranca_legada) return erro("conta_legada", 400, origin, { origem: conta.origem });
    if (conta.origem === "app") return erro("isenta", 400, origin);

    // hml-14 (H-32): o erro de qualquer uma lança — os alunos ativos viravam 0 e liberavam pagar ou descer para uma faixa menor que
    // o número de alunos (escolha, mudar_plano). O conta_limite_alunos daqui saiu: o resultado não era usado (o status relê).
    const [{ data: precosRows, error: erroPrecos }, { data: ativos, error: erroAtivos }] = await Promise.all([
      db.from("plano_precos").select("plano, faixa, min_alunos, max_alunos, valor_mensal, valor_anual, ordem").eq("ativo", true).order("ordem"),
      db.rpc("conta_alunos_ativos", { p_conta: conta.id }),
    ]);
    if (erroPrecos) throw erroPrecos;
    if (erroAtivos) throw erroAtivos;
    const precos = (precosRows ?? []) as Preco[];
    const alunosAtivos = Number(ativos ?? 0);
    const efetiva = situacaoEm(conta, hoje);

    // hml-06 (H-20): leitura que falha não vira "não tem" — o assinar criava OUTRA assinatura e o upsert(conta_id) apagava o id da
    // atual (que seguia cobrando sem rastro). O erro sobe e o catch devolve 500 erro_interno ANTES de qualquer POST ao MP.
    const buscarAssinatura = async (): Promise<AssinaturaConta | null> => {
      const { data, error } = await db.from("conta_assinaturas").select(COLUNAS_ASSINATURA).eq("conta_id", conta.id).maybeSingle();
      if (error) throw error;
      return (data as AssinaturaConta | null) ?? null;
    };
    const buscarFatura = async (id: string): Promise<Fatura | null> => {
      const { data, error } = await db.from("conta_faturas").select(COLUNAS_FATURA).eq("id", id).eq("conta_id", conta.id).maybeSingle();
      if (error) throw error;
      return (data as Fatura | null) ?? null;
    };
    const simulado = (id: string | null | undefined) => !!id && id.startsWith("sim-");

    // confere no MP uma fatura que ainda pode mudar (webhook atrasado/perdido)
    const conferir = async (f: Fatura): Promise<Fatura> => {
      if (!f.mp_payment_id || simulado(f.mp_payment_id) || !statusAberto(f.status)) return f;
      const { status: st, body: pay } = await mpFetch<PagamentoMp>(credencial, `/v1/payments/${encodeURIComponent(f.mp_payment_id)}`, {}, { prazo: p });
      if (st !== 200 || !pay?.id) return f;
      await aplicarStatus(db, f, pay, user.id);
      return (await buscarFatura(f.id)) ?? f;
    };

    // assinatura ao vivo no MP (status, próxima cobrança) + cobranças que o aviso do webhook não trouxe
    const conferirAssinatura = async (a: AssinaturaConta | null): Promise<AssinaturaConta | null> => {
      // simulada no staging (simular_recorrente): o MP segue com a do sandbox pendente — não sobrescreve a simulação
      if (!a?.mp_preapproval_id || simulado(a.mp_preapproval_id) || a.payload?.simulada === true) return a;
      const { status: st, body: pre } = await mpFetch<AssinaturaMp>(credencial, `/preapproval/${encodeURIComponent(a.mp_preapproval_id)}`, {}, { prazo: p });
      if (st === 200 && pre?.id) {
        const esp = espelhoAssinatura(pre, { ...(a.payload ?? {}) });
        const { error: erroEspelho } = await db.from("conta_assinaturas").update(esp).eq("id", a.id);
        if (erroEspelho) throw erroEspelho;
        if (credencial === "prod" && pre.status === "authorized") {
          const busca = await mpFetch<{ results?: Array<{ payment?: { id?: number | string | null } | null }> }>(
            credencial, `/authorized_payments/search?preapproval_id=${encodeURIComponent(a.mp_preapproval_id)}&sort=date_created&criteria=desc&limit=6`,
            {}, { prazo: p });
          const ids = [...new Set(((busca.body?.results) ?? []).map((r) => r.payment?.id).filter((x) => x !== null && x !== undefined).map(String))];
          for (const pid of ids) {
            const { data: ja } = await db.from("conta_faturas").select("id, status").eq("mp_payment_id", pid).maybeSingle();
            if (ja && !statusAberto((ja as { status: string }).status)) continue;
            const { status: sp, body: pay } = await mpFetch<PagamentoMp>(credencial, `/v1/payments/${encodeURIComponent(pid)}`, {}, { prazo: p });
            if (sp === 200 && pay?.id) await registrarCobrancaRecorrente(db, a, pay, precoDe(conta, precos, a.plano ?? conta.plano, a.faixa ?? conta.faixa, 1));
          }
        }
        return await buscarAssinatura();
      }
      return a;
    };

    // hml-14 (H-32): cada leitura daqui lança no erro — antes a tela Plano ficava sem faturas, sem "Pix aberto", com 0 alunos
    // ativos ou sem o limite, sem aviso
    const montarStatus = async () => {
      const { data: contaAtual, error: erroConta } = await db.from("contas").select(COLUNAS_CONTA).eq("id", conta.id).maybeSingle();
      if (erroConta) throw erroConta;
      const c = (contaAtual as Conta | null) ?? conta;
      const { data: fats, error: erroFaturas } = await db.from("conta_faturas").select(COLUNAS_FATURA).eq("conta_id", conta.id)
        .order("criado_em", { ascending: false }).limit(24);
      if (erroFaturas) throw erroFaturas;
      const faturas = (fats ?? []) as Fatura[];
      const assinatura = await buscarAssinatura();
      const pixAberto = faturas.find((f) => f.forma === "pix" && statusAberto(f.status) && (!f.pix_expira_em || new Date(f.pix_expira_em).getTime() > Date.now())) ?? null;
      const { data: at, error: erroAtivosAgora } = await db.rpc("conta_alunos_ativos", { p_conta: conta.id });
      if (erroAtivosAgora) throw erroAtivosAgora;
      const { data: lim, error: erroLimite } = await db.rpc("conta_limite_alunos", { p_conta: conta.id });
      if (erroLimite) throw erroLimite;
      return {
        ok: true,
        ambiente: schema,
        simulacao: schema === "staging",
        hoje,
        conta: { ...c, efetiva: situacaoEm(c, hoje) },
        alunos_ativos: Number(at ?? 0),
        limite_alunos: lim === null || lim === undefined ? null : Number(lim),
        precos: precos.map((p) => ({ ...p, valor_mensal: precoDe(c, precos, p.plano, p.faixa, 1), valor_anual: precoDe(c, precos, p.plano, p.faixa, 12) })),
        valor_mensal: precoDe(c, precos, c.plano, c.faixa, 1),
        valor_anual: precoDe(c, precos, c.plano, c.faixa, 12),
        faturas: faturas.map((f) => ({ ...f, pix_qr: f.id === pixAberto?.id ? f.pix_qr : null })),
        pix_aberto: pixAberto,
        assinatura: assinatura
          ? { ...assinatura, sandbox: assinatura.payload?.sandbox === true, simulada: assinatura.payload?.simulada === true,
              init_point: (assinatura.payload?.init_point as string | null) ?? null, payload: undefined }
          : null,
      };
    };

    if (acao === "status") {
      const { data: abertas, error: erroAbertas } = await db.from("conta_faturas").select(COLUNAS_FATURA).eq("conta_id", conta.id)
        .in("status", ["pending", "in_process"]).not("mp_payment_id", "is", null).order("criado_em", { ascending: false }).limit(5);
      if (erroAbertas) throw erroAbertas; // hml-14: sem ler, a tela mostrava pendente o que já foi pago
      for (const f of (abertas ?? []) as Fatura[]) await conferir(f);
      await conferirAssinatura(await buscarAssinatura());
      return json(await montarStatus(), 200, origin);
    }

    if (acao === "pix_status") {
      const id = ehUuid(body.fatura_id) ? String(body.fatura_id) : null;
      if (!id) return erro("fatura_invalida", 400, origin);
      const f = await buscarFatura(id);
      if (!f) return erro("fatura_inexistente", 404, origin);
      const atual = await conferir(f);
      const { data: c } = await db.from("contas").select("situacao, vence_em, teste_ate").eq("id", conta.id).maybeSingle();
      return json({ ok: true, fatura: atual, conta: c }, 200, origin);
    }

    // ---- daqui pra baixo: ações que cobram ou mudam a conta ----
    if (conta.situacao === "isenta") return erro("isenta", 400, origin);
    if (conta.situacao === "suspensa" || conta.situacao === "cancelada") return erro("conta_suspensa", 400, origin);

    // plano/faixa/meses pedidos para pagar. Conta ativa paga o plano dela (trocar é "Mudar plano"); no teste ou vencida,
    // escolhe o plano ao pagar (a fatura carrega o plano e o pagamento aprovado muda a conta) — desde que os alunos caibam.
    const escolha = (): { ok: true; plano: PlanoConta; faixa: Faixa; meses: number; valor: number } | { ok: false; resp: Response } => {
      const plano = ehPlano(body.plano) ? body.plano : conta.plano;
      const faixa = ehFaixa(body.faixa) ? body.faixa : conta.faixa;
      const meses = Number(body.meses) === 12 ? 12 : 1;
      if (efetiva === "ativa" && (plano !== conta.plano || faixa !== conta.faixa)) return { ok: false, resp: erro("use_mudar_plano", 400, origin) };
      const max = maxAlunos(precos, plano, faixa);
      if (max !== null && alunosAtivos > max) return { ok: false, resp: erro("alunos_acima_do_limite", 400, origin, { limite: max, alunos: alunosAtivos }) };
      const valor = precoDe(conta, precos, plano, faixa, meses);
      if (valor === null || !(valor > 0)) return { ok: false, resp: erro("plano_invalido", 400, origin) };
      return { ok: true, plano, faixa, meses, valor };
    };

    if (acao === "pix_criar" || acao === "cartao_pagar") {
      const e = escolha();
      if (!e.ok) return e.resp;
      // cobrança automática ligada (de verdade, ou a simulada do staging): nada de pagar em dobro por Pix/cartão avulso
      const assinatura = await buscarAssinatura();
      if (assinatura?.status === "authorized") return erro("cartao_ativo", 400, origin);
      const descricao = descricaoCobranca(e.plano, e.faixa, e.meses);
      const tipoFatura = e.meses === 12 ? "anual" : acao === "pix_criar" ? "pix_avulso" : "mensal";
      const tipoRef = e.meses === 12 ? "anual" : "mensal";

      if (acao === "pix_criar") {
        // Pix aberto igual e com mais de 30 min de validade → reaproveita; aberto diferente → fecha (não fica "pendente" pra sempre)
        const { data: abertos, error } = await db.from("conta_faturas").select(COLUNAS_FATURA).eq("conta_id", conta.id)
          .eq("forma", "pix").in("status", ["pending", "in_process"]).order("criado_em", { ascending: false });
        if (error) throw error; // hml-06: sem ler o Pix aberto não se cria outro
        for (const aberto of (abertos ?? []) as Fatura[]) {
          const atual = await conferir(aberto);
          if (atual.status === "approved") return json({ ok: true, fatura: atual, aprovada: true }, 200, origin);
          const valida = atual.pix_expira_em ? new Date(atual.pix_expira_em).getTime() > Date.now() + 30 * 60_000 : false;
          const igual = Number(atual.valor) === e.valor && atual.plano === e.plano && atual.faixa === e.faixa && (atual.meses ?? 1) === e.meses;
          if (statusAberto(atual.status) && valida && igual && atual.pix_copia_cola) {
            return json({ ok: true, fatura: atual, reutilizada: true }, 200, origin);
          }
          if (statusAberto(atual.status)) {
            if (atual.mp_payment_id && !simulado(atual.mp_payment_id)) {
              await mpFetch(credencial, `/v1/payments/${encodeURIComponent(atual.mp_payment_id)}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) }, { prazo: p });
            }
            const { error: erroFechar } = await db.from("conta_faturas").update({ status: "cancelled" }).eq("id", atual.id);
            if (erroFechar) throw erroFechar;
          }
        }
      }

      const expira = new Date(Date.now() + PIX_EXPIRA_HORAS * 3_600_000);
      const { data: nova, error: ef } = await db.from("conta_faturas").insert({
        conta_id: conta.id, tipo: tipoFatura, valor: e.valor, status: "pending", forma: acao === "pix_criar" ? "pix" : "cartao",
        plano: e.plano, faixa: e.faixa, meses: e.meses, descricao, registrado_por: user.id, origem: "cobranca-conta",
        pix_expira_em: acao === "pix_criar" ? expira.toISOString() : null,
      }).select(COLUNAS_FATURA).single();
      if (ef) throw ef;
      const fatura = nova as Fatura;
      const referencia = referenciaConta(schema, conta.id, tipoRef, fatura.id);
      // hml-14 (H-32): a fatura que não foi ao MP sai; o erro lança (antes ficava "pendente" sem código — o Pix vazio aparecia aberto)
      const apagarFatura = async () => {
        const { error: erroApagar } = await db.from("conta_faturas").delete().eq("id", fatura.id);
        if (erroApagar) throw erroApagar;
      };

      if (acao === "pix_criar") {
        const { status: st, body: pay } = await mpFetch<PagamentoMp>(credencial, "/v1/payments", {
          method: "POST",
          body: JSON.stringify({
            transaction_amount: e.valor, description: descricao, payment_method_id: "pix", payer: { email: pagador },
            external_reference: referencia, notification_url: notificacao, date_of_expiration: expira.toISOString().replace("Z", "-00:00"),
          }),
        }, { prazo: p });
        const td = pay?.point_of_interaction?.transaction_data;
        if (st >= 300 || !pay?.id || !td?.qr_code) {
          log.erro({ codigo: "mp_pix_falhou", schema, acao, ref: fatura.id, status: st, externo: codigosDoMp(pay) });
          // SÓ STAGING: o sandbox do MP cai com 500 de vez em quando → Pix simulado (sem QR real) pra manter o fluxo de teste
          if (schema === "staging" && st >= 500) {
            const { data: sim, error: erroSim } = await db.from("conta_faturas").update({
              mp_payment_id: `sim-${crypto.randomUUID()}`, pix_copia_cola: "SIMULADO-SANDBOX-MP-INDISPONIVEL",
            }).eq("id", fatura.id).select(COLUNAS_FATURA).single();
            if (erroSim) throw erroSim; // hml-14: antes respondia ok com fatura: null
            return json({ ok: true, fatura: sim, simulado: true }, 200, origin);
          }
          await apagarFatura();
          return erro("pix_indisponivel", 502, origin, { status_mp: st });
        }
        const { data: salva, error: es } = await db.from("conta_faturas").update({
          mp_payment_id: String(pay.id), status: statusDaFatura(pay), pix_qr: td.qr_code_base64 ?? null, pix_copia_cola: td.qr_code,
          pix_expira_em: pay.date_of_expiration ?? expira.toISOString(),
        }).eq("id", fatura.id).select(COLUNAS_FATURA).single();
        if (es) throw es;
        return json({ ok: true, fatura: salva, reutilizada: false }, 200, origin);
      }

      // cartão à vista (Card Payment Brick: o número do cartão nunca passa por aqui)
      const cardToken = typeof body.card_token === "string" ? body.card_token : "";
      if (!cardToken) {
        await apagarFatura();
        return erro("missing_card_token", 400, origin);
      }
      const pedido: Record<string, unknown> = {
        transaction_amount: e.valor, token: cardToken, description: descricao, installments: 1, payer: { email: pagador },
        external_reference: referencia, notification_url: notificacao,
      };
      if (typeof body.payment_method_id === "string" && body.payment_method_id) pedido.payment_method_id = body.payment_method_id;
      if (body.issuer_id !== undefined && body.issuer_id !== null && body.issuer_id !== "") pedido.issuer_id = body.issuer_id;
      const { status: st, body: pay } = await mpFetch<PagamentoMp>(credencial, "/v1/payments", { method: "POST", body: JSON.stringify(pedido) }, { prazo: p });
      if (st >= 300 || !pay?.id) {
        log.erro({ codigo: "mp_cartao_falhou", schema, acao, ref: fatura.id, status: st, externo: codigosDoMp(pay) });
        await apagarFatura();
        return erro(erroDeCartao(st, pay) ? "cartao_recusado" : "mp_error", erroDeCartao(st, pay) ? 400 : 502, origin,
          { detalhe: String((pay as { message?: unknown } | null)?.message ?? "").slice(0, 200) });
      }
      // o webhook pode ter chegado antes e já gravado o id: segue com a mesma fatura (o id é único). hml-14: o cartão JÁ foi
      // cobrado — o erro daqui não vira 500 (a pessoa pagaria 2×): registra e avisa; o aviso do MP acha a fatura pela referência
      const { error: erroId } = await db.from("conta_faturas").update({ mp_payment_id: String(pay.id) }).eq("id", fatura.id).is("mp_payment_id", null);
      if (erroId) log.excecao(erroId, { codigo: "gravacao_depois_da_cobranca", schema, acao, ref: fatura.id });
      // o cartão JÁ foi cobrado: erro de leitura aqui não pode virar 500 (a pessoa clicaria de novo e pagaria 2×) — usa o que tem
      const lerDepois = (id: string) =>
        buscarFatura(id).catch((e) => (log.excecao(e, { codigo: "leitura_depois_da_cobranca", schema, acao, ref: id }), null));
      const f2 = (await lerDepois(fatura.id)) ?? fatura;
      const r = await aplicarStatus(db, f2, pay, user.id);
      return json({ ok: true, fatura: (await lerDepois(fatura.id)) ?? f2, status: r.status, aplicou: r.aplicou, status_detail: pay.status_detail ?? null }, 200, origin);
    }

    if (acao === "assinar") {
      const e = escolha();
      if (!e.ok) return e.resp;
      if (e.meses !== 1) return erro("anual_sem_assinatura", 400, origin);
      const cardToken = typeof body.card_token === "string" ? body.card_token : "";
      // checkout: sem cartão aqui, a assinatura nasce PENDENTE e a pessoa paga no checkout do Mercado Pago (init_point)
      const checkout = body.checkout === true;
      if (!cardToken && !checkout) return erro("missing_card_token", 400, origin);
      const atual = await buscarAssinatura();
      if (atual?.mp_preapproval_id && ["authorized", "pending", "paused"].includes(atual.status)) {
        if (!simulado(atual.mp_preapproval_id)) {
          const { status: sa, body: pre } = await mpFetch<AssinaturaMp>(credencial, `/preapproval/${encodeURIComponent(atual.mp_preapproval_id)}`, {}, { prazo: p });
          if (sa === 200 && pre?.status === "authorized" && atual.payload?.sandbox !== true) {
            const { error: erroEspelho } = await db.from("conta_assinaturas").update(espelhoAssinatura(pre, { ...(atual.payload ?? {}) })).eq("id", atual.id);
            if (erroEspelho) throw erroEspelho;
            return erro("assinatura_ja_ativa", 400, origin);
          }
          // a que sobrou (pendente, pausada, do checkout do sandbox): cancela pra não ficarem 2 no MP
          if (sa === 200 && pre?.status !== "cancelled") {
            await mpFetch(credencial, `/preapproval/${encodeURIComponent(atual.mp_preapproval_id)}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) }, { prazo: p });
          }
        }
      }
      const inicio = inicioDaAssinatura(conta, hoje);
      const referencia = referenciaConta(schema, conta.id, "recorrente");
      const motivo = `Physiq — ${descricaoCobranca(e.plano, e.faixa, 1).replace(/^Physiq — /, "").replace(/ — 1 mês$/, "")}`;
      const recorrencia = { frequency: 1, frequency_type: "months", transaction_amount: e.valor, currency_id: "BRL", ...(inicio ? { start_date: inicio } : {}) };
      const pendente = () => mpFetch<AssinaturaMp>(credencial, "/preapproval", {
        method: "POST",
        body: JSON.stringify({
          reason: motivo, external_reference: referencia, payer_email: pagador, auto_recurring: recorrencia,
          back_url: voltaDoCheckout(origin, schema), notification_url: notificacao, status: "pending",
        }),
      }, { prazo: p });
      let { status: st, body: pre } = checkout ? await pendente() : await mpFetch<AssinaturaMp>(credencial, "/preapproval", {
        method: "POST",
        body: JSON.stringify({
          reason: motivo, external_reference: referencia, payer_email: pagador, card_token_id: cardToken,
          auto_recurring: recorrencia, back_url: voltaDoCheckout(origin, schema), notification_url: notificacao, status: "authorized",
        }),
      }, { prazo: p });
      let sandbox = false;
      if (!checkout && (st >= 300 || !pre?.id) && credencial === "test" && recusaDoSandbox(st, pre)) {
        // STAGING: o MP não tem assinatura com cartão no sandbox → a assinatura nasce PENDENTE (checkout hospedado do MP),
        // criada de verdade com a credencial de teste; a cobrança de verdade é provada em produção
        sandbox = true;
        ({ status: st, body: pre } = await pendente());
      }
      if (st >= 300 || !pre?.id) {
        log.erro({ codigo: "mp_assinatura_falhou", schema, acao, ref: conta.id, status: st, externo: codigosDoMp(pre) });
        if (erroDeCartao(st, pre)) return erro("cartao_recusado", 400, origin, { detalhe: String((pre as { message?: unknown } | null)?.message ?? "").slice(0, 200) });
        return erro("mp_error", 502, origin, { status_mp: st });
      }
      const linha = {
        conta_id: conta.id, plano: e.plano, faixa: e.faixa, valor: e.valor,
        ...espelhoAssinatura(pre, { sandbox, checkout, criada_por: user.id, inicio }),
      };
      const { data: salva, error: es } = await db.from("conta_assinaturas").upsert(linha, { onConflict: "conta_id" }).select(COLUNAS_ASSINATURA).single();
      if (es) throw es;
      const { error: erroEvento } = await db.from("conta_eventos").insert({ conta_id: conta.id, tipo: "plano", depois: { assinatura: statusDaAssinatura(pre), plano: e.plano, faixa: e.faixa, valor: e.valor, inicio, sandbox }, por: user.id });
      if (erroEvento) throw erroEvento;
      return json({ ok: true, assinatura: salva, primeira_cobranca: inicio, sandbox, init_point: sandbox || checkout ? pre.init_point ?? null : null }, 200, origin);
    }

    if (acao === "cancelar_assinatura") {
      const a = await buscarAssinatura();
      if (!a?.mp_preapproval_id || !["authorized", "pending", "paused"].includes(a.status)) return erro("sem_assinatura", 400, origin);
      if (!simulado(a.mp_preapproval_id)) {
        const { status: sc, body: pre } = await mpFetch<AssinaturaMp>(credencial, `/preapproval/${encodeURIComponent(a.mp_preapproval_id)}`, {
          method: "PUT", body: JSON.stringify({ status: "cancelled" }),
        }, { prazo: p });
        if (sc >= 300 || !pre?.id) return erro("mp_error", 502, origin, { status_mp: sc });
        const { error: erroCancelada } = await db.from("conta_assinaturas").update(espelhoAssinatura(pre, { ...(a.payload ?? {}), cancelada_por: user.id })).eq("id", a.id);
        if (erroCancelada) throw erroCancelada;
      } else {
        const { error: erroCancelada } = await db.from("conta_assinaturas").update({ status: "cancelled" }).eq("id", a.id);
        if (erroCancelada) throw erroCancelada;
      }
      const { error: erroEvento } = await db.from("conta_eventos").insert({ conta_id: conta.id, tipo: "plano", antes: { assinatura: a.status }, depois: { assinatura: "cancelled" }, por: user.id });
      if (erroEvento) throw erroEvento;
      return json(await montarStatus(), 200, origin);
    }

    if (acao === "mudar_plano") {
      if (efetiva !== "ativa") return erro("escolha_ao_pagar", 400, origin);
      const plano = String(body.plano ?? "");
      const faixa = String(body.faixa ?? "");
      const max = ehPlano(plano) && ehFaixa(faixa) ? maxAlunos(precos, plano, faixa) : null;
      const valorNovo = ehPlano(plano) && ehFaixa(faixa) ? precoDe(conta, precos, plano, faixa, 1) : null;
      const r = avaliarMudanca({ atual: conta, novo: { plano, faixa }, alunosAtivos, maxNovo: max, temPreco: valorNovo !== null });
      if (!r.ok) return erro(r.erro, 400, origin, r.erro === "alunos_acima_do_limite" ? { limite: max, alunos: alunosAtivos } : {});
      // hml-14 (H-32): LÊ TUDO ANTES de mexer — o Pix aberto com o preço antigo e a assinatura. A leitura que falha lança aqui e
      // nada muda (nem no banco, nem no MP); antes o Pix lido com erro virava "nenhum", seguia aberto e, se pago,
      // aplicar_pagamento_conta voltava a conta ao plano/faixa dele. Depois, cada gravação confere o erro.
      const { data: abertos, error: erroAbertos } = await db.from("conta_faturas").select(COLUNAS_FATURA).eq("conta_id", conta.id).eq("forma", "pix").in("status", ["pending", "in_process"]);
      if (erroAbertos) throw erroAbertos;
      const a = await buscarAssinatura();
      // Pix aberto com o preço antigo: fecha ANTES de trocar o plano — o que falhar aqui (o banco lança; o MP sem resposta que
      // decida — fora do ar, limite, prazo do pedido esgotado — volta o mp_error de sempre) para com o plano ainda o de antes
      // (fechar um Pix do preço antigo não estraga nada); antes o Pix seguia aberto no MP, "cancelled" no banco e o plano trocado
      for (const f of (abertos ?? []) as Fatura[]) {
        if (f.mp_payment_id && !simulado(f.mp_payment_id)) {
          const { status: sf } = await mpFetch(credencial, `/v1/payments/${encodeURIComponent(f.mp_payment_id)}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) }, { prazo: p });
          if (mpTransitorio(sf)) {
            log.aviso({ codigo: "pix_antigo_sem_resposta_do_mp", schema, acao, ref: f.id, status: sf });
            return erro("mp_error", 502, origin, { status_mp: sf });
          }
        }
        const { error: erroFechar } = await db.from("conta_faturas").update({ status: "cancelled" }).eq("id", f.id);
        if (erroFechar) throw erroFechar;
      }
      const { error: eu2 } = await db.from("contas").update({ plano, faixa }).eq("id", conta.id);
      if (eu2) throw eu2;
      // assinatura no cartão acompanha o valor novo
      let assinaturaAtualizada: boolean | null = null;
      if (a?.mp_preapproval_id && ["authorized", "pending", "paused"].includes(a.status)) {
        if (!simulado(a.mp_preapproval_id)) {
          const { status: sp } = await mpFetch(credencial, `/preapproval/${encodeURIComponent(a.mp_preapproval_id)}`, {
            method: "PUT", body: JSON.stringify({ auto_recurring: { transaction_amount: valorNovo } }),
          }, { prazo: p });
          assinaturaAtualizada = sp < 300;
        } else {
          assinaturaAtualizada = true;
        }
        if (assinaturaAtualizada) {
          const { error: erroValor } = await db.from("conta_assinaturas").update({ valor: valorNovo, plano, faixa }).eq("id", a.id);
          if (erroValor) throw erroValor;
        }
      }
      // o evento da linha do tempo vai depois dos efeitos: o erro dele (500) não deixa nada pela metade
      const { error: erroEvento } = await db.from("conta_eventos").insert({ conta_id: conta.id, tipo: "plano", antes: { plano: conta.plano, faixa: conta.faixa },
        depois: { plano, faixa, valor_mensal: valorNovo, por: "dono" }, por: user.id });
      if (erroEvento) throw erroEvento;
      // melhor esforço: só acorda a fila do espelho (a pendência fica em espelho_pendencias e vai na próxima rodada)
      const { error: erroEspelho } = await db.rpc("espelho_disparar");
      if (erroEspelho) log.excecao(erroEspelho, { codigo: "espelho_disparar_falhou", schema, acao, ref: conta.id });
      return json({ ...(await montarStatus()), assinatura_atualizada: assinaturaAtualizada }, 200, origin);
    }

    if (acao === "simular_aprovacao") {
      if (schema !== "staging") return erro("so_staging", 403, origin);
      const id = ehUuid(body.fatura_id) ? String(body.fatura_id) : null;
      const f = id ? await buscarFatura(id) : null;
      if (!f) return erro("fatura_inexistente", 404, origin);
      if (f.mp_payment_id && !simulado(f.mp_payment_id) && statusAberto(f.status)) {
        // o Pix do sandbox fica aberto no MP até vencer: fecha, pra não sobrar nada pendente
        await mpFetch(credencial, `/v1/payments/${encodeURIComponent(f.mp_payment_id)}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) }, { prazo: p });
      }
      const { data: ap, error: ea } = await db.rpc("aplicar_pagamento_conta", { p_fatura: f.id, p_pago_em: new Date().toISOString() });
      if (ea) throw ea;
      return json({ ok: true, simulado: true, resultado: ap, fatura: await buscarFatura(f.id) }, 200, origin);
    }

    if (acao === "simular_recorrente") {
      if (schema !== "staging") return erro("so_staging", 403, origin);
      const a = await buscarAssinatura();
      if (!a || a.status === "cancelled") return erro("sem_assinatura", 400, origin);
      // o sandbox não autoriza nem cobra a assinatura: simula as duas coisas (a assinatura de verdade do MP segue pendente)
      const { error: erroSimulada } = await db.from("conta_assinaturas").update({ status: "authorized", payload: { ...(a.payload ?? {}), simulada: true } }).eq("id", a.id);
      if (erroSimulada) throw erroSimulada;
      const r = await registrarCobrancaRecorrente(db, { ...a, status: "authorized" }, {
        id: `sim-rec-${crypto.randomUUID()}`, status: "approved", transaction_amount: Number(a.valor ?? 0),
        date_approved: new Date().toISOString(), metadata: { preapproval_id: a.mp_preapproval_id },
      }, precoDe(conta, precos, a.plano ?? conta.plano, a.faixa ?? conta.faixa, 1));
      return json({ ...(await montarStatus()), simulado: true, resultado: r }, 200, origin);
    }

    return erro("acao_invalida", 400, origin);
  } catch (e) {
    log.excecao(e, { acao, schema });
    return erro("erro_interno", 500, origin);
  }
});

