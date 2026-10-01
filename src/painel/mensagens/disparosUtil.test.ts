import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CONFIG_PADRAO, DISPAROS, HORARIOS, LIMITE_TEXTO, erroTexto, lerConfig, mesmaConfig, paraGravar, previa, quantosLigados, quantosValendo,
  resumoCard, textoDoMomento, type ConfigWhatsapp,
} from "./disparosUtil";

// Porta de src/lib/whatsappDisparosUtil.test.ts do PhysiqNutri (W47) + o que a W22 acrescenta.
const cfg = (over: Partial<ConfigWhatsapp> = {}): ConfigWhatsapp => ({ ...CONFIG_PADRAO, ...over });

describe("nada é enviado sem alguém ligar", () => {
  it("o padrão é tudo desligado", () => {
    expect(CONFIG_PADRAO.ativo).toBe(false);
    expect(quantosLigados(CONFIG_PADRAO)).toBe(0);
    expect(quantosValendo(CONFIG_PADRAO)).toBe(0);
  });
  it("são os 6 momentos da spec, na ordem", () => {
    expect(DISPAROS.map((d) => d.chave)).toEqual(["aniversario", "lembrete_vespera", "lembrete_dia", "cobranca_vencendo", "cobranca_vencida", "confirmacao_agendamento"]);
  });
  it("config ausente ou estranha vira o padrão", () => {
    expect(lerConfig(null)).toEqual(CONFIG_PADRAO);
    expect(lerConfig({ tema: "dark" })).toEqual(CONFIG_PADRAO);
    expect(lerConfig({ whatsapp: "ligado" })).toEqual(CONFIG_PADRAO);
    expect(lerConfig({ whatsapp: { ativo: "sim", horario: "25:00", momentos: 7 } })).toEqual(CONFIG_PADRAO);
  });
  it("horário fora da lista cai no padrão", () => {
    expect(lerConfig({ whatsapp: { horario: "03:30" } }).horario).toBe("09:00");
    expect(lerConfig({ whatsapp: { horario: "07:00" } }).horario).toBe("07:00");
    expect(HORARIOS[0]).toBe("06:00");
    expect(HORARIOS[HORARIOS.length - 1]).toBe("21:00");
  });
  it("só booleano liga um momento", () => {
    const c = lerConfig({ whatsapp: { momentos: { aniversario: true, lembrete_dia: "sim", inventado: true } } });
    expect(c.momentos.aniversario).toBe(true);
    expect(c.momentos.lembrete_dia).toBeUndefined();
    expect(Object.keys(c.momentos)).toEqual(["aniversario"]);
  });
  it("momento ligado com o interruptor geral desligado não vale", () => {
    expect(quantosValendo(cfg({ momentos: { aniversario: true } }))).toBe(0);
    expect(quantosValendo(cfg({ ativo: true, momentos: { aniversario: true } }))).toBe(1);
  });
});

describe("gravar sem estragar o resto (a função do banco grava só o whatsapp)", () => {
  it("texto igual ao padrão não é guardado (acompanha melhorias futuras)", () => {
    const d = DISPAROS[0];
    expect(paraGravar(cfg({ textos: { [d.chave]: d.padrao } })).textos).toEqual({});
  });
  it("texto próprio é guardado sem espaços sobrando", () => {
    expect(paraGravar(cfg({ textos: { aniversario: "  Parabéns, {nome}!  " } })).textos.aniversario).toBe("Parabéns, {nome}!");
  });
  it("horário fora da lista vai como o padrão", () => {
    expect(paraGravar(cfg({ horario: "04:00" })).horario).toBe("09:00");
  });
  it("igual = o que muda só no texto padrão ou nos espaços não acende o Salvar", () => {
    expect(mesmaConfig(cfg(), cfg({ textos: { aniversario: DISPAROS[0].padrao } }))).toBe(true);
    expect(mesmaConfig(cfg(), cfg({ momentos: { aniversario: false } }))).toBe(true);
    expect(mesmaConfig(cfg(), cfg({ momentos: { aniversario: true } }))).toBe(false);
    expect(mesmaConfig(cfg(), cfg({ horario: "08:00" }))).toBe(false);
    expect(mesmaConfig(cfg({ textos: { lembrete_dia: "Oi" } }), cfg({ textos: { lembrete_dia: " Oi " } }))).toBe(true);
  });
});

describe("texto de cada momento", () => {
  it("sem texto próprio, vale o padrão", () => {
    expect(textoDoMomento(CONFIG_PADRAO, "aniversario")).toBe(DISPAROS[0].padrao);
  });
  it("com texto próprio, vale o dele", () => {
    expect(textoDoMomento(cfg({ textos: { aniversario: "Oi!" } }), "aniversario")).toBe("Oi!");
  });
  it("vazio não é erro — cai no padrão", () => {
    expect(erroTexto("")).toBeNull();
    expect(erroTexto("   ")).toBeNull();
  });
  it("variável inventada é erro, e o erro diz quais valem", () => {
    const e = erroTexto("Oi {cliente}, tudo bem?");
    expect(e).toContain("{cliente}");
    expect(e).toContain("{nome}");
  });
  it("as cinco variáveis conhecidas passam", () => {
    expect(erroTexto("{nome} {data} {hora} {valor} {profissional}")).toBeNull();
  });
  it("texto longo demais é barrado", () => {
    expect(erroTexto("x".repeat(LIMITE_TEXTO + 1))).toContain(String(LIMITE_TEXTO));
    expect(erroTexto("x".repeat(LIMITE_TEXTO))).toBeNull();
  });
  it("a prévia troca as variáveis por exemplos", () => {
    expect(previa("Oi, {nome}! Dia {data} às {hora}, {valor}. — {profissional}")).toBe("Oi, Ana! Dia 21/09 às 14:30, R$ 250,00. — Marina");
  });
  it("todo momento tem padrão e variáveis coerentes", () => {
    for (const d of DISPAROS) {
      expect(d.padrao.length).toBeGreaterThan(10);
      for (const v of d.padrao.match(/\{[a-z]+\}/g) ?? []) expect(d.variaveis).toContain(v);
    }
  });
  it("os textos padrão são OS MESMOS da função do banco (whatsapp_texto, a versão viva da W50) — quem envia é o banco", () => {
    const sql = readFileSync("supabase-principal/migrations/20260921000000_pix_mensal.sql", "utf-8");
    for (const d of DISPAROS) expect(sql).toContain(`when '${d.chave}' then '${d.padrao}'`);
  });
});

describe("o que o cartão diz", () => {
  it("sem conexão, manda conectar antes", () => {
    expect(resumoCard(cfg({ ativo: true }), false)).toContain("Conecte o WhatsApp");
  });
  it("desligado avisa que está desligado", () => {
    expect(resumoCard(CONFIG_PADRAO, true)).toContain("desligadas");
  });
  it("ligado sem momento avisa que nada sai", () => {
    expect(resumoCard(cfg({ ativo: true }), true)).toContain("nada será enviado");
  });
  it("ligado com momentos conta e diz o horário", () => {
    const r = resumoCard(cfg({ ativo: true, horario: "08:00", momentos: { aniversario: true, lembrete_dia: true } }), true);
    expect(r).toContain("2 momentos ligados");
    expect(r).toContain("08:00");
  });
  it("um momento só fala no singular", () => {
    expect(resumoCard(cfg({ ativo: true, momentos: { aniversario: true } }), true)).toContain("1 momento ligado");
  });
});
