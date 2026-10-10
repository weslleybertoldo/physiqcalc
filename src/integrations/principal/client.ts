// Physiq W2 — 2º cliente supabase-js: o BANCO PRINCIPAL (Supabase hkxvtsbwctxkrqzkkdoz, o do Nutri), atrás do domínio
// próprio https://api-principal.physiqcalc.com.br (Worker physiq-principal-api — spec §7.2/§7.3). Guarda a conta, a equipe,
// os planos, a cobrança, os módulos comuns e a nutrição; é onde a pessoa faz o login único (spec §7.4).
// O Banco do Treino continua no cliente de src/integrations/supabase/client.ts (PowerSync/offline).
//
// Ninguém usa ainda (a W3 liga o login). Variáveis (spec 7.8): VITE_PRINCIPAL_URL, VITE_PRINCIPAL_ANON_KEY e
// VITE_PRINCIPAL_SCHEMA (sem ela vale o VITE_DB_SCHEMA — no local e no staging é "staging"; em produção "public").
//
// Sessão guardada numa chave PRÓPRIA do localStorage (não se mistura com a do Treino) e login OAuth em PKCE: a volta do
// Google traz ?code= e só este cliente (que guardou o code_verifier) troca pela sessão — o cliente do Treino, em fluxo
// implícito, ignora o retorno. Sem internet, o principal não tem cache (dieta e painel são online — decisão 9A).
import { createClient } from "@supabase/supabase-js";
import { criarFetchResiliente, TENTATIVAS_LEITURA } from "../repeticao";
import type { Database } from "./types";

type Env = Record<string, string | boolean | undefined>;
export type SchemaPrincipal = "public" | "staging";

const SCHEMAS: SchemaPrincipal[] = ["public", "staging"];

/** Schema do principal: VITE_PRINCIPAL_SCHEMA, senão o VITE_DB_SCHEMA do Treino, senão "public". Valor inválido é ignorado. */
export function resolverSchemaPrincipal(env: Env): SchemaPrincipal {
  for (const chave of ["VITE_PRINCIPAL_SCHEMA", "VITE_DB_SCHEMA"]) {
    const valor = String(env[chave] ?? "").trim().toLowerCase();
    if ((SCHEMAS as string[]).includes(valor)) return valor as SchemaPrincipal;
  }
  return "public";
}

/** Chave do localStorage da sessão do principal (a do Treino é a padrão do supabase-js, sb-<host>-auth-token). */
export const PRINCIPAL_STORAGE_KEY = "physiq-principal-auth";

const ENV = import.meta.env as Env;
const URL_PRINCIPAL = String(ENV.VITE_PRINCIPAL_URL ?? "").trim();
const ANON_PRINCIPAL = String(ENV.VITE_PRINCIPAL_ANON_KEY ?? "").trim();

export const PRINCIPAL_URL = URL_PRINCIPAL;
/** Chave pública (anon) do principal — a função entrar-senha (W8b) é chamada com fetch próprio, sem a sessão. */
export const PRINCIPAL_ANON = ANON_PRINCIPAL;
export const PRINCIPAL_SCHEMA: SchemaPrincipal = resolverSchemaPrincipal(ENV);
/** false = build sem as variáveis do principal (a tela deve mostrar "Parte do app está fora do ar", nunca quebrar). */
export const principalConfigurado = Boolean(URL_PRINCIPAL && ANON_PRINCIPAL);

// Sem as variáveis, o cliente nasce apontando pra um endereço inválido: nada quebra ao importar e cada chamada falha
// com erro de rede (a tela trata). Nunca cai no banco do Treino por engano.
// Fetch com timeout e nova tentativa (o mesmo do cliente do Treino) — hml-06 (H-20): só o que é leitura repete
// (src/integrations/repeticao.ts); POST de tabela, RPC que grava, função, auth e upload vão uma vez só. hml-17 (H-53): 1 nova
// tentativa na leitura (TENTATIVAS_LEITURA; eram 2).
export const principal = createClient<Database>(
  URL_PRINCIPAL || "https://principal-nao-configurado.invalid",
  ANON_PRINCIPAL || "principal-nao-configurado",
  {
    global: {
      fetch: criarFetchResiliente(TENTATIVAS_LEITURA, 15000, undefined, { banco: "principal" }),
      headers: { "x-schema": PRINCIPAL_SCHEMA },
    },
    db: { schema: PRINCIPAL_SCHEMA as "public" },
    auth: {
      storage: typeof localStorage !== "undefined" ? localStorage : undefined,
      storageKey: PRINCIPAL_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  },
);
