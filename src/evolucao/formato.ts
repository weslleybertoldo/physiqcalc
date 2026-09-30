// Textos da Evolução (W10): números com vírgula, datas curtas e o autor ("Lucas Ferreira, seu personal").
import type { Autor, Avaliacao, Posicao, SessaoFotos } from "./tipos";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** 84.25 → "84,3"; 1884 → "1.884"; null → "—". */
export function num(v: number | null | undefined, casas = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  // arredonda como a tela antiga (toFixed) e só depois põe a vírgula e o ponto do milhar
  const [inteira, fracao] = v.toFixed(casas).split(".");
  const sinal = inteira.startsWith("-") ? "-" : "";
  const digitos = inteira.replace("-", "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sinal}${digitos}${fracao !== undefined ? `,${fracao}` : ""}`;
}

/** 1850.4 → "1.850" (kcal). */
export function inteiro(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return Math.round(v).toLocaleString("pt-BR");
}

/** Variação sem sinal (a seta mostra a direção): 6.14 → "6,1". */
export function variacaoAbs(v: number | null | undefined, casas = 1): string {
  return v === null || v === undefined ? "—" : num(Math.abs(v), casas);
}

/** Variação com sinal: 1.8 → "+1,8"; -6.1 → "−6,1". */
export function variacaoComSinal(v: number | null | undefined, casas = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const r = Number(v.toFixed(casas));
  if (r === 0) return num(0, casas);
  return `${r > 0 ? "+" : "−"}${num(Math.abs(r), casas)}`;
}

/** "2026-06-14" → "14/06". */
export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}` : "—";
}

/** "2026-06-14" → "14/06/2026". */
export function dataLonga(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : "—";
}

/** "2026-06-14" → "14/06/26" (tabela). */
export function dataTabela(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a.slice(2)}` : "—";
}

/** "2026-06-01" → "Junho 2026" (fotos mensais do Calc). */
export function mesAno(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m] = iso.slice(0, 7).split("-");
  const i = Number(m) - 1;
  return a && i >= 0 && i < 12 ? `${MESES[i]} ${a}` : "—";
}

/** Mês curto do eixo do gráfico: 0 → "Jan". */
export function mesCurto(mes0: number): string {
  return MESES_CURTOS[((mes0 % 12) + 12) % 12];
}

/** "Lucas Ferreira, seu personal" · "Camila Rocha, nutricionista"; sem o nome, o papel. */
export function rotuloAutor(autor: Autor | null | undefined): string {
  if (!autor) return "";
  const nome = autor.nome?.trim();
  if (autor.papel === "personal") return nome ? `${nome}, seu personal` : "Seu personal";
  return nome ? `${nome}, nutricionista` : "Nutricionista";
}

/** Nome curto do autor na tabela: "Lucas" (personal) · "Camila" (nutri). */
export function autorCurto(autor: Autor | null | undefined): string {
  const nome = autor?.nome?.trim();
  if (nome) return nome.split(/\s+/)[0];
  return autor?.papel === "nutricionista" ? "Nutricionista" : "Personal";
}

/** "Setembro 2026" (mensal do Calc) ou "26/08/2026". */
export function rotuloSessao(s: Pick<SessaoFotos, "data" | "mensal">): string {
  return s.mensal ? mesAno(s.data) : dataLonga(s.data);
}

/** Data curta da sessão nos botões do Comparar: "set/26" (mensal) ou "26/08/26". */
export function rotuloSessaoCurto(s: Pick<SessaoFotos, "data" | "mensal">): string {
  if (s.mensal) {
    const [a, m] = s.data.slice(0, 7).split("-");
    return `${mesCurto(Number(m) - 1).toLowerCase()}/${a.slice(2)}`;
  }
  return dataTabela(s.data);
}

export const ROTULO_POSICAO: Record<Posicao, string> = { frente: "Frente", lado_d: "Lado D", lado_e: "Lado E", costas: "Costas" };

/** "7 avaliações" · "1 avaliação". */
export function contagemAvaliacoes(n: number): string {
  return `${n} ${n === 1 ? "avaliação" : "avaliações"}`;
}

/** Linha de baixo do card da avaliação: "14/06 · Lucas Ferreira, seu personal" (dados atuais do perfil, sem data: "Dados atuais · …"). */
export function linhaDaAvaliacao(av: Pick<Avaliacao, "data" | "autor">): string {
  const quando = av.data ? dataCurta(av.data) : "Dados atuais";
  const autor = rotuloAutor(av.autor);
  return autor ? `${quando} · ${autor}` : quando;
}
