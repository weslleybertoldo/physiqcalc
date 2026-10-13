// Physiq hml-21a (H-43 · jeito 2, etapa 3, 12/10/2026) — conta (banco principal): tudo o que sobra do principal no navegador passa por aqui,
// com a SESSÃO de quem chama (_shared/porta-pessoa.ts: cliente "como a pessoa", nenhuma chave secreta). O RLS e as RPCs de hoje continuam
// decidindo quem lê e quem grava (2ª camada); a função confere a FORMA. Nesta W (21a): a casca (o sino, o aviso de membro removido, a
// situação, o aviso de mudança, a senha provisória, o push, o aceite dos textos e o onboarding) e o app do aluno (o Perfil, a Conta com a
// foto pelo link assinado, a Agenda, o Meu plano e os pratos prontos do aluno sem profissional). A 21b (Agenda, Alunos, Dashboard) e a 21c
// (Aluno › Resumo, Configurações, Mensagens, Lixeira) acrescentam módulos.
//   ler        as leituras em lote ({ acao: "ler", itens: [{ q, ...params }] } → { ok: true, itens } na mesma ordem; até 16 itens, erro POR
//              ITEM) pelo motor comum (_shared/leitura-servidor.ts, H-112) com o catálogo _shared/conta-leituras.ts. O token do `ler` é
//              conferido pelo JWKS do principal na porta (jwtLeitura: "jwks", H-109) — sem a ida ao Auth; as gravações seguem no getUser.
//   casca.ts   avisos_marcar_lidos, aviso_membro_ok, aviso_mudanca_marcar, senha_definida, push_registrar, push_esquecer, aceitar_textos,
//              criar_minha_conta, entrar_sem_profissional
//   app.ts     perfil_nome, perfil_foto_preparar, perfil_foto_salvar, perfil_foto_tirar, mudar_objetivo_app
//   agenda.ts  (hml-21b) agenda_garantir, tags_garantir, calendario_criar|editar|excluir, tag_criar|editar|excluir,
//              agendamento_criar|editar|excluir, bloqueio_criar|excluir, trava_criar|excluir, regras_salvar e a Agenda do aluno
//              (agenda_confirmar|desistir|reagendar|marcar)
//   alunos.ts  (hml-21b) pacote_definir — as outras ações dos Alunos seguem pela função alunos
// O despacho (moduloDoPedido, em _shared/conta-regras.ts) é a lista fechada: ação de fora → 400 acao_invalida.
//
// POST, headers: Authorization: Bearer <access_token do principal> · x-schema: public|staging. Corpo: { acao, ... }
// 200 → { ok: true, ... } (itens, no `ler` · marcados · resultado — o valor da RPC como veio · bucket/caminho/token · url) · 4xx/5xx →
// { ok: false, erro }. Freio: 240 pedidos/min por pessoa (nesta instância, em cada schema).
// verify_jwt = true. Publicar (vale nos 2 schemas: o schema vem do x-schema; função NOVA — a volta é apagar):
//   scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions conta true
// Não precisa de migration: as tabelas (avisos, profiles), as RPCs, as policies, o bucket fotos-perfil(-staging) com as policies da pasta
// própria (20260929120000_w05_equipe) e os grants de hoje — cada pessoa lê e grava o que já lia e gravava, agora pela função.
// hml-21b: a v2 (= a v1 + a Agenda e os Alunos) PRECISA da migration 20261013100000_hml21b_agenda_atomicas (as RPCs
// agenda_excluir_calendario e agenda_garantir_inicio) aplicada no schema ANTES de publicar (o calendario_excluir e o agenda_garantir as chamam).
import { json, servirComoPessoa, type ContextoPessoa } from "../_shared/porta-pessoa.ts";
import { CATALOGO_CONTA } from "../_shared/conta-leituras.ts";
import { moduloDoPedido, statusDoErroConta, type PedidoConta } from "../_shared/conta-regras.ts";
import { atenderLeitura } from "../_shared/leitura-servidor.ts";
import { atenderAgenda } from "./agenda.ts";
import { atenderAlunos } from "./alunos.ts";
import { atenderApp } from "./app.ts";
import { atenderCasca } from "./casca.ts";

/** O módulo da área atende a ação (cada um devolve { ok: true, … } ou { ok: false, erro }). */
function atender(c: ContextoPessoa, pedido: PedidoConta) {
  switch (pedido.modulo) {
    case "leitura":
      return atenderLeitura(c, CATALOGO_CONTA);
    case "casca":
      return atenderCasca(c, pedido.acao);
    case "app":
      return atenderApp(c, pedido.acao);
    case "agenda":
      return atenderAgenda(c, pedido.acao);
    case "alunos":
      return atenderAlunos(c, pedido.acao);
  }
}

servirComoPessoa("conta", { freio: 240, jwtLeitura: "jwks" }, async (c) => {
  const pedido = moduloDoPedido(c.corpo);
  if (!pedido) {
    c.log.aviso({ codigo: "acao_invalida", schema: c.schema });
    return json({ ok: false, erro: "acao_invalida" }, 400, c.origin);
  }
  const r = await atender(c, pedido);
  return json(r, r.ok ? 200 : statusDoErroConta(r.erro), c.origin);
});
