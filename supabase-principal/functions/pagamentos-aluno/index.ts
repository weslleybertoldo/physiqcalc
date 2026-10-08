// Physiq W6 — pagamentos-aluno (banco principal): a cobrança aluno → profissional unificada (spec §4.3 Perfil › Pagamentos,
// §4.5 aba Financeiro, §4.6 Recebimento, §6.6, §9; C23, C29, C40, C46–C47, C97–C101, N-45, N-54, N-76, R15, R16). Junta o que
// eram as ações de aluno e de staff do mp-payments do Calc (Banco do Treino) e as cobranças do Nutri, agora no banco principal.
//
// POST, headers: Authorization: Bearer <access_token do principal> · x-schema: public|staging. Corpo: { acao, ... }
//  ALUNO (a própria matrícula — pacientes.user_id = quem chama):
//   aluno_status                     mensalidade, chave Pix ativa, assinatura, cobranças e recibos (confere no MP o que ainda muda)
//   aluno_upload      { paciente_id, tipo }                 URL assinada para subir o comprovante (o servidor escolhe o caminho)
//   aluno_avisar_pix  { paciente_id, comprovante_path, cobranca_id? }   "Já paguei": Pix na chave da conta com comprovante
//   aluno_comprovante { cobranca_id }                       URL assinada (5 min) do comprovante anexado
//   aluno_mp_pix      { paciente_id, cobranca_id? }         Pix do Mercado Pago (contas liberadas pelo master — C99)
//   aluno_mp_cartao   { paciente_id, cobranca_id?, card_token, payment_method_id, issuer_id }
//   aluno_mp_assinar  { paciente_id, card_token }            cobrança automática mensal no cartão
//   aluno_mp_cancelar { paciente_id }                        cancela a própria assinatura
//   aluno_mp_conferir { cobranca_id }                        a tela confere o Pix do MP a cada 5 s e no "Já paguei"
//   aluno_app_plano   { paciente_id, plano }                 W7b — aluno sem profissional troca o plano do app (Treino ·
//                                                            Treino + Alimentação): vale a partir do próximo pagamento e a
//                                                            cobrança automática no cartão passa para o valor novo
//   detalhe_mp        { cobranca_id }                        dados reais da transação no MP (comprovante em PDF) — aluno ou profissional
//   simular_aprovacao { cobranca_id }                        SÓ STAGING (o Pix do sandbox não se paga)
//  PROFISSIONAL (dono da conta, responsável pelo aluno ou master — quem vê o quê: spec 4.1 e P6):
//   prof_resumo       { conta_id }                          alunos da conta com mensalidade e selos + comprovantes aguardando
//   prof_aluno        { aluno }                             o Financeiro de um aluno (aluno = id da matrícula ou do Treino)
//   prof_definir      { aluno, plano_aluno_id?, plano_novo?, valor }   plano e valor (valor vazio = sem mensalidade)
//   prof_pausar       { aluno, pausar }                     "não cobrar pelo app" / reativar
//   prof_confirmar    { cobranca_id, lancar? }              confirma o Pix com comprovante (lancar = entrada no financeiro)
//   prof_recusar      { cobranca_id, motivo }               recusa (o aluno vê o motivo)
//   prof_registrar    { aluno, data, metodo, valor?, cobranca_id?, lancar? }   pagamento feito por fora (dinheiro etc.)
//   prof_remover      { cobranca_id }                       remove um pagamento por fora da mensalidade (a cobertura recua)
//   prof_cobranca_criar   { aluno, descricao, valor, vencimento }   cobrança avulsa (a do Nutri)
//   prof_cobranca_cancelar { cobranca_id }
//   prof_reembolsar   { cobranca_id }                       estorno total no Mercado Pago
//   prof_cancelar_assinatura { aluno }
//   prof_comprovante  { cobranca_id }                       URL assinada (5 min)
// Referência externa: physiq:<schema>:aluno:<paciente_id>:<mensalidade|avulsa|recorrente>[:<cobranca_id>]; notification_url por
// cobrança → mp-webhook-aluno?schema=<schema> (a configuração global do app do MP, dos apps antigos, não muda).
// verify_jwt = true. Publicar: scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions pagamentos-aluno true
// Segredos: MP_ACCESS_TOKEN_PROD (produção), MP_ACCESS_TOKEN_TEST (staging), MP_TEST_PAYER_EMAIL (+ os automáticos).
// hml-10 (H-24, H-26): log em JSON pelo _shared/log.ts — do Mercado Pago, só o status e os códigos (error, cause, status_detail),
// nunca o corpo; o título do aviso do sino (nome, valor) não vai para o log; o catch final avisa (log.excecao) e devolve o
// mesmo 500.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { criarLog } from "../_shared/log.ts";
import { emailDeTeste, origemPermitida } from "../_shared/login-regras.ts";
import { codigosDoMp, erroDeCartao, hojeSP, recusaDoSandbox, type AssinaturaMp, type PagamentoMp } from "../_shared/cobranca-regras.ts";
import { credencialDoSchema, mpFetch, tokenMp } from "../_shared/cobranca-mp.ts";
import {
  COMPROVANTE_MAX_BYTES,
  bucketComprovantes,
  caminhoComprovante,
  coberto,
  comprovanteDaMatricula,
  descricaoMensalidade,
  diaSP,
  ehMetodoPorFora,
  ehUuidFin,
  extensaoComprovante,
  mesRefDe,
  mpEmAberto,
  podeMexerNaCobranca,
  podeMexerNaMensalidade,
  podeVerCobranca,
  referenciaAluno,
  textoCurto,
  valorValido,
  vencimentoAPagar,
  type PapelNaMatricula,
  type Schema,
} from "../_shared/financeiro-regras.ts";
import {
  COLUNAS_COBRANCA,
  aplicarPagamentoMp,
  avisar,
  carregarMatricula,
  ehDoApp,
  espelhoAssinaturaAluno,
  linkDoAlunoNoPainel,
  recebedor,
  type Cobranca,
  type Matricula,
} from "../_shared/financeiro-mp.ts";
import { cancelarAssinaturasDoAppEncerrado } from "../_shared/app-sem-profissional.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SCHEMAS: Schema[] = ["public", "staging"];
const SITE: Record<Schema, string> = { public: "https://physiqcalc.com.br", staging: "https://physiqcalc-staging.vercel.app" };
const PIX_HORAS = 72;
// W7b: dentro da janela do aviso (7 dias antes do fim da cobertura — o teste grátis do app inclusive) dá para pagar adiantado
// pelo Mercado Pago; a cobertura nova começa no fim da atual (a régua do Calc)
const JANELA_ADIANTAR_MS = 7 * 86_400_000;
const log = criarLog("pagamentos-aluno", { avisar: avisarErro });

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

// limite simples por pessoa (cada instância): 60 chamadas por minuto — a tela confere o Pix do MP a cada 5 s
const janela = new Map<string, number[]>();
function permitido(chave: string, max = 60, ms = 60_000): boolean {
  const agora = Date.now();
  const lista = (janela.get(chave) ?? []).filter((t) => agora - t < ms);
  if (lista.length >= max) return false;
  lista.push(agora);
  janela.set(chave, lista);
  return true;
}

class ErroAcao extends Error {
  constructor(public codigo: string, public http = 400, public extra: Record<string, unknown> = {}) {
    super(codigo);
  }
}
const falhar = (codigo: string, http = 400, extra: Record<string, unknown> = {}): never => {
  throw new ErroAcao(codigo, http, extra);
};

const simulado = (id: string | null | undefined) => !!id && id.startsWith("sim-");
const reais = (v: number) => `R$ ${Number(v).toFixed(2).replace(".", ",")}`;

/** O que a tela vê de uma cobrança (sem o QR do MP das antigas; o caminho do comprovante vira só "tem comprovante"). */
function vista(c: Cobranca, comQr = false) {
  return {
    id: c.id, paciente_id: c.paciente_id, tipo: c.tipo, descricao: c.descricao, valor: Number(c.valor), vencimento: c.vencimento,
    status: c.status, forma: c.forma, metodo: c.metodo, mes_ref: c.mes_ref, pago_em: c.pago_em, enviado_em: c.enviado_em,
    cobre_de: c.cobre_de, cobre_ate: c.cobre_ate, comprovante: !!c.comprovante_path, comprovante_pdf: /\.pdf$/i.test(c.comprovante_path || ""),
    recusado_motivo: c.recusado_motivo, recusado_em: c.recusado_em, reembolsado_em: c.reembolsado_em, mp_status: c.mp_status,
    mp: !!c.mp_payment_id, mp_simulado: simulado(c.mp_payment_id), transacao_id: c.transacao_id,
    pix_qr: comQr ? c.pix_qr : null, pix_copia_cola: comQr ? c.pix_copia_cola : null, pix_expira_em: c.pix_expira_em,
    criado_por: c.criado_por, confirmado_em: c.confirmado_em, created_at: c.created_at,
  };
}

/** Detalhe de um pagamento do Mercado Pago (só o que o comprovante em PDF usa). */
interface PagamentoMpDetalhe {
  status?: string | null;
  status_detail?: string | null;
  date_approved?: string | null;
  payment_method_id?: string | null;
  payment_type_id?: string | null;
  payer?: { email?: string | null } | null;
  card?: { cardholder?: { name?: string | null } | null; last_four_digits?: string | null } | null;
  point_of_interaction?: { transaction_data?: { bank_info?: { payer?: { long_name?: string | null } | null } | null; e2e_id?: string | null } | null } | null;
}

/** Linha de aluno do prof_resumo. */
interface LinhaAlunoResumo {
  id: string;
  treino_user_id: string | null;
  nome: string;
  email: string | null;
  ativo: boolean;
  personal_id: string | null;
  nutricionista_id: string | null;
  mensalidade_valor: number | string | null;
  cobranca_pausada: boolean;
  mensalidade_pago_ate: string | null;
  mensalidade_desde: string | null;
  plano: { nome: string } | null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return erro("metodo", 405, origin);
  const schema = (req.headers.get("x-schema") || "public").toLowerCase() as Schema;
  if (!SCHEMAS.includes(schema)) return erro("schema_invalido", 400, origin);
  const credencial = credencialDoSchema(schema);

  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return erro("missing_auth", 401, origin);
  const authAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: u, error: eu } = await authAdmin.auth.getUser(auth.slice(7));
  if (eu || !u?.user) return erro("invalid_token", 401, origin);
  const user = u.user;
  const email = String(user.email || "").trim().toLowerCase();
  if (schema === "staging" && !emailDeTeste(email)) return erro("conta_real_no_staging", 403, origin);
  if (!permitido(`${schema}:${user.id}`)) return erro("rate_limited", 429, origin);
  const ehMaster = (user.app_metadata as Record<string, unknown> | undefined)?.role === "master";

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const acao = String(body.acao || "");
  const db = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" }, auth: { persistSession: false } });
  const storage = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const bucket = bucketComprovantes(schema);
  const hoje = hojeSP();
  const notificacao = `${SUPABASE_URL}/functions/v1/mp-webhook-aluno?schema=${schema}`;
  const pagador = credencial === "test" ? (Deno.env.get("MP_TEST_PAYER_EMAIL") || email) : email;

  // ───────────────────────── ajudantes (com o db do schema) ─────────────────────────

  const buscarCobranca = async (id: unknown): Promise<Cobranca> => {
    if (!ehUuidFin(id)) falhar("cobranca_invalida");
    const { data, error } = await db.from("cobrancas").select(COLUNAS_COBRANCA).eq("id", id as string).is("deleted_at", null).maybeSingle();
    if (error) throw error;
    if (!data) falhar("cobranca_inexistente", 404);
    return data as unknown as Cobranca;
  };

  /** A matrícula do aluno logado (a pedida, ou a 1ª ativa). */
  const minhaMatricula = async (pacienteId: unknown): Promise<Matricula> => {
    let id = ehUuidFin(pacienteId) ? String(pacienteId) : null;
    if (!id) {
      const { data } = await db.from("pacientes").select("id").eq("user_id", user.id).is("deleted_at", null).eq("ativo", true)
        .order("created_at").limit(1);
      id = ((data ?? []) as Array<{ id: string }>)[0]?.id ?? null;
    }
    if (!id) falhar("sem_matricula", 404);
    const m = await carregarMatricula(db, id!);
    if (!m || m.user_id !== user.id || m.deleted_at) falhar("sem_matricula", 404);
    return m!;
  };

  /** Papel de quem chama na matrícula (spec 4.1): master, dono da conta, responsável de treino/nutrição (com o papel). */
  const papelNa = async (m: Matricula): Promise<PapelNaMatricula> => {
    if (ehMaster) return { master: true, dono: true, responsavel: true, userId: user.id };
    if (!m.conta_id) {
      // aluno do site antigo sem conta: a nutricionista dona do registro
      const dona = m.nutricionista_id === user.id;
      return { master: false, dono: dona, responsavel: dona, userId: user.id };
    }
    const { data } = await db.from("conta_membros").select("papeis, status").eq("conta_id", m.conta_id).eq("user_id", user.id)
      .eq("status", "ativo").maybeSingle();
    const papeis = ((data as { papeis: string[] } | null)?.papeis ?? []) as string[];
    const dono = papeis.includes("dono");
    const responsavel = (m.personal_id === user.id && papeis.includes("personal")) || (m.nutricionista_id === user.id && papeis.includes("nutricionista"));
    return { master: false, dono, responsavel: dono || responsavel, userId: user.id };
  };

  /** O aluno do painel pelo id da rota (matrícula ou Treino), numa conta que quem chama vê. */
  const matriculaDoPainel = async (aluno: unknown): Promise<{ m: Matricula; p: PapelNaMatricula }> => {
    if (!ehUuidFin(aluno)) falhar("aluno_invalido");
    const { data, error } = await db.from("pacientes").select("id, conta_id").or(`id.eq.${aluno},treino_user_id.eq.${aluno}`)
      .is("deleted_at", null).order("ativo", { ascending: false }).order("created_at");
    if (error) throw error;
    const lista = (data ?? []) as Array<{ id: string; conta_id: string | null }>;
    for (const linha of lista) {
      const m = await carregarMatricula(db, linha.id);
      if (!m) continue;
      const p = await papelNa(m);
      if (p.master || p.dono || p.responsavel) return { m, p };
    }
    return falhar(lista.length ? "sem_permissao" : "aluno_inexistente", lista.length ? 403 : 404);
  };

  const exigirMensalidade = (p: PapelNaMatricula) => {
    if (!podeMexerNaMensalidade(p)) falhar("so_o_dono", 403);
  };

  const chaveAtiva = async (contaId: string | null) => {
    if (!contaId) return null;
    const { data } = await db.from("recebimento_chaves").select("id, tipo, chave, favorecido, banco").eq("conta_id", contaId).eq("ativa", true).maybeSingle();
    return (data as { id: string; tipo: string; chave: string; favorecido: string | null; banco: string | null } | null) ?? null;
  };

  // hml-06 (H-20): sem ler a assinatura atual não se segue — o erro de banco virava "não tem" e o aluno_mp_assinar criava OUTRA
  // sem cancelar a atual (o aluno pagava 2×); agora vira 500 erro_interno ANTES de qualquer POST ao MP
  const assinaturaDe = async (pacienteId: string) => {
    const { data, error } = await db.from("aluno_assinaturas").select("id, paciente_id, conta_id, mp_preapproval_id, status, valor, proximo_vencimento, payload, criado_em")
      .eq("paciente_id", pacienteId).order("criado_em", { ascending: false }).limit(1);
    if (error) throw error;
    return ((data ?? []) as Array<{ id: string; paciente_id: string; conta_id: string | null; mp_preapproval_id: string | null; status: string;
      valor: number | null; proximo_vencimento: string | null; payload: Record<string, unknown> | null; criado_em: string }>)[0] ?? null;
  };

  const nomeDe = async (uid: string | null | undefined): Promise<string | null> => {
    if (!uid) return null;
    const { data } = await db.from("profiles").select("nome, email").eq("id", uid).maybeSingle();
    const r = data as { nome: string | null; email: string | null } | null;
    return (r?.nome || "").trim() || r?.email || null;
  };

  /** confere no MP uma cobrança que ainda pode mudar (webhook atrasado/perdido) */
  const conferir = async (c: Cobranca, m?: Matricula): Promise<Cobranca> => {
    if (!c.mp_payment_id || simulado(c.mp_payment_id) || c.forma !== "mp" || !mpEmAberto(c.mp_status) || c.status !== "aguardando_confirmacao") return c;
    const { status: st, body: pay } = await mpFetch<PagamentoMp>(credencial, `/v1/payments/${encodeURIComponent(c.mp_payment_id)}`);
    if (st !== 200 || !pay?.id) return c;
    await aplicarPagamentoMp(db, c, pay, m, log, schema);
    return await buscarCobranca(c.id);
  };

  /** assinatura ao vivo no MP (status e próxima cobrança) */
  const conferirAssinatura = async (pacienteId: string) => {
    const a = await assinaturaDe(pacienteId);
    if (!a?.mp_preapproval_id || simulado(a.mp_preapproval_id) || a.payload?.simulada === true || a.status === "cancelled") return a;
    const { status: st, body: pre } = await mpFetch<AssinaturaMp>(credencial, `/preapproval/${encodeURIComponent(a.mp_preapproval_id)}`);
    if (st === 200 && pre?.id) {
      await db.from("aluno_assinaturas").update(espelhoAssinaturaAluno(pre, { ...(a.payload ?? {}) })).eq("id", a.id);
      return await assinaturaDe(pacienteId);
    }
    return a;
  };

  const cobrancasDe = async (pacienteId: string, limite = 48): Promise<Cobranca[]> => {
    const { data, error } = await db.from("cobrancas").select(COLUNAS_COBRANCA).eq("paciente_id", pacienteId).is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(limite);
    if (error) throw error;
    return (data ?? []) as unknown as Cobranca[];
  };

  const recibosDe = async (pacienteId: string) => {
    const { data } = await db.from("recibos").select("id, numero, data, valor, descricao, texto, nutricionista_id, created_at")
      .eq("paciente_id", pacienteId).is("deleted_at", null).order("numero", { ascending: false }).limit(24);
    return (data ?? []) as Array<Record<string, unknown>>;
  };

  const urlAssinada = async (caminho: string): Promise<string> => {
    const { data, error } = await storage.storage.from(bucket).createSignedUrl(caminho, 300);
    if (error || !data?.signedUrl) falhar("storage_error", 502);
    return data!.signedUrl;
  };

  /** Lança a entrada no financeiro do profissional e liga na cobrança (para emitir recibo — N-45). */
  const lancar = async (c: Cobranca, dia: string, metodo: string) => {
    if (c.transacao_id) return c.transacao_id;
    const metodoTransacao = metodo === "cartao" ? "cartao_credito" : ["pix", "dinheiro", "transferencia"].includes(metodo) ? metodo : "outro";
    const { data, error } = await db.from("transacoes").insert({
      nutricionista_id: c.nutricionista_id, conta_id: c.conta_id, paciente_id: c.paciente_id, tipo: "entrada",
      descricao: c.descricao.slice(0, 160), valor: Number(c.valor), data: dia, metodo: metodoTransacao,
      observacao: "Lançado pela cobrança do aluno (Physiq)",
    }).select("id").single();
    if (error) {
      log.excecao(error, { codigo: "lancar_falhou", schema, acao, ref: c.id });
      return null;
    }
    const id = (data as { id: string }).id;
    await db.from("cobrancas").update({ transacao_id: id }).eq("id", c.id);
    return id;
  };

  /** o que a trava do Nutri (site antigo) guarda em pacientes.bloqueado_por_pagamento acompanha a mudança (efeito na hora) */
  const recalcularTravaNutri = async () => {
    try {
      await db.rpc("cobrancas_atualizar_bloqueio");
    } catch (e) {
      log.excecao(e, { codigo: "atualizar_bloqueio_falhou", schema, acao });
    }
  };

  const mensalidadeVista = (m: Matricula) =>
    m.mensalidade_valor
      ? { valor: Number(m.mensalidade_valor), plano_id: m.plano_aluno_id, plano: m.plano?.nome ?? null, pausada: m.cobranca_pausada,
          pago_ate: m.mensalidade_pago_ate, desde: m.mensalidade_desde, coberta: coberto(m.mensalidade_pago_ate),
          // W7b: aluno sem profissional — o teste grátis do app e o código do plano (Treino · Treino + Alimentação)
          teste_ate: ehDoApp(m) ? m.app_teste_ate ?? null : null, plano_codigo: ehDoApp(m) ? m.plano?.codigo ?? null : null }
      : null;

  const assinaturaVista = (a: Awaited<ReturnType<typeof assinaturaDe>>) =>
    a ? { id: a.id, status: a.status, valor: a.valor === null ? null : Number(a.valor), proximo_vencimento: a.proximo_vencimento,
          sandbox: a.payload?.sandbox === true, simulada: a.payload?.simulada === true,
          init_point: (a.payload?.init_point as string | null) ?? null } : null;

  // ───────────────────────── Mercado Pago (aluno) ─────────────────────────

  /** Alvo do pagamento: uma cobrança avulsa aberta, ou a mensalidade (valor da matrícula; não paga em dobro enquanto coberta). */
  const alvoDoPagamento = async (m: Matricula, cobrancaId: unknown, permitirAdiantar = false) => {
    if (cobrancaId) {
      const c = await buscarCobranca(cobrancaId);
      if (c.paciente_id !== m.id) falhar("cobranca_de_outro_aluno", 403);
      if (c.tipo !== "avulsa") falhar("cobranca_invalida");
      if (c.status !== "aberta" && c.status !== "aguardando_confirmacao") falhar("cobranca_nao_aberta");
      return { avulsa: c, valor: Number(c.valor), vencimento: c.vencimento, mesRef: mesRefDe(c.vencimento) };
    }
    if (!m.mensalidade_valor || !(Number(m.mensalidade_valor) > 0)) falhar("sem_mensalidade");
    if (m.cobranca_pausada) falhar("cobranca_pausada");
    const dentroDaJanela = !!m.mensalidade_pago_ate && new Date(m.mensalidade_pago_ate).getTime() - Date.now() <= JANELA_ADIANTAR_MS;
    // W7b: nos dias grátis do app (a cobertura é só o teste) dá para pagar/assinar em qualquer dia do teste
    const soOTesteDoApp = ehDoApp(m) && !!m.app_teste_ate && !!m.mensalidade_pago_ate
      && new Date(m.mensalidade_pago_ate).getTime() <= new Date(m.app_teste_ate).getTime() + 60_000;
    if (!permitirAdiantar && coberto(m.mensalidade_pago_ate) && !dentroDaJanela && !soOTesteDoApp) falhar("ainda_coberto");
    const venc = vencimentoAPagar({ pago_ate: m.mensalidade_pago_ate, desde: m.mensalidade_desde }, hoje);
    return { avulsa: null as Cobranca | null, valor: Number(m.mensalidade_valor), vencimento: venc, mesRef: mesRefDe(venc) };
  };

  const exigirMp = (m: Matricula) => {
    if (m.conta?.recebimento_modo !== "mercadopago") falhar("modo_nao_mercadopago");
    if (!tokenMp(credencial)) falhar("mp_nao_configurado", 500);
  };

  /** cria (ou prepara) a linha da cobrança que o MP vai pagar */
  const linhaParaMp = async (m: Matricula, alvo: Awaited<ReturnType<typeof alvoDoPagamento>>, metodo: "pix" | "cartao", expira: Date | null): Promise<Cobranca> => {
    if (alvo.avulsa) {
      const { data, error } = await db.from("cobrancas").update({
        status: "aguardando_confirmacao", forma: "mp", metodo, mp_status: "pending", mp_payment_id: null, pix_qr: null, pix_copia_cola: null,
        pix_expira_em: expira ? expira.toISOString() : null, recusado_motivo: null, recusado_em: null,
      }).eq("id", alvo.avulsa.id).select(COLUNAS_COBRANCA).single();
      if (error) throw error;
      return data as unknown as Cobranca;
    }
    const dono = recebedor(m);
    if (!dono) falhar("sem_profissional");
    const { data, error } = await db.from("cobrancas").insert({
      paciente_id: m.id, conta_id: m.conta_id, nutricionista_id: dono, criado_por: null, tipo: "mensalidade",
      descricao: descricaoMensalidade(m.plano?.nome ?? null, alvo.mesRef), valor: alvo.valor, vencimento: alvo.vencimento, mes_ref: alvo.mesRef,
      status: "aguardando_confirmacao", forma: "mp", metodo, mp_status: "pending", plano_aluno_id: m.plano_aluno_id, origem: "app",
      pix_expira_em: expira ? expira.toISOString() : null,
    }).select(COLUNAS_COBRANCA).single();
    if (error) throw error;
    return data as unknown as Cobranca;
  };

  /** desfaz a linha quando o MP recusa criar o pagamento */
  const desfazerLinha = async (c: Cobranca) => {
    if (c.tipo === "avulsa") {
      await db.from("cobrancas").update({ status: "aberta", forma: null, metodo: null, mp_status: null, pix_expira_em: null }).eq("id", c.id);
    } else {
      await db.from("cobrancas").delete().eq("id", c.id);
    }
  };

  try {
    // ════════════════════════════ ALUNO ════════════════════════════
    if (acao === "aluno_status") {
      // W7b (rede de segurança): saiu do app para um profissional e a assinatura do app ainda está viva → cancela no MP
      try {
        await cancelarAssinaturasDoAppEncerrado(db, credencial, user.id, "vinculou_profissional", log);
      } catch (e) {
        log.excecao(e, { codigo: "cancelar_assinatura_do_app", schema, acao });
      }
      const { data: mats, error } = await db.from("pacientes").select("id").eq("user_id", user.id).is("deleted_at", null)
        .eq("ativo", true).order("created_at");
      if (error) throw error;
      const matriculas = [];
      for (const { id } of (mats ?? []) as Array<{ id: string }>) {
        const m = await carregarMatricula(db, id);
        if (!m) continue;
        // o que ainda pode mudar no MP (Pix pendente, assinatura) — funciona mesmo sem o aviso do webhook
        const cobs0 = await cobrancasDe(m.id);
        for (const c of cobs0.filter((x) => x.forma === "mp" && x.status === "aguardando_confirmacao").slice(0, 4)) await conferir(c, m);
        const assinatura = m.conta?.recebimento_modo === "mercadopago" ? await conferirAssinatura(m.id) : await assinaturaDe(m.id);
        const atual = (await carregarMatricula(db, id)) ?? m;
        const cobs = await cobrancasDe(m.id);
        const pixAberto = cobs.find((c) => c.forma === "mp" && c.status === "aguardando_confirmacao" && c.metodo === "pix"
          && !!c.pix_copia_cola && (!c.pix_expira_em || new Date(c.pix_expira_em).getTime() > Date.now()));
        const modo = atual.conta?.recebimento_modo ?? "pix_manual";
        const chave = modo === "pix_manual" ? await chaveAtiva(atual.conta_id) : null;
        const dono = recebedor(atual);
        matriculas.push({
          paciente_id: atual.id, nome: atual.nome,
          conta: { id: atual.conta_id, nome: atual.conta?.nome ?? null, modo, bloquear: atual.conta?.bloquear_app_inadimplente ?? false,
                   profissional: ehDoApp(atual) ? "Physiq" : await nomeDe(dono), app: ehDoApp(atual) },
          chave: chave ? { tipo: chave.tipo, chave: chave.chave, favorecido: chave.favorecido, banco: chave.banco } : null,
          mensalidade: mensalidadeVista(atual),
          assinatura: assinaturaVista(assinatura),
          cobrancas: cobs.map((c) => vista(c, c.id === pixAberto?.id)),
          recibos: await recibosDe(atual.id),
        });
      }
      return json({ ok: true, ambiente: schema, simulacao: schema === "staging", hoje, agora: new Date().toISOString(), matriculas }, 200, origin);
    }

    if (acao === "aluno_upload") {
      const m = await minhaMatricula(body.paciente_id);
      if (!m.conta_id) falhar("sem_conta");
      const ext = extensaoComprovante(String(body.tipo || ""));
      if (!ext) falhar("tipo_invalido");
      const tamanho = Number(body.tamanho || 0);
      if (tamanho > COMPROVANTE_MAX_BYTES) falhar("arquivo_grande");
      const caminho = caminhoComprovante(m.conta_id!, m.id, ext!);
      const { data, error } = await storage.storage.from(bucket).createSignedUploadUrl(caminho);
      if (error || !data?.token) falhar("storage_error", 502);
      return json({ ok: true, bucket, caminho, token: data!.token, url: data!.signedUrl }, 200, origin);
    }

    if (acao === "aluno_avisar_pix") {
      const m = await minhaMatricula(body.paciente_id);
      if (!m.conta_id) falhar("sem_conta");
      if ((m.conta?.recebimento_modo ?? "pix_manual") !== "pix_manual") falhar("modo_nao_pix_manual");
      if (!(await chaveAtiva(m.conta_id))) falhar("sem_chave_pix");
      const caminho = String(body.comprovante_path || "").trim();
      if (!caminho) falhar("missing_comprovante");
      if (!comprovanteDaMatricula(caminho, m.conta_id!, m.id)) falhar("comprovante_fora_da_pasta", 403);
      const arquivo = await storage.storage.from(bucket).list(caminho.split("/").slice(0, -1).join("/"), { search: caminho.split("/").pop() });
      if (!(arquivo.data ?? []).some((f) => f.name === caminho.split("/").pop())) falhar("comprovante_nao_enviado");
      const agora = new Date().toISOString();
      let c: Cobranca;
      let atualizado = false;
      if (body.cobranca_id) {
        // cobrança avulsa (Nutri — R16): a própria cobrança passa a aguardar a confirmação
        c = await buscarCobranca(body.cobranca_id);
        if (c.paciente_id !== m.id) falhar("cobranca_de_outro_aluno", 403);
        if (c.tipo !== "avulsa" || (c.status !== "aberta" && !(c.status === "aguardando_confirmacao" && c.forma === "pix_manual"))) falhar("cobranca_nao_aberta");
        atualizado = c.status === "aguardando_confirmacao";
        const { data, error } = await db.from("cobrancas").update({
          status: "aguardando_confirmacao", forma: "pix_manual", comprovante_path: caminho, enviado_em: agora,
          recusado_motivo: null, recusado_em: null,
        }).eq("id", c.id).select(COLUNAS_COBRANCA).single();
        if (error) throw error;
        c = data as unknown as Cobranca;
      } else {
        // mensalidade: um aviso pendente por vez — troca o comprovante do pendente em vez de empilhar (regra do Calc)
        const alvo = await alvoDoPagamento(m, null, true);
        const { data: pend, error: ep } = await db.from("cobrancas").select(COLUNAS_COBRANCA).eq("paciente_id", m.id).eq("tipo", "mensalidade")
          .eq("forma", "pix_manual").eq("status", "aguardando_confirmacao").is("deleted_at", null).limit(1);
        if (ep) throw ep; // sem ler o pendente, criaria um 2º aviso
        const pendente = ((pend ?? []) as unknown as Cobranca[])[0];
        if (pendente) {
          const { data, error } = await db.from("cobrancas").update({ comprovante_path: caminho, valor: alvo.valor, enviado_em: agora })
            .eq("id", pendente.id).select(COLUNAS_COBRANCA).single();
          if (error) throw error;
          c = data as unknown as Cobranca;
          atualizado = true;
        } else {
          const dono = recebedor(m);
          if (!dono) falhar("sem_profissional");
          const { data, error } = await db.from("cobrancas").insert({
            paciente_id: m.id, conta_id: m.conta_id, nutricionista_id: dono, criado_por: null, tipo: "mensalidade",
            descricao: descricaoMensalidade(m.plano?.nome ?? null, alvo.mesRef), valor: alvo.valor, vencimento: alvo.vencimento,
            mes_ref: alvo.mesRef, status: "aguardando_confirmacao", forma: "pix_manual", metodo: "pix", comprovante_path: caminho,
            enviado_em: agora, plano_aluno_id: m.plano_aluno_id, origem: "app",
          }).select(COLUNAS_COBRANCA).single();
          if (error) throw error;
          c = data as unknown as Cobranca;
        }
      }
      if (!atualizado) {
        const titulo = `${m.nome} enviou um comprovante · ${reais(c.valor)}`;
        const destinos = new Set([recebedor(m), c.nutricionista_id].filter(Boolean) as string[]);
        for (const d of destinos) await avisar(db, d, "comprovante_enviado", titulo, linkDoAlunoNoPainel(m), log, schema);
      }
      await recalcularTravaNutri();
      return json({ ok: true, cobranca: vista(c), atualizado }, 200, origin);
    }

    if (acao === "aluno_comprovante") {
      const c = await buscarCobranca(body.cobranca_id);
      const m = await minhaMatricula(c.paciente_id);
      if (c.paciente_id !== m.id || !c.comprovante_path) falhar("not_found", 404);
      return json({ ok: true, url: await urlAssinada(c.comprovante_path!), pdf: /\.pdf$/i.test(c.comprovante_path!) }, 200, origin);
    }

    if (acao === "aluno_mp_pix" || acao === "aluno_mp_cartao") {
      const m = await minhaMatricula(body.paciente_id);
      exigirMp(m);
      const alvo = await alvoDoPagamento(m, body.cobranca_id);
      const assinatura = await assinaturaDe(m.id);
      if (!alvo.avulsa && assinatura?.status === "authorized") falhar("cartao_ativo");
      const metodo = acao === "aluno_mp_pix" ? "pix" : "cartao";
      if (metodo === "pix") {
        // Pix pendente igual e com mais de 30 min de validade → reaproveita; diferente → fecha no MP
        const { data: abertos, error } = await db.from("cobrancas").select(COLUNAS_COBRANCA).eq("paciente_id", m.id).eq("forma", "mp")
          .eq("metodo", "pix").eq("status", "aguardando_confirmacao").is("deleted_at", null);
        if (error) throw error; // hml-06: sem ler o Pix aberto não se cria outro
        for (const aberto of (abertos ?? []) as unknown as Cobranca[]) {
          const atual = await conferir(aberto, m);
          if (atual.status === "paga") return json({ ok: true, cobranca: vista(atual), aprovada: true }, 200, origin);
          const valida = atual.pix_expira_em ? new Date(atual.pix_expira_em).getTime() > Date.now() + 30 * 60_000 : false;
          const mesmoAlvo = alvo.avulsa ? atual.id === alvo.avulsa.id : atual.tipo === "mensalidade";
          if (atual.status === "aguardando_confirmacao" && valida && mesmoAlvo && Number(atual.valor) === alvo.valor && atual.pix_copia_cola) {
            return json({ ok: true, cobranca: vista(atual, true), reutilizada: true }, 200, origin);
          }
          if (atual.status === "aguardando_confirmacao" && (!alvo.avulsa || atual.id !== alvo.avulsa.id)) {
            if (atual.mp_payment_id && !simulado(atual.mp_payment_id)) {
              await mpFetch(credencial, `/v1/payments/${encodeURIComponent(atual.mp_payment_id)}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
            }
            if (atual.tipo === "avulsa") await db.from("cobrancas").update({ status: "aberta", forma: null, mp_status: "cancelled", mp_payment_id: null, pix_qr: null, pix_copia_cola: null, pix_expira_em: null }).eq("id", atual.id);
            else await db.from("cobrancas").update({ status: "cancelada", mp_status: "cancelled" }).eq("id", atual.id);
          }
        }
      }
      const expira = metodo === "pix" ? new Date(Date.now() + PIX_HORAS * 3_600_000) : null;
      const linha = await linhaParaMp(m, alvo, metodo, expira);
      const referencia = referenciaAluno(schema, m.id, alvo.avulsa ? "avulsa" : "mensalidade", linha.id);
      if (metodo === "pix") {
        const { status: st, body: pay } = await mpFetch<PagamentoMp>(credencial, "/v1/payments", {
          method: "POST",
          body: JSON.stringify({
            transaction_amount: alvo.valor, description: linha.descricao.slice(0, 120), payment_method_id: "pix", payer: { email: pagador },
            external_reference: referencia, notification_url: notificacao, date_of_expiration: expira!.toISOString().replace("Z", "-00:00"),
          }),
        });
        const td = pay?.point_of_interaction?.transaction_data;
        if (st >= 300 || !pay?.id || !td?.qr_code) {
          log.erro({ codigo: "mp_pix_falhou", schema, acao, ref: linha.id, status: st, externo: codigosDoMp(pay) });
          if (schema === "staging" && st >= 500) {
            // SÓ STAGING: o sandbox do MP cai com 500 de vez em quando → Pix simulado (sem QR real) pra manter o fluxo de teste
            const { data: sim } = await db.from("cobrancas").update({ mp_payment_id: `sim-${crypto.randomUUID()}`, pix_copia_cola: "SIMULADO-SANDBOX-MP-INDISPONIVEL" })
              .eq("id", linha.id).select(COLUNAS_COBRANCA).single();
            return json({ ok: true, cobranca: vista(sim as unknown as Cobranca, true), simulado: true }, 200, origin);
          }
          await desfazerLinha(linha);
          return erro("pix_indisponivel", 502, origin, { status_mp: st });
        }
        const { data: salva, error: es } = await db.from("cobrancas").update({
          mp_payment_id: String(pay.id), mp_status: String(pay.status || "pending"), pix_qr: td.qr_code_base64 ?? null, pix_copia_cola: td.qr_code,
          pix_expira_em: pay.date_of_expiration ?? expira!.toISOString(),
        }).eq("id", linha.id).select(COLUNAS_COBRANCA).single();
        if (es) throw es;
        return json({ ok: true, cobranca: vista(salva as unknown as Cobranca, true), reutilizada: false }, 200, origin);
      }
      const cardToken = typeof body.card_token === "string" ? body.card_token : "";
      if (!cardToken) {
        await desfazerLinha(linha);
        return erro("missing_card_token", 400, origin);
      }
      const pedido: Record<string, unknown> = {
        transaction_amount: alvo.valor, token: cardToken, description: linha.descricao.slice(0, 120), installments: 1, payer: { email: pagador },
        external_reference: referencia, notification_url: notificacao,
      };
      if (typeof body.payment_method_id === "string" && body.payment_method_id) pedido.payment_method_id = body.payment_method_id;
      if (body.issuer_id !== undefined && body.issuer_id !== null && body.issuer_id !== "") pedido.issuer_id = body.issuer_id;
      const { status: st, body: pay } = await mpFetch<PagamentoMp>(credencial, "/v1/payments", { method: "POST", body: JSON.stringify(pedido) });
      if (st >= 300 || !pay?.id) {
        log.erro({ codigo: "mp_cartao_falhou", schema, acao, ref: linha.id, status: st, externo: codigosDoMp(pay) });
        await desfazerLinha(linha);
        return erro(erroDeCartao(st, pay) ? "cartao_recusado" : "mp_error", erroDeCartao(st, pay) ? 400 : 502, origin,
          { detalhe: String((pay as { message?: unknown } | null)?.message ?? "").slice(0, 200) });
      }
      await db.from("cobrancas").update({ mp_payment_id: String(pay.id) }).eq("id", linha.id).is("mp_payment_id", null);
      const r = await aplicarPagamentoMp(db, await buscarCobranca(linha.id), pay, m, log, schema);
      return json({ ok: true, cobranca: vista(await buscarCobranca(linha.id)), status: r.status, status_detail: pay.status_detail ?? null }, 200, origin);
    }

    if (acao === "aluno_mp_assinar") {
      const m = await minhaMatricula(body.paciente_id);
      exigirMp(m);
      if (!m.mensalidade_valor || m.cobranca_pausada) falhar("sem_mensalidade");
      const cardToken = typeof body.card_token === "string" ? body.card_token : "";
      const checkout = body.checkout === true;
      if (!cardToken && !checkout) falhar("missing_card_token");
      const atual = await assinaturaDe(m.id);
      if (atual?.mp_preapproval_id && ["authorized", "pending", "paused"].includes(atual.status) && !simulado(atual.mp_preapproval_id)) {
        const { status: sa, body: pre } = await mpFetch<AssinaturaMp>(credencial, `/preapproval/${encodeURIComponent(atual.mp_preapproval_id)}`);
        if (sa === 200 && pre?.status === "authorized" && atual.payload?.sandbox !== true) falhar("assinatura_ja_ativa");
        if (sa === 200 && pre?.status !== "cancelled") {
          await mpFetch(credencial, `/preapproval/${encodeURIComponent(atual.mp_preapproval_id)}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
        }
      }
      // cobertura vigente → 1ª cobrança quando ela termina (regra do Calc); vencida → cobra na hora
      const inicio = coberto(m.mensalidade_pago_ate) ? new Date(m.mensalidade_pago_ate!).toISOString() : null;
      const valor = Number(m.mensalidade_valor);
      const recorrencia = { frequency: 1, frequency_type: "months", transaction_amount: valor, currency_id: "BRL", ...(inicio ? { start_date: inicio } : {}) };
      const motivo = `Physiq — ${descricaoMensalidade(m.plano?.nome ?? null, mesRefDe(hoje)).replace(/ · [^·]+$/, "")}`;
      const base = {
        reason: motivo.slice(0, 120), external_reference: referenciaAluno(schema, m.id, "recorrente"), payer_email: pagador,
        auto_recurring: recorrencia, back_url: `${SITE[schema]}/perfil/pagamentos?assinatura=ok`, notification_url: notificacao,
      };
      const pendente = () => mpFetch<AssinaturaMp>(credencial, "/preapproval", { method: "POST", body: JSON.stringify({ ...base, status: "pending" }) });
      let { status: st, body: pre } = checkout ? await pendente()
        : await mpFetch<AssinaturaMp>(credencial, "/preapproval", { method: "POST", body: JSON.stringify({ ...base, card_token_id: cardToken, status: "authorized" }) });
      let sandbox = false;
      if (!checkout && (st >= 300 || !pre?.id) && credencial === "test" && recusaDoSandbox(st, pre)) {
        // STAGING: o MP não tem assinatura com cartão no sandbox → nasce PENDENTE (checkout do MP) com a credencial de teste
        sandbox = true;
        ({ status: st, body: pre } = await pendente());
      }
      if (st >= 300 || !pre?.id) {
        log.erro({ codigo: "mp_assinatura_falhou", schema, acao, ref: m.id, status: st, externo: codigosDoMp(pre) });
        if (erroDeCartao(st, pre)) falhar("cartao_recusado", 400, { detalhe: String((pre as { message?: unknown } | null)?.message ?? "").slice(0, 200) });
        falhar("mp_error", 502, { status_mp: st });
      }
      const linha = { paciente_id: m.id, conta_id: m.conta_id, valor, ...espelhoAssinaturaAluno(pre!, { sandbox, checkout, inicio, criada_por: user.id }) };
      const { data: salva, error: es } = atual
        ? await db.from("aluno_assinaturas").update(linha).eq("id", atual.id).select("*").single()
        : await db.from("aluno_assinaturas").insert(linha).select("*").single();
      if (es) throw es;
      return json({ ok: true, assinatura: salva, primeira_cobranca: inicio, sandbox, init_point: sandbox || checkout ? pre!.init_point ?? null : null }, 200, origin);
    }

    if (acao === "aluno_mp_cancelar" || acao === "prof_cancelar_assinatura") {
      let m: Matricula;
      if (acao === "aluno_mp_cancelar") m = await minhaMatricula(body.paciente_id);
      else {
        const r = await matriculaDoPainel(body.aluno);
        exigirMensalidade(r.p);
        m = r.m;
      }
      const a = await assinaturaDe(m.id);
      if (!a?.mp_preapproval_id || !["authorized", "pending", "paused"].includes(a.status)) falhar("sem_assinatura");
      if (!simulado(a!.mp_preapproval_id)) {
        const { status: sc, body: pre } = await mpFetch<AssinaturaMp>(credencial, `/preapproval/${encodeURIComponent(a!.mp_preapproval_id!)}`, {
          method: "PUT", body: JSON.stringify({ status: "cancelled" }),
        });
        if (sc >= 300 || !pre?.id) falhar("mp_error", 502, { status_mp: sc });
        await db.from("aluno_assinaturas").update(espelhoAssinaturaAluno(pre!, { ...(a!.payload ?? {}), cancelada_por: user.id })).eq("id", a!.id);
      } else {
        await db.from("aluno_assinaturas").update({ status: "cancelled" }).eq("id", a!.id);
      }
      return json({ ok: true }, 200, origin);
    }

    if (acao === "aluno_app_plano") {
      const m = await minhaMatricula(body.paciente_id);
      if (!ehDoApp(m)) falhar("nao_e_do_app");
      const plano = String(body.plano || "");
      if (!/^app_[a-z_]{1,40}$/.test(plano)) falhar("plano_invalido");
      const { data: r0, error: et } = await db.rpc("app_trocar_plano", { p_paciente: m.id, p_plano: plano, p_por: user.id });
      if (et) throw et;
      const r = (r0 ?? {}) as { ok?: boolean; erro?: string; mudou?: boolean; valor?: number; nome?: string; plano?: string };
      if (!r.ok) falhar(r.erro || "plano_invalido");
      // a cobrança automática no cartão passa para o valor novo (como o "Trocar de plano" das contas — spec 6.2)
      let assinatura: string | null = null;
      if (r.mudou) {
        const a = await assinaturaDe(m.id);
        if (a?.mp_preapproval_id && a.status === "authorized" && !simulado(a.mp_preapproval_id) && a.payload?.simulada !== true) {
          const { status: st, body: pre } = await mpFetch<AssinaturaMp>(credencial, `/preapproval/${encodeURIComponent(a.mp_preapproval_id)}`, {
            method: "PUT", body: JSON.stringify({ auto_recurring: { transaction_amount: Number(r.valor), currency_id: "BRL" } }),
          });
          if (st >= 300 || !pre?.id) {
            log.erro({ codigo: "mp_valor_assinatura_app_falhou", schema, acao, ref: a.id, status: st, externo: codigosDoMp(pre) });
            assinatura = "falhou";
          } else {
            await db.from("aluno_assinaturas").update({ ...espelhoAssinaturaAluno(pre, { ...(a.payload ?? {}), valor_trocado_em: new Date().toISOString() }), valor: Number(r.valor) }).eq("id", a.id);
            assinatura = "atualizada";
          }
        } else if (a && ["authorized", "pending"].includes(a.status)) {
          await db.from("aluno_assinaturas").update({ valor: Number(r.valor) }).eq("id", a.id);
          assinatura = "atualizada";
        }
      }
      return json({ ok: true, mudou: r.mudou === true, plano: r.plano, nome: r.nome ?? null, valor: Number(r.valor), assinatura }, 200, origin);
    }

    if (acao === "aluno_mp_conferir") {
      const c = await buscarCobranca(body.cobranca_id);
      const m = await minhaMatricula(c.paciente_id);
      const atual = await conferir(c, m);
      return json({ ok: true, cobranca: vista(atual, atual.status === "aguardando_confirmacao") }, 200, origin);
    }

    if (acao === "simular_aprovacao") {
      if (schema !== "staging") falhar("so_staging", 403);
      const c = await buscarCobranca(body.cobranca_id);
      const m = await carregarMatricula(db, c.paciente_id);
      if (!m) falhar("not_found", 404);
      const dono = m!.user_id === user.id;
      if (!dono) {
        const r = await matriculaDoPainel(m!.id);
        exigirMensalidade(r.p);
      }
      if (c.forma !== "mp" || c.status !== "aguardando_confirmacao") falhar("nao_pendente");
      if (c.mp_payment_id && !simulado(c.mp_payment_id)) {
        await mpFetch(credencial, `/v1/payments/${encodeURIComponent(c.mp_payment_id)}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
      }
      await db.from("cobrancas").update({ status: "paga", mp_status: "approved", pago_em: new Date().toISOString(), metodo: c.metodo ?? "pix" }).eq("id", c.id);
      await avisar(db, m!.user_id, "pagamento_confirmado", `Pagamento confirmado · ${reais(c.valor)}`, "/perfil/pagamentos", log, schema);
      return json({ ok: true, simulado: true, cobranca: vista(await buscarCobranca(c.id)) }, 200, origin);
    }

    if (acao === "detalhe_mp") {
      const c = await buscarCobranca(body.cobranca_id);
      const m = await carregarMatricula(db, c.paciente_id);
      if (!m) falhar("not_found", 404);
      if (m!.user_id !== user.id) {
        const r = await matriculaDoPainel(m!.id);
        if (!podeVerCobranca(r.p, c)) falhar("not_found", 404);
      }
      if (!c.mp_payment_id || simulado(c.mp_payment_id)) return json({ ok: true, mp: null }, 200, origin);
      const { status: st, body: pay } = await mpFetch<PagamentoMpDetalhe>(credencial, `/v1/payments/${encodeURIComponent(c.mp_payment_id)}`);
      if (st !== 200 || !pay) return json({ ok: true, mp: null }, 200, origin);
      const emailPagador = pay.payer?.email || null;
      return json({
        ok: true,
        mp: {
          status: pay.status ?? null, status_detail: pay.status_detail ?? null, date_approved: pay.date_approved ?? null,
          payment_method: pay.payment_method_id ?? null, payment_type: pay.payment_type_id ?? null,
          payer_email: emailPagador && !/x{3,}/i.test(emailPagador) ? emailPagador : null, payer_nome: pay.card?.cardholder?.name ?? null,
          banco_pagador: pay.point_of_interaction?.transaction_data?.bank_info?.payer?.long_name ?? null,
          e2e_id: pay.point_of_interaction?.transaction_data?.e2e_id ?? null, card_last4: pay.card?.last_four_digits ?? null,
          mp_payment_id: c.mp_payment_id,
        },
      }, 200, origin);
    }

    // ════════════════════════════ PROFISSIONAL ════════════════════════════
    if (acao === "prof_resumo") {
      if (!ehUuidFin(body.conta_id)) falhar("conta_invalida");
      const contaId = String(body.conta_id);
      const { data: membro } = await db.from("conta_membros").select("papeis").eq("conta_id", contaId).eq("user_id", user.id).eq("status", "ativo").maybeSingle();
      const papeis = ((membro as { papeis: string[] } | null)?.papeis ?? []) as string[];
      if (!ehMaster && !papeis.length) falhar("sem_permissao", 403);
      const dono = ehMaster || papeis.includes("dono");
      let q = db.from("pacientes").select("id, treino_user_id, nome, email, ativo, personal_id, nutricionista_id, mensalidade_valor, cobranca_pausada, mensalidade_pago_ate, mensalidade_desde, plano:planos_aluno(nome)")
        .eq("conta_id", contaId).is("deleted_at", null);
      if (!dono) q = q.or(`personal_id.eq.${user.id},nutricionista_id.eq.${user.id}`);
      const { data: alunos, error: ea } = await q.order("nome");
      if (ea) throw ea;
      const lista = (alunos ?? []) as unknown as LinhaAlunoResumo[];
      const ids = lista.map((a) => a.id);
      let pendentes: Cobranca[] = [];
      let abertas: Array<{ paciente_id: string }> = [];
      if (ids.length) {
        const { data: pend } = await db.from("cobrancas").select(COLUNAS_COBRANCA).in("paciente_id", ids).eq("status", "aguardando_confirmacao")
          .eq("forma", "pix_manual").is("deleted_at", null).order("enviado_em", { ascending: true }).limit(200);
        pendentes = ((pend ?? []) as unknown as Cobranca[]).filter((c) => dono || c.nutricionista_id === user.id || c.criado_por === user.id);
        const { data: ab } = await db.from("cobrancas").select("paciente_id, nutricionista_id, criado_por").in("paciente_id", ids).eq("status", "aberta").is("deleted_at", null);
        abertas = ((ab ?? []) as Array<{ paciente_id: string; nutricionista_id: string | null; criado_por: string | null }>)
          .filter((c) => dono || c.nutricionista_id === user.id || c.criado_por === user.id);
      }
      const porId = new Map(lista.map((a) => [a.id, a]));
      return json({
        ok: true, hoje, agora: new Date().toISOString(), dono,
        alunos: lista.map((a) => ({
          paciente_id: a.id, treino_user_id: a.treino_user_id, nome: a.nome, email: a.email, ativo: a.ativo,
          mensalidade_valor: dono && a.mensalidade_valor !== null ? Number(a.mensalidade_valor) : null,
          plano: dono ? (a.plano?.nome ?? null) : null, pausada: dono ? a.cobranca_pausada : false,
          pago_ate: dono ? a.mensalidade_pago_ate : null, desde: dono ? a.mensalidade_desde : null,
          aguardando: pendentes.find((c) => c.paciente_id === a.id)?.id ?? null,
          abertas: abertas.filter((c) => c.paciente_id === a.id).length,
        })),
        pendentes: pendentes.map((c) => ({
          ...vista(c), aluno: { paciente_id: c.paciente_id, treino_user_id: porId.get(c.paciente_id)?.treino_user_id ?? null,
                                nome: porId.get(c.paciente_id)?.nome ?? null, email: porId.get(c.paciente_id)?.email ?? null },
        })),
      }, 200, origin);
    }

    if (acao === "prof_aluno") {
      const { m, p } = await matriculaDoPainel(body.aluno);
      const veMensalidade = podeMexerNaMensalidade(p);
      let cobs = await cobrancasDe(m.id, 72);
      if (veMensalidade && m.conta?.recebimento_modo === "mercadopago") {
        for (const c of cobs.filter((x) => x.forma === "mp" && x.status === "aguardando_confirmacao").slice(0, 4)) await conferir(c, m);
      }
      const assinatura = veMensalidade && m.conta?.recebimento_modo === "mercadopago" ? await conferirAssinatura(m.id) : await assinaturaDe(m.id);
      const atual = (await carregarMatricula(db, m.id)) ?? m;
      cobs = (await cobrancasDe(m.id, 72)).filter((c) => podeVerCobranca(p, c));
      const { data: planos } = atual.conta_id
        ? await db.from("planos_aluno").select("id, nome, valor, ativo").eq("conta_id", atual.conta_id).order("nome")
        : { data: [] };
      const chave = await chaveAtiva(atual.conta_id);
      return json({
        ok: true, ambiente: schema, simulacao: schema === "staging", hoje, agora: new Date().toISOString(),
        aluno: { paciente_id: atual.id, treino_user_id: atual.treino_user_id, nome: atual.nome, email: atual.email, cpf: atual.cpf, foto_url: atual.foto_url,
                 ativo: atual.ativo, tags: atual.tags ?? [], conta_id: atual.conta_id, conta_nome: atual.conta?.nome ?? null, tem_login: !!atual.user_id },
        permissoes: { master: p.master, dono: p.dono, responsavel: p.responsavel, mensalidade: veMensalidade },
        conta: { id: atual.conta_id, nome: atual.conta?.nome ?? null, modo: atual.conta?.recebimento_modo ?? "pix_manual",
                 bloquear: atual.conta?.bloquear_app_inadimplente ?? false, origem: atual.conta?.origem ?? null,
                 chave: chave ? { tipo: chave.tipo, chave: chave.chave, favorecido: chave.favorecido, banco: chave.banco } : null },
        planos: veMensalidade ? planos ?? [] : [],
        mensalidade: veMensalidade ? mensalidadeVista(atual) : null,
        assinatura: veMensalidade ? assinaturaVista(assinatura) : null,
        cobrancas: cobs.map((c) => vista(c)),
      }, 200, origin);
    }

    if (acao === "prof_definir") {
      const { m, p } = await matriculaDoPainel(body.aluno);
      exigirMensalidade(p);
      if (!m.conta_id) falhar("sem_conta");
      let planoId: string | null = ehUuidFin(body.plano_aluno_id) ? String(body.plano_aluno_id) : null;
      const planoNovo = textoCurto(body.plano_novo, 80);
      if (planoNovo) {
        const { data: ja } = await db.from("planos_aluno").select("id").eq("conta_id", m.conta_id).ilike("nome", planoNovo).maybeSingle();
        if (ja) planoId = (ja as { id: string }).id;
        else {
          const { data: novo, error } = await db.from("planos_aluno").insert({ conta_id: m.conta_id, nome: planoNovo }).select("id").single();
          if (error) throw error;
          planoId = (novo as { id: string }).id;
        }
      }
      if (planoId) {
        const { data: pl } = await db.from("planos_aluno").select("id").eq("id", planoId).eq("conta_id", m.conta_id).maybeSingle();
        if (!pl) falhar("plano_invalido");
      }
      const vazio = body.valor === null || body.valor === "" || body.valor === undefined;
      const valor = vazio ? null : valorValido(body.valor);
      if (!vazio && valor === null) falhar("valor_invalido");
      const patch: Record<string, unknown> = { plano_aluno_id: planoId, mensalidade_valor: valor };
      // 1º vencimento de quem nunca pagou = hoje (quem já tinha histórico segue na régua dele)
      if (valor && !m.mensalidade_desde && !m.mensalidade_pago_ate) patch.mensalidade_desde = new Date().toISOString();
      const { error } = await db.from("pacientes").update(patch).eq("id", m.id);
      if (error) throw error;
      return json({ ok: true, mensalidade: mensalidadeVista((await carregarMatricula(db, m.id))!) }, 200, origin);
    }

    if (acao === "prof_pausar") {
      const { m, p } = await matriculaDoPainel(body.aluno);
      exigirMensalidade(p);
      const pausar = body.pausar === true;
      const patch: Record<string, unknown> = { cobranca_pausada: pausar };
      // ao reativar quem nunca pagou, o 1º vencimento passa a ser hoje
      if (!pausar && !m.mensalidade_pago_ate) patch.mensalidade_desde = new Date().toISOString();
      const { error } = await db.from("pacientes").update(patch).eq("id", m.id);
      if (error) throw error;
      return json({ ok: true, pausada: pausar }, 200, origin);
    }

    if (acao === "prof_confirmar" || acao === "prof_recusar") {
      const c = await buscarCobranca(body.cobranca_id);
      const { m, p } = await matriculaDoPainel(c.paciente_id);
      if (!podeMexerNaCobranca(p, c)) falhar("sem_permissao", 403);
      if (c.forma !== "pix_manual" || c.status !== "aguardando_confirmacao") falhar("nao_pendente");
      const agora = new Date().toISOString();
      if (acao === "prof_confirmar") {
        // a data do pagamento é quando o aluno avisou (regra do Calc: é o dia que conta pra cobertura)
        const pagoEm = c.enviado_em ?? c.created_at;
        const { error } = await db.from("cobrancas").update({ status: "paga", pago_em: pagoEm, confirmado_por: user.id, confirmado_em: agora }).eq("id", c.id);
        if (error) throw error;
        if (body.lancar === true) await lancar(c, diaSP(pagoEm) ?? hoje, "pix");
        await avisar(db, m.user_id, "pagamento_confirmado", `Pagamento confirmado · ${reais(c.valor)}`, "/perfil/pagamentos", log, schema);
      } else {
        const motivo = textoCurto(body.motivo, 200) || "Comprovante não confere";
        const patch = c.tipo === "avulsa"
          ? { status: "aberta", forma: null, recusado_motivo: motivo, recusado_em: agora, confirmado_por: user.id }
          : { status: "cancelada", recusado_motivo: motivo, recusado_em: agora, confirmado_por: user.id };
        const { error } = await db.from("cobrancas").update(patch).eq("id", c.id);
        if (error) throw error;
        await avisar(db, m.user_id, "pagamento_recusado", `Comprovante recusado: ${motivo}`.slice(0, 160), "/perfil/pagamentos", log, schema);
      }
      await recalcularTravaNutri();
      return json({ ok: true, cobranca: vista(await buscarCobranca(c.id)) }, 200, origin);
    }

    if (acao === "prof_registrar") {
      const { m, p } = await matriculaDoPainel(body.aluno);
      const dia = String(body.data || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) falhar("invalid_data");
      if (dia > hoje) falhar("data_futura");
      const metodo = ehMetodoPorFora(body.metodo) ? String(body.metodo) : "";
      if (!metodo) falhar("missing_metodo");
      // meio-dia UTC não pula de dia no fuso de São Paulo; cobre 1 mês a partir daí (mesma régua dos demais)
      const pagoEm = new Date(`${dia}T12:00:00Z`).toISOString();
      let c: Cobranca;
      if (body.cobranca_id) {
        const alvo = await buscarCobranca(body.cobranca_id);
        if (alvo.paciente_id !== m.id) falhar("cobranca_de_outro_aluno", 403);
        if (!podeMexerNaCobranca(p, alvo)) falhar("sem_permissao", 403);
        if (alvo.tipo !== "avulsa" || !["aberta", "aguardando_confirmacao"].includes(alvo.status)) falhar("cobranca_nao_aberta");
        const { data, error } = await db.from("cobrancas").update({ status: "paga", forma: "manual", metodo, pago_em: pagoEm, confirmado_por: user.id,
          confirmado_em: new Date().toISOString(), recusado_motivo: null, recusado_em: null }).eq("id", alvo.id).select(COLUNAS_COBRANCA).single();
        if (error) throw error;
        c = data as unknown as Cobranca;
      } else {
        exigirMensalidade(p);
        const valor = valorValido(body.valor) ?? (m.mensalidade_valor ? Number(m.mensalidade_valor) : null);
        if (!valor) falhar("sem_valor");
        const dono = recebedor(m);
        if (!dono) falhar("sem_profissional");
        const mes = mesRefDe(dia);
        const { data, error } = await db.from("cobrancas").insert({
          paciente_id: m.id, conta_id: m.conta_id, nutricionista_id: dono, criado_por: user.id, tipo: "mensalidade",
          descricao: descricaoMensalidade(m.plano?.nome ?? null, mes), valor, vencimento: dia, mes_ref: mes, status: "paga",
          forma: "manual", metodo, pago_em: pagoEm, confirmado_por: user.id, confirmado_em: new Date().toISOString(),
          plano_aluno_id: m.plano_aluno_id, origem: "app",
        }).select(COLUNAS_COBRANCA).single();
        if (error) throw error;
        c = data as unknown as Cobranca;
      }
      if (body.lancar === true) await lancar(c, dia, metodo);
      await recalcularTravaNutri();
      return json({ ok: true, cobranca: vista(await buscarCobranca(c.id)) }, 200, origin);
    }

    if (acao === "prof_remover") {
      const c = await buscarCobranca(body.cobranca_id);
      const { p } = await matriculaDoPainel(c.paciente_id);
      exigirMensalidade(p);
      if (c.tipo !== "mensalidade" || c.forma !== "manual") falhar("nao_manual");
      const { error } = await db.from("cobrancas").update({ deleted_at: new Date().toISOString() }).eq("id", c.id);
      if (error) throw error;
      return json({ ok: true }, 200, origin);
    }

    if (acao === "prof_cobranca_criar") {
      const { m, p } = await matriculaDoPainel(body.aluno);
      if (!p.master && !p.dono && !p.responsavel) falhar("sem_permissao", 403);
      const descricao = textoCurto(body.descricao, 160);
      if (!descricao) falhar("descricao_vazia");
      const valor = valorValido(body.valor);
      if (!valor) falhar("valor_invalido");
      const vencimento = String(body.vencimento || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) falhar("vencimento_invalido");
      const { data, error } = await db.from("cobrancas").insert({
        paciente_id: m.id, conta_id: m.conta_id, nutricionista_id: user.id, criado_por: user.id, tipo: "avulsa", descricao, valor,
        vencimento, status: "aberta", origem: "app",
      }).select(COLUNAS_COBRANCA).single();
      if (error) throw error;
      await recalcularTravaNutri();
      return json({ ok: true, cobranca: vista(data as unknown as Cobranca) }, 200, origin);
    }

    if (acao === "prof_cobranca_cancelar") {
      const c = await buscarCobranca(body.cobranca_id);
      const { p } = await matriculaDoPainel(c.paciente_id);
      if (!podeMexerNaCobranca(p, c)) falhar("sem_permissao", 403);
      if (c.tipo !== "avulsa" || !["aberta", "aguardando_confirmacao"].includes(c.status)) falhar("cobranca_nao_aberta");
      if (c.forma === "mp" && c.mp_payment_id && !simulado(c.mp_payment_id)) {
        await mpFetch(credencial, `/v1/payments/${encodeURIComponent(c.mp_payment_id)}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
      }
      const { error } = await db.from("cobrancas").update({ status: "cancelada" }).eq("id", c.id);
      if (error) throw error;
      await recalcularTravaNutri();
      return json({ ok: true }, 200, origin);
    }

    if (acao === "prof_reembolsar") {
      const c = await buscarCobranca(body.cobranca_id);
      const { m, p } = await matriculaDoPainel(c.paciente_id);
      if (!podeMexerNaCobranca(p, c)) falhar("sem_permissao", 403);
      if (c.status !== "paga") falhar("nao_reembolsavel");
      if (c.forma !== "mp" || !c.mp_payment_id) falhar("sem_transacao_mp");
      const mpId = String(c.mp_payment_id);
      if (simulado(mpId)) {
        if (schema !== "staging") falhar("nao_reembolsavel");
        await db.from("cobrancas").update({ status: "cancelada", mp_status: "refunded", reembolsado_em: new Date().toISOString() }).eq("id", c.id);
        return json({ ok: true, simulado: true }, 200, origin);
      }
      const { status: st, body: ref } = await mpFetch<{ id?: number | string }>(credencial, `/v1/payments/${encodeURIComponent(mpId)}/refunds`, {
        method: "POST", body: JSON.stringify({}),
      });
      if (st >= 300) {
        log.erro({ codigo: "mp_reembolso_falhou", schema, acao, ref: c.id, status: st, externo: codigosDoMp(ref) });
        falhar("mp_error", 502, { status_mp: st });
      }
      const { status: sp, body: pay } = await mpFetch<PagamentoMp>(credencial, `/v1/payments/${encodeURIComponent(mpId)}`);
      if (sp === 200 && pay?.id) await aplicarPagamentoMp(db, c, pay, m, log, schema);
      else await db.from("cobrancas").update({ status: "cancelada", mp_status: "refunded", reembolsado_em: new Date().toISOString() }).eq("id", c.id);
      return json({ ok: true, refund_id: ref?.id ?? null }, 200, origin);
    }

    if (acao === "prof_comprovante") {
      const c = await buscarCobranca(body.cobranca_id);
      const { p } = await matriculaDoPainel(c.paciente_id);
      if (!podeVerCobranca(p, c) || !c.comprovante_path) falhar("not_found", 404);
      return json({ ok: true, url: await urlAssinada(c.comprovante_path!), pdf: /\.pdf$/i.test(c.comprovante_path!) }, 200, origin);
    }

    return erro("acao_invalida", 400, origin);
  } catch (e) {
    if (e instanceof ErroAcao) return erro(e.codigo, e.http, origin, e.extra);
    log.excecao(e, { acao, schema });
    return erro("erro_interno", 500, origin);
  }
});
