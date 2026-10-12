// Physiq W6 — lançamentos do aluno (N-45): porte das regras e do acesso a dados do Financeiro do PhysiqNutri
// (src/lib/financeiroUtil.ts e src/lib/financeiro.ts de lá) para o banco principal: entradas e saídas ligadas ao aluno,
// categorias do profissional (as 6 padrão nascem no 1º uso) e totais (estornadas ficam fora). A W19 usa as mesmas peças.
// hml-19d (H-41 · jeito 2): as gravações (a semente das categorias e o lançamento novo) vão pela função financeiro, com a sessão de quem
// chama; a semente leva a CONTA do aluno (antes nascia sem conta) e a lista das 6 mora em
// supabase-principal/functions/_shared/financeiro-gravar-regras.ts (reexportada daqui, idêntica). O estornarLancamento (sem quem
// chamasse) saiu.
// hml-20d (H-42 · jeito 2, etapa 2, parte 4): as leituras (a página dos lançamentos do aluno e as categorias) vão pela função financeiro
// (src/financeiro/ler.ts — no lote da tela), com as mesmas assinaturas e os mesmos tipos; o erro chega com o texto fixo do código.
import type { Pagina } from "@/lib/paginacao";
import { CATEGORIAS_PADRAO } from "../../supabase-principal/functions/_shared/financeiro-gravar-regras";
import { garantirPadroesFinanceiro, gravarFinanceiro } from "./gravar";
import { ErroLeitura, lerFinanceiro, paginaDoServidor } from "./ler";

export type TipoLancamento = "entrada" | "saida";
export type MetodoLancamento = "pix" | "dinheiro" | "cartao_credito" | "cartao_debito" | "transferencia" | "boleto" | "outro";

export const METODOS_LANCAMENTO: { valor: MetodoLancamento; rotulo: string }[] = [
  { valor: "pix", rotulo: "Pix" },
  { valor: "dinheiro", rotulo: "Dinheiro" },
  { valor: "cartao_credito", rotulo: "Cartão de crédito" },
  { valor: "cartao_debito", rotulo: "Cartão de débito" },
  { valor: "transferencia", rotulo: "Transferência" },
  { valor: "boleto", rotulo: "Boleto" },
  { valor: "outro", rotulo: "Outro" },
];
export const rotuloMetodoLancamento = (m: string | null | undefined): string => METODOS_LANCAMENTO.find((x) => x.valor === m)?.rotulo ?? (m ?? "");

/** As 6 categorias que nascem no 1º acesso (as do Nutri) — a lista do servidor. */
export { CATEGORIAS_PADRAO };

export interface Categoria {
  id: string;
  nome: string;
}

export interface Lancamento {
  id: string;
  nutricionista_id: string;
  paciente_id: string | null;
  tipo: TipoLancamento;
  descricao: string;
  valor: number;
  data: string;
  metodo: string;
  observacao: string | null;
  estornada: boolean;
  recibo_id: string | null;
  categoria_id: string | null;
  categoria: { nome: string } | null;
  created_at: string;
}

// hml-14d (B21 · D31): os totais "Recebido" e "Gasto com o aluno" saíram daqui para o banco (financeiro_totais_do_aluno, a mesma
// regra: o estornado fica fora; saída = gasto; o resto = recebido; 2 casas) — a tela somava os até 500 que a lista trazia.

/** "+R$ 150,00" / "−R$ 40,50" */
export function valorComSinal(tipo: string, valor: number): string {
  const v = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Math.abs(valor)).replace(/\u00a0/g, " ");
  return `${tipo === "saida" ? "−" : "+"}${v}`;
}

/**
 * hml-14d (B21 · D31): uma página (20) dos lançamentos do aluno, a data mais recente primeiro (desempate: criado por último, id), e o
 * total — o cartão mostra os 12 primeiros e o "Ver todos (N)" abre as páginas (antes: até 500 de uma vez). Erro lança.
 * hml-20d: fin_transacoes_do_aluno (a página com o total exato, a mesma ordem, com a categoria), pela função.
 */
export async function paginaLancamentosDoAluno(pacienteId: string, pagina: number): Promise<Pagina<Lancamento>> {
  const r = await lerFinanceiro("fin_transacoes_do_aluno", { aluno: pacienteId, pagina: paginaDoServidor(pagina) });
  if (typeof r.total !== "number") throw new ErroLeitura("erro_interno");
  return { itens: (r.linhas ?? []) as Lancamento[], total: r.total };
}

/** As minhas categorias vivas pelo nome (fin_categorias — a mesma do Painel; aqui só o id e o nome, como a tela lia). */
const lerCategorias = async (uid: string): Promise<Categoria[]> => {
  const { linhas } = await lerFinanceiro("fin_categorias");
  return ((linhas ?? []) as Categoria[]).map(({ id, nome }) => ({ id, nome }));
};

/**
 * As categorias do profissional; sem nenhuma, a função semeia as 6 padrão (financeiro › padroes_garantir: 1 chamada, com a conta do aluno
 * e com trava no servidor — junto, o "Recibo padrão" se faltar).
 */
export async function garantirCategorias(uid: string, contaId: string | null): Promise<Categoria[]> {
  const lista = await lerCategorias(uid);
  if (lista.length) return lista;
  try {
    const r = await garantirPadroesFinanceiro(contaId);
    return r.categorias.map(({ id, nome }) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  } catch (e) {
    // hml-14b (B14): o erro não fica calado — relê (outra aba pode ter semeado) e, sem nada para reler, o erro vai para a tela
    const relidas = await lerCategorias(uid);
    if (relidas.length) return relidas;
    throw e;
  }
}

export async function criarLancamento(p: {
  uid: string;
  contaId: string | null;
  pacienteId: string;
  tipo: TipoLancamento;
  descricao: string;
  valor: number;
  data: string;
  metodo: MetodoLancamento;
  categoriaId: string | null;
  observacao: string | null;
}): Promise<void> {
  // hml-19d: pela função (financeiro › transacao_criar); o dono é quem chama, no servidor (o p.uid fica só por compatibilidade)
  await gravarFinanceiro("transacao_criar", {
    conta_id: p.contaId, paciente_id: p.pacienteId, tipo: p.tipo, descricao: p.descricao.trim().slice(0, 160), valor: p.valor, data: p.data,
    metodo: p.metodo, categoria_id: p.categoriaId, observacao: p.observacao?.trim() || null,
  });
}
