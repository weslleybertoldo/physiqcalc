// Physiq W27 — master-financeiro (banco principal). O Financeiro do painel master (spec §4.7, C58, N-74/R18): faturas e
// situação das contas com filtros (vencidas, na tolerância, em teste, isentas, em dia, legadas), registrar pagamento feito por
// fora (a mesma regra do Pix/cartão: aplicar_pagamento_conta da W4), cancelar a cobrança automática no cartão (Mercado Pago) e
// reenviar o aviso do plano ao dono (sino do painel). Isenção, vencimento, liberar, mudar plano e bloquear os alunos ficam em
// master-contas (as mesmas ações aparecem nas 2 telas). Contas legadas: "Cobrança legada até a virada" (W28).
//
// POST, headers: Authorization: Bearer <access_token do principal> · x-schema: public|staging. Corpo: { acao, ... }
//   listar {filtro, pagina?} · registrar_pagamento {conta_id, valor, meses, pago_em?, descricao?} · cancelar_assinatura {conta_id}
//   reenviar_aviso {conta_id, mensagem?}
// 200 → { ok: true, ... } · 401 sem login · 403 quem não é master · 4xx { ok: false, erro }.
// verify_jwt = true. Publicar:  scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions master-financeiro true
// Segredos: MP_ACCESS_TOKEN_PROD/_TEST (+ os automáticos).
// hml-14 (H-32): um prazo por pedido (ORCAMENTO_MS.usuario) na ida ao MP; a leitura da assinatura e as gravações conferem o erro
// (antes a leitura com erro respondia 400 "sem_assinatura" e o master lia que não havia cobrança automática).
// hml-14d (B21 · D28): `listar {filtro, pagina?}` — com `pagina` (inteiro ≥ 1) a RPC recebe p_offset/p_limite (20 por página) e
// devolve só a página das contas + `total` e `faturas_total` (o chip "Faturas recentes"); SEM `pagina`, a chamada de hoje.
import { credencialDoSchema, espelhoAssinatura, mpFetch } from "../_shared/cobranca-mp.ts";
import type { AssinaturaMp } from "../_shared/cobranca-regras.ts";
import { ehUuid, textoDoAvisoDePlano } from "../_shared/master-regras.ts";
import { json, responder, rpc, servir } from "../_shared/master-porta.ts";
import { ORCAMENTO_MS, prazo } from "../_shared/tempo.ts";

const simulado = (id: string | null | undefined) => !!id && id.startsWith("sim-");

/** hml-14d (B21): a página pedida — sem o campo (ou null) = a chamada de hoje (null); inteiro ≥ 1 (número ou texto) = a página. */
const POR_PAGINA = 20;
function lerPagina(v: unknown): number | null | "invalida" {
  if (v === undefined || v === null) return null;
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 1_000_000 ? n : "invalida";
}

servir("master-financeiro", async (c) => {
  const p = prazo(ORCAMENTO_MS.usuario); // hml-14 (H-32): o prazo do pedido — vai na ida ao MP ({ prazo: p })
  const { corpo, origin } = c;
  const acao = String(corpo.acao ?? "");
  if (acao === "listar") {
    const filtro = typeof corpo.filtro === "string" ? corpo.filtro.slice(0, 20) : "todas";
    const pagina = lerPagina(corpo.pagina);
    if (pagina === "invalida") return json({ ok: false, erro: "pagina_invalida" }, 400, origin);
    if (pagina === null) return responder(await rpc(c.comoPessoa, "master_financeiro", { p_filtro: filtro }), origin);
    return responder(await rpc(c.comoPessoa, "master_financeiro", {
      p_filtro: filtro, p_offset: (pagina - 1) * POR_PAGINA, p_limite: POR_PAGINA,
    }), origin);
  }
  if (!ehUuid(corpo.conta_id)) return json({ ok: false, erro: "conta_inexistente" }, 404, origin);
  const contaId = String(corpo.conta_id);

  if (acao === "registrar_pagamento") {
    const pagoEm = typeof corpo.pago_em === "string" && /^\d{4}-\d{2}-\d{2}$/.test(corpo.pago_em) ? corpo.pago_em : null;
    return responder(await rpc(c.comoPessoa, "master_registrar_pagamento", {
      p_conta: contaId, p_valor: Number(corpo.valor), p_meses: Number(corpo.meses) || 1, p_pago_em: pagoEm,
      p_descricao: typeof corpo.descricao === "string" ? corpo.descricao.slice(0, 200) : null,
    }), origin);
  }

  // as ações abaixo leem a conta pelo master (a mesma linha das telas) e mexem como o servidor
  const det = await rpc(c.comoPessoa, "master_conta_detalhe", { p_conta: contaId });
  if (det.ok !== true) return responder(det, origin);
  const conta = det.conta as Record<string, unknown>;
  if (conta.eh_app === true) return json({ ok: false, erro: "conta_do_app" }, 400, origin);
  if (conta.cobranca_legada === true) return json({ ok: false, erro: "cobranca_legada", origem: conta.origem }, 400, origin);

  if (acao === "cancelar_assinatura") {
    const { data: a, error } = await c.db.from("conta_assinaturas").select("id, mp_preapproval_id, status, payload").eq("conta_id", contaId).maybeSingle();
    if (error) throw error;
    const ass = a as { id: string; mp_preapproval_id: string | null; status: string; payload: Record<string, unknown> | null } | null;
    if (!ass?.mp_preapproval_id || !["authorized", "pending", "paused"].includes(ass.status)) return json({ ok: false, erro: "sem_assinatura" }, 400, origin);
    if (!simulado(ass.mp_preapproval_id)) {
      const { status, body: pre } = await mpFetch<AssinaturaMp>(credencialDoSchema(c.schema), `/preapproval/${encodeURIComponent(ass.mp_preapproval_id)}`, {
        method: "PUT", body: JSON.stringify({ status: "cancelled" }),
      }, { prazo: p });
      if (status >= 300 || !pre?.id) return json({ ok: false, erro: "mp_error", status_mp: status }, 502, origin);
      const { error: erroCancelada } = await c.db.from("conta_assinaturas").update(espelhoAssinatura(pre, { ...(ass.payload ?? {}), cancelada_por: c.userId })).eq("id", ass.id);
      if (erroCancelada) throw erroCancelada;
    } else {
      const { error: erroCancelada } = await c.db.from("conta_assinaturas").update({ status: "cancelled" }).eq("id", ass.id);
      if (erroCancelada) throw erroCancelada;
    }
    const { error: erroEvento } = await c.db.from("conta_eventos").insert({ conta_id: contaId, tipo: "plano", antes: { assinatura: ass.status },
      depois: { assinatura: "cancelled", por: "master" }, por: c.userId });
    if (erroEvento) throw erroEvento;
    return json({ ok: true, cancelada: true }, 200, origin);
  }

  if (acao === "reenviar_aviso") {
    const dono = conta.dono as { id?: string } | null;
    if (!dono?.id) return json({ ok: false, erro: "sem_dono" }, 400, origin);
    const titulo = textoDoAvisoDePlano(conta as never, typeof corpo.mensagem === "string" ? corpo.mensagem : null);
    // o aviso vai para o sino do painel do dono (e o push do aparelho dele, se tiver — W20c); nenhum e-mail
    const { data: aviso, error } = await c.db.from("avisos").insert({ destino_user_id: dono.id, tipo: "geral", titulo, link: "/painel/configuracoes/plano" })
      .select("id, criado_em").single();
    if (error) throw error;
    // hml-14 (H-32): melhor esforço — o aviso já foi; um 500 aqui faria o master reenviar (aviso em dobro no sino do dono)
    const { error: erroEvento } = await c.db.from("conta_eventos").insert({ conta_id: contaId, tipo: "aviso", depois: { aviso_id: (aviso as { id: string }).id, titulo, por: "master" }, por: c.userId });
    if (erroEvento) c.log.excecao(erroEvento, { codigo: "evento_do_aviso_falhou", schema: c.schema, acao, ref: contaId });
    return json({ ok: true, aviso_id: (aviso as { id: string }).id, titulo }, 200, origin);
  }

  return json({ ok: false, erro: "acao_invalida" }, 400, origin);
});
