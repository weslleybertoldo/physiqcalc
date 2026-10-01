import { describe, expect, it } from "vitest";
import { atalhoWhatsApp, caminhoNoApp, lerResultado, mensagemWhatsApp, oQueMudou, textoDoResultado } from "./regras";

describe('"Salvar e enviar ao aluno" (W17) — WhatsApp', () => {
  it("a mensagem pronta diz o que mudou e leva o link da aba no site do ambiente", () => {
    expect(mensagemWhatsApp("Rafael Moura", ["dieta"], "public")).toBe(
      "Oi, Rafael! Atualizei seu plano alimentar no Physiq. Abra o app para ver: https://physiqcalc.com.br/dieta",
    );
    expect(mensagemWhatsApp("Rafael", ["treino"], "staging")).toBe(
      "Oi, Rafael! Atualizei seu treino no Physiq. Abra o app para ver: https://physiqcalc-staging.vercel.app/treino",
    );
    expect(mensagemWhatsApp("", ["treino", "dieta"], "public")).toBe(
      "Oi! Atualizei seu treino e seu plano alimentar no Physiq. Abra o app para ver: https://physiqcalc.com.br/",
    );
    expect(oQueMudou(["dieta", "treino"])).toBe("seu treino e seu plano alimentar");
    expect(caminhoNoApp(["treino"])).toBe("/treino");
  });

  it("o atalho é wa.me com DDI 55 e a mensagem codificada; sem telefone (ou inválido) não há atalho", () => {
    const url = atalhoWhatsApp("(82) 99999-0000", "Oi, Rafael! Atualizei seu plano alimentar no Physiq.");
    expect(url).toBe(`https://wa.me/5582999990000?text=${encodeURIComponent("Oi, Rafael! Atualizei seu plano alimentar no Physiq.")}`);
    expect(new URL(url!).searchParams.get("text")).toBe("Oi, Rafael! Atualizei seu plano alimentar no Physiq.");
    expect(atalhoWhatsApp("+55 82 99999-0000", "x")).toBe("https://wa.me/5582999990000?text=x");
    expect(atalhoWhatsApp(null, "x")).toBeNull();
    expect(atalhoWhatsApp("", "x")).toBeNull();
    expect(atalhoWhatsApp("1234", "x")).toBeNull();
  });
});

describe('"Salvar e enviar ao aluno" (W17) — o que aparece para quem salvou', () => {
  const r = (o: Partial<Parameters<typeof textoDoResultado>[0]>) => ({ avisado: true, repetido: false, semLogin: false, email: null, ...o });

  it("aviso novo + e-mail enviado (ou na caixa de teste)", () => {
    expect(textoDoResultado(r({ email: { enviado: true, motivo: null, teste: false } }))).toEqual({
      tipo: "sucesso", texto: "Salvo e enviado: o aluno vê no app, com o aviso no sino e por e-mail.",
    });
    expect(textoDoResultado(r({ email: { enviado: true, motivo: null, teste: true } })).texto).toContain("por e-mail (caixa de teste)");
  });

  it("sem e-mail no cadastro → só o sino; e-mail repetido em 10 min; e-mail que falhou vira aviso", () => {
    expect(textoDoResultado(r({ email: { enviado: false, motivo: "sem_email", teste: false } })).texto).toContain("Sem e-mail no cadastro");
    expect(textoDoResultado(r({ email: { enviado: false, motivo: "repetido", teste: false } })).texto).toContain("menos de 10 minutos");
    expect(textoDoResultado(r({ email: { enviado: false, motivo: "falhou", teste: false } })).tipo).toBe("aviso");
    // a função do e-mail não respondeu: só o sino
    expect(textoDoResultado(r({ email: null }))).toEqual({
      tipo: "aviso", texto: "Salvo e enviado: o aluno vê no app, com o aviso no sino. O e-mail não saiu agora; tente de novo.",
    });
  });

  it("2º envio em menos de 10 minutos: o sino e o e-mail não repetem", () => {
    expect(textoDoResultado(r({ avisado: false, repetido: true, email: { enviado: false, motivo: "repetido", teste: false } }))).toEqual({
      tipo: "sucesso", texto: "Salvo. O aluno já tinha o aviso no app e o e-mail (menos de 10 minutos).",
    });
    expect(textoDoResultado(r({ avisado: false, repetido: true, email: { enviado: true, motivo: null, teste: false } })).texto).toBe(
      "Salvo. O aluno já tinha o aviso no app; o e-mail saiu agora.",
    );
  });

  it("aluno sem login: nada vai (nem o e-mail), ele vê ao entrar", () => {
    expect(textoDoResultado(r({ avisado: false, semLogin: true, email: { enviado: false, motivo: "sem_login", teste: false } })).texto).toBe(
      "Salvo. O aluno ainda não tem acesso ao app: ele vê assim que entrar.",
    );
  });

  it("lerResultado traduz a resposta da função (o que não vier vira não)", () => {
    expect(lerResultado({ ok: true, avisado: true, email: { enviado: true, teste: true } })).toEqual({
      avisado: true, repetido: false, semLogin: false, email: { enviado: true, motivo: null, teste: true },
    });
    expect(lerResultado({ ok: true, repetido: true, email: { enviado: false, motivo: "xpto" } }).email).toEqual({ enviado: false, motivo: "falhou", teste: false });
    expect(lerResultado({ ok: true }).email).toBeNull();
  });
});
