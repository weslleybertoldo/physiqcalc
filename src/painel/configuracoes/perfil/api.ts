// Physiq hml-21c (H-43 · jeito 2, etapa 3) — Configurações › Perfil e › Conta pela função conta, COM A SESSÃO de quem está logado (o que
// estava em linha no Perfil.tsx — o buscarPerfil, o update do salvar e o da foto — e o update do nome no Conta.tsx). O mesmo efeito de hoje:
//   · buscarPerfil   o profiles DE QUEM ESTÁ LOGADO (q=perfil_profissional: as colunas do form; o servidor filtra pelo user do token — o `uid`
//                    não decide mais nada, como o enviarFotoPerfil da 21a), no lote da tela;
//   · salvarPerfil   perfil_salvar: o nome, o tipo, a área e SÓ as chaves do dados_profissionais que o form edita — o servidor lê o JSON atual
//                    como a pessoa e põe essas por cima (o buscarPerfil + o update de antes, num pedido);
//   · gravarFotoDoPerfil  a foto pelas ações da 21a (perfil_foto_salvar com o caminho que o link assinado recebeu — a anterior sai do bucket —; ou
//                    perfil_foto_tirar) → a URL pública nova (ou null);
//   · salvarNomeDaConta  conta_salvar (o RLS: só o dono; 0 linha = recusa, como o "sem permissão" de antes).
// O erro: o da conta (ErroLeitura/ErroGravacaoConta — a frase fixa do código); as telas mostram o texto delas, como hoje.
import { acaoConta } from "@/conta/gravar";
import { lerConta } from "@/conta/ler";

export interface LinhaPerfil {
  nome: string | null;
  email: string | null;
  tipo_perfil: string | null;
  area_outra: string | null;
  dados_profissionais: unknown;
}

/** O perfil de quem está logado (o `uid` fica na assinatura de antes: quem decide é o token). */
export async function buscarPerfil(_uid: string): Promise<LinhaPerfil | null> {
  const { linhas } = await lerConta("perfil_profissional");
  return ((linhas ?? [])[0] as LinhaPerfil | undefined) ?? null;
}

/** O salvar do Perfil: o nome, o tipo de perfil, a área e as chaves do dados_profissionais que o form edita (o dadosParaGravar). */
export async function salvarPerfil(p: { nome: string; tipo_perfil: string | null; area_outra: string | null; dados: Record<string, unknown> }): Promise<void> {
  await acaoConta("perfil_salvar", { nome: p.nome, tipo_perfil: p.tipo_perfil, area_outra: p.area_outra, dados: p.dados });
}

/** A foto do perfil: o caminho que subiu pelo link assinado (perfil_foto_salvar) ou null (perfil_foto_tirar) → a URL pública nova ou null. */
export async function gravarFotoDoPerfil(caminho: string | null): Promise<string | null> {
  if (caminho === null) {
    await acaoConta("perfil_foto_tirar");
    return null;
  }
  const r = await acaoConta<{ url?: unknown }>("perfil_foto_salvar", { caminho });
  return typeof r.url === "string" ? r.url : null;
}

/** O nome da conta ativa (só o dono). */
export async function salvarNomeDaConta(contaId: string, nome: string): Promise<void> {
  await acaoConta("conta_salvar", { conta: contaId, nome });
}
