/**
 * Painel › Treinos (W23 — spec 4.4, C42–C45): regras PURAS (testadas em regras.test.ts). O escopo é o da aba "Treinos" do admin
 * antigo: o profissional vê os modelos, as pastas e a biblioteca DELE + os GLOBAIS do master (só leitura); o master muda o
 * catálogo global (o que ele cria é global, como antes); quem não tem papel no Treino (o dono que não é personal) só lê.
 * Os números saem das mesmas contas do editor da W15 (séries, duração estimada) — o que o profissional vê = o que o aluno recebe.
 */
import { estimarDuracaoMin } from "@/app-aluno/inicio/pecas/regras";
import { MUSCULOS_PRIMARIOS_CONHECIDOS, musculosDosBlocos } from "@/lib/gruposMusculares";
import { SERIES_PADRAO_DEFAULT, clampSeries } from "@/lib/seriesPadrao";
import { DESCANSO_PADRAO, GRUPOS_VOLUME, subtituloDoExercicio } from "@/treino/editor/regras";
import type { ExercicioEditor, PrescricaoEditavel } from "@/treino/editor/tipos";
import { rotuloEquipamento, rotuloPadrao } from "@/treino/equivalencia";
import { codigosDaBusca } from "@/treino/equivalenciaBusca";
import type {
  AbaTreinos, AlunoDaLista, Catalogo, ExercicioCatalogo, FiltrosExercicios, LinhaModelo, ModeloTela, PastaRow, PastaTela, PerfilRecebe, QuemMexe,
} from "./tipos";

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

/**
 * Os modelos que a tela mostra, com os exercícios na ordem do modelo, as pastas, quantos alunos meus recebem, séries e duração.
 * `meusAlunos` null = todos os perfis contam (hml-14d: o quemRecebe já devolve só os alunos de quem chama — a lista de alunos não
 * é mais baixada inteira).
 */
export function montarModelos(c: Catalogo, q: QuemMexe, perfis: readonly PerfilRecebe[], meusAlunos: ReadonlySet<string> | null = null): ModeloTela[] {
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
    if (meusAlunos && !meusAlunos.has(p.user_id)) continue;
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

/**
 * As pastas da coluna da esquerda (as visíveis: globais e minhas), cada uma com quantos treinos tem — hml-14d: o número vem do
 * banco (`por_pasta` da modelos_da_lista), porque a tela só tem os treinos da página.
 */
export function montarPastas(pastas: readonly PastaRow[], porPasta: Readonly<Record<string, number>>, q: QuemMexe): PastaTela[] {
  return pastas
    .filter((p) => visivel(p, q.meuId))
    .map<PastaTela>((p) => ({ id: p.id, nome: p.nome, global: ehGlobal(p), editavel: podeEditar(p, q), total: Number(porPasta[p.id] ?? 0) || 0 }))
    .sort(porNome);
}

/** hml-14d (D23): os modelos na ordem da página que veio do banco (texto_busca(nome), id) — o montarModelos ordena por nome no
 * navegador, e a página precisa da ordem do banco para não trocar item de página. */
export function naOrdemDaPagina<T extends { id: string }>(itens: readonly T[], ids: readonly string[]): T[] {
  const pos = new Map(ids.map((id, i) => [id, i]));
  return [...itens].sort((a, b) => (pos.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (pos.get(b.id) ?? Number.MAX_SAFE_INTEGER));
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

/** "Bíceps / Braquial · Rosca martelo · Halteres" — grupo · movimento · equipamento (o que a troca por equivalente usa). */
export function linhaDaBiblioteca(e: Pick<ExercicioCatalogo, "grupo_muscular" | "padrao_movimento" | "equipamento">): string {
  return [e.grupo_muscular, rotuloPadrao(e.padrao_movimento), rotuloEquipamento(e.equipamento)].filter(Boolean).join(" · ");
}

/** O termo de busca como vai ao banco: sem espaços sobrando, até 80 letras. */
export const termoDaBusca = (t: string): string => t.trim().replace(/\s+/g, " ").slice(0, 80);

/**
 * hml-14d (B21 · D24): a busca e o grupo da biblioteca como o banco entende (RPC exercicios_da_lista) — antes eram filtros no
 * navegador sobre a tabela inteira. `q` = o termo (nome, grupo muscular, subgrupo e variação, sem acento); `codigos` = os de
 * movimento/equipamento cujos RÓTULOS casam com o termo (o que a linha "grupo · movimento · equipamento" mostra); o grupo da tela
 * vira `musculos` (os músculos primários dos blocos dele — o mesmo mapa do filtro de grupo que o navegador fazia, blocoDoGrupoMuscular)
 * ou, em "outros", `fora` (nenhum conhecido).
 */
export function filtrosDaBiblioteca(termo: string, grupo: string): Pick<FiltrosExercicios, "q" | "codigos" | "musculos" | "fora"> {
  const f: Pick<FiltrosExercicios, "q" | "codigos" | "musculos" | "fora"> = {};
  const q = termoDaBusca(termo);
  if (q) {
    f.q = q;
    const codigos = codigosDaBusca(q);
    if (codigos.length) f.codigos = codigos;
  }
  if (grupo === "outros") f.fora = [...MUSCULOS_PRIMARIOS_CONHECIDOS];
  else {
    const g = GRUPOS_VOLUME.find((x) => x.chave === grupo);
    if (g) f.musculos = musculosDosBlocos(g.blocos);
  }
  return f;
}

// ───────────────────────── seletor de aluno do Treino (B19 · D26) ─────────────────────────

/** Quantos alunos o seletor mostra por busca (o resto aparece refinando). */
export const LIMITE_SELETOR_TREINO = 20;
/** A espera depois da última tecla antes de buscar (as listas do painel). */
export const ESPERA_BUSCA = 300;

/** O aluno da lista do Treino (admin-list-users) como a tela mostra: o nome, senão o e-mail, senão "Aluno" (como antes). */
export function alunoDaLista(u: { id: string; nome?: string | null; email?: string | null; foto_url?: string | null }): AlunoDaLista {
  return { id: u.id, nome: (u.nome || u.email || "").trim() || "Aluno", email: u.email || "", foto_url: u.foto_url ?? null };
}

/** "20 de 41 — refine a busca" (o mesmo texto do seletor da 14b). */
export const textoMaisAlunosTreino = (mostrando: number, total: number): string => `${mostrando} de ${total} — refine a busca`;

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
