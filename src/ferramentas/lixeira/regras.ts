// Physiq W26 — regras PURAS da Ferramentas › Lixeira (N-21; porte do src/lib/lixeiraUtil.ts do PhysiqNutri, main 294887a). A Lixeira
// não tem tabela própria: a função lixeira_da_conta (banco principal, migração 20261001230000_w26_lixeira.sql) devolve o que tem
// `deleted_at` nas 5 fontes — respostas de pré-consulta, anamneses, antropometrias, planos alimentares e alunos — já com a regra de
// quem vê (P1 + a regra clínica da W18). Aqui: as abas, a ordem, os dias que faltam para a purga (30 dias; o aluno fica até
// restaurar), os textos e as frases das recusas. hml-14b (B21): a busca e os números das abas são do banco (a página da
// lixeira_da_conta) — o filtro e a contagem que eram feitos aqui saíram.
import { mensagemErroAlunos } from "@/painel/alunos/regras";

export const DIAS_LIXEIRA = 30;
export const AVISO_LIXEIRA = "Os itens ficam aqui por 30 dias e depois são apagados de vez sozinhos. Os alunos ficam até você restaurar.";

export type TipoLixeira = "resposta" | "anamnese" | "antropometria" | "plano" | "paciente";

export interface InfoTipoLixeira {
  id: TipoLixeira;
  rotulo: string;
  plural: string;
  /** anamnese, antropometria e plano: só para quem é nutricionista da conta (regra clínica da W18) */
  clinico: boolean;
  /** o aluno não é apagado de vez (fica até restaurar), como no site antigo */
  mantido: boolean;
  vazio: string;
}

/** As 5 abas, na ordem do site antigo. */
export const TIPOS_LIXEIRA: InfoTipoLixeira[] = [
  { id: "resposta", rotulo: "Resposta de pré-consulta", plural: "Pré-consulta", clinico: false, mantido: false, vazio: "Nenhuma resposta de pré-consulta na lixeira." },
  { id: "anamnese", rotulo: "Anamnese", plural: "Anamneses", clinico: true, mantido: false, vazio: "Nenhuma anamnese na lixeira." },
  { id: "antropometria", rotulo: "Antropometria", plural: "Antropometrias", clinico: true, mantido: false, vazio: "Nenhuma antropometria na lixeira." },
  { id: "plano", rotulo: "Plano alimentar", plural: "Planos alimentares", clinico: true, mantido: false, vazio: "Nenhum plano alimentar na lixeira." },
  { id: "paciente", rotulo: "Aluno", plural: "Alunos", clinico: false, mantido: true, vazio: "Nenhum aluno na lixeira." },
];
export const CHAVES_LIXEIRA: TipoLixeira[] = TIPOS_LIXEIRA.map((t) => t.id);
export const ehTipoLixeira = (v: unknown): v is TipoLixeira => typeof v === "string" && (CHAVES_LIXEIRA as string[]).includes(v);
export const infoTipo = (t: TipoLixeira): InfoTipoLixeira => TIPOS_LIXEIRA.find((x) => x.id === t) ?? TIPOS_LIXEIRA[0];

export interface ItemLixeira {
  tipo: TipoLixeira;
  id: string;
  titulo: string;
  /** resposta: quem respondeu · antropometria: a data (yyyy-MM-dd) · aluno: o e-mail */
  detalhe: string | null;
  paciente_id: string | null;
  paciente_nome: string | null;
  excluido_em: string;
  pode_restaurar: boolean;
  pode_apagar: boolean;
}

export interface Lixeira {
  /** abas clínicas (anamneses, antropometrias, planos): só nutricionista da conta ou master */
  veClinico: boolean;
  temNutricao: boolean;
  itens: ItemLixeira[];
  /**
   * hml-14b (B21): só na resposta paginada (lixeira_da_conta com p_tipo/p_busca/p_offset/p_limite) — a aba que o banco mostrou, os
   * números das abas (sem a busca) e o total da aba com a busca; `itens` é então UMA página dessa aba.
   */
  pagina?: { tipo: TipoLixeira; totais: ContagemLixeira; total: number };
}

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const contagemValida = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/** Normaliza a resposta da lixeira_da_conta (tolerante: item estranho fica de fora, nunca quebra a tela). */
export function normalizarLixeira(bruto: unknown): Lixeira | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as Record<string, unknown>;
  if (b.ok !== true) return null;
  // a resposta paginada sem o total da aba = formato inesperado (a tela mostra o erro, nunca uma lista vazia no lugar)
  const paginada = !!b.totais && typeof b.totais === "object";
  if (paginada && !contagemValida(b.total)) return null;
  const itens: ItemLixeira[] = [];
  for (const x of Array.isArray(b.itens) ? b.itens : []) {
    if (!x || typeof x !== "object") continue;
    const i = x as Record<string, unknown>;
    const id = texto(i.id);
    const excluido = texto(i.excluido_em);
    if (!ehTipoLixeira(i.tipo) || !id || !excluido) continue;
    itens.push({
      tipo: i.tipo,
      id,
      titulo: texto(i.titulo) ?? infoTipo(i.tipo).rotulo,
      detalhe: texto(i.detalhe),
      paciente_id: texto(i.paciente_id),
      paciente_nome: texto(i.paciente_nome),
      excluido_em: excluido,
      pode_restaurar: i.pode_restaurar === true,
      pode_apagar: i.pode_apagar === true && i.tipo !== "paciente",
    });
  }
  const l: Lixeira = { veClinico: b.ve_clinico === true, temNutricao: b.tem_nutricao === true, itens: ordenarItens(itens) };
  if (paginada && contagemValida(b.total)) {
    const totais = contagemZerada();
    for (const t of CHAVES_LIXEIRA) {
      const n = (b.totais as Record<string, unknown>)[t];
      if (contagemValida(n)) totais[t] = n;
    }
    l.pagina = { tipo: ehTipoLixeira(b.tipo) ? b.tipo : "resposta", totais, total: b.total };
  }
  return l;
}

/** Mais recentemente excluído primeiro; empate → ordem das abas → id (determinístico). */
export function ordenarItens(itens: ItemLixeira[]): ItemLixeira[] {
  return [...itens].sort((a, b) => {
    const ta = new Date(a.excluido_em).getTime();
    const tb = new Date(b.excluido_em).getTime();
    if (ta !== tb) return tb - ta;
    const ia = CHAVES_LIXEIRA.indexOf(a.tipo);
    const ib = CHAVES_LIXEIRA.indexOf(b.tipo);
    if (ia !== ib) return ia - ib;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** As abas que a pessoa tem: as clínicas só com o papel de nutricionista (W18); as outras sempre. */
export function abasDaPessoa(veClinico: boolean): InfoTipoLixeira[] {
  return TIPOS_LIXEIRA.filter((t) => !t.clinico || veClinico);
}

export type ContagemLixeira = Record<TipoLixeira, number>;
/** Os números das abas zerados (a página do banco preenche os que vieram). */
export const contagemZerada = (): ContagemLixeira => ({ resposta: 0, anamnese: 0, antropometria: 0, plano: 0, paciente: 0 });

/** `?tipo=` válido e disponível → ela (mesmo vazia); senão a 1ª aba com itens; senão a 1ª. */
export function abaInicial(abas: InfoTipoLixeira[], c: ContagemLixeira, tipoURL: string | null | undefined): TipoLixeira {
  const ids = abas.map((a) => a.id);
  if (ehTipoLixeira(tipoURL) && ids.includes(tipoURL)) return tipoURL;
  return ids.find((t) => c[t] > 0) ?? ids[0] ?? "paciente";
}

/** 30 − dias inteiros desde a exclusão (mínimo 0); null = o aluno, que fica até restaurar. */
export function diasParaPurga(tipo: TipoLixeira, excluidoEm: string, agora: Date = new Date()): number | null {
  if (infoTipo(tipo).mantido) return null;
  const decorridos = Math.floor((agora.getTime() - new Date(excluidoEm).getTime()) / 86_400_000);
  return Math.max(0, DIAS_LIXEIRA - Math.max(0, decorridos));
}

export function textoPurga(dias: number | null): string {
  if (dias === null) return "fica até você restaurar";
  if (dias === 0) return "apaga de vez hoje";
  return dias === 1 ? "apaga de vez em 1 dia" : `apaga de vez em ${dias} dias`;
}

const dois = (n: number) => String(n).padStart(2, "0");
/** timestamptz → "dd/MM/yyyy HH:mm" no fuso do aparelho (nunca fatiar a ISO: 21h de 19/09 em UTC já é 20/09). */
export function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}
/** "2026-09-20" → "20/09/2026" */
export function formatarDia(dia: string): string {
  const [a, m, d] = dia.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : dia;
}

export const textoExcluidoEm = (iso: string): string => `Excluído em ${formatarDataHora(iso)}`;

/** O título da linha: resposta = "Formulário · quem respondeu"; antropometria = "Antropometria de dd/MM/yyyy"; o resto, o título. */
export function tituloDoItem(i: ItemLixeira): string {
  if (i.tipo === "resposta" && i.detalhe) return `${i.titulo} · ${i.detalhe}`;
  if (i.tipo === "antropometria" && i.detalhe) return `Antropometria de ${formatarDia(i.detalhe)}`;
  return i.titulo;
}

const plural = (n: number, um: string, varios: string): string => (n === 1 ? `1 ${um}` : `${n} ${varios}`);
export const textoContagem = (total: number): string => (total === 0 ? "Lixeira vazia" : `${plural(total, "item", "itens")} na lixeira`);
export const textoVazioAba = (tipo: TipoLixeira, busca: string): string => (busca.trim() ? "Nenhum item com essa busca." : infoTipo(tipo).vazio);
export const textoConfirmarApagar = (titulo: string): string => `"${titulo}" será apagado de vez e não poderá ser restaurado.`;

/** Para onde "Abrir" leva depois de restaurar (as telas do Physiq). */
export function rotaDoItem(i: Pick<ItemLixeira, "tipo" | "id" | "paciente_id">): string | null {
  switch (i.tipo) {
    case "paciente":
      return `/painel/alunos/${i.id}`;
    case "resposta":
      return "/painel/pre-consulta?aba=respostas";
    case "anamnese":
      return i.paciente_id ? `/painel/alunos/${i.paciente_id}/prontuario` : null;
    case "antropometria":
      return i.paciente_id ? `/painel/alunos/${i.paciente_id}/avaliacao` : null;
    case "plano":
      return i.paciente_id ? `/painel/alunos/${i.paciente_id}/dieta` : null;
    default:
      return null;
  }
}

/** A frase da recusa (as do aluno são as da página Alunos: limite da faixa, P7, e-mail/CPF da W16b, conta vencida). */
export function mensagemDaRecusa(codigo: string | null | undefined, extra: Record<string, unknown> = {}): string {
  switch (codigo) {
    case "nao_esta_na_lixeira":
      return "Este item já saiu da lixeira. Atualize a página.";
    case "ja_na_lista":
      return "Este aluno já está na sua lista (voltou pelo convite ou pelo código).";
    case "aluno_nao_apaga":
      return "Alunos não são apagados de vez: eles ficam aqui até você restaurar.";
    case "sem_acesso":
      return "Você não pode mexer neste item (é de outro profissional ou é da nutricionista da conta).";
    case "sem_login":
      return "Entre de novo para continuar.";
    case "tipo_invalido":
      return "Item desconhecido.";
    default: {
      const m = mensagemErroAlunos(codigo, extra);
      return m && m !== codigo ? m : "Não foi possível concluir. Tente de novo.";
    }
  }
}
