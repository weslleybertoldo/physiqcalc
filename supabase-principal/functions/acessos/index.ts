// Physiq W-A P2 (jeito 2, 13/10/2026) — acessos (banco principal): a aba Acessos do Painel › Aluno (P4) lê e grava "o que o aluno pode no app"
// — o acesso ao app, o diário com fotos, o envio pelo link e a Dieta (ver | mexer). COMO A PESSOA (_shared/porta-pessoa.ts: o token de quem
// chama, nenhuma chave secreta); a regra de quem lê e de quem muda mora nas RPCs acessos_ler e acessos_salvar (migration
// 20261012200000_wa1_acessos.sql): qualquer profissional do aluno (w14_pode_editar), nunca o aluno. As séries do Treino NÃO passam aqui (a
// treino-acessos, no Banco do Treino). A FORMA (a ação, o aluno, a chave e o nível) é conferida antes (_shared/acessos-regras.ts).
// POST, headers: Authorization: Bearer <access_token do principal> · x-schema: public|staging. Corpo: { acao: "ler", aluno } ·
// { acao: "salvar", aluno, chave, valor }. 200 → { ok: true, paciente_id, tem_login, modulos, conta_modulos, tem_nutricionista, pode_mudar,
// linhas, mudancas } · 4xx/5xx → { ok: false, erro }. A leitura é sempre `acao: "ler"` (a Guarda dos E2E lê o corpo).
// Log: só código, ação, schema, o campo recusado e o código do Postgres (nunca o nome do aluno). verify_jwt = true. Publicar (vale nos 2 schemas):
//   scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions acessos true
// Precisa no banco, no schema do pedido: a migration 20261012200000_wa1_acessos.sql (sem ela, PGRST202 → 500 erro_interno + aviso).
import { json, servirComoPessoa, type ContextoPessoa } from "../_shared/porta-pessoa.ts";
import { chamadaDeAcessos, lerPedidoDeAcessos, statusDoErroAcessos, voltaDosAcessos } from "../_shared/acessos-regras.ts";
import { erroDoBanco } from "../_shared/nutricao-regras.ts";

type Resposta = { ok: true; [chave: string]: unknown } | { ok: false; erro: string };

async function atender(c: ContextoPessoa): Promise<Resposta> {
  const lido = lerPedidoDeAcessos(c.corpo);
  if (!lido.ok) {
    c.log.aviso({ codigo: lido.erro, schema: c.schema, acao: typeof c.corpo.acao === "string" ? c.corpo.acao : null, resultado: lido.campo ?? null });
    return { ok: false, erro: lido.erro };
  }
  const acao = lido.pedido.acao;
  const { rpc, args } = chamadaDeAcessos(lido.pedido);
  const { data, error } = await c.comoPessoa.rpc(rpc, args);
  if (error) {
    // o PostgREST recusou (42501 → sem_acesso; dado ruim → dados_invalidos) ou falhou (PGRST202 sem a migration, tempo → avisa o Weslley)
    const t = erroDoBanco(error);
    if (t.inesperado) c.log.excecao(error, { codigo: t.erro === "tempo_esgotado" ? "tempo_esgotado" : "banco_falhou", acao, schema: c.schema });
    else c.log.aviso({ codigo: t.erro, schema: c.schema, acao, pg: typeof error.code === "string" ? error.code : null });
    return { ok: false, erro: t.erro };
  }
  const v = voltaDosAcessos(data);
  if (v.ok === false) {
    if (v.inesperado) c.log.erro({ codigo: "rpc_inesperada", schema: c.schema, acao });
    else c.log.aviso({ codigo: v.erro, schema: c.schema, acao });
    return { ok: false, erro: v.erro };
  }
  return v;
}

servirComoPessoa("acessos", { freio: 120 }, async (c) => {
  const r = await atender(c);
  return json(r, r.ok ? 200 : statusDoErroAcessos(r.erro), c.origin);
});
