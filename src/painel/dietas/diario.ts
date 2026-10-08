// Physiq W24 — o Diário alimentar do lado da nutricionista (Painel › Dietas › Diário), no BANCO PRINCIPAL: porta do lado
// "nutricionista" do src/lib/diario.ts do PhysiqNutri (W30). Quem vê o quê é do banco (migração 20261001190000_w24_dietas.sql,
// regra clínica da W18): a nutri responsável e o dono-nutri leem (P1), personal e dono sem papel de nutri não leem, a nutri removida
// deixa de ler; reagir e excluir = quem muda a nutrição do aluno. Aqui só o recorte da CONTA ATIVA (o aluno da conta; o paciente sem
// conta do site antigo continua da nutri dele) e as fotos por URL assinada (bucket privado "diario").
//
// FONTE DO "DIÁRIO DE HOJE" DO DASHBOARD (W25): listarDiarioDaConta(contaId, uid, inicioDoPeriodo(1).toISOString()) + urlsAssinadas
// (miniaturas) — a mesma consulta e a mesma regra desta aba.
import { bucketDoAmbiente } from "@/integrations/principal/buckets";
import { principal } from "@/integrations/principal/client";
import type { Database } from "@/integrations/principal/types";
import type { Reacao } from "@/nutricao/app/diarioUtil";
import { COMENTARIO_NUTRI_MAX, type AlunoDoDiario } from "./diarioPainel";

export type RegistroDiarioRow = Database["public"]["Tables"]["diario_alimentar"]["Row"];
type RegistroDiarioUpdate = Database["public"]["Tables"]["diario_alimentar"]["Update"];
export type AlunoDoRegistro = AlunoDoDiario & { conta_id: string | null; nutricionista_id: string | null };
export type RegistroDiarioNutri = RegistroDiarioRow & { paciente: AlunoDoRegistro | null };
export const BUCKET_DIARIO = bucketDoAmbiente("diario");
const SELECT_NUTRI = "*, paciente:pacientes!inner(id, nome, apelido, link_codigo, foto_url, conta_id, nutricionista_id)";

const falhou = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};

/** O recorte da conta ativa: o aluno da conta, ou o paciente sem conta da própria nutri (site antigo). A RLS decide o resto. */
export const recorteDiario = (contaId: string, uid: string): string => `conta_id.eq.${contaId},and(conta_id.is.null,nutricionista_id.eq.${uid})`;

/** Registros VIVOS a partir de `deIso` dos alunos da conta ativa que você vê, mais recente primeiro, com o aluno embutido. */
export async function listarDiarioDaConta(contaId: string, uid: string, deIso: string): Promise<RegistroDiarioNutri[]> {
  const { data, error } = await principal
    .from("diario_alimentar")
    .select(SELECT_NUTRI)
    .is("deleted_at", null)
    .gte("data_hora", deIso)
    .or(recorteDiario(contaId, uid), { referencedTable: "paciente" })
    .order("data_hora", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000);
  falhou(error);
  return (data ?? []) as unknown as RegistroDiarioNutri[];
}

/** Reação + comentário (reacao null = tira a reação). UPDATE que a RLS não deixa devolve 0 linhas → erro amigável. */
export async function reagir(id: string, reacao: Reacao | null, comentario: string): Promise<RegistroDiarioRow> {
  const patch: RegistroDiarioUpdate = reacao
    ? { reacao_nutri: reacao, comentario_nutri: comentario.trim().slice(0, COMENTARIO_NUTRI_MAX), reagido_em: new Date().toISOString() }
    : { reacao_nutri: null, comentario_nutri: "", reagido_em: null };
  const { data, error } = await principal.from("diario_alimentar").update(patch).eq("id", id).is("deleted_at", null).select("*").maybeSingle();
  falhou(error);
  if (!data) throw new Error("Você não pode reagir a esta foto (ou ela foi excluída).");
  return data as RegistroDiarioRow;
}

/** Soft delete (Lixeira) + remove a foto do bucket (melhor esforço: a linha já saiu da tela) — como o site antigo. */
export async function excluirRegistro(r: Pick<RegistroDiarioRow, "id" | "path">): Promise<void> {
  const { data, error } = await principal
    .from("diario_alimentar")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", r.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  falhou(error);
  if (!data) throw new Error("Você não pode excluir esta foto (ou ela já foi excluída).");
  await principal.storage.from(BUCKET_DIARIO).remove([r.path]).catch(() => undefined);
}

/** URL assinada de curta duração (a foto grande gera a própria ao abrir). */
export async function urlAssinada(r: Pick<RegistroDiarioRow, "path">, segundos = 300): Promise<string> {
  const { data, error } = await principal.storage.from(BUCKET_DIARIO).createSignedUrl(r.path, segundos);
  falhou(error);
  if (!data?.signedUrl) throw new Error("Não foi possível abrir a foto.");
  return data.signedUrl;
}

/** URLs assinadas em LOTE (miniaturas), por id do registro. As que falharem ficam de fora. */
export async function urlsAssinadas(registros: Pick<RegistroDiarioRow, "id" | "path">[], segundos = 3600): Promise<Record<string, string>> {
  const comPath = registros.filter((r) => r.path);
  if (!comPath.length) return {};
  const { data, error } = await principal.storage.from(BUCKET_DIARIO).createSignedUrls(comPath.map((r) => r.path), segundos);
  falhou(error);
  const porPath = new Map<string, string>();
  for (const d of data ?? []) {
    if (d.path && d.signedUrl && !d.error) porPath.set(d.path, d.signedUrl);
  }
  const saida: Record<string, string> = {};
  for (const r of comPath) {
    const u = porPath.get(r.path);
    if (u) saida[r.id] = u;
  }
  return saida;
}
