// Physiq hml-16c (H-51) — o segredo entre os servidores, 1 por finalidade (8 no total: spec hml-16b §2.1). Quem MANDA guarda o
// valor (SEGREDO_X); quem RECEBE guarda só o sha256 dele, numa lista de até 2 (SEGREDO_X_ACEITOS = "h1" ou "h1,h2": o atual e,
// durante uma troca, o anterior) — quem lê o ambiente de um projeto leva só o que aquele projeto MANDA. O cabeçalho continua
// x-espelho-segredo (a presença dele escolhe o modo servidor em 4 funções).
//
// É o único caminho: o segredo único de antes (o mesmo valor para todos os canais) saiu na hml-16c e não tem reserva. Emissor
// sem SEGREDO_X não manda nada (o sem_configuracao / nao_configurada de sempre); receptor sem a lista recusa tudo (falha
// fechada). Trocar um segredo (gerar → aceitar → trocar → conferir → aceitar --so-atual): scripts/segredos/servidor.py.
//
// CÓPIA IDÊNTICA em supabase/functions/_shared/segredo-servidor.ts (Treino) e supabase-principal/functions/_shared/
// segredo-servidor.ts (principal): cada banco publica só o _shared dele. src/lib/segredoServidor.test.ts confere byte a byte.
// Mudou aqui? Copie para lá.
//
// Uso (o nome é sempre o do segredo do EMISSOR; a lista do receptor é `${nome}_ACEITOS`):
//   emissor   const segredo = segredoParaEnviar("SEGREDO_ESPELHO_RESUMO");   // "" = sem configuração (o emissor para)
//   receptor  const via = await segredoAceito(req.headers.get("x-espelho-segredo"), "SEGREDO_ESPELHO_RESUMO");
//             if (!via) return json({ error: "segredo_invalido" }, 401);
//             log.info({ codigo: "segredo_aceito", acao: "espelho_resumo", resultado: via });   // nunca o valor nem o hash
// Sem import de URL e sem o global do Deno no topo: o ambiente é lido na hora (o Vitest importa este arquivo e injeta o leitor).

/** Quem lê uma variável do ambiente (o padrão é o da função; o Vitest passa um falso). */
export type LerAmbiente = (nome: string) => string | undefined;

/** Como o receptor aceitou: pela lista de hashes (o segredo da finalidade) — o único jeito; vai no log segredo_aceito. */
export type ViaSegredo = "lista";

/** Tamanho mínimo de um segredo: o recebido e o SEGREDO_X (menor = como se não existisse; recebido menor = recusa). */
export const MIN_SEGREDO = 32;

/** A lista guarda até 2 hashes: o atual e o anterior (durante a troca). */
const MAX_ACEITOS = 2;
const HEX_64 = /^[0-9a-f]{64}$/;

type ComDeno = { Deno?: { env: { get: (nome: string) => string | undefined } } };

/** O leitor de sempre: o ambiente da função, na hora (pelo globalThis: o tsc do app não conhece o Deno). Fora do Deno, nada. */
function lerDaFuncao(nome: string): string | undefined {
  return (globalThis as ComDeno).Deno?.env.get(nome);
}

/** A variável como texto; leitor que falha = sem a variável. */
function variavel(nome: string, ler: LerAmbiente): string {
  try {
    const valor = ler(nome);
    return typeof valor === "string" ? valor : "";
  } catch {
    return "";
  }
}

/** O valor que serve de segredo: com MIN_SEGREDO caracteres ou mais; menor (ou ausente) = "". */
function segredoDe(nome: string, ler: LerAmbiente): string {
  const valor = variavel(nome, ler);
  return valor.length >= MIN_SEGREDO ? valor : "";
}

/** Os hashes da lista: separados por vírgula; tolera espaço e maiúscula; ignora o que não é hex de 64; só os 2 primeiros
 *  válidos. */
function hashesAceitos(lista: string): string[] {
  return lista
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => HEX_64.test(item))
    .slice(0, MAX_ACEITOS);
}

/** Igual em tempo constante: percorre sempre o maior dos 2 (tamanho diferente também conta como diferença). */
function iguais(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  const n = Math.max(x.length, y.length);
  let diferenca = x.length ^ y.length;
  for (let i = 0; i < n; i++) diferenca |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diferenca === 0;
}

/** sha256 do texto (UTF-8), em hex minúsculo (64 caracteres). */
export async function hashHex(texto: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Emissor: o valor de SEGREDO_X (≥ MIN_SEGREDO); sem ele (ou menor), "" — o emissor para com o sem_configuracao /
 * nao_configurada de sempre.
 */
export function segredoParaEnviar(nome: string, ler: LerAmbiente = lerDaFuncao): string {
  return segredoDe(nome, ler);
}

/**
 * Receptor: "lista" se o sha256 do recebido está em `${nome}_ACEITOS`; null = recusa — recebido ausente ou menor que
 * MIN_SEGREDO, lista vazia ou inválida, nada bate. Comparação em tempo constante (a lista inteira é comparada). Nunca lança:
 * qualquer falha recusa (falha fechada).
 */
export async function segredoAceito(
  recebido: string | null | undefined,
  nome: string,
  ler: LerAmbiente = lerDaFuncao,
): Promise<ViaSegredo | null> {
  try {
    const valor = typeof recebido === "string" ? recebido : "";
    if (valor.length < MIN_SEGREDO) return null;
    const aceitos = hashesAceitos(variavel(`${nome}_ACEITOS`, ler));
    if (!aceitos.length) return null;
    const hash = await hashHex(valor);
    let bate = false;
    for (const aceito of aceitos) bate = iguais(hash, aceito) || bate;
    return bate ? "lista" : null;
  } catch {
    return null;
  }
}
