import { createClient } from '@supabase/supabase-js';
import { criarFetchResiliente, TENTATIVAS_LEITURA } from '../repeticao';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Schema do ambiente: "public" (prod) ou "staging". Dirige PostgREST, edge functions (x-schema)
// e as escritas do PowerSync (uploadData usa supabase.from → respeita db.schema).
export const DB_SCHEMA = (import.meta.env.VITE_DB_SCHEMA as string) || "public";

// Fetch com timeout e nova tentativa — hml-06 (H-20): só o que é leitura repete (src/integrations/repeticao.ts, a mesma regra
// do cliente do principal); POST de tabela, RPC que grava, função, auth e upload vão uma vez só. hml-17 (H-53): 1 nova tentativa
// na leitura (TENTATIVAS_LEITURA; eram 2).
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  global: {
    fetch: criarFetchResiliente(TENTATIVAS_LEITURA, 15000, undefined, { banco: "treino" }),
    headers: { "x-schema": DB_SCHEMA },
  },
  db: { schema: DB_SCHEMA as "public" },
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
