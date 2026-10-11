// O tsc do app não resolve import de URL (o das funções Deno). O servidor.test.ts lê o tipo Matricula do
// supabase-principal/functions/_shared/financeiro-mp.ts, que importa o cliente do Supabase pelo esm.sh: aqui o mesmo módulo com o
// tipo do pacote npm do app (quem confere a função contra o supabase-js da versão dela é o deno check).
declare module "https://esm.sh/@supabase/supabase-js@2.39.0" {
  export type { SupabaseClient } from "@supabase/supabase-js";
}
