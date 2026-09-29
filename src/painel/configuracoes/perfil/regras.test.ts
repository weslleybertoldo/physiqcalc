import { describe, expect, it } from "vitest";
import {
  comFoto,
  dadosParaGravar,
  formDoPerfil,
  formasDeEntrar,
  formatarWhatsapp,
  fotoDoPerfil,
  mascararTelefoneBR,
  paraE164,
  rotuloRegistro,
  validarNovaSenha,
  validarPerfil,
  type FormPerfil,
} from "./regras";

const base: FormPerfil = { nome: "Lucas Ferreira", tipo: "personal", registro: "CREF 012345-G/PE", whatsapp: "(81) 99999-8888", endereco: "Rua A, 10", cidade: "Recife", uf: "PE" };

describe("Perfil do profissional (W5) — o mesmo jsonb do PhysiqNutri", () => {
  it("WhatsApp: máscara ao digitar e E.164 para gravar (e o formatado que os PDFs do Nutri leem)", () => {
    expect(mascararTelefoneBR("81999998888")).toBe("(81) 99999-8888");
    expect(mascararTelefoneBR("5581999998888")).toBe("(81) 99999-8888");
    expect(paraE164("(81) 99999-8888")).toBe("+5581999998888");
    expect(paraE164("123")).toBeNull();
    expect(formatarWhatsapp("+5581999998888")).toBe("+55 (81) 99999-8888");
  });
  it("gravar preserva o que a tela não edita (plano do Nutri, foto) e guarda o registro no campo do conselho", () => {
    const anterior = { plano: "Profissional", foto_url: "https://x/foto.jpg", crn: "velho" };
    const d = dadosParaGravar(base, anterior);
    expect(d).toMatchObject({
      plano: "Profissional", foto_url: "https://x/foto.jpg", registro: "CREF 012345-G/PE", cref: "CREF 012345-G/PE",
      whatsapp_e164: "+5581999998888", telefone: "+55 (81) 99999-8888", endereco: "Rua A, 10", cidade: "Recife", uf: "PE",
    });
    expect(dadosParaGravar({ ...base, tipo: "nutricionista", registro: "CRN 1234/PE" }, {})).toMatchObject({ crn: "CRN 1234/PE" });
    expect(dadosParaGravar({ ...base, whatsapp: "", endereco: " " }, {})).toMatchObject({ whatsapp_e164: null, telefone: null, endereco: null });
  });
  it("o formulário lê o perfil de hoje (Nutri: crn/telefone; W4: registro/cref) e usa o nome do cadastro sem nome", () => {
    const f = formDoPerfil({ nome: null, tipo_perfil: "nutricionista", dados_profissionais: { crn: "CRN 9", telefone: "+55 (11) 3333-4444", uf: "SP" } }, "Camila");
    expect(f).toMatchObject({ nome: "Camila", tipo: "nutricionista", registro: "CRN 9", whatsapp: "(11) 3333-4444", uf: "SP" });
    expect(formDoPerfil({ nome: "A", tipo_perfil: "personal", dados_profissionais: { cref: "CREF 1" } }).registro).toBe("CREF 1");
    expect(formDoPerfil({ nome: "A", tipo_perfil: "xx", dados_profissionais: { uf: "ZZ" } })).toMatchObject({ tipo: "", uf: "" });
  });
  it("validação: nome, WhatsApp e tamanhos", () => {
    expect(validarPerfil(base)).toBeNull();
    expect(validarPerfil({ ...base, nome: "L" })).toMatch(/nome/);
    expect(validarPerfil({ ...base, whatsapp: "(81) 9999" })).toMatch(/WhatsApp inválido/);
    expect(validarPerfil({ ...base, registro: "x".repeat(31) })).toMatch(/registro/);
  });
  it("rótulo do registro pelo tipo de perfil", () => {
    expect(rotuloRegistro("personal")).toBe("CREF");
    expect(rotuloRegistro("nutricionista")).toBe("CRN");
    expect(rotuloRegistro("")).toBe("Registro profissional");
  });
  it("foto do Perfil: só https; sem ela vale a do Google", () => {
    expect(fotoDoPerfil({ foto_url: "https://api-principal.physiqcalc.com.br/storage/v1/object/public/fotos-perfil/u/f.jpg" })).toMatch(/^https:/);
    expect(fotoDoPerfil({ foto_url: "javascript:alert(1)" })).toBeNull();
    expect(comFoto({ crn: "1" }, null)).toEqual({ crn: "1", foto_url: null });
  });
  it("senha nova: 8+, letras e números, confirmação igual", () => {
    expect(validarNovaSenha({ senha: "abc", confirmacao: "abc" })).toMatch(/8/);
    expect(validarNovaSenha({ senha: "abcdefgh", confirmacao: "abcdefgh" })).toMatch(/letras e números/);
    expect(validarNovaSenha({ senha: "abcd1234", confirmacao: "abcd1235" })).toMatch(/confirmação/);
    expect(validarNovaSenha({ senha: "abcd1234", confirmacao: "abcd1234" })).toBeNull();
  });
  it("como a pessoa entra (identidades do login)", () => {
    expect(formasDeEntrar({ identities: [{ provider: "google" }] })).toEqual({ google: true, senha: false });
    expect(formasDeEntrar({ identities: [], app_metadata: { providers: ["email"] } })).toEqual({ google: false, senha: true });
  });
});
