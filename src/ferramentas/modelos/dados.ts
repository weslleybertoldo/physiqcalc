// Physiq W26 — acesso da Ferramentas › Modelos (N-15; porte do src/lib/favoritos.ts do PhysiqNutri): NÃO tem tabela própria. Lê o que
// tem ★ nas tabelas das telas donas do banco principal (modelos de anamnese, orientação, recibo, documento, meta e fórmula; catálogo de
// exames; questionários; produtos; receitas; planos alimentares) e os treinos das pastas do Banco do Treino (W23, com a sessão do
// Treino). Só o que é DA PESSOA (autor = ela) — também para o master, como a W24 fez com Alimentos e Receitas ("TACO + os seus") — e,
// nos planos, só os alunos da conta ativa. `Promise.allSettled` por fonte: uma que falhar não derruba a tela (o erro vai em
// `erros[tipo]`). Tirar o ★ é o mesmo UPDATE da tela dona (RLS: só o autor).
import { principal } from "@/integrations/principal/client";
import { totaisDoPlano, type ItemCalc } from "@/nutricao/editor/lib/dietaUtil";
import { calcularReceita, type IngredienteCalc } from "@/nutricao/editor/lib/receitasUtil";
import { carregarCatalogo } from "@/painel/treinos/api";
import { montarModelos, type FonteTreino, type FontesModelos, type ModeloItem, type TipoModelo } from "./regras";

export type ErrosModelos = Partial<Record<TipoModelo, string>>;
export interface ResultadoModelos {
  itens: ModeloItem[];
  erros: ErrosModelos;
}

const mensagem = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const falhou = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};
// as tabelas das donas são várias; o supabase-js tipado não aceita o nome dinâmico
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tabela = (nome: string) => (principal.from as any)(nome);

/** As linhas ★ da pessoa numa tabela de modelos (fora da lixeira). */
async function favoritosDe<T>(nome: string, colunas: string, uid: string, coluna = "favorito"): Promise<T[]> {
  const { data, error } = await tabela(nome).select(colunas).eq(coluna, true).eq("nutricionista_id", uid).is("deleted_at", null).limit(500);
  falhou(error);
  return (data ?? []) as T[];
}

const ALIMENTO = "alimento:alimentos(id, nome, fonte, grupo, energia_kcal, proteina_g, carboidrato_g, lipidio_g, fibra_g, sodio_mg, medidas_caseiras(*))";

type PlanoBruto = {
  id: string;
  titulo: string;
  updated_at: string | null;
  paciente_id: string;
  paciente: { id: string; nome: string; conta_id: string | null } | null;
  refeicoes: { itens: ItemCalc[] | null }[] | null;
};
type ReceitaBruta = { id: string; nome: string; updated_at: string | null; porcoes: number; rendimento_g: number | null; ingredientes: IngredienteCalc[] | null };

/** Os treinos das pastas que a pessoa vê no Painel › Treinos (as dela e as do catálogo global, só leitura). */
export async function treinosDasPastas(meuIdTreino: string | null): Promise<FonteTreino[]> {
  const c = await carregarCatalogo(meuIdTreino);
  const modelos = new Map(c.modelos.map((m) => [m.id, m]));
  const pastas = new Map(c.pastas.map((p) => [p.id, p]));
  const exercicios = new Map<string, number>();
  for (const l of c.linhas) exercicios.set(l.grupo_id, (exercicios.get(l.grupo_id) ?? 0) + 1);
  const saida: FonteTreino[] = [];
  for (const v of c.vinculos) {
    const m = modelos.get(v.grupo_id);
    const p = pastas.get(v.pasta_id);
    if (!m || !p) continue;
    saida.push({ id: m.id, nome: m.nome, pasta_id: p.id, pasta_nome: p.nome, exercicios: exercicios.get(m.id) ?? 0, global: !m.professor_id });
  }
  return saida;
}

export interface QuemListaModelos {
  uid: string;
  contaId: string;
  /** o id do Treino (sessão do Treino) para a aba Treinos; null = sem a aba */
  treinoId: string | null;
  fontes: Set<TipoModelo>;
}

export async function listarModelos(q: QuemListaModelos): Promise<ResultadoModelos> {
  const fontes: FontesModelos = {};
  const erros: ErrosModelos = {};
  const { uid, contaId } = q;
  const todos: { tipo: TipoModelo; rodar: () => Promise<void> }[] = [
    { tipo: "treino", rodar: async () => { fontes.treinos = await treinosDasPastas(q.treinoId); } },
    { tipo: "anamnese", rodar: async () => { fontes.anamneses = await favoritosDe("modelos_anamnese", "id, updated_at, titulo, perguntas", uid); } },
    {
      tipo: "plano",
      rodar: async () => {
        const { data, error } = await principal
          .from("planos_alimentares")
          .select(`id, titulo, updated_at, paciente_id, paciente:pacientes!inner(id, nome, conta_id), refeicoes(itens:itens_refeicao(quantidade_g, medida_caseira_id, quantidade_medida, ${ALIMENTO}))`)
          .eq("favorito", true)
          .is("deleted_at", null)
          .eq("nutricionista_id", uid)
          .eq("paciente.conta_id", contaId)
          .order("updated_at", { ascending: false })
          .limit(300);
        falhou(error);
        fontes.planos = ((data ?? []) as unknown as PlanoBruto[]).map((p) => {
          const refeicoes = (p.refeicoes ?? []).map((r) => ({ itens: r.itens ?? [] }));
          return {
            id: p.id,
            updated_at: p.updated_at,
            titulo: p.titulo,
            paciente_id: p.paciente_id,
            paciente_nome: p.paciente?.nome ?? null,
            kcal: totaisDoPlano(refeicoes).energia_kcal,
            refeicoes: refeicoes.length,
          };
        });
      },
    },
    { tipo: "orientacao", rodar: async () => { fontes.orientacoes = await favoritosDe("modelos_orientacao", "id, updated_at, titulo, conteudo", uid); } },
    { tipo: "recibo", rodar: async () => { fontes.recibos = await favoritosDe("modelos_recibo", "id, updated_at, titulo, conteudo", uid); } },
    { tipo: "documento", rodar: async () => { fontes.documentos = await favoritosDe("modelos_documento", "id, updated_at, titulo, tipo", uid); } },
    { tipo: "meta", rodar: async () => { fontes.metas = await favoritosDe("modelos_meta", "id, updated_at, titulo, dias_semana", uid); } },
    { tipo: "manipulado", rodar: async () => { fontes.manipulados = await favoritosDe("modelos_formula", "id, updated_at, titulo, ativos", uid); } },
    { tipo: "exame", rodar: async () => { fontes.exames = await favoritosDe("exames_catalogo", "id, updated_at, nome, unidade, ref_min, ref_max, referencia_texto", uid); } },
    { tipo: "questionario", rodar: async () => { fontes.questionarios = await favoritosDe("questionarios", "id, updated_at, titulo, perguntas", uid); } },
    { tipo: "produto", rodar: async () => { fontes.produtos = await favoritosDe("produtos", "id, updated_at, nome, marca, categoria", uid); } },
    {
      tipo: "receita",
      rodar: async () => {
        const linhas = await favoritosDe<ReceitaBruta>("receitas", `id, nome, updated_at, porcoes, rendimento_g, ingredientes:ingredientes_receita(quantidade_g, medida_caseira_id, quantidade_medida, ${ALIMENTO})`, uid, "favorita");
        fontes.receitas = linhas.map((r) => {
          const ingredientes = r.ingredientes ?? [];
          const calc = calcularReceita({ porcoes: Number(r.porcoes), rendimento_g: r.rendimento_g === null ? null : Number(r.rendimento_g) }, ingredientes);
          return { id: r.id, updated_at: r.updated_at, nome: r.nome, porcoes: Number(r.porcoes), kcal_porcao: calc.porPorcao.energia_kcal, ingredientes: ingredientes.length };
        });
      },
    },
  ];
  const passos = todos.filter((p) => q.fontes.has(p.tipo) && (p.tipo !== "treino" || !!q.treinoId));

  const resultados = await Promise.allSettled(passos.map((p) => p.rodar()));
  resultados.forEach((r, i) => {
    if (r.status === "rejected") erros[passos[i].tipo] = mensagem(r.reason);
  });
  return { itens: montarModelos(fontes), erros };
}

const TABELA_DO_TIPO: Partial<Record<TipoModelo, { tabela: string; coluna: string }>> = {
  anamnese: { tabela: "modelos_anamnese", coluna: "favorito" },
  plano: { tabela: "planos_alimentares", coluna: "favorito" },
  orientacao: { tabela: "modelos_orientacao", coluna: "favorito" },
  recibo: { tabela: "modelos_recibo", coluna: "favorito" },
  documento: { tabela: "modelos_documento", coluna: "favorito" },
  meta: { tabela: "modelos_meta", coluna: "favorito" },
  manipulado: { tabela: "modelos_formula", coluna: "favorito" },
  exame: { tabela: "exames_catalogo", coluna: "favorito" },
  questionario: { tabela: "questionarios", coluna: "favorito" },
  produto: { tabela: "produtos", coluna: "favorito" },
  receita: { tabela: "receitas", coluna: "favorita" },
};

/** ★ Tirar dos modelos — o mesmo UPDATE da tela dona (a RLS só deixa o autor). 0 linhas = sem permissão. */
export async function desfavoritar(tipo: TipoModelo, id: string): Promise<void> {
  const t = TABELA_DO_TIPO[tipo];
  if (!t) throw new Error("Os treinos não têm estrela: eles ficam nas pastas do Painel › Treinos.");
  const { data, error } = await tabela(t.tabela).update({ [t.coluna]: false }).eq("id", id).select("id").maybeSingle();
  falhou(error);
  if (!data) throw new Error("Só quem criou pode tirar a estrela.");
}
