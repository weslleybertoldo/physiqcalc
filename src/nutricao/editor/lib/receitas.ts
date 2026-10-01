// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/receitas.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { supabase } from "@/nutricao/editor/lib/banco";
import type { Database } from "@/nutricao/editor/lib/banco";
import type { Alimento, MedidaCaseira } from "@/nutricao/editor/lib/alimentos";
import { ordenarMedidas } from "@/nutricao/editor/lib/alimentosUtil";
import { criarItensEmLote, type Item } from "@/nutricao/editor/lib/planos";
import { escalarIngredientes, medidaInteira, ordenarGrupos, ordenarIngredientes, ordenarReceitas, type RegistroIngrediente, type RegistroReceita } from "@/nutricao/editor/lib/receitasUtil";

// Acesso às tabelas `grupos_receita`, `receitas` → `ingredientes_receita` (RLS: a nutricionista só vê as dela; ingredientes seguem a
// receita; master vê tudo). Exclusão de RECEITA e GRUPO é SOFT (deleted_at → Lixeira, W32); ingredientes saem de verdade (editar
// apaga e regrava). O ingrediente traz o alimento (W8) aninhado com as medidas caseiras — é dele que saem as kcal. O atalho 'Da
// receita' do plano (W9) insere os ingredientes escalados como itens da refeição, em lote, com `receita_id`.

export { nomeDaNutricionista } from "@/nutricao/editor/lib/profissional";
export { dadosProfissionais } from "@/nutricao/editor/lib/profissional";

export type GrupoReceita = Database["public"]["Tables"]["grupos_receita"]["Row"];
export type ReceitaRow = Database["public"]["Tables"]["receitas"]["Row"];
export type IngredienteRow = Database["public"]["Tables"]["ingredientes_receita"]["Row"];
export type AlimentoDoIngrediente = Pick<Alimento, "id" | "nome" | "fonte" | "grupo" | "energia_kcal" | "proteina_g" | "carboidrato_g" | "lipidio_g" | "fibra_g" | "sodio_mg"> & {
  medidas_caseiras: MedidaCaseira[];
};
export type Ingrediente = IngredienteRow & { alimento: AlimentoDoIngrediente | null };
export type Receita = ReceitaRow & { ingredientes: Ingrediente[] };

const ALIMENTO = "alimento:alimentos(id, nome, fonte, grupo, energia_kcal, proteina_g, carboidrato_g, lipidio_g, fibra_g, sodio_mg, medidas_caseiras(*))";
const SELECT_RECEITA = `*, ingredientes:ingredientes_receita(*, ${ALIMENTO})`;

const falhou = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};
/** O índice único parcial (nutricionista, lower(nome)) devolve 23505 — vira a mensagem da tela. */
const falhouGrupo = (error: { message: string; code?: string } | null): void => {
  if (error) throw new Error(error.code === "23505" || /grupos_receita_nutri_nome_uniq/.test(error.message) ? "Já existe um grupo com esse nome" : error.message);
};

type AlimentoBruto = Omit<AlimentoDoIngrediente, "medidas_caseiras"> & { medidas_caseiras: MedidaCaseira[] | null };
type IngredienteBruto = IngredienteRow & { alimento?: AlimentoBruto | null };
type ReceitaBruta = ReceitaRow & { ingredientes?: IngredienteBruto[] | null };

const montarIngrediente = (i: IngredienteBruto): Ingrediente => ({
  ...i,
  alimento: i.alimento ? { ...i.alimento, medidas_caseiras: ordenarMedidas(i.alimento.medidas_caseiras ?? []) } : null,
});
const montarReceita = (r: ReceitaBruta): Receita => ({ ...r, ingredientes: ordenarIngredientes((r.ingredientes ?? []).map(montarIngrediente)) });

// ---- Grupos ----
export async function listarGrupos(): Promise<GrupoReceita[]> {
  const { data, error } = await supabase.from("grupos_receita").select("*").is("deleted_at", null).order("ordem").order("nome");
  falhou(error);
  return ordenarGrupos((data ?? []) as GrupoReceita[]);
}

export async function criarGrupo(nutricionistaId: string, nome: string): Promise<GrupoReceita> {
  const { data, error } = await supabase.from("grupos_receita").insert({ nutricionista_id: nutricionistaId, nome: nome.trim() }).select("*").single();
  falhouGrupo(error);
  return data as GrupoReceita;
}

export async function renomearGrupo(id: string, nome: string): Promise<GrupoReceita> {
  const { data, error } = await supabase.from("grupos_receita").update({ nome: nome.trim() }).eq("id", id).is("deleted_at", null).select("*").maybeSingle();
  falhouGrupo(error);
  if (!data) throw new Error("Grupo não encontrado");
  return data as GrupoReceita;
}

/** Soft: o grupo vai pra lixeira e as receitas VIVAS dele ficam sem grupo. */
export async function excluirGrupo(id: string): Promise<void> {
  const { error: erroReceitas } = await supabase.from("receitas").update({ grupo_id: null }).eq("grupo_id", id).is("deleted_at", null);
  falhou(erroReceitas);
  const { data, error } = await supabase.from("grupos_receita").update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null).select("id").maybeSingle();
  falhou(error);
  if (!data) throw new Error("Grupo não encontrado");
}

// ---- Receitas ----
/** Todas as receitas vivas da nutricionista, com ingredientes e alimentos (a lista mostra kcal/porção e macros). */
export async function listarReceitas(): Promise<Receita[]> {
  const { data, error } = await supabase.from("receitas").select(SELECT_RECEITA).is("deleted_at", null).order("nome");
  falhou(error);
  return ordenarReceitas(((data ?? []) as unknown as ReceitaBruta[]).map(montarReceita));
}

export async function buscarReceita(id: string): Promise<Receita | null> {
  const { data, error } = await supabase.from("receitas").select(SELECT_RECEITA).eq("id", id).is("deleted_at", null).maybeSingle();
  falhou(error);
  return data ? montarReceita(data as unknown as ReceitaBruta) : null;
}

const colunasReceita = (r: RegistroReceita) => ({
  nome: r.nome,
  grupo_id: r.grupo_id,
  porcoes: r.porcoes,
  rendimento_g: r.rendimento_g,
  tempo_preparo_min: r.tempo_preparo_min,
  modo_preparo: r.modo_preparo,
  observacao: r.observacao,
  favorita: r.favorita,
});
/** Linhas do insert em LOTE — as MESMAS chaves em todos os objetos (PostgREST exige). */
const linhasIngredientes = (receitaId: string, ingredientes: RegistroIngrediente[]) =>
  ingredientes.map((i, k) => ({
    receita_id: receitaId,
    alimento_id: i.alimento_id,
    quantidade_g: i.quantidade_g,
    medida_caseira_id: i.medida_caseira_id,
    quantidade_medida: i.quantidade_medida,
    ordem: k,
    observacao: i.observacao,
  }));

export async function criarReceita(nutricionistaId: string, r: RegistroReceita, ingredientes: RegistroIngrediente[]): Promise<Receita> {
  const { data, error } = await supabase.from("receitas").insert({ nutricionista_id: nutricionistaId, ...colunasReceita(r) }).select("id").single();
  falhou(error);
  const id = (data as { id: string }).id;
  if (ingredientes.length) {
    const { error: erroIng } = await supabase.from("ingredientes_receita").insert(linhasIngredientes(id, ingredientes));
    if (erroIng) {
      await supabase.from("receitas").delete().eq("id", id); // não deixa uma receita sem ingredientes no banco
      throw new Error(erroIng.message);
    }
  }
  const receita = await buscarReceita(id);
  if (!receita) throw new Error("Receita não encontrada depois de salvar");
  return receita;
}

/** Atualiza a receita e REGRAVA os ingredientes (apaga os antigos, insere os novos). */
export async function atualizarReceita(id: string, r: RegistroReceita, ingredientes: RegistroIngrediente[]): Promise<Receita> {
  const { data, error } = await supabase.from("receitas").update(colunasReceita(r)).eq("id", id).is("deleted_at", null).select("id").maybeSingle();
  falhou(error);
  if (!data) throw new Error("Receita não encontrada");
  const { error: erroDel } = await supabase.from("ingredientes_receita").delete().eq("receita_id", id);
  falhou(erroDel);
  if (ingredientes.length) {
    const { error: erroIns } = await supabase.from("ingredientes_receita").insert(linhasIngredientes(id, ingredientes));
    falhou(erroIns);
  }
  const receita = await buscarReceita(id);
  if (!receita) throw new Error("Receita não encontrada depois de salvar");
  return receita;
}

export async function alternarFavorita(id: string, favorita: boolean): Promise<Receita> {
  const { data, error } = await supabase.from("receitas").update({ favorita }).eq("id", id).is("deleted_at", null).select(SELECT_RECEITA).maybeSingle();
  falhou(error);
  if (!data) throw new Error("Receita não encontrada");
  return montarReceita(data as unknown as ReceitaBruta);
}

/** Cópia própria (nunca favorita) com os mesmos dados e ingredientes. */
export async function duplicarReceita(r: Receita, nomeNovo: string): Promise<Receita> {
  return criarReceita(
    r.nutricionista_id,
    {
      nome: nomeNovo,
      grupo_id: r.grupo_id,
      porcoes: Number(r.porcoes),
      rendimento_g: r.rendimento_g === null ? null : Number(r.rendimento_g),
      tempo_preparo_min: r.tempo_preparo_min,
      modo_preparo: r.modo_preparo ?? "",
      observacao: r.observacao ?? "",
      favorita: false,
    },
    r.ingredientes.map((i, k) => ({
      alimento_id: i.alimento_id,
      quantidade_g: Number(i.quantidade_g),
      medida_caseira_id: i.medida_caseira_id,
      quantidade_medida: i.quantidade_medida === null ? null : Number(i.quantidade_medida),
      ordem: k,
      observacao: i.observacao ?? "",
    })),
  );
}

/** Soft (Lixeira). Os itens do plano que vieram dela continuam (o `receita_id` só documenta). */
export async function excluirReceita(id: string): Promise<void> {
  const { data, error } = await supabase.from("receitas").update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null).select("id").maybeSingle();
  falhou(error);
  if (!data) throw new Error("Receita não encontrada");
}

// ---- Integração com o plano (W9) ----
/**
 * Os INGREDIENTES da receita, escalados pro nº de porções, entram como itens da refeição — 1 insert em lote, `receita_id` em todos,
 * ordem no fim. A medida caseira só vai junto quando a quantidade escalada fica inteira; senão só as gramas.
 */
export async function inserirItensDeReceita(refeicaoId: string, receita: Receita, porcoes: number, ordemInicial: number): Promise<Item[]> {
  const escalados = escalarIngredientes(receita.ingredientes.filter((i) => !!i.alimento), porcoes, Number(receita.porcoes));
  const linhas = escalados.map((i, k) => {
    const comMedida = !!i.medida_caseira_id && medidaInteira(i.quantidade_medida);
    return {
      refeicao_id: refeicaoId,
      alimento_id: i.alimento_id,
      receita_id: receita.id,
      ordem: ordemInicial + k,
      quantidade_g: i.quantidade_g,
      medida_caseira_id: comMedida ? i.medida_caseira_id : null,
      quantidade_medida: comMedida ? i.quantidade_medida : null,
      observacao: i.observacao?.trim() ? i.observacao.trim() : null,
    };
  });
  if (!linhas.length) throw new Error("A receita não tem ingredientes");
  return criarItensEmLote(linhas);
}
