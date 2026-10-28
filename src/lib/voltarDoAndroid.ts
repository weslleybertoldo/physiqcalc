/**
 * hml-29 (B22) — o que o voltar do Android faz em cada tela (a skill da homologação, `references/front-end.md` §5e):
 * - na página inicial pergunta "Deseja sair do Physiq?": a raiz do aluno (`/`), a entrada de quem não está logado (`/entrar`), o
 *   painel do profissional (`/painel`) e as Boas-vindas de quem ainda não tem nada (`/boas-vindas` com `sem_nada`; aberta a partir
 *   de outra tela por quem já tem algo, ela volta);
 * - nas outras telas volta pra anterior; sem anterior (o login trocou a entrada pela página do link com `replace`), vai ao Início
 *   (`/`, que leva cada um à sua página inicial) — a pergunta fica só na inicial.
 */
export type AcaoDoVoltar = "perguntar" | "voltar" | "ir_ao_inicio";

const PAGINAS_INICIAIS: ReadonlySet<string> = new Set(["/", "/entrar", "/painel"]);

export function acaoDoVoltar(caminho: string, temHistorico: boolean, semNada: boolean): AcaoDoVoltar {
  // o React Router não diferencia maiúsculas nem a barra no fim (/Entrar/ abre a entrada)
  const tela = caminho.toLowerCase().replace(/\/+$/, "") || "/";
  if (PAGINAS_INICIAIS.has(tela) || (tela === "/boas-vindas" && semNada)) return "perguntar";
  return temHistorico ? "voltar" : "ir_ao_inicio";
}
