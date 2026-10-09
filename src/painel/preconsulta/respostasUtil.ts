// Physiq W21 — regras PURAS das respostas de pré-consulta (porta de src/lib/respostasPreconsultaUtil.ts do PhysiqNutri, main 294887a,
// para o Painel › Pré-consulta › Respostas — spec §4.4, N-13). O que chega pelo link público /f/<slug> cai na caixa de entrada; o
// profissional LIGA a resposta a um aluno (sugestão por e-mail → telefone → nome, ou cadastra o aluno com os dados de quem respondeu)
// e, se for nutricionista da conta com Nutrição, IMPORTA para o prontuário do aluno: resposta de questionário de saúde vira uma
// aplicação de questionário; pré-anamnese/personalizado vira uma anamnese (as tabelas que a aba Prontuário da W18 e o site antigo
// mostram). "Nova" = o critério do Nutri (o "respostas de pré-consulta sem paciente" do Dashboard de lá): viva e sem aluno ligado
// (importar exige aluno, então nova nunca está importada). Nada de rede; testado no vitest.
import { format } from "date-fns";
import { semAcento } from "@/nutricao/editor/lib/alimentosUtil";
import { PERGUNTA_MAX, RESPOSTA_MAX, TEXTO_LIVRE_MAX, TITULO_MAX, type RegistroAnamnese } from "@/nutricao/prontuario/lib/anamneseUtil";
import {
  OBSERVACAO_QUESTIONARIO_MAX, TITULO_QUESTIONARIO_MAX, contarRespondidas, lerFaixas, lerNivel, lerPerguntas, lerRespostas, pontuacaoMaxima, respondida, textoResposta,
  type Nivel, type RegistroAplicacao,
} from "@/nutricao/prontuario/lib/questionariosUtil";
import { EMAIL_MAX, NOME_MAX, TELEFONE_MAX } from "./preconsultaUtil";
import { iniciais } from "@/ui/premium/texto";

export type OrigemResposta = "anamnese" | "questionario" | "personalizado";
export type TipoImportacao = "anamnese" | "questionario";
/** Embed do formulário pela FK (`formulario:formularios_preconsulta(...)`). Soft-deletado continua vindo; null só em hard delete. */
export type FormularioDaResposta = { id: string; titulo: string; origem: string; origem_id: string | null; slug: string; ativo: boolean; deleted_at: string | null };
/** O que as regras precisam da linha de `respostas_preconsulta` (+ o embed do formulário). */
export type RespostaBase = {
  id: string;
  nutricionista_id?: string;
  conta_id?: string | null;
  formulario_id: string | null;
  titulo: string;
  perguntas: unknown;
  faixas: unknown;
  respostas: unknown;
  pontuacao: number | string | null;
  faixa: string | null;
  nivel: string | null;
  nome: string;
  email: string | null;
  telefone: string | null;
  paciente_id: string | null;
  respondido_em: string;
  created_at: string;
  importada_em: string | null;
  importada_tipo: string | null;
  importada_id: string | null;
  deleted_at?: string | null;
  formulario?: FormularioDaResposta | null;
};

/** Texto de 1 linha: espaços repetidos viram 1, pontas fora; nulo vira "". */
const linha1 = (s: unknown): string => (typeof s === "string" ? s : s == null ? "" : String(s)).replace(/\s+/g, " ").trim();
/** Chave de comparação: sem acento, sem caixa, espaços únicos. */
export const chaveTexto = (s: unknown): string => semAcento(linha1(s)).toLowerCase();
export const apenasDigitos = (s: unknown): string => linha1(s).replace(/\D/g, "");
const numero = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ---- Novas (badge do menu) ----
/** Nova = viva e sem aluno ligado (o critério do Nutri; o painel conta as do recorte da conta ativa). */
export const ehNova = (r: { paciente_id: string | null; deleted_at?: string | null }): boolean => !r.paciente_id && !r.deleted_at;

// ---- Contagens (hml-14b: a lista, a ordem, os filtros e a busca são do banco — respostas_da_conta; os números do topo e da aba
// Formulários ainda saem da leitura de até 1000 do usePreConsulta) ----
export const textoContagemRespostas = (n: number): string => (n === 0 ? "Nenhuma resposta" : n === 1 ? "1 resposta" : `${n} respostas`);
/** Respostas por formulário (a lista de formulários mostra "N respostas · M novas"). */
export function respostasPorFormulario(lista: { formulario_id: string | null; paciente_id: string | null; deleted_at?: string | null }[]): Map<string, { total: number; novas: number }> {
  const m = new Map<string, { total: number; novas: number }>();
  for (const r of lista) {
    if (!r.formulario_id) continue;
    const c = m.get(r.formulario_id) ?? { total: 0, novas: 0 };
    c.total += 1;
    if (ehNova(r)) c.novas += 1;
    m.set(r.formulario_id, c);
  }
  return m;
}
/** Respostas do mês corrente (fuso local) — o número do topo. */
export const respostasDoMes = (lista: { respondido_em: string }[], hoje: Date = new Date()): number =>
  lista.filter((r) => {
    const d = new Date(r.respondido_em);
    return d.getFullYear() === hoje.getFullYear() && d.getMonth() === hoje.getMonth();
  }).length;

const SEMANA = 7 * 24 * 60 * 60 * 1000;

/** Respostas por semana nas últimas 8 semanas (a mais antiga primeiro) — a linha do número "Respostas no mês". */
export function respostasPorSemana(lista: { respondido_em: string }[], agora: Date = new Date(), semanas = 8): number[] {
  const fim = agora.getTime();
  const saida = Array.from({ length: semanas }, () => 0);
  for (const r of lista) {
    const t = new Date(r.respondido_em).getTime();
    const i = Math.floor((fim - t) / SEMANA);
    if (i >= 0 && i < semanas) saida[semanas - 1 - i] += 1;
  }
  return saida;
}

// ---- Filtros (na URL: ?formulario=<título>&q=<busca>&sem=1&aluno=<id>) ----
export type FiltrosRespostas = { formulario: string; busca: string; soNovas: boolean; aluno: string };
export const FILTROS_VAZIOS: FiltrosRespostas = { formulario: "", busca: "", soNovas: false, aluno: "" };
type Params = { get(nome: string): string | null };
/** `sem=1` é o link do Nutri ("respostas sem paciente" → /respostas-pre-consulta?sem=1 → /painel/pre-consulta?sem=1&aba=respostas). */
export const filtrosDaURL = (p: Params): FiltrosRespostas => ({
  formulario: linha1(p.get("formulario")),
  busca: linha1(p.get("q")),
  soNovas: p.get("sem") === "1",
  aluno: linha1(p.get("aluno")),
});
/** Só o que está preenchido entra na URL. */
export function filtrosParaURL(f: FiltrosRespostas): Record<string, string> {
  const saida: Record<string, string> = {};
  if (linha1(f.formulario)) saida.formulario = linha1(f.formulario);
  if (linha1(f.busca)) saida.q = linha1(f.busca);
  if (f.soNovas) saida.sem = "1";
  if (linha1(f.aluno)) saida.aluno = linha1(f.aluno);
  return saida;
}
export const filtrosAtivos = (f: FiltrosRespostas): boolean => !!linha1(f.formulario) || !!linha1(f.busca) || f.soNovas || !!linha1(f.aluno);
/** Títulos únicos (sem caixa/acento), em ordem alfabética — opções do filtro por formulário. */
export function titulosFormularios(lista: { titulo: string }[]): string[] {
  const vistos = new Map<string, string>();
  for (const r of lista) {
    const t = linha1(r.titulo);
    const k = chaveTexto(t);
    if (t && !vistos.has(k)) vistos.set(k, t);
  }
  return [...vistos.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// ---- hml-14b (B21): a lista vem do banco, uma página por vez (respostas_da_conta) ----
/** O aluno ligado, como a lista mostra: só o da conta ativa e fora da lixeira (senão "fora da sua lista") — vem junto da resposta. */
export type AlunoDaResposta = { id: string; nome: string; nutricionista_id: string | null };
/** A página da tela: as respostas, o total com os filtros, o total sem filtro, as novas, os títulos do filtro e o aluno do ?aluno=. */
export type PaginaRespostas<T> = {
  itens: T[];
  total: number;
  totalConta: number;
  novas: number;
  titulos: string[];
  alunoFiltro: { id: string; nome: string } | null;
};
/** Os filtros da URL no formato da respostas_da_conta (o banco normaliza busca e título do mesmo jeito: sem acento, sem caixa). */
export function filtrosParaBanco(f: FiltrosRespostas): Record<string, string> {
  const saida: Record<string, string> = {};
  if (linha1(f.formulario)) saida.formulario = linha1(f.formulario);
  if (linha1(f.busca)) saida.q = linha1(f.busca);
  if (f.soNovas) saida.novas = "true";
  if (linha1(f.aluno)) saida.aluno = linha1(f.aluno);
  return saida;
}
const contagem = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
/** A resposta da respostas_da_conta → a página (null = formato inesperado: a tela mostra o erro, nunca uma lista vazia no lugar). */
export function normalizarPaginaRespostas<T>(bruto: unknown): PaginaRespostas<T> | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as Record<string, unknown>;
  const total = contagem(b.total);
  const totalConta = contagem(b.total_conta);
  const novas = contagem(b.novas);
  if (b.ok !== true || !Array.isArray(b.itens) || total === null || totalConta === null || novas === null) return null;
  const titulos = (Array.isArray(b.titulos) ? b.titulos : []).filter((t): t is string => typeof t === "string").map((titulo) => ({ titulo }));
  const a = b.aluno && typeof b.aluno === "object" ? (b.aluno as Record<string, unknown>) : null;
  return {
    itens: b.itens as T[],
    total,
    totalConta,
    novas,
    titulos: titulosFormularios(titulos),
    alunoFiltro: a && typeof a.id === "string" ? { id: a.id, nome: typeof a.nome === "string" ? a.nome : "" } : null,
  };
}

// ---- Origem e situação do formulário ----
/** 'questionario' se o formulário veio de um questionário OU se a resposta tem faixas; senão pela origem do embed; removido → personalizado. */
export function origemDaResposta(r: Pick<RespostaBase, "faixas" | "formulario">): OrigemResposta {
  const o = r.formulario?.origem;
  if (o === "questionario" || lerFaixas(r.faixas).length > 0) return "questionario";
  if (o === "anamnese") return "anamnese";
  return "personalizado";
}
/** Para onde a importação vai: questionário de saúde (aplicação) ou anamnese. */
export const tipoImportacao = (r: Pick<RespostaBase, "faixas" | "formulario">): TipoImportacao => (origemDaResposta(r) === "questionario" ? "questionario" : "anamnese");
export const textoOrigemResposta = (o: OrigemResposta): string => (o === "questionario" ? "Questionário de saúde" : o === "anamnese" ? "Pré-anamnese" : "Personalizado");
export const textoTipoImportacao = (t: string | null | undefined): string => (t === "questionario" ? "questionário" : "anamnese");
export type SituacaoFormulario = "ativo" | "inativo" | "excluido" | "removido";
/** `formulario_id` null (hard delete) ou sem embed → removido; `deleted_at` → excluído (soft); senão ativo/inativo. */
export function situacaoFormulario(r: Pick<RespostaBase, "formulario_id" | "formulario">): SituacaoFormulario {
  const f = r.formulario;
  if (!r.formulario_id || !f) return "removido";
  if (f.deleted_at) return "excluido";
  return f.ativo ? "ativo" : "inativo";
}
export const textoSituacaoFormulario = (s: SituacaoFormulario): string =>
  s === "removido" ? "formulário removido" : s === "excluido" ? "formulário excluído" : s === "inativo" ? "formulário inativo" : "";

// ---- Pontuação ----
export type PontosResposta = { pontos: number; max: number; temFaixas: boolean; faixa: string; nivel: Nivel | ""; respondidas: number; total: number };
/** Pontos gravados pela RPC + máximo possível pela cópia das perguntas; selo só quando há faixas. */
export function pontosDaResposta(r: Pick<RespostaBase, "perguntas" | "faixas" | "respostas" | "pontuacao" | "faixa" | "nivel">): PontosResposta {
  const perguntas = lerPerguntas(r.perguntas);
  const respostas = lerRespostas(r.respostas);
  return {
    pontos: numero(r.pontuacao),
    max: pontuacaoMaxima(perguntas),
    temFaixas: lerFaixas(r.faixas).length > 0,
    faixa: linha1(r.faixa),
    nivel: lerNivel(r.nivel),
    respondidas: contarRespondidas(perguntas, respostas),
    total: perguntas.length,
  };
}

// ---- Ligar a um aluno ----
export type AlunoParaLigar = { id: string; nome: string; email: string | null; telefone: string | null };
export type MotivoSugestao = "email" | "telefone" | "nome";
export type Sugestao<T> = { aluno: T; por: MotivoSugestao };
export const TELEFONE_DIGITOS_MIN = 8;
const mesmoTelefone = (a: string, b: string): boolean => a.length >= TELEFONE_DIGITOS_MIN && b.length >= TELEFONE_DIGITOS_MIN && (a === b || a.endsWith(b) || b.endsWith(a));
/** 1º e-mail igual (sem caixa) → 2º telefone com os mesmos dígitos (≥ 8; tolera DDI) → 3º nome igual (sem acento/caixa); senão null. */
export function sugerirAluno<T extends AlunoParaLigar>(r: Pick<RespostaBase, "nome" | "email" | "telefone">, alunos: T[]): Sugestao<T> | null {
  const email = chaveTexto(r.email);
  if (email) {
    const a = alunos.find((x) => chaveTexto(x.email) === email);
    if (a) return { aluno: a, por: "email" };
  }
  const tel = apenasDigitos(r.telefone);
  if (tel.length >= TELEFONE_DIGITOS_MIN) {
    const a = alunos.find((x) => mesmoTelefone(apenasDigitos(x.telefone), tel));
    if (a) return { aluno: a, por: "telefone" };
  }
  const nome = chaveTexto(r.nome);
  if (nome) {
    const a = alunos.find((x) => chaveTexto(x.nome) === nome);
    if (a) return { aluno: a, por: "nome" };
  }
  return null;
}
export const textoSugestao = (por: MotivoSugestao): string => (por === "email" ? "mesmo e-mail" : por === "telefone" ? "mesmo telefone" : "mesmo nome");
/** Nome/e-mail/telefone de quem respondeu, prontos para o "Cadastrar aluno com estes dados" (limites da RPC pública). */
export const dadosAlunoDaResposta = (r: Pick<RespostaBase, "nome" | "email" | "telefone">): { nome: string; email: string; telefone: string } => ({
  nome: linha1(r.nome).slice(0, NOME_MAX),
  email: linha1(r.email).toLowerCase().slice(0, EMAIL_MAX),
  telefone: linha1(r.telefone).slice(0, TELEFONE_MAX),
});

// ---- Importação (só nutricionista com Nutrição — a anamnese e os questionários são clínicos, regra da W18) ----
export const importada = (r: Pick<RespostaBase, "importada_em">): boolean => !!r.importada_em;
/** Importar exige aluno ligado e acontece 1 vez. */
export const podeImportar = (r: Pick<RespostaBase, "paciente_id" | "importada_em">): boolean => !!r.paciente_id && !r.importada_em;
/** Depois de importada o vínculo fica travado (a anamnese/aplicação já está no aluno). */
export const podeDesligar = (r: Pick<RespostaBase, "paciente_id" | "importada_em">): boolean => !!r.paciente_id && !r.importada_em;

export type AlunoDaImportacao = { id: string; nutricionista_id: string | null };
export type QuemImporta = { uid: string; souNutri: boolean; souDono: boolean };
/**
 * Por que NÃO dá para importar esta resposta (ou null = pode): o banco só deixa gravar a anamnese/aplicação para quem muda a nutrição
 * do aluno (a nutricionista responsável ou o dono que também é nutricionista — W3/W18); a tela diz o motivo antes de tentar.
 */
export function motivoSemImportar(r: Pick<RespostaBase, "paciente_id" | "importada_em">, quem: QuemImporta, aluno: AlunoDaImportacao | null | undefined): string | null {
  if (r.importada_em) return "Esta resposta já foi importada";
  if (!quem.souNutri) return "Importar para a anamnese é da nutricionista (o prontuário clínico é dela)";
  if (!r.paciente_id) return "Ligue a resposta a um aluno para importar";
  if (!aluno) return "O aluno ligado não está na sua lista";
  if (!aluno.nutricionista_id) return "O aluno não tem nutrição nesta conta";
  if (aluno.nutricionista_id !== quem.uid && !quem.souDono) return "Só a nutricionista responsável pelo aluno importa para o prontuário dele";
  return null;
}

/** timestamptz volta ISO com fuso → `new Date` e formata no fuso local. */
export const formatarDataHoraResposta = (iso: string | null | undefined): string => (iso ? format(new Date(iso), "dd/MM/yyyy HH:mm") : "");
export const formatarDataCurta = (iso: string | null | undefined): string => (iso ? format(new Date(iso), "dd/MM") : "");
/** yyyy-MM-dd no fuso local (coluna `date` da aplicação de questionário). */
export const dataLocalISO = (iso: string): string => format(new Date(iso), "yyyy-MM-dd");
export const textoImportada = (r: Pick<RespostaBase, "importada_em" | "importada_tipo">): string =>
  r.importada_em ? `Importada para ${textoTipoImportacao(r.importada_tipo)} em ${formatarDataCurta(r.importada_em)}` : "";
/** Seção do Prontuário do aluno (W18) onde a importação foi parar ('' se não importada ou sem aluno). */
export const linkImportada = (r: Pick<RespostaBase, "paciente_id" | "importada_em" | "importada_tipo">): string =>
  r.paciente_id && r.importada_em
    ? `/painel/alunos/${encodeURIComponent(r.paciente_id)}/prontuario?secao=${r.importada_tipo === "questionario" ? "questionarios" : "anamnese"}`
    : "";
export const linkAluno = (id: string | null | undefined): string => (id ? `/painel/alunos/${encodeURIComponent(id)}` : "");
export const contatoResposta = (r: Pick<RespostaBase, "email" | "telefone">): string => [linha1(r.email), linha1(r.telefone)].filter(Boolean).join(" · ");
export function textoConfirmarImportar(r: Pick<RespostaBase, "nome" | "faixas" | "formulario">, nomeAluno: string): string {
  const alvo = tipoImportacao(r) === "questionario" ? "uma aplicação de questionário de saúde" : "uma anamnese";
  return `A resposta de ${linha1(r.nome)} vai virar ${alvo} no prontuário de ${linha1(nomeAluno) || "o aluno ligado"}, com a data em que foi respondida. Isso acontece 1 vez por resposta.`;
}
/** Resposta → anamnese do aluno: TODAS as perguntas entram (não respondida → ''); a data é a hora da resposta (timestamptz). */
export function anamneseDaResposta(r: RespostaBase): RegistroAnamnese {
  const perguntas = lerPerguntas(r.perguntas);
  const respostas = lerRespostas(r.respostas);
  const conteudo = perguntas.map((p) => ({
    pergunta: linha1(p.texto).slice(0, PERGUNTA_MAX),
    resposta: (respondida(p, respostas[p.id]) ? textoResposta(p, respostas[p.id]) : "").slice(0, RESPOSTA_MAX),
  }));
  const contato = contatoResposta(r);
  return {
    titulo: (linha1(r.titulo) || "Pré-consulta").slice(0, TITULO_MAX),
    data: r.respondido_em,
    conteudo,
    texto_livre: `Pré-consulta respondida por ${linha1(r.nome)}${contato ? ` (${contato})` : ""} em ${formatarDataHoraResposta(r.respondido_em)}`.slice(0, TEXTO_LIVRE_MAX),
  };
}
/** Resposta → aplicação de questionário: título/perguntas/faixas/respostas e pontuação/faixa/nível COPIADOS; `questionario_id` só quando o formulário veio de um questionário. */
export function aplicacaoDaResposta(r: RespostaBase): RegistroAplicacao {
  const f = r.formulario;
  const contato = [linha1(r.nome), linha1(r.email)].filter(Boolean).join(" · ");
  return {
    questionario_id: f && f.origem === "questionario" && f.origem_id ? f.origem_id : null,
    titulo: (linha1(r.titulo) || "Pré-consulta").slice(0, TITULO_QUESTIONARIO_MAX),
    perguntas: lerPerguntas(r.perguntas),
    faixas: lerFaixas(r.faixas),
    respostas: lerRespostas(r.respostas),
    pontuacao: numero(r.pontuacao),
    faixa: linha1(r.faixa),
    nivel: lerNivel(r.nivel),
    data: dataLocalISO(r.respondido_em),
    observacao: `Importada da pré-consulta (${contato})`.slice(0, OBSERVACAO_QUESTIONARIO_MAX),
  };
}

/** Iniciais de quem respondeu (avatar da linha) — W27: a MESMA função do Avatar (W25: só letras; "Ana (mãe)" → "AM", nunca "A("). */
export const iniciaisDe = (nome: string): string => iniciais(linha1(nome));
