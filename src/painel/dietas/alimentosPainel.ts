// Physiq W24 — a lista "Meus alimentos" do Painel › Dietas: a MESMA consulta da busca do editor da W16 (src/nutricao/editor/lib/
// alimentos.ts — coluna `busca`, filtros de fonte e grupo, ordem alfabética), recortada em "TACO + os seus" também para o master
// (no site antigo o master via os alimentos de todo mundo; aqui é o painel dele de profissional — a visão geral é a do master, W27).
// Editar e excluir: só o alimento próprio de quem chama (a TACO é só leitura para todos).
import { supabase } from "@/nutricao/editor/lib/banco";
import { montarConsulta, type Alimento, type MedidaCaseira } from "@/nutricao/editor/lib/alimentos";
import { ordenarMedidas, type FiltrosAlimentos } from "@/nutricao/editor/lib/alimentosUtil";

type Bruto = Alimento & { medidas_caseiras: MedidaCaseira[] | null };

/** "TACO ou dos seus": a TACO e os próprios de quem chama (sem uid, só a TACO). */
export const recorteAlimentos = (uid: string): string => (uid ? `fonte.eq.taco,nutricionista_id.eq.${uid}` : "fonte.eq.taco");

export async function listarAlimentosDoPainel(f: FiltrosAlimentos, uid: string, offset: number, limit: number): Promise<{ itens: Alimento[]; total: number }> {
  // hml-14b (B21): o id desempata a ordem (nome + marca, fonte) — 2 alimentos iguais não trocam de página entre um pedido e outro
  const { data, error, count } = await montarConsulta(f).or(recorteAlimentos(uid)).order("id", { ascending: true }).range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return { itens: ((data ?? []) as Bruto[]).map((r) => ({ ...r, medidas_caseiras: ordenarMedidas(r.medidas_caseiras ?? []) })), total: count ?? 0 };
}

/** O alimento é seu (próprio e criado por você): só você edita e exclui. */
export const alimentoEhMeu = (a: { fonte: string; nutricionista_id: string | null }, uid: string): boolean =>
  !!uid && a.fonte === "proprio" && a.nutricionista_id === uid;

/** Excluir é soft (Lixeira), como o site antigo. */
export async function excluirAlimentoDoPainel(id: string): Promise<void> {
  const { data, error } = await supabase.from("alimentos").update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null).select("id").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Você não pode excluir este alimento (ou ele já foi excluído).");
}
