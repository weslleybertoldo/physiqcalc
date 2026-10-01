/**
 * Perfil do aluno › Avaliação (W17 — spec 4.1 e 4.5): regras puras (testadas em regras.test.ts).
 *   · quem registra o quê (spec 4.1 "Avaliação": o personal registra a avaliação física — formulário do Calc, Banco do Treino —, a
 *     nutricionista registra a antropometria — formulário do Nutri, banco principal —, o dono registra conforme os papéis dele;
 *     todos os que veem o aluno veem o histórico inteiro dos 2 bancos);
 *   · quem exclui (a avaliação física, quem muda o treino; a antropometria, quem muda a nutrição — os bancos conferem de novo);
 *   · o formulário do Calc → as colunas de physiq_avaliacoes (a mesma conta de hoje: src/lib/avaliacao.ts);
 *   · próxima avaliação (NF7), os KPIs do cabeçalho e o card Evolução do Resumo.
 */
import { calcularComposicao, colunasDoMetodo, numero, tmbValida, type Sexo, type TmbMetodo, type ValoresAvaliacao } from "@/lib/avaliacao";
import { MEDIDA_FIELDS } from "@/lib/medidas";
import { dataCurta, num } from "@/evolucao/formato";
import { pontosDe, tipoCurto, variacaoDaMetrica, type Kpi } from "@/evolucao/serie";
import type { Autor, Avaliacao, Serie } from "@/evolucao/tipos";
import { acessoDaDieta } from "@/nutricao/editor/lib/acesso";
import type { PerfilAluno } from "../dados/tipos";

export type TipoRegistro = "fisica" | "antropometria";

export interface PermissoesAvaliacao {
  /** avaliação física (Calc → Banco do Treino), fotos mensais e próxima avaliação: quem muda o treino */
  fisica: boolean;
  /** antropometria e fotos de evolução (Nutri → principal): quem muda a nutrição */
  antropometria: boolean;
}

/**
 * podeMudarTreino = o estado do Treino do aluno no painel deu "ok" e não é só leitura (personal responsável, dono-personal,
 * master — useTreinoDoAlunoPainel/podeEditarTreino da W15). A nutrição pela regra da dieta (W16): nutricionista responsável,
 * dono com papel de nutricionista, master (e a nutri do paciente sem conta, no site antigo).
 */
export function permissoesDaAvaliacao(p: Pick<PerfilAluno, "eu" | "nutricionista" | "conta_id" | "modulos" | "conta_modulos">, podeMudarTreino: boolean): PermissoesAvaliacao {
  const temNutricao = p.modulos.includes("nutricao") && (p.conta_modulos.includes("nutricao") || !p.conta_id);
  return {
    fisica: podeMudarTreino && p.modulos.includes("treino"),
    antropometria: temNutricao && acessoDaDieta(p) === "editar",
  };
}

export function podeRegistrar(perm: PermissoesAvaliacao): boolean {
  return perm.fisica || perm.antropometria;
}

/** A "composição atual" do perfil sem nenhuma avaliação registrada (W10): não é uma linha do histórico, não se exclui. */
export const ehComposicaoSemRegistro = (av: Pick<Avaliacao, "id">) => av.id === "treino:perfil";

/** Excluir: a avaliação do Treino quem muda o treino; a antropometria quem muda a nutrição. */
export function podeExcluir(av: Pick<Avaliacao, "origem" | "id">, perm: PermissoesAvaliacao): boolean {
  if (ehComposicaoSemRegistro(av)) return false;
  return av.origem === "treino" ? perm.fisica : perm.antropometria;
}

/** As colunas da composição que o perfil do Treino guarda (a "composição atual" — o que o Calc gravava junto). */
export const COLUNAS_COMPOSICAO = [
  "peso", "altura", "metodo_avaliacao", "dobra_1", "dobra_2", "dobra_3", "dobra_4", "dobra_5", "dobra_6", "dobra_7", "percentual_gordura",
  "massa_gorda", "massa_magra", "massa_muscular", "agua_corporal", "gordura_visceral", "tmb_mifflin", "tmb_katch", "tmb_balanca", "tmb_metodo",
  ...MEDIDA_FIELDS.map((m) => m.key),
] as const;

/**
 * Excluída a avaliação física MAIS RECENTE, a composição atual do perfil volta a ser a da anterior (senão a anterior apareceria com
 * os números da excluída — a última do Treino mostra os números do perfil, W10). Devolve as colunas a gravar, ou null (não era a
 * mais recente, ou não sobrou nenhuma).
 */
export function composicaoDepoisDeExcluir(excluida: string, linhas: Record<string, unknown>[]): Record<string, unknown> | null {
  const ordenadas = [...linhas].sort((a, b) => String(a.data_avaliacao ?? "").localeCompare(String(b.data_avaliacao ?? "")) || String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
  const ultima = ordenadas[ordenadas.length - 1];
  if (!ultima || String(ultima.id) !== excluida) return null;
  const anterior = ordenadas[ordenadas.length - 2];
  if (!anterior) return null;
  return Object.fromEntries(COLUNAS_COMPOSICAO.map((k) => [k, anterior[k] ?? null]));
}

/**
 * O que abre com ?nova= (o "Nova avaliação" do cabeçalho manda 1; o atalho "Antropometria" do Fluxo de consulta, W14, manda
 * "antropometria"): o formulário do papel; quem tem os 2 papéis escolhe; sem papel, nada.
 */
export function aberturaDoParametro(param: string | null, perm: PermissoesAvaliacao): TipoRegistro | "escolher" | null {
  if (!param) return null;
  if (param === "antropometria") return perm.antropometria ? "antropometria" : perm.fisica ? "fisica" : null;
  if (param === "fisica") return perm.fisica ? "fisica" : perm.antropometria ? "antropometria" : null;
  if (perm.fisica && perm.antropometria) return "escolher";
  if (perm.fisica) return "fisica";
  if (perm.antropometria) return "antropometria";
  return null;
}

// ───────────────────────── formulário do Calc → physiq_avaliacoes ─────────────────────────

export interface FormFisica {
  /** yyyy-mm-dd */
  data: string;
  sexo: Sexo;
  idade: string;
  peso: string;
  altura: string;
  valores: ValoresAvaliacao;
  tmb: TmbMetodo;
  medidas: Record<string, string>;
  observacao: string;
}

/** As colunas da avaliação física (as mesmas que o "Salvar" de Dobras & Medidas do Calc gravava: método, dobras, composição,
 * TMBs, a TMB escolhida, peso, altura, as 13 medidas e a observação). */
export function colunasDaFisica(f: FormFisica): Record<string, string | number | null> {
  const c = calcularComposicao(f.valores, { sexo: f.sexo, idade: numero(f.idade), peso: numero(f.peso), altura: numero(f.altura) });
  const tmb = tmbValida(f.tmb, c);
  const r: Record<string, string | number | null> = {
    peso: numero(f.peso),
    altura: numero(f.altura),
    ...colunasDoMetodo(f.valores),
    percentual_gordura: c.bf !== null ? Math.round(c.bf * 100) / 100 : null,
    massa_gorda: c.massaGorda !== null ? Math.round(c.massaGorda * 100) / 100 : null,
    massa_magra: c.massaMagra !== null ? Math.round(c.massaMagra * 100) / 100 : null,
    tmb_mifflin: c.tmbMifflin !== null ? Math.round(c.tmbMifflin) : null,
    tmb_katch: c.tmbKatch !== null ? Math.round(c.tmbKatch) : null,
    tmb_metodo: tmb,
    observacao: f.observacao.trim() ? f.observacao.trim().slice(0, 500) : null,
  };
  // na bioimpedância o % de gordura é o da balança (já em percentual_gordura pela composição)
  for (const m of MEDIDA_FIELDS) r[m.key] = numero(f.medidas[m.key]);
  return r;
}

/** O que falta para salvar: data válida, peso e o que o método precisa para dar o % de gordura (dobras: idade e as N dobras). */
export function faltandoNaFisica(f: FormFisica, hoje: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.data) || Number.isNaN(Date.parse(`${f.data}T12:00:00Z`))) return "Informe a data da avaliação.";
  if (f.data > hoje) return "A data da avaliação não pode ser no futuro.";
  const peso = numero(f.peso);
  if (peso === null || peso >= 500) return "Informe o peso em kg.";
  const altura = numero(f.altura);
  if (f.altura.trim() && (altura === null || altura < 50 || altura > 260)) return "A altura é em cm (ex.: 178).";
  if (f.valores.metodo === "bioimpedancia") {
    const bf = numero(f.valores.bio.percentual_gordura);
    if (bf === null || bf >= 100) return "Informe o % de gordura que a balança mostrou.";
    return null;
  }
  if (numero(f.idade) === null) return "Informe a idade (as dobras usam a idade no cálculo).";
  const dobras = f.valores.metodo === "dobras_3" ? f.valores.dobras3 : f.valores.dobras7;
  if (dobras.some((d) => numero(d) === null)) return `Preencha as ${dobras.length} dobras.`;
  return null;
}

/** A nova avaliação física vira a "composição atual" do perfil quando é a mais recente do Treino (o Calc fazia sempre, no dia). */
export function eAMaisRecente(data: string, avaliacoes: Pick<Avaliacao, "origem" | "data">[]): boolean {
  return avaliacoes.filter((a) => a.origem === "treino").every((a) => !a.data || a.data <= data);
}

// ───────────────────────── próxima avaliação (NF7) ─────────────────────────

function dias(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number);
  return Date.UTC(a, m - 1, d) / 86_400_000;
}

/** "22/07 · em 3 dias", "hoje", "amanhã", "venceu há 2 dias" (a avaliação passou sem registro). */
export function textoDaProxima(proxima: string | null, hoje: string): { data: string; detalhe: string; atrasada: boolean } | null {
  if (!proxima || !/^\d{4}-\d{2}-\d{2}/.test(proxima)) return null;
  const d = proxima.slice(0, 10);
  const n = dias(d) - dias(hoje);
  const detalhe = n === 0 ? "hoje" : n === 1 ? "amanhã" : n > 1 ? `em ${n} dias` : n === -1 ? "venceu ontem" : `venceu há ${-n} dias`;
  return { data: dataCurta(d), detalhe, atrasada: n < 0 };
}

// ───────────────────────── histórico, KPIs e card do Resumo ─────────────────────────

/** Quem fez, do ponto de vista do profissional: "Lucas Ferreira · personal", "Camila Rocha · nutricionista". */
export function autorNoPainel(autor: Autor | null | undefined): string {
  if (!autor) return "";
  const papel = autor.papel === "personal" ? "personal" : "nutricionista";
  const nome = autor.nome?.trim();
  return nome ? `${nome} · ${papel}` : papel === "personal" ? "Personal" : "Nutricionista";
}

/** "Avaliação física · 7 dobras" / "Antropometria · Pollock 3" — o que o histórico mostra na 1ª linha. */
export function tituloDoHistorico(av: Avaliacao): string {
  if (av.origem === "principal") return av.metodo === "medidas" ? "Antropometria" : `Antropometria · ${av.tipo}`;
  return av.metodo === "medidas" ? "Avaliação física" : `Avaliação física · ${av.tipo}`;
}

/** Peso · % de gordura · massa (o que a linha do histórico resume). */
export function numerosDoHistorico(av: Avaliacao): string {
  const partes: string[] = [];
  if (av.peso !== null) partes.push(`${num(av.peso)} kg`);
  if (av.gordura !== null) partes.push(`${num(av.gordura)}% de gordura`);
  const musc = av.massaMuscular ?? av.massaMagra;
  if (musc !== null) partes.push(`${num(musc)} kg ${av.massaMuscular !== null ? "de músculo" : "de massa magra"}`);
  return partes.join(" · ") || "Sem medidas de composição";
}

/** Os 2 números do cabeçalho (tela 7): o valor mais recente e a variação dos últimos 6 meses ("6,1 kg em 6 meses", "4,6 pontos"). */
export function detalheDoKpi(k: Kpi): string | null {
  if (k.variacao === null) return null;
  const v = Math.abs(k.variacao);
  if (k.metrica === "gordura") return `${num(v, 1)} ${v === 1 ? "ponto" : "pontos"}`;
  return `${num(v, k.casas)} ${k.unidadeVariacao} em 6 meses`;
}

export function tomDoKpi(k: Kpi): "verde" | "rosa" | "neutro" {
  return k.tom === "bom" ? "verde" : k.tom === "ruim" ? "rosa" : "neutro";
}

/** O chip do card Evolução: "7 DOBRAS · 14/06" (a última avaliação com número). */
export function chipDaUltima(av: Avaliacao | null): string | null {
  if (!av) return null;
  if (ehComposicaoSemRegistro(av) || !av.data) return "COMPOSIÇÃO ATUAL";
  return `${tipoCurto(av).toUpperCase()} · ${dataCurta(av.data)}`;
}

/** Os pontos do gráfico do card Evolução (6 meses, ou o ano se 6 meses tem menos de 2). */
export function pontosDoCard(s: Serie, hoje: string) {
  const seis = variacaoDaMetrica(s.avaliacoes, "peso", "6m", hoje).pontos;
  if (seis.length >= 2) return { periodo: "6m" as const, pontos: seis };
  const ano = variacaoDaMetrica(s.avaliacoes, "peso", "1a", hoje).pontos;
  if (ano.length >= 2) return { periodo: "1a" as const, pontos: ano };
  return { periodo: "tudo" as const, pontos: pontosDe(s.avaliacoes, "peso") };
}
