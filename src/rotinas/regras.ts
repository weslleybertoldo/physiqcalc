// Physiq W-A P3 — regras PURAS da tela das rotinas (o card do Início, a página /perfil/rotinas e a folha — a P5 e a P6 importam daqui):
// quem tem rotinas, o ✓ otimista, a ordem do card, o formulário (validar e montar os dados da função) e os dias da semana. Testado em
// regras.test.ts. Os limites são os do banco (wa_rotina_campos / _shared/aluno-dia-regras.ts): nome 1–60, detalhe ≤ 120, "HH:MM", dias 1–7.
import type { RotinaDoDia } from "@/aluno-dia/regras";
import type { DadosDaRotina, MinhasRotinas, Rotina, TipoDeRotina } from "@/aluno-dia/tipos";
import { ATALHOS_DIAS, TODOS_OS_DIAS, mesmosDias, normalizarDias, textoDias, type AtalhoDias } from "@/nutricao/app/metasUtil";
import type { Situacao } from "@/nucleo/situacao";
import { MAX_ROTINAS_VIVAS } from "./lembretes";
import { TEXTOS } from "./textos";

export const ROTA_ROTINAS = "/perfil/rotinas";
/** O card do Início (e a seção da Dieta, P5): até 4 + "+N" (spec §4.3). */
export const NO_CARD = 4;

/** Quem tem rotinas: o login com alguma matrícula (a regra do meu_paciente_id da rotina_salvar — inclusive o aluno do app sem profissional, P9). */
export const ehAlunoDasRotinas = (s: Situacao | null | undefined): boolean => (s?.matriculas ?? []).length > 0;

export const vivas = (rotinas: readonly Rotina[]): Rotina[] => rotinas.filter((r) => !r.arquivada_em);
export const noLimite = (rotinas: readonly Rotina[]): boolean => vivas(rotinas).length >= MAX_ROTINAS_VIVAS;

/** O ✓ otimista: a lista das feitas com (ou sem) a do dia — o resto igual. */
export function comFeita<T extends MinhasRotinas>(d: T, rotina: string, dia: string, feita: boolean, agora: Date = new Date()): T {
  const sem = d.feitas.filter((f) => !(f.rotina_id === rotina && f.dia === dia));
  return { ...d, feitas: feita ? [...sem, { rotina_id: rotina, dia, feita_em: agora.toISOString() }] : sem };
}

/** O card: primeiro as que faltam (pela hora), depois as feitas; até `limite` e o "+N" do resto. */
export function proximasDoDia(doDia: readonly RotinaDoDia[], limite = NO_CARD): { visiveis: RotinaDoDia[]; resto: number } {
  const ordem = [...doDia.filter((r) => !r.feita), ...doDia.filter((r) => r.feita)];
  return { visiveis: ordem.slice(0, limite), resto: Math.max(0, ordem.length - limite) };
}

/** "5 g · Seg a Sex" (a linha de baixo da página). */
export const linhaDaRotina = (r: Pick<Rotina, "detalhe" | "dias_semana">): string => [r.detalhe, textoDias(r.dias_semana)].filter(Boolean).join(" · ");

// ───────────────────────── o formulário da folha ─────────────────────────
export interface FormularioDaRotina {
  nome: string;
  detalhe: string;
  tipo: TipoDeRotina;
  /** "HH:MM" ou "" (sem horário) */
  horario: string;
  dias: number[];
  lembrete: boolean;
}

export type CampoDaRotina = "nome" | "detalhe" | "horario" | "dias" | "lembrete";
export interface ErroDoFormulario {
  campo?: CampoDaRotina;
  mensagem: string;
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const aparado = (s: string): string => s.trim().replace(/\s+/g, " ");

export function formularioDe(r: Rotina | null): FormularioDaRotina {
  if (!r) return { nome: "", detalhe: "", tipo: "suplemento", horario: "", dias: [...TODOS_OS_DIAS], lembrete: false };
  return { nome: r.nome, detalhe: r.detalhe ?? "", tipo: r.tipo, horario: r.horario ?? "", dias: normalizarDias(r.dias_semana), lembrete: r.lembrete };
}

/** A forma antes de chamar a função (a mesma do banco); null = pode salvar. */
export function validarFormulario(f: FormularioDaRotina): ErroDoFormulario | null {
  const nome = aparado(f.nome);
  if (!nome) return { campo: "nome", mensagem: "Dê um nome à rotina." };
  if (nome.length > 60) return { campo: "nome", mensagem: "O nome vai até 60 letras." };
  if (aparado(f.detalhe).length > 120) return { campo: "detalhe", mensagem: "O detalhe vai até 120 letras." };
  if (f.horario && !HORA.test(f.horario)) return { campo: "horario", mensagem: "Escolha um horário válido." };
  if (normalizarDias(f.dias).length === 0) return { campo: "dias", mensagem: "Escolha pelo menos 1 dia." };
  if (f.lembrete && !f.horario) return { campo: "lembrete", mensagem: TEXTOS.lembreteSemHorario };
  return null;
}

/** Os dados que a função aluno-dia aceita (rotina_salvar / prof_rotina_salvar): todos os campos (o banco grava só o que mudou no histórico). */
export function dadosDoFormulario(f: FormularioDaRotina): DadosDaRotina {
  const detalhe = aparado(f.detalhe);
  return {
    nome: aparado(f.nome),
    detalhe: detalhe || null,
    tipo: f.tipo,
    horario: f.horario || null,
    dias_semana: normalizarDias(f.dias),
    lembrete: f.lembrete && !!f.horario,
  };
}

/** Liga/desliga um dia (a ordem é a da semana). */
export function alternarDia(dias: readonly number[], n: number): number[] {
  const d = normalizarDias(dias);
  return d.includes(n) ? d.filter((x) => x !== n) : normalizarDias([...d, n]);
}

/** O atalho que os dias formam ("Todos os dias", "Seg a Sex", "Fim de semana"), ou null. */
export function atalhoDosDias(dias: readonly number[]): AtalhoDias | null {
  return ATALHOS_DIAS.find((a) => mesmosDias(a.dias, dias))?.atalho ?? null;
}
