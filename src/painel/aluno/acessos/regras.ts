// Physiq W-A P4 — regras PURAS da aba Acessos do Painel › Aluno (spec W-A §4.1, §4.7; P1–P4): as 6 linhas na ordem da tabela da spec
// (Acesso ao app · Treino — séries · Dieta · Diário alimentar com fotos · Envio de fotos pelo link · Rotinas), os níveis de cada uma com a
// cor (neutro · azul · verde — o molde AcessosDoMembro do Nativo OS), quando cada linha aparece, o aviso embaixo dela, o "Mudado por <nome>
// em dd/mm hh:mm", o resumo do rodapé e o estado da linha das séries (que carrega à parte, do Banco do Treino). Testado em regras.test.ts.
// Os dados vêm da função acessos (src/acessos/api.ts) e da treino-acessos (as séries); nada aqui fala com a rede.
import type { AcessosDoAluno, ChaveDeAcesso, LinhasDeAcesso, MudancaDeAcesso, NivelDasSeries } from "@/acessos/tipos";
import { primeiroNome } from "../dados/regras";

/** As linhas da aba: as 4 da função acessos, as séries (treino-acessos) e as rotinas (sempre liberadas, sem botão). */
export type ChaveDaLinha = ChaveDeAcesso | "treino_series" | "rotinas";
/** A cor do nível marcado (spec §4.1): neutro (Bloqueado), azul (Só ver), verde (Liberado / Pode mexer / Sempre). */
export type TomDoNivel = "neutro" | "azul" | "verde";

export interface NivelDaLinha {
  valor: string;
  rotulo: string;
  tom: TomDoNivel;
}

export interface DefLinha {
  chave: ChaveDaLinha;
  rotulo: string;
  niveis: readonly NivelDaLinha[];
  dica: string;
}

const APP: readonly NivelDaLinha[] = [
  { valor: "bloqueado", rotulo: "Bloqueado", tom: "neutro" },
  { valor: "liberado", rotulo: "Liberado", tom: "verde" },
];
const VER_MEXER: readonly NivelDaLinha[] = [
  { valor: "ver", rotulo: "Só ver", tom: "azul" },
  { valor: "mexer", rotulo: "Pode mexer", tom: "verde" },
];

/** As 6 linhas, na ordem da tabela da spec §4.1 (os textos são os de lá). */
export const LINHAS_DE_ACESSO: readonly DefLinha[] = [
  {
    chave: "acesso_app", rotulo: "Acesso ao app", niveis: APP,
    dica: "Bloqueado: o app abre fechado com \"Seu acesso ao app está desligado. Fale com seu profissional\".",
  },
  {
    chave: "treino_series", rotulo: "Treino — séries", niveis: VER_MEXER,
    dica: "Só ver: ele não põe nem tira séries (o nº vem do treino). Pode mexer: põe e tira séries no app.",
  },
  {
    chave: "dieta", rotulo: "Dieta", niveis: VER_MEXER,
    dica: "Só ver: como hoje — vê o plano e marca o que comeu. Pode mexer: no dia dele, põe e tira alimentos, cria refeições extras e os próprios alimentos e receitas. O plano não muda.",
  },
  {
    chave: "diario_alimentar", rotulo: "Diário alimentar com fotos", niveis: APP,
    dica: "O aluno manda fotos das refeições (no app e pelo link) e você reage.",
  },
  {
    chave: "acesso_link", rotulo: "Envio de fotos pelo link", niveis: APP,
    dica: "Ele manda as fotos pelo link do diário, sem entrar no app.",
  },
  {
    chave: "rotinas", rotulo: "Rotinas", niveis: [{ valor: "sempre", rotulo: "Sempre liberadas", tom: "verde" }],
    dica: "Ele cria, muda e apaga as rotinas dele (creatina, remédio…).",
  },
];

export const TEXTOS = {
  semLoginApp: "Ele ainda não tem login: crie o acesso em Login do aluno.",
  semDieta: "Este aluno não tem dieta",
  linkSemDiario: "Vale quando o diário estiver liberado.",
  seriesAntesDoAcesso: "Vale depois do 1º acesso do aluno ao app.",
  // o texto da aba Treino para o Treino que esta conta não vê (src/painel/aluno/abas/Treino.tsx, "sem-acesso")
  seriesOutraConta: "Treino de outro personal: só o personal responsável por este aluno e o dono da conta veem o treino dele.",
  seriesErro: "Não deu para ler o Treino agora.",
  /** a 2ª frase da dica das rotinas — só quando o card Rotinas do Resumo existe (a P6 o cria; o registro diz) */
  rotinasDoProfissional: "As suas você cria no card Rotinas do Resumo.",
  soLeitura: "Você vê os acessos; quem muda é o dono da conta ou um profissional deste aluno.",
  semInternet: "Sem internet: os acessos voltam a mudar quando a conexão voltar.",
  salvo: "Salvo",
  erroPadrao: "Não deu certo agora. Tente de novo.",
} as const;

/** O que a linha das séries mostra (ela carrega à parte, do Banco do Treino — spec §4.1 e §4.7). */
export type EstadoDasSeries =
  | { tipo: "fora" }
  | { tipo: "carregando" }
  | { tipo: "pronto"; series: NivelDasSeries; podeMudar: boolean }
  | { tipo: "antes_do_acesso" }
  | { tipo: "outra_conta" }
  | { tipo: "erro"; mensagem: string };

/** Os códigos em que a linha das séries diz o motivo (a frase fixa do código); o resto é "Não deu para ler o Treino agora." */
const ERROS_COM_FRASE = new Set(["sem_internet", "sem_login", "muitas_acoes"]);

/**
 * O estado da linha das séries a partir da consulta: sem o módulo Treino a linha não aparece; sem_treino (antes do 1º acesso) e sem_acesso
 * (o mesmo login em 2 contas: o Treino é de outra conta — o acessos_ler desta já passou) viram o texto da linha; o resto, o erro dela.
 * `fraseDoCodigo` = a frase fixa de src/acessos/api.ts (passada de fora: estas regras não importam o cliente da rede).
 */
export function estadoDasSeries(
  comTreino: boolean,
  q: { isLoading: boolean; isError: boolean; error: unknown; data?: { series: NivelDasSeries; pode_mudar: boolean } | null },
  fraseDoCodigo: (codigo: string) => string,
): EstadoDasSeries {
  if (!comTreino) return { tipo: "fora" };
  if (q.isLoading) return { tipo: "carregando" };
  if (q.isError || !q.data) {
    const codigo = (q.error as { codigo?: unknown } | null)?.codigo;
    if (codigo === "sem_treino") return { tipo: "antes_do_acesso" };
    if (codigo === "sem_acesso") return { tipo: "outra_conta" };
    return { tipo: "erro", mensagem: typeof codigo === "string" && ERROS_COM_FRASE.has(codigo) ? fraseDoCodigo(codigo) : TEXTOS.seriesErro };
  }
  return { tipo: "pronto", series: q.data.series, podeMudar: q.data.pode_mudar };
}

/** As linhas que aparecem para este aluno (spec §4.1, "Quando aparece"): as séries só com Treino; o diário e o link só com nutricionista. */
export function linhasVisiveis(d: Pick<AcessosDoAluno, "modulos" | "tem_nutricionista">): DefLinha[] {
  return LINHAS_DE_ACESSO.filter((l) => {
    if (l.chave === "treino_series") return d.modulos.includes("treino");
    if (l.chave === "diario_alimentar" || l.chave === "acesso_link") return d.tem_nutricionista;
    return true;
  });
}

/** A dica da linha (a das rotinas ganha a 2ª frase quando o card Rotinas do Resumo existe). */
export function dicaDaLinha(l: DefLinha, comCardRotinas: boolean): string {
  return l.chave === "rotinas" && comCardRotinas ? `${l.dica} ${TEXTOS.rotinasDoProfissional}` : l.dica;
}

/** O aviso embaixo da linha (o que muda de verdade para ESTE aluno), ou null. */
export function avisoDaLinha(chave: ChaveDaLinha, d: Pick<AcessosDoAluno, "tem_login" | "linhas">, series?: EstadoDasSeries): string | null {
  if (chave === "acesso_app" && !d.tem_login) return TEXTOS.semLoginApp;
  if (chave === "acesso_link" && d.linhas.diario_alimentar === "bloqueado") return TEXTOS.linkSemDiario;
  if (chave === "treino_series" && series) {
    if (series.tipo === "antes_do_acesso") return TEXTOS.seriesAntesDoAcesso;
    if (series.tipo === "outra_conta") return TEXTOS.seriesOutraConta;
    if (series.tipo === "erro") return series.mensagem;
  }
  return null;
}

/** "12/10 17:20" no horário de São Paulo. */
function diaEHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  return `${dia} ${hora}`;
}

/** "Mudado por Ana em 12/10 17:20" (o 1º nome; sem o nome — o servidor mudou — "Mudado em …"); sem mudança registrada, null. */
export function textoDaMudanca(m: MudancaDeAcesso | null | undefined): string | null {
  if (!m?.em) return null;
  const quando = diaEHora(m.em);
  if (!quando) return null;
  const quem = primeiroNome(m.por_nome);
  return quem ? `Mudado por ${quem} em ${quando}` : `Mudado em ${quando}`;
}

/** O nível marcado: as 4 da função acessos; as séries da treino-acessos; as rotinas, sempre. */
export function nivelDaLinha(chave: ChaveDaLinha, linhas: LinhasDeAcesso, series: EstadoDasSeries): string | null {
  if (chave === "rotinas") return "sempre";
  if (chave === "treino_series") return series.tipo === "pronto" ? series.series : null;
  return linhas[chave];
}

/** "App liberado · séries: pode mexer · dieta: só ver · rotinas sempre" (spec §4.1 — o resumo do rodapé). */
export function resumoDosAcessos(d: Pick<AcessosDoAluno, "tem_login" | "tem_nutricionista" | "linhas">, series: EstadoDasSeries): string {
  const partes = [!d.tem_login ? "App sem login" : d.linhas.acesso_app === "liberado" ? "App liberado" : "App bloqueado"];
  if (series.tipo === "pronto") partes.push(`séries: ${series.series === "mexer" ? "pode mexer" : "só ver"}`);
  if (d.tem_nutricionista) partes.push(`dieta: ${d.linhas.dieta === "mexer" ? "pode mexer" : "só ver"}`);
  partes.push("rotinas sempre");
  return partes.join(" · ");
}

/** O ✓ otimista: a aba com o nível novo de uma chave (o resto igual). */
export function comNivel<T extends Pick<AcessosDoAluno, "linhas">>(d: T, chave: ChaveDeAcesso, valor: string): T {
  return { ...d, linhas: { ...d.linhas, [chave]: valor } };
}

/** Só bloquear o app pede confirmação (spec §2.2-5: é o único nível que fecha algo para o aluno). */
export const pedeConfirmacao = (chave: ChaveDaLinha, valor: string): boolean => chave === "acesso_app" && valor === "bloqueado";

/** O texto da confirmação de "App: Bloqueado". */
export function confirmacaoDoBloqueio(nome: string | null | undefined): { titulo: string; descricao: string } {
  const primeiro = primeiroNome(nome);
  return {
    titulo: primeiro ? `Bloquear o app de ${primeiro}?` : "Bloquear o app do aluno?",
    descricao: "O app abre fechado com \"Seu acesso ao app está desligado. Fale com seu profissional\". Você libera de novo quando quiser.",
  };
}
