// Physiq W18 — as anotações da equipe (N-43, P4): a linha do tempo do prontuário que o personal, a nutricionista e o dono dividem.
// Tabela registros_prontuario do banco principal (a MESMA do "Prontuário do paciente" do site antigo do Nutri, que segue gravando
// nela até a W28: o que ele grava nasce "Só nutricionistas"). Ler = função aluno_anotacoes (a regra da visibilidade + o nome, a
// foto e o papel de quem escreveu — o personal não lê o perfil da nutri pela RLS); escrever = REST pela RLS (políticas da W2 + a
// restritiva da W18: "Só nutricionistas" só quem vê o clínico, e o papel gravado é o de verdade).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/nutricao/editor/lib/banco";
import { formParaRegistro, type FormRegistro } from "@/nutricao/editor/lib/prontuarioUtil";
import type { PapelAutor, Visibilidade } from "./acesso";

export interface Anotacao {
  id: string;
  /** data/hora do registro (timestamptz ISO) */
  data: string;
  texto: string;
  visibilidade: Visibilidade;
  autor_papel: PapelAutor;
  autor_id: string;
  autor_nome: string | null;
  autor_foto: string | null;
  /** escrita por quem está logado (só o autor edita e exclui; o master também) */
  minha: boolean;
  created_at: string;
  updated_at: string;
}

export interface AnotacoesDoAluno {
  paciente_id: string;
  /** quantas anotações quem chama vê (sem o limite) */
  total: number;
  /** quem chama vê as "Só nutricionistas" (e o clínico) */
  clinico: boolean;
  anotacoes: Anotacao[];
}

export type FormAnotacao = FormRegistro & { visibilidade: Visibilidade };

const falhou = (error: { message: string } | null): void => {
  if (error) throw new Error(mensagemDoErro(error.message));
};

/** O banco recusa (RLS) quem não pode: vira um texto que a pessoa entende. */
export function mensagemDoErro(msg: string): string {
  if (/row-level security|violates row-level|permission denied/i.test(msg)) return "Você não pode gravar essa anotação para este aluno.";
  if (/sem_acesso/.test(msg)) return "Você não acompanha este aluno.";
  return msg;
}

function normalizar(a: Partial<Anotacao> & Record<string, unknown>): Anotacao {
  return {
    id: String(a.id),
    data: String(a.data),
    texto: String(a.texto ?? ""),
    visibilidade: a.visibilidade === "equipe" ? "equipe" : "nutricionistas",
    autor_papel: (["master", "nutricionista", "personal", "dono"].includes(String(a.autor_papel)) ? a.autor_papel : "nutricionista") as PapelAutor,
    autor_id: String(a.autor_id ?? ""),
    autor_nome: (a.autor_nome as string | null) ?? null,
    autor_foto: (a.autor_foto as string | null) ?? null,
    minha: a.minha === true,
    created_at: String(a.created_at ?? a.data),
    updated_at: String(a.updated_at ?? a.created_at ?? a.data),
  };
}

/** As anotações que quem chama vê, mais recente primeiro (com limite = as últimas, para o card do Resumo). */
export async function listarAnotacoes(alunoId: string, limite?: number): Promise<AnotacoesDoAluno> {
  const { data, error } = await supabase.rpc("aluno_anotacoes" as never, { p_aluno: alunoId, p_limite: limite ?? null } as never);
  falhou(error);
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok === false) throw new Error(mensagemDoErro(String(r.erro ?? "erro_interno")));
  const lista = Array.isArray(r.anotacoes) ? (r.anotacoes as Record<string, unknown>[]) : [];
  return {
    paciente_id: String(r.paciente_id ?? ""),
    total: Number(r.total ?? lista.length) || 0,
    clinico: r.clinico === true,
    anotacoes: lista.map((a) => normalizar(a)),
  };
}

export const chaveAnotacoes = (alunoId: string, limite?: number) => ["prontuario-anotacoes", alunoId, limite ?? "todas"] as const;

export function useAnotacoes(alunoId: string, limite?: number) {
  return useQuery({
    queryKey: chaveAnotacoes(alunoId, limite),
    queryFn: () => listarAnotacoes(alunoId, limite),
    enabled: !!alunoId,
    staleTime: 20_000,
    retry: 1,
    networkMode: "online",
  });
}

export async function criarAnotacao(autorId: string, pacienteId: string, papel: PapelAutor, f: FormAnotacao): Promise<void> {
  const reg = formParaRegistro(f);
  const { error } = await supabase.from("registros_prontuario").insert({
    nutricionista_id: autorId,
    paciente_id: pacienteId,
    data: reg.data,
    texto: reg.texto,
    visibilidade: f.visibilidade,
    autor_papel: papel,
  });
  falhou(error);
}

export async function atualizarAnotacao(id: string, papel: PapelAutor, f: FormAnotacao): Promise<void> {
  const reg = formParaRegistro(f);
  const { data, error } = await supabase
    .from("registros_prontuario")
    .update({ data: reg.data, texto: reg.texto, visibilidade: f.visibilidade, autor_papel: papel })
    .eq("id", id)
    .select("id");
  falhou(error);
  if (!data || data.length === 0) throw new Error("Só quem escreveu a anotação pode mudar.");
}

/** Exclusão SOFT (Lixeira), como no site antigo. */
export async function excluirAnotacao(id: string): Promise<void> {
  const { data, error } = await supabase.from("registros_prontuario").update({ deleted_at: new Date().toISOString() }).eq("id", id).select("id");
  falhou(error);
  if (!data || data.length === 0) throw new Error("Só quem escreveu a anotação pode excluir.");
}
