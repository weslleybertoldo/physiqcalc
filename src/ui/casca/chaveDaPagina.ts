/**
 * hml-18a (H-40, E) — a chave da PÁGINA para a transição de página (`TransicaoDePagina`): trocar de página anima a entrada; trocar de
 * ABA dentro da mesma página não remonta nem pisca (o estado local da página fica — risco 7 da spec).
 *
 *   /painel/alunos/<id>, /painel/alunos/<id>/<aba>   → /painel/alunos/<id>        (o perfil do aluno e as 5 abas dele)
 *   /painel/alunos/<id>/editar                        → /painel/alunos/<id>/editar (o editor é outra página)
 *   /painel/configuracoes, /painel/configuracoes/<aba> → /painel/configuracoes
 *   o resto                                           → o caminho (sem a barra do fim); a ?aba= e o #… nunca entram
 */
export function chaveDaPagina(pathname: string): string {
  const caminho = pathname.replace(/\/+$/, "") || "/";
  const aluno = /^\/painel\/alunos\/([^/]+)(?:\/([^/]+))?/.exec(caminho);
  if (aluno) return aluno[2] === "editar" ? `/painel/alunos/${aluno[1]}/editar` : `/painel/alunos/${aluno[1]}`;
  if (caminho === "/painel/configuracoes" || caminho.startsWith("/painel/configuracoes/")) return "/painel/configuracoes";
  return caminho;
}
