// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/antropometrias.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import type { Database, Json } from "@/nutricao/editor/lib/banco";
import type { RegistroAntropometria } from "@/nutricao/editor/lib/antropometriaUtil";
import { ErroLeitura, lerNutricao } from "@/nutricao/leitura";
import { acaoNutricao } from "@/nutricao/servidor";

// Acesso à tabela `antropometrias` (RLS: a nutricionista só vê as dela; master vê tudo). Exclusão é SOFT
// (deleted_at → Lixeira, W32). O banco mexe em `pacientes.updated_at` a cada avaliação (trigger genérico da W5).
// hml-19c (H-41 · jeito 2): criar, editar e excluir vão pela função nutricao (antropometria_criar/_editar/_excluir) — as MESMAS
// colunas (o colunas(r) abaixo), o dono = quem chama (no servidor), o erro com a frase fixa do código.
// hml-20b (H-42 · jeito 2, etapa 2): as LEITURAS também vão pela nutricao, no lote da tela (src/nutricao/leitura.ts), como a pessoa
// (o RLS de hoje decide): a lista do aluno (antropometrias_do_aluno — a Avaliação 360, o Gestacional e a Dieta usam; a mesma
// assinatura, o mesmo tipo) e a de 1 pelo id (antropometria — o "Editar" da aba Avaliação, que lia direto na tela). O erro de leitura
// chega como ErroLeitura com a frase fixa do código.

export type Antropometria = Database["public"]["Tables"]["antropometrias"]["Row"];

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

/** As antropometrias vivas do aluno, a mais recente primeiro (consulta antropometrias_do_aluno: as colunas do tipo). */
export async function listarAntropometrias(pacienteId: string): Promise<Antropometria[]> {
  const r = await lerNutricao("antropometrias_do_aluno", { aluno: pacienteId });
  return (r.linhas ?? []) as Antropometria[];
}

/**
 * Uma antropometria pelo id (o "Editar" da aba Avaliação — como a tela lia: pelo id, sem o filtro da Lixeira). Não achou (outra conta,
 * ou o id que não existe) → null, como o maybeSingle de antes; o resto dos erros sobe (ErroLeitura).
 */
export async function buscarAntropometria(id: string): Promise<Antropometria | null> {
  try {
    const r = await lerNutricao("antropometria", { id });
    return ((r.linhas ?? [])[0] as Antropometria | undefined) ?? null;
  } catch (e) {
    if (e instanceof ErroLeitura && e.codigo === "nao_encontrado") return null;
    throw e;
  }
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
