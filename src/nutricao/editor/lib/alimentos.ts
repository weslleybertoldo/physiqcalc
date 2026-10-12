// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/alimentos.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import type { Database } from "@/nutricao/editor/lib/banco";
import { lerNutricao } from "@/nutricao/leitura";
import { acaoNutricao } from "@/nutricao/servidor";
import { ordenarMedidas, palavrasBusca, type FiltrosAlimentos, type MedidaNova, type RegistroAlimento } from "@/nutricao/editor/lib/alimentosUtil";

// Acesso às tabelas `alimentos` e `medidas_caseiras` (RLS: TACO é de todo mundo e só leitura; alimento próprio só da
// dona; master vê tudo). Exclusão do alimento é SOFT (deleted_at → Lixeira, W32); as medidas seguem o alimento.
// hml-19b (H-41 · jeito 2): as GRAVAÇÕES passam pela função nutricao (src/nutricao/servidor.ts), com a sessão de quem chama e as
// mesmas assinaturas: o alimento e as medidas vão juntos (1 chamada, tudo ou nada — antes 2 a 3 pedidos em série); editar TROCA as
// medidas como hoje (o medida_caseira_id dos itens vira nulo, spec §1.11 item 4). O dono é quem chama (o servidor põe).
// hml-20c (H-42 · jeito 2, etapa 2): as LEITURAS também vão pela nutricao, no lote da tela (src/nutricao/leitura.ts), como a pessoa — a
// busca (alimentos_busca: as palavras, o grupo, a fonte, a faixa e o total, o alimento com as medidas — as colunas do tipo, nenhum "*") e
// os grupos (grupos_alimentos). Saiu o buscarAlimento (0 chamador — código morto de leitura, decisão 21).

export type AlimentoRow = Database["public"]["Tables"]["alimentos"]["Row"];
export type MedidaCaseira = Database["public"]["Tables"]["medidas_caseiras"]["Row"];
export type Alimento = AlimentoRow & { medidas_caseiras: MedidaCaseira[] };
export type GrupoAlimentos = { grupo: string; total: number };

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

/**
 * Os params da busca (a consulta alimentos_busca do servidor): cada palavra é um `ilike` na coluna `busca` (as do palavrasBusca — até 6,
 * sem os caracteres de controle), o grupo e a fonte; a ordem (alfabética sem acento/caixa, empate → 'proprio' antes de 'taco') é a do
 * servidor. Quem chama põe a faixa (offset + limite) e, na lista do painel, o "meus" (TACO ou os seus, com o desempate pelo id).
 */
export function paramsDaBusca(f: FiltrosAlimentos): { palavras?: string[]; grupo?: string; fonte?: string } {
  const palavras = palavrasBusca(f.q);
  return { ...(palavras.length ? { palavras } : {}), ...(f.grupo ? { grupo: f.grupo } : {}), ...(f.fonte ? { fonte: f.fonte } : {}) };
}

export async function listarAlimentos(f: FiltrosAlimentos, offset: number, limit: number): Promise<{ itens: Alimento[]; total: number }> {
  const r = await lerNutricao("alimentos_busca", { ...paramsDaBusca(f), offset, limite: limit });
  return { itens: ((r.linhas ?? []) as (AlimentoRow & { medidas_caseiras: MedidaCaseira[] | null })[]).map(comMedidas), total: r.total ?? 0 };
}

/** Grupos existentes (com contagem), pelo RPC `grupos_alimentos` — respeita a RLS de quem chama (agora como a pessoa, no servidor). */
export async function listarGrupos(): Promise<GrupoAlimentos[]> {
  const r = await lerNutricao("grupos_alimentos");
  return ((Array.isArray(r.valor) ? r.valor : []) as { grupo: string; total: number }[]).map((g) => ({ grupo: g.grupo, total: Number(g.total) }));
}

const colunasMedidas = (medidas: MedidaNova[]) => medidas.map((m) => ({ descricao: m.descricao, gramas: m.gramas, ordem: m.ordem }));

export async function criarAlimento(nutricionistaId: string, r: RegistroAlimento, medidas: MedidaNova[]): Promise<Alimento> {
  const { linha } = await acaoNutricao<{ linha: AlimentoRow & { medidas_caseiras?: MedidaCaseira[] | null } }>("alimento_salvar", {
    alimento: colunas(r), medidas: colunasMedidas(medidas),
  });
  return comMedidas(linha);
}

/** Atualiza o alimento e TROCA as medidas caseiras pelas do formulário (apaga as antigas, grava as novas) — juntos, numa chamada. */
export async function atualizarAlimento(id: string, r: RegistroAlimento, medidas: MedidaNova[]): Promise<Alimento> {
  const { linha } = await acaoNutricao<{ linha: AlimentoRow & { medidas_caseiras?: MedidaCaseira[] | null } }>("alimento_salvar", {
    id, alimento: colunas(r), medidas: colunasMedidas(medidas),
  });
  return comMedidas(linha);
}

export async function excluirAlimento(id: string): Promise<void> {
  await acaoNutricao("alimento_excluir", { id });
}
