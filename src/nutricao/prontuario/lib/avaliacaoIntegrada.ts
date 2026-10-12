// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/avaliacaoIntegrada.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import type { Database } from "@/nutricao/editor/lib/banco";
import { lerNutricao } from "@/nutricao/leitura";
import { formParaBanco, type Fontes, type FormAvaliacao, type Sintese } from "@/nutricao/prontuario/lib/avaliacaoIntegradaUtil";
import { acaoNutricao } from "@/nutricao/servidor";

// Acesso da Avaliação integrada (W24): a tabela nova `avaliacoes_integradas` (RLS: a nutricionista só vê as dela; master vê tudo;
// criar exige enxergar o paciente; exclusão SOFT → Lixeira, W32) + as leituras das seções donas (anamneses W5, antropometrias W6,
// resultados de exames W18, aplicações de questionários W19), reexportadas pra tela ter uma porta só. A síntese e as fontes vão
// CONGELADAS em jsonb: editar só mexe em título/parecer; `regerarSintese` troca os 2 jsonb e mantém título e parecer.
// hml-19a (H-41 · jeito 2): as gravações vão pela função nutricao (a síntese segue calculada aqui — o servidor confere a forma; a
// data da avaliação, o "agora", é do servidor). Mesmas assinaturas.
// hml-20b (H-42 · jeito 2, etapa 2): as LEITURAS também vão pela nutricao (as das seções donas, reexportadas abaixo, e a desta:
// avaliacoes_integradas_do_aluno), no lote da tela (src/nutricao/leitura.ts), como a pessoa — a seção abre com 1 chamada (os
// resultados de exame vão num lote só deles: o laço). Mesmos tipos; o erro é ErroLeitura (frase fixa do código).

export { listarAnamneses, type Anamnese } from "@/nutricao/prontuario/lib/anamneses";
export { listarAntropometrias, type Antropometria } from "@/nutricao/editor/lib/antropometrias";
export { listarResultadosDoPaciente, type ResultadoExame } from "@/nutricao/prontuario/lib/exames";
export { listarAplicacoesDoPaciente, type Aplicacao } from "@/nutricao/prontuario/lib/questionarios";
/** Nome da nutricionista e CRN/telefone/endereço (cabeçalho do PDF) — a fonte única (hml-20b: o profiles de quem chama, pela função). */
export { dadosProfissionais, nomeDaNutricionista } from "@/nutricao/editor/lib/profissional";

export type AvaliacaoIntegrada = Database["public"]["Tables"]["avaliacoes_integradas"]["Row"];

/** Avaliações vivas do paciente, mais recente primeiro. */
export async function listarAvaliacoes(pacienteId: string): Promise<AvaliacaoIntegrada[]> {
  const r = await lerNutricao("avaliacoes_integradas_do_aluno", { aluno: pacienteId });
  return (r.linhas ?? []) as AvaliacaoIntegrada[];
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
