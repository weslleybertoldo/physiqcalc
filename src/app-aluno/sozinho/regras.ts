// Physiq W7b — regras PURAS do aluno SEM profissional (a "conta do app"): objetivos, planos do app (Treino R$ 29,90 · Treino +
// Alimentação R$ 49,90 — os preços vêm do banco), teste grátis, treinos prontos (o que vira treino próprio do aluno) e pratos
// prontos (TACO: kcal e macros calculados pelo banco). Sem rede e sem banco: testadas em regras.test.ts.
import { dataBR, diaSP, diasEntre, hojeSP, reais } from "@/financeiro/regras";

// ───────────────────────── objetivos, níveis e planos ─────────────────────────

export type Objetivo = "emagrecer" | "manter" | "ganhar_massa";
export type Nivel = "iniciante" | "intermediario" | "avancado";
export type ModuloApp = "treino" | "nutricao";

/** A MESMA lista nos treinos prontos, nos pratos prontos e no banco (pacientes.objetivo_app). */
export const OBJETIVOS: ReadonlyArray<{ id: Objetivo; rotulo: string; dica: string }> = [
  { id: "emagrecer", rotulo: "Emagrecer", dica: "Perder gordura, com mais gasto no treino" },
  { id: "manter", rotulo: "Manter a forma", dica: "Condicionamento e saúde, sem mudar o peso" },
  { id: "ganhar_massa", rotulo: "Ganhar massa", dica: "Mais músculo e força" },
];

export const NIVEIS: ReadonlyArray<{ id: Nivel; rotulo: string; dica: string }> = [
  { id: "iniciante", rotulo: "Iniciante", dica: "Começando ou voltando" },
  { id: "intermediario", rotulo: "Intermediário", dica: "Treina há alguns meses" },
  { id: "avancado", rotulo: "Avançado", dica: "Treina há mais de um ano" },
];

export const PLANO_TREINO = "app_treino";
export const PLANO_COMPLETO = "app_treino_alimentacao";

export function ehObjetivo(v: unknown): v is Objetivo {
  return OBJETIVOS.some((o) => o.id === v);
}

export function rotuloObjetivo(o: string | null | undefined): string {
  return OBJETIVOS.find((x) => x.id === o)?.rotulo ?? "";
}

export function rotuloNivel(n: string | null | undefined): string {
  return NIVEIS.find((x) => x.id === n)?.rotulo ?? "";
}

export interface PlanoApp {
  codigo: string;
  nome: string;
  valor: number;
  modulos: ModuloApp[];
  descricao: string | null;
}

/** Os dias grátis do plano do app — o padrão da seed (app_config 'aluno_do_app'.teste_dias); o valor que vale vem do banco. */
export const TESTE_DIAS_APP = 7;

/**
 * hml-11 (H-28): os 2 planos do app como a seed os carrega (planos_aluno da conta do app em
 * supabase-principal/migrations/20260929190000_w07b_sem_profissional.sql). O preço que vale é o do banco (o master muda sem deploy,
 * W27); os Termos de assinatura (src/publico/legal/assinatura.ts) escrevem os preços daqui, e o teste deles confere com a seed.
 */
export const PLANOS_APP_PADRAO: readonly PlanoApp[] = [
  {
    codigo: PLANO_TREINO,
    nome: "Treino",
    valor: 29.9,
    modulos: ["treino"],
    descricao: "Monte o seu treino ou use um treino pronto pelo seu objetivo. Funciona sem internet.",
  },
  {
    codigo: PLANO_COMPLETO,
    nome: "Treino + Alimentação",
    valor: 49.9,
    modulos: ["treino", "nutricao"],
    descricao: "Tudo do Treino e mais os pratos prontos pelo seu objetivo, com calorias e macros.",
  },
];

export interface AssinaturaApp {
  status: string;
  valor: number | null;
  proximo_vencimento: string | null;
}

export interface MatriculaApp {
  paciente_id: string;
  ativo: boolean;
  plano: string | null;
  plano_nome: string | null;
  valor: number | null;
  modulos: ModuloApp[];
  objetivo: Objetivo | null;
  teste_de: string | null;
  teste_ate: string | null;
  pago_ate: string | null;
  pausada: boolean;
  encerrada_em: string | null;
  encerrada_motivo: string | null;
  aguardando: boolean;
  assinatura: AssinaturaApp | null;
}

export interface MeuPlanoApp {
  teste_dias: number;
  planos: PlanoApp[];
  matricula: MatriculaApp | null;
  com_profissional: boolean;
}

const MODULOS: ModuloApp[] = ["treino", "nutricao"];
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** O JSON do meu_plano_app() (tolerante a campo faltando). */
export function normalizarMeuPlano(bruto: unknown): MeuPlanoApp {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const planos = (Array.isArray(b.planos) ? b.planos : []) as Array<Record<string, unknown>>;
  const m = (b.matricula && typeof b.matricula === "object" ? b.matricula : null) as Record<string, unknown> | null;
  return {
    teste_dias: num(b.teste_dias) ?? TESTE_DIAS_APP,
    planos: planos
      .filter((p) => typeof p.codigo === "string" && num(p.valor) !== null)
      .map((p) => ({
        codigo: String(p.codigo),
        nome: String(p.nome ?? p.codigo),
        valor: num(p.valor) ?? 0,
        modulos: (Array.isArray(p.modulos) ? p.modulos : []).filter((x): x is ModuloApp => MODULOS.includes(x as ModuloApp)),
        descricao: (p.descricao as string) ?? null,
      })),
    matricula: m && typeof m.paciente_id === "string"
      ? {
          paciente_id: m.paciente_id,
          ativo: m.ativo === true,
          plano: (m.plano as string) ?? null,
          plano_nome: (m.plano_nome as string) ?? null,
          valor: num(m.valor),
          modulos: (Array.isArray(m.modulos) ? m.modulos : []).filter((x): x is ModuloApp => MODULOS.includes(x as ModuloApp)),
          objetivo: ehObjetivo(m.objetivo) ? m.objetivo : null,
          teste_de: (m.teste_de as string) ?? null,
          teste_ate: (m.teste_ate as string) ?? null,
          pago_ate: (m.pago_ate as string) ?? null,
          pausada: m.pausada === true,
          encerrada_em: (m.encerrada_em as string) ?? null,
          encerrada_motivo: (m.encerrada_motivo as string) ?? null,
          aguardando: m.aguardando === true,
          assinatura: m.assinatura && typeof m.assinatura === "object"
            ? {
                status: String((m.assinatura as Record<string, unknown>).status ?? ""),
                valor: num((m.assinatura as Record<string, unknown>).valor),
                proximo_vencimento: ((m.assinatura as Record<string, unknown>).proximo_vencimento as string) ?? null,
              }
            : null,
        }
      : null,
    com_profissional: b.com_profissional === true,
  };
}

/** Último dia grátis de quem entra agora (a regra do banco: o fim do dia hoje + N em São Paulo). */
export function ultimoDiaGratis(dias: number, agora: Date = new Date()): string {
  const hoje = hojeSP(agora);
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.max(0, Math.round(dias)));
  return d.toISOString().slice(0, 10);
}

export type TomPlano = "n" | "a" | "r" | "g" | "c" | "t";

export interface SituacaoPlano {
  tipo: "teste" | "em_dia" | "vence_em_breve" | "vencida" | "isento" | "aguardando" | "encerrada";
  texto: string;
  tom: TomPlano;
  /** dias até o fim do teste/cobertura (0 = hoje; negativo = já passou) */
  dias: number | null;
}

/** A situação do plano do app numa frase (Perfil › Meu plano e o chip do item). */
export function situacaoDoPlano(m: MatriculaApp | null, agora: Date = new Date()): SituacaoPlano | null {
  if (!m) return null;
  if (!m.ativo) return { tipo: "encerrada", texto: m.encerrada_motivo === "vinculou_profissional" ? "Com o seu profissional" : "Encerrado", tom: "g", dias: null };
  if (m.pausada) return { tipo: "isento", texto: "Isento", tom: "g", dias: null };
  if (m.aguardando) return { tipo: "aguardando", texto: "Aguardando o pagamento", tom: "c", dias: null };
  const hoje = hojeSP(agora);
  const cob = m.pago_ate ? new Date(m.pago_ate) : null;
  const coberta = !!cob && cob.getTime() > agora.getTime();
  const dia = diaSP(m.pago_ate);
  const dias = dia ? diasEntre(hoje, dia) : null;
  const soTeste = !!m.teste_ate && !!cob && cob.getTime() <= new Date(m.teste_ate).getTime() + 60_000;
  if (coberta && soTeste) {
    const texto = dias !== null && dias <= 0 ? "Grátis até hoje" : dias === 1 ? "Grátis até amanhã" : `Grátis até ${dataBR(dia)}`;
    return { tipo: "teste", texto, tom: "n", dias };
  }
  if (coberta) {
    if (dias !== null && dias <= 7) return { tipo: "vence_em_breve", texto: dias <= 0 ? "Vence hoje" : dias === 1 ? "Vence amanhã" : `Vence em ${dias} dias`, tom: "a", dias };
    return { tipo: "em_dia", texto: `Em dia até ${dataBR(dia)}`, tom: "n", dias };
  }
  if (soTeste || !m.pago_ate) return { tipo: "vencida", texto: "Teste grátis acabou", tom: "r", dias };
  return { tipo: "vencida", texto: `Venceu em ${dataBR(dia)}`, tom: "r", dias };
}

/** "R$ 29,90/mês" */
export function precoMensal(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `${reais(v)}/mês`;
}

// ───────────────────────── treinos prontos ─────────────────────────

export const DIAS_SEMANA = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"] as const;
export type DiaSemana = (typeof DIAS_SEMANA)[number];
const ROTULO_DIA: Record<string, string> = { DOM: "Dom", SEG: "Seg", TER: "Ter", QUA: "Qua", QUI: "Qui", SEX: "Sex", SAB: "Sáb" };

export interface ExercicioPronto {
  exercicio_id: string;
  ordem: number;
  series: number;
  reps: string;
  descanso_segundos: number | null;
  observacao: string | null;
  exercicio: { id: string; nome: string; grupo_muscular: string | null; imagem_url: string | null; tipo: string | null } | null;
}

export interface GrupoPronto {
  id: string;
  letra: string;
  nome: string;
  dias: string[];
  ordem: number;
  exercicios: ExercicioPronto[];
}

export interface TreinoPronto {
  id: string;
  codigo: string;
  nome: string;
  objetivo: Objetivo;
  nivel: Nivel;
  dias_por_semana: number;
  divisao: string;
  descricao: string | null;
  ordem: number;
  grupos: GrupoPronto[];
}

/** Grupos e exercícios na ordem (o PostgREST devolve o embutido sem ordem garantida). */
export function ordenarTreino(t: TreinoPronto): TreinoPronto {
  return {
    ...t,
    grupos: [...(t.grupos ?? [])]
      .sort((a, b) => a.ordem - b.ordem || a.letra.localeCompare(b.letra))
      .map((g) => ({ ...g, dias: [...(g.dias ?? [])].sort((a, b) => DIAS_SEMANA.indexOf(a as DiaSemana) - DIAS_SEMANA.indexOf(b as DiaSemana)), exercicios: [...(g.exercicios ?? [])].sort((a, b) => a.ordem - b.ordem) })),
  };
}

/** Os treinos do objetivo (e do nível, se escolhido), na ordem do catálogo. */
export function filtrarTreinos(lista: TreinoPronto[], objetivo: Objetivo | null, nivel: Nivel | null = null): TreinoPronto[] {
  return lista
    .filter((t) => (!objetivo || t.objetivo === objetivo) && (!nivel || t.nivel === nivel))
    .sort((a, b) => NIVEIS.findIndex((n) => n.id === a.nivel) - NIVEIS.findIndex((n) => n.id === b.nivel) || a.ordem - b.ordem);
}

/** "Seg · Qui" */
export function diasDoGrupo(dias: string[]): string {
  return [...dias].sort((a, b) => DIAS_SEMANA.indexOf(a as DiaSemana) - DIAS_SEMANA.indexOf(b as DiaSemana)).map((d) => ROTULO_DIA[d] ?? d).join(" · ");
}

/** "3x por semana · A · B · C" */
export function resumoDoTreino(t: Pick<TreinoPronto, "dias_por_semana" | "divisao">): string {
  return `${t.dias_por_semana}x por semana · ${t.divisao}`;
}

export function totalDeExercicios(t: TreinoPronto): number {
  return t.grupos.reduce((n, g) => n + g.exercicios.length, 0);
}

/** "4 × 12 · 60 s" · corrida: "20 min" */
export function linhaDoExercicio(e: Pick<ExercicioPronto, "series" | "reps" | "descanso_segundos" | "exercicio">): string {
  if (e.exercicio?.tipo === "corrida" || /min/i.test(e.reps)) return e.reps;
  const partes = [`${e.series} × ${e.reps}`];
  if (e.descanso_segundos) partes.push(`${e.descanso_segundos} s`);
  return partes.join(" · ");
}

/** Grupo muscular que mais aparece no treino (para a foto de fundo — P29). */
export function grupoPrincipal(g: Pick<GrupoPronto, "exercicios" | "nome">): string {
  const conta = new Map<string, number>();
  // empate: vale o que aparece primeiro na ordem do treino
  for (const e of [...g.exercicios].sort((a, b) => a.ordem - b.ordem)) {
    const gm = (e.exercicio?.grupo_muscular ?? "").split("/")[0].trim();
    if (gm && e.exercicio?.tipo !== "corrida") conta.set(gm, (conta.get(gm) ?? 0) + 1);
  }
  return [...conta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? g.nome;
}

export interface OperacaoEscrita {
  sql: string;
  params: unknown[];
}

/**
 * O treino pronto vira o treino DO ALUNO: as divisões viram treinos próprios (tb_grupos_treino_usuario), com os exercícios da
 * biblioteca (tb_grupos_exercicios_usuario), as séries/repetições/descanso de cada um (tb_series_padrao_usuario — a W8 mostra
 * as repetições e o descanso) e a semana (tb_semana_treinos: a semana de antes do aluno sai; os treinos próprios dele ficam).
 * Tudo pelo PowerSync (grava no aparelho, funciona sem internet e sobe depois) — ele muda depois como os treinos próprios de hoje.
 */
export function planoDeEscrita(
  t: TreinoPronto,
  userId: string,
  semanaAtual: Array<{ id: string }>,
  opts: { novoId: () => string; agora: string },
): { operacoes: OperacaoEscrita[]; grupos: Array<{ id: string; nome: string; dias: string[] }> } {
  const operacoes: OperacaoEscrita[] = [];
  const grupos: Array<{ id: string; nome: string; dias: string[] }> = [];
  for (const s of semanaAtual) operacoes.push({ sql: "DELETE FROM tb_semana_treinos WHERE id = ? AND user_id = ?", params: [s.id, userId] });
  const ordenado = ordenarTreino(t);
  const usados = new Set<string>();
  for (const g of ordenado.grupos) {
    const gid = opts.novoId();
    grupos.push({ id: gid, nome: g.nome, dias: g.dias });
    operacoes.push({ sql: "INSERT INTO tb_grupos_treino_usuario (id, user_id, nome, created_at) VALUES (?, ?, ?, ?)", params: [gid, userId, g.nome, opts.agora] });
    g.exercicios.forEach((e, i) => {
      operacoes.push({
        sql: "INSERT INTO tb_grupos_exercicios_usuario (id, user_id, grupo_usuario_id, exercicio_id, exercicio_usuario_id, ordem) VALUES (?, ?, ?, ?, NULL, ?)",
        params: [opts.novoId(), userId, gid, e.exercicio_id, i],
      });
      operacoes.push({
        sql: "INSERT INTO tb_series_padrao_usuario (id, user_id, grupo_id, grupo_usuario_id, exercicio_id, exercicio_usuario_id, num_series, reps_alvo, descanso_segundos, observacao, updated_at) VALUES (?, ?, NULL, ?, ?, NULL, ?, ?, ?, ?, ?)",
        params: [opts.novoId(), userId, gid, e.exercicio_id, Math.min(10, Math.max(1, Math.round(e.series))), e.reps, e.descanso_segundos ?? null, e.observacao ?? null, opts.agora],
      });
    });
    for (const d of g.dias) {
      if (usados.has(d)) continue; // um dia, um treino (slot 0)
      usados.add(d);
      operacoes.push({
        // extra é NOT NULL no Postgres (sem ele o envio do PowerSync travaria a fila)
        sql: "INSERT INTO tb_semana_treinos (id, user_id, dia_semana, grupo_id, grupo_usuario_id, slot_idx, extra) VALUES (?, ?, ?, NULL, ?, 0, 0)",
        params: [opts.novoId(), userId, d, gid],
      });
    }
  }
  return { operacoes, grupos };
}

// ───────────────────────── pratos prontos ─────────────────────────

export type Refeicao = "cafe_da_manha" | "almoco" | "lanche" | "jantar" | "ceia";

export const ROTULO_REFEICAO: Record<Refeicao, string> = {
  cafe_da_manha: "Café da manhã",
  almoco: "Almoço",
  lanche: "Lanche",
  jantar: "Jantar",
  ceia: "Ceia",
};

export const ORDEM_REFEICAO: Refeicao[] = ["cafe_da_manha", "almoco", "lanche", "jantar", "ceia"];

export interface ItemPrato {
  nome: string;
  medida: string | null;
  quantidade_g: number;
  kcal: number;
  proteina_g: number;
  carboidrato_g: number;
  lipidio_g: number;
  taco: string | null;
}

export interface PratoPronto {
  id: string;
  codigo: string;
  nome: string;
  refeicao: Refeicao;
  descricao: string | null;
  modo_preparo: string | null;
  foto_url: string | null;
  objetivos: Objetivo[];
  itens: ItemPrato[];
  kcal: number;
  proteina_g: number;
  carboidrato_g: number;
  lipidio_g: number;
  fibra_g: number;
}

export interface RespostaPratos {
  ok: boolean;
  erro: string | null;
  objetivo: Objetivo;
  objetivo_do_aluno: Objetivo | null;
  pratos: PratoPronto[];
}

export function normalizarPratos(bruto: unknown): RespostaPratos {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const pratos = (Array.isArray(b.pratos) ? b.pratos : []) as Array<Record<string, unknown>>;
  return {
    ok: b.ok === true,
    erro: b.ok === true ? null : String(b.erro ?? "erro_interno"),
    objetivo: ehObjetivo(b.objetivo) ? b.objetivo : "manter",
    objetivo_do_aluno: ehObjetivo(b.objetivo_do_aluno) ? b.objetivo_do_aluno : null,
    pratos: pratos.map((p) => ({
      id: String(p.id),
      codigo: String(p.codigo ?? ""),
      nome: String(p.nome ?? ""),
      refeicao: (ORDEM_REFEICAO.includes(p.refeicao as Refeicao) ? p.refeicao : "almoco") as Refeicao,
      descricao: (p.descricao as string) ?? null,
      modo_preparo: (p.modo_preparo as string) ?? null,
      foto_url: (p.foto_url as string) ?? null,
      objetivos: (Array.isArray(p.objetivos) ? p.objetivos : []).filter(ehObjetivo),
      itens: ((Array.isArray(p.itens) ? p.itens : []) as Array<Record<string, unknown>>).map((i) => ({
        nome: String(i.nome ?? ""),
        medida: (i.medida as string) ?? null,
        quantidade_g: num(i.quantidade_g) ?? 0,
        kcal: num(i.kcal) ?? 0,
        proteina_g: num(i.proteina_g) ?? 0,
        carboidrato_g: num(i.carboidrato_g) ?? 0,
        lipidio_g: num(i.lipidio_g) ?? 0,
        taco: (i.taco as string) ?? null,
      })),
      kcal: num(p.kcal) ?? 0,
      proteina_g: num(p.proteina_g) ?? 0,
      carboidrato_g: num(p.carboidrato_g) ?? 0,
      lipidio_g: num(p.lipidio_g) ?? 0,
      fibra_g: num(p.fibra_g) ?? 0,
    })),
  };
}

/** Os pratos por refeição, na ordem do dia (café, almoço, lanche, jantar, ceia). */
export function agruparPorRefeicao(pratos: PratoPronto[]): Array<{ refeicao: Refeicao; rotulo: string; pratos: PratoPronto[] }> {
  return ORDEM_REFEICAO.map((r) => ({ refeicao: r, rotulo: ROTULO_REFEICAO[r], pratos: pratos.filter((p) => p.refeicao === r) })).filter((g) => g.pratos.length > 0);
}

/** "Ovo cozido · Pão integral · Mamão papaia" (até 3 e "+2"). */
export function resumoDosItens(itens: ItemPrato[], max = 3): string {
  const nomes = itens.map((i) => i.nome);
  return nomes.length <= max ? nomes.join(" · ") : `${nomes.slice(0, max).join(" · ")} · +${nomes.length - max}`;
}

/** 12 → "12 g" · 12.5 → "12,5 g" */
export function gramas(v: number): string {
  const n = Math.round(v * 10) / 10;
  return `${Number.isInteger(n) ? n : n.toLocaleString("pt-BR")} g`;
}

/** 1480 → "1.480" */
export function kcalTexto(v: number): string {
  return Math.round(v).toLocaleString("pt-BR");
}

export const MENSAGEM_APP: Record<string, string> = {
  sem_login: "Entre de novo para continuar.",
  sem_internet: "Conecte-se à internet para continuar.",
  conta_real_no_staging: "Este é o ambiente de teste: só contas de teste entram.",
  objetivo_invalido: "Escolha o seu objetivo.",
  plano_invalido: "Escolha um plano.",
  com_profissional: "Você já está com um profissional — o seu plano é o dele.",
  app_sem_conta: "O plano do app ainda não está disponível. Tente de novo em instantes.",
  usuario_inexistente: "Entre de novo para continuar.",
  sem_matricula_app: "Você não está no plano do app agora.",
  sem_plano_alimentacao: "Os pratos prontos estão no plano Treino + Alimentação.",
  nao_e_do_app: "Esta matrícula não é do plano do app.",
  // hml-12 (H-30): a data de nascimento (18+) e o consentimento de saúde do plano sem profissional
  nascimento_invalido: "Confira a sua data de nascimento.",
  menor_de_18:
    "O plano sem profissional é para maiores de 18 anos. Se você tem 16 ou 17 anos, treine com um profissional: peça o código a ele.",
  sem_consentimento_saude: "Marque o consentimento dos seus dados de saúde para começar.",
  atualize_o_app: "Atualize o app ou recarregue a página para começar o plano sem profissional.",
  versao_desatualizada: "Os termos foram atualizados. Recarregue para ler a versão nova.",
  erro_interno: "Não deu certo agora. Tente de novo.",
};

export function mensagemApp(codigo: string | null | undefined): string {
  return (codigo && MENSAGEM_APP[codigo]) || MENSAGEM_APP.erro_interno;
}
