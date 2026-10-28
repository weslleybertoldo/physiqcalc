import { describe, expect, it } from "vitest";
import { voltarPedeSaida } from "./voltarDoAndroid";

// hml-29 (B22) — o voltar do Android pergunta "Deseja sair do Physiq?" na página inicial (ou sem histórico); nas outras telas, volta.

describe("voltarPedeSaida (hml-29, B22)", () => {
  it("na página inicial pergunta, mesmo com histórico (a raiz do aluno, a entrada, as Boas-vindas e o painel)", () => {
    for (const caminho of ["/", "/entrar", "/boas-vindas", "/painel", "/painel/", "/entrar/"]) {
      expect(voltarPedeSaida(caminho, true), caminho).toBe(true);
    }
  });

  it("numa tela interna com histórico volta, sem perguntar", () => {
    for (const caminho of ["/treino", "/dieta", "/perfil", "/perfil/meu-plano", "/entrar/email", "/painel/alunos", "/privacidade"]) {
      expect(voltarPedeSaida(caminho, true), caminho).toBe(false);
    }
  });

  it("sem histórico pergunta em qualquer tela (o voltar ali fecharia o app)", () => {
    for (const caminho of ["/", "/treino", "/perfil/meu-plano", "/painel/alunos"]) {
      expect(voltarPedeSaida(caminho, false), caminho).toBe(true);
    }
  });
});
