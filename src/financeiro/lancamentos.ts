// Physiq W6 — lançamentos do aluno (N-45): porte das regras e do acesso a dados do Financeiro do PhysiqNutri
// (src/lib/financeiroUtil.ts e src/lib/financeiro.ts de lá) para o banco principal: entradas e saídas ligadas ao aluno,
// categorias do profissional (as 6 padrão nascem no 1º uso) e totais (estornadas ficam fora). A W19 usa as mesmas peças.
import { principal } from "@/integrations/principal/client";

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

/** As 6 categorias que nascem no 1º acesso (as do Nutri). */
export const CATEGORIAS_PADRAO = ["Consulta", "Retorno", "Plano alimentar", "Aluguel", "Material", "Outros"];

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

export interface Totais {
  entradas: number;
  saidas: number;
  nEntradas: number;
  nSaidas: number;
  nEstornadas: number;
}

const arred = (n: number) => Math.round(n * 100) / 100;

export function totais(lista: Array<Pick<Lancamento, "tipo" | "valor" | "estornada">>): Totais {
  const t: Totais = { entradas: 0, saidas: 0, nEntradas: 0, nSaidas: 0, nEstornadas: 0 };
  for (const x of lista) {
    if (x.estornada) {
      t.nEstornadas += 1;
      continue;
    }
    if (x.tipo === "saida") {
      t.saidas += Number(x.valor) || 0;
      t.nSaidas += 1;
    } else {
      t.entradas += Number(x.valor) || 0;
      t.nEntradas += 1;
    }
  }
  return { ...t, entradas: arred(t.entradas), saidas: arred(t.saidas) };
}

/** "+R$ 150,00" / "−R$ 40,50" */
export function valorComSinal(tipo: string, valor: number): string {
  const v = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Math.abs(valor)).replace(/\u00a0/g, " ");
  return `${tipo === "saida" ? "−" : "+"}${v}`;
}

const falhou = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

export async function listarLancamentosDoAluno(pacienteId: string): Promise<Lancamento[]> {
  const { data, error } = await principal.from("transacoes")
    .select("id, nutricionista_id, paciente_id, tipo, descricao, valor, data, metodo, observacao, estornada, recibo_id, categoria_id, created_at, categoria:categorias_financeiras(nome)")
    .eq("paciente_id", pacienteId).is("deleted_at", null).order("data", { ascending: false }).order("created_at", { ascending: false }).limit(500);
  falhou(error);
  return (data ?? []) as unknown as Lancamento[];
}

export async function garantirCategorias(uid: string): Promise<Categoria[]> {
  const { data, error } = await principal.from("categorias_financeiras").select("id, nome").eq("nutricionista_id", uid).is("deleted_at", null).order("nome");
  falhou(error);
  if ((data ?? []).length) return data as Categoria[];
  const { data: novas } = await principal.from("categorias_financeiras").insert(CATEGORIAS_PADRAO.map((nome) => ({ nutricionista_id: uid, nome }))).select("id, nome");
  return ((novas ?? []) as Categoria[]).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
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
  const { error } = await principal.from("transacoes").insert({
    nutricionista_id: p.uid, conta_id: p.contaId, paciente_id: p.pacienteId, tipo: p.tipo, descricao: p.descricao.trim().slice(0, 160),
    valor: p.valor, data: p.data, metodo: p.metodo, categoria_id: p.categoriaId, observacao: p.observacao?.trim() || null,
  });
  falhou(error);
}

export async function estornarLancamento(id: string, estornada: boolean): Promise<void> {
  const { error } = await principal.from("transacoes").update({ estornada }).eq("id", id);
  falhou(error);
}
