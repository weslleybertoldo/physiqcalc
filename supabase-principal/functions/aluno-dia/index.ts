// Physiq W-A P2 (jeito 2, 13/10/2026) — aluno-dia (banco principal): as ROTINAS (creatina, remédio, hábito…, com lembrete) e a DIETA LIVRE (o
// dia do aluno com a Dieta "Pode mexer") — o app do aluno (P3, P5) e o painel do profissional (P6). COMO A PESSOA (_shared/porta-pessoa.ts: o
// token de quem chama, nenhuma chave secreta): as RPCs das migrations 20261012210000_wa2_rotinas e 20261012220000_wa3_dieta_livre decidem quem
// pode (o dono e a matrícula saem do token e do banco, nunca do corpo); a FORMA é conferida antes (_shared/aluno-dia-regras.ts). Módulos por
// área: rotinas.ts (as do aluno), dieta.ts (a dieta livre), profissional.ts (o painel); comum.ts (a chamada e o log).
// POST, headers: Authorization: Bearer <access_token do principal> · x-schema: public|staging. Corpo: { acao: "ler", q, … } (q = rotinas
// { de, ate } · dia { dia } · biblioteca · alimentos { termo, pagina } · aluno_rotinas { aluno, de, ate } · aluno_dia { aluno, de, ate }) ou
// { acao: <gravação>, … } (rotina_salvar { id?, dados } · rotina_arquivar { id } · rotina_marcar { id, dia, feita } · rotinas_ordenar { ids } ·
// dia_adicionar { dia, dados } · dia_tirar { dia, item } · dia_desfazer { id } · extra_salvar { id?, dados } · extra_excluir { id } ·
// extra_marcar { id, feita } · alimento_salvar { id?, dados } · alimento_excluir { id } · receita_salvar { id?, dados } · receita_excluir { id }
// · prof_rotina_salvar { aluno, id?, dados } · prof_rotina_arquivar { aluno, id }). 200 → { ok: true, … } (o jsonb da RPC) · 4xx/5xx → { ok:
// false, erro }. Toda leitura é `acao: "ler"` (a Guarda dos E2E lê o corpo). Log: nunca o nome de uma rotina ou de um alimento.
// verify_jwt = true. Publicar (vale nos 2 schemas): scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions aluno-dia true
// Precisa no banco, no schema do pedido: as migrations 20261012200000_wa1_acessos, 20261012210000_wa2_rotinas e 20261012220000_wa3_dieta_livre.
import { json, servirComoPessoa } from "../_shared/porta-pessoa.ts";
import { pedidoDoAlunoDia, statusDoErroAlunoDia } from "../_shared/aluno-dia-regras.ts";
import { recusa, type Resposta } from "./comum.ts";
import { atenderDieta } from "./dieta.ts";
import { atenderProfissional } from "./profissional.ts";
import { atenderRotinas } from "./rotinas.ts";

servirComoPessoa("aluno-dia", { freio: 240 }, async (c) => {
  const lido = pedidoDoAlunoDia(c.corpo);
  let r: Resposta;
  if (!lido.ok) {
    const acao = c.corpo.acao === "ler" && typeof c.corpo.q === "string" ? `ler_${c.corpo.q}` : typeof c.corpo.acao === "string" ? c.corpo.acao : null;
    r = recusa(c, acao, lido.erro, lido.campo);
  } else if (lido.pedido.modulo === "rotinas") r = await atenderRotinas(c, lido.pedido);
  else if (lido.pedido.modulo === "dieta") r = await atenderDieta(c, lido.pedido);
  else r = await atenderProfissional(c, lido.pedido);
  return json(r, r.ok ? 200 : statusDoErroAlunoDia(r.erro), c.origin);
});
