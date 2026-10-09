import { describe, expect, it } from "vitest";
import {
  COMENTARIO_NUTRI_MAX, PERIODOS, agruparPorDia, chaveDia, formatarReagidoEm, inicioDoPeriodo, nomeAluno,
  periodoDaURL, primeiroNomeAluno, textoContagem, textoPeriodo, textoReacaoNutri, textoReagidoEm, textoRegistro, textoRegistroCompleto, type RegistroBase,
} from "./diarioPainel";

// Physiq W24 — os testes do lado da nutricionista do diarioUtil.test.ts do PhysiqNutri (W30), sem emoji (spec 4.9).
const iso = (y: number, m: number, d: number, h: number, mi: number) => new Date(y, m - 1, d, h, mi).toISOString();
const reg = (id: string, data_hora: string, extra: Partial<RegistroBase> = {}): RegistroBase => ({
  id,
  data_hora,
  refeicao: "almoco",
  comentario: "",
  reacao_nutri: null,
  comentario_nutri: "",
  reagido_em: null,
  paciente_id: "p1",
  paciente: { id: "p1", nome: "Ana Souza", apelido: null, link_codigo: "abc1234567" },
  ...extra,
});

describe("período (7 a 90 dias)", () => {
  it("periodoDaURL cai no padrão 7", () => {
    expect(periodoDaURL(null)).toBe(7);
    expect(periodoDaURL("30")).toBe(30);
    expect(periodoDaURL("12")).toBe(7);
    expect(PERIODOS).toEqual([7, 15, 30, 45, 60, 90]);
  });
  it("inicioDoPeriodo = meia-noite local de hoje − (dias − 1); 1 = só hoje (o Diário de hoje da W25)", () => {
    const agora = new Date(2026, 8, 20, 15, 30);
    const d = inicioDoPeriodo(7, agora);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 8, 14, 0, 0]);
    const d30 = inicioDoPeriodo(30, agora);
    expect([d30.getMonth(), d30.getDate()]).toEqual([7, 22]);
    const hoje = inicioDoPeriodo(1, agora);
    expect([hoje.getDate(), hoje.getHours()]).toEqual([20, 0]);
    expect(inicioDoPeriodo(0, agora).getDate()).toBe(20);
    expect(textoPeriodo(7)).toBe("últimos 7 dias");
    expect(textoPeriodo(1)).toBe("hoje");
  });
});

describe("lista da nutricionista", () => {
  const lista = [
    reg("a", iso(2026, 9, 19, 20, 0)),
    reg("b", iso(2026, 9, 20, 12, 40), { reacao_nutri: "otimo", comentario_nutri: "Boa!", reagido_em: iso(2026, 9, 20, 13, 0) }),
    reg("c", iso(2026, 9, 20, 8, 5), { paciente_id: "p2", paciente: { id: "p2", nome: "Érica Lima", apelido: "Eri", link_codigo: "zzz9999999" } }),
  ];
  it("agrupa por dia local, mais recente primeiro, com título", () => {
    const g = agruparPorDia(lista);
    expect(g.map((x) => x.chave)).toEqual(["20/09/2026", "19/09/2026"]);
    expect(g[0].itens.map((i) => i.id)).toEqual(["b", "c"]);
    expect(g[0].titulo).toBe("domingo, 20/09/2026 · 2 registros");
    expect(g[1].titulo).toBe("sábado, 19/09/2026 · 1 registro");
    expect(agruparPorDia([])).toEqual([]);
  });
  // hml-14d (D41): o filtro por aluno/não reagidas, a contagem e os alunos da lista saíram daqui — a aba Diário e o Dashboard filtram e
  // contam no banco desde a hml-14b/14d (diario.ts, contarDiario/useNaoReagidas)
  it("o nome e o primeiro nome da legenda", () => {
    expect(nomeAluno(reg("x", iso(2026, 1, 1, 1, 1), { paciente: null }))).toBe("Aluno");
    expect(primeiroNomeAluno(lista[0])).toBe("Ana");
    expect(primeiroNomeAluno(lista[2])).toBe("Eri");
  });
  it("contagem", () => {
    expect(textoContagem(0, 0, 0)).toBe("Nenhum registro");
    expect(textoContagem(1, 1, 0)).toBe("1 registro em 1 dia");
    expect(textoContagem(3, 2, 2)).toBe("3 registros em 2 dias · 2 não reagidas");
    expect(textoContagem(2, 1, 1)).toBe("2 registros em 1 dia · 1 não reagida");
  });
  it("textos do registro e da reação (sem emoji)", () => {
    expect(textoRegistro(lista[1])).toBe("Almoço · 12:40");
    expect(textoRegistroCompleto(lista[1])).toBe("Almoço · 20/09/2026 12:40");
    expect(chaveDia(lista[0].data_hora)).toBe("19/09/2026");
    expect(textoReacaoNutri(lista[1])).toBe("Ótimo — Boa!");
    expect(textoReacaoNutri({ reacao_nutri: "atencao", comentario_nutri: "" })).toBe("Atenção");
    expect(textoReacaoNutri(lista[0])).toBe("");
    expect(formatarReagidoEm(lista[1].reagido_em ?? "")).toBe("20/09 13:00");
    expect(textoReagidoEm(lista[1].reagido_em)).toBe("Reagido em 20/09 13:00");
    expect(textoReagidoEm(null)).toBe("Reagido");
    expect(COMENTARIO_NUTRI_MAX).toBe(300);
    expect(/\p{Extended_Pictographic}/u.test(textoReacaoNutri(lista[1]))).toBe(false);
  });
});
