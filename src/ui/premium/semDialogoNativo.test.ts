import { describe, expect, it } from "vitest";
import { arquivosDoApp, lerDoApp, semComentarios } from "@/test/fonte";

// hml-18a (H-40, B) — guarda: nenhum diálogo nativo do navegador no app. window.confirm/alert/prompt congelam o WebView, abrem e
// fecham "seco" e têm o visual do navegador; a confirmação é a do app (useConfirmar, src/ui/premium/Confirmar.tsx). Base = 0 (eram
// 24 window.confirm). O deferredPrompt.prompt() da instalação do PWA é método de objeto (com ponto): fica de fora.

const NATIVO = /(?<![\w$.])(?:window|globalThis|self)\s*\.\s*(confirm|alert|prompt)\b|(?<![\w$.])(confirm|alert|prompt)\s*\(/g;

function dialogosNativos(fonte: string): string[] {
  const limpo = semComentarios(fonte);
  const achados: string[] = [];
  for (const m of limpo.matchAll(NATIVO)) {
    const linha = limpo.slice(0, m.index).split("\n").length;
    achados.push(`${linha}: ${m[0]}`);
  }
  return achados;
}

describe("sem diálogo nativo (hml-18a, H-40)", () => {
  it("nenhum window.confirm/alert/prompt nem confirm(/alert(/prompt( global no src/ — base = 0", () => {
    const achados: string[] = [];
    for (const c of arquivosDoApp()) for (const a of dialogosNativos(lerDoApp(c))) achados.push(`${c}:${a}`);
    expect(achados).toEqual([]);
  });

  it("a guarda lê de verdade: o app usa a confirmação do app (useConfirmar) nos lugares dos 24", () => {
    const usam = arquivosDoApp().filter((c) => /\buseConfirmar\(\)/.test(lerDoApp(c)));
    expect(usam.length).toBeGreaterThanOrEqual(15);
  });

  it.each([
    ['if (!window.confirm("Excluir?")) return;', "window.confirm("],
    ["window.alert('Salvo')", "window.alert"],
    ["const nome = window . prompt('Nome?')", "window.prompt com espaço"],
    ['if (confirm("Excluir?")) apagar();', "confirm( global"],
    ["alert(`Erro: ${e}`);", "alert( global"],
    ["globalThis.confirm('x')", "globalThis.confirm"],
  ])("pega: %s (%s)", (fonte) => {
    expect(dialogosNativos(fonte)).toHaveLength(1);
  });

  it.each([
    ["await deferredPrompt.prompt();", "método prompt() de objeto (instalação do PWA)"],
    ["if (!(await confirmar({ titulo: 'Excluir?', rotuloConfirmar: 'Excluir' }))) return;", "a confirmação do app"],
    ["// antes: window.confirm('Excluir?')", "comentário"],
    ["/* window.alert('x') */", "comentário de bloco"],
    ["const confirmarSenha = 1; minhaConfirm(1); onConfirm()", "nomes parecidos"],
  ])("não pega: %s (%s)", (fonte) => {
    expect(dialogosNativos(fonte)).toEqual([]);
  });
});
