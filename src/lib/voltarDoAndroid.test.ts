import { describe, expect, it } from "vitest";
import { acaoDoVoltar } from "./voltarDoAndroid";

// hml-29 (B22) — o voltar do Android pergunta "Deseja sair do Physiq?" só na página inicial; nas outras telas volta e, sem
// anterior, vai ao Início.

describe("acaoDoVoltar (hml-29, B22)", () => {
  it("na página inicial pergunta, com ou sem histórico (a raiz do aluno, a entrada e o painel; maiúsculas e barra no fim)", () => {
    for (const caminho of ["/", "/entrar", "/painel", "/painel/", "/Entrar", "/ENTRAR/"]) {
      expect(acaoDoVoltar(caminho, true, false), caminho).toBe("perguntar");
      expect(acaoDoVoltar(caminho, false, false), caminho).toBe("perguntar");
    }
  });

  it("as Boas-vindas são a inicial só de quem ainda não tem nada; aberta por quem já tem algo, ela volta", () => {
    expect(acaoDoVoltar("/boas-vindas", true, true)).toBe("perguntar");
    expect(acaoDoVoltar("/boas-vindas", false, true)).toBe("perguntar");
    expect(acaoDoVoltar("/boas-vindas", true, false)).toBe("voltar");
    expect(acaoDoVoltar("/boas-vindas", false, false)).toBe("ir_ao_inicio");
  });

  it("numa tela interna com histórico volta, sem perguntar", () => {
    for (const caminho of ["/treino", "/dieta", "/perfil", "/perfil/meu-plano", "/entrar/email", "/painel/alunos", "/privacidade"]) {
      expect(acaoDoVoltar(caminho, true, false), caminho).toBe("voltar");
    }
  });

  it("numa tela interna sem histórico (o login trocou a entrada pela página do link) vai ao Início, sem perguntar", () => {
    for (const caminho of ["/dieta", "/perfil/meu-plano", "/painel/alunos", "/entrar/email"]) {
      expect(acaoDoVoltar(caminho, false, false), caminho).toBe("ir_ao_inicio");
    }
  });
});
