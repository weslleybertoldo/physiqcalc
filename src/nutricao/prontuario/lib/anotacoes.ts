// Physiq W18 — as anotações da equipe (N-43, P4): a linha do tempo do prontuário que o personal, a nutricionista e o dono dividem.
// Tabela registros_prontuario do banco principal (a MESMA do "Prontuário do paciente" do site antigo do Nutri, que segue gravando
// nela até a W28: o que ele grava nasce "Só nutricionistas"). Ler = função aluno_anotacoes (a regra da visibilidade + o nome, a
// foto e o papel de quem escreveu — o personal não lê o perfil da nutri pela RLS); escrever = REST pela RLS (políticas da W2 + a
// restritiva da W18: "Só nutricionistas" só quem vê o clínico, e o papel gravado é o de verdade).
// hml-19a (H-41 · jeito 2): escrever = a função nutricao (src/nutricao/servidor.ts), com a sessão de quem escreve — o RLS de antes
// decide do mesmo jeito (a função grava como a pessoa); o autor é quem está logado (o servidor põe), as frases de antes ficam.
// hml-20b (H-42 · jeito 2, etapa 2): LER também vai pela nutricao, no lote da tela (src/nutricao/leitura.ts) — a MESMA aluno_anotacoes
// lá, como a pessoa: consulta `anotacoes` { aluno, limite, offset? } (o card do Resumo e a página da aba) ou `anotacoes_todas` { aluno }
// (o PDF, sem limite). Os args de hoje (o p_offset só quando é página), a mesma normalização e as mesmas frases: o "sem_acesso" da RPC
// (levantado pela w14_matricula_da_rota) volta como o código e vira "Você não acompanha este aluno.", como antes.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { deslocamento, POR_PAGINA } from "@/lib/paginacao";
import { formParaRegistro, type FormRegistro } from "@/nutricao/editor/lib/prontuarioUtil";
import { ErroLeitura, lerNutricao } from "@/nutricao/leitura";
import { acaoNutricao, comFraseDoCodigo } from "@/nutricao/servidor";
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
  /** hml-14d: só na leitura por página — a mais recente de todas (o "última em" do topo, que a página 2 em diante não traz) */
  ultima?: { id: string; data: string } | null;
}

export type FormAnotacao = FormRegistro & { visibilidade: Visibilidade };

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

/**
 * As anotações que quem chama vê, mais recente primeiro (com limite = as últimas, para o card do Resumo; sem limite = todas, para o
 * PDF). hml-14d (B21 · D33): com `offset` é uma PÁGINA (a aba Anotações: `limite` por página, 20 por padrão) e vem `ultima`; o
 * p_offset só vai quando pagina — a chamada de antes ({ p_aluno, p_limite }) segue igual.
 */
export async function listarAnotacoes(alunoId: string, limite?: number, offset?: number): Promise<AnotacoesDoAluno> {
  // os args de hoje: sem offset, as últimas `limite` (ou todas, sem limite: anotacoes_todas); com offset, a página (limite padrão 20)
  const pedido =
    offset !== undefined
      ? lerNutricao("anotacoes", { aluno: alunoId, limite: limite ?? POR_PAGINA, offset })
      : limite !== undefined && limite >= 1
        ? lerNutricao("anotacoes", { aluno: alunoId, limite })
        : lerNutricao("anotacoes_todas", { aluno: alunoId });
  let valor: unknown;
  try {
    valor = (await pedido).valor;
  } catch (e) {
    // o sem_acesso (a pessoa não acompanha o aluno) com a frase de antes; o resto, a frase fixa do código
    if (e instanceof ErroLeitura && e.codigo === "sem_acesso") throw new ErroLeitura(e.codigo, e.extra, mensagemDoErro(e.codigo));
    throw e;
  }
  const r = (valor ?? {}) as Record<string, unknown>;
  if (r.ok === false) throw new Error(mensagemDoErro(String(r.erro ?? "erro_interno")));
  const lista = Array.isArray(r.anotacoes) ? (r.anotacoes as Record<string, unknown>[]) : [];
  const ultima = r.ultima as { id?: unknown; data?: unknown } | null | undefined;
  return {
    paciente_id: String(r.paciente_id ?? ""),
    total: Number(r.total ?? lista.length) || 0,
    clinico: r.clinico === true,
    anotacoes: lista.map((a) => normalizar(a)),
    ...(offset === undefined ? {} : { ultima: ultima && ultima.id ? { id: String(ultima.id), data: String(ultima.data) } : null }),
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

/** hml-14d (B21 · D33): a aba Anotações em páginas de 20 do banco (a página anterior segura a tela enquanto a nova chega). */
export const chaveAnotacoesPagina = (alunoId: string, pagina: number) => ["prontuario-anotacoes", alunoId, "pagina", pagina] as const;

export function useAnotacoesPagina(alunoId: string, pagina: number) {
  return useQuery({
    queryKey: chaveAnotacoesPagina(alunoId, pagina),
    queryFn: () => listarAnotacoes(alunoId, POR_PAGINA, deslocamento(pagina)),
    enabled: !!alunoId,
    staleTime: 20_000,
    retry: 1,
    networkMode: "online",
    placeholderData: keepPreviousData,
  });
}

/** O RLS recusou (o papel ou a visibilidade que a pessoa não tem, ou o aluno que ela não acompanha). */
const SEM_ACESSO = "Você não pode gravar essa anotação para este aluno.";

export async function criarAnotacao(autorId: string, pacienteId: string, papel: PapelAutor, f: FormAnotacao): Promise<void> {
  const reg = formParaRegistro(f);
  await acaoNutricao("anotacao_criar", { paciente_id: pacienteId, data: reg.data, texto: reg.texto, visibilidade: f.visibilidade, autor_papel: papel })
    .catch((e) => comFraseDoCodigo(e, { sem_acesso: SEM_ACESSO }));
}

export async function atualizarAnotacao(id: string, papel: PapelAutor, f: FormAnotacao): Promise<void> {
  const reg = formParaRegistro(f);
  await acaoNutricao("anotacao_editar", { id, data: reg.data, texto: reg.texto, visibilidade: f.visibilidade, autor_papel: papel })
    .catch((e) => comFraseDoCodigo(e, { nao_encontrado: "Só quem escreveu a anotação pode mudar.", sem_acesso: SEM_ACESSO }));
}

/** Exclusão SOFT (Lixeira), como no site antigo. */
export async function excluirAnotacao(id: string): Promise<void> {
  await acaoNutricao("anotacao_excluir", { id }).catch((e) => comFraseDoCodigo(e, { nao_encontrado: "Só quem escreveu a anotação pode excluir." }));
}
