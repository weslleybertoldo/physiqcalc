import { beforeEach, describe, expect, it } from "vitest";
import {
  VALIDADE_REGISTRO_MS,
  chaveRegistro,
  formatarRestante,
  gravarRegistro,
  lerRegistro,
  registroDaResposta,
  restanteBloqueioMs,
} from "./rateLimitLogin";

// W8b: quem conta é o SERVIDOR (entrar-senha); o aparelho só segue a resposta — mostra o tempo que falta e guarda o de vez.
const AGORA = Date.parse("2026-09-30T12:00:00Z");

describe("rateLimitLogin — segue a resposta do servidor", () => {
  it("bloqueio temporário: o fim vem no relógio do servidor e vira o do aparelho (sem contar nada aqui)", () => {
    // servidor 2 min adiantado: o bloqueio de 1 min continua sendo de 1 min no aparelho
    const r = registroDaResposta({ erro: "senha_errada", bloqueado_ate: "2026-09-30T12:03:00Z", agora: "2026-09-30T12:02:00Z" }, AGORA);
    expect(r).toMatchObject({ deVez: false, motivo: "conta" });
    expect(r!.bloqueadoAte).toBe(AGORA + 60_000);
    expect(restanteBloqueioMs(r, AGORA)).toBe(60_000);
    expect(formatarRestante(restanteBloqueioMs(r, AGORA + 1000))).toBe("0:59");
  });
  it("bloqueio de vez: sem tempo, fica até entrar (senha nova ou Google)", () => {
    const r = registroDaResposta({ erro: "bloqueado_de_vez", bloqueado_de_vez: true, agora: "2026-09-30T12:00:00Z" }, AGORA);
    expect(r).toMatchObject({ deVez: true, bloqueadoAte: null });
    expect(restanteBloqueioMs(r, AGORA)).toBe(0);
  });
  it("muitas tentativas da mesma rede (IP) é outro motivo", () => {
    const r = registroDaResposta({ erro: "muitas_tentativas_rede", bloqueado_ate: "2026-09-30T12:15:00Z", agora: "2026-09-30T12:00:00Z" }, AGORA);
    expect(r).toMatchObject({ motivo: "rede" });
    expect(formatarRestante(restanteBloqueioMs(r, AGORA))).toBe("15:00");
  });
  it("senha errada sem bloqueio, fim já passado ou data torta: nada a guardar", () => {
    expect(registroDaResposta({ erro: "senha_errada", bloqueado_ate: null, agora: "2026-09-30T12:00:00Z" }, AGORA)).toBeNull();
    expect(registroDaResposta({ erro: "bloqueado", bloqueado_ate: "2026-09-30T11:59:00Z", agora: "2026-09-30T12:00:00Z" }, AGORA)).toBeNull();
    expect(registroDaResposta({ erro: "bloqueado", bloqueado_ate: "amanhã" }, AGORA)).toBeNull();
  });
  it("m:ss arredonda pra cima (nunca mostra 0:00 ainda bloqueado) e 1 h vira 60:00", () => {
    expect(formatarRestante(60 * 60_000)).toBe("60:00");
    expect(formatarRestante(1)).toBe("0:01");
    expect(formatarRestante(0)).toBe("0:00");
  });
});

describe("rateLimitLogin — registro no navegador", () => {
  beforeEach(() => localStorage.clear());
  it("grava e lê por e-mail (sem diferenciar maiúsculas e espaços)", () => {
    const r = registroDaResposta({ erro: "senha_errada", bloqueado_ate: "2026-09-30T12:05:00Z", agora: "2026-09-30T12:00:00Z" }, AGORA)!;
    gravarRegistro(" Aluno@Teste.com ", r);
    expect(localStorage.getItem(chaveRegistro("aluno@teste.com"))).not.toBeNull();
    expect(lerRegistro("aluno@teste.com", AGORA + 1000)).toMatchObject({ deVez: false });
  });
  it("espera que acabou ou registro velho some; o de vez não expira", () => {
    const tempo = registroDaResposta({ erro: "bloqueado", bloqueado_ate: "2026-09-30T12:01:00Z", agora: "2026-09-30T12:00:00Z" }, AGORA)!;
    gravarRegistro("a@b.co", tempo);
    expect(lerRegistro("a@b.co", AGORA + 61_000)).toBeNull();
    const deVez = registroDaResposta({ erro: "bloqueado_de_vez", bloqueado_de_vez: true }, AGORA)!;
    gravarRegistro("c@d.co", deVez);
    expect(lerRegistro("c@d.co", AGORA + VALIDADE_REGISTRO_MS * 10)).toMatchObject({ deVez: true });
  });
  it("apagar (entrou) e registro inválido", () => {
    gravarRegistro("a@b.co", { bloqueadoAte: AGORA + 60_000, deVez: false, motivo: "conta", em: AGORA });
    gravarRegistro("a@b.co", null);
    expect(lerRegistro("a@b.co", AGORA)).toBeNull();
    localStorage.setItem(chaveRegistro("x@y.co"), "{quebrado");
    expect(lerRegistro("x@y.co", AGORA)).toBeNull();
    expect(lerRegistro("", AGORA)).toBeNull();
  });
});
