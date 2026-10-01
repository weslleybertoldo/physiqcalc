// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/alimentos.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { supabase } from "@/nutricao/editor/lib/banco";
import type { Database } from "@/nutricao/editor/lib/banco";
import { ordenarMedidas, palavrasBusca, type FiltrosAlimentos, type MedidaNova, type RegistroAlimento } from "@/nutricao/editor/lib/alimentosUtil";

// Acesso às tabelas `alimentos` e `medidas_caseiras` (RLS: TACO é de todo mundo e só leitura; alimento próprio só da
// dona; master vê tudo). Exclusão do alimento é SOFT (deleted_at → Lixeira, W32); as medidas seguem o alimento.

export type AlimentoRow = Database["public"]["Tables"]["alimentos"]["Row"];
export type MedidaCaseira = Database["public"]["Tables"]["medidas_caseiras"]["Row"];
export type Alimento = AlimentoRow & { medidas_caseiras: MedidaCaseira[] };
export type GrupoAlimentos = { grupo: string; total: number };

const SELECT = "*, medidas_caseiras(*)";

const falhou = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};

const comMedidas = (r: AlimentoRow & { medidas_caseiras?: MedidaCaseira[] | null }): Alimento => ({
  ...r,
  medidas_caseiras: ordenarMedidas(r.medidas_caseiras ?? []),
});

const colunas = (r: RegistroAlimento) => ({
  nome: r.nome,
  grupo: r.grupo,
  porcao_g: r.porcao_g,
  energia_kcal: r.energia_kcal,
  proteina_g: r.proteina_g,
  carboidrato_g: r.carboidrato_g,
  lipidio_g: r.lipidio_g,
  fibra_g: r.fibra_g,
  sodio_mg: r.sodio_mg,
  marca: r.marca,
  nutrientes: r.nutrientes,
});

/** Consulta com busca (cada palavra é um `ilike` na coluna `busca`), filtros e ordenação — quem chama aplica `range`. */
export function montarConsulta(f: FiltrosAlimentos) {
  let q = supabase.from("alimentos").select(SELECT, { count: "exact" }).is("deleted_at", null);
  if (f.fonte) q = q.eq("fonte", f.fonte);
  if (f.grupo) q = q.eq("grupo", f.grupo);
  for (const p of palavrasBusca(f.q)) q = q.ilike("busca", `%${p}%`);
  // alfabética sem acento/caixa (coluna gerada `busca`); empate → 'proprio' antes de 'taco'
  return q.order("busca", { ascending: true }).order("fonte", { ascending: true });
}

export async function listarAlimentos(f: FiltrosAlimentos, offset: number, limit: number): Promise<{ itens: Alimento[]; total: number }> {
  const { data, error, count } = await montarConsulta(f).range(offset, offset + limit - 1);
  falhou(error);
  return { itens: ((data ?? []) as (AlimentoRow & { medidas_caseiras: MedidaCaseira[] | null })[]).map(comMedidas), total: count ?? 0 };
}

export async function buscarAlimento(id: string): Promise<Alimento | null> {
  const { data, error } = await supabase.from("alimentos").select(SELECT).eq("id", id).is("deleted_at", null).maybeSingle();
  falhou(error);
  return data ? comMedidas(data as AlimentoRow & { medidas_caseiras: MedidaCaseira[] | null }) : null;
}

/** Grupos existentes (com contagem), pelo RPC `grupos_alimentos` — respeita a RLS de quem chama. */
export async function listarGrupos(): Promise<GrupoAlimentos[]> {
  const { data, error } = await supabase.rpc("grupos_alimentos");
  falhou(error);
  return ((data ?? []) as { grupo: string; total: number }[]).map((g) => ({ grupo: g.grupo, total: Number(g.total) }));
}

async function gravarMedidas(alimentoId: string, medidas: MedidaNova[]): Promise<MedidaCaseira[]> {
  if (!medidas.length) return [];
  const { data, error } = await supabase
    .from("medidas_caseiras")
    .insert(medidas.map((m) => ({ alimento_id: alimentoId, descricao: m.descricao, gramas: m.gramas, ordem: m.ordem })))
    .select("*");
  falhou(error);
  return ordenarMedidas((data ?? []) as MedidaCaseira[]);
}

export async function criarAlimento(nutricionistaId: string, r: RegistroAlimento, medidas: MedidaNova[]): Promise<Alimento> {
  const { data, error } = await supabase
    .from("alimentos")
    .insert({ ...colunas(r), fonte: "proprio", nutricionista_id: nutricionistaId })
    .select("*")
    .single();
  falhou(error);
  const a = data as AlimentoRow;
  return { ...a, medidas_caseiras: await gravarMedidas(a.id, medidas) };
}

/** Atualiza o alimento e TROCA as medidas caseiras pelas do formulário (apaga as antigas, grava as novas). */
export async function atualizarAlimento(id: string, r: RegistroAlimento, medidas: MedidaNova[]): Promise<Alimento> {
  const { data, error } = await supabase.from("alimentos").update(colunas(r)).eq("id", id).select("*").single();
  falhou(error);
  const { error: erroDel } = await supabase.from("medidas_caseiras").delete().eq("alimento_id", id);
  falhou(erroDel);
  return { ...(data as AlimentoRow), medidas_caseiras: await gravarMedidas(id, medidas) };
}

export async function excluirAlimento(id: string): Promise<void> {
  const { error } = await supabase.from("alimentos").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  falhou(error);
}
