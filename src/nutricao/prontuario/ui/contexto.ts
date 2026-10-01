import { createContext, useContext } from "react";
import type { AcessoProntuario } from "@/nutricao/prontuario/lib/acesso";

export { useAuth, useAbrirPeloParametro } from "@/nutricao/editor/ui/contexto";

/**
 * Physiq W18 — o que as seções portadas do Nutri pediam ao site antigo (o PacienteContext de lá): o paciente aberto e quem está
 * logado. Aqui o paciente é a MATRÍCULA do banco principal (pacientes.id — o mesmo id que o site antigo usa) e o usuário é o login do
 * principal (o nutricionista_id que as tabelas do prontuário gravam). `acesso` diz o que a pessoa vê e muda (spec 4.1 › Prontuário).
 */
export interface PacienteDoProntuario {
  id: string;
  nome: string;
  /** yyyy-mm-dd */
  nascimento: string | null;
  genero: string | null;
  cpf: string | null;
}

export interface ProntuarioCtx {
  paciente: PacienteDoProntuario;
  /** relê o perfil do aluno (o banco mexe em pacientes.updated_at a cada registro) */
  recarregar: () => Promise<void>;
  acesso: AcessoProntuario;
}

const Ctx = createContext<ProntuarioCtx | null>(null);

export const ProntuarioProvider = Ctx.Provider;

export function useProntuario(): ProntuarioCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useProntuario() só funciona dentro da aba Prontuário do aluno");
  return ctx;
}

/** O mesmo formato do `usePaciente()` do site antigo (as seções portadas leem `paciente` e `recarregar`). */
export function usePaciente(): { paciente: PacienteDoProntuario; recarregar: () => Promise<void> } {
  const { paciente, recarregar } = useProntuario();
  return { paciente, recarregar };
}
