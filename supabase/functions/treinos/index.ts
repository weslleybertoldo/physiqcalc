// Physiq hml-21d (H-43 · jeito 2, etapa 3, 13/10/2026) — treinos (Banco do Treino): o que o navegador ainda lia e gravava DIRETO no Treino
// passa por aqui, com a SESSÃO do Treino de quem chama (_shared/porta-treino.ts: cliente "como a pessoa" — a chave anon do Treino + o token
// da trocar-token; nenhuma chave secreta). O RLS e as RPCs de hoje continuam decidindo quem lê e quem grava (2ª camada); a função confere a
// FORMA. As telas: o Painel › Treinos (Meus treinos, Detalhe, Biblioteca, Folha do exercício), a aba Treinos dos Modelos, a Busca (Ctrl K) dos
// treinos, a folha "Adicionar exercício" do editor (Aluno › Treino), o Master (Treinos prontos, Biblioteca), os Treinos prontos do aluno sem
// profissional e o espelho do perfil do professor (Configurações › Perfil).
//   ler           as leituras em lote ({ acao: "ler", itens: [{ q, ...params }] } → { ok: true, itens } na mesma ordem; até 16 itens, erro POR
//                 ITEM) pelo motor (a CÓPIA do motor comum do principal: _shared/leitura-lote.ts e _shared/leitura-servidor.ts) com o catálogo
//                 _shared/treinos-leituras.ts (e a consulta especial exercicios_lista). O token do `ler` é conferido pelo JWKS do Treino na
//                 porta (jwtLeitura: "jwks") — sem a ida ao Auth; as gravações seguem no getUser.
//   modelos.ts    modelo_criar|editar|excluir, modelo_exercicio_incluir|tirar|prescrever, modelo_ordenar (a RPC nova), pasta_criar|editar|
//                 excluir, pasta_vincular|desvincular
//   biblioteca.ts exercicio_criar|editar|excluir, exercicio_foto_preparar (o link de upload assinado), grupo_muscular_criar|excluir,
//                 professor_perfil
//   master.ts     treino_pronto_salvar (a RPC nova), treino_pronto_ativo, exercicio_global_criar|editar|excluir|promover,
//                 grupo_global_criar|excluir — SÓ o master (o papel do token, conferido ANTES do banco: quem não é → 403 sem_acesso);
//                 as leituras do Master (treinos_prontos_todos, exercicios_globais, grupos_globais, globais_do_grupo) também
// O despacho (moduloDoPedido, em _shared/treinos-regras.ts) é a lista fechada: ação de fora → 400 acao_invalida.
//
// POST, headers: Authorization: Bearer <access_token do TREINO> · x-schema: public|staging. Corpo: { acao, ... }
// 200 → { ok: true, ... } (itens, no `ler` · id · linha · n · bucket/caminho/token) · 4xx/5xx → { ok: false, erro }. Freio: 120 pedidos/min
// por pessoa (nesta instância, em cada schema).
// verify_jwt = true. Publicar (vale nos 2 schemas: o schema vem do x-schema; função NOVA — a volta é apagar):
//   scripts/deploy_function.sh uxwpwdbbnlticxgtzcsb supabase/functions treinos true
// PRECISA da migration supabase/migrations/20261013100000_hml21d_treinos_atomicas.sql (as RPCs treino_pronto_salvar e modelo_ordenar)
// aplicada no schema ANTES de publicar (as 2 ações chamam as RPCs). O resto: as tabelas, as RPCs de hoje (modelos_da_lista,
// exercicios_da_lista), as policies, o bucket exercicios(-staging) com a policy do professor e os grants de hoje — cada pessoa lê e grava
// o que já lia e gravava, agora pela função.
import { avisarErro } from "../_shared/avisar-erro.ts";
import { criarLog } from "../_shared/log.ts";
import { abrirPedidoNoTreino, json, schemaDoPedido, type ContextoTreino } from "../_shared/porta-treino.ts";
import { atenderLeituraDoTreino, pedeConsultaDoMaster } from "../_shared/treinos-leituras.ts";
import { moduloDoPedido, statusDoErroTreino, type PedidoTreinos } from "../_shared/treinos-regras.ts";
import { atenderBiblioteca } from "./biblioteca.ts";
import { atenderMaster } from "./master.ts";
import { atenderModelos } from "./modelos.ts";

const log = criarLog("treinos", { avisar: avisarErro });
const URL_DO_PROJETO = Deno.env.get("SUPABASE_URL") ?? "";

/** O módulo da área atende a ação (cada um devolve { ok: true, … } ou { ok: false, erro }). */
function atender(c: ContextoTreino, pedido: PedidoTreinos) {
  switch (pedido.modulo) {
    case "leitura":
      return atenderLeituraDoTreino(c);
    case "modelos":
      return atenderModelos(c, pedido.acao);
    case "biblioteca":
      return atenderBiblioteca(c, pedido.acao, URL_DO_PROJETO);
    case "master":
      return atenderMaster(c, pedido.acao);
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  let pedido: ContextoTreino | null = null;
  try {
    const c = await abrirPedidoNoTreino(req, "treinos", { freio: 120, jwtLeitura: "jwks" }, log);
    if (c instanceof Response) return c;
    pedido = c;
    const p = moduloDoPedido(c.corpo);
    if (!p) {
      log.aviso({ codigo: "acao_invalida", schema: c.schema });
      return json({ ok: false, erro: "acao_invalida" }, 400, origin);
    }
    // o Master: o papel do token ANTES do banco (N10) — as ações do Master e o `ler` que pede uma consulta do Master
    if (!c.master && (p.modulo === "master" || (p.modulo === "leitura" && pedeConsultaDoMaster(c.corpo)))) {
      log.aviso({ codigo: "sem_acesso", schema: c.schema, acao: p.acao });
      return json({ ok: false, erro: "sem_acesso" }, 403, origin);
    }
    const r = await atender(c, p);
    return json(r, r.ok === false ? statusDoErroTreino(r.erro) : 200, origin);
  } catch (e) {
    // hml-10 (D6): só o nome do erro, o código do Postgres e a mensagem limpa — e o aviso ao Weslley
    const acao = typeof pedido?.corpo.acao === "string" ? pedido.corpo.acao : null;
    log.excecao(e, { acao, schema: pedido?.schema ?? schemaDoPedido(req.headers.get("x-schema")) });
    return json({ ok: false, erro: "erro_interno" }, 500, origin);
  }
});
