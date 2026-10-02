import { PRINCIPAL_SCHEMA, type SchemaPrincipal } from "@/integrations/principal/client";
import { existe } from "@/rotas/registro";

/**
 * O link do diário do aluno (R13 — falha F1), definido NUM LUGAR SÓ:
 *   · até a W24 o /d/<código> que funcionava era o do site antigo do PhysiqNutri; com a página pública do Physiq (W24:
 *     src/publico/Diario.tsx) o link e o redirecionamento do /p/ antigo apontam para ela sozinhos (registro por convenção);
 *   · W28: o site antigo redireciona para o Physiq — os atalhos para as seções dele (secaoNoSiteAntigo) saíram; o endereço dele
 *     fica só como a volta do link do diário se a página pública sair (staging aponta para o staging dele).
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
  /** origem do Physiq (padrão: o site do ambiente — W24) — vale quando o /d/ já é do Physiq */
  origem?: string;
  schema?: SchemaPrincipal;
  temPagina?: () => boolean;
}

/** O site do Physiq do ambiente (o mesmo do link do convite da W5 e do /f/ da W21). */
export const SITE_PHYSIQ: Record<SchemaPrincipal, string> = {
  public: "https://physiqcalc.com.br",
  staging: "https://physiqcalc-staging.vercel.app",
};

/**
 * W24: a origem do link do diário no Physiq é o SITE do ambiente — nunca a origem do APK (https://localhost) nem a de um domínio
 * alternativo; no dev local (vite em localhost) vale a própria origem, para o teste abrir o /d/ local.
 */
export function origemDoDiario(schema: SchemaPrincipal = PRINCIPAL_SCHEMA, dev: boolean = import.meta.env.DEV,
  local: string = typeof window !== "undefined" ? window.location.origin : ""): string {
  return dev && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(local) ? local : SITE_PHYSIQ[schema] ?? SITE_PHYSIQ.public;
}

/** O link do diário do aluno: https://<Physiq ou site antigo>/d/<código>. */
export function enderecoDoDiario(codigo: string, opcoes: OpcoesDiario = {}): string {
  const c = normalizarCodigoDiario(codigo);
  if (diarioNoPhysiq(opcoes.temPagina)) {
    const origem = opcoes.origem ?? origemDoDiario(opcoes.schema);
    return `${origem}/d/${c}`;
  }
  return `${siteAntigoNutri(opcoes.schema)}/d/${c}`;
}
