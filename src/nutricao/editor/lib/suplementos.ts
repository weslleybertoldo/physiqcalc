// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/suplementos.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { supabase } from "@/nutricao/editor/lib/banco";
import type { Database } from "@/nutricao/editor/lib/banco";
import { acaoNutricao } from "@/nutricao/servidor";
import { edicaoParaBanco, indicacaoParaBanco, produtoParaBanco, type FormIndicacao, type FormProduto } from "@/nutricao/editor/lib/suplementosUtil";

// Acesso da seção "Suplementos e produtos" (W26): `produtos` (catálogo da nutricionista — sem paciente) e `indicacoes_produto`
// (por paciente, com a CÓPIA de nome/marca/apresentação/categoria do produto no momento da indicação; `produto_id` só documenta
// a origem). RLS: a nutricionista só vê o dela; master vê tudo; criar indicação exige enxergar o paciente e, quando aponta pra
// um produto, que ele seja dela. Exclusão SOFT nas duas (deleted_at → Lixeira, W32): excluir um produto do catálogo NÃO mexe nas
// indicações já feitas (elas têm a própria cópia). `ordem` só vale entre as indicações ATIVAS. Os dados do perfil pro PDF são
// reexportados pra tela ter uma porta só.
// hml-19b (H-41 · jeito 2): as GRAVAÇÕES passam pela função nutricao (src/nutricao/servidor.ts), com a sessão de quem chama e as
// mesmas assinaturas (o dono é quem chama: o servidor põe; a indicação nasce ativa lá). O ▲▼ grava as ordens que mudaram numa chamada só,
// tudo ou nada (antes: N updates em paralelo).

export { nomeDaNutricionista } from "@/nutricao/editor/lib/profissional";
export { dadosProfissionais } from "@/nutricao/editor/lib/profissional";

export type Produto = Database["public"]["Tables"]["produtos"]["Row"];
export type Indicacao = Database["public"]["Tables"]["indicacoes_produto"]["Row"];

const T_PRODUTOS = "produtos";
const T_INDICACOES = "indicacoes_produto";

const falhou = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};

// ---- Catálogo ----

/** Produtos vivos da nutricionista (RLS), favoritos primeiro e depois por nome. */
export async function listarProdutos(): Promise<Produto[]> {
  const { data, error } = await supabase
    .from(T_PRODUTOS)
    .select("*")
    .is("deleted_at", null)
    .order("favorito", { ascending: false })
    .order("nome", { ascending: true });
  falhou(error);
  return (data ?? []) as Produto[];
}

export async function criarProduto(nutricionistaId: string, f: FormProduto): Promise<Produto> {
  const { linha } = await acaoNutricao<{ linha: Produto }>("produto_criar", produtoParaBanco(f));
  return linha;
}

/** Edita o produto do catálogo (as indicações já feitas mantêm a cópia antiga). */
export async function atualizarProduto(id: string, f: FormProduto): Promise<Produto> {
  const { linha } = await acaoNutricao<{ linha: Produto }>("produto_editar", { id, ...produtoParaBanco(f) });
  return linha;
}

export async function alternarFavorito(id: string, favorito: boolean): Promise<Produto> {
  const { linha } = await acaoNutricao<{ linha: Produto }>("produto_editar", { id, favorito });
  return linha;
}

/** Exclusão SOFT do produto (as indicações continuam com a cópia; `produto_id` segue apontando pra linha). */
export async function excluirProduto(id: string): Promise<void> {
  await acaoNutricao("produto_excluir", { id });
}

// ---- Indicações do paciente ----

/** Indicações vivas do paciente: ativas primeiro, na `ordem`, depois criação. */
export async function listarIndicacoesDoPaciente(pacienteId: string): Promise<Indicacao[]> {
  const { data, error } = await supabase
    .from(T_INDICACOES)
    .select("*")
    .eq("paciente_id", pacienteId)
    .is("deleted_at", null)
    .order("ativa", { ascending: false })
    .order("ordem", { ascending: true })
    .order("created_at", { ascending: true });
  falhou(error);
  return (data ?? []) as Indicacao[];
}

/** Cria a indicação copiando o produto escolhido (ou só o nome livre); `ordem` = próxima entre as ativas. Nasce ativa (o servidor põe). */
export async function criarIndicacao(nutricionistaId: string, pacienteId: string, f: FormIndicacao, ordem: number): Promise<Indicacao> {
  const { linha } = await acaoNutricao<{ linha: Indicacao }>("indicacao_criar", { paciente_id: pacienteId, ordem, ...indicacaoParaBanco(f) });
  return linha;
}

/** Edita só posologia/início/observação — a cópia do produto é histórico e não muda. */
export async function atualizarIndicacao(id: string, f: FormIndicacao): Promise<Indicacao> {
  const { linha } = await acaoNutricao<{ linha: Indicacao }>("indicacao_editar", { id, ...edicaoParaBanco(f) });
  return linha;
}

/** Encerrar (ativa = false) ou reativar (ativa = true, entrando no fim da lista com a `ordem` recebida). Reversível. */
export async function alternarAtiva(id: string, ativa: boolean, ordem?: number): Promise<Indicacao> {
  const patch: { ativa: boolean; ordem?: number } = { ativa };
  if (ativa && typeof ordem === "number") patch.ordem = ordem;
  const { linha } = await acaoNutricao<{ linha: Indicacao }>("indicacao_editar", { id, ...patch });
  return linha;
}

/** Grava a nova `ordem` só das que mudaram (▲▼) — numa chamada só, tudo ou nada. */
export async function salvarOrdem(mudancas: { id: string; ordem: number }[]): Promise<void> {
  if (!mudancas.length) return;
  await acaoNutricao("dieta_ordenar", { tabela: "indicacoes_produto", ordens: mudancas.map((m) => ({ id: m.id, ordem: m.ordem })) });
}

/** Exclusão SOFT (Lixeira, W32). */
export async function excluirIndicacao(id: string): Promise<void> {
  await acaoNutricao("indicacao_excluir", { id });
}
