// Physiq bcode-0021 (item 8) — a chave do freio em memória das funções do Treino que freiam por IP (treino-leitura, treino-acessos,
// trocar-token e painel-resumo-treino): um código feito a partir do IP, nunca o IP. O IP é o 1º do x-forwarded-for (o do aparelho;
// o resto da lista são os proxies), como antes; sem ele, o balde "sem-ip" de sempre. O código é o SHA-256 do IP com um sal
// aleatório que nasce na 1ª chamada e morre com a instância (não fica em segredo nem em banco) — a mesma receita da chaveDoFreio do
// principal (supabase-principal/functions/_shared/entrar-senha-regras.ts; o Treino não enxerga o _shared de lá).
// É o ÚNICO lugar do Treino que lê o cabeçalho de IP (src/lib/freioSemIp.test.ts confere). PURO: sem Deno, sem rede e sem import —
// o Vitest importa este arquivo (src/treino/freioIp.test.ts).

/** O sal do freio: 16 bytes aleatórios, em hex, só desta instância. */
let salDoFreio: string | null = null;

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** A chave do freio por IP: o código do 1º IP do x-forwarded-for (64 hex); sem o cabeçalho, "sem-ip". */
export async function chaveDoFreio(h: { get(nome: string): string | null }): Promise<string> {
  const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim();
  if (!ip) return "sem-ip";
  if (!salDoFreio) salDoFreio = hex(crypto.getRandomValues(new Uint8Array(16)));
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`physiq-freio:${salDoFreio}:${ip}`));
  return hex(new Uint8Array(d));
}
