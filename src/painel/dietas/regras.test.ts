import { describe, expect, it } from "vitest";
import { alimentoEhMeu, recorteAlimentos } from "./alimentosPainel";
import { podeEscreverNutricao } from "./contexto";
import { recorteDiario } from "./diario";
import { lerLink, normalizarCodigo } from "./publico";
import { abaDietasDaUrl } from "./regras";
import { ehCaminhoDoApp } from "@/lib/linksDoApp";

describe("W24 — Painel › Dietas: regras", () => {
  it("a aba pela URL (os links antigos /alimentos, /receitas e /diario do Nutri caem em ?aba=)", () => {
    expect(abaDietasDaUrl(new URLSearchParams(""))).toBe("alimentos");
    expect(abaDietasDaUrl(new URLSearchParams("aba=receitas"))).toBe("receitas");
    expect(abaDietasDaUrl(new URLSearchParams("aba=diario&dias=30"))).toBe("diario");
    expect(abaDietasDaUrl(new URLSearchParams("aba=xyz"))).toBe("alimentos");
  });
  it("escrever exige ser nutricionista numa conta com Nutrição (a restritiva da W3); o master passa", () => {
    expect(podeEscreverNutricao(["nutricionista"], ["nutricao"], false)).toBe(true);
    expect(podeEscreverNutricao(["dono", "nutricionista"], ["treino", "nutricao"], false)).toBe(true);
    expect(podeEscreverNutricao(["dono", "personal"], ["treino", "nutricao"], false)).toBe(false);
    expect(podeEscreverNutricao(["personal"], ["treino", "nutricao"], false)).toBe(false);
    expect(podeEscreverNutricao(["nutricionista"], ["treino"], false)).toBe(false);
    expect(podeEscreverNutricao([], [], true)).toBe(true);
  });
  it("alimentos: 'TACO ou dos seus' (também para o master) e só o autor edita/exclui; a TACO é só leitura", () => {
    expect(recorteAlimentos("u1")).toBe("fonte.eq.taco,nutricionista_id.eq.u1");
    expect(recorteAlimentos("")).toBe("fonte.eq.taco");
    expect(alimentoEhMeu({ fonte: "proprio", nutricionista_id: "u1" }, "u1")).toBe(true);
    expect(alimentoEhMeu({ fonte: "proprio", nutricionista_id: "u2" }, "u1")).toBe(false);
    expect(alimentoEhMeu({ fonte: "taco", nutricionista_id: null }, "u1")).toBe(false);
    expect(alimentoEhMeu({ fonte: "proprio", nutricionista_id: "u1" }, "")).toBe(false);
  });
  it("diário: o recorte da conta ativa (o aluno da conta, ou o paciente sem conta da própria nutri do site antigo)", () => {
    expect(recorteDiario("c1", "u1")).toBe("conta_id.eq.c1,and(conta_id.is.null,nutricionista_id.eq.u1)");
  });
  it("o /d/: código normalizado e a resposta da diario_link lida sem confiar (o que não reconhece é 'invalido')", () => {
    expect(normalizarCodigo(" ABC/123 xyz ")).toBe("abc123xyz");
    expect(lerLink({ situacao: "ok", paciente_id: "p", nutricionista_id: "n", nome: "Ana" })).toEqual({ situacao: "ok", paciente_id: "p", nutricionista_id: "n", nome: "Ana" });
    expect(lerLink({ situacao: "ok", paciente_id: "p" })).toEqual({ situacao: "invalido" });
    expect(lerLink({ situacao: "diario_desligado", nome: "Ana" })).toEqual({ situacao: "diario_desligado" });
    expect(lerLink({ situacao: "qualquer" })).toEqual({ situacao: "invalido" });
    expect(lerLink(null)).toEqual({ situacao: "invalido" });
  });
  it("o /d/ e o /p/ são páginas públicas: ficam FORA das App Links do APK (como a H2 deixou) — o /dieta do aluno continua dentro", () => {
    expect(ehCaminhoDoApp("/d/abc2345xyz")).toBe(false);
    expect(ehCaminhoDoApp("/p/abc2345xyz")).toBe(false);
    expect(ehCaminhoDoApp("/dieta?ver=diario&registro=r1")).toBe(true);
  });
});
