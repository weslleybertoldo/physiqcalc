// Physiq hml-21a (H-43 · jeito 2, etapa 3) — as GRAVAÇÕES da casca pela função conta, COMO A PESSOA (c.comoPessoa — o token de quem chama;
// nenhuma chave secreta). As ações estão em _shared/conta-regras.ts → ACOES_DA_CASCA; cada uma faz o MESMO de hoje (a mesma tabela/RPC,
// os mesmos argumentos), com o dono do user:
//   avisos_marcar_lidos   o sino ao abrir: avisos.lido_em = agora SÓ nas linhas com os ids pedidos E destino_user_id = quem chama (até 30)
//                         → { marcados } (era o PATCH do navegador; o `retry: 1` de hoje fazia 2 — a ação não repete)
//   aviso_membro_ok       o "Entendi" do membro removido: o lido_em da linha (id + destino_user_id = quem chama); 0 linha → nao_encontrado
//   aviso_mudanca_marcar  marcar_aviso_mudanca(p_versao) (o profiles.config de quem chama)
//   senha_definida        minha_senha_definida() — o auth.updateUser da senha fica no navegador (é o login)
//   push_registrar        push_registrar(p_token, p_plataforma, p_versao) → { resultado } (o { ok, erro } da RPC como veio)
//   push_esquecer         push_esquecer(p_token) → { resultado }
//   aceitar_textos        aceitar_no_acesso(p_versao, p_origem, p_saude, p_nascimento, p_versao_app) → { resultado }
//   criar_minha_conta     criar_minha_conta(p_nome, p_tipo, p_registro) → { resultado }
//   entrar_sem_profissional  entrar_sem_profissional(2 ou 5 argumentos — os 3 extras da hml-12 juntos) → { resultado }
// As RPCs devolvem o que já devolvem: o { ok: false, erro } delas vai à tela como hoje (no `resultado`); o erro do banco vira o código.
import { ERROS_DAS_RPCS_DA_CONTA, argsSemProfissional, lerCorpoDaAcao, type AcaoDaCasca } from "../_shared/conta-regras.ts";
import { falha, naoEncontrado, recusa, type ContextoConta, type Resposta } from "./comum.ts";

export async function atenderCasca(c: ContextoConta, acao: AcaoDaCasca): Promise<Resposta> {
  const p = lerCorpoDaAcao(acao, c.corpo);
  if (p.ok === false) return recusa(c, acao, p.erro, p.campo);
  const v = p.valores;
  switch (acao) {
    case "avisos_marcar_lidos":
      return await marcarLidos(c, v.ids as string[]);
    case "aviso_membro_ok":
      return await membroOk(c, v.id as string);
    case "aviso_mudanca_marcar":
      return await chamarRpc(c, acao, "marcar_aviso_mudanca", v.versao !== undefined ? { p_versao: v.versao } : {}, () => ({ ok: true }));
    case "senha_definida":
      return await chamarRpc(c, acao, "minha_senha_definida", {}, (data) => ({ ok: true, definida: data === true }));
    case "push_registrar":
      return await chamarRpc(c, acao, "push_registrar", { p_token: v.token, p_plataforma: v.plataforma ?? "android", p_versao: v.versao ?? null }, resultado);
    case "push_esquecer":
      return await chamarRpc(c, acao, "push_esquecer", { p_token: v.token }, resultado);
    case "aceitar_textos":
      return await chamarRpc(c, acao, "aceitar_no_acesso", {
        p_versao: v.versao, p_origem: v.origem, p_saude: v.saude === true, p_nascimento: v.nascimento ?? null, p_versao_app: v.versao_app ?? null,
      }, resultado);
    case "criar_minha_conta":
      return await chamarRpc(c, acao, "criar_minha_conta", { p_nome: v.nome, p_tipo: v.tipo, p_registro: v.registro ?? null }, resultado);
    case "entrar_sem_profissional": {
      const args = argsSemProfissional(v);
      if (!args) return recusa(c, acao, "dados_invalidos", "extras");
      return await chamarRpc(c, acao, "entrar_sem_profissional", args, resultado);
    }
  }
}

/** O valor da RPC como veio (a lib confere o ok/erro dela, como hoje). */
const resultado = (data: unknown): Resposta => ({ ok: true, resultado: data ?? null });

/** Uma RPC de hoje, como a pessoa, com os args montados aqui; o raise de propósito (sem_login) passa como ele, o resto vira o código. */
async function chamarRpc(
  c: ContextoConta,
  acao: AcaoDaCasca,
  rpc: string,
  args: Record<string, unknown>,
  volta: (data: unknown) => Resposta,
): Promise<Resposta> {
  const { data, error } = await c.comoPessoa.rpc(rpc, args);
  if (error) return falha(c, acao, error, ERROS_DAS_RPCS_DA_CONTA);
  return volta(data);
}

/** O sino ao abrir: o lido_em dos ids pedidos, SÓ os da pessoa (destino_user_id = quem chama); a volta conta quantos mudaram. */
async function marcarLidos(c: ContextoConta, ids: string[]): Promise<Resposta> {
  const acao = "avisos_marcar_lidos";
  const { data, error } = await c.comoPessoa.from("avisos").update({ lido_em: new Date().toISOString() }).in("id", ids)
    .eq("destino_user_id", c.userId).select("id");
  if (error) return falha(c, acao, error);
  return { ok: true, marcados: Array.isArray(data) ? data.length : 0 };
}

/** O "Entendi" do aviso de membro removido: o lido_em daquela linha, se é da pessoa. */
async function membroOk(c: ContextoConta, id: string): Promise<Resposta> {
  const acao = "aviso_membro_ok";
  const { data, error } = await c.comoPessoa.from("avisos").update({ lido_em: new Date().toISOString() }).eq("id", id)
    .eq("destino_user_id", c.userId).select("id");
  if (error) return falha(c, acao, error);
  if (!Array.isArray(data) || data.length === 0) return naoEncontrado(c, acao);
  return { ok: true };
}
