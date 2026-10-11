// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/avaliacaoIntegrada.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { supabase } from "@/nutricao/editor/lib/banco";
import type { Database } from "@/nutricao/editor/lib/banco";
import { formParaBanco, type Fontes, type FormAvaliacao, type Sintese } from "@/nutricao/prontuario/lib/avaliacaoIntegradaUtil";
import { acaoNutricao } from "@/nutricao/servidor";

// Acesso da Avaliação integrada (W24): a tabela nova `avaliacoes_integradas` (RLS: a nutricionista só vê as dela; master vê tudo;
// criar exige enxergar o paciente; exclusão SOFT → Lixeira, W32) + as leituras das seções donas (anamneses W5, antropometrias W6,
// resultados de exames W18, aplicações de questionários W19), reexportadas pra tela ter uma porta só. A síntese e as fontes vão
// CONGELADAS em jsonb: editar só mexe em título/parecer; `regerarSintese` troca os 2 jsonb e mantém título e parecer.
// hml-19a (H-41 · jeito 2): as gravações vão pela função nutricao (a síntese segue calculada aqui — o servidor confere a forma; a
// data da avaliação, o "agora", é do servidor). Mesmas assinaturas; leituras seguem pelo banco.

export { listarAnamneses, type Anamnese } from "@/nutricao/prontuario/lib/anamneses";
export { listarAntropometrias, type Antropometria } from "@/nutricao/editor/lib/antropometrias";
export { listarResultadosDoPaciente, type ResultadoExame } from "@/nutricao/prontuario/lib/exames";
export { listarAplicacoesDoPaciente, type Aplicacao } from "@/nutricao/prontuario/lib/questionarios";
/** Nome da nutricionista (cabeçalho do PDF) — mesma consulta das orientações (W10). */
export { nomeDaNutricionista } from "@/nutricao/editor/lib/orientacoes";
/** CRN/telefone/endereço no PDF quando já existirem (W15; preenchidos na W35). */
export { dadosProfissionais } from "@/nutricao/prontuario/lib/documentos";

export type AvaliacaoIntegrada = Database["public"]["Tables"]["avaliacoes_integradas"]["Row"];

const TABELA = "avaliacoes_integradas";

const falhou = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};

/** Avaliações vivas do paciente, mais recente primeiro. */
export async function listarAvaliacoes(pacienteId: string): Promise<AvaliacaoIntegrada[]> {
  const { data, error } = await supabase
    .from(TABELA)
    .select("*")
    .eq("paciente_id", pacienteId)
    .is("deleted_at", null)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false });
  falhou(error);
  return (data ?? []) as AvaliacaoIntegrada[];
}

export type NovaAvaliacao = FormAvaliacao & { sintese: Sintese; fontes: Fontes };

/** Cria a avaliação com a síntese e as fontes congeladas neste momento (a data é a do servidor, na hora). */
export async function criarAvaliacao(nutricionistaId: string, pacienteId: string, d: NovaAvaliacao): Promise<AvaliacaoIntegrada> {
  const b = formParaBanco(d);
  const r = await acaoNutricao<{ linha: AvaliacaoIntegrada }>("avaliacao_integrada_criar", {
    paciente_id: pacienteId, titulo: b.titulo, texto: b.texto, sintese: d.sintese, fontes: d.fontes,
  });
  return r.linha;
}

/** Edição: só título e parecer — a síntese NÃO muda aqui. */
export async function atualizarAvaliacao(id: string, f: FormAvaliacao): Promise<AvaliacaoIntegrada> {
  const b = formParaBanco(f);
  const r = await acaoNutricao<{ linha: AvaliacaoIntegrada }>("avaliacao_integrada_editar", { id, titulo: b.titulo, texto: b.texto });
  return r.linha;
}

/** Regerar: grava a síntese e as fontes de AGORA; título e parecer ficam. */
export async function regerarSintese(id: string, sintese: Sintese, fontes: Fontes): Promise<AvaliacaoIntegrada> {
  const r = await acaoNutricao<{ linha: AvaliacaoIntegrada }>("avaliacao_integrada_regerar", { id, sintese, fontes });
  return r.linha;
}

/** Exclusão SOFT (Lixeira, W32); 0 linha → nao_encontrado. */
export async function excluirAvaliacao(id: string): Promise<void> {
  await acaoNutricao("avaliacao_integrada_excluir", { id });
}
