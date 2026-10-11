/**
 * Perfil do aluno › Avaliação (W17): o que o profissional ESCREVE, cada coisa no seu banco (nada é copiado de um para o outro):
 *   · avaliação física (personal responsável ou dono-personal — formulário do Calc) → Banco do Treino, pela função admin-avaliacoes
 *     (a regra do Calc: o professor do aluno ou o dono da conta, W3) + o perfil do aluno com a composição atual (admin-update-user,
 *     como o "Salvar" de Dobras & Medidas fazia — o "Ver" da última avaliação mostra os números do perfil, W10);
 *   · próxima avaliação (NF7) → physiq_profiles.proxima_avaliacao, pela admin-avaliacoes (ação "proxima");
 *   · fotos mensais do Calc → bucket privado registros + physiq_registros_fotos (a regra de hoje do professor);
 *   · antropometria e fotos de evolução (nutricionista responsável ou dono-nutri — formulário do Nutri) → banco principal, pelas
 *     libs portadas do Nutri (RLS da nutrição: W3, W16 e W17);
 *   · o aviso "avaliação nova" no sino do aluno (NF9) → aluno_avisar_avaliacao.
 * hml-19c (H-41 · jeito 2): a foto mensal deixa de gravar direto no bucket e na tabela — vai pela admin-avaliacoes (as ações
 * foto_preparar → o arquivo sobe no link assinado que o servidor deu → foto_salvar; foto_excluir), com o MESMO adminAvaliacoes() de
 * hoje (1 tentativa, 45 s); o aviso "avaliação nova" vai pela função nutricao (avaliacao_avisar). As assinaturas não mudam.
 */
import { DB_SCHEMA, supabase } from "@/integrations/supabase/client";
import { comprimirImagem, type TipoFoto } from "@/lib/registrosFotos";
import { acaoNutricao } from "@/nutricao/servidor";
import { carregarTreinoDoPainel } from "./fontes";

export class ErroAvaliacao extends Error {
  constructor(public codigo: string) {
    super(codigo);
  }
}

const online = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

const URL_ADMIN_AVALIACOES = `${String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "")}/functions/v1/admin-avaliacoes`;
const ANON_TREINO = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "");

/**
 * A função admin-avaliacoes numa tentativa SÓ, com espera longa (45 s). O cliente do Treino repete sozinho o pedido que passa de
 * 15 s (VM Nano lenta): para gravar, isso duplicaria a avaliação (o 1º pedido grava, a resposta não chega, o 2º grava de novo) e o
 * "excluir" voltaria "forbidden" (a linha já tinha saído). Aqui não há repetição automática.
 */
async function adminAvaliacoes<T>(corpo: Record<string, unknown>): Promise<T> {
  if (!online()) throw new ErroAvaliacao("sem_internet");
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new ErroAvaliacao("invalid_token");
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), 45_000);
  let r: Response;
  try {
    r = await fetch(URL_ADMIN_AVALIACOES, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: ANON_TREINO, "x-schema": DB_SCHEMA },
      body: JSON.stringify(corpo),
      signal: controle.signal,
    });
  } catch {
    throw new ErroAvaliacao(online() ? "erro_interno" : "sem_internet");
  } finally {
    clearTimeout(relogio);
  }
  const d = (await r.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!r.ok || !d) throw new ErroAvaliacao(String(d?.error ?? (r.status === 401 ? "invalid_token" : "erro_interno")));
  if (typeof d.error === "string") throw new ErroAvaliacao(d.error);
  return d as T;
}

export interface NovaAvaliacaoFisica {
  /** yyyy-mm-dd */
  data: string;
  /** as colunas do physiq_avaliacoes (peso, altura, método, dobras, composição, TMBs, medidas, observação) */
  colunas: Record<string, string | number | null>;
  /** grava também no perfil (a composição atual) — só quando é a avaliação mais recente */
  atualizarPerfil: boolean;
}

/** Avaliação física (C34/C35/C83): o registro da evolução e, sendo a mais recente, a composição atual no perfil. */
export async function registrarAvaliacaoFisica(treinoUserId: string, nova: NovaAvaliacaoFisica): Promise<{ id: string | null; perfilAtualizado: boolean }> {
  const { observacao, ...semObs } = nova.colunas;
  const r = await adminAvaliacoes<{ avaliacao?: { id?: string } | null }>({
    action: "create",
    userId: treinoUserId,
    avaliacao: { ...nova.colunas, data_avaliacao: nova.data, observacao: observacao ?? null },
  });
  let perfilAtualizado = false;
  if (nova.atualizarPerfil) {
    const { error } = await supabase.functions.invoke("admin-update-user", { body: { userId: treinoUserId, data: semObs } });
    perfilAtualizado = !error;
    if (error) console.warn("[avaliacao] a composição atual do perfil não foi gravada:", error.message);
  }
  return { id: r?.avaliacao?.id ?? null, perfilAtualizado };
}

/**
 * Exclui a avaliação física; sendo a mais recente, a composição atual do perfil volta à da anterior (`restaurar`, de
 * composicaoDepoisDeExcluir — o Calc antigo deixava o perfil com os números da excluída).
 */
export async function excluirAvaliacaoFisica(
  avaliacaoId: string,
  restaurar?: { treinoUserId: string; colunas: Record<string, unknown> } | null,
  alunoIdDaRota?: string,
): Promise<void> {
  try {
    await adminAvaliacoes({ action: "delete", avaliacaoId });
  } catch (e) {
    // "forbidden" de uma linha que já não existe = um pedido anterior (rede lenta) já excluiu: confere e segue
    const jaSaiu = e instanceof ErroAvaliacao && e.codigo === "forbidden" && !!alunoIdDaRota
      && !((await carregarTreinoDoPainel(alunoIdDaRota).catch(() => null))?.parte.avaliacoes ?? [{ id: avaliacaoId }]).some((l) => String(l.id) === avaliacaoId);
    if (!jaSaiu) throw e;
  }
  if (restaurar) {
    const { error } = await supabase.functions.invoke("admin-update-user", { body: { userId: restaurar.treinoUserId, data: restaurar.colunas } });
    if (error) console.warn("[avaliacao] a composição atual do perfil não voltou à da avaliação anterior:", error.message);
  }
}

/** NF7: a próxima avaliação (yyyy-mm-dd) ou null para tirar a data. */
export async function salvarProximaAvaliacao(treinoUserId: string, data: string | null): Promise<string | null> {
  const r = await adminAvaliacoes<{ proxima_avaliacao?: string | null }>({ action: "proxima", userId: treinoUserId, data: data ?? null });
  return r?.proxima_avaliacao ? String(r.proxima_avaliacao).slice(0, 10) : null;
}

/**
 * Fotos mensais do Calc (C36): sobe (ou troca) a foto da posição no mês e grava a linha (a mesma regra da aba Registros antiga).
 * hml-19c: pela admin-avaliacoes — foto_preparar (o caminho <aluno>/<aaaa-mm>/<tipo>.jpg é do servidor, e o link assinado já vem com
 * o "trocar") → o arquivo sobe direto no Storage do Treino (uploadToSignedUrl) → foto_salvar (o servidor confere que o arquivo chegou
 * naquele caminho e grava a linha). 3 pedidos; o erro vira ErroAvaliacao com o código (a tela mostra a frase de mensagens.ts).
 */
export async function subirFotoMensal(treinoUserId: string, mes: string, tipo: TipoFoto, arquivo: File): Promise<void> {
  if (!online()) throw new ErroAvaliacao("sem_internet");
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new ErroAvaliacao("mes_invalido");
  const blob = await comprimirImagem(arquivo);
  const link = await adminAvaliacoes<{ bucket: string; caminho: string; token: string }>({ action: "foto_preparar", userId: treinoUserId, mes, tipo });
  const up = await supabase.storage.from(link.bucket).uploadToSignedUrl(link.caminho, link.token, blob, { upsert: true, contentType: "image/jpeg" });
  if (up.error) throw new ErroAvaliacao("upload_falhou");
  await adminAvaliacoes({ action: "foto_salvar", userId: treinoUserId, mes, tipo, caminho: link.caminho });
}

/** hml-19c: pela admin-avaliacoes (foto_excluir) — a linha sai e DEPOIS o arquivo; o caminho é lido da linha no servidor (não vai daqui). */
export async function excluirFotoMensal(foto: { id: string; caminho: string }): Promise<void> {
  await adminAvaliacoes({ action: "foto_excluir", fotoId: foto.id });
}

/**
 * O aviso "avaliação nova" no sino do aluno (NF9) — não repete o não lido dos últimos 10 minutos. Falhar não desfaz nada.
 * hml-19c: pela função nutricao (avaliacao_avisar: a RPC aluno_avisar_avaliacao de hoje, chamada no servidor como a pessoa).
 */
export async function avisarAvaliacaoNova(alunoIdDaRota: string): Promise<{ avisado: boolean; semLogin: boolean }> {
  try {
    const r = await acaoNutricao<{ avisado?: boolean; sem_login?: boolean }>("avaliacao_avisar", { alunoId: alunoIdDaRota });
    return { avisado: !!r.avisado, semLogin: !!r.sem_login };
  } catch {
    return { avisado: false, semLogin: false };
  }
}
