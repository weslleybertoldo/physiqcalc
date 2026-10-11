import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useSessao } from "@/nucleo/sessao";

/**
 * Physiq W16 — o que as seções portadas do Nutri pediam ao site antigo: o paciente aberto (`usePaciente`, o PacienteContext de
 * lá) e quem está logado (`useAuth`). Aqui o paciente é a MATRÍCULA do banco principal (pacientes.id — o mesmo id que o site
 * antigo usa) e o usuário é o login do principal (o nutricionista_id que as tabelas da nutrição gravam).
 */
export interface PacienteDaDieta {
  id: string;
  nome: string;
  nascimento: string | null;
  genero: string | null;
}

export interface PacienteCtx {
  paciente: PacienteDaDieta;
  /** relê o perfil do aluno (o banco mexe em pacientes.updated_at a cada registro) */
  recarregar: () => Promise<void>;
  /** a pessoa logada pode escrever a dieta deste aluno (nutricionista responsável, dono com papel de nutri, master) */
  podeEditar: boolean;
}

const Ctx = createContext<PacienteCtx | null>(null);

export const PacienteProvider = Ctx.Provider;

export function usePaciente(): PacienteCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePaciente() só funciona dentro da aba Dieta do aluno");
  return ctx;
}

/**
 * A pessoa logada no banco principal (o `user.id` é o que o site antigo gravava em nutricionista_id).
 * hml-19a (H-81): devolve o MESMO objeto entre renders enquanto a pessoa é a mesma (useMemo por id e e-mail). Antes nascia um objeto
 * novo a cada render, e todo useEffect/useCallback com [user] rodava de novo a cada render: o laço da Anamnese (227 POST em ~10 s),
 * o de Questionários (976 GET em 45 s) e o de Exames (917), e o das seções da Dieta que usam o mesmo useAuth.
 */
export function useAuth(): { user: { id: string; email?: string | null } | null } {
  const { usuario } = useSessao();
  const id = usuario?.id ?? null;
  const email = usuario?.email ?? null;
  return useMemo(() => ({ user: id ? { id, email } : null }), [id, email]);
}

/**
 * Abre um formulário quando a rota chega com o parâmetro (os atalhos do "Fluxo de consulta" da W14: ?nova=orientacao…) e o tira da
 * URL — trocando pelo `?secao=` da seção, para a aba continuar nela (sem o parâmetro, a aba Dieta volta ao Plano).
 */
export function useAbrirPeloParametro(nome: string, valor: string, abrir: () => void, habilitado = true, secao?: string) {
  const [params, setParams] = useSearchParams();
  const ultimo = useRef<string | null>(null);
  useEffect(() => {
    if (!habilitado || params.get(nome) !== valor || ultimo.current === valor) return;
    ultimo.current = valor;
    abrir();
    const n = new URLSearchParams(params);
    n.delete(nome);
    if (secao) n.set("secao", secao);
    setParams(n, { replace: true });
  }, [params, setParams, nome, valor, abrir, habilitado, secao]);
}
