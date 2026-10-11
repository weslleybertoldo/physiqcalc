// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/planos.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { supabase } from "@/nutricao/editor/lib/banco";
import type { Database } from "@/nutricao/editor/lib/banco";
import { acaoNutricao } from "@/nutricao/servidor";
import { listarAlimentos, type Alimento, type MedidaCaseira } from "@/nutricao/editor/lib/alimentos";
import { ordenarMedidas } from "@/nutricao/editor/lib/alimentosUtil";
import { REFEICOES_PADRAO, TITULO_MAX, ordenarItens, ordenarRefeicoes, type RegistroItem, type RegistroPlano, type RegistroRefeicao, type Substituto } from "@/nutricao/editor/lib/dietaUtil";

// Acesso às tabelas `planos_alimentares` → `refeicoes` → `itens_refeicao` (RLS: a nutricionista só vê os planos
// dela; refeições e itens seguem o plano; master vê tudo). Exclusão do PLANO é SOFT (deleted_at → Lixeira, W32);
// refeição e item saem de verdade. O item traz o alimento (W8) aninhado com as medidas caseiras — é dele que saem
// as kcal. A busca de alimentos do editor reusa `listarAlimentos` da W8.
// hml-17 (H-38): a LEITURA do plano vem das RPCs planos_do_aluno · plano_alimentar · planos_favoritos (migração
// 20261010100000_hml17_planos_do_aluno.sql): o banco confere quem vê o aluno e monta o plano com os alimentos de verdade — lido
// direto das tabelas, o RLS de `alimentos` tirava o alimento próprio da nutri de quem vê o aluno sem ser a autora (personal,
// dono, nutri que herdou) e o mesmo plano somava menos kcal. O JSON é o mesmo do select de antes (o montarPlano não mudou).
// hml-19b (H-41 · jeito 2): as GRAVAÇÕES passam pela função nutricao (src/nutricao/servidor.ts), com a sessão de quem chama, e as
// assinaturas não mudam (as telas não mudam). A nova prescrição, o duplicar/usar modelo ★, o subir/descer e o "copiar pra semana toda"
// viram 1 chamada cada (RPCs tudo-ou-nada no servidor). O dono é SEMPRE quem chama: o 1º argumento de criarPlano/duplicarPlano/
// usarPlanoModelo fica só por compatibilidade (o servidor não lê — corrige o duplicar do editor com o id da autora). O item salvo
// volta com o embed do RLS de quem grava e, se ele vier sem o alimento, fica o alimento que o editor já tinha
// (atualizarItem/salvarSubstitutos).

export type PlanoRow = Database["public"]["Tables"]["planos_alimentares"]["Row"];
export type RefeicaoRow = Database["public"]["Tables"]["refeicoes"]["Row"];
export type ItemRow = Database["public"]["Tables"]["itens_refeicao"]["Row"];
export type AlimentoDoPlano = Pick<Alimento, "id" | "nome" | "fonte" | "grupo" | "energia_kcal" | "proteina_g" | "carboidrato_g" | "lipidio_g" | "fibra_g" | "sodio_mg"> & {
  medidas_caseiras: MedidaCaseira[];
};
export type Item = ItemRow & { alimento: AlimentoDoPlano | null; receita?: { id: string; nome: string } | null };
export type Refeicao = RefeicaoRow & { itens: Item[] };
export type Plano = PlanoRow & { refeicoes: Refeicao[] };

/** hml-17 (H-61 nos arquivos tocados): os textos das leituras do plano — a frase crua do banco não vai para a tela. */
export const ERRO_LER_PLANOS = "Não deu para carregar os planos alimentares agora. Tente de novo.";
export const ERRO_LER_PLANO = "Não deu para abrir o plano alimentar agora. Tente de novo.";
export const ERRO_LER_MODELOS = "Não deu para carregar os planos ★ agora. Tente de novo.";

/** Erro de leitura: o texto fixo para a tela e o código (com a mensagem do banco) só no console. */
const falhouLeitura = (error: { message: string; code?: string } | null, texto: string): void => {
  if (!error) return;
  console.warn("[planos] leitura:", error.code ?? "", error.message);
  throw new Error(texto);
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

// ---- Planos (leitura pelas RPCs da hml-17) ----
/** Planos do paciente (mais recente primeiro), já com refeições, itens e alimentos — a lista mostra kcal/macros. Quem não vê o
 *  aluno recebe [] (como o RLS). */
export async function listarPlanos(pacienteId: string): Promise<Plano[]> {
  const { data, error } = await supabase.rpc("planos_do_aluno" as never, { p_aluno: pacienteId } as never);
  falhouLeitura(error, ERRO_LER_PLANOS);
  return (Array.isArray(data) ? (data as unknown as PlanoBruto[]) : []).map(montarPlano);
}

export type PlanoFavorito = Plano & { paciente: { id: string; nome: string; conta_id?: string | null } | null };
type PlanoFavoritoBruto = PlanoBruto & { paciente?: { id: string; nome: string; conta_id?: string | null } | null };

/** Planos FAVORITOS (★) que a pessoa vê, de todos os pacientes (o "Usar um modelo ★" e a Ferramentas › Modelos), do mais recente
 *  para o mais antigo — com o paciente {id, nome, conta_id} pro resumo/deep link. */
export async function listarPlanosFavoritos(): Promise<PlanoFavorito[]> {
  const { data, error } = await supabase.rpc("planos_favoritos" as never);
  falhouLeitura(error, ERRO_LER_MODELOS);
  return (Array.isArray(data) ? (data as unknown as PlanoFavoritoBruto[]) : []).map((p) => ({ ...montarPlano(p), paciente: p.paciente ?? null }));
}

/** Um plano vivo; não existe, na lixeira ou a pessoa não vê → null. */
export async function buscarPlano(id: string): Promise<Plano | null> {
  const { data, error } = await supabase.rpc("plano_alimentar" as never, { p_plano: id } as never);
  falhouLeitura(error, ERRO_LER_PLANO);
  return data && typeof data === "object" && !Array.isArray(data) ? montarPlano(data as unknown as PlanoBruto) : null;
}

const colunasPlano = (r: RegistroPlano) => ({ titulo: r.titulo, kcal_alvo: r.kcal_alvo, observacao: r.observacao });

/** Cria o plano já com as refeições padrão (Café da manhã 07:00 … Ceia 22:00) — 1 chamada (antes: plano + refeições em série). */
export async function criarPlano(nutricionistaId: string, pacienteId: string, r: RegistroPlano, calculoEnergeticoId: string | null): Promise<Plano> {
  const resp = await acaoNutricao<{ plano: PlanoRow; refeicoes: RefeicaoRow[] }>("plano_criar", {
    paciente_id: pacienteId,
    calculo_energetico_id: calculoEnergeticoId,
    ...colunasPlano(r),
    refeicoes: REFEICOES_PADRAO.map((x, i) => ({ nome: x.nome, horario: x.horario, ordem: i })),
  });
  return montarPlano({ ...resp.plano, refeicoes: (resp.refeicoes ?? []).map((x) => ({ ...x, itens: [] })) });
}

export async function atualizarPlano(id: string, r: RegistroPlano): Promise<PlanoRow> {
  const { linha } = await acaoNutricao<{ linha: PlanoRow }>("plano_editar", { id, ...colunasPlano(r) });
  return linha;
}

export async function favoritarPlano(id: string, favorito: boolean): Promise<PlanoRow> {
  const { linha } = await acaoNutricao<{ linha: PlanoRow }>("plano_editar", { id, favorito });
  return linha;
}

export async function excluirPlano(id: string): Promise<void> {
  await acaoNutricao("plano_excluir", { id });
}

/**
 * Cópia completa (plano + refeições + itens com substitutos) do plano `p`, no MESMO aluno; o título ganha " (cópia)". 1 chamada (antes:
 * 1 + R + R' em série, sem transação). A cópia é de QUEM CHAMA (o servidor põe o dono; `nutricionistaId` não vai). Devolve a cópia montada.
 */
export async function duplicarPlano(nutricionistaId: string, p: Plano): Promise<Plano> {
  const { plano } = await acaoNutricao<{ plano: PlanoBruto }>("plano_duplicar", { plano_id: p.id, titulo: `${p.titulo} (cópia)`.slice(0, TITULO_MAX) });
  return montarPlano(plano);
}

// ---- Refeições ----
export async function criarRefeicao(planoId: string, r: RegistroRefeicao, ordem: number): Promise<Refeicao> {
  const { linha } = await acaoNutricao<{ linha: RefeicaoRow }>("refeicao_criar", {
    plano_id: planoId, nome: r.nome, horario: r.horario, observacao: r.observacao, ordem, ...(r.dias_semana ? { dias_semana: r.dias_semana } : {}),
  });
  return { ...linha, itens: [] };
}

export async function atualizarRefeicao(id: string, r: RegistroRefeicao): Promise<RefeicaoRow> {
  const { linha } = await acaoNutricao<{ linha: RefeicaoRow }>("refeicao_editar", {
    id, nome: r.nome, horario: r.horario, observacao: r.observacao, ...(r.dias_semana ? { dias_semana: r.dias_semana } : {}),
  });
  return linha;
}

/** Apaga a refeição e os itens dela (de verdade — a lixeira guarda o plano, não a refeição). */
export async function excluirRefeicao(id: string): Promise<void> {
  await acaoNutricao("refeicao_excluir", { id });
}

/** As ordens que mudaram (subir/descer), numa chamada só e tudo ou nada (antes: N updates em paralelo). */
export async function salvarOrdemRefeicoes(ordens: { id: string; ordem: number }[]): Promise<void> {
  if (!ordens.length) return;
  await acaoNutricao("dieta_ordenar", { tabela: "refeicoes", ordens: ordens.map((o) => ({ id: o.id, ordem: o.ordem })) });
}

// ---- Itens ----
const colunasItem = (r: RegistroItem) => ({
  quantidade_g: r.quantidade_g,
  medida_caseira_id: r.medida_caseira_id,
  quantidade_medida: r.quantidade_medida,
  observacao: r.observacao,
});

export async function criarItem(refeicaoId: string, alimentoId: string, r: RegistroItem, ordem: number): Promise<Item> {
  const { linha } = await acaoNutricao<{ linha: ItemBruto }>("item_criar", { refeicao_id: refeicaoId, alimento_id: alimentoId, ordem, ...colunasItem(r) });
  return montarItem(linha);
}

export type LinhaItemNovo = RegistroItem & { refeicao_id: string; alimento_id: string; receita_id: string | null; ordem: number };
/** Vários itens de uma vez (MESMAS chaves em todos); devolve já com o alimento. Atalho 'Da receita' da W28. */
export async function criarItensEmLote(linhas: LinhaItemNovo[]): Promise<Item[]> {
  const { linhas: salvas } = await acaoNutricao<{ linhas: ItemBruto[] }>("itens_criar", { linhas });
  return ordenarItens((salvas ?? []).map(montarItem));
}

/**
 * hml-17 (H-38): o item que a gravação devolve vem com o embed do RLS — para quem não é a autora do alimento (personal, dono,
 * nutri que herdou o aluno) o alimento vem null. O editor já tinha o alimento (o plano veio da RPC): fica ele, se for o mesmo.
 */
export function manterAlimento(salvo: Item, alimentoAtual: AlimentoDoPlano | null | undefined): Item {
  if (salvo.alimento || !alimentoAtual || alimentoAtual.id !== salvo.alimento_id) return salvo;
  return { ...salvo, alimento: alimentoAtual };
}

export async function atualizarItem(id: string, r: RegistroItem, alimentoAtual?: AlimentoDoPlano | null): Promise<Item> {
  const { linha } = await acaoNutricao<{ linha: ItemBruto }>("item_editar", { id, ...colunasItem(r) });
  return manterAlimento(montarItem(linha), alimentoAtual);
}

export async function salvarSubstitutos(id: string, substitutos: Substituto[], alimentoAtual?: AlimentoDoPlano | null): Promise<Item> {
  const { linha } = await acaoNutricao<{ linha: ItemBruto }>("item_editar", { id, substitutos });
  return manterAlimento(montarItem(linha), alimentoAtual);
}

export async function excluirItem(id: string): Promise<void> {
  await acaoNutricao("item_excluir", { id });
}

/** Busca de alimentos do editor (TACO + próprios), até `limit` resultados — reusa a consulta da tela Meus alimentos. */
export async function buscarAlimentosDoPlano(q: string, limit = 12): Promise<Alimento[]> {
  const { itens } = await listarAlimentos({ q, grupo: "", fonte: "" }, 0, limit);
  return itens;
}

// ---- Physiq W16: plano por dia da semana (NF3) e cópia de um plano-modelo ----

/** "Copiar pra semana toda": as refeições do dia passam a valer todos os dias e as que eram só de outros dias saem — juntos, numa chamada. */
export async function copiarParaSemanaToda(paraTodosOsDias: string[], paraApagar: string[]): Promise<void> {
  if (!paraTodosOsDias.length && !paraApagar.length) return;
  await acaoNutricao("plano_copiar_semana", { para_todos: paraTodosOsDias, para_apagar: paraApagar });
}

/** Usa um plano (★ modelo, de outro paciente) neste paciente: cópia completa com o título do modelo, sem o cálculo — 1 chamada (antes: a
 *  cópia + o título em série). A cópia é de quem chama. */
export async function usarPlanoModelo(nutricionistaId: string, pacienteId: string, modelo: Plano): Promise<Plano> {
  const { plano } = await acaoNutricao<{ plano: PlanoBruto }>("plano_duplicar", { plano_id: modelo.id, paciente_id: pacienteId, titulo: modelo.titulo.slice(0, TITULO_MAX) });
  return montarPlano(plano);
}
