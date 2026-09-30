import { PRINCIPAL_SCHEMA, type SchemaPrincipal } from "@/integrations/principal/client";
import { existe } from "@/rotas/registro";

/**
 * O site antigo do PhysiqNutri (até a W28) e o link do diário do aluno (R13 — falha F1), definidos NUM LUGAR SÓ:
 *   · o /d/<código> que funciona hoje é o do site antigo (a página pública nova é da W24: src/publico/Diario.tsx);
 *   · quando essa página existir no Physiq, o link e o redirecionamento do /p/ antigo passam a apontar para ela sozinhos
 *     (registro por convenção — ninguém precisa editar este arquivo);
 *   · staging aponta para o staging do site antigo (mesmo schema do banco principal).
 */
export const SITE_ANTIGO_NUTRI: Record<SchemaPrincipal, string> = {
  public: "https://nutri.physiqcalc.com.br",
  staging: "https://physiqnutri-staging.vercel.app",
};

export function siteAntigoNutri(schema: SchemaPrincipal = PRINCIPAL_SCHEMA): string {
  return SITE_ANTIGO_NUTRI[schema] ?? SITE_ANTIGO_NUTRI.public;
}

/** A página pública do diário já existe no Physiq (W24)? */
export function diarioNoPhysiq(temPagina: () => boolean = () => existe("publico", "Diario")): boolean {
  return temPagina();
}

/** O código do link como o site antigo guarda (minúsculas, só letras e números). */
export function normalizarCodigoDiario(codigo: string | null | undefined): string {
  return String(codigo ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);
}

export interface OpcoesDiario {
  /** origem do Physiq (padrão: a da página) — vale quando o /d/ já é do Physiq */
  origem?: string;
  schema?: SchemaPrincipal;
  temPagina?: () => boolean;
}

/** O link do diário do aluno: https://<Physiq ou site antigo>/d/<código>. */
export function enderecoDoDiario(codigo: string, opcoes: OpcoesDiario = {}): string {
  const c = normalizarCodigoDiario(codigo);
  if (diarioNoPhysiq(opcoes.temPagina)) {
    const origem = opcoes.origem ?? (typeof window !== "undefined" ? window.location.origin : "https://physiqcalc.com.br");
    return `${origem}/d/${c}`;
  }
  return `${siteAntigoNutri(opcoes.schema)}/d/${c}`;
}

/** Uma seção do aluno no site antigo (/pacientes/<id>/<seção>) — atalhos do "Fluxo de consulta" enquanto a aba nova não chega. */
export function secaoNoSiteAntigo(pacienteId: string, secao: string, schema?: SchemaPrincipal): string {
  return `${siteAntigoNutri(schema)}/pacientes/${encodeURIComponent(pacienteId)}/${secao}`;
}
