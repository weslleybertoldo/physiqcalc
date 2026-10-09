// Physiq W24 — o Diário alimentar do lado da nutricionista (Painel › Dietas › Diário), no BANCO PRINCIPAL: porta do lado
// "nutricionista" do src/lib/diario.ts do PhysiqNutri (W30). Quem vê o quê é do banco (migração 20261001190000_w24_dietas.sql,
// regra clínica da W18): a nutri responsável e o dono-nutri leem (P1), personal e dono sem papel de nutri não leem, a nutri removida
// deixa de ler; reagir e excluir = quem muda a nutrição do aluno. Aqui só o recorte da CONTA ATIVA (o aluno da conta; o paciente sem
// conta do site antigo continua da nutri dele) e as fotos por URL assinada (bucket privado "diario").
//
// FONTE DO "DIÁRIO DE HOJE" DO DASHBOARD (W25): listarDiarioDaConta(contaId, uid, inicioDoPeriodo(1).toISOString()) + urlsAssinadas
// (miniaturas) — a mesma regra desta aba. hml-14b (B21): a aba lê UMA página (20) do período no banco (listarDiarioPaginaComDias),
// com o filtro de aluno e o "só não reagidas" no banco, as opções do filtro de aluno do banco (listarAlunosDoDiario) e as contagens
// no banco (contarDiario) — nada de baixar o período e filtrar no navegador.
import { bucketDoAmbiente } from "@/integrations/principal/buckets";
import { principal } from "@/integrations/principal/client";
import type { Database } from "@/integrations/principal/types";
import { POR_PAGINA, deslocamento, paginar, type Pagina, type RespostaComContagem } from "@/lib/paginacao";
import type { Reacao } from "@/nutricao/app/diarioUtil";
import { COMENTARIO_NUTRI_MAX, chaveDia, type AlunoDoDiario } from "./diarioPainel";

export type RegistroDiarioRow = Database["public"]["Tables"]["diario_alimentar"]["Row"];
type RegistroDiarioUpdate = Database["public"]["Tables"]["diario_alimentar"]["Update"];
export type AlunoDoRegistro = AlunoDoDiario & { conta_id: string | null; nutricionista_id: string | null };
export type RegistroDiarioNutri = RegistroDiarioRow & { paciente: AlunoDoRegistro | null };
export const BUCKET_DIARIO = bucketDoAmbiente("diario");
const SELECT_NUTRI = "*, paciente:pacientes!inner(id, nome, apelido, link_codigo, foto_url, conta_id, nutricionista_id)";

const falhou = (error: { message: string } | null): void => {
  if (error) throw new Error(error.message);
};

/** O recorte da conta ativa: o aluno da conta, ou o paciente sem conta da própria nutri (site antigo). A RLS decide o resto. */
export const recorteDiario = (contaId: string, uid: string): string => `conta_id.eq.${contaId},and(conta_id.is.null,nutricionista_id.eq.${uid})`;

// ───────────────────────── a aba Diário, 20 por página (hml-14b, B21) ─────────────────────────
/** O que filtra a aba: o início do período (?dias=), o aluno (?aluno=) e o "Só não reagidas" (?nao_reagidas=1). */
export interface FiltrosDiario {
  deIso: string;
  alunoId: string;
  soNaoReagidas: boolean;
}

// o ?aluno= do endereço só vai ao banco se for um id; lixo = um id que não existe (a lista fica vazia, como antes — nunca erro do banco)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NENHUM_ALUNO = "00000000-0000-0000-0000-000000000000";
export const alunoDoFiltro = (v: string): string => (!v ? "" : UUID.test(v) ? v : NENHUM_ALUNO);

/** UMA página dos registros do período (o aluno e o "só não reagidas" no banco), mais recente primeiro; o total vem junto. */
export function listarDiarioPagina(contaId: string, uid: string, f: FiltrosDiario, pagina: number): Promise<Pagina<RegistroDiarioNutri>> {
  return paginar<RegistroDiarioNutri>((de, ate) => {
    let q = principal
      .from("diario_alimentar")
      .select(SELECT_NUTRI, { count: "exact" })
      .is("deleted_at", null)
      .gte("data_hora", f.deIso)
      .or(recorteDiario(contaId, uid), { referencedTable: "paciente" });
    const aluno = alunoDoFiltro(f.alunoId);
    if (aluno) q = q.eq("paciente_id", aluno);
    if (f.soNaoReagidas) q = q.is("reacao_nutri", null);
    return q
      .order("data_hora", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(de, ate) as unknown as PromiseLike<RespostaComContagem<RegistroDiarioNutri>>;
  }, pagina);
}

/** Quantos registros (HEAD: só a contagem, no banco) — o "Só não reagidas (N)" e o total de um dia que a página partiu ao meio. */
export async function contarDiario(contaId: string, uid: string, f: FiltrosDiario & { ateIso?: string }): Promise<number> {
  let q = principal
    .from("diario_alimentar")
    .select("id, paciente:pacientes!inner(id)", { count: "exact", head: true })
    .is("deleted_at", null)
    .gte("data_hora", f.deIso)
    .or(recorteDiario(contaId, uid), { referencedTable: "paciente" });
  if (f.ateIso) q = q.lt("data_hora", f.ateIso);
  const aluno = alunoDoFiltro(f.alunoId);
  if (aluno) q = q.eq("paciente_id", aluno);
  if (f.soNaoReagidas) q = q.is("reacao_nutri", null);
  const { count, error } = await q;
  falhou(error);
  if (count == null) throw new Error("O banco não devolveu a contagem do diário.");
  return count;
}

const meiaNoite = (iso: string): Date => {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

/**
 * Os dias (meia-noite LOCAL) da página que podem continuar em outra página: o 1º, se a página não é a 1ª; o último, se há registros
 * depois dela. Os do meio estão inteiros na página (a ordem é por data e hora).
 */
export function diasQuePodemContinuar(itens: { data_hora: string }[], pagina: number, total: number, porPagina = POR_PAGINA): Date[] {
  if (!itens.length) return [];
  const saida: Date[] = [];
  if (pagina > 1) saida.push(meiaNoite(itens[0].data_hora));
  if (deslocamento(pagina, porPagina) + itens.length < total) {
    const ultimo = meiaNoite(itens[itens.length - 1].data_hora);
    if (!saida.some((d) => d.getTime() === ultimo.getTime())) saida.push(ultimo);
  }
  return saida;
}

/** A página + o total de cada dia que ela partiu (chave dd/MM/yyyy): o título do dia diz quantos o dia tem, não só os que couberam. */
export async function listarDiarioPaginaComDias(
  contaId: string,
  uid: string,
  f: FiltrosDiario,
  pagina: number,
): Promise<Pagina<RegistroDiarioNutri> & { porDia: Record<string, number> }> {
  const p = await listarDiarioPagina(contaId, uid, f, pagina);
  const dias = diasQuePodemContinuar(p.itens, pagina, p.total);
  const inicio = new Date(f.deIso).getTime();
  const totais = await Promise.all(
    dias.map((d) =>
      contarDiario(contaId, uid, {
        ...f,
        deIso: new Date(Math.max(d.getTime(), inicio)).toISOString(),
        ateIso: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString(),
      }),
    ),
  );
  const porDia: Record<string, number> = {};
  dias.forEach((d, i) => {
    porDia[chaveDia(d.toISOString())] = totais[i];
  });
  return { ...p, porDia };
}

/** Os alunos com foto no período (as opções do filtro "Aluno": do banco, não da página que carregou), por nome. */
export async function listarAlunosDoDiario(contaId: string, uid: string, deIso: string): Promise<AlunoDoDiario[]> {
  const { data, error } = await principal
    .from("pacientes")
    .select("id, nome, apelido, link_codigo, foto_url, registros:diario_alimentar!inner(id)")
    .or(recorteDiario(contaId, uid))
    .is("registros.deleted_at", null)
    .gte("registros.data_hora", deIso)
    .limit(1, { referencedTable: "registros" })
    .order("nome", { ascending: true })
    .order("id", { ascending: true });
  falhou(error);
  return ((data ?? []) as unknown as (AlunoDoDiario & { registros?: unknown })[]).map(({ registros: _registros, ...aluno }) => aluno);
}

/**
 * Registros VIVOS a partir de `deIso` dos alunos da conta ativa que você vê, mais recente primeiro, com o aluno embutido. hml-14b: é
 * uma JANELA (o "Diário de hoje" do Dashboard e o número da aba: 1 e 7 dias) — no máximo 1000 (D18); a aba Diário usa a página.
 */
export async function listarDiarioDaConta(contaId: string, uid: string, deIso: string): Promise<RegistroDiarioNutri[]> {
  const { data, error } = await principal
    .from("diario_alimentar")
    .select(SELECT_NUTRI)
    .is("deleted_at", null)
    .gte("data_hora", deIso)
    .or(recorteDiario(contaId, uid), { referencedTable: "paciente" })
    .order("data_hora", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000);
  falhou(error);
  return (data ?? []) as unknown as RegistroDiarioNutri[];
}

/** Reação + comentário (reacao null = tira a reação). UPDATE que a RLS não deixa devolve 0 linhas → erro amigável. */
export async function reagir(id: string, reacao: Reacao | null, comentario: string): Promise<RegistroDiarioRow> {
  const patch: RegistroDiarioUpdate = reacao
    ? { reacao_nutri: reacao, comentario_nutri: comentario.trim().slice(0, COMENTARIO_NUTRI_MAX), reagido_em: new Date().toISOString() }
    : { reacao_nutri: null, comentario_nutri: "", reagido_em: null };
  const { data, error } = await principal.from("diario_alimentar").update(patch).eq("id", id).is("deleted_at", null).select("*").maybeSingle();
  falhou(error);
  if (!data) throw new Error("Você não pode reagir a esta foto (ou ela foi excluída).");
  return data as RegistroDiarioRow;
}

/** Soft delete (Lixeira) + remove a foto do bucket (melhor esforço: a linha já saiu da tela) — como o site antigo. */
export async function excluirRegistro(r: Pick<RegistroDiarioRow, "id" | "path">): Promise<void> {
  const { data, error } = await principal
    .from("diario_alimentar")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", r.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  falhou(error);
  if (!data) throw new Error("Você não pode excluir esta foto (ou ela já foi excluída).");
  await principal.storage.from(BUCKET_DIARIO).remove([r.path]).catch(() => undefined);
}

/** URL assinada de curta duração (a foto grande gera a própria ao abrir). */
export async function urlAssinada(r: Pick<RegistroDiarioRow, "path">, segundos = 300): Promise<string> {
  const { data, error } = await principal.storage.from(BUCKET_DIARIO).createSignedUrl(r.path, segundos);
  falhou(error);
  if (!data?.signedUrl) throw new Error("Não foi possível abrir a foto.");
  return data.signedUrl;
}

/** URLs assinadas em LOTE (miniaturas), por id do registro. As que falharem ficam de fora. */
export async function urlsAssinadas(registros: Pick<RegistroDiarioRow, "id" | "path">[], segundos = 3600): Promise<Record<string, string>> {
  const comPath = registros.filter((r) => r.path);
  if (!comPath.length) return {};
  const { data, error } = await principal.storage.from(BUCKET_DIARIO).createSignedUrls(comPath.map((r) => r.path), segundos);
  falhou(error);
  const porPath = new Map<string, string>();
  for (const d of data ?? []) {
    if (d.path && d.signedUrl && !d.error) porPath.set(d.path, d.signedUrl);
  }
  const saida: Record<string, string> = {};
  for (const r of comPath) {
    const u = porPath.get(r.path);
    if (u) saida[r.id] = u;
  }
  return saida;
}
