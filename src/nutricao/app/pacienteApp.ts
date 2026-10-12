// Physiq W11 — acesso a dados da aba Dieta no BANCO PRINCIPAL (porta do src/lib/pacienteApp.ts do PhysiqNutri, W34/W58):
//   · leitura: a função minha_dieta(p_dia) (security definer: só o que é do próprio aluno, de todas as matrículas com Nutrição);
//   · ✓ das refeições: a MESMA função do site antigo (paciente_marcar_refeicao) — o Physiq e o site antigo veem o mesmo ✓;
//   · ✓ das metas do dia (NF4): aluno_marcar_meta (nova, W11);
//   · foto do diário: sobe no bucket privado "diario" e grava pela diario_enviar com o código do próprio aluno — o mesmo caminho do
//     link público (W30 do Nutri); a foto do próprio aluno volta por URL assinada (P29).
// hml-19b (H-41 · jeito 2 · decisão 14): as GRAVAÇÕES passam pela função nutricao (src/nutricao/servidor.ts), com a sessão do aluno —
// as MESMAS RPCs de hoje, chamadas lá como a pessoa (aluno_marcar_refeicao, aluno_marcar_meta). A foto sobe pelo LINK ASSINADO que o
// servidor dá (aluno_diario_preparar: o caminho <nutricionista>/<aluno>/<uuid>.<ext> é montado lá; o app sobe com uploadToSignedUrl) e
// o registro vai pela aluno_diario_enviar (o servidor confere que o arquivo chegou naquele caminho e chama a diario_enviar). Mesmas
// assinaturas; o erro chega com o CÓDIGO na mensagem, como antes (as telas traduzem: refeicaoConcluidaUtil, metasUtil, diarioUtil), e o
// otimista do useDieta não muda.
// hml-20a (H-42 · jeito 2, etapa 2): as LEITURAS também passam pela função nutricao (ação `ler`, no lote da tela — src/nutricao/leitura.ts),
// com a sessão do aluno: a minha_dieta(p_dia) pela consulta aluno_dieta e as URLs das fotos do próprio diário pela aluno_diario_urls (o
// servidor relê o caminho de cada registro como o aluno e assina no bucket do ambiente, 1 h — nunca um caminho mandado daqui). Mesmas
// assinaturas e os mesmos tipos de antes; o useDieta (chaves, staleTime, o cache de 50 min das URLs) não muda. O erro de leitura chega
// com o CÓDIGO na mensagem, como o das gravações (a tela compara "sem_internet").
// Online (9A): sem internet nada é gravado e a tela avisa.
import { PRINCIPAL_URL, principal } from "@/integrations/principal/client";
import { ErroLeitura, lerNutricao } from "@/nutricao/leitura";
import { ErroNutricao, acaoNutricao } from "@/nutricao/servidor";
import { mimeDaFotoDiario, type Refeicao } from "./diarioUtil";
import type { DadosDieta, MatriculaNutricao, RegistroDiario } from "./tipos";

/** Quantos registros do diário por consulta (o DIARIO_IDS_MAX do catálogo do servidor): acima, a lista vai em mais de um item do lote. */
export const IDS_DO_DIARIO_POR_LEITURA = 60;

function semInternet(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function erro(e: { message?: string } | null | undefined, padrao = "erro_interno"): Error {
  const m = e?.message ?? padrao;
  return new Error(/failed to fetch|network|load failed/i.test(m) ? "sem_internet" : m);
}

/**
 * O erro de uma ação da nutricao no app: a mensagem passa a ser o CÓDIGO (as telas do app traduzem o código, como faziam com a mensagem
 * da RPC); a rede que caiu vira sem_internet, como antes. O resto sobe como veio.
 */
function erroDoApp(e: unknown): Error {
  if (e instanceof ErroNutricao) {
    const codigo = e.codigo === "rede" ? "sem_internet" : e.codigo;
    return new ErroNutricao(codigo, e.extra, codigo);
  }
  return e instanceof Error ? e : new Error("erro_interno");
}

/** O erro de uma leitura no app: a mensagem passa a ser o CÓDIGO (rede → sem_internet), como o erroDoApp das gravações. */
function erroDaLeituraDoApp(e: unknown): Error {
  if (e instanceof ErroLeitura) {
    const codigo = e.codigo === "rede" ? "sem_internet" : e.codigo;
    return new ErroLeitura(codigo, e.extra, codigo);
  }
  return e instanceof Error ? e : new Error("erro_interno");
}

const lista = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const textoOu = (v: unknown, padrao: string): string => (typeof v === "string" ? v : padrao);

/** Normaliza o JSON da função (tolerante a campo faltando: nunca quebra a tela). */
export function normalizarDieta(bruto: unknown, dia: string): DadosDieta {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  return {
    hoje: textoOu(b.hoje, dia),
    dia: textoOu(b.dia, dia),
    matriculas: lista(b.matriculas),
    planos: lista<DadosDieta["planos"][number]>(b.planos).map((p) => ({
      ...p,
      kcal_alvo: p.kcal_alvo === null || p.kcal_alvo === undefined ? null : Number(p.kcal_alvo),
      refeicoes: lista<DadosDieta["planos"][number]["refeicoes"][number]>(p.refeicoes).map((r) => ({
        ...r,
        dias_semana: lista<number>(r.dias_semana).map(Number),
        itens: lista<DadosDieta["planos"][number]["refeicoes"][number]["itens"][number]>(r.itens).map((i) => ({
          ...i,
          quantidade_g: Number(i.quantidade_g),
          quantidade_medida: i.quantidade_medida === null || i.quantidade_medida === undefined ? null : Number(i.quantidade_medida),
        })),
      })),
    })),
    orientacoes: lista(b.orientacoes),
    metas: lista<DadosDieta["metas"][number]>(b.metas).map((m) => ({ ...m, dias_semana: lista<number>(m.dias_semana).map(Number) })),
    refeicoes_concluidas: lista<string>(b.refeicoes_concluidas),
    metas_concluidas: lista<string>(b.metas_concluidas),
    diario: lista(b.diario),
  };
}

/** Tudo o que a aba Dieta mostra, com os ✓ do `dia` (yyyy-mm-dd de São Paulo) — a minha_dieta(p_dia) pela função (consulta aluno_dieta). */
export async function minhaDieta(dia: string): Promise<DadosDieta> {
  if (semInternet()) throw new Error("sem_internet");
  const r = await lerNutricao("aluno_dieta", { dia }).catch((e) => {
    throw erroDaLeituraDoApp(e);
  });
  return normalizarDieta(r.valor, dia);
}

/** Marca (true) ou desmarca a refeição no dia; devolve o estado gravado. Erro com o código da função (a tela traduz). */
export async function marcarRefeicao(refeicaoId: string, dia: string, concluida: boolean): Promise<boolean> {
  if (semInternet()) throw new Error("sem_internet");
  const r = await acaoNutricao<{ concluida: boolean }>("aluno_marcar_refeicao", { refeicao_id: refeicaoId, data: dia, concluida }).catch((e) => {
    throw erroDoApp(e);
  });
  return Boolean(r.concluida);
}

/** ✓ na meta do dia (NF4); devolve o estado gravado. */
export async function marcarMeta(metaId: string, dia: string, concluida: boolean): Promise<boolean> {
  if (semInternet()) throw new Error("sem_internet");
  const r = await acaoNutricao<{ concluida: boolean }>("aluno_marcar_meta", { meta_id: metaId, data: dia, concluida }).catch((e) => {
    throw erroDoApp(e);
  });
  return Boolean(r.concluida);
}

export type EnvioDiario = { refeicao: Refeicao; comentario: string; dataHoraIso: string };

/**
 * Foto do diário: o servidor dá o link assinado (o caminho <nutricionista>/<paciente>/<uuid>.<ext> é montado lá), o app sobe a foto
 * nele e o servidor registra pela diario_enviar com o código do próprio aluno (conferindo que o arquivo chegou naquele caminho). Se o
 * registro falha, o servidor tenta tirar o arquivo (o aluno não pode apagar: sobra o órfão, contado no log).
 */
export async function enviarFotoDiario(m: Pick<MatriculaNutricao, "id" | "link_codigo" | "nutricionista">, arquivo: File, form: EnvioDiario): Promise<{ id: string; data_hora: string }> {
  if (semInternet()) throw new Error("sem_internet");
  const mime = mimeDaFotoDiario(arquivo);
  const pedido = { paciente_id: m.id, nutricionista_id: m.nutricionista.id, tipo: mime, tamanho: arquivo.size };
  const link = await acaoNutricao<{ bucket: string; caminho: string; token: string }>("aluno_diario_preparar", pedido).catch((e) => {
    throw erroDoApp(e);
  });
  const up = await principal.storage.from(link.bucket).uploadToSignedUrl(link.caminho, link.token, arquivo, { contentType: mime, cacheControl: "3600" });
  if (up.error) throw erro(up.error);
  const r = await acaoNutricao<{ registro: { id: string; data_hora: string } }>("aluno_diario_enviar", {
    ...pedido,
    caminho: link.caminho,
    codigo: m.link_codigo.trim().toLowerCase(),
    refeicao: form.refeicao,
    comentario: form.comentario.trim(),
    data_hora: form.dataHoraIso,
  }).catch((e) => {
    throw erroDoApp(e);
  });
  return r.registro;
}

/**
 * URLs assinadas das fotos do próprio diário, por id do registro (as que falharem ficam de fora: a tela usa a foto padrão). Vão só os
 * ids (até 60 por item, no mesmo lote): o servidor relê o caminho de cada um como o aluno e assina — a URL vem relativa e é montada com
 * o domínio do cliente (a mesma de hoje). A leitura que falha devolve vazio, como a assinatura que falhava antes.
 */
export async function urlsDoDiario(registros: Pick<RegistroDiario, "id" | "path">[]): Promise<Record<string, string>> {
  const ids = [...new Set(registros.filter((r) => r.path).map((r) => r.id))];
  if (!ids.length) return {};
  const partes: string[][] = [];
  for (let i = 0; i < ids.length; i += IDS_DO_DIARIO_POR_LEITURA) partes.push(ids.slice(i, i + IDS_DO_DIARIO_POR_LEITURA));
  const respostas = await Promise.all(partes.map((p) => lerNutricao("aluno_diario_urls", { ids: p }).catch(() => ({ linhas: [] }))));
  const saida: Record<string, string> = {};
  for (const r of respostas) {
    for (const linha of (Array.isArray(r.linhas) ? r.linhas : []) as Array<{ id?: unknown; url?: unknown }>) {
      const u = urlAssinadaDoServidor(linha.url);
      if (typeof linha.id === "string" && u) saida[linha.id] = u;
    }
  }
  return saida;
}

/** A URL assinada que o servidor devolve (relativa ao projeto) montada com o domínio do cliente do principal; fora do formato → null. */
function urlAssinadaDoServidor(relativa: unknown): string | null {
  if (typeof relativa !== "string" || !relativa.startsWith("/storage/v1/object/sign/") || !PRINCIPAL_URL) return null;
  return `${PRINCIPAL_URL.replace(/\/+$/, "")}${relativa}`;
}
