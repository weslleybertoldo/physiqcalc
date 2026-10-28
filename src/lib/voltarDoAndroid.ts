/**
 * hml-29 (B22) — onde o voltar do Android pergunta "Deseja sair do Physiq?" em vez de voltar na rota (a skill da homologação,
 * `references/front-end.md` §5e). Página inicial = a raiz do aluno (`/`), a tela de entrada de quem não está logado (`/entrar`),
 * as Boas-vindas de quem ainda não tem nada (`/boas-vindas`) e o painel do profissional (`/painel`). Sem histórico (o app abriu
 * direto numa tela interna) também pergunta: o voltar ali fecharia o app.
 */
export const PAGINAS_INICIAIS: ReadonlySet<string> = new Set(["/", "/entrar", "/boas-vindas", "/painel"]);

/** true = o voltar pergunta se a pessoa quer sair; false = volta pra tela anterior. */
export function voltarPedeSaida(caminho: string, temHistorico: boolean): boolean {
  if (!temHistorico) return true;
  const semBarraNoFim = caminho.replace(/\/+$/, "") || "/";
  return PAGINAS_INICIAIS.has(semBarraNoFim);
}
