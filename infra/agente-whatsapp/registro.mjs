// Physiq bcode-0021 (item 5): o log do agente no Moto G7 não guarda número de telefone e só fica alguns dias.
// Puro, sem import: o agente.js usa e o registro.test.mjs testa (node --test, entra no `npm run test:node`).

/** A linha que vai pro log: uma linha só, com toda sequência de 10 ou mais algarismos (telefone, JID) trocada por [número]. */
export function linhaDoLog(texto) {
  return String(texto ?? "").replace(/\s+/g, " ").trim().replace(/\d{10,}/g, "[número]");
}

/**
 * O conteúdo do log só com as linhas dos últimos `dias` dias, pela hora ISO do começo de cada linha (a que o agente grava).
 * Linha sem hora legível sai junto.
 */
export function podarLinhas(conteudo, agoraMs, dias) {
  const limite = agoraMs - dias * 86_400_000;
  return String(conteudo ?? "")
    .split("\n")
    .filter((linha) => {
      const quando = Date.parse(linha.slice(0, 24));
      return Number.isFinite(quando) && quando >= limite;
    })
    .map((linha) => `${linha}\n`)
    .join("");
}
