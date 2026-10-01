import { describe, expect, it } from "vitest";
import {
  assuntoDoEnvio, caminhoDoEnvio, criarFreio, destinoDoEnvio, htmlDoEnvio, linkDoEnvio, modeloDoEnvio, modulosDoEnvio, oQueMudou,
  statusDoErroEnvio, textoDoEnvio,
} from "../../../../supabase-principal/functions/_shared/enviar-aluno-regras";
import { IMAGENS_EMAIL } from "../../../../supabase-principal/functions/_shared/email-modelo";

/** Os textos e links dos botões do HTML (o primário e os secundários). */
const botoes = (html: string) => [...html.matchAll(/<a href="([^"]*)" style="display:block;[^"]*">([^<]*)<\/a>/g)].map((m) => `${m[2]} → ${m[1]}`);

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

  it("molde C (H3): treino e dieta = os 2 ícones, as 2 linhas + Por e os botões Abrir o Physiq / Ver meu treino / Ver minha dieta", () => {
    const d = { email: "a@b.com", aluno: "Rafael Moura", quem: "Lucas Ferreira", modulos: ["treino", "dieta"] as const, link: "https://physiqcalc.com.br/" };
    const m = modeloDoEnvio(d);
    expect(m.rotulo).toBe("Plano atualizado");
    expect(m.destaques).toEqual([{ visual: { tipo: "icones", icones: ["halterGrande", "saladaVerdeGrande"] }, olho: "O que mudou", titulo: "Treino e dieta", sub: "atualizados por Lucas Ferreira" }]);
    expect(m.linhas.map((l) => [l.icone ?? l.iniciais, l.rotulo, l.valor])).toEqual([
      ["halter", "Treino", "Atualizado · aba Treino do app"], ["saladaVerde", "Plano alimentar", "Atualizado · aba Dieta do app"], ["LF", "Por", "Lucas Ferreira"],
    ]);
    expect(m.preheader).toBe("Lucas Ferreira atualizou seu treino e seu plano alimentar no Physiq. Abra o app para ver o que mudou.");
    const html = htmlDoEnvio(d);
    expect(botoes(html)).toEqual([
      "Abrir o Physiq → https://physiqcalc.com.br/", "Ver meu treino → https://physiqcalc.com.br/treino", "Ver minha dieta → https://physiqcalc.com.br/dieta",
    ]);
    expect(html).toContain("Olá, Rafael! <strong");
    expect(html).toContain(">Lucas Ferreira</strong> atualizou seu treino e seu plano alimentar no Physiq. Abra o app para ver o que mudou.");
    expect(html).toContain("Os botões abrem o app. Se não abrir, use o link:");
    expect(html).toContain(">physiqcalc.com.br</a></p>");
    expect(html).toContain("Você recebeu este e-mail porque é aluno de Lucas Ferreira no Physiq.");
    expect(html).toContain(`${IMAGENS_EMAIL}/halter-violeta-26.png`);
    expect(html).not.toMatch(/<svg/i);
  });

  it("molde C (H3): um módulo só = 1 ícone, 1 linha e só o botão dele; staging aponta o site do staging", () => {
    const treino = { email: "a@b.com", aluno: "", quem: "Bruno Lima", modulos: ["treino"] as const, link: "https://physiqcalc-staging.vercel.app/treino" };
    const m = modeloDoEnvio(treino);
    expect(m.destaques![0]).toMatchObject({ visual: { tipo: "icones", icones: ["halterGrande"] }, titulo: "Treino", sub: "atualizado por Bruno Lima" });
    expect(m.linhas.map((l) => l.rotulo)).toEqual(["Treino", "Por"]);
    const html = htmlDoEnvio(treino);
    expect(botoes(html)).toEqual(["Ver meu treino → https://physiqcalc-staging.vercel.app/treino"]);
    expect(html).toContain("O botão abre o app. Se não abrir, use o link:");
    expect(html).toContain(">physiqcalc-staging.vercel.app/treino</a>");
    expect(html).toContain("Olá! <strong"); // sem o nome do aluno
    const dieta = modeloDoEnvio({ ...treino, modulos: ["dieta"], link: "https://physiqcalc.com.br/dieta" });
    expect(dieta.destaques![0]).toMatchObject({ visual: { icones: ["saladaVerdeGrande"] }, titulo: "Plano alimentar" });
    expect(dieta.linhas.map((l) => l.rotulo)).toEqual(["Plano alimentar", "Por"]);
    expect(dieta.secundarios).toEqual([]);
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
