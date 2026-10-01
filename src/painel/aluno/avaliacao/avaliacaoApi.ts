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
 */
import { principal } from "@/integrations/principal/client";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET_REGISTROS, comprimirImagem, type TipoFoto } from "@/lib/registrosFotos";

export class ErroAvaliacao extends Error {
  constructor(public codigo: string) {
    super(codigo);
  }
}

const online = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

async function adminAvaliacoes<T>(corpo: Record<string, unknown>): Promise<T> {
  if (!online()) throw new ErroAvaliacao("sem_internet");
  const { data, error } = await supabase.functions.invoke("admin-avaliacoes", { body: corpo });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let codigo = "erro_interno";
    if (ctx && typeof ctx.json === "function") {
      try {
        const j = await ctx.clone().json();
        codigo = String(j?.error ?? codigo);
      } catch {
        /* sem corpo */
      }
    }
    throw new ErroAvaliacao(codigo);
  }
  const d = data as { error?: string } | null;
  if (d && typeof d.error === "string") throw new ErroAvaliacao(d.error);
  return data as T;
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
export async function excluirAvaliacaoFisica(avaliacaoId: string, restaurar?: { treinoUserId: string; colunas: Record<string, unknown> } | null): Promise<void> {
  await adminAvaliacoes({ action: "delete", avaliacaoId });
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

/** Fotos mensais do Calc (C36): sobe (ou troca) a foto da posição no mês e grava a linha (a mesma regra da aba Registros antiga). */
export async function subirFotoMensal(treinoUserId: string, mes: string, tipo: TipoFoto, arquivo: File): Promise<void> {
  if (!online()) throw new ErroAvaliacao("sem_internet");
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new ErroAvaliacao("mes_invalido");
  const blob = await comprimirImagem(arquivo);
  const caminho = `${treinoUserId}/${mes}/${tipo}.jpg`;
  const up = await supabase.storage.from(BUCKET_REGISTROS).upload(caminho, blob, { upsert: true, contentType: "image/jpeg" });
  if (up.error) throw new ErroAvaliacao(up.error.message);
  const { error } = await supabase
    .from("physiq_registros_fotos")
    .upsert({ user_id: treinoUserId, mes_ref: `${mes}-01`, tipo, storage_path: caminho, updated_at: new Date().toISOString() }, { onConflict: "user_id,mes_ref,tipo" });
  if (error) throw new ErroAvaliacao(error.message);
}

export async function excluirFotoMensal(foto: { id: string; caminho: string }): Promise<void> {
  if (!online()) throw new ErroAvaliacao("sem_internet");
  const { error } = await supabase.from("physiq_registros_fotos").delete().eq("id", foto.id);
  if (error) throw new ErroAvaliacao(error.message);
  await supabase.storage.from(BUCKET_REGISTROS).remove([foto.caminho]);
}

/** O aviso "avaliação nova" no sino do aluno (NF9) — não repete o não lido dos últimos 10 minutos. Falhar não desfaz nada. */
export async function avisarAvaliacaoNova(alunoIdDaRota: string): Promise<{ avisado: boolean; semLogin: boolean }> {
  try {
    const { data, error } = await principal.rpc("aluno_avisar_avaliacao" as never, { p_aluno: alunoIdDaRota } as never);
    if (error) return { avisado: false, semLogin: false };
    const r = (data ?? {}) as { avisado?: boolean; sem_login?: boolean };
    return { avisado: !!r.avisado, semLogin: !!r.sem_login };
  } catch {
    return { avisado: false, semLogin: false };
  }
}
