/**
 * W16b — pré-checagem do e-mail/CPF ao sair do campo: paciente_dado_livre no banco principal (só booleanos, sem dizer de quem nem
 * de qual conta). As frases e as regras puras estão em ./dadoRepetido.ts.
 */
import { principal } from "@/integrations/principal/client";
import { normalizarEmail } from "./dadoRepetido";

const soDigitos = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "");

export interface DadoLivre {
  email_livre: boolean;
  cpf_livre: boolean;
}

/**
 * Pré-checagem ao sair do campo. Devolve null quando não deu para conferir (sem internet, sem permissão): a tela não trava por
 * isso — o servidor confere de novo ao salvar.
 */
export async function conferirDadoLivre(dados: { email?: string | null; cpf?: string | null; pacienteId?: string | null }): Promise<DadoLivre | null> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  try {
    const { data, error } = await principal.rpc("paciente_dado_livre" as never, {
      p_email: dados.email ? normalizarEmail(dados.email) : null,
      p_cpf: dados.cpf ? soDigitos(dados.cpf) : null,
      p_paciente: dados.pacienteId ?? null,
    } as never);
    if (error) return null;
    const r = data as { ok?: boolean; email_livre?: unknown; cpf_livre?: unknown } | null;
    if (!r || r.ok !== true) return null;
    return { email_livre: r.email_livre !== false, cpf_livre: r.cpf_livre !== false };
  } catch {
    return null;
  }
}
