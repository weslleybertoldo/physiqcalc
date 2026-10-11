// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/antropometrias.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { supabase } from "@/nutricao/editor/lib/banco";
import type { Database, Json } from "@/nutricao/editor/lib/banco";
import type { RegistroAntropometria } from "@/nutricao/editor/lib/antropometriaUtil";
import { acaoNutricao } from "@/nutricao/servidor";

// Acesso à tabela `antropometrias` (RLS: a nutricionista só vê as dela; master vê tudo). Exclusão é SOFT
// (deleted_at → Lixeira, W32). O banco mexe em `pacientes.updated_at` a cada avaliação (trigger genérico da W5).
// hml-19c (H-41 · jeito 2): criar, editar e excluir vão pela função nutricao (antropometria_criar/_editar/_excluir) — as MESMAS
// colunas (o colunas(r) abaixo), o dono = quem chama (no servidor), o erro com a frase fixa do código. A lista segue aqui.

export type Antropometria = Database["public"]["Tables"]["antropometrias"]["Row"];

const falhou = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};

const colunas = (r: RegistroAntropometria) => ({
  data: r.data,
  peso: r.peso,
  altura: r.altura,
  sexo: r.sexo,
  idade: r.idade,
  protocolo: r.protocolo,
  circunferencias: r.circunferencias as unknown as Json,
  dobras: r.dobras as unknown as Json,
  resultados: r.resultados as unknown as Json,
  observacao: r.observacao,
});

export async function listarAntropometrias(pacienteId: string): Promise<Antropometria[]> {
  const { data, error } = await supabase
    .from("antropometrias")
    .select("*")
    .eq("paciente_id", pacienteId)
    .is("deleted_at", null)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false });
  falhou(error);
  return (data ?? []) as Antropometria[];
}

/** `nutricionistaId` fica por compatibilidade (as telas não mudam): o dono é quem chama, no servidor. */
export async function criarAntropometria(nutricionistaId: string, pacienteId: string, r: RegistroAntropometria): Promise<Antropometria> {
  const res = await acaoNutricao<{ linha: Antropometria }>("antropometria_criar", { ...colunas(r), paciente_id: pacienteId });
  return res.linha;
}

export async function atualizarAntropometria(id: string, r: RegistroAntropometria): Promise<Antropometria> {
  const res = await acaoNutricao<{ linha: Antropometria }>("antropometria_editar", { ...colunas(r), id });
  return res.linha;
}

export async function excluirAntropometria(id: string): Promise<void> {
  await acaoNutricao("antropometria_excluir", { id });
}
