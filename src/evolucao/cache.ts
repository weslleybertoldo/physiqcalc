/**
 * Sem internet, a Evolução mostra o que já foi aberto (spec 4.3 e 7.5). O que veio dos 2 bancos na última abertura fica no
 * aparelho, por pessoa, no Cache Storage do navegador — num cache cujo nome contém "supabase-api-cache" DE PROPÓSITO: o
 * `sair()` da sessão (src/nucleo/sessao.tsx) apaga esses caches, então nada da pessoa fica no aparelho depois de sair.
 * Sem Cache Storage (navegador antigo, página fora de https), não guarda: a aba volta a buscar e, sem internet, avisa.
 */
import type { ParteTreino, PartePrincipal } from "./tipos";

export const NOME_CACHE = "supabase-api-cache-evolucao";
const VERSAO = 1;

export interface CacheEvolucao {
  versao: number;
  uid: string;
  salvoEm: string;
  treino: ParteTreino | null;
  principal: PartePrincipal | null;
}

function chave(uid: string): string {
  return `/__physiq/evolucao/${encodeURIComponent(uid)}`;
}

function disponivel(): boolean {
  return typeof caches !== "undefined" && typeof Request !== "undefined" && typeof Response !== "undefined";
}

export async function lerCache(uid: string | null | undefined): Promise<CacheEvolucao | null> {
  if (!uid || !disponivel()) return null;
  try {
    const cache = await caches.open(NOME_CACHE);
    const r = await cache.match(new Request(chave(uid)));
    if (!r) return null;
    const d = (await r.json()) as CacheEvolucao;
    return d && d.versao === VERSAO && d.uid === uid ? d : null;
  } catch {
    return null;
  }
}

export async function guardarCache(uid: string, dados: Omit<CacheEvolucao, "versao" | "uid" | "salvoEm">): Promise<void> {
  if (!disponivel()) return;
  try {
    const cache = await caches.open(NOME_CACHE);
    const corpo: CacheEvolucao = { versao: VERSAO, uid, salvoEm: new Date().toISOString(), ...dados };
    await cache.put(new Request(chave(uid)), new Response(JSON.stringify(corpo), { headers: { "Content-Type": "application/json" } }));
  } catch {
    /* sem espaço ou sem permissão: na próxima abertura busca de novo */
  }
}
