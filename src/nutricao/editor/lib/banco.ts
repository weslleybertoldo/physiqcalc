// Physiq W16 — o cliente das telas portadas do PhysiqNutri: o BANCO PRINCIPAL (Supabase do Nutri, atrás de
// api-principal.physiqcalc.com.br). As libs do site antigo chamavam `supabase` do projeto do Nutri; aqui é o mesmo banco,
// com o schema do ambiente (VITE_PRINCIPAL_SCHEMA). O cliente do Treino (src/integrations/supabase) não entra na nutrição.
export { principal as supabase } from "@/integrations/principal/client";
export type { Database, Json } from "@/integrations/principal/types";
