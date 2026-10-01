import { describe, expect, it } from "vitest";
import {
  CAIXA_DE_TESTE_RESEND,
  assuntoDoConvite,
  destinoDoEmail,
  emailDeTesteDoPhysiq,
  escaparHtml,
  htmlDoConvite,
  linkDoConvite,
  modeloDoConvite,
  rotuloDosPapeis,
  siteDoConvite,
  textoDoConvite,
} from "../../../../supabase-principal/functions/_shared/convites-regras";

describe("função convites (W5) — regras do e-mail do convite de membro", () => {
  it("conta de TESTE (domínios physiq*.app, que não existem) vai para a caixa de teste do Resend; pessoa real, para ela mesma", () => {
    expect(emailDeTesteDoPhysiq("w5.personal.teste.claude@physiqnutri.app")).toBe(true);
    expect(emailDeTesteDoPhysiq("fulano@gmail.com")).toBe(false);
    expect(destinoDoEmail("W5.Nutri.Teste.Claude@physiqnutri.app")).toEqual({ para: CAIXA_DE_TESTE_RESEND, teste: true });
    expect(destinoDoEmail("Fulano@Gmail.com")).toEqual({ para: "fulano@gmail.com", teste: false });
  });
  it("o link do e-mail é o site do ambiente, com ?convite=1 (aceita mesmo para quem já estava logado)", () => {
    expect(siteDoConvite("staging")).toBe("https://physiqcalc-staging.vercel.app");
    expect(siteDoConvite("public", "https://physiqcalc.com.br/")).toBe("https://physiqcalc.com.br");
    expect(linkDoConvite("public", null)).toBe("https://physiqcalc.com.br/entrar?convite=1");
  });
  it("assunto e corpo: quem convidou, a conta, os papéis; conta de teste marcada no assunto; HTML escapado", () => {
    const d = { email: "nutri@gmail.com", papeis: ["nutricionista"], conta: "Consultoria <Ferreira>", quem: "Lucas", link: "https://physiqcalc.com.br/entrar?convite=1" };
    expect(assuntoDoConvite(d)).toBe("Lucas convidou você para a equipe Consultoria <Ferreira> no Physiq");
    expect(assuntoDoConvite({ ...d, paraTeste: "x.teste.claude@physiqnutri.app" })).toMatch(/^\[teste → x\.teste\.claude@physiqnutri\.app\]/);
    const html = htmlDoConvite(d);
    expect(html).toContain("Consultoria &lt;Ferreira&gt;");
    expect(html).toContain('<strong style="font-weight:600;color:#18181B">nutricionista</strong>');
    expect(html).toContain('href="https://physiqcalc.com.br/entrar?convite=1"');
    expect(textoDoConvite(d)).toContain("Entrar com Google");
    expect(rotuloDosPapeis(["personal", "nutricionista"])).toBe("personal trainer e nutricionista");
    expect(escaparHtml(`"a"&'b'`)).toBe("&quot;a&quot;&amp;&#39;b&#39;");
  });
  it("molde C (H3): selo com as iniciais da conta, Equipe · conta · como papel, as 4 linhas e o botão Entrar e aceitar", () => {
    const d = { email: "camila.rocha@exemplo.com", papeis: ["nutricionista"], conta: "Consultoria Ferreira", quem: "Lucas Ferreira", link: "https://physiqcalc.com.br/entrar?convite=1" };
    const m = modeloDoConvite(d);
    expect(m.rotulo).toBe("Convite de equipe");
    expect(m.destaques).toEqual([{ visual: { tipo: "equipe", iniciais: "CF" }, olho: "Equipe", titulo: "Consultoria Ferreira", sub: "como nutricionista" }]);
    expect(m.linhas.map((l) => [l.icone ?? l.iniciais, l.rotulo, l.valor])).toEqual([
      ["LF", "Convidado por", "Lucas Ferreira"],
      ["estetoscopio", "Seu papel", "Nutricionista"],
      ["email", "Entre com este e-mail", "camila.rocha@exemplo.com"],
      ["escudo", "Como aceitar", "Pelo botão Entrar com Google"],
    ]);
    expect(m.linhas[2].href).toBe("mailto:camila.rocha@exemplo.com");
    expect(m.linhas[3].nota).toBe("O convite é aceito sozinho na entrada.");
    expect(m.preheader).toBe("Lucas Ferreira convidou você para a equipe Consultoria Ferreira no Physiq, como nutricionista.");
    expect(m.reserva.texto).toBe("O botão abre o Physiq. Se não abrir, use o link:");
    expect(m.rodape).toBe("Se você não esperava este convite, ignore este e-mail.");
    expect(m.secundarios ?? []).toEqual([]);
    expect(modeloDoConvite({ ...d, papeis: ["personal"] }).linhas[1]).toMatchObject({ icone: "halter", valor: "Personal trainer" });
    expect(modeloDoConvite({ ...d, papeis: ["personal", "nutricionista"] }).linhas[1]).toMatchObject({ icone: "halter", valor: "Personal trainer e nutricionista" });
    const html = htmlDoConvite(d);
    expect(html).toContain(">Entrar e aceitar</a>");
    expect(html).toContain(">physiqcalc.com.br/entrar?convite=1</a>");
    expect(html).not.toMatch(/<svg/i);
  });
});
