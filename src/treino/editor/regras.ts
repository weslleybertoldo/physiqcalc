/**
 * Editor do treino do aluno (W15 — tela 8, lado esquerdo) e card Treino do Resumo (tela 7): regras PURAS, testadas em
 * regras.test.ts. Os números saem das MESMAS funções do app do aluno (lição da W10: o número da tela do profissional = o que
 * o aluno vê): letras dos treinos (letrasDaSemana), nº de séries (seriesPadrao), prescrição (prescricao — NF1/NF2), duração
 * estimada e "N de M na semana" (as do Início, W12) e volume por grupo (volumeSemanal, a mesma conta do "Volume Semanal").
 */
import { BLOCOS_MUSCULARES, nomeDoBloco } from "@/lib/gruposMusculares";
import { resolverTreinosDoDia } from "@/lib/semanaSlots";
import { SERIES_PADRAO_DEFAULT, chaveExercicio, chaveTreino, clampSeries, mapaSeriesPadrao, numSeriesPadrao, temSeriesProprias } from "@/lib/seriesPadrao";
import type { VolumeBloco } from "@/lib/volumeSemanal";
import { estimarDuracaoMin, resumoDaSemana } from "@/app-aluno/inicio/pecas/regras";
import { DIAS_SEMANA, chaveData, datasDaSemana } from "@/treino/datas";
import { letrasDaSemana } from "@/treino/letras";
import { formatarCarga, formatarDescanso, mapaPrescricao, observacaoDoTreino, prescricaoDoExercicio } from "@/treino/prescricao";
import type { SemanaConfig } from "@/treino/tipos";
import type { ConfigDia, DadosEditor, ExercicioDoTreino, ExercicioEditor, GrupoDisponivel, PrescricaoEditavel, SemanaAtual, TreinoEditor } from "./tipos";

/** Descanso do app quando o profissional não configurou (o mesmo de ConfiguracaoAluno / physiq_profiles). */
export const DESCANSO_PADRAO = 120;
export const DESCANSO_ATALHOS = [45, 60, 90, 120, 180] as const;
export const DESCANSO_MIN = 5;
export const DESCANSO_MAX = 900;
export const DESCANSO_PADRAO_MIN = 10;
export const DESCANSO_PADRAO_MAX = 600;
export const CARGA_MIN = 0.25;
export const CARGA_MAX = 999.75;

export const chaveDoGrupo = (g: Pick<GrupoDisponivel, "id" | "tipo">): string => `${g.tipo}:${g.id}`;

/** O padrão de séries do aluno (physiq_profiles.series_padrao_qtd; sem ele, 3). */
export function padraoDoAluno(d: Pick<DadosEditor, "config"> | null | undefined): number {
  const n = Number(d?.config?.series_padrao_qtd);
  return Number.isFinite(n) && n >= 1 ? clampSeries(n) : SERIES_PADRAO_DEFAULT;
}

/** O descanso padrão do aluno (o cronômetro do app entre as séries). */
export function descansoDoAluno(d: Pick<DadosEditor, "config"> | null | undefined): number {
  const n = Number(d?.config?.tempo_descanso_segundos);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : DESCANSO_PADRAO;
}

/** "Peitoral médio (esternal) · tríceps" → "peitoral médio (esternal)" (o 1º trecho, com a 1ª letra minúscula). */
function subgrupoCurto(subgrupo: string | null | undefined): string | null {
  const t = (subgrupo ?? "").split(/\s[·—–-]\s|·|—/)[0]?.trim();
  if (!t) return null;
  return t.charAt(0).toLowerCase() + t.slice(1);
}

/** "Peito · peitoral médio (esternal)" — o grupo · subgrupo da tela 8 (sem subgrupo, o grupo muscular do cadastro). */
export function subtituloDoExercicio(e: Pick<ExercicioDoTreino, "grupo_muscular" | "subgrupo">): string {
  const grupo = (e.grupo_muscular ?? "").trim();
  const bloco = grupo ? nomeDoBloco(grupo) : "";
  const sub = subgrupoCurto(e.subgrupo);
  if (bloco && bloco !== "Outros" && sub) return `${bloco} · ${sub}`;
  if (bloco && bloco !== "Outros") return grupo && grupo.toLowerCase() !== bloco.toLowerCase() ? `${bloco} · ${grupo.toLowerCase()}` : bloco;
  return sub ? `${grupo || "Exercício"} · ${sub}` : grupo || "Exercício";
}

/** "A · Peito e tríceps" (com letra) ou só o nome. */
export const rotuloDoTreino = (letra: string | null, nome: string): string => (letra ? `${letra} · ${nome}` : nome);

/**
 * Os treinos do aluno na ordem das abas do editor: primeiro os que têm letra (a ordem da semana, de segunda a domingo, e
 * depois os outros do profissional — a MESMA de letrasDaSemana do app), depois os treinos próprios do aluno fora da semana.
 */
export function montarTreinos(d: DadosEditor | null | undefined): TreinoEditor[] {
  if (!d) return [];
  const catalogo = d.gruposDisponiveis.filter((g) => g.tipo === "catalogo").sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const pessoais = d.gruposDisponiveis.filter((g) => g.tipo === "pessoal").sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const letras = letrasDaSemana(d.semana as unknown as SemanaConfig[], catalogo);
  const mapaSeries = mapaSeriesPadrao(d.seriesPadrao);
  const mapaPresc = mapaPrescricao(d.seriesPadrao);
  const padrao = padraoDoAluno(d);
  const descansoPadrao = descansoDoAluno(d);

  const treinos = [...catalogo, ...pessoais].map<TreinoEditor>((g) => {
    const chave = chaveDoGrupo(g);
    const exs = [...(d.exerciciosPorTreino[chave] ?? [])].sort((a, b) => a.ordem - b.ordem);
    const exercicios = exs.map<ExercicioEditor>((e) => {
      const exid = e.exercicio_usuario_id ? null : e.exercicio_id;
      const exuid = e.exercicio_usuario_id ?? null;
      const presc = prescricaoDoExercicio(mapaPresc, chave, exid, exuid);
      return {
        chave: chaveExercicio(exid, exuid) ?? `ex:${e.nome}`,
        exercicio_id: exid,
        exercicio_usuario_id: exuid,
        nome: e.nome,
        subtitulo: subtituloDoExercicio(e),
        grupoMuscular: e.grupo_muscular ?? "",
        imagem_url: e.imagem_url ?? null,
        corrida: e.tipo === "corrida",
        series: numSeriesPadrao(mapaSeries, chave, exid, exuid, padrao),
        seriesProprias: temSeriesProprias(mapaSeries, chave, exid, exuid),
        reps: presc.reps,
        descanso: presc.descanso,
        carga: presc.carga,
      };
    });
    const letra = letras.get(g.id) ?? null;
    return {
      chave,
      id: g.id,
      tipo: g.tipo,
      nome: g.nome,
      letra,
      rotulo: rotuloDoTreino(letra, g.nome),
      listaDireta: g.tipo === "catalogo" && g.lista_direta === true,
      global: g.tipo === "catalogo" && (g.professor_id ?? null) === null,
      alunos: g.alunos ?? 1,
      emPasta: !!g.em_pasta,
      exercicios,
      observacao: observacaoDoTreino(mapaPresc, chave),
      totalSeries: exercicios.reduce((s, e) => s + e.series, 0),
      minutos: estimarDuracaoMin(exercicios.map((e) => ({ series: e.series, descansoSeg: e.descanso ?? descansoPadrao }))),
    };
  });
  return treinos.sort((a, b) => {
    if (a.letra && b.letra) return a.letra.localeCompare(b.letra);
    if (a.letra) return -1;
    if (b.letra) return 1;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });
}

/** "4 × 10 · 60 s · 60 kg" — a linha do exercício que o aluno vê na aba Treino (tela 2) quando tudo está preenchido. */
export function linhaDoAluno(e: Pick<ExercicioEditor, "series" | "reps" | "descanso" | "carga" | "corrida">, descansoPadrao: number): string {
  const partes: string[] = [];
  partes.push(e.corrida ? `${e.series} ${e.series === 1 ? "série" : "séries"}` : e.reps ? `${e.series} × ${e.reps}` : `${e.series} ${e.series === 1 ? "série" : "séries"}`);
  const desc = formatarDescanso(e.descanso ?? descansoPadrao);
  if (desc) partes.push(desc);
  const carga = formatarCarga(e.carga);
  if (carga && !e.corrida) partes.push(carga);
  return partes.join(" · ");
}

// ───────────────────────── campos do editor (o que a pessoa digita) ─────────────────────────

/** O que o campo leu: ok com o valor (null = vazio) ou o erro que a tela mostra. */
export interface Leitura<T> {
  ok: boolean;
  valor: T | null;
  erro?: string;
}

/** Repetições: "10" ou a faixa "8-12" (aceita "8 - 12", "8–12", "8 a 12"); vazio = sem prescrição. */
export function lerReps(texto: string): Leitura<string | null> {
  const t = texto.trim().toLowerCase().replace(/\s*(?:-|–|—|a|até)\s*/, "-").replace(/\s+/g, "");
  if (!t) return { ok: true, valor: null };
  const m = /^(\d{1,3})(?:-(\d{1,3}))?$/.exec(t);
  if (!m) return { ok: false, valor: null, erro: "Use um número (10) ou uma faixa (8-12)" };
  const a = Number(m[1]);
  const b = m[2] !== undefined ? Number(m[2]) : null;
  if (a < 1) return { ok: false, valor: null, erro: "Repetições a partir de 1" };
  if (b !== null && b <= a) return { ok: false, valor: null, erro: "Na faixa, o 2º número é maior (8-12)" };
  return { ok: true, valor: b !== null ? `${a}-${b}` : String(a) };
}

/** Descanso: "60", "60 s", "90s", "1:30", "2 min", "1 min 30"; vazio = o padrão do aluno. */
export function lerDescanso(texto: string, min = DESCANSO_MIN, max = DESCANSO_MAX): Leitura<number | null> {
  const t = texto.trim().toLowerCase().replace(",", ".");
  if (!t) return { ok: true, valor: null };
  let seg: number | null = null;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{1,2}):(\d{2})$/.exec(t))) seg = Number(m[1]) * 60 + Number(m[2]);
  else if ((m = /^(\d{1,4})\s*(?:s|seg|segundos?)?$/.exec(t))) seg = Number(m[1]);
  else if ((m = /^(\d{1,2}(?:\.\d)?)\s*(?:m|min|minutos?)(?:\s*(\d{1,2})\s*(?:s|seg)?)?$/.exec(t))) seg = Math.round(Number(m[1]) * 60) + (m[2] ? Number(m[2]) : 0);
  if (seg === null || !Number.isFinite(seg)) return { ok: false, valor: null, erro: "Use segundos (60) ou minutos (1:30)" };
  if (seg < min || seg > max) return { ok: false, valor: null, erro: `Entre ${min} s e ${Math.round(max / 60)} min` };
  return { ok: true, valor: seg };
}

/** Carga: "60", "60 kg", "22,5"; vazio = sem carga (o app segue o último treino). */
export function lerCarga(texto: string): Leitura<number | null> {
  const t = texto.trim().toLowerCase().replace(/\s*kg$/, "").replace(",", ".");
  if (!t) return { ok: true, valor: null };
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(t)) return { ok: false, valor: null, erro: "Use kg (60 ou 22,5)" };
  const n = Number(t);
  if (n < CARGA_MIN || n > CARGA_MAX) return { ok: false, valor: null, erro: "Entre 0,25 e 999 kg" };
  return { ok: true, valor: Math.round(n * 100) / 100 };
}

export type CampoPrescricaoNome = "series" | "reps" | "descanso" | "carga";

/** Lê o que a pessoa digitou no campo → a prescrição nova (ou o erro). */
export function prescricaoComCampo(ex: ExercicioEditor, campo: CampoPrescricaoNome, texto: string): { ok: boolean; valor?: PrescricaoEditavel; erro?: string } {
  const atual: PrescricaoEditavel = { series: ex.series, reps: ex.reps, descanso: ex.descanso, carga: ex.carga };
  if (campo === "series") {
    const n = Number(texto.trim());
    if (!Number.isInteger(n) || n < 1 || n > 10) return { ok: false, erro: "Séries de 1 a 10" };
    return { ok: true, valor: { ...atual, series: clampSeries(n) } };
  }
  if (campo === "reps") {
    const r = lerReps(texto);
    return r.ok ? { ok: true, valor: { ...atual, reps: r.valor } } : { ok: false, erro: r.erro };
  }
  if (campo === "descanso") {
    const r = lerDescanso(texto);
    return r.ok ? { ok: true, valor: { ...atual, descanso: r.valor } } : { ok: false, erro: r.erro };
  }
  const r = lerCarga(texto);
  return r.ok ? { ok: true, valor: { ...atual, carga: r.valor } } : { ok: false, erro: r.erro };
}


/** O texto que o campo mostra: "60 s", "22,5 kg", "8-12" (vazio quando não há prescrição). */
export const textoDescansoCampo = (seg: number | null | undefined): string => (seg ? `${Math.round(seg)} s` : "");
export const textoCargaCampo = (kg: number | null | undefined): string => (kg ? `${String(Math.round(kg * 100) / 100).replace(".", ",")} kg` : "");

// ───────────────────────── semana ─────────────────────────

export const DIAS_EDITOR = [
  { codigo: "SEG", curto: "Seg", nome: "Segunda" },
  { codigo: "TER", curto: "Ter", nome: "Terça" },
  { codigo: "QUA", curto: "Qua", nome: "Quarta" },
  { codigo: "QUI", curto: "Qui", nome: "Quinta" },
  { codigo: "SEX", curto: "Sex", nome: "Sexta" },
  { codigo: "SAB", curto: "Sáb", nome: "Sábado" },
  { codigo: "DOM", curto: "Dom", nome: "Domingo" },
] as const;

const chaveDaLinha = (r: { grupo_id: string | null; grupo_usuario_id: string | null }): string | null => chaveTreino(r.grupo_id, r.grupo_usuario_id);

/** Os treinos de cada dia NA ORDEM (slot_idx) — sem os extras do alternado. */
export function treinosPorDia(d: Pick<DadosEditor, "semana">): Record<string, string[]> {
  const m: Record<string, string[]> = {};
  [...d.semana].sort((a, b) => (a.slot_idx ?? 0) - (b.slot_idx ?? 0)).forEach((r) => {
    if (r.extra) return;
    const k = chaveDaLinha(r);
    if (k) (m[r.dia_semana] ||= []).push(k);
  });
  return m;
}

/** Os extras do alternado por dia: treino + a qual rotativo ele está atrelado (null = toda semana). */
export function extrasPorDia(d: Pick<DadosEditor, "semana">): Record<string, { chave: string; atrelado: string | null }[]> {
  const m: Record<string, { chave: string; atrelado: string | null }[]> = {};
  [...d.semana].sort((a, b) => (a.slot_idx ?? 0) - (b.slot_idx ?? 0)).forEach((r) => {
    if (!r.extra) return;
    const k = chaveDaLinha(r);
    if (!k) return;
    const atrelado = r.extra_atrelado_grupo_usuario_id ? `pessoal:${r.extra_atrelado_grupo_usuario_id}` : r.extra_atrelado_grupo_id ? `catalogo:${r.extra_atrelado_grupo_id}` : null;
    (m[r.dia_semana] ||= []).push({ chave: k, atrelado });
  });
  return m;
}

export const alternadoLigado = (c: ConfigDia | undefined | null): boolean => !!c?.alternado && !!c?.alternado_inicio;

/** "Treino alternado: sim" quando algum dia alterna. */
export const temAlternado = (d: Pick<DadosEditor, "diasConfig">): boolean => d.diasConfig.some((c) => !!c.alternado);

/** grupo_id / grupo_usuario_id da chave "catalogo:<id>" · "pessoal:<id>" (o corpo das ações da semana). */
export function idsDaChave(chave: string): { grupo_id?: string; grupo_usuario_id?: string } {
  const [tipo, id] = chave.split(":");
  return tipo === "pessoal" ? { grupo_usuario_id: id } : { grupo_id: id };
}

// ───────────────────────── hml-24 (H-127): a linha do aluno no que a tela mostra (o otimista, a fila e o "voltar ao salvo") ─────────

type LinhaDoCache = DadosEditor["seriesPadrao"][number];
type AlvoDaLinha = { grupo_id?: string | null; grupo_usuario_id?: string | null };
type ExercicioDaLinha = { exercicio_id: string | null; exercicio_usuario_id: string | null };

const doTreino = (r: LinhaDoCache, alvo: AlvoDaLinha) =>
  (r.grupo_id ?? null) === (alvo.grupo_id ?? null) && (r.grupo_usuario_id ?? null) === (alvo.grupo_usuario_id ?? null);
const daChave = (r: LinhaDoCache, alvo: AlvoDaLinha, ex: ExercicioDaLinha | null) =>
  doTreino(r, alvo) && (r.exercicio_id ?? null) === (ex?.exercicio_id ?? null) && (r.exercicio_usuario_id ?? null) === (ex?.exercicio_usuario_id ?? null);

/** A linha do aluno na chave (treino + exercício; `ex` null = a linha geral do treino), ou null. */
export function linhaDaChave(d: Pick<DadosEditor, "seriesPadrao"> | null | undefined, alvo: AlvoDaLinha, ex: ExercicioDaLinha | null): LinhaDoCache | null {
  return d?.seriesPadrao.find((r) => daChave(r, alvo, ex)) ?? null;
}

/** A tela com a linha da chave trocada por `linha` (null = sem a linha) — o "voltar ao salvo" do erro. */
export function comLinha(d: DadosEditor, alvo: AlvoDaLinha, ex: ExercicioDaLinha | null, linha: LinhaDoCache | null): DadosEditor {
  return { ...d, seriesPadrao: [...d.seriesPadrao.filter((r) => !daChave(r, alvo, ex)), ...(linha ? [linha] : [])] };
}

/** A tela com a prescrição de um exercício (séries, repetições, descanso, carga); a observação da linha fica (o otimista de hoje). */
export function comPrescricao(d: DadosEditor, alvo: AlvoDaLinha, ex: ExercicioDaLinha, p: PrescricaoEditavel): DadosEditor {
  const atual = linhaDaChave(d, alvo, ex);
  return comLinha(d, alvo, ex, {
    grupo_id: alvo.grupo_id ?? null, grupo_usuario_id: alvo.grupo_usuario_id ?? null, exercicio_id: ex.exercicio_id,
    exercicio_usuario_id: ex.exercicio_usuario_id, num_series: p.series, reps_alvo: p.reps, descanso_segundos: p.descanso,
    carga_sugerida_kg: p.carga, observacao: atual?.observacao ?? null,
  });
}

// ───────────────────────── a ampliação da hml-24: a semana do aluno pela fila (o estado inteiro de cada dia) ─────────

/** Um extra do alternado como a tela guarda: o treino e o treino a que ele vai junto (null = toda semana). */
export type ExtraDoDia = { chave: string; atrelado: string | null };

/** O alternado de um dia como um valor só — ligado, o início e os extras (o que o setDiaConfig e o setExtras gravam). */
export interface AlternadoDoDia {
  alternado: boolean;
  inicio: string | null;
  extras: ExtraDoDia[];
}

/** A tela com a lista de treinos do dia (os de toda semana, na ordem marcada; os extras do alternado ficam) — o otimista do salvarDia. */
export function comDia(d: DadosEditor, dia: string, chaves: string[]): DadosEditor {
  return {
    ...d,
    semana: [
      ...d.semana.filter((r) => r.dia_semana !== dia || r.extra),
      ...chaves.map((k, i) => ({ dia_semana: dia, slot_idx: i, grupo_id: idsDaChave(k).grupo_id ?? null, grupo_usuario_id: idsDaChave(k).grupo_usuario_id ?? null, extra: false })),
    ],
  };
}

/** O alternado do dia no que a tela mostra (a config do dia e os extras dele). */
export function alternadoDoDia(d: Pick<DadosEditor, "diasConfig" | "semana">, dia: string): AlternadoDoDia {
  const c = d.diasConfig.find((x) => x.dia_semana === dia);
  return { alternado: !!c?.alternado, inicio: c?.alternado_inicio ?? null, extras: extrasPorDia(d)[dia] ?? [] };
}

/**
 * A tela com o alternado do dia: a config (ligado e o início; desligado = sem início) e os extras do dia (desligado = sem extras, como
 * o setDiaConfig faz no banco) — o otimista do salvarAlternado e do salvarExtras.
 */
export function comAlternadoDoDia(d: DadosEditor, dia: string, v: AlternadoDoDia): DadosEditor {
  const extras = v.alternado ? v.extras : [];
  return {
    ...d,
    diasConfig: [...d.diasConfig.filter((c) => c.dia_semana !== dia), { dia_semana: dia, alternado: v.alternado, alternado_inicio: v.alternado ? v.inicio : null }],
    semana: [
      ...d.semana.filter((r) => r.dia_semana !== dia || !r.extra),
      ...extras.map((e, i) => {
        const k = idsDaChave(e.chave);
        const at = e.atrelado ? idsDaChave(e.atrelado) : {};
        return {
          dia_semana: dia, slot_idx: 100 + i, extra: true, grupo_id: k.grupo_id ?? null, grupo_usuario_id: k.grupo_usuario_id ?? null,
          extra_atrelado_grupo_id: at.grupo_id ?? null, extra_atrelado_grupo_usuario_id: at.grupo_usuario_id ?? null,
        };
      }),
    ],
  };
}

/** Os extras do dia no corpo do setExtras (os ids do treino e do treino a que ele vai junto). */
export function extrasParaGravar(extras: ExtraDoDia[]): ({ grupo_id?: string; grupo_usuario_id?: string; atrelado_grupo_id?: string; atrelado_grupo_usuario_id?: string })[] {
  return extras.map((e) => {
    const at = e.atrelado ? idsDaChave(e.atrelado) : {};
    return { ...idsDaChave(e.chave), ...(at.grupo_id ? { atrelado_grupo_id: at.grupo_id } : {}), ...(at.grupo_usuario_id ? { atrelado_grupo_usuario_id: at.grupo_usuario_id } : {}) };
  });
}

/**
 * A tela com a observação do treino na linha geral: a que existe troca o texto; sem ela, o texto cria a linha com o nº de séries
 * padrão do aluno (a mesma conta da RPC observacao_salvar) e o vazio não cria nada.
 */
export function comObservacao(d: DadosEditor, alvo: AlvoDaLinha, obs: string | null): DadosEditor {
  const atual = linhaDaChave(d, alvo, null);
  if (atual) return comLinha(d, alvo, null, { ...atual, observacao: obs });
  if (!obs) return d;
  return comLinha(d, alvo, null, {
    grupo_id: alvo.grupo_id ?? null, grupo_usuario_id: alvo.grupo_usuario_id ?? null, exercicio_id: null, exercicio_usuario_id: null,
    num_series: padraoDoAluno(d), observacao: obs,
  });
}

/**
 * "N de M na semana" — a MESMA conta do app do aluno (faixa Seg–Dom da aba Treino e card do Início, W8/W12): os treinos de cada
 * dia vêm da troca do dia (quando existe) ou da semana com o alternado; N = dias com treino feito, M = dias com treino.
 */
export function resumoSemanaDoAluno(d: DadosEditor, atual: SemanaAtual | null | undefined, hoje: Date = new Date()): { feitos: number; total: number } {
  return resumoDaSemana(diasTreinoDoAluno(d, atual, datasDaSemana(hoje)));
}

/**
 * Os dias (as datas dadas) com os treinos de cada um e se foram feitos — a base do "N de M na semana" acima. W25: o Dashboard usa a
 * MESMA conta nos últimos 7 dias (a adesão do NF6), com os dados que a função painel-resumo-treino devolve.
 */
export function diasTreinoDoAluno(d: Pick<DadosEditor, "semana" | "gruposDisponiveis" | "diasConfig">, atual: SemanaAtual | null | undefined, datas: Date[]) {
  const existe = new Set(d.gruposDisponiveis.map((g) => chaveDoGrupo(g)));
  const configs: Record<string, ConfigDia> = {};
  d.diasConfig.forEach((c) => (configs[c.dia_semana] = c));
  const concluidos = new Set((atual?.concluidos ?? []).map((c) => `${c.data_treino}|${c.slot_idx ?? 0}`));
  const diasFeitos = new Set((atual?.concluidos ?? []).map((c) => c.data_treino));
  return datas.map((data) => {
    const dk = chaveData(data);
    const diaSemana = DIAS_SEMANA[data.getDay()];
    const trocas = (atual?.overrides ?? []).filter((o) => o.data_treino === dk);
    const slots = trocas.length
      ? trocas.map((o) => ({ slot: o.slot_idx ?? 0, chave: chaveTreino(o.grupo_id, o.grupo_usuario_id) }))
      : resolverTreinosDoDia(d.semana as unknown as SemanaConfig[], diaSemana, dk, (configs[diaSemana] as never) ?? null).map((c) => ({
          slot: c.slot_idx ?? 0,
          chave: chaveTreino(c.grupo_id, c.grupo_usuario_id),
        }));
    const treinos = slots.filter((s) => s.chave && existe.has(s.chave)).map((s) => ({ concluido: concluidos.has(`${dk}|${s.slot}`) }));
    return { treinos, feito: treinos.length > 0 && treinos.every((t) => t.concluido), algumFeito: diasFeitos.has(dk) };
  });
}

// ───────────────────────── volume por grupo (card do Resumo e aba) ─────────────────────────

/**
 * Os grupos da tela 7 ("Séries por semana, por grupo"): os blocos musculares juntados como o profissional fala. São também os chips
 * de grupo da Biblioteca e da folha "Adicionar exercício" (menos "Outros"). `curto` = o rótulo da barra do volume (76 px).
 */
export const GRUPOS_VOLUME = [
  { chave: "peito", nome: "Peito", blocos: ["peito"] },
  { chave: "costas", nome: "Costas", blocos: ["costas"] },
  { chave: "pernas", nome: "Pernas", blocos: ["quadriceps", "posterior", "gluteo", "panturrilha"] },
  { chave: "ombros", nome: "Ombros", blocos: ["ombro"] },
  { chave: "bracos", nome: "Braços", blocos: ["biceps", "triceps"] },
  { chave: "abdomen", nome: "Abdômen", blocos: ["abdomen"] },
  { chave: "cardio", nome: "Cardio", blocos: ["cardio"] },
  { chave: "alongamento", nome: "Alongamento e mobilidade", curto: "Alongamento", blocos: ["alongamento"] },
  { chave: "outros", nome: "Outros", blocos: ["outros"] },
] as const;

export interface VolumeGrupo {
  chave: string;
  /** o rótulo da barra (o `curto` do grupo, quando tem) */
  nome: string;
  /** séries por semana (primário 1, secundário 0,5 — a conta do Volume Semanal) */
  total: number;
  /** os blocos de dentro (ex.: Pernas = Quadríceps 10 · Posterior 6) */
  partes: { nome: string; total: number }[];
}

export function volumePorGrupo(blocos: readonly VolumeBloco[]): VolumeGrupo[] {
  const conhecidos = new Set(BLOCOS_MUSCULARES.map((b) => b.key));
  return GRUPOS_VOLUME.map((g) => {
    const partes = blocos
      .filter((b) => (g.blocos as readonly string[]).includes(b.bloco.key) || (g.chave === "outros" && !conhecidos.has(b.bloco.key)))
      .map((b) => ({ nome: b.bloco.nome, total: b.total }));
    return { chave: g.chave, nome: "curto" in g ? g.curto : g.nome, total: partes.reduce((s, x) => s + x.total, 0), partes };
  }).filter((g) => g.total > 0);
}

/** "14" · "7,5" */
export const textoSeriesVolume = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));

// ───────────────────────── troca do treino (NF7) ─────────────────────────

/** "seg, 03/08" (a data da troca, como o card "Próximos compromissos" da tela 7). */
export function textoDataCurta(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12);
  const dia = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][dt.getDay()];
  return `${dia}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** Dias até a troca (negativo = passou). */
export function diasAte(iso: string | null | undefined, hoje: Date = new Date()): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const alvo = Date.UTC(y, m - 1, d);
  const h = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((alvo - h) / 86400000);
}
