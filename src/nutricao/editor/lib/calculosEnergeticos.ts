// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/calculosEnergeticos.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import type { Database } from "@/nutricao/editor/lib/banco";
import { lerNutricao } from "@/nutricao/leitura";
import { acaoNutricao } from "@/nutricao/servidor";
import type { RegistroEnergetico } from "@/nutricao/editor/lib/energeticoUtil";

// Acesso à tabela `calculos_energeticos` (RLS: a nutricionista só vê os dela; master vê tudo). Exclusão é SOFT
// (deleted_at → Lixeira, W32). O banco mexe em `pacientes.updated_at` a cada cálculo (trigger genérico da W5).
// hml-19b (H-41 · jeito 2): as GRAVAÇÕES passam pela função nutricao (src/nutricao/servidor.ts), com a sessão de quem chama e as
// mesmas assinaturas (o dono é quem chama: o servidor põe). Os valores seguem calculados na tela (decisão 12).
// hml-20c (H-42 · jeito 2, etapa 2): a LEITURA também vai pela nutricao, no lote da tela (src/nutricao/leitura.ts), como a pessoa — a
// consulta calculos_do_aluno (as colunas do tipo, as vivas, a mesma ordem); o erro chega como ErroLeitura com a frase fixa do código.

export type CalculoEnergetico = Database["public"]["Tables"]["calculos_energeticos"]["Row"];

const colunas = (r: RegistroEnergetico) => ({
  data: r.data,
  formula: r.formula,
  peso: r.peso,
  altura: r.altura,
  idade: r.idade,
  sexo: r.sexo,
  massa_magra: r.massa_magra,
  fator_atividade: r.fator_atividade,
  atividades: r.atividades,
  tmb: r.tmb,
  get: r.get,
  ajuste_kcal: r.ajuste_kcal,
  vet: r.vet,
  objetivo: r.objetivo,
  observacao: r.observacao,
});

export async function listarCalculos(pacienteId: string): Promise<CalculoEnergetico[]> {
  const r = await lerNutricao("calculos_do_aluno", { aluno: pacienteId });
  return (r.linhas ?? []) as CalculoEnergetico[];
}

export async function criarCalculo(nutricionistaId: string, pacienteId: string, r: RegistroEnergetico): Promise<CalculoEnergetico> {
  const { linha } = await acaoNutricao<{ linha: CalculoEnergetico }>("calculo_energetico_criar", { paciente_id: pacienteId, ...colunas(r) });
  return linha;
}

export async function atualizarCalculo(id: string, r: RegistroEnergetico): Promise<CalculoEnergetico> {
  const { linha } = await acaoNutricao<{ linha: CalculoEnergetico }>("calculo_energetico_editar", { id, ...colunas(r) });
  return linha;
}

export async function excluirCalculo(id: string): Promise<void> {
  await acaoNutricao("calculo_energetico_excluir", { id });
}
