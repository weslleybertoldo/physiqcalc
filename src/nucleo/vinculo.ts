/**
 * Vínculo pelo código do profissional (W3) — W7, pedido dele (29/09 ~18:00): ANTES de vincular, um popup mostra o nome, a
 * foto e o tipo do profissional e o que vai acontecer; Confirmar vincula (vincular-aluno), Cancelar não muda nada. Vale no
 * campo do Perfil, no "Tenho um código" das Boas-vindas e no link ?prof= (site e APK). A prévia é a MESMA regra do vínculo,
 * desfeita no banco (previa_vinculo_por_codigo) — nada de regra nova.
 */
import { principal } from "@/integrations/principal/client";
import { erroDoVinculo, normalizarCodigo, type ErroVinculo } from "./situacao";

export type TipoProfissional = "personal" | "nutricionista" | "academico" | "outra_area";

export interface PreviaVinculo {
  /** o vínculo daria certo (ou a pessoa já é aluna dele — ja_era) */
  ok: boolean;
  erro: ErroVinculo | null;
  jaEra: boolean;
  contaNome: string | null;
  modulos: Array<"treino" | "nutricao">;
  profissional: { nome: string; foto_url: string | null; tipo_perfil: TipoProfissional | null; papeis: Array<"personal" | "nutricionista"> } | null;
  /** W7b — a pessoa é aluna do app (treina sem profissional): a mensalidade do app para quando ela confirmar */
  app?: { valor: number | null; plano: string | null; assinatura_ativa: boolean } | null;
}

/** O tipo de perfil da W4/W5 (sem ele — professor antigo do Calc —, pelo papel na conta). */
const ROTULO_TIPO: Record<TipoProfissional, string> = {
  nutricionista: "Nutricionista",
  personal: "Personal trainer (Ed. Física)",
  academico: "Acadêmico de Nutrição",
  outra_area: "Outra área",
};

export function rotuloDoTipo(p: PreviaVinculo["profissional"]): string {
  if (!p) return "";
  if (p.tipo_perfil && ROTULO_TIPO[p.tipo_perfil]) return ROTULO_TIPO[p.tipo_perfil];
  const papeis = p.papeis ?? [];
  if (papeis.includes("personal") && papeis.includes("nutricionista")) return "Personal e nutricionista";
  if (papeis.includes("nutricionista")) return ROTULO_TIPO.nutricionista;
  if (papeis.includes("personal")) return ROTULO_TIPO.personal;
  return "Profissional";
}

/** "o treino" · "a dieta" · "o treino e a dieta" (o que o aluno ganha com o vínculo). */
export function oQueGanha(modulos: PreviaVinculo["modulos"]): string {
  const t = modulos.includes("treino");
  const n = modulos.includes("nutricao");
  if (t && n) return "o treino e a dieta";
  if (t) return "o treino";
  if (n) return "a dieta";
  return "o acompanhamento";
}

async function corpoDoErro(erro: unknown): Promise<Record<string, unknown> | null> {
  const ctx = (erro as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      return (await ctx.clone().json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

/** A prévia do código (não vincula nada). Código inexistente → erro "codigo_invalido" sem profissional. */
export async function previaDoCodigo(texto: string): Promise<PreviaVinculo> {
  const vazio: PreviaVinculo = { ok: false, erro: "codigo_invalido", jaEra: false, contaNome: null, modulos: [], profissional: null };
  const codigo = normalizarCodigo(texto);
  if (!codigo) return vazio;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { ...vazio, erro: "sem_internet" };
  const { data, error } = await principal.functions.invoke("vincular-aluno", { body: { codigo, previa: true } });
  if (error) {
    const c = await corpoDoErro(error);
    return { ...vazio, erro: erroDoVinculo(c?.erro) };
  }
  const d = (data ?? {}) as Record<string, unknown>;
  const prof = (d.profissional ?? null) as PreviaVinculo["profissional"];
  return {
    ok: d.ok === true,
    erro: d.ok === true ? null : erroDoVinculo(d.erro),
    jaEra: d.ja_era === true,
    contaNome: (d.conta_nome as string) ?? null,
    modulos: (Array.isArray(d.modulos) ? d.modulos : []).filter((m): m is "treino" | "nutricao" => m === "treino" || m === "nutricao"),
    profissional: prof && typeof prof.nome === "string" ? prof : null,
    app: d.app && typeof d.app === "object"
      ? {
          valor: Number.isFinite(Number((d.app as Record<string, unknown>).valor)) ? Number((d.app as Record<string, unknown>).valor) : null,
          plano: ((d.app as Record<string, unknown>).plano as string) ?? null,
          assinatura_ativa: (d.app as Record<string, unknown>).assinatura_ativa === true,
        }
      : null,
  };
}

/** Disparado quando um código novo é guardado com o app aberto (link do APK) — o popup do código pendente reabre. */
export const EVENTO_PROF_PENDENTE = "physiq:prof-pendente";
