/**
 * Painel › Treinos (W23 — spec 4.4, C42–C45): regras PURAS (testadas em regras.test.ts). O escopo é o da aba "Treinos" do admin
 * antigo: o profissional vê os modelos, as pastas e a biblioteca DELE + os GLOBAIS do master (só leitura); o master muda o
 * catálogo global (o que ele cria é global, como antes); quem não tem papel no Treino (o dono que não é personal) só lê.
 * Os números saem das mesmas contas do editor da W15 (séries, duração estimada) — o que o profissional vê = o que o aluno recebe.
 */
import { estimarDuracaoMin } from "@/app-aluno/inicio/pecas/regras";
import { blocoDoGrupoMuscular } from "@/lib/gruposMusculares";
import { SERIES_PADRAO_DEFAULT, clampSeries } from "@/lib/seriesPadrao";
import { DESCANSO_PADRAO, GRUPOS_VOLUME, subtituloDoExercicio } from "@/treino/editor/regras";
import type { ExercicioEditor, PrescricaoEditavel } from "@/treino/editor/tipos";
import { rotuloEquipamento, rotuloPadrao } from "@/treino/equivalencia";
import type { AbaTreinos, Catalogo, ExercicioCatalogo, LinhaModelo, ModeloTela, PastaTela, PerfilRecebe, QuemMexe } from "./tipos";

export const ABAS_TREINOS: readonly AbaTreinos[] = ["treinos", "biblioteca", "historico", "relatorio"];

/** A aba da URL: `?aba=` (novo) ou o `?t=` dos links antigos do /admin/treinos (grupos · biblioteca · historico · relatorio). */
export function abaDaUrl(sp: URLSearchParams): AbaTreinos {
  const aba = sp.get("aba");
  if (aba && (ABAS_TREINOS as readonly string[]).includes(aba)) return aba as AbaTreinos;
  const t = sp.get("t");
  if (t === "grupos") return "treinos";
  if (t && (ABAS_TREINOS as readonly string[]).includes(t)) return t as AbaTreinos;
  return "treinos";
}

// ───────────────────────── de quem é ─────────────────────────

type ComDono = { professor_id?: string | null };

export const ehGlobal = (r: ComDono): boolean => !r.professor_id;
export const ehMeu = (r: ComDono, meuId: string | null): boolean => !!meuId && r.professor_id === meuId;
/** O que aparece na tela: o global (do master) e o meu — o de outros profissionais (que a leitura pública deixa passar) fica fora. */
export const visivel = (r: ComDono, meuId: string | null): boolean => ehGlobal(r) || ehMeu(r, meuId);

/** Quem muda: o master muda o global e o dele; o personal, só o dele; quem não tem papel no Treino, nada. */
export function podeEditar(r: ComDono, q: QuemMexe): boolean {
  if (!q.staff) return false;
  if (q.master) return visivel(r, q.meuId);
  return ehMeu(r, q.meuId);
}

export const podeCriar = (q: QuemMexe): boolean => q.staff && (q.master || !!q.meuId);

/** O dono do que é criado: o master cria no catálogo GLOBAL (professor_id null, como no admin antigo); o personal, para ele. */
export const donoAoCriar = (q: QuemMexe): string | null => (q.master ? null : q.meuId);

// ───────────────────────── modelos e pastas ─────────────────────────

export const temPrescricao = (l: Pick<LinhaModelo, "num_series" | "reps_alvo" | "descanso_segundos" | "carga_sugerida_kg">): boolean =>
  l.num_series != null || (l.reps_alvo != null && l.reps_alvo.trim() !== "") || l.descanso_segundos != null || l.carga_sugerida_kg != null;

/** A linha do modelo no formato do editor da W15 (LinhaExercicioEditor): sem prescrição = as séries padrão (3) e o resto vazio. */
export function exercicioDoModelo(l: LinhaModelo, e: ExercicioCatalogo): ExercicioEditor {
  return {
    chave: `ex:${e.id}`,
    exercicio_id: e.id,
    exercicio_usuario_id: null,
    nome: e.nome,
    subtitulo: subtituloDoExercicio(e),
    grupoMuscular: e.grupo_muscular ?? "",
    imagem_url: e.imagem_url ?? null,
    corrida: e.tipo === "corrida",
    series: l.num_series != null ? clampSeries(l.num_series) : SERIES_PADRAO_DEFAULT,
    seriesProprias: l.num_series != null,
    reps: l.reps_alvo && l.reps_alvo.trim() ? l.reps_alvo.trim() : null,
    descanso: l.descanso_segundos ?? null,
    carga: l.carga_sugerida_kg != null ? Number(l.carga_sugerida_kg) : null,
  };
}

type ColunasPrescricao = Pick<LinhaModelo, "num_series" | "reps_alvo" | "descanso_segundos" | "carga_sugerida_kg">;

/** Os campos da linha que o profissional mexeu (comparando com o que a linha mostrava quando ele digitou). */
export function camposEditados(
  mostrado: Pick<ExercicioEditor, "series" | "reps" | "descanso" | "carga">,
  p: PrescricaoEditavel,
): Partial<PrescricaoEditavel> {
  const e: Partial<PrescricaoEditavel> = {};
  if (p.series !== mostrado.series) e.series = p.series;
  if ((p.reps ?? null) !== (mostrado.reps ?? null)) e.reps = p.reps ?? null;
  if ((p.descanso ?? null) !== (mostrado.descanso ?? null)) e.descanso = p.descanso ?? null;
  if ((p.carga ?? null) !== (mostrado.carga ?? null)) e.carga = p.carga ?? null;
  return e;
}

/**
 * As colunas do modelo a gravar: SÓ as dos campos editados (cada campo grava o dele — digitar séries, repetições, descanso e carga
 * em sequência não perde nenhum, mesmo com a gravação anterior ainda a caminho). As séries só entram quando o profissional mudou
 * (sem séries no modelo e o campo nos 3 de sempre = continua sem — quem recebe fica com o padrão dele).
 */
export function colunasDaPrescricao(antes: Pick<LinhaModelo, "num_series">, editado: Partial<PrescricaoEditavel>): Partial<ColunasPrescricao> {
  const c: Partial<ColunasPrescricao> = {};
  if (editado.series !== undefined) {
    const s = clampSeries(editado.series);
    c.num_series = antes.num_series == null && s === SERIES_PADRAO_DEFAULT ? null : s;
  }
  if ("reps" in editado) c.reps_alvo = editado.reps && editado.reps.trim() ? editado.reps.trim() : null;
  if ("descanso" in editado) c.descanso_segundos = editado.descanso ?? null;
  if ("carga" in editado) c.carga_sugerida_kg = editado.carga ?? null;
  return c;
}

const porNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });

/** Os modelos que a tela mostra, com os exercícios na ordem do modelo, as pastas, quantos alunos meus recebem, séries e duração. */
export function montarModelos(c: Catalogo, q: QuemMexe, perfis: readonly PerfilRecebe[], meusAlunos: ReadonlySet<string>): ModeloTela[] {
  const exercicios = new Map(c.exercicios.map((e) => [e.id, e]));
  const pastasVisiveis = new Set(c.pastas.filter((p) => visivel(p, q.meuId)).map((p) => p.id));
  const pastasDe = new Map<string, string[]>();
  for (const v of c.vinculos) {
    if (!pastasVisiveis.has(v.pasta_id)) continue;
    const l = pastasDe.get(v.grupo_id) ?? [];
    if (!l.includes(v.pasta_id)) l.push(v.pasta_id);
    pastasDe.set(v.grupo_id, l);
  }
  const linhasDe = new Map<string, LinhaModelo[]>();
  for (const l of c.linhas) linhasDe.set(l.grupo_id, [...(linhasDe.get(l.grupo_id) ?? []), l]);
  const alunosDe = new Map<string, Set<string>>();
  for (const p of perfis) {
    if (!meusAlunos.has(p.user_id)) continue;
    const s = alunosDe.get(p.grupo_id) ?? new Set<string>();
    s.add(p.user_id);
    alunosDe.set(p.grupo_id, s);
  }
  return c.modelos
    .filter((m) => visivel(m, q.meuId))
    .map<ModeloTela>((m) => {
      const vistos = new Set<string>();
      const linhas = [...(linhasDe.get(m.id) ?? [])].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
      const exs: ExercicioEditor[] = [];
      let comPrescricao = false;
      for (const l of linhas) {
        const e = exercicios.get(l.exercicio_id);
        // linha repetida do mesmo par aparece 1 vez (a remoção apaga todas) — como no admin antigo
        if (!e || vistos.has(e.id)) continue;
        vistos.add(e.id);
        if (temPrescricao(l)) comPrescricao = true;
        exs.push(exercicioDoModelo(l, e));
      }
      return {
        id: m.id,
        nome: m.nome,
        global: ehGlobal(m),
        editavel: podeEditar(m, q),
        exercicios: exs,
        pastas: pastasDe.get(m.id) ?? [],
        alunos: alunosDe.get(m.id)?.size ?? 0,
        totalSeries: exs.reduce((s, e) => s + e.series, 0),
        minutos: estimarDuracaoMin(exs.map((e) => ({ series: e.series, descansoSeg: e.descanso ?? DESCANSO_PADRAO }))),
        temPrescricao: comPrescricao,
      };
    })
    .sort(porNome);
}

export function montarPastas(c: Catalogo, q: QuemMexe): PastaTela[] {
  const modelosVisiveis = new Set(c.modelos.filter((m) => visivel(m, q.meuId)).map((m) => m.id));
  return c.pastas
    .filter((p) => visivel(p, q.meuId))
    .map<PastaTela>((p) => ({
      id: p.id,
      nome: p.nome,
      global: ehGlobal(p),
      editavel: podeEditar(p, q),
      modelos: [...new Set(c.vinculos.filter((v) => v.pasta_id === p.id && modelosVisiveis.has(v.grupo_id)).map((v) => v.grupo_id))],
    }))
    .sort(porNome);
}

export const normalizar = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** A lista da esquerda: os modelos da pasta aberta (ou todos) que batem com a busca (nome do treino ou de um exercício). */
export function filtrarModelos(modelos: readonly ModeloTela[], pasta: PastaTela | null, busca: string): ModeloTela[] {
  const termo = normalizar(busca.trim());
  return modelos.filter(
    (m) =>
      (!pasta || pasta.modelos.includes(m.id)) &&
      (!termo || normalizar(m.nome).includes(termo) || m.exercicios.some((e) => normalizar(e.nome).includes(termo))),
  );
}

/** Nome de treino ou de pasta: obrigatório, até 60 letras (o limite do "+" do editor da W15). */
export function erroDoNome(nome: string, max = 60): string | null {
  const t = nome.trim().replace(/\s+/g, " ");
  if (!t) return "Dê um nome.";
  if (t.length > max) return `Até ${max} letras.`;
  return null;
}

export const nomeLimpo = (nome: string): string => nome.trim().replace(/\s+/g, " ");

export const textoAlunos = (n: number): string => (n === 0 ? "Nenhum aluno" : n === 1 ? "1 aluno" : `${n} alunos`);
export const textoExercicios = (n: number): string => (n === 1 ? "1 exercício" : `${n} exercícios`);

// ───────────────────────── biblioteca ─────────────────────────

export type EscopoBiblioteca = "global" | "minha";

/** Em qual grupo da tela (Peito, Costas, Pernas, Ombros, Braços…) o exercício cai — os mesmos filtros do "Adicionar exercício". */
export function grupoDaTela(grupoMuscular: string | null | undefined): string {
  const bloco = blocoDoGrupoMuscular(grupoMuscular || "");
  return GRUPOS_VOLUME.find((g) => (g.blocos as readonly string[]).includes(bloco))?.chave ?? "outros";
}

/** "Bíceps / Braquial · Rosca martelo · Halteres" — grupo · movimento · equipamento (o que a troca por equivalente usa). */
export function linhaDaBiblioteca(e: Pick<ExercicioCatalogo, "grupo_muscular" | "padrao_movimento" | "equipamento">): string {
  return [e.grupo_muscular, rotuloPadrao(e.padrao_movimento), rotuloEquipamento(e.equipamento)].filter(Boolean).join(" · ");
}

export function filtrarExercicios(
  lista: readonly ExercicioCatalogo[],
  escopo: EscopoBiblioteca,
  meuId: string | null,
  grupo: string,
  busca: string,
): ExercicioCatalogo[] {
  const termo = normalizar(busca.trim());
  return lista
    .filter((e) => (escopo === "global" ? ehGlobal(e) : ehMeu(e, meuId)))
    .filter((e) => grupo === "todos" || grupoDaTela(e.grupo_muscular) === grupo)
    .filter((e) => !termo || normalizar(`${e.nome} ${e.grupo_muscular} ${e.subgrupo ?? ""} ${linhaDaBiblioteca(e)}`).includes(termo))
    .sort(porNome);
}

/** O exercício está completo para a troca por equivalente (movimento + equipamento — W9)? */
export const classificado = (e: Pick<ExercicioCatalogo, "padrao_movimento" | "equipamento">): boolean => !!e.padrao_movimento && !!e.equipamento;

// ───────────────────────── relatório ─────────────────────────

export interface ResumoDoMes {
  treinos: number;
  volume: number;
  mediaSemana: string;
}

/** "Treinos no mês", "Volume total" e "Média / semana" — a mesma conta do Relatório antigo. */
export function resumoDoMes(semanas: readonly { totalTreinos: number; volumeTotal: number }[]): ResumoDoMes {
  const treinos = semanas.reduce((a, s) => a + s.totalTreinos, 0);
  const volume = semanas.reduce((a, s) => a + s.volumeTotal, 0);
  const media = semanas.length > 0 ? (treinos / semanas.length).toFixed(1).replace(".", ",") : "0";
  return { treinos, volume, mediaSemana: media };
}

/** "24/08" a partir de "2026-08-24" */
export function diaMes(data: string): string {
  const [, m, d] = data.split("-");
  return d && m ? `${d}/${m}` : data;
}
