// Physiq W26 — acesso da Ferramentas › Modelos (N-15; porte do src/lib/favoritos.ts do PhysiqNutri): NÃO tem tabela própria. Lê o que
// tem ★ nas tabelas das telas donas do banco principal (modelos de anamnese, orientação, recibo, documento, meta e fórmula; catálogo de
// exames; questionários; produtos; receitas; planos alimentares) e os treinos das pastas do Banco do Treino (W23, com a sessão do
// Treino). Só o que é DA PESSOA (autor = ela) — também para o master, como a W24 fez com Alimentos e Receitas ("TACO + os seus") — e,
// nos planos, só os alunos da conta ativa. `Promise.allSettled` por fonte: uma que falhar não derruba a tela (o erro vai em
// `erros[tipo]`). Tirar o ★ é o mesmo UPDATE da tela dona (RLS: só o autor).
// hml-21c (H-43/H-112 · jeito 2, etapa 3): os ★ pelas funções (o servidor lê como a pessoa, o mesmo filtro de hoje): os 9 tipos da nutrição
// num `ler` da nutricao (modelos_favoritos_<tipo>, no MESMO lote dos planos ★) ∥ os de recibo num `ler` da financeiro
// (fin_modelos_recibo_favoritos) — 2 funções em paralelo, não série. Tirar o ★ pelas ações *_editar que já existem (o mesmo UPDATE, no
// servidor; 0 linha = a frase de hoje). Os treinos (o catálogo do Treino) seguem como estão (o desvio do gate da 21d).
import { lerFinanceiro } from "@/financeiro/ler";
import { gravarFinanceiro } from "@/financeiro/gravar";
import { lerNutricao, type ConsultaDaNutricao } from "@/nutricao/leitura";
import { acaoNutricao, type AcaoDaFuncao } from "@/nutricao/servidor";
import { totaisDoPlano } from "@/nutricao/editor/lib/dietaUtil";
import { listarPlanosFavoritos } from "@/nutricao/editor/lib/planos";
import { calcularReceita, type IngredienteCalc } from "@/nutricao/editor/lib/receitasUtil";
import { carregarCatalogo } from "@/painel/treinos/api";
import { montarModelos, type FonteTreino, type FontesModelos, type ModeloItem, type TipoModelo } from "./regras";

export type ErrosModelos = Partial<Record<TipoModelo, string>>;
export interface ResultadoModelos {
  itens: ModeloItem[];
  erros: ErrosModelos;
}

const mensagem = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * hml-21c: as linhas ★ da pessoa num tipo (fora da lixeira, até 500) — a consulta da função (o servidor filtra pelo dono do token: o `uid` não
 * vai mais; as colunas são as do select de hoje). O erro: o da leitura (a frase fixa do código), por tipo, como hoje.
 */
async function favoritosDe<T>(q: ConsultaDaNutricao): Promise<T[]> {
  return ((await lerNutricao(q)).linhas ?? []) as T[];
}

/** Os planos ★ que a Ferramentas › Modelos lista (o limite de antes da hml-17). */
const MAX_PLANOS = 300;

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
    { tipo: "anamnese", rodar: async () => { fontes.anamneses = await favoritosDe("modelos_favoritos_anamnese"); } },
    {
      tipo: "plano",
      // hml-17 (H-38): os ★ vêm da planos_favoritos (o banco monta o plano com os alimentos de verdade — lidos direto, o RLS de
      // alimentos tirava o alimento de outra nutri e a kcal do ★ caía); aqui ficam só os da pessoa e os alunos da conta ativa,
      // do mais recente para o mais antigo (o filtro de antes). hml-20c (H-108): o filtro vai ao SERVIDOR (o dono do token e a conta) —
      // os ★ das outras contas não descem; o filtro daqui fica como 2ª trava
      rodar: async () => {
        const planos = (await listarPlanosFavoritos({ conta: contaId })).filter((p) => p.nutricionista_id === uid && p.paciente?.conta_id === contaId);
        fontes.planos = planos.slice(0, MAX_PLANOS).map((p) => ({
          id: p.id,
          updated_at: p.updated_at,
          titulo: p.titulo,
          paciente_id: p.paciente_id,
          paciente_nome: p.paciente?.nome ?? null,
          kcal: totaisDoPlano(p.refeicoes).energia_kcal,
          refeicoes: p.refeicoes.length,
        }));
      },
    },
    { tipo: "orientacao", rodar: async () => { fontes.orientacoes = await favoritosDe("modelos_favoritos_orientacao"); } },
    // os ★ de recibo moram na financeiro (o outro `ler`, em paralelo)
    { tipo: "recibo", rodar: async () => { fontes.recibos = ((await lerFinanceiro("fin_modelos_recibo_favoritos")).linhas ?? []) as NonNullable<FontesModelos["recibos"]>; } },
    { tipo: "documento", rodar: async () => { fontes.documentos = await favoritosDe("modelos_favoritos_documento"); } },
    { tipo: "meta", rodar: async () => { fontes.metas = await favoritosDe("modelos_favoritos_meta"); } },
    { tipo: "manipulado", rodar: async () => { fontes.manipulados = await favoritosDe("modelos_favoritos_manipulado"); } },
    { tipo: "exame", rodar: async () => { fontes.exames = await favoritosDe("modelos_favoritos_exame"); } },
    { tipo: "questionario", rodar: async () => { fontes.questionarios = await favoritosDe("modelos_favoritos_questionario"); } },
    { tipo: "produto", rodar: async () => { fontes.produtos = await favoritosDe("modelos_favoritos_produto"); } },
    {
      tipo: "receita",
      rodar: async () => {
        // os ingredientes com o alimento e as medidas (o medidas_caseiras(*) de antes escrito coluna a coluna no servidor)
        const linhas = await favoritosDe<ReceitaBruta>("modelos_favoritos_receita");
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

/** hml-21c: a ação que tira o ★ de cada tipo (a *_editar da tela dona, que já existe) e a coluna dele. */
const ACAO_DO_TIPO: Partial<Record<TipoModelo, { acao: string; coluna: "favorito" | "favorita"; financeiro?: true }>> = {
  anamnese: { acao: "modelo_anamnese_editar", coluna: "favorito" },
  plano: { acao: "plano_editar", coluna: "favorito" },
  orientacao: { acao: "modelo_orientacao_editar", coluna: "favorito" },
  recibo: { acao: "modelo_recibo_editar", coluna: "favorito", financeiro: true },
  documento: { acao: "modelo_documento_editar", coluna: "favorito" },
  meta: { acao: "modelo_meta_editar", coluna: "favorito" },
  manipulado: { acao: "modelo_formula_editar", coluna: "favorito" },
  exame: { acao: "exame_catalogo_editar", coluna: "favorito" },
  questionario: { acao: "questionario_editar", coluna: "favorito" },
  produto: { acao: "produto_editar", coluna: "favorito" },
  receita: { acao: "receita_editar", coluna: "favorita" },
};

/**
 * ★ Tirar dos modelos — o mesmo UPDATE da tela dona (a RLS só deixa o autor), pela ação *_editar da função (hml-21c). 0 linhas
 * (nao_encontrado) = a frase de hoje; o resto, a frase fixa do código.
 */
export async function desfavoritar(tipo: TipoModelo, id: string): Promise<void> {
  const t = ACAO_DO_TIPO[tipo];
  if (!t) throw new Error("Os treinos não têm estrela: eles ficam nas pastas do Painel › Treinos.");
  try {
    if (t.financeiro) await gravarFinanceiro(t.acao as Parameters<typeof gravarFinanceiro>[0], { id, [t.coluna]: false });
    else await acaoNutricao(t.acao as AcaoDaFuncao, { id, [t.coluna]: false });
  } catch (e) {
    if ((e as { codigo?: unknown })?.codigo === "nao_encontrado") throw new Error("Só quem criou pode tirar a estrela.");
    throw e;
  }
}
