// Physiq W24 — as chamadas PÚBLICAS do diário (sem login): a situação do link /d/<código> (diario_link, nova — diz se o envio está
// liberado sem expor dado de ninguém), o envio da foto pelo MESMO caminho de hoje (bucket privado "diario" + diario_enviar — a do
// site antigo e a do app do aluno, W11) e os últimos 7 dias (diario_listar). O cliente anônimo nunca lê nem escreve nas tabelas.
// Módulo leve de propósito: a página /d/:codigo carrega só isto (e as regras puras), nada do painel.
import { principal } from "@/integrations/principal/client";
import { nomeObjeto, mimeDaFotoDiario, type Refeicao } from "@/nutricao/app/diarioUtil";

export const BUCKET_DIARIO = "diario";

export type SituacaoLink = "ok" | "diario_desligado" | "link_desligado" | "sem_nutricionista" | "invalido";
export type LinkDoDiario =
  | { situacao: "ok"; paciente_id: string; nutricionista_id: string; nome: string }
  | { situacao: Exclude<SituacaoLink, "ok"> };

/** O código como o banco guarda (minúsculas, só letras e números). */
export const normalizarCodigo = (c: string): string => String(c ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);

const SITUACOES: SituacaoLink[] = ["ok", "diario_desligado", "link_desligado", "sem_nutricionista", "invalido"];

/** Lê a resposta da função (tolerante: o que não reconhece vira "invalido"). */
export function lerLink(bruto: unknown): LinkDoDiario {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const s = SITUACOES.includes(b.situacao as SituacaoLink) ? (b.situacao as SituacaoLink) : "invalido";
  if (s === "ok") {
    if (typeof b.paciente_id !== "string" || typeof b.nutricionista_id !== "string") return { situacao: "invalido" };
    return { situacao: "ok", paciente_id: b.paciente_id, nutricionista_id: b.nutricionista_id, nome: typeof b.nome === "string" ? b.nome : "" };
  }
  return { situacao: s };
}

export async function situacaoDoLink(codigo: string): Promise<LinkDoDiario> {
  const c = normalizarCodigo(codigo);
  if (!c) return { situacao: "invalido" };
  const { data, error } = await principal.rpc("diario_link" as never, { p_codigo: c } as never);
  if (error) throw new Error(error.message);
  return lerLink(data);
}

export type EnvioPeloLink = { refeicao: Refeicao; comentario: string; dataHoraIso: string };

/** Sobe a foto no bucket (a política valida a pasta do aluno vivo) e grava pela diario_enviar; se ela falhar, tenta tirar o arquivo. */
export async function enviarPeloLink(codigo: string, ctx: { paciente_id: string; nutricionista_id: string }, arquivo: File, form: EnvioPeloLink): Promise<{ id: string; data_hora: string }> {
  const mime = mimeDaFotoDiario(arquivo);
  const path = nomeObjeto(ctx.nutricionista_id, ctx.paciente_id, mime);
  const up = await principal.storage.from(BUCKET_DIARIO).upload(path, arquivo, { contentType: mime, upsert: false, cacheControl: "3600" });
  if (up.error) throw new Error(up.error.message);
  const { data, error } = await principal.rpc("diario_enviar", {
    p_codigo: normalizarCodigo(codigo),
    p_path: path,
    p_mime: mime,
    p_tamanho: arquivo.size,
    p_refeicao: form.refeicao,
    p_comentario: form.comentario.trim(),
    p_data_hora: form.dataHoraIso,
  });
  if (error) {
    await principal.storage.from(BUCKET_DIARIO).remove([path]).catch(() => undefined);
    throw new Error(error.message);
  }
  return data as unknown as { id: string; data_hora: string };
}

export type RegistroPublico = {
  id: string;
  data_hora: string;
  refeicao: string;
  comentario: string;
  reacao_nutri: string | null;
  comentario_nutri: string;
  reagido_em: string | null;
};

/** Os últimos 7 dias do aluno (sem a foto — só a nutricionista vê), mais recente primeiro. Código inválido → []. */
export async function listarPeloLink(codigo: string): Promise<RegistroPublico[]> {
  const { data, error } = await principal.rpc("diario_listar", { p_codigo: normalizarCodigo(codigo) });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data : []) as unknown as RegistroPublico[];
}
