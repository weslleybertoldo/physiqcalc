import { describe, expect, it } from "vitest";
import {
  PING_VALIDO_S, QR_VALIDO_S, agenteVivo, devePollar, estadoDoAgente, numeroDoPerfil, passosConexao, qrValido, rotuloBotao, situacaoTela,
  tempoSemSinal, textoSituacao, traduzErro, type Instancia,
} from "./whatsappUtil";

// Porta de src/lib/whatsappUtil.test.ts do PhysiqNutri (W46) + a regra do celular fora do ar (W22, pelo ultimo_ping).
const agora = new Date("2026-09-20T18:00:00-03:00").getTime();
const segundosAtras = (n: number) => new Date(agora - n * 1000).toISOString();

const instancia = (over: Partial<Instancia> = {}): Instancia => ({
  id: "i1",
  status: "desconectado",
  numero_e164: "+5548999998888",
  numero_conectado: null,
  qr_code: null,
  qr_atualizado_em: null,
  conectado_em: null,
  ultimo_ping: segundosAtras(5),
  erro: null,
  ...over,
});

const comQr = (idadeS: number) =>
  instancia({ status: "aguardando_qr", qr_code: "data:image/png;base64,AAAA", qr_atualizado_em: segundosAtras(idadeS) });

describe("número do profissional (Configurações › Perfil, W5)", () => {
  it("usa o whatsapp_e164 quando existe", () => {
    expect(numeroDoPerfil({ whatsapp_e164: "+5548999998888" }).e164).toBe("+5548999998888");
    expect(numeroDoPerfil({ whatsapp_e164: "+5548999998888" }).formatado).toBe("+55 (48) 99999-8888");
  });
  it("cai no telefone quando não há whatsapp", () => {
    expect(numeroDoPerfil({ telefone: "(48) 99999-8888" }).e164).toBe("+5548999998888");
  });
  it("sem nada = sem número", () => {
    expect(numeroDoPerfil({}).e164).toBeNull();
    expect(numeroDoPerfil(null).formatado).toBe("");
  });
});

describe("validade do QR e do agente", () => {
  it(`QR vale por ${QR_VALIDO_S} s (o WhatsApp troca o código a cada ~20 s)`, () => {
    expect(qrValido(comQr(10), agora)).toBe(true);
    expect(qrValido(comQr(QR_VALIDO_S + 5), agora)).toBe(false);
    expect(qrValido(instancia(), agora)).toBe(false);
  });
  it(`sem batida do celular por ${PING_VALIDO_S} s, o agente está fora do ar`, () => {
    expect(agenteVivo(segundosAtras(30), agora)).toBe(true);
    expect(agenteVivo(segundosAtras(PING_VALIDO_S), agora)).toBe(true);
    expect(agenteVivo(segundosAtras(PING_VALIDO_S + 10), agora)).toBe(false);
    expect(agenteVivo(null, agora)).toBe(false);
  });
});

describe("o aviso do celular de envio fora do ar (W22 — pelo ultimo_ping)", () => {
  it("batida recente = vivo (o agente bate a cada 60 s; até 3 min sem batida ainda é atraso de rede)", () => {
    expect(estadoDoAgente(segundosAtras(59), agora).estado).toBe("vivo");
    expect(estadoDoAgente(segundosAtras(170), agora).estado).toBe("vivo");
  });
  it("mais de 3 min sem batida = fora do ar, com os minutos e a última batida", () => {
    const e = estadoDoAgente(segundosAtras(12 * 60 + 20), agora);
    expect(e.estado).toBe("fora");
    expect(e.minutos).toBe(12);
    expect(e.desde).toBe(segundosAtras(12 * 60 + 20));
  });
  it("sem batida nenhuma registrada (ou data inválida) não acusa nada", () => {
    expect(estadoDoAgente(null, agora).estado).toBe("sem_dado");
    expect(estadoDoAgente(undefined, agora).estado).toBe("sem_dado");
    expect(estadoDoAgente("isso-nao-e-data", agora).estado).toBe("sem_dado");
  });
  it("batida no futuro (relógio do aparelho adiantado) conta como viva", () => {
    expect(estadoDoAgente(new Date(agora + 30_000).toISOString(), agora).estado).toBe("vivo");
  });
  it("o tempo sem sinal em palavras", () => {
    expect(tempoSemSinal(0)).toBe("há 1 min");
    expect(tempoSemSinal(12)).toBe("há 12 min");
    expect(tempoSemSinal(185)).toBe("há 3 h");
    expect(tempoSemSinal(60 * 72)).toBe("há 3 dias");
  });
});

describe("situação da tela", () => {
  it("sem número cadastrado, manda cadastrar antes", () => {
    expect(situacaoTela(null, false, agora)).toBe("sem_numero");
    expect(situacaoTela(instancia(), false, agora)).toBe("sem_numero");
  });
  it("com número e sem conexão, fica pronto pra conectar", () => {
    expect(situacaoTela(instancia(), true, agora)).toBe("desconectado");
    expect(situacaoTela(null, true, agora)).toBe("desconectado");
  });
  it("pediu conexão e o QR ainda não veio = aguardando o agente", () => {
    expect(situacaoTela(instancia({ status: "aguardando_qr" }), true, agora)).toBe("aguardando_agente");
  });
  it("QR fresco na tela = hora de ler", () => {
    expect(situacaoTela(comQr(5), true, agora)).toBe("qr");
  });
  it("QR velho volta a esperar o próximo (não mostra código morto)", () => {
    expect(situacaoTela(comQr(QR_VALIDO_S + 30), true, agora)).toBe("aguardando_agente");
  });
  it("conectado e erro passam direto", () => {
    expect(situacaoTela(instancia({ status: "conectado" }), true, agora)).toBe("conectado");
    expect(situacaoTela(instancia({ status: "erro" }), true, agora)).toBe("erro");
  });
  it("conectado vale mesmo se o número sumir de Configurações", () => {
    expect(situacaoTela(instancia({ status: "conectado" }), false, agora)).toBe("conectado");
  });
});

describe("o que a tela diz e oferece", () => {
  it("o botão muda com a situação", () => {
    expect(rotuloBotao("desconectado")).toBe("Conectar WhatsApp");
    expect(rotuloBotao("sem_numero")).toBe("Conectar WhatsApp");
    expect(rotuloBotao("qr")).toBe("Cancelar");
    expect(rotuloBotao("aguardando_agente")).toBe("Cancelar");
    expect(rotuloBotao("conectado")).toBe("Desconectar");
  });
  it("só faz polling enquanto há algo a esperar", () => {
    expect(devePollar("qr")).toBe(true);
    expect(devePollar("aguardando_agente")).toBe(true);
    expect(devePollar("conectado")).toBe(false);
    expect(devePollar("desconectado")).toBe(false);
  });
  it("conectado mostra o número que o WhatsApp confirmou", () => {
    const t = textoSituacao("conectado", instancia({ status: "conectado", numero_conectado: "+5548999998888" }), agora);
    expect(t).toContain("(48)");
    expect(t).toContain("Conectado com o número");
  });
  it("erro mostra o motivo que veio do celular", () => {
    expect(textoSituacao("erro", instancia({ status: "erro", erro: "o WhatsApp desconectou este aparelho" }), agora)).toContain("desconectou este aparelho");
  });
  it("esperando com o agente fora do ar não promete QR pra já (pela batida da tabela, se vier)", () => {
    const fora = instancia({ status: "aguardando_qr", ultimo_ping: segundosAtras(PING_VALIDO_S + 60) });
    expect(textoSituacao("aguardando_agente", fora, agora)).toContain("tente de novo");
    expect(textoSituacao("aguardando_agente", fora, agora, segundosAtras(10))).toContain("Gerando o QR code");
  });
  it("sem número, manda para Configurações › Perfil", () => {
    expect(textoSituacao("sem_numero", null, agora)).toContain("Configurações › Perfil");
  });
  it("código de erro da função vira frase de gente", () => {
    expect(traduzErro("sem_numero")).toContain("Configurações");
    expect(traduzErro("nao_conectado")).toContain("Conecte o WhatsApp");
    expect(traduzErro("mensagens_desligadas")).toContain("Ajustes");
    expect(traduzErro("consulta_passou")).toContain("consulta");
    expect(traduzErro("coisa_que_nao_existe")).toContain("Tente de novo");
  });
});

describe("passos da conexão", () => {
  it("o passo 2 fecha quando conecta; o 3 fica pendente até ligar um momento", () => {
    const p = passosConexao(true, "conectado");
    expect(p.map((x) => x.estado)).toEqual(["feito", "feito", "pendente"]);
  });
  it("o passo 3 fecha com pelo menos um momento valendo", () => {
    expect(passosConexao(true, "conectado", 2)[2].estado).toBe("feito");
  });
  it("sem número, o 1 fica pendente e o 2 nem se oferece", () => {
    const p = passosConexao(false, "desconectado");
    expect(p[0].estado).toBe("pendente");
    expect(p[1].estado).toBe("em_breve");
    expect(p[0].descricao).toContain("Configurações › Perfil");
  });
});
