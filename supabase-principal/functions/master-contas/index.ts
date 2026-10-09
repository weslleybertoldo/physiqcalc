// Physiq W27 — master-contas (banco principal). As ações do painel master sobre CONTAS e ALUNOS (spec §4.7: Visão geral, Contas,
// Alunos, Integrações; C55–C57, C60, N-5, N-8, N-22, P7, R6). A regra mora no banco (master_* da migração
// 20261002010000_w27_master.sql e as das W4/W13 que ela reaproveita); aqui sai o que é do servidor: criar o login do
// profissional (e-mail + senha, ou pronto para o Google), cancelar no Mercado Pago o que a regra pede (Pix aberto com o preço
// antigo e o valor da assinatura ao mudar o plano; a assinatura do app de quem vai para um profissional).
//
// POST, headers: Authorization: Bearer <access_token do principal> · x-schema: public|staging. Corpo: { acao, ... }
//   visao_geral · listar {filtros, pagina?} · detalhe {conta_id} · acao {conta_id, tipo, args} · criar {email, nome, nome_conta, tipo,
//   registro?, plano, faixa, isentar?, motivo?, modo: senha|google, senha?} · tornar_master {user_id} · integracoes {pagina?}
//   alunos {filtros, offset, limite} · sem_conta {busca, pagina?} · mover {pacientes, usuarios, conta_id, personal_id, nutricionista_id}
//   bloquear_aluno / desbloquear_aluno {paciente_id, mensagem?}
// 200 → { ok: true, ... } · 401 sem login · 403 quem não é master · 4xx { ok: false, erro } (a tela traduz).
// verify_jwt = true. Publicar:  scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions master-contas true
// Segredos: MP_ACCESS_TOKEN_PROD/_TEST (+ os automáticos).
// hml-10 (H-24, H-26): o log é o do contexto (c.log, criado pela master-porta com o nome desta função); o catch final também
// mora lá (avisa e devolve o mesmo 500).
// hml-14 (H-32): um prazo por pedido (ORCAMENTO_MS.usuario) em toda ida ao MP. Troca de plano: lê o Pix aberto e a assinatura
// ANTES da master_conta_acao (leitura que falha lança: 500 e nada muda) e cada gravação confere o erro; o plano e a faixa da
// assinatura vêm da conta que a RPC devolve (antes a releitura com erro gravava só o valor e a próxima cobrança no cartão
// voltava a conta ao plano antigo).
// hml-14d (B21 · D28): `listar {filtros, pagina?}`, `integracoes {pagina?}` e `sem_conta {busca?, pagina?}` — com `pagina` (inteiro
// ≥ 1) a RPC recebe p_offset/p_limite (20 por página) e devolve só a página + `total` (a busca de Contas vai nos filtros, ao
// banco); SEM `pagina` a RPC é chamada exatamente como antes (o APK antigo e a tela de produção). `alunos` não muda (a tela
// manda limite 20).
import { MpIndisponivel, credencialDoSchema, mpFetch, type OpcoesMp } from "../_shared/cobranca-mp.ts";
import { mpTransitorio } from "../_shared/cobranca-regras.ts";
import { cancelarAssinaturasDoAppEncerrado } from "../_shared/app-sem-profissional.ts";
import { ehAcaoConta, ehUuid, idsDe, lerPedidoCriarConta } from "../_shared/master-regras.ts";
import { json, responder, rpc, servir, type Contexto } from "../_shared/master-porta.ts";
import { ORCAMENTO_MS, prazo } from "../_shared/tempo.ts";

const simulado = (id: string | null | undefined) => !!id && id.startsWith("sim-");

/** hml-14d (B21): a página pedida — sem o campo (ou null) = a chamada de hoje (null); inteiro ≥ 1 (número ou texto) = a página. */
const POR_PAGINA = 20;
function lerPagina(v: unknown): number | null | "invalida" {
  if (v === undefined || v === null) return null;
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 1_000_000 ? n : "invalida";
}
const daPagina = (pagina: number) => ({ p_offset: (pagina - 1) * POR_PAGINA, p_limite: POR_PAGINA });
const textoDaBusca = (v: unknown) => (typeof v === "string" ? v.slice(0, 80) : null);

/** O que a troca de plano lê ANTES de mexer: o Pix aberto (com o preço antigo) e a assinatura no cartão. Erro do banco lança. */
interface LidoDoPlano {
  abertos: Array<{ id: string; mp_payment_id: string | null }>;
  assinatura: { id: string; mp_preapproval_id: string | null; status: string } | null;
}

async function lerAntesDoPlano(c: Contexto, contaId: string): Promise<LidoDoPlano> {
  const { data: abertos, error } = await c.db.from("conta_faturas").select("id, mp_payment_id").eq("conta_id", contaId).eq("forma", "pix")
    .in("status", ["pending", "in_process"]);
  if (error) throw error;
  const { data: a, error: erroAssinatura } = await c.db.from("conta_assinaturas").select("id, mp_preapproval_id, status").eq("conta_id", contaId).maybeSingle();
  if (erroAssinatura) throw erroAssinatura;
  return {
    abertos: (abertos ?? []) as LidoDoPlano["abertos"],
    assinatura: (a as LidoDoPlano["assinatura"]) ?? null,
  };
}

/**
 * Mudou o plano: fecha o Pix aberto com o preço antigo e leva o valor novo (com o plano e a faixa) à assinatura no cartão (a
 * regra do cobranca-conta). `novo` = a conta que a master_conta_acao devolveu. Erro do banco lança.
 */
async function efeitosDoPlano(
  c: Contexto,
  lido: LidoDoPlano,
  novo: { plano: unknown; faixa: unknown; valor: number | null },
  opcoes: OpcoesMp,
): Promise<Record<string, unknown>> {
  const credencial = credencialDoSchema(c.schema);
  // sem plano e faixa a assinatura ficaria com os antigos (a próxima cobrança desfaria a troca): para antes de ir ao MP
  if (typeof novo.plano !== "string" || !novo.plano || typeof novo.faixa !== "string" || !novo.faixa) throw new Error("conta_sem_plano");
  const saida: Record<string, unknown> = { pix_cancelados: 0, assinatura_atualizada: null };
  for (const f of lido.abertos) {
    if (f.mp_payment_id && !simulado(f.mp_payment_id)) {
      const { status } = await mpFetch(credencial, `/v1/payments/${encodeURIComponent(f.mp_payment_id)}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) }, opcoes);
      // o MP sem resposta que decida (fora do ar, limite, prazo esgotado): a fatura fica aberta no banco, como no MP (e avisa)
      if (mpTransitorio(status)) throw new MpIndisponivel(status);
    }
    const { error } = await c.db.from("conta_faturas").update({ status: "cancelled" }).eq("id", f.id);
    if (error) throw error;
    saida.pix_cancelados = Number(saida.pix_cancelados) + 1;
  }
  const ass = lido.assinatura;
  if (ass?.mp_preapproval_id && ["authorized", "pending", "paused"].includes(ass.status) && novo.valor) {
    let ok = true;
    if (!simulado(ass.mp_preapproval_id)) {
      const { status } = await mpFetch(credencial, `/preapproval/${encodeURIComponent(ass.mp_preapproval_id)}`, {
        method: "PUT", body: JSON.stringify({ auto_recurring: { transaction_amount: novo.valor } }),
      }, opcoes);
      ok = status < 300;
    }
    if (ok) {
      const { error } = await c.db.from("conta_assinaturas").update({ valor: novo.valor, plano: novo.plano, faixa: novo.faixa }).eq("id", ass.id);
      if (error) throw error;
    }
    saida.assinatura_atualizada = ok;
  }
  return saida;
}

/** N-8: o login do profissional. Já existe → usa o mesmo (nunca troca a senha de ninguém). Novo → e-mail + senha ou só o e-mail (Google). */
async function garantirLogin(c: Contexto, email: string, nome: string, senha: string | null): Promise<{ id: string; criado: boolean } | { erro: string }> {
  const achado = await rpc(c.db, "w27_usuario_por_email", { p_email: email });
  if (typeof achado.id === "string") return { id: achado.id, criado: false };
  const { data, error } = await c.authAdmin.auth.admin.createUser({
    email, email_confirm: true, user_metadata: { full_name: nome }, ...(senha ? { password: senha } : {}),
  });
  if (error || !data?.user) {
    c.log.excecao(error, { codigo: "criar_login_falhou", schema: c.schema, acao: "criar" });
    return { erro: "erro_criar_login" };
  }
  return { id: data.user.id, criado: true };
}

servir("master-contas", async (c) => {
  const p = prazo(ORCAMENTO_MS.usuario); // hml-14 (H-32): o prazo do pedido — vai em toda ida ao MP ({ prazo: p })
  const { corpo, origin } = c;
  const acao = String(corpo.acao ?? "");
  switch (acao) {
    case "visao_geral":
      return responder(await rpc(c.comoPessoa, "master_visao_geral", {}), origin);
    case "listar": {
      const filtros = corpo.filtros && typeof corpo.filtros === "object" ? (corpo.filtros as Record<string, unknown>) : {};
      const pagina = lerPagina(corpo.pagina);
      if (pagina === "invalida") return json({ ok: false, erro: "pagina_invalida" }, 400, origin);
      if (pagina === null) return responder(await rpc(c.comoPessoa, "master_contas", { p_filtros: filtros }), origin);
      // hml-14d (B21): a página do banco, com a busca da tela nos filtros (sem acento e literal lá na RPC)
      return responder(await rpc(c.comoPessoa, "master_contas", {
        p_filtros: { ...filtros, busca: textoDaBusca(filtros.busca) }, ...daPagina(pagina),
      }), origin);
    }
    case "integracoes": {
      const pagina = lerPagina(corpo.pagina);
      if (pagina === "invalida") return json({ ok: false, erro: "pagina_invalida" }, 400, origin);
      return responder(await rpc(c.comoPessoa, "master_integracoes", pagina === null ? {} : daPagina(pagina)), origin);
    }
    case "detalhe": {
      if (!ehUuid(corpo.conta_id)) return json({ ok: false, erro: "conta_inexistente" }, 404, origin);
      return responder(await rpc(c.comoPessoa, "master_conta_detalhe", { p_conta: corpo.conta_id }), origin);
    }
    case "acao": {
      if (!ehUuid(corpo.conta_id)) return json({ ok: false, erro: "conta_inexistente" }, 404, origin);
      if (!ehAcaoConta(corpo.tipo)) return json({ ok: false, erro: "acao_invalida" }, 400, origin);
      const args = corpo.args && typeof corpo.args === "object" ? corpo.args : {};
      // hml-14 (H-32): troca de plano lê ANTES de mexer (a RPC grava o plano novo): a leitura que falha lança aqui (500) e nada muda
      const lido = corpo.tipo === "plano" ? await lerAntesDoPlano(c, String(corpo.conta_id)) : null;
      const r = await rpc(c.comoPessoa, "master_conta_acao", { p_conta: corpo.conta_id, p_acao: corpo.tipo, p_args: args });
      if (lido && r.ok === true && r.sem_mudanca !== true) {
        try {
          const conta = (r.conta ?? {}) as Record<string, unknown>;
          const valor = Number(conta.valor_mensal ?? 0) || null;
          r.efeitos = await efeitosDoPlano(c, lido, { plano: conta.plano, faixa: conta.faixa, valor }, { prazo: p });
        } catch (e) {
          c.log.excecao(e, { codigo: "efeitos_do_plano_falhou", schema: c.schema, acao, ref: String(corpo.conta_id) });
          r.efeitos = { erro: "mp" };
        }
      }
      return responder(r, origin);
    }
    case "criar": {
      const lido = lerPedidoCriarConta(corpo, c.schema);
      if (!lido.ok) return json({ ok: false, erro: lido.erro }, 400, origin);
      const p = lido.pedido;
      const login = await garantirLogin(c, p.email, p.nome, p.senha);
      if ("erro" in login) return json({ ok: false, erro: login.erro }, 400, origin);
      const r = await rpc(c.comoPessoa, "master_criar_conta", {
        p_user: login.id, p_nome: p.nome_conta, p_tipo: p.tipo, p_registro: p.registro, p_plano: p.plano, p_faixa: p.faixa,
        p_isentar: p.isentar, p_motivo: p.motivo,
      });
      if (r.ok !== true && login.criado) {
        // a conta não saiu: o login criado agora não fica sobrando
        await c.authAdmin.auth.admin.deleteUser(login.id).catch(() => undefined);
      }
      return responder({ ...r, user_id: login.id, login_criado: login.criado, modo: p.modo, email: p.email }, origin);
    }
    case "tornar_master": {
      if (!ehUuid(corpo.user_id)) return json({ ok: false, erro: "usuario_inexistente" }, 404, origin);
      return responder(await rpc(c.comoPessoa, "master_tornar_master", { p_user: corpo.user_id }), origin);
    }
    case "alunos": {
      const filtros = corpo.filtros && typeof corpo.filtros === "object" ? (corpo.filtros as Record<string, unknown>) : {};
      if (filtros.conta_id && !ehUuid(filtros.conta_id)) delete filtros.conta_id;
      return responder(await rpc(c.comoPessoa, "master_alunos", {
        p_filtros: filtros, p_offset: Number(corpo.offset) || 0, p_limite: Number(corpo.limite) || 50,
      }), origin);
    }
    case "sem_conta": {
      const pagina = lerPagina(corpo.pagina);
      if (pagina === "invalida") return json({ ok: false, erro: "pagina_invalida" }, 400, origin);
      const busca = textoDaBusca(corpo.busca);
      return responder(await rpc(c.comoPessoa, "master_sem_conta", pagina === null ? { p_busca: busca } : { p_busca: busca, ...daPagina(pagina) }), origin);
    }
    case "mover": {
      if (!ehUuid(corpo.conta_id)) return json({ ok: false, erro: "conta_inexistente" }, 404, origin);
      const r = await rpc(c.comoPessoa, "master_mover_alunos", {
        p_pacientes: idsDe(corpo.pacientes), p_usuarios: idsDe(corpo.usuarios), p_conta: corpo.conta_id,
        p_personal: ehUuid(corpo.personal_id) ? corpo.personal_id : null, p_nutri: ehUuid(corpo.nutricionista_id) ? corpo.nutricionista_id : null,
      });
      // quem saiu do app (aluno sem profissional) para um profissional: a assinatura do app no Mercado Pago é cancelada (W7b)
      const enc = Array.isArray(r.app_encerrados) ? (r.app_encerrados as string[]) : [];
      if (enc.length) {
        let canceladas = 0;
        let falhas = 0;
        for (const uid of enc) {
          try {
            const s = await cancelarAssinaturasDoAppEncerrado(c.db, credencialDoSchema(c.schema), uid, "vinculou_profissional", c.log, { prazo: p });
            canceladas += s.canceladas;
            falhas += s.falhas;
          } catch (e) {
            // hml-14 (H-32): o cancelamento agora lança no erro do banco e no MP sem resposta — registra e avisa (antes calava)
            c.log.excecao(e, { codigo: "cancelar_assinatura_do_app", schema: c.schema, acao, ref: uid });
            falhas++;
          }
        }
        r.assinatura_app = { canceladas, falhas };
      }
      return responder(r, origin);
    }
    case "bloquear_aluno":
    case "desbloquear_aluno": {
      if (!ehUuid(corpo.paciente_id)) return json({ ok: false, erro: "aluno_inexistente" }, 404, origin);
      return responder(await rpc(c.comoPessoa, "aluno_bloquear", {
        p_paciente: corpo.paciente_id, p_bloquear: acao === "bloquear_aluno",
        p_msg: typeof corpo.mensagem === "string" ? corpo.mensagem.slice(0, 300) : null,
      }), origin);
    }
    default:
      return json({ ok: false, erro: "acao_invalida" }, 400, origin);
  }
});
