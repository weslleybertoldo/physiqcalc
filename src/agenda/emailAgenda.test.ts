import { describe, expect, it } from "vitest";
import {
  assuntoDaAgenda, consultasDoEmail, destinoDoEmailAgenda, duracaoTexto, htmlDaAgenda, linkDaAgenda, quandoConsulta, statusDoErroAgenda,
  textoDaAgenda,
} from "../../supabase-principal/functions/_shared/agenda-regras";

const uma = [{ inicio: "2026-10-15T17:00:00Z", fim: "2026-10-15T18:00:00Z", titulo: "Avaliação física", modulo: "treino" }];

describe("função agenda-avisar (W20) — o e-mail \"consulta marcada\"", () => {
  it("STAGING manda SEMPRE para a caixa de teste do Resend; produção: teste → caixa de teste, pessoa real → o e-mail dela", () => {
    expect(destinoDoEmailAgenda("staging", "fulano@gmail.com")).toEqual({ para: "delivered@resend.dev", teste: true });
    expect(destinoDoEmailAgenda("public", "w20.aluno.teste.claude@physiqnutri.app")).toEqual({ para: "delivered@resend.dev", teste: true });
    expect(destinoDoEmailAgenda("public", "Fulano@Gmail.com")).toEqual({ para: "fulano@gmail.com", teste: false });
  });

  it("datas em São Paulo e a duração", () => {
    expect(quandoConsulta("2026-10-15T17:00:00Z")).toBe("qui, 15/10 às 14:00");
    expect(quandoConsulta("x")).toBe("");
    expect(duracaoTexto("2026-10-15T17:00:00Z", "2026-10-15T18:30:00Z")).toBe("1 h 30 min");
    expect(duracaoTexto("2026-10-15T17:00:00Z", "2026-10-15T17:30:00Z")).toBe("30 min");
  });

  it("assunto: 1 consulta com a data; várias com a quantidade; teste diz para quem era", () => {
    const d = { email: "a@b.com", aluno: "Rafael Moura", quem: "Lucas Ferreira", consultas: uma, link: "https://physiqcalc.com.br/perfil/agenda" };
    expect(assuntoDaAgenda(d)).toBe("Consulta marcada com Lucas Ferreira: qui, 15/10 às 14:00");
    expect(assuntoDaAgenda({ ...d, consultas: [...uma, ...uma, ...uma] })).toBe("3 consultas marcadas com Lucas Ferreira");
    expect(assuntoDaAgenda({ ...d, paraTeste: "a@b.com" })).toBe("[teste → a@b.com] Consulta marcada com Lucas Ferreira: qui, 15/10 às 14:00");
  });

  it("corpo: as consultas, o que fazer no app, o botão para a Agenda; HTML escapado e versão em texto", () => {
    const d = { email: "a@b.com", aluno: "Ana <b>Lima</b>", quem: "Lucas & Cia", consultas: uma, link: linkDaAgenda("public", null) };
    const html = htmlDaAgenda(d);
    expect(html).toContain('href="https://physiqcalc.com.br/perfil/agenda"');
    expect(html).toContain("qui, 15/10 às 14:00 (1 h) · Avaliação física");
    expect(html).toContain("<b>confirmar</b>, <b>reagendar</b> ou <b>desistir</b>");
    expect(html).not.toContain("<b>Lima</b>");
    expect(html).toContain("Lucas &amp; Cia");
    expect(textoDaAgenda(d)).toContain("- qui, 15/10 às 14:00 (1 h) · Avaliação física");
    expect(linkDaAgenda("staging", "https://physiqcalc.com.br")).toBe("https://physiqcalc-staging.vercel.app/perfil/agenda");
  });

  it("o que vem do banco é filtrado (no máximo 10) e os erros viram status", () => {
    expect(consultasDoEmail([{ inicio: "x", fim: "y" }, ...uma, null])).toHaveLength(1);
    expect(consultasDoEmail(Array.from({ length: 12 }, () => uma[0]))).toHaveLength(10);
    expect(statusDoErroAgenda("sem_acesso")).toBe(403);
    expect(statusDoErroAgenda("outro")).toBe(400);
  });
});
