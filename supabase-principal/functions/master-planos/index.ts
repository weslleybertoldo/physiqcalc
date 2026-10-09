// Physiq W27 — master-planos (banco principal). Planos e regras do painel master (spec §4.7, C59, C62, R2; herdados W7b):
// tabela de preços por módulo × faixa (anual = 10×; o histórico sai pelo gatilho da W2), dias e limite do teste, dias grátis do
// app, o aviso "o Physiq mudou" (liga/desliga e textos — W3), os pratos prontos do aluno sem profissional (o mesmo lugar da carga
// scripts/conteudo/carregar_pratos_prontos.py) e a lista dos alunos do app (master_alunos_do_app, W7b). A adesão não existe (R2).
//
// POST, headers: Authorization: Bearer <access_token do principal> · x-schema: public|staging. Corpo: { acao, ... }
//   listar · salvar_preco {plano, faixa, valor_mensal, valor_anual?, ativo?} · salvar_config {chave, valor}
//   pratos · prato_salvar {prato} · buscar_alimentos {termo} · alunos_app {pagina?, busca?}
// 200 → { ok: true, ... } · 401 sem login · 403 quem não é master · 4xx { ok: false, erro }.
// verify_jwt = true. Publicar:  scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions master-planos true
// hml-14d (B21 · D28): `alunos_app {pagina?, busca?}` — com `pagina` (inteiro ≥ 1) a RPC recebe p_offset/p_limite (20 por página) e a
// busca, e devolve só a página + `total`; SEM `pagina`, a chamada de hoje (a busca sozinha não muda nada).
import { FAIXAS, PLANOS } from "../_shared/master-regras.ts";
import { json, responder, rpc, servir } from "../_shared/master-porta.ts";

/** hml-14d (B21): a página pedida — sem o campo (ou null) = a chamada de hoje (null); inteiro ≥ 1 (número ou texto) = a página. */
const POR_PAGINA = 20;
function lerPagina(v: unknown): number | null | "invalida" {
  if (v === undefined || v === null) return null;
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 1_000_000 ? n : "invalida";
}

servir("master-planos", async (c) => {
  const { corpo, origin } = c;
  switch (String(corpo.acao ?? "")) {
    case "listar":
      return responder(await rpc(c.comoPessoa, "master_planos", {}), origin);
    case "salvar_preco": {
      const plano = String(corpo.plano ?? "");
      const faixa = String(corpo.faixa ?? "");
      if (!(PLANOS as readonly string[]).includes(plano) || !(FAIXAS as readonly string[]).includes(faixa)) return json({ ok: false, erro: "plano_invalido" }, 400, origin);
      const anual = corpo.valor_anual === null || corpo.valor_anual === undefined || corpo.valor_anual === "" ? null : Number(corpo.valor_anual);
      return responder(await rpc(c.comoPessoa, "master_salvar_preco", {
        p_plano: plano, p_faixa: faixa, p_valor_mensal: Number(corpo.valor_mensal), p_valor_anual: anual, p_ativo: corpo.ativo !== false,
      }), origin);
    }
    case "salvar_config":
      return responder(await rpc(c.comoPessoa, "master_salvar_config", { p_chave: String(corpo.chave ?? ""), p_valor: corpo.valor ?? null }), origin);
    case "pratos":
      return responder(await rpc(c.comoPessoa, "master_pratos_prontos", {}), origin);
    case "prato_salvar":
      if (!corpo.prato || typeof corpo.prato !== "object") return json({ ok: false, erro: "prato_invalido" }, 400, origin);
      return responder(await rpc(c.comoPessoa, "master_prato_salvar", { p_prato: corpo.prato }), origin);
    case "buscar_alimentos":
      return responder(await rpc(c.comoPessoa, "master_buscar_alimentos", { p_termo: String(corpo.termo ?? "").slice(0, 60) }), origin);
    case "alunos_app": {
      const pagina = lerPagina(corpo.pagina);
      if (pagina === "invalida") return json({ ok: false, erro: "pagina_invalida" }, 400, origin);
      if (pagina === null) return responder(await rpc(c.comoPessoa, "master_alunos_do_app", {}), origin);
      return responder(await rpc(c.comoPessoa, "master_alunos_do_app", {
        p_offset: (pagina - 1) * POR_PAGINA, p_limite: POR_PAGINA, p_busca: typeof corpo.busca === "string" ? corpo.busca.slice(0, 80) : null,
      }), origin);
    }
    default:
      return json({ ok: false, erro: "acao_invalida" }, 400, origin);
  }
});
