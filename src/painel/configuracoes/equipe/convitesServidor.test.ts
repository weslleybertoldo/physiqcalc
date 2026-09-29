import { describe, expect, it } from "vitest";
import {
  CAIXA_DE_TESTE_RESEND,
  assuntoDoConvite,
  destinoDoEmail,
  emailDeTesteDoPhysiq,
  escaparHtml,
  htmlDoConvite,
  linkDoConvite,
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
    expect(html).toContain("<b>nutricionista</b>");
    expect(html).toContain('href="https://physiqcalc.com.br/entrar?convite=1"');
    expect(textoDoConvite(d)).toContain("Entrar com Google");
    expect(rotuloDosPapeis(["personal", "nutricionista"])).toBe("personal trainer e nutricionista");
    expect(escaparHtml(`"a"&'b'`)).toBe("&quot;a&quot;&amp;&#39;b&#39;");
  });
});
