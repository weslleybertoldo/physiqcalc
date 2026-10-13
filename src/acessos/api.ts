// Physiq W-A P2 — a porta da TELA para a aba Acessos (P4): a função acessos (principal) e a treino-acessos (Treino). O molde do
// src/financeiro/gravar.ts (1 chamada, sem repetir; sem internet → sem_internet ANTES de chamar; a rede que cai → rede; o erro vira
// ErroAcessos(codigo) com a FRASE fixa do código — a mensagem crua do banco nunca chega à tela) e, na treino-acessos, o da treino-leitura
// (src/treino/editor/api.ts: fetch próprio de 1 tentativa até 25 s, com o token do PRINCIPAL — a nutricionista e o dono sem papel não têm
// sessão no Treino). O getSession daqui só LÊ a sessão guardada para levar o token (a hml-21a lista este arquivo no SESSAO_ANTES_DA_FUNCAO da
// src/integrations/semBancoNoNavegador.test.ts). Nada fala com o banco (src/aluno-dia/semBancoDireto.test.ts).
import { principal } from "@/integrations/principal/client";
import { criarFetchResiliente, TEMPO_FUNCAO_MS } from "@/integrations/repeticao";
import { DB_SCHEMA } from "@/integrations/supabase/client";
import type { AcessosDoAluno, ChaveDeAcesso, NivelDasSeries, SeriesDoAluno, SeriesSalvas } from "./tipos";

/** A frase de cada código (os das 2 funções — STATUS_DO_ERRO_ACESSOS e STATUS_DO_ERRO_TREINO_ACESSOS — e os que nascem aqui). */
export const MENSAGEM_ERRO_ACESSOS: Record<string, string> = {
  sem_internet: "Sem internet. Confira a conexão e tente de novo.",
  rede: "Não foi possível falar com o servidor agora. Tente de novo.",
  sem_login: "Sua sessão expirou. Entre de novo para continuar.",
  sem_acesso: "Você não tem permissão para mudar os acessos deste aluno.",
  nao_encontrado: "Aluno não encontrado.",
  aluno_inexistente: "Aluno não encontrado.",
  dados_invalidos: "Confira os dados e tente de novo.",
  ajuste_invalido: "Confira os dados e tente de novo.",
  acao_invalida: "Esta ação não está disponível. Atualize o app.",
  schema_invalido: "Ambiente inválido. Atualize o app.",
  metodo: "Esta ação não está disponível. Atualize o app.",
  sem_login_do_aluno: "Ele ainda não tem login: crie o acesso em Login do aluno.",
  sem_nutricao: "Só vale para aluno com nutricionista numa conta com Nutrição.",
  sem_modulo: "Este aluno não tem Treino nesta conta.",
  sem_treino: "Vale depois do 1º acesso do aluno ao app.",
  principal_indisponivel: "Não deu para ler o Treino agora.",
  conflito: "Já existe um registro igual.",
  corpo_grande: "Dados grandes demais para enviar de uma vez.",
  muitas_acoes: "Muitas ações seguidas. Espere um pouco e tente de novo.",
  tempo_esgotado: "O servidor demorou para responder. Tente de novo.",
  erro_interno: "Não deu certo agora. Tente de novo.",
};

export function mensagemErroAcessos(codigo: string | null | undefined, padrao = "Não deu certo agora. Tente de novo."): string {
  return (codigo && MENSAGEM_ERRO_ACESSOS[codigo]) || padrao;
}

/** O erro de uma chamada da aba Acessos: `codigo` = o da função (ou sem_internet/rede); `message` = a frase fixa do código. */
export class ErroAcessos extends Error {
  readonly codigo: string;
  constructor(codigo: string) {
    super(mensagemErroAcessos(codigo));
    this.name = "ErroAcessos";
    this.codigo = codigo;
  }
}

const online = () => typeof navigator === "undefined" || navigator.onLine !== false;

/** O corpo da resposta de erro da função ({ ok: false, erro }), quando houver. */
async function corpoDoErro(erro: unknown): Promise<Record<string, unknown> | null> {
  const ctx = (erro as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      return (await ctx.clone().json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

/** UMA chamada à função acessos; a ação vai por último no corpo (nenhum campo troca a ação). */
async function chamarAcessos<T>(acao: "ler" | "salvar", corpo: Record<string, unknown>): Promise<T> {
  if (!online()) throw new ErroAcessos("sem_internet");
  const { data, error } = await principal.functions.invoke("acessos", { body: { ...corpo, acao } });
  if (error) {
    const c = await corpoDoErro(error);
    const rede = (error as { name?: unknown })?.name === "FunctionsFetchError";
    throw new ErroAcessos(typeof c?.erro === "string" ? c.erro : rede ? "rede" : "erro_interno");
  }
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.ok !== true) throw new ErroAcessos(typeof d.erro === "string" ? d.erro : "erro_interno");
  return d as T;
}

/** As linhas da aba Acessos de um aluno (o id da rota: a matrícula ou o id do Treino). */
export const lerAcessos = (aluno: string) => chamarAcessos<AcessosDoAluno & { ok: true }>("ler", { aluno });
/** Muda uma linha (acesso_app/diario_alimentar/acesso_link: bloqueado|liberado; dieta: ver|mexer) e devolve a aba inteira de novo. */
export const salvarAcesso = (aluno: string, chave: ChaveDeAcesso, valor: string) =>
  chamarAcessos<AcessosDoAluno & { ok: true }>("salvar", { aluno, chave, valor });

// ───────────────────────── a treino-acessos (Banco do Treino), com o token do PRINCIPAL ─────────────────────────
const URL_TREINO_ACESSOS = `${String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "")}/functions/v1/treino-acessos`;
// 1 tentativa (0 = não repete), até 25 s (o orçamento da função é 20 s) — o molde da treino-leitura
const buscarTreino = criarFetchResiliente(0, TEMPO_FUNCAO_MS, undefined, { banco: "treino" });

async function chamarTreinoAcessos<T>(corpo: Record<string, unknown>): Promise<T> {
  if (!online()) throw new ErroAcessos("sem_internet");
  const { data } = await principal.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ErroAcessos("sem_login");
  let r: Response;
  try {
    r = await buscarTreino(URL_TREINO_ACESSOS, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "x-schema": DB_SCHEMA },
      body: JSON.stringify(corpo),
    });
  } catch {
    throw new ErroAcessos("rede");
  }
  const c = (await r.json().catch(() => null)) as Record<string, unknown> | null;
  if (r.status !== 200 || !c || c.ok !== true) throw new ErroAcessos(typeof c?.erro === "string" ? c.erro : "erro_interno");
  return c as T;
}

/** A linha "Treino — séries": o nível de hoje e se quem chama pode mudar. */
export const lerSeries = (aluno: string) => chamarTreinoAcessos<SeriesDoAluno & { ok: true }>({ acao: "ler", aluno });
/** Muda o cadeado das séries ("ver" = o aluno não põe nem tira séries); a ação vai por último. */
export const salvarSeries = (aluno: string, valor: NivelDasSeries) => chamarTreinoAcessos<SeriesSalvas & { ok: true }>({ aluno, valor, acao: "salvar" });
