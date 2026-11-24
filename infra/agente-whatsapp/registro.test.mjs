// Physiq bcode-0021 (item 5): o log do agente do WhatsApp sem número de telefone e com prazo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { linhaDoLog, podarLinhas } from "./registro.mjs";

test("o número conectado vira [número]", () => {
  assert.equal(linhaDoLog("conectado public 1a2b3c4d 5582999998888"), "conectado public 1a2b3c4d [número]");
});

test("um JID com quebra de linha vira uma linha só, sem o número", () => {
  const linha = linhaDoLog("ERRO rodada public {\"e\":\"falhou 5582999998888@s.exemplo.invalid\n  tente de novo\"}");
  assert.ok(!linha.includes("\n"));
  assert.ok(!/\d{10,}/.test(linha));
  assert.ok(linha.includes("[número]@s.exemplo.invalid"));
});

test("linha sem número fica igual", () => {
  const linha = "pareamento não concluído staging 12345678 motivo 515 tentativa 3";
  assert.equal(linhaDoLog(linha), linha);
});

test("vazio e nulo não quebram", () => {
  assert.equal(linhaDoLog(undefined), "");
  assert.equal(linhaDoLog(null), "");
});

test("podarLinhas guarda só os últimos dias", () => {
  const agora = Date.parse("2026-11-22T12:00:00.000Z");
  const dia = 86_400_000;
  const velha = `${new Date(agora - 8 * dia).toISOString()} queda public 1a2b3c4d motivo 428`;
  const nova = `${new Date(agora - 6 * dia).toISOString()} sessão restaurada public 1a2b3c4d`;
  const semHora = "agente parou: Error: x";
  const saida = podarLinhas(`${velha}\n${semHora}\n${nova}\n`, agora, 7);
  assert.equal(saida, `${nova}\n`);
});

test("podarLinhas com o log vazio devolve vazio", () => {
  assert.equal(podarLinhas("", Date.now(), 7), "");
});
