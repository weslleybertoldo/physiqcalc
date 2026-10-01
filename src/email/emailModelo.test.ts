import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ICONES_EMAIL, IMAGENS_EMAIL, escaparHtml, iniciaisDe, linkSemProtocolo, montarEmail, textoDaReserva, urlDoIcone, type EmailModelo,
} from "../../supabase-principal/functions/_shared/email-modelo";

const base: EmailModelo = {
  titulo: "Confirme sua consulta",
  preheader: "Weslley Bertoldo marcou uma consulta de nutrição para quinta, 1 de outubro, às 13:30. Confirme pelo app.",
  rotulo: "Convite de consulta",
  destaques: [{ visual: { tipo: "calendario", semana: "Qui", dia: "1", mes: "Out" }, olho: "Consulta de nutrição", titulo: "13:30", sub: "até 14:00 · 30 min" }],
  saudacao: ["Olá, Weslley! ", { forte: "Weslley Bertoldo" }, " marcou esta consulta para você."],
  linhas: [
    { icone: "calendario", rotulo: "Quando", valor: "Quinta, 1 de outubro · 13:30" },
    { icone: "relogio", rotulo: "Duração", valor: "30 minutos" },
    { iniciais: "WB", rotulo: "Com", valor: "Weslley Bertoldo" },
  ],
  primario: { texto: "Confirmar presença", href: "https://physiqcalc.com.br/perfil/agenda" },
  secundarios: [{ texto: "Reagendar", href: "https://physiqcalc.com.br/perfil/agenda" }, { texto: "Ver minha agenda", href: "https://physiqcalc.com.br/perfil/agenda" }],
  reserva: { texto: "Os botões abrem o app. Se não abrir, use o link:", href: "https://physiqcalc.com.br/perfil/agenda" },
  rodape: "Você recebeu este e-mail porque é aluno de Weslley Bertoldo no Physiq.",
  site: "https://physiqcalc.com.br",
};

/** Os <a> do HTML: texto e href. */
function links(html: string): { texto: string; href: string }[] {
  return [...html.matchAll(/<a href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map((m) => ({ href: m[1], texto: m[2] }));
}

describe("molde dos e-mails (H3 — Opção C)", () => {
  it("estrutura: HTML completo de e-mail, tabelas de apresentação, cartão de 560 px (nada passa de 600), sem JS e sem SVG", () => {
    const html = montarEmail(base);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="pt-BR">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain("<title>Confirme sua consulta</title>");
    expect(html).toContain("max-width:560px");
    const larguras = [...html.matchAll(/(?:max-width:|width=")(\d+)/g)].map((m) => Number(m[1]));
    expect(Math.max(...larguras)).toBeLessThanOrEqual(600);
    expect(html).not.toMatch(/<svg/i);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\son[a-z]+=/i); // nenhum onclick/onload…
    expect(html).not.toMatch(/class="/); // CSS só inline
    // o único <style> é o da Geist (o Gmail ignora; o Apple Mail usa)
    expect([...html.matchAll(/<style>/g)]).toHaveLength(1);
    expect(html).toMatch(/<style>\s*@font-face\{font-family:'Geist'[^}]*\}\s*<\/style>/);
    // toda tabela é de apresentação
    const tabelas = [...html.matchAll(/<table\b[^>]*>/g)].map((m) => m[0]);
    expect(tabelas.length).toBeGreaterThan(5);
    for (const t of tabelas) expect(t).toContain('role="presentation"');
  });

  it("topo: a logo (PNG do bucket público), o nome Physiq e o rótulo; o destaque com a folhinha do calendário", () => {
    const html = montarEmail(base);
    expect(html).toContain(`<img src="${IMAGENS_EMAIL}/logo-physiq.png" width="26" height="26"`);
    expect(html).toContain(">Physiq</td>");
    expect(html).toContain(">Convite de consulta</td>");
    expect(html).toContain(">Qui</td>");
    expect(html).toContain(">13:30</p>");
    expect(html).toContain(">até 14:00 · 30 min</p>");
    expect(IMAGENS_EMAIL).toBe("https://api-principal.physiqcalc.com.br/storage/v1/object/public/email/v1");
  });

  it("todos os ícones são PNG do bucket e existem no repo (supabase-principal/email/v1, o que o script publica)", () => {
    const noRepo = new Set(readdirSync(join(__dirname, "../../supabase-principal/email/v1")));
    for (const [nome, arquivo] of Object.entries(ICONES_EMAIL)) {
      expect(arquivo, nome).toMatch(/^[a-z0-9-]+\.png$/);
      expect(noRepo.has(arquivo), arquivo).toBe(true);
      expect(urlDoIcone(nome as keyof typeof ICONES_EMAIL)).toBe(`${IMAGENS_EMAIL}/${arquivo}`);
    }
    const html = montarEmail(base);
    const imagens = [...html.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1]);
    expect(imagens.length).toBe(3); // logo + 2 ícones de linha (a 3ª linha é o avatar com as iniciais)
    for (const src of imagens) expect(src.startsWith(`${IMAGENS_EMAIL}/`)).toBe(true);
  });

  it("texto de prévia escondido logo no começo do corpo, com o recheio invisível", () => {
    const html = montarEmail(base);
    const corpo = html.slice(html.indexOf("<body"));
    const previa = corpo.match(/<div style="display:none;[^"]*">([^<]*)<\/div>/);
    expect(previa).not.toBeNull();
    expect(previa![1].startsWith("Weslley Bertoldo marcou uma consulta de nutrição")).toBe(true);
    expect(previa![1]).toContain("&#8199;&#847;".repeat(30));
    expect(corpo.indexOf("display:none")).toBeLessThan(corpo.indexOf("<table"));
  });

  it("escapa TODO texto que vem de fora (saudação, linhas, rótulo, botões, destaque, rodapé, prévia)", () => {
    const x = '<b onmouseover="alert(1)">Ana & "Cia"</b>';
    const html = montarEmail({
      ...base,
      titulo: x, preheader: x, rotulo: x, rodape: x,
      destaques: [{ visual: { tipo: "pessoa", iniciais: "<i>" }, olho: x, titulo: x, sub: x }],
      saudacao: [x, { forte: x }],
      linhas: [{ icone: "email", rotulo: x, valor: x, href: "mailto:a@b.com", nota: x }, { iniciais: "<s>", rotulo: x, valor: x }],
      primario: { texto: x, href: "https://physiqcalc.com.br/" },
      secundarios: [{ texto: x, href: "https://physiqcalc.com.br/" }],
      reserva: { texto: x, href: "https://physiqcalc.com.br/" },
    });
    expect(html).not.toContain("<b onmouseover");
    expect(html).not.toContain("<i>");
    expect(html).not.toContain("<s>");
    expect(html).toContain("&lt;b onmouseover=&quot;alert(1)&quot;&gt;Ana &amp; &quot;Cia&quot;&lt;/b&gt;");
    expect(escaparHtml(`"a"&'b'<c>`)).toBe("&quot;a&quot;&amp;&#39;b&#39;&lt;c&gt;");
  });

  it("link só https/http/mailto: javascript:, data: e lixo viram o site", () => {
    const html = montarEmail({
      ...base,
      primario: { texto: "A", href: "javascript:alert(1)" },
      secundarios: [{ texto: "B", href: "data:text/html,oi" }],
      reserva: { texto: "C", href: "  " },
      linhas: [{ icone: "email", rotulo: "E-mail", valor: "a@b.com", href: "mailto:a@b.com" }],
    });
    expect(html).not.toMatch(/javascript:|data:text/);
    const ls = links(html);
    expect(ls.find((l) => l.texto === "A")?.href).toBe("https://physiqcalc.com.br");
    expect(ls.find((l) => l.texto === "B")?.href).toBe("https://physiqcalc.com.br");
    expect(ls.find((l) => l.texto === "a@b.com")?.href).toBe("mailto:a@b.com");
  });

  it("botões: o primário roxo sempre; os secundários lado a lado (2), largura toda (1) ou nenhum", () => {
    const dois = montarEmail(base);
    expect(dois).toContain('bgcolor="#6D28D9"');
    expect(dois).toContain(">Confirmar presença</a>");
    expect(dois).toContain(">Reagendar</a>");
    expect(dois).toContain(">Ver minha agenda</a>");
    expect([...dois.matchAll(/<td width="50%"/g)]).toHaveLength(2);
    const um = montarEmail({ ...base, secundarios: [{ texto: "Reagendar", href: base.primario.href }] });
    expect(um).toContain(">Reagendar</a>");
    expect(um).not.toContain('<td width="50%"');
    const nenhum = montarEmail({ ...base, secundarios: [] });
    expect(nenhum).not.toContain("border:1px solid #DDD6FE;border-radius:14px");
    expect(nenhum).toContain(">Confirmar presença</a>");
    const tres = montarEmail({ ...base, secundarios: [...base.secundarios!, { texto: "Terceiro", href: base.primario.href }] });
    expect(tres).not.toContain("Terceiro"); // no máximo 2
  });

  it("link de reserva e rodapé: o endereço sem https://, o site do ambiente", () => {
    const html = montarEmail(base);
    expect(html).toContain('Os botões abrem o app. Se não abrir, use o link:<br><a href="https://physiqcalc.com.br/perfil/agenda" style="color:#52525B;text-decoration:underline">physiqcalc.com.br/perfil/agenda</a>');
    expect(html).toContain('Você recebeu este e-mail porque é aluno de Weslley Bertoldo no Physiq.<br><span style="font-weight:600;color:#52525B">Physiq</span> · <a href="https://physiqcalc.com.br" style="color:#A1A1AA;text-decoration:none">physiqcalc.com.br</a>');
    const staging = montarEmail({ ...base, site: "https://physiqcalc-staging.vercel.app/", reserva: { ...base.reserva, href: "https://physiqcalc-staging.vercel.app/perfil/agenda" } });
    expect(staging).toContain(">physiqcalc-staging.vercel.app/perfil/agenda</a>");
    expect(staging).toContain('<a href="https://physiqcalc-staging.vercel.app" style="color:#A1A1AA;text-decoration:none">physiqcalc-staging.vercel.app</a>');
  });

  it("linhas: ícone PNG ou avatar com as iniciais; a borda entre as linhas; nota embaixo do valor; valor com mailto", () => {
    const html = montarEmail({
      ...base,
      linhas: [
        { icone: "email", rotulo: "Entre com este e-mail", valor: "rafael@exemplo.com", href: "mailto:rafael@exemplo.com" },
        { icone: "escudo", rotulo: "Como aceitar", valor: "Pelo botão Entrar com Google", nota: "O convite é aceito sozinho na entrada." },
      ],
    });
    expect(html).toContain('<a href="mailto:rafael@exemplo.com" style="color:#18181B;text-decoration:none">rafael@exemplo.com</a>');
    expect(html).toContain(">O convite é aceito sozinho na entrada.</p>");
    expect([...html.matchAll(/border-top:1px solid #F0F0F2/g)]).toHaveLength(2); // só a 2ª linha (ícone + texto)
    const avatar = montarEmail(base);
    expect(avatar).toContain("font-size:9px;line-height:22px;font-weight:700;color:#ffffff\">WB</td>");
  });

  it("palavra longa sem espaço (e-mail, nome de conta) quebra em vez de alargar o cartão", () => {
    const longo = "h3.equipe.1790876875.teste.claude@physiqnutri.app";
    const html = montarEmail({ ...base, linhas: [{ icone: "email", rotulo: "Entre com este e-mail", valor: longo, href: `mailto:${longo}` }] });
    const valor = html.match(/<p style="([^"]*)"><a href="mailto:/);
    expect(valor?.[1]).toContain("word-break:break-word;overflow-wrap:anywhere");
    const titulo = html.match(/<p style="([^"]*)">13:30<\/p>/);
    expect(titulo?.[1]).toContain("overflow-wrap:anywhere");
  });

  it("os 4 jeitos do destaque: calendário, ícones do que mudou, inicial da pessoa e selo da equipe; vários blocos", () => {
    const icones = montarEmail({ ...base, destaques: [{ visual: { tipo: "icones", icones: ["halterGrande", "saladaVerdeGrande"] }, olho: "O que mudou", titulo: "Treino e dieta", sub: "atualizados por Lucas Ferreira" }] });
    expect(icones).toContain(`${IMAGENS_EMAIL}/halter-violeta-26.png`);
    expect(icones).toContain(`${IMAGENS_EMAIL}/salada-verde-26.png`);
    expect(icones).toContain("font-size:28px;line-height:34px");
    const pessoa = montarEmail({ ...base, destaques: [{ visual: { tipo: "pessoa", iniciais: "LF" }, olho: "Convidou você", titulo: "Lucas Ferreira", sub: "Consultoria Ferreira" }] });
    expect(pessoa).toContain("border-radius:36px");
    expect(pessoa).toContain(">LF</td>");
    const equipe = montarEmail({ ...base, destaques: [{ visual: { tipo: "equipe", iniciais: "CF" }, olho: "Equipe", titulo: "Consultoria Ferreira", sub: "como nutricionista" }] });
    expect(equipe).toContain("border-radius:20px;background-color:#6D28D9");
    const varios = montarEmail({ ...base, destaques: [base.destaques![0], base.destaques![0], base.destaques![0]] });
    expect([...varios.matchAll(/>Qui<\/td>/g)]).toHaveLength(3);
    expect(varios).toContain("margin-top:20px");
    expect([...varios.matchAll(/margin-top:14px/g)]).toHaveLength(2);
    const semSub = montarEmail({ ...base, destaques: [{ ...base.destaques![0], sub: null }] });
    expect(semSub).not.toContain("até 14:00");
  });

  it("peças: iniciais, link sem protocolo e o texto da reserva pela quantidade de botões", () => {
    expect(iniciaisDe("Weslley Bertoldo")).toBe("WB");
    expect(iniciaisDe("  maria da silva ")).toBe("MS");
    expect(iniciaisDe("Lucas")).toBe("L");
    expect(iniciaisDe("(Ana) Lima")).toBe("AL");
    expect(iniciaisDe("")).toBe("P");
    expect(iniciaisDe(null)).toBe("P");
    expect(linkSemProtocolo("https://physiqcalc.com.br/")).toBe("physiqcalc.com.br");
    expect(linkSemProtocolo("https://physiqcalc.com.br/entrar?convite=1")).toBe("physiqcalc.com.br/entrar?convite=1");
    expect(textoDaReserva(3)).toBe("Os botões abrem o app. Se não abrir, use o link:");
    expect(textoDaReserva(1)).toBe("O botão abre o app. Se não abrir, use o link:");
    expect(textoDaReserva(1, "o Physiq")).toBe("O botão abre o Physiq. Se não abrir, use o link:");
  });
});
