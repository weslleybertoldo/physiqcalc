// Physiq hml-21c (H-43 · jeito 2, etapa 3, 13/10/2026) — as GRAVAÇÕES das Configurações pela função conta, COMO A PESSOA (c.comoPessoa — o
// token de quem chama; nenhuma chave secreta). As ações estão em _shared/conta-regras.ts → ACOES_DAS_CONFIGURACOES; cada uma faz o MESMO de
// hoje (src/painel/configuracoes/{Perfil,Conta}.tsx e {equipe,excluirConta}/api.ts no c6e795b):
//   perfil_salvar            o salvar do Perfil: o dados_profissionais ATUAL lido como a pessoa (o buscarPerfil de antes do update) com SÓ
//                            as chaves que o form edita por cima (o dadosParaGravar — registro, WhatsApp, telefone, endereço, cidade, UF,
//                            CREF/CRN; o resto do JSON — a foto, o plano do Nutri — fica) + o nome, o tipo de perfil e a área no profiles DE
//                            QUEM CHAMA (id = o user do token, nunca do corpo); 0 linha → nao_encontrado. O foto_url NUNCA por aqui: a
//                            foto vai pelas ações da 21a (perfil_foto_preparar|salvar|tirar — a anterior sai do bucket)
//   conta_salvar             o nome da conta (contas.update pelo id; o RLS: só o dono) → 0 linha → nao_encontrado (a tela dizia "sem
//                            permissão" no 0 linha)
//   equipe_papeis            alterar_papeis_membro(p_membro, p_papeis)
//   equipe_remover           remover_membro(p_membro, p_novo_personal, p_novo_nutri) (os 2 que a tela manda; null = nenhum)
//   meu_codigo_garantir      garantir_meu_codigo(p_conta) — o Convite e o "meu link" dos Alunos (idempotente: o código que já existe)
//   prontuarios_para_baixar  w2l_prontuarios_para_baixar(p_conta, p_pacientes) — 1 lote do ZIP da exclusão (a RPC só lê). AÇÃO, não `ler`: a
//                            RPC não tem DEFAULT no p_conta e a tela manda p_conta = null (os pacientes sem conta do site antigo) — o motor
//                            tira o null dos args; aqui ele vai explícito (PADRÃO do progresso da 21c)
// As RPCs devolvem o que já devolvem: o { ok: false, erro } delas vai à tela como hoje (no `resultado`); nenhuma delas levanta de propósito
// (a varredura da decisão B) — o erro do banco vira o código (nunca a mensagem).
import { lerCorpoDaAcao, type AcaoDasConfiguracoes } from "../_shared/conta-regras.ts";
import { falha, naoEncontrado, recusa, rpcDaAcao, type ContextoConta, type Resposta } from "./comum.ts";

export async function atenderConfiguracoes(c: ContextoConta, acao: AcaoDasConfiguracoes): Promise<Resposta> {
  const p = lerCorpoDaAcao(acao, c.corpo);
  if (p.ok === false) return recusa(c, acao, p.erro, p.campo);
  const v = p.valores;
  switch (acao) {
    case "perfil_salvar":
      return await salvarPerfil(c, v);
    case "conta_salvar":
      return await salvarConta(c, v.conta as string, v.nome as string);
    case "equipe_papeis":
      return await rpcDaAcao(c, acao, "alterar_papeis_membro", { p_membro: v.membro, p_papeis: v.papeis });
    case "equipe_remover":
      return await rpcDaAcao(c, acao, "remover_membro", { p_membro: v.membro, p_novo_personal: v.novo_personal ?? null, p_novo_nutri: v.novo_nutri ?? null });
    case "meu_codigo_garantir":
      return await rpcDaAcao(c, acao, "garantir_meu_codigo", { p_conta: v.conta });
    case "prontuarios_para_baixar":
      return await rpcDaAcao(c, acao, "w2l_prontuarios_para_baixar", { p_conta: v.conta ?? null, p_pacientes: v.pacientes });
  }
}

const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * O salvar do Perfil: o MESMO efeito do buscarPerfil + update de hoje — o JSON atual (lido como a pessoa, o profiles dela) com as chaves do
 * form por cima; o nome sempre; o tipo de perfil e a área só se vieram (a tela manda os 2: o valor ou null).
 */
async function salvarPerfil(c: ContextoConta, v: Record<string, unknown>): Promise<Resposta> {
  const acao = "perfil_salvar";
  const { data: perfil, error: ep } = await c.comoPessoa.from("profiles").select("dados_profissionais").eq("id", c.userId).maybeSingle();
  if (ep) return falha(c, acao, ep);
  if (!perfil) return naoEncontrado(c, acao);
  const atual = objeto((perfil as { dados_profissionais?: unknown }).dados_profissionais);
  const linha: Record<string, unknown> = { nome: v.nome, dados_profissionais: { ...atual, ...objeto(v.dados) } };
  if (Object.prototype.hasOwnProperty.call(v, "tipo_perfil")) linha.tipo_perfil = v.tipo_perfil;
  if (Object.prototype.hasOwnProperty.call(v, "area_outra")) linha.area_outra = v.area_outra;
  const { data, error } = await c.comoPessoa.from("profiles").update(linha).eq("id", c.userId).select("id");
  if (error) return falha(c, acao, error);
  if (!Array.isArray(data) || data.length === 0) return naoEncontrado(c, acao);
  return { ok: true };
}

/** O nome da conta (o update de hoje pelo id da conta; o RLS decide — só o dono); 0 linha → nao_encontrado. */
async function salvarConta(c: ContextoConta, conta: string, nome: string): Promise<Resposta> {
  const acao = "conta_salvar";
  const { data, error } = await c.comoPessoa.from("contas").update({ nome }).eq("id", conta).select("id, nome");
  if (error) return falha(c, acao, error);
  if (!Array.isArray(data) || data.length === 0) return naoEncontrado(c, acao);
  return { ok: true };
}
