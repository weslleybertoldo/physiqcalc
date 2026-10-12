// Physiq W24 — a lista "Meus alimentos" do Painel › Dietas: a MESMA consulta da busca do editor da W16 (src/nutricao/editor/lib/
// alimentos.ts — coluna `busca`, filtros de fonte e grupo, ordem alfabética), recortada em "TACO + os seus" também para o master
// (no site antigo o master via os alimentos de todo mundo; aqui é o painel dele de profissional — a visão geral é a do master, W27).
// Editar e excluir: só o alimento próprio de quem chama (a TACO é só leitura para todos).
// hml-20c (H-42 · jeito 2, etapa 2): a lista vai pela nutricao (alimentos_busca com o "meus": o recorte "TACO ou os seus" montado NO
// SERVIDOR com quem está logado — o recorteAlimentos abaixo é a mesma regra, a da tela de antes — e o desempate pelo id), no lote da tela.
import { paramsDaBusca, type Alimento, type MedidaCaseira } from "@/nutricao/editor/lib/alimentos";
import { lerNutricao } from "@/nutricao/leitura";
import { acaoNutricao, comFraseDoCodigo } from "@/nutricao/servidor";
import { ordenarMedidas, type FiltrosAlimentos } from "@/nutricao/editor/lib/alimentosUtil";

type Bruto = Alimento & { medidas_caseiras: MedidaCaseira[] | null };

/** "TACO ou dos seus": a TACO e os próprios de quem chama (sem uid, só a TACO). */
export const recorteAlimentos = (uid: string): string => (uid ? `fonte.eq.taco,nutricionista_id.eq.${uid}` : "fonte.eq.taco");

export async function listarAlimentosDoPainel(f: FiltrosAlimentos, uid: string, offset: number, limit: number): Promise<{ itens: Alimento[]; total: number }> {
  // hml-14b (B21): o id desempata a ordem (nome + marca, fonte) — 2 alimentos iguais não trocam de página entre um pedido e outro.
  // hml-20c: sem quem está logado, só a TACO (o recorteAlimentos("") — com o filtro "próprios", nada); com ele, o "meus" (o servidor
  // põe o id do TOKEN no recorte, não o daqui)
  if (!uid && f.fonte === "proprio") return { itens: [], total: 0 };
  const r = await lerNutricao("alimentos_busca", { ...paramsDaBusca(uid ? f : { ...f, fonte: "taco" }), offset, limite: limit, ...(uid ? { meus: true } : {}) });
  return { itens: ((r.linhas ?? []) as Bruto[]).map((x) => ({ ...x, medidas_caseiras: ordenarMedidas(x.medidas_caseiras ?? []) })), total: r.total ?? 0 };
}

/** O alimento é seu (próprio e criado por você): só você edita e exclui. */
export const alimentoEhMeu = (a: { fonte: string; nutricionista_id: string | null }, uid: string): boolean =>
  !!uid && a.fonte === "proprio" && a.nutricionista_id === uid;

/** Excluir é soft (Lixeira), como o site antigo — pela função nutricao (hml-19b), com a frase de antes quando não sai nada. */
export async function excluirAlimentoDoPainel(id: string): Promise<void> {
  await acaoNutricao("alimento_excluir", { id }).catch((e) => comFraseDoCodigo(e, { nao_encontrado: "Você não pode excluir este alimento (ou ele já foi excluído)." }));
}
