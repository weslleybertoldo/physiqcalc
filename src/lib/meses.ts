/**
 * Os nomes dos meses (janeiro = 0). hml-18b (H-54, F): era do src/treino/editor/relatorio.ts, que importa o jsPDF no topo — as 4
 * telas que só queriam o nome do mês (o editor de treino, Painel › Treinos › Histórico/Relatório e a barra do mês) baixavam o
 * pedaço do PDF inteiro (~636 KB) ao abrir.
 */
export const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
