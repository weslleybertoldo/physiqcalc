// Physiq W-A P5 — regras PURAS da dieta liberada no app do aluno (spec W-A §2.1 P5/P6, §2.2-10/11/12, §4.4): quando a tela é "Pode mexer" (o
// meu_dia de HOJE com a matrícula do plano que a tela mostra liberada — o aluno de 2 matrículas segue a do plano ativo), o dia daquela
// matrícula, o cartão (o anel conta o que ele comeu), a linha e os totais de cada refeição NO DIA, o que vai para o dia_adicionar (gramas ou
// porções) e os formulários (a refeição extra, o alimento por 100 g, a receita). Os limites são os do banco (migration wa3 — os mesmos de
// LIMITES em _shared/aluno-dia-regras.ts: o teste confere). Sem rede; testado em regras.test.ts.
import { macrosDoRetrato, type DiaAplicado, type ExtraNoDia, type RefeicaoNoDia } from "@/aluno-dia/regras";
import type {
  DadosDaExtra, DadosDaReceita, DadosDoAlimento, DadosDoItemDoDia, ExtraDoDia, ItemDaBusca, ItemDoDia, MacrosDaPorcao, MeuAlimento, MeuDia, MinhaReceita,
} from "@/aluno-dia/tipos";
import type { ResumoDoDia } from "@/nutricao/app/dia";
import { fmtHorario, fmtKcal, fmtQtd, macrosDoItem, nomeCurto, somarMacros, type Totais } from "@/nutricao/app/dietaUtil";
import { arred, numero, type Macros } from "@/nutricao/app/numeros";
import { refeicaoMarcavel } from "@/nutricao/app/refeicaoConcluidaUtil";

/** Os limites do banco (wa3: os checks e as RPCs) — os mesmos do servidor (LIMITES de _shared/aluno-dia-regras.ts; o teste confere). */
export const LIMITES_DO_DIA = {
  extraNome: 40,
  alimentoNome: 80,
  receitaNome: 80,
  gramas: [0.01, 9999.99],
  porcoesDoDia: [0.01, 20],
  porcoesDaReceita: [1, 100],
  porcaoG: [0.01, 9999.99],
  kcal: [0, 1000],
  macro: [0, 100],
  itensDaReceita: [1, 30],
  termoMinimo: 2,
  termo: 60,
} as const;

/** As folhas da Dieta "Pode mexer", abertas pelo `?ver=` da aba (src/dieta-livre/ui/DiaLivre.tsx): adicionar · extra · meus. */
export const FOLHAS_DO_DIA = ["adicionar", "extra", "meus"] as const;
export type FolhaDoDia = (typeof FOLHAS_DO_DIA)[number];

// ───────────────────────── quando a tela é "Pode mexer" ─────────────────────────
export interface EstadoDaDietaLivre {
  /** a tela é "Pode mexer": tirar e pôr nas refeições do plano, os alimentos e as receitas dele */
  liberada: boolean;
  /** dá para criar refeição extra: o servidor põe a extra na matrícula do plano ATIVO — tem de ser a da tela */
  extra: boolean;
}

/**
 * Liberada = o meu_dia de HOJE (o servidor diz `pode_gravar`) com a matrícula do plano que a tela mostra liberada (a linha "Pode mexer" + a
 * nutricionista de verdade — aluno_dieta_liberada). O aluno de 2 matrículas segue a do plano ativo: outra matrícula liberada não libera esta.
 * Sem o meu_dia (carregando, erro, sem internet) = travada, como hoje.
 */
export function estadoDaDietaLivre(
  meuDia: Pick<MeuDia, "dia" | "pode_gravar" | "matriculas" | "plano_ativo"> | null | undefined,
  pacienteDoPlano: string | null | undefined,
  hoje: string,
): EstadoDaDietaLivre {
  if (!meuDia || !pacienteDoPlano || meuDia.dia !== hoje || meuDia.pode_gravar !== true) return { liberada: false, extra: false };
  const liberada = meuDia.matriculas.some((m) => m.paciente_id === pacienteDoPlano && m.liberada === true);
  return { liberada, extra: liberada && meuDia.plano_ativo?.paciente_id === pacienteDoPlano };
}

/** O dia da matrícula do plano da tela (o mesmo login em 2 matrículas com Nutrição: o que ele registrou em cada uma é dela). */
export function diaDaMatricula<T extends Pick<MeuDia, "dia" | "extras" | "itens">>(meuDia: T, pacienteDoPlano: string): T {
  return {
    ...meuDia,
    extras: meuDia.extras.filter((e) => !e.paciente_id || e.paciente_id === pacienteDoPlano),
    itens: meuDia.itens.filter((i) => i.paciente_id === pacienteDoPlano),
  };
}

/** O cartão do plano na tela liberada: o anel e as barras contam o que ele comeu (as refeições com ✓ — sem o que tirou, com o que pôs — e as
 *  extras com "Já comi") contra o plano do dia; o "2 de 4" segue sendo das refeições do plano com alimento. */
export function resumoDoDiaLivre(a: DiaAplicado): ResumoDoDia {
  const marcaveis = a.refeicoes.filter((r) => refeicaoMarcavel(r.refeicao));
  return { total: a.totais.plano, marcado: a.totais.comido, concluidas: marcaveis.filter((r) => r.concluida).length, marcaveis: marcaveis.length };
}

// ───────────────────────── a refeição NO DIA (a linha da lista e a folha) ─────────────────────────
/** Os totais da refeição do plano NO DIA: os itens que ele não tirou + os que ele pôs. */
export const totaisDaRefeicaoNoDia = (r: Pick<RefeicaoNoDia, "itens" | "adicionados">): Totais =>
  somarMacros([...r.itens.filter((x) => !x.tirado).map((x) => macrosDoItem(x.item)), ...r.adicionados.map(macrosDoRetrato)]);

/** Os totais da refeição extra (o que ele pôs nela). */
export const totaisDaExtra = (e: Pick<ExtraNoDia, "adicionados">): Totais => somarMacros(e.adicionados.map(macrosDoRetrato));

/** "Ovo · Banana · Aveia · +1" — os nomes curtos sem repetir, até `max` (a MESMA conta do resumoDaRefeicao do plano). */
export function resumoDosNomes(nomes: string[], max = 3): string {
  const unicos: string[] = [];
  for (const n of nomes.map((x) => nomeCurto(x))) if (!unicos.includes(n)) unicos.push(n);
  return unicos.length <= max ? unicos.join(" · ") : `${unicos.slice(0, max).join(" · ")} · +${unicos.length - max}`;
}

/** A linha da refeição na lista quando a tela está liberada: a hora e os nomes DO DIA (sem os tirados, com os que ele pôs) e as kcal do dia.
 *  Sem nada mudado, igual à de hoje ("07:00 · Ovo · Aveia" e as kcal do plano). */
export function linhaDaRefeicaoNoDia(r: RefeicaoNoDia): { linha: string; kcal: string; mudou: boolean } {
  const ficam = r.itens.filter((x) => !x.tirado);
  const nomes = [...ficam.map((x) => x.item.alimento?.nome ?? ""), ...r.adicionados.map((i) => i.nome)];
  const n = ficam.length + r.adicionados.length;
  const hora = fmtHorario(r.refeicao.horario);
  return {
    linha: [hora, n ? resumoDosNomes(nomes) : "Sem alimentos"].filter(Boolean).join(" · "),
    kcal: n ? fmtKcal(totaisDaRefeicaoNoDia(r).energia_kcal) : "—",
    mudou: r.adicionados.length > 0 || r.itens.some((x) => x.tirado),
  };
}

/** A linha da refeição extra: a hora e os nomes do que ele pôs, ou o convite para pôr. */
export function linhaDaExtra(e: ExtraNoDia): { linha: string; kcal: string } {
  const hora = fmtHorario(e.extra.horario);
  return {
    linha: [hora, e.adicionados.length ? resumoDosNomes(e.adicionados.map((i) => i.nome)) : "Nada ainda"].filter(Boolean).join(" · "),
    kcal: e.adicionados.length ? fmtKcal(totaisDaExtra(e).energia_kcal) : "—",
  };
}

/** "100 g" · "1,5 porção" — a quantidade do que ele pôs (o retrato guarda as gramas ou as porções). */
export function quantidadeDoItemDoDia(i: Pick<ItemDoDia, "quantidade_g" | "porcoes">): string {
  if (i.porcoes !== null && i.porcoes !== undefined) {
    const p = Number(i.porcoes);
    return `${fmtQtd(p)} ${p === 1 ? "porção" : "porções"}`;
  }
  return `${fmtQtd(Number(i.quantidade_g) || 0)} g`;
}

// ───────────────────────── o que ele põe: a busca e a quantidade ─────────────────────────
export type Lugar = { tipo: "refeicao"; id: string; nome: string } | { tipo: "extra"; id: string; nome: string };
export type Unidade = "g" | "porcao";
export interface Escolha {
  item: ItemDaBusca;
  /** o texto do campo ("150", "1,5") */
  quantidade: string;
  unidade: Unidade;
}

/** As unidades que a escolha aceita: a receita só em porções; o alimento em gramas ou em porções (a porção de referência dele). */
export const unidadesDe = (item: Pick<ItemDaBusca, "tipo" | "porcao_g">): Unidade[] =>
  item.tipo === "receita" ? ["porcao"] : Number(item.porcao_g) > 0 ? ["g", "porcao"] : ["g"];

/** A escolha ao tocar num resultado: a receita em 1 porção; o alimento em gramas, com a porção de referência dele (ou 100 g). */
export function escolhaInicial(item: ItemDaBusca): Escolha {
  if (item.tipo === "receita") return { item, quantidade: "1", unidade: "porcao" };
  const g = Number(item.porcao_g) > 0 ? Number(item.porcao_g) : 100;
  return { item, quantidade: fmtQtd(g), unidade: "g" };
}

/** O número do campo ("12,5" ou "12.5"); vazio ou inválido → null. */
export const numeroDoCampo = (s: string): number | null => numero(s);

/** As gramas da escolha (o alimento: gramas, ou porções × a porção de referência); a receita → null. */
export function gramasDaEscolha(e: Escolha): number | null {
  if (e.item.tipo === "receita") return null;
  const q = numeroDoCampo(e.quantidade);
  if (q === null) return null;
  return arred(e.unidade === "porcao" ? q * (Number(e.item.porcao_g) || 100) : q, 2);
}

/** Os macros da escolha (o "≈ 280 kcal" antes de pôr): o alimento por 100 g × as gramas; a receita por porção × as porções. */
export function macrosDaEscolha(e: Escolha): Totais | null {
  const q = numeroDoCampo(e.quantidade);
  if (q === null || q <= 0) return null;
  const fator = e.item.tipo === "receita" ? q : (gramasDaEscolha(e) ?? 0) / 100;
  const m = (v: number) => arred((Number(v) || 0) * fator, 2);
  return somarMacros([{ energia_kcal: m(e.item.energia_kcal), proteina_g: m(e.item.proteina_g), carboidrato_g: m(e.item.carboidrato_g),
    lipidio_g: m(e.item.lipidio_g), fibra_g: m(e.item.fibra_g), sodio_mg: null }]);
}

/** O que vai para o dia_adicionar (1 lugar, 1 origem e a quantidade: a receita em porções; o resto em gramas) — ou a frase do erro. */
export function dadosDaEscolha(lugar: Lugar, e: Escolha): { ok: true; dados: DadosDoItemDoDia } | { ok: false; erro: string } {
  const q = numeroDoCampo(e.quantidade);
  if (q === null || q <= 0) return { ok: false, erro: "Informe a quantidade." };
  const onde = lugar.tipo === "refeicao" ? { refeicao_id: lugar.id } : { extra_id: lugar.id };
  if (e.item.tipo === "receita") {
    const p = arred(q, 2);
    if (p < LIMITES_DO_DIA.porcoesDoDia[0] || p > LIMITES_DO_DIA.porcoesDoDia[1]) return { ok: false, erro: "De 0,01 a 20 porções." };
    return { ok: true, dados: { ...onde, aluno_receita_id: e.item.id, porcoes: p } };
  }
  const g = gramasDaEscolha(e) ?? 0;
  if (g < LIMITES_DO_DIA.gramas[0] || g > LIMITES_DO_DIA.gramas[1]) return { ok: false, erro: "De 0,01 a 9.999,99 g." };
  const origem = e.item.tipo === "meu" ? { aluno_alimento_id: e.item.id } : { alimento_id: e.item.id };
  return { ok: true, dados: { ...onde, ...origem, quantidade_g: g } };
}

/** A linha de baixo de um resultado da busca: "Seu alimento · 280 kcal em 100 g" · "Sua receita · 350 kcal a porção". */
export function linhaDaBusca(i: ItemDaBusca, rotulo: string): string {
  return `${rotulo} · ${fmtKcal(Number(i.energia_kcal) || 0)} kcal ${i.tipo === "receita" ? "a porção" : "em 100 g"}`;
}

// ───────────────────────── a refeição extra ─────────────────────────
export interface FormularioDaExtra {
  nome: string;
  /** "HH:MM" ou "" */
  horario: string;
  ja_comi: boolean;
}
export type ErroDoCampo<C extends string> = { campo?: C; mensagem: string };

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const aparado = (s: string): string => s.trim().replace(/\s+/g, " ");

/** "16:05" — a hora de agora em São Paulo (a refeição extra nasce com ela). */
export const horaSP = (agora: Date = new Date()): string =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(agora);

export function formularioDaExtra(e: Pick<ExtraDoDia, "nome" | "horario" | "concluida_em"> | null, agora: Date = new Date()): FormularioDaExtra {
  if (!e) return { nome: "", horario: horaSP(agora), ja_comi: true };
  return { nome: e.nome, horario: fmtHorario(e.horario), ja_comi: !!e.concluida_em };
}

export function validarExtra(f: FormularioDaExtra): ErroDoCampo<"nome" | "horario"> | null {
  const nome = aparado(f.nome);
  if (!nome) return { campo: "nome", mensagem: "Dê um nome à refeição." };
  if (nome.length > LIMITES_DO_DIA.extraNome) return { campo: "nome", mensagem: "O nome vai até 40 letras." };
  if (f.horario && !HORA.test(f.horario)) return { campo: "horario", mensagem: "Escolha um horário válido." };
  return null;
}

/** Criar (com o dia — hoje; a matrícula é a do plano ativo, o servidor decide) ou mudar (nome e horário; o "Já comi" vai pelo extra_marcar). */
export function dadosDaExtra(f: FormularioDaExtra, dia: string | null): DadosDaExtra {
  const base = { nome: aparado(f.nome), horario: f.horario || null };
  return dia ? { dia, ...base, ja_comi: f.ja_comi } : base;
}

// ───────────────────────── o alimento dele (por 100 g) ─────────────────────────
export const MACROS_DO_ALIMENTO = [
  { chave: "energia_kcal", rotulo: "Calorias (kcal)", faixa: LIMITES_DO_DIA.kcal },
  { chave: "proteina_g", rotulo: "Proteína (g)", faixa: LIMITES_DO_DIA.macro },
  { chave: "carboidrato_g", rotulo: "Carboidrato (g)", faixa: LIMITES_DO_DIA.macro },
  { chave: "lipidio_g", rotulo: "Gordura (g)", faixa: LIMITES_DO_DIA.macro },
  { chave: "fibra_g", rotulo: "Fibra (g)", faixa: LIMITES_DO_DIA.macro },
] as const;
export type ChaveDoMacro = (typeof MACROS_DO_ALIMENTO)[number]["chave"];
export type FormularioDoAlimento = { nome: string; porcao_g: string } & Record<ChaveDoMacro, string>;
export type CampoDoAlimento = keyof FormularioDoAlimento;

const campoDeNumero = (n: number | null | undefined): string => (n === null || n === undefined ? "" : fmtQtd(Number(n)));

export function formularioDoAlimento(a: MeuAlimento | null): FormularioDoAlimento {
  if (!a) return { nome: "", porcao_g: "100", energia_kcal: "", proteina_g: "", carboidrato_g: "", lipidio_g: "", fibra_g: "" };
  return { nome: a.nome, porcao_g: campoDeNumero(a.porcao_g), energia_kcal: campoDeNumero(a.energia_kcal), proteina_g: campoDeNumero(a.proteina_g),
    carboidrato_g: campoDeNumero(a.carboidrato_g), lipidio_g: campoDeNumero(a.lipidio_g), fibra_g: campoDeNumero(a.fibra_g) };
}

export function validarAlimento(f: FormularioDoAlimento): ErroDoCampo<CampoDoAlimento> | null {
  const nome = aparado(f.nome);
  if (!nome) return { campo: "nome", mensagem: "Dê um nome ao alimento." };
  if (nome.length > LIMITES_DO_DIA.alimentoNome) return { campo: "nome", mensagem: "O nome vai até 80 letras." };
  const p = numeroDoCampo(f.porcao_g);
  if (p === null || p < LIMITES_DO_DIA.porcaoG[0] || p > LIMITES_DO_DIA.porcaoG[1]) return { campo: "porcao_g", mensagem: "A porção vai de 0,01 a 9.999,99 g." };
  for (const m of MACROS_DO_ALIMENTO) {
    if (!f[m.chave].trim()) continue;
    const v = numeroDoCampo(f[m.chave]);
    if (v === null || v < m.faixa[0] || v > m.faixa[1]) return { campo: m.chave, mensagem: `De ${m.faixa[0]} a ${fmtQtd(m.faixa[1])} em 100 g.` };
  }
  return null;
}

/** Os dados do alimento_salvar: o nome, a porção e os 5 valores por 100 g (vazio = 0). */
export function dadosDoAlimento(f: FormularioDoAlimento): DadosDoAlimento {
  const d: DadosDoAlimento = { nome: aparado(f.nome), porcao_g: arred(numeroDoCampo(f.porcao_g) ?? 100, 2) };
  for (const m of MACROS_DO_ALIMENTO) d[m.chave] = arred(numeroDoCampo(f[m.chave]) ?? 0, 2);
  return d;
}

// ───────────────────────── a receita dele (ingredientes em gramas + nº de porções) ─────────────────────────
export interface IngredienteDoFormulario {
  /** a chave da linha na tela */
  chave: string;
  origem: { alimento_id: string } | { aluno_alimento_id: string } | null;
  nome: string;
  /** os macros por 100 g (o que a busca devolveu); null = o ingrediente já salvo (o retrato está no servidor) */
  por100: MacrosDaPorcao | null;
  quantidade_g: string;
}
export interface FormularioDaReceita {
  nome: string;
  porcoes: string;
  itens: IngredienteDoFormulario[];
  /** a lista de ingredientes mudou (só então ela vai inteira ao servidor) */
  itensMudaram: boolean;
}
export type CampoDaReceita = "nome" | "porcoes" | "itens";

export function formularioDaReceita(r: MinhaReceita | null): FormularioDaReceita {
  if (!r) return { nome: "", porcoes: "1", itens: [], itensMudaram: false };
  return {
    nome: r.nome,
    porcoes: String(r.porcoes),
    itens: r.itens.map((i) => ({
      chave: i.id,
      origem: i.alimento_id ? { alimento_id: i.alimento_id } : i.aluno_alimento_id ? { aluno_alimento_id: i.aluno_alimento_id } : null,
      nome: i.nome,
      por100: null,
      quantidade_g: fmtQtd(Number(i.quantidade_g)),
    })),
    itensMudaram: false,
  };
}

/** O ingrediente que a busca achou (a receita não entra numa receita). */
export function ingredienteDaBusca(i: ItemDaBusca, chave: string): IngredienteDoFormulario {
  const g = Number(i.porcao_g) > 0 ? Number(i.porcao_g) : 100;
  return {
    chave,
    origem: i.tipo === "meu" ? { aluno_alimento_id: i.id } : { alimento_id: i.id },
    nome: i.nome,
    por100: { energia_kcal: Number(i.energia_kcal) || 0, proteina_g: Number(i.proteina_g) || 0, carboidrato_g: Number(i.carboidrato_g) || 0,
      lipidio_g: Number(i.lipidio_g) || 0, fibra_g: Number(i.fibra_g) || 0 },
    quantidade_g: fmtQtd(g),
  };
}

export function validarReceita(f: FormularioDaReceita): ErroDoCampo<CampoDaReceita> | null {
  const nome = aparado(f.nome);
  if (!nome) return { campo: "nome", mensagem: "Dê um nome à receita." };
  if (nome.length > LIMITES_DO_DIA.receitaNome) return { campo: "nome", mensagem: "O nome vai até 80 letras." };
  const p = numeroDoCampo(f.porcoes);
  if (p === null || !Number.isInteger(p) || p < LIMITES_DO_DIA.porcoesDaReceita[0] || p > LIMITES_DO_DIA.porcoesDaReceita[1]) {
    return { campo: "porcoes", mensagem: "Rende de 1 a 100 porções (número inteiro)." };
  }
  if (f.itensMudaram || f.itens.length === 0) {
    const validos = f.itens.filter((i) => i.origem);
    if (validos.length < LIMITES_DO_DIA.itensDaReceita[0]) return { campo: "itens", mensagem: "Adicione pelo menos 1 ingrediente." };
    if (validos.length > LIMITES_DO_DIA.itensDaReceita[1]) return { campo: "itens", mensagem: "A receita vai até 30 ingredientes." };
    for (const i of validos) {
      const g = numeroDoCampo(i.quantidade_g);
      if (g === null || g < LIMITES_DO_DIA.gramas[0] || g > LIMITES_DO_DIA.gramas[1]) return { campo: "itens", mensagem: "Cada ingrediente vai de 0,01 a 9.999,99 g." };
    }
  }
  return null;
}

/** Os dados do receita_salvar: o nome e as porções; a lista de ingredientes só quando ela mudou (ou é nova) — o ingrediente apagado (sem
 *  origem) sai da lista nova. */
export function dadosDaReceita(f: FormularioDaReceita, nova: boolean): DadosDaReceita {
  const d: DadosDaReceita = { nome: aparado(f.nome), porcoes: Math.trunc(numeroDoCampo(f.porcoes) ?? 1) };
  if (nova || f.itensMudaram) {
    d.itens = f.itens
      .filter((i) => i.origem)
      .map((i) => ({ ...(i.origem as { alimento_id: string } | { aluno_alimento_id: string }), quantidade_g: arred(numeroDoCampo(i.quantidade_g) ?? 0, 2) }));
  }
  return d;
}

/** Os macros de 1 porção da receita no formulário (o preview): só com todos os ingredientes vindos da busca; senão, os da receita salva
 *  (sem mudança nos ingredientes nem nas porções) — ou null ("—"). */
export function macrosDaReceitaNoFormulario(f: FormularioDaReceita, salva: MinhaReceita | null): Macros | null {
  const p = numeroDoCampo(f.porcoes);
  if (!f.itensMudaram && salva && p === salva.porcoes) return { ...salva.por_porcao, sodio_mg: null };
  if (!p || p < 1 || f.itens.length === 0 || f.itens.some((i) => !i.por100)) return null;
  const t = somarMacros(f.itens.map((i) => {
    const g = numeroDoCampo(i.quantidade_g) ?? 0;
    const x = i.por100 as MacrosDaPorcao;
    return { energia_kcal: (x.energia_kcal * g) / 100, proteina_g: (x.proteina_g * g) / 100, carboidrato_g: (x.carboidrato_g * g) / 100,
      lipidio_g: (x.lipidio_g * g) / 100, fibra_g: (x.fibra_g * g) / 100, sodio_mg: null };
  }));
  return { energia_kcal: arred(t.energia_kcal / p, 2), proteina_g: arred(t.proteina_g / p, 2), carboidrato_g: arred(t.carboidrato_g / p, 2),
    lipidio_g: arred(t.lipidio_g / p, 2), fibra_g: arred(t.fibra_g / p, 2), sodio_mg: null };
}

/** "350 kcal · P 20 g · C 40 g · G 10 g" (os macros de uma linha). */
export function textoDosMacros(m: Pick<Macros, "energia_kcal" | "proteina_g" | "carboidrato_g" | "lipidio_g"> | null): string {
  if (!m) return "—";
  const g = (v: number | null) => fmtQtd(arred(Number(v) || 0, 1));
  return `${fmtKcal(Number(m.energia_kcal) || 0)} kcal · P ${g(m.proteina_g)} g · C ${g(m.carboidrato_g)} g · G ${g(m.lipidio_g)} g`;
}
