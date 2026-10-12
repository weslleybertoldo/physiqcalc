// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/orientacoes.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import type { Database } from "@/nutricao/editor/lib/banco";
import type { RegistroOrientacao } from "@/nutricao/editor/lib/orientacoesUtil";
import { lerNutricao } from "@/nutricao/leitura";
import { acaoNutricao } from "@/nutricao/servidor";

// Acesso às tabelas `modelos_orientacao` e `orientacoes` (RLS: a nutricionista só vê o dela; master vê tudo).
// Exclusão é SOFT (deleted_at → Lixeira, W32). O banco mexe em `pacientes.updated_at` a cada orientação (trigger).
// hml-19b (H-41 · H-81 · jeito 2): as GRAVAÇÕES passam pela função nutricao (src/nutricao/servidor.ts), com a sessão de quem chama e
// as mesmas assinaturas (o dono é quem chama: o servidor põe). O modelo padrão do 1º acesso nasce no servidor
// (padroes_garantir { secao: "orientacao" }: 1 vez só, com trava), não mais aqui a cada abertura.
// hml-20c (H-42 · jeito 2, etapa 2): as LEITURAS também vão pela nutricao, no lote da tela (src/nutricao/leitura.ts), como a pessoa — os
// modelos (modelos_orientacao: o RLS decide, como hoje) e as orientações do aluno (orientacoes_do_aluno). O nome da nutricionista sai
// da fonte única (profissional.ts — decisão 10; era a 3ª cópia do profiles próprio, a última fora dela).

export type ModeloOrientacao = Database["public"]["Tables"]["modelos_orientacao"]["Row"];
export type ModeloOrientacaoUpdate = Database["public"]["Tables"]["modelos_orientacao"]["Update"];
export type Orientacao = Database["public"]["Tables"]["orientacoes"]["Row"];

// ---- Modelos ----
export async function listarModelos(): Promise<ModeloOrientacao[]> {
  const r = await lerNutricao("modelos_orientacao");
  return (r.linhas ?? []) as ModeloOrientacao[];
}

/**
 * Os modelos, com o "Orientações gerais (padrão)" no 1º acesso à seção: 1 chamada à função (padroes_garantir), que grava 1 vez só
 * (trava por pessoa) e devolve a lista (a mesma ordem do listar). Só para quem pode editar (a tela decide); quem só lê usa o listarModelos.
 */
export async function garantirModelos(nutricionistaId: string): Promise<ModeloOrientacao[]> {
  const r = await acaoNutricao<{ lista: ModeloOrientacao[] }>("padroes_garantir", { secao: "orientacao" });
  return Array.isArray(r.lista) ? r.lista : [];
}

export type DadosModelo = { titulo: string; conteudo: string; favorito: boolean };

export async function criarModelo(nutricionistaId: string, d: DadosModelo): Promise<ModeloOrientacao> {
  const { linha } = await acaoNutricao<{ linha: ModeloOrientacao }>("modelo_orientacao_criar", { titulo: d.titulo.trim(), conteudo: d.conteudo, favorito: d.favorito });
  return linha;
}

export async function atualizarModelo(id: string, patch: Partial<DadosModelo>): Promise<ModeloOrientacao> {
  const dados: Record<string, unknown> = {};
  if (patch.titulo !== undefined) dados.titulo = patch.titulo.trim();
  if (patch.conteudo !== undefined) dados.conteudo = patch.conteudo;
  if (patch.favorito !== undefined) dados.favorito = patch.favorito;
  const { linha } = await acaoNutricao<{ linha: ModeloOrientacao }>("modelo_orientacao_editar", { id, ...dados });
  return linha;
}

export async function excluirModelo(id: string): Promise<void> {
  await acaoNutricao("modelo_orientacao_excluir", { id });
}

/** "Salvar também como modelo": a orientação recém-escrita vira um modelo (não favorito) da nutricionista. */
export const salvarComoModelo = (nutricionistaId: string, r: RegistroOrientacao): Promise<ModeloOrientacao> =>
  criarModelo(nutricionistaId, { titulo: r.titulo, conteudo: r.conteudo, favorito: false });

// ---- Orientações ----
export async function listarOrientacoes(pacienteId: string): Promise<Orientacao[]> {
  const r = await lerNutricao("orientacoes_do_aluno", { aluno: pacienteId });
  return (r.linhas ?? []) as Orientacao[];
}

export async function criarOrientacao(nutricionistaId: string, pacienteId: string, modeloId: string | null, r: RegistroOrientacao): Promise<Orientacao> {
  const { linha } = await acaoNutricao<{ linha: Orientacao }>("orientacao_criar", { paciente_id: pacienteId, modelo_id: modeloId, titulo: r.titulo, conteudo: r.conteudo });
  return linha;
}

export async function atualizarOrientacao(id: string, r: RegistroOrientacao): Promise<Orientacao> {
  const { linha } = await acaoNutricao<{ linha: Orientacao }>("orientacao_editar", { id, titulo: r.titulo, conteudo: r.conteudo });
  return linha;
}

export async function excluirOrientacao(id: string): Promise<void> {
  await acaoNutricao("orientacao_excluir", { id });
}

/** Nome da nutricionista (cabeçalho do PDF) — hml-20c: a fonte única (profissional.ts; o mesmo: vazio ou erro → null). */
export { nomeDaNutricionista } from "@/nutricao/editor/lib/profissional";
