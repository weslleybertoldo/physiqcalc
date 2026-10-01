import { describe, expect, it } from "vitest";
import {
  FILTROS, JANELA_FALHAS_DIAS, TOM_STATUS, dataHoraCurta, destinoFormatado, nomeDaLinha, quandoDaMensagem, resumoFalhas, rotuloTipo, textoVazio,
  type ItemFila,
} from "./filaUtil";

const agora = new Date("2026-10-01T15:00:00-03:00");
const item = (over: Partial<ItemFila> = {}): ItemFila => ({
  id: "m1", tipo: "aniversario", status: "enviada", destino: "+5500900000001", texto: "Oi, Ana!", erro: null,
  criado_em: "2026-10-01T12:00:00-03:00", atualizado_em: "2026-10-01T12:01:00-03:00", agendada_para: "2026-10-01T12:00:00-03:00",
  enviada_em: "2026-10-01T12:01:00-03:00", aluno: { id: "a1", nome: "Ana Lima", rota: "a1" }, autor: { id: "u1", nome: "Rafael Lima" },
  minha: true, pode_reenviar: false, ...over,
});

describe("histórico da fila (W22)", () => {
  it("os filtros da spec: pendente (na fila), enviada, falhou — e todas", () => {
    expect(FILTROS.map((f) => f.valor)).toEqual(["todas", "fila", "enviadas", "falhas"]);
    expect(FILTROS.find((f) => f.valor === "falhas")?.rotulo).toBe("Com falha");
  });
  it("a cor do status segue os tons das telas (verde enviada, rosa falhou, ciano na fila)", () => {
    expect(TOM_STATUS.enviada).toBe("n");
    expect(TOM_STATUS.falhou).toBe("r");
    expect(TOM_STATUS.pendente).toBe("c");
    expect(TOM_STATUS.cancelada).toBe("g");
  });
  it("de quem é a linha: o aluno; o teste e o aviso do plano são do próprio profissional", () => {
    expect(nomeDaLinha(item())).toBe("Ana Lima");
    expect(nomeDaLinha(item({ aluno: null, tipo: "teste" }))).toBe("Teste para você");
    expect(nomeDaLinha(item({ aluno: null, tipo: "teste", minha: false }))).toBe("Teste de Rafael");
    expect(nomeDaLinha(item({ aluno: null, tipo: "assinatura_vencendo" }))).toBe("Você");
    expect(rotuloTipo("assinatura_vencendo")).toBe("Aviso do seu plano");
    expect(rotuloTipo("lembrete_consulta")).toBe("Lembrete de consulta");
    expect(rotuloTipo("desconhecido")).toBe("Mensagem");
  });
  it("datas no relógio de São Paulo: hoje, ontem, amanhã e dd/mm", () => {
    expect(dataHoraCurta("2026-10-01T12:01:00-03:00", agora)).toBe("hoje 12:01");
    expect(dataHoraCurta("2026-09-30T23:59:00-03:00", agora)).toBe("ontem 23:59");
    expect(dataHoraCurta("2026-10-02T09:00:00-03:00", agora)).toBe("amanhã 09:00");
    expect(dataHoraCurta("2026-09-12T08:05:00-03:00", agora)).toBe("12/09 08:05");
    // 01:30 UTC do dia 2 ainda é dia 1 em São Paulo
    expect(dataHoraCurta("2026-10-02T01:30:00Z", agora)).toBe("hoje 22:30");
    expect(dataHoraCurta(null, agora)).toBe("");
  });
  it("a coluna do horário diz o que aconteceu", () => {
    expect(quandoDaMensagem(item(), agora)).toBe("Enviada hoje 12:01");
    expect(quandoDaMensagem(item({ status: "falhou", atualizado_em: "2026-09-30T10:00:00-03:00" }), agora)).toBe("Falhou ontem 10:00");
    expect(quandoDaMensagem(item({ status: "pendente", agendada_para: "2026-10-02T09:00:00-03:00" }), agora)).toBe("Sai amanhã 09:00");
    expect(quandoDaMensagem(item({ status: "pendente", agendada_para: "2026-10-01T12:00:00-03:00" }), agora)).toBe("Na fila desde hoje 12:00");
    expect(quandoDaMensagem(item({ status: "enviando" }), agora)).toBe("Enviando agora");
  });
  it("o número de destino formatado (sem número, nada)", () => {
    expect(destinoFormatado("+5581999998888")).toBe("+55 (81) 99999-8888");
    expect(destinoFormatado(null)).toBe("");
  });
});

describe("o número do menu (falhas novas)", () => {
  it(`janela de ${JANELA_FALHAS_DIAS} dias`, () => {
    expect(JANELA_FALHAS_DIAS).toBe(7);
  });
  it("o resumo das falhas", () => {
    expect(resumoFalhas(0)).toBe("Nenhuma falha nova");
    expect(resumoFalhas(1)).toBe("1 falha nos últimos 7 dias");
    expect(resumoFalhas(4)).toBe("4 falhas nos últimos 7 dias");
  });
  it("o vazio de cada filtro fala do que falta", () => {
    expect(textoVazio("falhas", "meus").titulo).toBe("Nenhuma falha nova");
    expect(textoVazio("todas", "conta").texto).toContain("equipe");
    expect(textoVazio("todas", "meus").texto).toContain("você");
  });
});
