import { describe, expect, it } from "vitest";
import {
  assuntoDoEnvio, caminhoDoEnvio, criarFreio, destinoDoEnvio, htmlDoEnvio, linkDoEnvio, modulosDoEnvio, oQueMudou, statusDoErroEnvio,
  textoDoEnvio,
} from "../../../../supabase-principal/functions/_shared/enviar-aluno-regras";

describe("função aluno-enviar (W17) — regras do e-mail ao aluno", () => {
  it("STAGING manda SEMPRE para a caixa de teste do Resend, mesmo com e-mail real no cadastro", () => {
    expect(destinoDoEnvio("staging", "fulano@gmail.com")).toEqual({ para: "delivered@resend.dev", teste: true });
    expect(destinoDoEnvio("staging", "w17.aluno.teste.claude@physiqnutri.app")).toEqual({ para: "delivered@resend.dev", teste: true });
  });

  it("produção: conta de teste vai para a caixa de teste; pessoa real recebe no próprio e-mail", () => {
    expect(destinoDoEnvio("public", "w17.aluno.teste.claude@physiqnutri.app")).toEqual({ para: "delivered@resend.dev", teste: true });
    expect(destinoDoEnvio("public", "Fulano@Gmail.com")).toEqual({ para: "fulano@gmail.com", teste: false });
  });

  it('assunto curto: "Seu plano alimentar foi atualizado por <nutri>"; teste diz para quem era', () => {
    const d = { email: "a@b.com", aluno: "Rafael Moura", quem: "Camila Rocha", modulos: ["dieta"] as const, link: "https://physiqcalc.com.br/dieta" };
    expect(assuntoDoEnvio(d)).toBe("Seu plano alimentar foi atualizado por Camila Rocha");
    expect(assuntoDoEnvio({ ...d, modulos: ["treino"] })).toBe("Seu treino foi atualizado por Camila Rocha");
    expect(assuntoDoEnvio({ ...d, modulos: ["treino", "dieta"] })).toBe("Seu treino e seu plano alimentar foram atualizados por Camila Rocha");
    expect(assuntoDoEnvio({ ...d, paraTeste: "a@b.com" })).toBe("[teste → a@b.com] Seu plano alimentar foi atualizado por Camila Rocha");
    expect(assuntoDoEnvio({ ...d, quem: " " })).toBe("Seu plano alimentar foi atualizado por seu profissional");
  });

  it("o corpo leva o botão para a aba do app, escapa o HTML e tem a versão em texto", () => {
    const d = { email: "a@b.com", aluno: "Ana <b>Lima</b>", quem: "Camila & Cia", modulos: ["dieta"] as const, link: "https://physiqcalc.com.br/dieta" };
    const html = htmlDoEnvio(d);
    expect(html).toContain('href="https://physiqcalc.com.br/dieta"');
    expect(html).toContain("Ver minha dieta");
    expect(html).toContain("Camila &amp; Cia");
    expect(html).not.toContain("<b>Lima</b>");
    expect(textoDoEnvio(d)).toContain("Camila & Cia atualizou seu plano alimentar no Physiq");
    expect(textoDoEnvio(d)).toContain("https://physiqcalc.com.br/dieta");
  });

  it("link do botão = site do ambiente + só as abas do aviso", () => {
    expect(linkDoEnvio("staging", "https://physiqcalc.com.br", "/dieta")).toBe("https://physiqcalc-staging.vercel.app/dieta");
    expect(linkDoEnvio("public", "https://physiqcalc.com.br/", "/treino")).toBe("https://physiqcalc.com.br/treino");
    expect(linkDoEnvio("public", null, "/")).toBe("https://physiqcalc.com.br/");
    expect(caminhoDoEnvio("https://malicioso.com")).toBe("/");
    expect(modulosDoEnvio(["dieta", "xpto", "treino"])).toEqual(["treino", "dieta"]);
    expect(modulosDoEnvio("dieta")).toEqual([]);
    expect(oQueMudou(["treino"])).toBe("seu treino");
  });

  it("freio por pessoa e status dos erros", () => {
    const freio = criarFreio(2, 1000);
    expect(freio("x", 0)).toBe(true);
    expect(freio("x", 10)).toBe(true);
    expect(freio("x", 20)).toBe(false);
    expect(freio("x", 1500)).toBe(true);
    expect(statusDoErroEnvio("sem_acesso")).toBe(403);
    expect(statusDoErroEnvio("sem_modulo")).toBe(400);
    expect(statusDoErroEnvio("muitos_envios")).toBe(429);
  });
});
