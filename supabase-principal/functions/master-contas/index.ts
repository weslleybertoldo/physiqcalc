// Physiq W27 — master-contas (banco principal). As ações do painel master sobre CONTAS e ALUNOS (spec §4.7: Visão geral, Contas,
// Alunos, Integrações; C55–C57, C60, N-5, N-8, N-22, P7, R6). A regra mora no banco (master_* da migração
// 20261002010000_w27_master.sql e as das W4/W13 que ela reaproveita); aqui sai o que é do servidor: criar o login do
// profissional (e-mail + senha, ou pronto para o Google), cancelar no Mercado Pago o que a regra pede (Pix aberto com o preço
// antigo e o valor da assinatura ao mudar o plano; a assinatura do app de quem vai para um profissional).
//
// POST, headers: Authorization: Bearer <access_token do principal> · x-schema: public|staging. Corpo: { acao, ... }
//   visao_geral · listar {filtros} · detalhe {conta_id} · acao {conta_id, tipo, args} · criar {email, nome, nome_conta, tipo,
//   registro?, plano, faixa, isentar?, motivo?, modo: senha|google, senha?} · tornar_master {user_id} · integracoes
//   alunos {filtros, offset, limite} · sem_conta {busca} · mover {pacientes, usuarios, conta_id, personal_id, nutricionista_id}
//   bloquear_aluno / desbloquear_aluno {paciente_id, mensagem?}
// 200 → { ok: true, ... } · 401 sem login · 403 quem não é master · 4xx { ok: false, erro } (a tela traduz).
// verify_jwt = true. Publicar:  scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions master-contas true
// Segredos: MP_ACCESS_TOKEN_PROD/_TEST (+ os automáticos).
// hml-10 (H-24, H-26): o log é o do contexto (c.log, criado pela master-porta com o nome desta função); o catch final também
// mora lá (avisa e devolve o mesmo 500).
import { credencialDoSchema, mpFetch } from "../_shared/cobranca-mp.ts";
import { cancelarAssinaturasDoAppEncerrado } from "../_shared/app-sem-profissional.ts";
import { ehAcaoConta, ehUuid, idsDe, lerPedidoCriarConta } from "../_shared/master-regras.ts";
import { json, responder, rpc, servir, type Contexto } from "../_shared/master-porta.ts";

const simulado = (id: string | null | undefined) => !!id && id.startsWith("sim-");

/** Mudou o plano: fecha o Pix aberto com o preço antigo e leva o valor novo à assinatura no cartão (a regra do cobranca-conta). */
async function efeitosDoPlano(c: Contexto, contaId: string, valorNovo: number | null): Promise<Record<string, unknown>> {
  const credencial = credencialDoSchema(c.schema);
  const saida: Record<string, unknown> = { pix_cancelados: 0, assinatura_atualizada: null };
  const { data: abertos } = await c.db.from("conta_faturas").select("id, mp_payment_id").eq("conta_id", contaId).eq("forma", "pix")
    .in("status", ["pending", "in_process"]);
  for (const f of (abertos ?? []) as Array<{ id: string; mp_payment_id: string | null }>) {
    if (f.mp_payment_id && !simulado(f.mp_payment_id)) {
      await mpFetch(credencial, `/v1/payments/${encodeURIComponent(f.mp_payment_id)}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
    }
    await c.db.from("conta_faturas").update({ status: "cancelled" }).eq("id", f.id);
    saida.pix_cancelados = Number(saida.pix_cancelados) + 1;
  }
  const { data: a } = await c.db.from("conta_assinaturas").select("id, mp_preapproval_id, status").eq("conta_id", contaId).maybeSingle();
  const ass = a as { id: string; mp_preapproval_id: string | null; status: string } | null;
  if (ass?.mp_preapproval_id && ["authorized", "pending", "paused"].includes(ass.status) && valorNovo) {
    let ok = true;
    if (!simulado(ass.mp_preapproval_id)) {
      const { status } = await mpFetch(credencial, `/preapproval/${encodeURIComponent(ass.mp_preapproval_id)}`, {
        method: "PUT", body: JSON.stringify({ auto_recurring: { transaction_amount: valorNovo } }),
      });
      ok = status < 300;
    }
    if (ok) {
      const { data: conta } = await c.db.from("contas").select("plano, faixa").eq("id", contaId).maybeSingle();
      await c.db.from("conta_assinaturas").update({ valor: valorNovo, plano: (conta as { plano?: string } | null)?.plano, faixa: (conta as { faixa?: string } | null)?.faixa })
        .eq("id", ass.id);
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
  const { corpo, origin } = c;
  const acao = String(corpo.acao ?? "");
  switch (acao) {
    case "visao_geral":
      return responder(await rpc(c.comoPessoa, "master_visao_geral", {}), origin);
    case "listar":
      return responder(await rpc(c.comoPessoa, "master_contas", { p_filtros: corpo.filtros && typeof corpo.filtros === "object" ? corpo.filtros : {} }), origin);
    case "integracoes":
      return responder(await rpc(c.comoPessoa, "master_integracoes", {}), origin);
    case "detalhe": {
      if (!ehUuid(corpo.conta_id)) return json({ ok: false, erro: "conta_inexistente" }, 404, origin);
      return responder(await rpc(c.comoPessoa, "master_conta_detalhe", { p_conta: corpo.conta_id }), origin);
    }
    case "acao": {
      if (!ehUuid(corpo.conta_id)) return json({ ok: false, erro: "conta_inexistente" }, 404, origin);
      if (!ehAcaoConta(corpo.tipo)) return json({ ok: false, erro: "acao_invalida" }, 400, origin);
      const args = corpo.args && typeof corpo.args === "object" ? corpo.args : {};
      const r = await rpc(c.comoPessoa, "master_conta_acao", { p_conta: corpo.conta_id, p_acao: corpo.tipo, p_args: args });
      if (r.ok === true && corpo.tipo === "plano" && r.sem_mudanca !== true) {
        try {
          const valor = Number((r.conta as Record<string, unknown> | undefined)?.valor_mensal ?? 0) || null;
          r.efeitos = await efeitosDoPlano(c, String(corpo.conta_id), valor);
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
    case "sem_conta":
      return responder(await rpc(c.comoPessoa, "master_sem_conta", { p_busca: typeof corpo.busca === "string" ? corpo.busca.slice(0, 80) : null }), origin);
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
            const s = await cancelarAssinaturasDoAppEncerrado(c.db, credencialDoSchema(c.schema), uid, "vinculou_profissional", c.log);
            canceladas += s.canceladas;
            falhas += s.falhas;
          } catch {
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
