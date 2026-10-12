// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/anamneses.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
// hml-19a (H-41 · H-81 · jeito 2): as GRAVAÇÕES saem do navegador e vão pela função nutricao (src/nutricao/servidor.ts) — a mesma
// assinatura de antes (as telas não mudam); o dono vem da sessão no servidor (o nutricionistaId que a tela passa não vai mais). O
// "garantir" dos modelos (o padrão do 1º acesso) é 1 chamada só ao servidor (padroes_garantir): a semente nasce lá, 1 vez.
// hml-20b (H-42 · jeito 2, etapa 2): as LEITURAS também vão pela nutricao, no lote da tela (src/nutricao/leitura.ts), como a pessoa:
// modelos_anamnese (os do sistema + os próprios — o RLS decide, como a lib de antes, que não filtrava por dono) e anamneses_do_aluno; o
// nome da nutricionista vem da fonte única (src/nutricao/editor/lib/profissional.ts). Mesmos tipos; o erro é ErroLeitura (frase fixa).
import type { Database } from "@/nutricao/editor/lib/banco";
import { lerNutricao } from "@/nutricao/leitura";
import { lerPerguntas, tituloCopia, type RegistroAnamnese } from "@/nutricao/prontuario/lib/anamneseUtil";
import { acaoNutricao } from "@/nutricao/servidor";

// Acesso às tabelas `modelos_anamnese` e `anamneses` (RLS: a nutricionista vê os modelos DO SISTEMA — nutricionista_id NULL,
// só leitura — e os dela; anamneses só as dela; master vê tudo).
// Exclusão é SOFT (deleted_at → Lixeira, W32). O banco mexe em `pacientes.updated_at` a cada anamnese (trigger).

export type ModeloAnamnese = Database["public"]["Tables"]["modelos_anamnese"]["Row"];
export type ModeloUpdate = Database["public"]["Tables"]["modelos_anamnese"]["Update"];
export type Anamnese = Database["public"]["Tables"]["anamneses"]["Row"];

// ---- Modelos ----
export async function listarModelos(): Promise<ModeloAnamnese[]> {
  const r = await lerNutricao("modelos_anamnese");
  return (r.linhas ?? []) as ModeloAnamnese[];
}

/**
 * Lista os modelos (do sistema + próprios); sem nenhum PRÓPRIO, o servidor cria o "Anamnese geral (padrão)" — a versão curta (1º
 * acesso à seção). hml-19a (H-81): 1 chamada à função (padroes_garantir), que grava 1 vez só (trava por pessoa) e devolve a lista.
 */
export async function garantirModelos(nutricionistaId: string): Promise<ModeloAnamnese[]> {
  const r = await acaoNutricao<{ lista: ModeloAnamnese[] }>("padroes_garantir", { secao: "anamnese" });
  return Array.isArray(r.lista) ? r.lista : [];
}

/** "Duplicar": cópia PRÓPRIA (editável) de um modelo — do sistema ou de outro seu. */
export async function duplicarModelo(nutricionistaId: string, m: ModeloAnamnese): Promise<ModeloAnamnese> {
  return criarModelo(nutricionistaId, { titulo: tituloCopia(m.titulo), perguntas: lerPerguntas(m.perguntas), favorito: false });
}

export type DadosModelo = { titulo: string; perguntas: string[]; favorito: boolean };

export async function criarModelo(nutricionistaId: string, d: DadosModelo): Promise<ModeloAnamnese> {
  const r = await acaoNutricao<{ linha: ModeloAnamnese }>("modelo_anamnese_criar", { titulo: d.titulo.trim(), perguntas: d.perguntas, favorito: d.favorito });
  return r.linha;
}

export async function atualizarModelo(id: string, patch: Partial<DadosModelo>): Promise<ModeloAnamnese> {
  const dados: ModeloUpdate = {};
  if (patch.titulo !== undefined) dados.titulo = patch.titulo.trim();
  if (patch.perguntas !== undefined) dados.perguntas = patch.perguntas;
  if (patch.favorito !== undefined) dados.favorito = patch.favorito;
  const r = await acaoNutricao<{ linha: ModeloAnamnese }>("modelo_anamnese_editar", { id, ...dados });
  return r.linha;
}

/** Exclusão SOFT (Lixeira, W32); 0 linha (não é dela) → erro nao_encontrado (antes a tela dizia "excluído" calada). */
export async function excluirModelo(id: string): Promise<void> {
  await acaoNutricao("modelo_anamnese_excluir", { id });
}

// ---- Anamneses ----
export async function listarAnamneses(pacienteId: string): Promise<Anamnese[]> {
  const r = await lerNutricao("anamneses_do_aluno", { aluno: pacienteId });
  return (r.linhas ?? []) as Anamnese[];
}

/** Também a Pré-consulta › "importar como anamnese" (src/painel/preconsulta/dados.ts) — a mesma ação. */
export async function criarAnamnese(nutricionistaId: string, pacienteId: string, modeloId: string | null, r: RegistroAnamnese): Promise<Anamnese> {
  const res = await acaoNutricao<{ linha: Anamnese }>("anamnese_criar", {
    paciente_id: pacienteId,
    modelo_id: modeloId,
    titulo: r.titulo,
    data: r.data,
    conteudo: r.conteudo,
    texto_livre: r.texto_livre,
  });
  return res.linha;
}

export async function atualizarAnamnese(id: string, r: RegistroAnamnese): Promise<Anamnese> {
  const res = await acaoNutricao<{ linha: Anamnese }>("anamnese_editar", { id, titulo: r.titulo, data: r.data, conteudo: r.conteudo, texto_livre: r.texto_livre });
  return res.linha;
}

/** Exclusão SOFT (Lixeira, W32); 0 linha → nao_encontrado. */
export async function excluirAnamnese(id: string): Promise<void> {
  await acaoNutricao("anamnese_excluir", { id });
}

/** Nome da nutricionista (cabeçalho do PDF) — a fonte única (hml-20b: o profiles de quem chama, pela função). */
export { nomeDaNutricionista } from "@/nutricao/editor/lib/profissional";
