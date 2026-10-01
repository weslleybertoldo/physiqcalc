// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/receitasUtil.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { MACROS_VAZIOS, casaComBusca, fmtQtd, macrosPorGramas, normalizarBusca, semAcento, type Macros } from "@/nutricao/editor/lib/alimentosUtil";
import { arred, numero } from "@/nutricao/editor/lib/antropometriaUtil";
import { fmtKcal } from "@/nutricao/editor/lib/energeticoUtil";
import { gramasDaMedida, medidaDoItem, somarMacros, type AlimentoDoItem, type ItemCalc, type MedidaDoAlimento, type Totais } from "@/nutricao/editor/lib/dietaUtil";

// Regras puras das receitas culinárias (W28): a receita é CALCULADA dos ingredientes (alimentos TACO + próprios da W8) — totais
// pela regra de 3 da W9 (macros/100 g × gramas, 2 casas), valor por PORÇÃO, peso (rendimento informado ou soma das gramas),
// escala dos ingredientes pra N porções (atalho 'Da receita' no plano), formulário ⇄ registro, validações, ordenação/filtro da
// lista, nome da cópia e textos. Nada de rede aqui; testado no vitest.

export { arred, fmtKcal, fmtQtd, numero };

export const NOME_RECEITA_MAX = 120;
export const NOME_GRUPO_MAX = 60;
export const MODO_PREPARO_MAX = 8000;
export const OBSERVACAO_RECEITA_MAX = 1000;
export const OBSERVACAO_INGREDIENTE_MAX = 300;
export const MAX_INGREDIENTES = 40;
export const PORCOES_MAX = 999;
/** valor do select de grupo que filtra as receitas SEM grupo */
export const FILTRO_SEM_GRUPO = "sem";

// ---- Cálculo ----
/** Ingrediente pro cálculo: mesmo formato do item do plano (W9) — gramas gravadas + medida caseira (só documenta) + alimento com macros/100 g. */
export type IngredienteCalc = ItemCalc;

/** Gramas do ingrediente = SEMPRE a `quantidade_g` gravada (a medida caseira só documenta de onde ela veio). */
export function gramasDoIngrediente(i: IngredienteCalc): number {
  const g = Number(i.quantidade_g);
  return Number.isFinite(g) && g > 0 ? arred(g, 2) : 0;
}
/** "200 g" · "2 × colher de sopa (15 g) = 30 g" */
export function descricaoQuantidadeIngrediente(i: IngredienteCalc): string {
  const g = gramasDoIngrediente(i);
  const m = medidaDoItem(i);
  if (m && i.quantidade_medida !== null && i.quantidade_medida !== undefined && Number(i.quantidade_medida) > 0) {
    return `${fmtQtd(Number(i.quantidade_medida))} × ${m.descricao} (${fmtQtd(m.gramas)} g) = ${fmtQtd(g)} g`;
  }
  return `${fmtQtd(g)} g`;
}
export const macrosDoIngrediente = (i: IngredienteCalc): Macros => (i.alimento ? macrosPorGramas(i.alimento, gramasDoIngrediente(i)) : { ...MACROS_VAZIOS });
/** Totais da receita inteira (soma dos ingredientes, 2 casas). */
export const totaisReceita = (ingredientes: IngredienteCalc[]): Totais => somarMacros(ingredientes.map(macrosDoIngrediente));
export const somaGramas = (ingredientes: IngredienteCalc[]): number => arred(ingredientes.reduce((s, i) => s + gramasDoIngrediente(i), 0), 2);
/** Peso da receita pronta: o rendimento informado; sem ele, a soma das gramas dos ingredientes. */
export function pesoReceita(rendimentoG: number | null | undefined, ingredientes: IngredienteCalc[]): number {
  const r = rendimentoG === null || rendimentoG === undefined ? null : Number(rendimentoG);
  return r !== null && Number.isFinite(r) && r > 0 ? arred(r, 2) : somaGramas(ingredientes);
}
const porcoesValidas = (porcoes: number): number => (Number.isFinite(porcoes) && porcoes > 0 ? porcoes : 1);
/** ÷ porções: kcal com 1 casa, gramas com 2. */
export function porPorcao(t: Totais, porcoes: number): Totais {
  const p = porcoesValidas(porcoes);
  return {
    energia_kcal: arred(t.energia_kcal / p, 1),
    proteina_g: arred(t.proteina_g / p, 2),
    carboidrato_g: arred(t.carboidrato_g / p, 2),
    lipidio_g: arred(t.lipidio_g / p, 2),
    fibra_g: arred(t.fibra_g / p, 2),
    sodio_mg: arred(t.sodio_mg / p, 2),
    itens: t.itens,
  };
}
export const gramasPorPorcao = (peso: number, porcoes: number): number => arred(peso / porcoesValidas(porcoes), 1);

export type ResumoCalculo = { totais: Totais; porPorcao: Totais; peso: number; gramasPorcao: number; porcoes: number; ingredientes: number };
/** Tudo que a tela/PDF mostram de uma receita já gravada. */
export function calcularReceita(r: { porcoes: number; rendimento_g: number | null }, ingredientes: IngredienteCalc[]): ResumoCalculo {
  const p = porcoesValidas(Number(r.porcoes));
  const totais = totaisReceita(ingredientes);
  const peso = pesoReceita(r.rendimento_g, ingredientes);
  return { totais, porPorcao: porPorcao(totais, p), peso, gramasPorcao: gramasPorPorcao(peso, p), porcoes: p, ingredientes: ingredientes.length };
}

// ---- Escala (atalho 'Da receita' no plano) ----
export const fatorPorcoes = (porcoesDesejadas: number, porcoesReceita: number): number =>
  porcoesDesejadas > 0 && porcoesReceita > 0 ? porcoesDesejadas / porcoesReceita : 1;
/** Gramas × fator (2 casas); a quantidade da medida também escala (só documenta). */
export function escalarIngredientes<T extends IngredienteCalc>(ingredientes: T[], porcoesDesejadas: number, porcoesReceita: number): T[] {
  const f = fatorPorcoes(porcoesDesejadas, porcoesReceita);
  return ingredientes.map((i) => {
    const qm = i.quantidade_medida === null || i.quantidade_medida === undefined ? null : Number(i.quantidade_medida);
    return { ...i, quantidade_g: arred(gramasDoIngrediente(i) * f, 2), quantidade_medida: qm !== null && qm > 0 ? arred(qm * f, 2) : null };
  });
}
/** A medida escalada só entra no item do plano quando fica INTEIRA ('3 colheres'); '1,5 colher' vira só gramas. */
export const medidaInteira = (q: number | null | undefined): boolean => q !== null && q !== undefined && Number(q) > 0 && Number.isInteger(Number(q));

// ---- Formulário ⇄ registro ----
export type FormReceita = {
  nome: string;
  grupo_id: string;
  porcoes: string;
  rendimento_g: string;
  tempo_preparo_min: string;
  modo_preparo: string;
  observacao: string;
  favorita: boolean;
};
export type ModoQuantidade = "gramas" | "medida";
export type FormIngrediente = {
  /** chave estável da linha no editor */
  chave: string;
  alimento: AlimentoDoItem | null;
  modo: ModoQuantidade;
  quantidade_g: string;
  medida_caseira_id: string;
  quantidade_medida: string;
  observacao: string;
};
let seq = 0;
export const novaChave = (): string => `ing-${Date.now().toString(36)}-${(seq += 1)}`;

export const formReceitaNova = (): FormReceita => ({ nome: "", grupo_id: "", porcoes: "1", rendimento_g: "", tempo_preparo_min: "", modo_preparo: "", observacao: "", favorita: false });
/** Linha nova: sem alimento; ao escolher um, entra por medida (a 1ª, quantidade 1) quando ele tem medidas; senão gramas. */
export function formIngredienteNovo(alimento: AlimentoDoItem | null = null): FormIngrediente {
  const medidas = alimento?.medidas_caseiras ?? [];
  return {
    chave: novaChave(),
    alimento,
    modo: medidas.length ? "medida" : "gramas",
    quantidade_g: alimento && !medidas.length ? "100" : "",
    medida_caseira_id: medidas[0]?.id ?? "",
    quantidade_medida: medidas.length ? "1" : "",
    observacao: "",
  };
}

export type ReceitaBase = {
  nome: string;
  grupo_id: string | null;
  porcoes: number;
  rendimento_g: number | null;
  tempo_preparo_min: number | null;
  modo_preparo: string | null;
  observacao: string | null;
  favorita: boolean;
};
export type RegistroReceita = {
  nome: string;
  grupo_id: string | null;
  porcoes: number;
  rendimento_g: number | null;
  tempo_preparo_min: number | null;
  modo_preparo: string;
  observacao: string;
  favorita: boolean;
};
export type RegistroIngrediente = {
  alimento_id: string;
  quantidade_g: number;
  medida_caseira_id: string | null;
  quantidade_medida: number | null;
  ordem: number;
  observacao: string;
};

export const receitaParaForm = (r: ReceitaBase): FormReceita => ({
  nome: r.nome,
  grupo_id: r.grupo_id ?? "",
  porcoes: fmtQtd(Number(r.porcoes)),
  rendimento_g: r.rendimento_g === null || r.rendimento_g === undefined ? "" : fmtQtd(Number(r.rendimento_g)),
  tempo_preparo_min: r.tempo_preparo_min === null || r.tempo_preparo_min === undefined ? "" : String(r.tempo_preparo_min),
  modo_preparo: r.modo_preparo ?? "",
  observacao: r.observacao ?? "",
  favorita: !!r.favorita,
});
export type IngredienteBase = IngredienteCalc & { observacao?: string | null };
export function ingredientesParaForm(ingredientes: IngredienteBase[]): FormIngrediente[] {
  return ingredientes.map((i) => {
    const m = medidaDoItem(i);
    const qm = i.quantidade_medida === null || i.quantidade_medida === undefined ? null : Number(i.quantidade_medida);
    const porMedida = !!m && qm !== null && qm > 0;
    return {
      chave: novaChave(),
      alimento: i.alimento,
      modo: porMedida ? "medida" : "gramas",
      quantidade_g: fmtQtd(gramasDoIngrediente(i)),
      medida_caseira_id: m?.id ?? i.alimento?.medidas_caseiras?.[0]?.id ?? "",
      quantidade_medida: porMedida ? fmtQtd(qm as number) : "",
      observacao: i.observacao ?? "",
    };
  });
}

export const medidaDoForm = (f: FormIngrediente): MedidaDoAlimento | null => f.alimento?.medidas_caseiras?.find((m) => m.id === f.medida_caseira_id) ?? null;
/** Gramas que entram na conta: pela medida (quantidade × gramas da medida) no modo medida; senão o campo de gramas. Inválido → null. */
export function gramasDoFormIngrediente(f: FormIngrediente): number | null {
  if (f.modo === "medida") {
    const m = medidaDoForm(f);
    const q = numero(f.quantidade_medida);
    return m && q !== null && q > 0 ? gramasDaMedida(q, m.gramas) : null;
  }
  const g = numero(f.quantidade_g);
  return g !== null && g > 0 ? arred(g, 2) : null;
}
export function ingredienteCalcDoForm(f: FormIngrediente): IngredienteCalc {
  const porMedida = f.modo === "medida" && !!medidaDoForm(f);
  return {
    alimento: f.alimento,
    quantidade_g: gramasDoFormIngrediente(f) ?? 0,
    medida_caseira_id: porMedida ? f.medida_caseira_id : null,
    quantidade_medida: porMedida ? numero(f.quantidade_medida) : null,
  };
}
/** Linha totalmente vazia (sem alimento, sem quantidade, sem observação) é ignorada — não é erro. */
export const linhaVazia = (f: FormIngrediente): boolean => !f.alimento && !f.quantidade_g.trim() && !f.quantidade_medida.trim() && !f.observacao.trim();
export const ingredientesPreenchidos = (ingredientes: FormIngrediente[]): FormIngrediente[] => ingredientes.filter((f) => !linhaVazia(f));
export const ingredienteCompleto = (f: FormIngrediente): boolean => !!f.alimento && (gramasDoFormIngrediente(f) ?? 0) > 0;

/** Prévia ao vivo do modal (só os ingredientes completos entram na conta). */
export function previaReceita(f: FormReceita, ingredientes: FormIngrediente[]): ResumoCalculo {
  const calc = ingredientes.filter(ingredienteCompleto).map(ingredienteCalcDoForm);
  const porcoes = porcoesValidas(numero(f.porcoes) ?? 0);
  const rend = f.rendimento_g.trim() ? numero(f.rendimento_g) : null;
  return calcularReceita({ porcoes, rendimento_g: rend !== null && rend > 0 ? rend : null }, calc);
}

export function validarReceita(f: FormReceita, ingredientes: FormIngrediente[]): string | null {
  const nome = f.nome.trim();
  if (!nome) return "Informe o nome da receita";
  if (nome.length > NOME_RECEITA_MAX) return `Nome muito longo (máx. ${NOME_RECEITA_MAX} caracteres)`;
  const porcoes = numero(f.porcoes);
  if (porcoes === null || porcoes <= 0) return "Informe o número de porções (maior que zero)";
  if (porcoes > PORCOES_MAX) return `Número de porções muito alto (máx. ${PORCOES_MAX})`;
  if (f.rendimento_g.trim()) {
    const r = numero(f.rendimento_g);
    if (r === null || r <= 0) return "Rendimento (peso pronto) tem que ser maior que zero — ou deixe vazio";
  }
  if (f.tempo_preparo_min.trim()) {
    const t = numero(f.tempo_preparo_min);
    if (t === null || t < 0 || !Number.isInteger(t)) return "Tempo de preparo em minutos inteiros (0 ou mais)";
  }
  if (f.modo_preparo.length > MODO_PREPARO_MAX) return `Modo de preparo muito longo (máx. ${MODO_PREPARO_MAX} caracteres)`;
  if (f.observacao.length > OBSERVACAO_RECEITA_MAX) return `Observação muito longa (máx. ${OBSERVACAO_RECEITA_MAX} caracteres)`;
  const linhas = ingredientesPreenchidos(ingredientes);
  if (linhas.length > MAX_INGREDIENTES) return `Máximo de ${MAX_INGREDIENTES} ingredientes`;
  if (!linhas.length) return "Adicione pelo menos 1 ingrediente com quantidade maior que zero";
  const incompleta = linhas.find((l) => !ingredienteCompleto(l));
  if (incompleta) {
    if (!incompleta.alimento) return "Escolha o alimento de cada ingrediente (ou remova a linha)";
    return incompleta.modo === "medida"
      ? `Informe a medida caseira e a quantidade de ${incompleta.alimento.nome} (maior que zero)`
      : `Informe a quantidade em gramas de ${incompleta.alimento.nome} (maior que zero)`;
  }
  if (linhas.some((l) => l.observacao.length > OBSERVACAO_INGREDIENTE_MAX)) return `Observação do ingrediente muito longa (máx. ${OBSERVACAO_INGREDIENTE_MAX} caracteres)`;
  return null;
}
/** `outrosNomes` = os grupos vivos que NÃO são o que está sendo renomeado. */
export function validarGrupo(nome: string, outrosNomes: string[]): string | null {
  const n = nome.trim();
  if (!n) return "Informe o nome do grupo";
  if (n.length > NOME_GRUPO_MAX) return `Nome muito longo (máx. ${NOME_GRUPO_MAX} caracteres)`;
  if (outrosNomes.some((o) => o.trim().toLowerCase() === n.toLowerCase())) return "Já existe um grupo com esse nome";
  return null;
}

export function receitaParaBanco(f: FormReceita): RegistroReceita {
  const rend = f.rendimento_g.trim() ? numero(f.rendimento_g) : null;
  const tempo = f.tempo_preparo_min.trim() ? numero(f.tempo_preparo_min) : null;
  return {
    nome: f.nome.trim(),
    grupo_id: f.grupo_id || null,
    porcoes: numero(f.porcoes) ?? 1,
    rendimento_g: rend !== null && rend > 0 ? arred(rend, 2) : null,
    tempo_preparo_min: tempo !== null && tempo >= 0 ? Math.round(tempo) : null,
    modo_preparo: f.modo_preparo.trim(),
    observacao: f.observacao.trim(),
    favorita: !!f.favorita,
  };
}
/** Só as linhas completas; `quantidade_g` sempre calculada (da medida, no modo medida); ordem = posição na lista. */
export function ingredientesParaBanco(ingredientes: FormIngrediente[]): RegistroIngrediente[] {
  return ingredientesPreenchidos(ingredientes)
    .filter(ingredienteCompleto)
    .map((f, k) => {
      const c = ingredienteCalcDoForm(f);
      return {
        alimento_id: (f.alimento as AlimentoDoItem).id,
        quantidade_g: c.quantidade_g,
        medida_caseira_id: c.medida_caseira_id,
        quantidade_medida: c.quantidade_medida,
        ordem: k,
        observacao: f.observacao.trim(),
      };
    });
}

// ---- Lista ----
const chaveNome = (s: string): string => semAcento(s ?? "").toLowerCase().trim();
/** Favoritas primeiro; dentro de cada bloco, nome sem acento. */
export function ordenarReceitas<T extends { favorita: boolean; nome: string }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => (a.favorita === b.favorita ? chaveNome(a.nome).localeCompare(chaveNome(b.nome), "pt-BR") : a.favorita ? -1 : 1));
}
export function ordenarIngredientes<T extends { ordem: number; created_at?: string }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => a.ordem - b.ordem || (a.created_at ?? "").localeCompare(b.created_at ?? ""));
}
export function ordenarGrupos<T extends { ordem: number; nome: string }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => a.ordem - b.ordem || chaveNome(a.nome).localeCompare(chaveNome(b.nome), "pt-BR"));
}
/** Busca por palavras sem acento no nome; grupo = '' (todos) · FILTRO_SEM_GRUPO · id; só favoritas. */
export function filtrarReceitas<T extends { nome: string; grupo_id: string | null; favorita: boolean }>(lista: T[], busca: string, grupoId: string, soFavoritas: boolean): T[] {
  const q = normalizarBusca(busca);
  return lista.filter(
    (r) =>
      (!q || casaComBusca(r.nome, q)) &&
      (!grupoId || (grupoId === FILTRO_SEM_GRUPO ? !r.grupo_id : r.grupo_id === grupoId)) &&
      (!soFavoritas || r.favorita),
  );
}
export const contarFavoritas = (lista: { favorita: boolean }[]): number => lista.filter((r) => r.favorita).length;
export const receitasDoGrupo = (lista: { grupo_id: string | null }[], grupoId: string): number => lista.filter((r) => r.grupo_id === grupoId).length;

/** 'Bolinho de atum' → 'Bolinho de atum (cópia)'; já existe → '(cópia 2)', '(cópia 3)'… (duplicar uma cópia não empilha sufixo). */
export function nomeCopia(nome: string, existentes: string[]): string {
  const base = nome.replace(/\s*\(cópia(?: \d+)?\)\s*$/i, "").trim() || nome.trim();
  const usados = new Set(existentes.map((e) => chaveNome(e)));
  let candidato = `${base} (cópia)`;
  for (let n = 2; usados.has(chaveNome(candidato)) && n < 1000; n += 1) candidato = `${base} (cópia ${n})`;
  return candidato.length > NOME_RECEITA_MAX ? `${base.slice(0, NOME_RECEITA_MAX - candidato.length + base.length)}${candidato.slice(base.length)}` : candidato;
}

// ---- Textos ----
export const textoPorcoes = (n: number): string => (Number(n) === 1 ? "1 porção" : `${fmtQtd(Number(n))} porções`);
export const textoIngredientes = (n: number): string => (n === 1 ? "1 ingrediente" : `${n} ingredientes`);
export const textoFavoritas = (n: number): string => (n === 0 ? "nenhuma favorita" : n === 1 ? "1 favorita" : `${n} favoritas`);
/** 'Nenhuma receita' · '1 receita · 1 favorita' · '2 receitas · nenhuma favorita' */
export function textoContagemReceitas(total: number, favoritas: number): string {
  if (total === 0) return "Nenhuma receita";
  return `${total === 1 ? "1 receita" : `${total} receitas`} · ${textoFavoritas(favoritas)}`;
}
export const textoMacros = (t: Macros): string => `P ${fmtQtd(t.proteina_g ?? 0)} g · C ${fmtQtd(t.carboidrato_g ?? 0)} g · L ${fmtQtd(t.lipidio_g ?? 0)} g`;
/** '4 porções · 167,5 kcal/porção · P 12 g · C 20 g · L 6 g · 2 ingredientes' (linha da lista) */
export function resumoReceita(c: ResumoCalculo): string {
  return `${textoPorcoes(c.porcoes)} · ${fmtQtd(c.porPorcao.energia_kcal)} kcal/porção · ${textoMacros(c.porPorcao)} · ${textoIngredientes(c.ingredientes)}`;
}
/** 'Receita inteira: 670 kcal · P 20 g · C 60 g · L 40 g · 230 g' */
export const textoReceitaInteira = (c: ResumoCalculo): string => `Receita inteira: ${fmtKcal(c.totais.energia_kcal)} kcal · ${textoMacros(c.totais)} · ${fmtQtd(c.peso)} g`;
/** 'Por porção (4): 167,5 kcal · P 5 g · C 15 g · L 10 g · 57,5 g' */
export const textoPorPorcao = (c: ResumoCalculo): string =>
  `Por porção (${fmtQtd(c.porcoes)}): ${fmtQtd(c.porPorcao.energia_kcal)} kcal · ${textoMacros(c.porPorcao)} · ${fmtQtd(c.gramasPorcao)} g`;
/** '4 porções · rendimento 300 g · 25 min' (cabeçalho do PDF/ver) */
export function textoDadosReceita(r: { porcoes: number; rendimento_g: number | null; tempo_preparo_min: number | null }): string {
  const partes = [textoPorcoes(Number(r.porcoes))];
  if (r.rendimento_g !== null && r.rendimento_g !== undefined && Number(r.rendimento_g) > 0) partes.push(`rendimento ${fmtQtd(Number(r.rendimento_g))} g`);
  if (r.tempo_preparo_min !== null && r.tempo_preparo_min !== undefined) partes.push(`${r.tempo_preparo_min} min`);
  return partes.join(" · ");
}
/** 'N ingredientes · N kcal' (prévia do atalho no plano, já escalada) */
export const textoPreviaPlano = (nIngredientes: number, kcal: number): string => `${textoIngredientes(nIngredientes)} · ${fmtKcal(kcal)} kcal`;

export const slugReceita = (s: string): string =>
  semAcento(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "receita";
/** 'smoke-w28-bolinho-receita.pdf' */
export const nomeArquivoPDFReceita = (nome: string): string => `${slugReceita(nome)}-receita.pdf`;
