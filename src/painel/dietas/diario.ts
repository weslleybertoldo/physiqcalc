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
// hml-19b (H-41 · jeito 2): reagir e excluir passam pela função nutricao (src/nutricao/servidor.ts), com a sessão de quem chama e as
// mesmas assinaturas: a reação leva o "agora" do servidor; o excluir põe a linha na Lixeira e DEPOIS tira a foto (o caminho vem da
// linha no banco, não da tela). As frases de antes ficam.
// hml-20c (H-42 · jeito 2, etapa 2): as LEITURAS e as URLs assinadas também vão pela nutricao, no lote da tela (src/nutricao/leitura.ts),
// como a pessoa, com o recorte da conta ativa montado NO SERVIDOR (o recorteDiario abaixo é a mesma regra, com o id do token lá):
//   · a página (diario_pagina) e o total de cada dia que ela partiu ao meio NA MESMA IDA (antes: a página → os HEAD do dia, em série) — a
//     tela manda os inícios de dia LOCAIS do período (diasDoPeriodo: o servidor não sabe o fuso do navegador) e o servidor aplica a regra
//     do diasQuePodemContinuar com eles;
//   · a contagem (diario_contagem: HEAD), as opções do filtro "Aluno" (diario_alunos) e a janela do Dashboard (diario_hoje);
//   · as miniaturas (diario_urls, em lote, 1 h) e a foto grande (diario_foto_url, 300 s): só os ids vão — o servidor relê o caminho de
//     cada um como a pessoa e assina SÓ ele; a URL volta relativa e é montada com o domínio do cliente (a mesma de hoje).
import type { Database } from "@/integrations/principal/types";
import { POR_PAGINA, deslocamento, type Pagina } from "@/lib/paginacao";
import type { Reacao } from "@/nutricao/app/diarioUtil";
import { lerNutricao, urlAssinadaDoServidor } from "@/nutricao/leitura";
import { acaoNutricao, comFraseDoCodigo } from "@/nutricao/servidor";
import { chaveDia, type AlunoDoDiario } from "./diarioPainel";
import { DIARIO_DIAS_MAX } from "../../../supabase-principal/functions/_shared/nutricao-leituras";

export type RegistroDiarioRow = Database["public"]["Tables"]["diario_alimentar"]["Row"];
export type AlunoDoRegistro = AlunoDoDiario & { conta_id: string | null; nutricionista_id: string | null };
export type RegistroDiarioNutri = RegistroDiarioRow & { paciente: AlunoDoRegistro | null };
/** Os ids por item das miniaturas (o teto da consulta diario_urls: DIARIO_IDS_MAX do servidor). */
const IDS_POR_LEITURA = 60;

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

/**
 * hml-20c: os inícios de dia LOCAIS do período (o servidor não sabe o fuso do navegador): o 1º é o início do período e os outros, cada
 * meia-noite local seguinte (new Date(y, m, d + k) — a mesma conta do diasQuePodemContinuar), até a de depois de amanhã (o dia de hoje e o
 * de amanhã fecham), no teto do servidor (DIARIO_DIAS_MAX — a constante do servidor, importada: 90 dias + os de depois cabem).
 */
export function diasDoPeriodo(deIso: string, agora: Date = new Date()): string[] {
  const inicio = new Date(deIso);
  const saida = [inicio.toISOString()];
  const fim = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 2).getTime();
  for (let k = 1; saida.length < DIARIO_DIAS_MAX; k += 1) {
    const d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + k);
    saida.push(d.toISOString());
    if (d.getTime() >= fim) break;
  }
  return saida;
}

/** Os params do diário que a página e a contagem dividem: a conta, o início do período, o aluno (só se for id) e o "só não reagidas". */
const paramsDoDiario = (contaId: string, f: FiltrosDiario) => {
  const aluno = alunoDoFiltro(f.alunoId);
  return { conta: contaId, de: new Date(f.deIso).toISOString(), ...(aluno ? { aluno } : {}), ...(f.soNaoReagidas ? { nao_reagidas: true } : {}) };
};

// ───────────────────────── as miniaturas que vêm COM a lista (o com_urls) ─────────────────────────
// hml-20c (decisão da sessão principal na etapa 2: a série lista → assinar custava +0,5 s no Diário e no Dashboard): a página do Diário e
// o "Diário de hoje" pedem as miniaturas NA MESMA IDA — o servidor assina, como a pessoa, só os caminhos das linhas que ELE leu (1 h). A
// lib guarda as URLs aqui (o id → a URL montada com o domínio do cliente) e devolve as linhas SEM o campo url (o tipo de hoje); o
// urlsAssinadas (o useMiniaturas da tela) serve daqui primeiro. O cache é de 1 USO (o renovar da imagem que falhou pede uma URL nova ao
// diario_urls, como hoje) e vence antes da URL (50 min × 1 h).
const CACHE_URLS_MS = 50 * 60_000;
const CACHE_URLS_MAX = 300;
const urlsDaLista = new Map<string, { url: string; ate: number }>();

/** Guarda as URLs que vieram com as linhas e devolve as linhas sem o campo url (o tipo de hoje). */
function semUrlsNoCache(linhas: unknown[]): RegistroDiarioNutri[] {
  const agora = Date.now();
  const saida: RegistroDiarioNutri[] = [];
  for (const l of linhas as Array<Record<string, unknown>>) {
    const { url, ...linha } = l;
    const u = typeof url === "string" ? urlAssinadaDoServidor(url) : null;
    if (typeof linha.id === "string" && u) {
      urlsDaLista.delete(linha.id);
      urlsDaLista.set(linha.id, { url: u, ate: agora + CACHE_URLS_MS });
    }
    saida.push(linha as unknown as RegistroDiarioNutri);
  }
  // o teto do cache: fora os vencidos e, se ainda passar, os mais antigos (a ordem de entrada do Map)
  if (urlsDaLista.size > CACHE_URLS_MAX) {
    for (const [id, v] of urlsDaLista) if (v.ate <= agora) urlsDaLista.delete(id);
    for (const id of urlsDaLista.keys()) {
      if (urlsDaLista.size <= CACHE_URLS_MAX) break;
      urlsDaLista.delete(id);
    }
  }
  return saida;
}

/** A URL guardada do registro (1 uso: sai do cache), se ainda não venceu. */
function urlDoCache(id: string): string | null {
  const v = urlsDaLista.get(id);
  if (!v) return null;
  urlsDaLista.delete(id);
  return v.ate > Date.now() ? v.url : null;
}

/** A página do servidor (os registros, o total, o total de cada dia que ela partiu ao meio e as miniaturas) — 1 ida. */
async function lerPaginaDoDiario(contaId: string, f: FiltrosDiario, pagina: number) {
  const r = await lerNutricao("diario_pagina", {
    ...paramsDoDiario(contaId, f), dias: diasDoPeriodo(f.deIso), pagina: Math.max(1, Math.floor(pagina) || 1), com_urls: true,
  });
  if (typeof r.total !== "number") throw new Error("O banco não devolveu a contagem do diário.");
  const porDia = ((r.valor as { por_dia?: unknown } | null)?.por_dia ?? []) as Array<{ dia: string; total: number }>;
  return { itens: semUrlsNoCache(r.linhas ?? []), total: r.total, porDia: Array.isArray(porDia) ? porDia : [] };
}

/** UMA página dos registros do período (o aluno e o "só não reagidas" no banco), mais recente primeiro; o total vem junto. */
export async function listarDiarioPagina(contaId: string, uid: string, f: FiltrosDiario, pagina: number): Promise<Pagina<RegistroDiarioNutri>> {
  const { itens, total } = await lerPaginaDoDiario(contaId, f, pagina);
  return { itens, total };
}

/** Quantos registros (HEAD: só a contagem, no banco) — o "Só não reagidas (N)" e o total de um dia que a página partiu ao meio. */
export async function contarDiario(contaId: string, uid: string, f: FiltrosDiario & { ateIso?: string }): Promise<number> {
  const r = await lerNutricao("diario_contagem", { ...paramsDoDiario(contaId, f), ...(f.ateIso ? { ate: new Date(f.ateIso).toISOString() } : {}) });
  if (typeof r.total !== "number") throw new Error("O banco não devolveu a contagem do diário.");
  return r.total;
}

const meiaNoite = (iso: string): Date => {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

/**
 * Os dias (meia-noite LOCAL) da página que podem continuar em outra página: o 1º, se a página não é a 1ª; o último, se há registros
 * depois dela. Os do meio estão inteiros na página (a ordem é por data e hora). hml-20c: o servidor aplica esta MESMA regra (o porDia da
 * diario_pagina, com os inícios de dia locais que vão daqui) — ela fica aqui como a referência (o leituraServidor.test.ts compara as 2).
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

/**
 * A página + o total de cada dia que ela partiu (chave dd/MM/yyyy): o título do dia diz quantos o dia tem, não só os que couberam.
 * hml-20c: numa ida só — o servidor conta cada dia cortado (a regra do diasQuePodemContinuar, com os inícios de dia LOCAIS que vão daqui).
 */
export async function listarDiarioPaginaComDias(
  contaId: string,
  uid: string,
  f: FiltrosDiario,
  pagina: number,
): Promise<Pagina<RegistroDiarioNutri> & { porDia: Record<string, number> }> {
  const p = await lerPaginaDoDiario(contaId, f, pagina);
  const porDia: Record<string, number> = {};
  for (const d of p.porDia) if (typeof d?.dia === "string" && typeof d.total === "number") porDia[chaveDia(d.dia)] = d.total;
  return { itens: p.itens, total: p.total, porDia };
}

/** Os alunos com foto no período (as opções do filtro "Aluno": do banco, não da página que carregou), por nome. */
export async function listarAlunosDoDiario(contaId: string, uid: string, deIso: string): Promise<AlunoDoDiario[]> {
  const r = await lerNutricao("diario_alunos", { conta: contaId, de: new Date(deIso).toISOString() });
  return ((r.linhas ?? []) as unknown as (AlunoDoDiario & { registros?: unknown })[]).map(({ registros: _registros, ...aluno }) => aluno);
}

/**
 * Registros VIVOS a partir de `deIso` dos alunos da conta ativa que você vê, mais recente primeiro, com o aluno embutido. hml-14b: é
 * uma JANELA (o "Diário de hoje" do Dashboard e o número da aba: 1 e 7 dias) — no máximo 1000 (D18); a aba Diário usa a página.
 */
export async function listarDiarioDaConta(contaId: string, uid: string, deIso: string): Promise<RegistroDiarioNutri[]> {
  // hml-20c: com as miniaturas na MESMA ida (o com_urls) — o urlsAssinadas do Dashboard serve do cache
  const r = await lerNutricao("diario_hoje", { conta: contaId, de: new Date(deIso).toISOString(), com_urls: true });
  return semUrlsNoCache(r.linhas ?? []);
}

/** Reação + comentário (reacao null = tira a reação; o servidor apara o comentário e põe o agora). 0 linha → a frase de antes. */
export async function reagir(id: string, reacao: Reacao | null, comentario: string): Promise<RegistroDiarioRow> {
  const { linha } = await acaoNutricao<{ linha: RegistroDiarioRow }>("diario_reagir", { id, reacao, comentario })
    .catch((e) => comFraseDoCodigo(e, { nao_encontrado: "Você não pode reagir a esta foto (ou ela foi excluída)." }));
  return linha;
}

/** Soft delete (Lixeira) e depois a foto do bucket (no servidor; se o remove falhar, fica o arquivo, nunca a linha viva sem a foto). */
export async function excluirRegistro(r: Pick<RegistroDiarioRow, "id" | "path">): Promise<void> {
  await acaoNutricao("diario_excluir", { id: r.id })
    .catch((e) => comFraseDoCodigo(e, { nao_encontrado: "Você não pode excluir esta foto (ou ela já foi excluída)." }));
}

/**
 * URL assinada de curta duração (a foto grande gera a própria ao abrir). hml-20c: vai o id — o servidor relê a linha COMO A PESSOA e
 * assina o caminho dela, com o prazo de hoje (300 s; o `segundos` fica na assinatura — a tela sempre pediu 300).
 */
export async function urlAssinada(r: Pick<RegistroDiarioRow, "id" | "path">, segundos = 300): Promise<string> {
  void segundos;
  const lido = await lerNutricao("diario_foto_url", { id: r.id }, { sozinha: true });
  const url = urlAssinadaDoServidor(((lido.linhas ?? [])[0] as { url?: unknown } | undefined)?.url);
  if (!url) throw new Error("Não foi possível abrir a foto.");
  return url;
}

/**
 * URLs assinadas em LOTE (miniaturas), por id do registro. As que falharem ficam de fora. hml-20c: vão só os ids (até 60 por item, no
 * mesmo lote) — o servidor relê o caminho de cada um como a pessoa e assina (1 h, o prazo de hoje; o `segundos` fica na assinatura).
 */
export async function urlsAssinadas(registros: Pick<RegistroDiarioRow, "id" | "path">[], segundos = 3600): Promise<Record<string, string>> {
  void segundos;
  const saida: Record<string, string> = {};
  // hml-20c: as que vieram com a lista (o com_urls) saem do cache, sem ir ao servidor; as outras, pelo diario_urls como antes
  const ids = [...new Set(registros.filter((r) => r.path).map((r) => r.id))].filter((id) => {
    const u = urlDoCache(id);
    if (u) saida[id] = u;
    return !u;
  });
  if (!ids.length) return saida;
  const partes: string[][] = [];
  for (let i = 0; i < ids.length; i += IDS_POR_LEITURA) partes.push(ids.slice(i, i + IDS_POR_LEITURA));
  const respostas = await Promise.all(partes.map((p) => lerNutricao("diario_urls", { ids: p })));
  for (const r of respostas) {
    for (const linha of (r.linhas ?? []) as Array<{ id?: unknown; url?: unknown }>) {
      const u = urlAssinadaDoServidor(linha.url);
      if (typeof linha.id === "string" && u) saida[linha.id] = u;
    }
  }
  return saida;
}
