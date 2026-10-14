/**
 * W16b — pré-checagem do e-mail/CPF ao sair do campo: paciente_dado_livre no banco principal (só booleanos, sem dizer de quem nem
 * de qual conta). As frases e as regras puras estão em ./dadoRepetido.ts.
 * hml-21c (H-43 · jeito 2, etapa 3): pela função conta (q=dado_livre — a MESMA RPC e os MESMOS args, no servidor, como a pessoa), no lote da
 * tela; o null quando não deu para conferir, como hoje.
 */
import { lerConta } from "@/conta/ler";
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
    const { valor } = await lerConta("dado_livre", {
      email: dados.email ? normalizarEmail(dados.email) : null,
      cpf: dados.cpf ? soDigitos(dados.cpf) : null,
      paciente: dados.pacienteId ?? null,
    });
    const r = valor as { ok?: boolean; email_livre?: unknown; cpf_livre?: unknown } | null;
    if (!r || r.ok !== true) return null;
    return { email_livre: r.email_livre !== false, cpf_livre: r.cpf_livre !== false };
  } catch {
    return null;
  }
}
