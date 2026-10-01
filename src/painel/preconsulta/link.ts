// Physiq W21 — o endereço do link público /f/<slug> que o painel mostra e copia: o site do Physiq do ambiente (produção =
// https://physiqcalc.com.br; staging = https://physiqcalc-staging.vercel.app — o mesmo do link do convite, W5), nunca a origem do APK
// (https://localhost) nem a de um domínio alternativo. No dev local (vite) vale a própria origem, para o teste abrir o /f/ local.
// Os links antigos nutri.physiqcalc.com.br/f/<slug> continuam valendo no site antigo (as mesmas tabelas e RPCs) até a W28.
import { PRINCIPAL_SCHEMA } from "@/integrations/principal/client";
import { siteDoAmbiente } from "@/painel/configuracoes/equipe/regras";
import { urlPublica } from "./preconsultaUtil";

export function origemDoLink(dev: boolean = import.meta.env.DEV, local: string = typeof window !== "undefined" ? window.location.origin : ""): string {
  return dev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(local) ? local : siteDoAmbiente(PRINCIPAL_SCHEMA);
}

export const linkDoFormulario = (slug: string): string => urlPublica(slug, origemDoLink());
