// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/planos.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { supabase } from "@/nutricao/editor/lib/banco";
import type { Database, Json } from "@/nutricao/editor/lib/banco";
import { listarAlimentos, type Alimento, type MedidaCaseira } from "@/nutricao/editor/lib/alimentos";
import { ordenarMedidas } from "@/nutricao/editor/lib/alimentosUtil";
import { REFEICOES_PADRAO, TITULO_MAX, ordenarItens, ordenarRefeicoes, type RegistroItem, type RegistroPlano, type RegistroRefeicao, type Substituto } from "@/nutricao/editor/lib/dietaUtil";

// Acesso às tabelas `planos_alimentares` → `refeicoes` → `itens_refeicao` (RLS: a nutricionista só vê os planos
// dela; refeições e itens seguem o plano; master vê tudo). Exclusão do PLANO é SOFT (deleted_at → Lixeira, W32);
// refeição e item saem de verdade. O item traz o alimento (W8) aninhado com as medidas caseiras — é dele que saem
// as kcal. A busca de alimentos do editor reusa `listarAlimentos` da W8.

export type PlanoRow = Database["public"]["Tables"]["planos_alimentares"]["Row"];
export type RefeicaoRow = Database["public"]["Tables"]["refeicoes"]["Row"];
export type ItemRow = Database["public"]["Tables"]["itens_refeicao"]["Row"];
export type AlimentoDoPlano = Pick<Alimento, "id" | "nome" | "fonte" | "grupo" | "energia_kcal" | "proteina_g" | "carboidrato_g" | "lipidio_g" | "fibra_g" | "sodio_mg"> & {
  medidas_caseiras: MedidaCaseira[];
};
export type Item = ItemRow & { alimento: AlimentoDoPlano | null; receita?: { id: string; nome: string } | null };
export type Refeicao = RefeicaoRow & { itens: Item[] };
export type Plano = PlanoRow & { refeicoes: Refeicao[] };

const ALIMENTO = "alimento:alimentos(id, nome, fonte, grupo, energia_kcal, proteina_g, carboidrato_g, lipidio_g, fibra_g, sodio_mg, medidas_caseiras(*))";
const SELECT_ITEM = `*, ${ALIMENTO}, receita:receitas(id, nome)`;
const SELECT_PLANO = `*, refeicoes(*, itens:itens_refeicao(${SELECT_ITEM}))`;

const falhou = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};

type AlimentoBruto = Omit<AlimentoDoPlano, "medidas_caseiras"> & { medidas_caseiras: MedidaCaseira[] | null };
type ItemBruto = ItemRow & { alimento?: AlimentoBruto | null; receita?: { id: string; nome: string } | null };
type RefeicaoBruta = RefeicaoRow & { itens?: ItemBruto[] | null };
type PlanoBruto = PlanoRow & { refeicoes?: RefeicaoBruta[] | null };

const montarItem = (i: ItemBruto): Item => ({
  ...i,
  alimento: i.alimento ? { ...i.alimento, medidas_caseiras: ordenarMedidas(i.alimento.medidas_caseiras ?? []) } : null,
});
const montarRefeicao = (r: RefeicaoBruta): Refeicao => ({ ...r, itens: ordenarItens((r.itens ?? []).map(montarItem)) });
const montarPlano = (p: PlanoBruto): Plano => ({ ...p, refeicoes: ordenarRefeicoes((p.refeicoes ?? []).map(montarRefeicao)) });

// ---- Planos ----
/** Planos do paciente (mais recente primeiro), já com refeições, itens e alimentos — a lista mostra kcal/macros. */
export async function listarPlanos(pacienteId: string): Promise<Plano[]> {
  const { data, error } = await supabase
    .from("planos_alimentares")
    .select(SELECT_PLANO)
    .eq("paciente_id", pacienteId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  falhou(error);
  return ((data ?? []) as unknown as PlanoBruto[]).map(montarPlano);
}

export type PlanoFavorito = Plano & { paciente: { id: string; nome: string } | null };
type PlanoFavoritoBruto = PlanoBruto & { paciente?: { id: string; nome: string } | null };

/** Planos FAVORITOS da nutricionista, de todos os pacientes (tela Meus favoritos, W29) — com o paciente embutido pro resumo/deep link. */
export async function listarPlanosFavoritos(): Promise<PlanoFavorito[]> {
  const { data, error } = await supabase
    .from("planos_alimentares")
    .select(`${SELECT_PLANO}, paciente:pacientes(id, nome)`)
    .eq("favorito", true)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  falhou(error);
  return ((data ?? []) as unknown as PlanoFavoritoBruto[]).map((p) => ({ ...montarPlano(p), paciente: p.paciente ?? null }));
}

export async function buscarPlano(id: string): Promise<Plano | null> {
  const { data, error } = await supabase.from("planos_alimentares").select(SELECT_PLANO).eq("id", id).is("deleted_at", null).maybeSingle();
  falhou(error);
  return data ? montarPlano(data as unknown as PlanoBruto) : null;
}

const colunasPlano = (r: RegistroPlano) => ({ titulo: r.titulo, kcal_alvo: r.kcal_alvo, observacao: r.observacao });

/** Cria o plano já com as refeições padrão (Café da manhã 07:00 … Ceia 22:00). */
export async function criarPlano(nutricionistaId: string, pacienteId: string, r: RegistroPlano, calculoEnergeticoId: string | null): Promise<Plano> {
  const { data, error } = await supabase
    .from("planos_alimentares")
    .insert({ nutricionista_id: nutricionistaId, paciente_id: pacienteId, metodo: "alimentos", calculo_energetico_id: calculoEnergeticoId, ...colunasPlano(r) })
    .select("*")
    .single();
  falhou(error);
  const plano = data as PlanoRow;
  const { data: refs, error: erroRef } = await supabase
    .from("refeicoes")
    .insert(REFEICOES_PADRAO.map((x, i) => ({ plano_id: plano.id, nome: x.nome, horario: x.horario, ordem: i })))
    .select("*");
  falhou(erroRef);
  return montarPlano({ ...plano, refeicoes: ((refs ?? []) as RefeicaoRow[]).map((x) => ({ ...x, itens: [] })) });
}

export async function atualizarPlano(id: string, r: RegistroPlano): Promise<PlanoRow> {
  const { data, error } = await supabase.from("planos_alimentares").update(colunasPlano(r)).eq("id", id).select("*").single();
  falhou(error);
  return data as PlanoRow;
}

export async function favoritarPlano(id: string, favorito: boolean): Promise<PlanoRow> {
  const { data, error } = await supabase.from("planos_alimentares").update({ favorito }).eq("id", id).select("*").single();
  falhou(error);
  return data as PlanoRow;
}

export async function excluirPlano(id: string): Promise<void> {
  const { error } = await supabase.from("planos_alimentares").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  falhou(error);
}

/** Cópia completa (plano + refeições + itens com substitutos); o título ganha " (cópia)". Devolve a cópia carregada. */
export async function duplicarPlano(nutricionistaId: string, p: Plano): Promise<Plano> {
  const { data, error } = await supabase
    .from("planos_alimentares")
    .insert({
      nutricionista_id: nutricionistaId,
      paciente_id: p.paciente_id,
      metodo: p.metodo,
      kcal_alvo: p.kcal_alvo,
      calculo_energetico_id: p.calculo_energetico_id,
      observacao: p.observacao,
      titulo: `${p.titulo} (cópia)`.slice(0, TITULO_MAX),
    })
    .select("*")
    .single();
  falhou(error);
  const novo = data as PlanoRow;
  for (const r of ordenarRefeicoes(p.refeicoes)) {
    const { data: ref, error: erroRef } = await supabase
      .from("refeicoes")
      .insert({ plano_id: novo.id, nome: r.nome, horario: r.horario, ordem: r.ordem, observacao: r.observacao, dias_semana: r.dias_semana ?? [] })
      .select("*")
      .single();
    falhou(erroRef);
    const itens = ordenarItens(r.itens);
    if (itens.length) {
      const { error: erroItens } = await supabase.from("itens_refeicao").insert(
        itens.map((i) => ({
          refeicao_id: (ref as RefeicaoRow).id,
          alimento_id: i.alimento_id,
          quantidade_g: i.quantidade_g,
          medida_caseira_id: i.medida_caseira_id,
          quantidade_medida: i.quantidade_medida,
          ordem: i.ordem,
          substitutos: i.substitutos,
          observacao: i.observacao,
        })),
      );
      falhou(erroItens);
    }
  }
  const completo = await buscarPlano(novo.id);
  if (!completo) throw new Error("Não foi possível carregar a cópia do plano");
  return completo;
}

// ---- Refeições ----
export async function criarRefeicao(planoId: string, r: RegistroRefeicao, ordem: number): Promise<Refeicao> {
  const { data, error } = await supabase
    .from("refeicoes")
    .insert({ plano_id: planoId, nome: r.nome, horario: r.horario, observacao: r.observacao, ordem, ...(r.dias_semana ? { dias_semana: r.dias_semana } : {}) })
    .select("*")
    .single();
  falhou(error);
  return { ...(data as RefeicaoRow), itens: [] };
}

export async function atualizarRefeicao(id: string, r: RegistroRefeicao): Promise<RefeicaoRow> {
  const { data, error } = await supabase
    .from("refeicoes")
    .update({ nome: r.nome, horario: r.horario, observacao: r.observacao, ...(r.dias_semana ? { dias_semana: r.dias_semana } : {}) })
    .eq("id", id)
    .select("*")
    .single();
  falhou(error);
  return data as RefeicaoRow;
}

/** Apaga a refeição e os itens dela (de verdade — a lixeira guarda o plano, não a refeição). */
export async function excluirRefeicao(id: string): Promise<void> {
  const { error } = await supabase.from("refeicoes").delete().eq("id", id);
  falhou(error);
}

export async function salvarOrdemRefeicoes(ordens: { id: string; ordem: number }[]): Promise<void> {
  const resultados = await Promise.all(ordens.map((o) => supabase.from("refeicoes").update({ ordem: o.ordem }).eq("id", o.id)));
  for (const r of resultados) falhou(r.error);
}

// ---- Itens ----
const colunasItem = (r: RegistroItem) => ({
  quantidade_g: r.quantidade_g,
  medida_caseira_id: r.medida_caseira_id,
  quantidade_medida: r.quantidade_medida,
  observacao: r.observacao,
});

export async function criarItem(refeicaoId: string, alimentoId: string, r: RegistroItem, ordem: number): Promise<Item> {
  const { data, error } = await supabase
    .from("itens_refeicao")
    .insert({ refeicao_id: refeicaoId, alimento_id: alimentoId, ordem, ...colunasItem(r) })
    .select(SELECT_ITEM)
    .single();
  falhou(error);
  return montarItem(data as unknown as ItemBruto);
}

export type LinhaItemNovo = RegistroItem & { refeicao_id: string; alimento_id: string; receita_id: string | null; ordem: number };
/** Vários itens de uma vez (MESMAS chaves em todos — o PostgREST exige); devolve já com o alimento. Atalho 'Da receita' da W28. */
export async function criarItensEmLote(linhas: LinhaItemNovo[]): Promise<Item[]> {
  const { data, error } = await supabase.from("itens_refeicao").insert(linhas).select(SELECT_ITEM);
  falhou(error);
  return ordenarItens(((data ?? []) as unknown as ItemBruto[]).map(montarItem));
}

export async function atualizarItem(id: string, r: RegistroItem): Promise<Item> {
  const { data, error } = await supabase.from("itens_refeicao").update(colunasItem(r)).eq("id", id).select(SELECT_ITEM).single();
  falhou(error);
  return montarItem(data as unknown as ItemBruto);
}

export async function salvarSubstitutos(id: string, substitutos: Substituto[]): Promise<Item> {
  const { data, error } = await supabase.from("itens_refeicao").update({ substitutos: substitutos as unknown as Json }).eq("id", id).select(SELECT_ITEM).single();
  falhou(error);
  return montarItem(data as unknown as ItemBruto);
}

export async function excluirItem(id: string): Promise<void> {
  const { error } = await supabase.from("itens_refeicao").delete().eq("id", id);
  falhou(error);
}

/** Busca de alimentos do editor (TACO + próprios), até `limit` resultados — reusa a consulta da tela Meus alimentos. */
export async function buscarAlimentosDoPlano(q: string, limit = 12): Promise<Alimento[]> {
  const { itens } = await listarAlimentos({ q, grupo: "", fonte: "" }, 0, limit);
  return itens;
}

// ---- Physiq W16: plano por dia da semana (NF3) e cópia de um plano-modelo ----

/** "Copiar pra semana toda": as refeições do dia passam a valer todos os dias e as que eram só de outros dias saem. */
export async function copiarParaSemanaToda(paraTodosOsDias: string[], paraApagar: string[]): Promise<void> {
  if (paraTodosOsDias.length) {
    const { error } = await supabase.from("refeicoes").update({ dias_semana: [] }).in("id", paraTodosOsDias);
    falhou(error);
  }
  if (paraApagar.length) {
    const { error } = await supabase.from("refeicoes").delete().in("id", paraApagar);
    falhou(error);
  }
}

/** Usa um plano (★ modelo, de outro paciente) neste paciente: cópia completa com o título do modelo. */
export async function usarPlanoModelo(nutricionistaId: string, pacienteId: string, modelo: Plano): Promise<Plano> {
  const copia = await duplicarPlano(nutricionistaId, { ...modelo, paciente_id: pacienteId, favorito: false, calculo_energetico_id: null });
  const { data, error } = await supabase.from("planos_alimentares").update({ titulo: modelo.titulo.slice(0, TITULO_MAX) }).eq("id", copia.id).select("*").single();
  falhou(error);
  return { ...copia, ...(data as PlanoRow) };
}
