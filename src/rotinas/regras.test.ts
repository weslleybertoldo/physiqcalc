import { describe, expect, it } from "vitest";
import type { RotinaDoDia } from "@/aluno-dia/regras";
import type { MinhasRotinas, Rotina } from "@/aluno-dia/tipos";
import { matricula, situacao } from "@/test/fixturesNucleo";
import {
  alternarDia, atalhoDosDias, comFeita, dadosDoFormulario, ehAlunoDasRotinas, formularioDe, linhaDaRotina, noLimite, proximasDoDia, validarFormulario,
  type FormularioDaRotina,
} from "./regras";

const rotina = (o: Partial<Rotina> = {}): Rotina => ({
  id: "r1", origem: "aluno", paciente_id: null, nome: "Creatina", detalhe: "5 g", tipo: "suplemento", horario: "08:00", dias_semana: [1, 2, 3, 4, 5, 6, 7],
  lembrete: true, ordem: 0, criada_em: "2026-09-01T12:00:00Z", alterada_em: "2026-09-01T12:00:00Z", arquivada_em: null, ...o,
});
const doDia = (id: string, horario: string, feita: boolean): RotinaDoDia => ({ ...rotina({ id, horario }), feita, feita_em: feita ? "2026-09-30T10:00:00Z" : null });
const form = (o: Partial<FormularioDaRotina> = {}): FormularioDaRotina => ({ ...formularioDe(null), nome: "Creatina", ...o });

describe("W-A P3 — quem tem rotinas e o ✓ otimista", () => {
  it("todo login com matrícula (inclusive o aluno do app sem profissional — P9); sem matrícula ou sem situação, não", () => {
    expect(ehAlunoDasRotinas(situacao({ matriculas: [matricula()] }))).toBe(true);
    expect(ehAlunoDasRotinas(situacao({ matriculas: [matricula({ app: true, personal: null })] }))).toBe(true);
    expect(ehAlunoDasRotinas(situacao({ matriculas: [] }))).toBe(false);
    expect(ehAlunoDasRotinas(null)).toBe(false);
  });

  it("comFeita põe e tira o ✓ só daquele dia e daquela rotina (o resto fica igual)", () => {
    const d: MinhasRotinas = { hoje: "2026-09-30", rotinas: [rotina()], feitas: [{ rotina_id: "r1", dia: "2026-09-29", feita_em: "x" }] };
    const com = comFeita(d, "r1", "2026-09-30", true, new Date("2026-09-30T13:00:00Z"));
    expect(com.feitas).toEqual([{ rotina_id: "r1", dia: "2026-09-29", feita_em: "x" }, { rotina_id: "r1", dia: "2026-09-30", feita_em: "2026-09-30T13:00:00.000Z" }]);
    expect(comFeita(com, "r1", "2026-09-30", false).feitas).toEqual([{ rotina_id: "r1", dia: "2026-09-29", feita_em: "x" }]);
    expect(com.rotinas).toBe(d.rotinas);
  });

  it("o limite: 30 vivas (as arquivadas não contam)", () => {
    const trinta = Array.from({ length: 30 }, (_, i) => rotina({ id: `r${i}` }));
    expect(noLimite(trinta)).toBe(true);
    expect(noLimite([...trinta.slice(1), rotina({ id: "x", arquivada_em: "2026-09-01T00:00:00Z" })])).toBe(false);
  });
});

describe("W-A P3 — o card: até 4, primeiro as que faltam", () => {
  it("6 do dia (2 feitas) → as 4 que faltam pela hora e o +2", () => {
    const lista = [doDia("a", "07:00", true), doDia("b", "08:00", false), doDia("c", "09:00", false), doDia("d", "12:00", true), doDia("e", "18:00", false),
      doDia("f", "22:00", false)];
    const { visiveis, resto } = proximasDoDia(lista);
    expect(visiveis.map((r) => r.id)).toEqual(["b", "c", "e", "f"]);
    expect(resto).toBe(2);
  });

  it("3 do dia → todas, sem o +N; as feitas por último", () => {
    const { visiveis, resto } = proximasDoDia([doDia("a", "07:00", true), doDia("b", "08:00", false), doDia("c", "09:00", false)]);
    expect(visiveis.map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(resto).toBe(0);
  });

  it("a linha de baixo da página: o detalhe e os dias", () => {
    expect(linhaDaRotina(rotina({ dias_semana: [1, 2, 3, 4, 5] }))).toBe("5 g · Seg a Sex");
    expect(linhaDaRotina(rotina({ detalhe: null, dias_semana: [1, 3] }))).toBe("Seg e Qua");
  });
});

describe("W-A P3 — o formulário da folha (a forma do banco antes da função)", () => {
  it("nova: tipo suplemento, todos os dias, sem horário e sem lembrete; de uma rotina: os campos dela", () => {
    expect(formularioDe(null)).toEqual({ nome: "", detalhe: "", tipo: "suplemento", horario: "", dias: [1, 2, 3, 4, 5, 6, 7], lembrete: false });
    expect(formularioDe(rotina({ detalhe: null, dias_semana: [5, 1] }))).toEqual({ nome: "Creatina", detalhe: "", tipo: "suplemento", horario: "08:00",
      dias: [1, 5], lembrete: true });
  });

  it("recusa: sem nome, nome > 60, detalhe > 120, hora inválida, nenhum dia, lembrete sem horário — cada um no campo dele", () => {
    expect(validarFormulario(form({ nome: "   " }))).toEqual({ campo: "nome", mensagem: "Dê um nome à rotina." });
    expect(validarFormulario(form({ nome: "x".repeat(61) }))?.campo).toBe("nome");
    expect(validarFormulario(form({ nome: `  ${"x".repeat(60)}  ` }))).toBeNull();
    expect(validarFormulario(form({ detalhe: "y".repeat(121) }))?.campo).toBe("detalhe");
    expect(validarFormulario(form({ horario: "25:00" }))?.campo).toBe("horario");
    expect(validarFormulario(form({ dias: [] }))?.campo).toBe("dias");
    expect(validarFormulario(form({ lembrete: true, horario: "" }))).toEqual({ campo: "lembrete", mensagem: "Escolha um horário para ligar o lembrete." });
    expect(validarFormulario(form({ lembrete: true, horario: "08:00" }))).toBeNull();
  });

  it("os dados da função: aparados, detalhe vazio = null, sem horário = null, dias em ordem sem repetir, lembrete só com horário", () => {
    expect(dadosDoFormulario(form({ nome: "  Creatina   pura ", detalhe: "   ", horario: "", dias: [7, 1, 1], lembrete: true }))).toEqual({
      nome: "Creatina pura", detalhe: null, tipo: "suplemento", horario: null, dias_semana: [1, 7], lembrete: false,
    });
    expect(dadosDoFormulario(form({ tipo: "remedio", detalhe: "1 comprimido", horario: "20:00", lembrete: true }))).toEqual({
      nome: "Creatina", detalhe: "1 comprimido", tipo: "remedio", horario: "20:00", dias_semana: [1, 2, 3, 4, 5, 6, 7], lembrete: true,
    });
  });

  it("os dias: liga/desliga um, e os atalhos das metas", () => {
    expect(alternarDia([1, 2, 3], 2)).toEqual([1, 3]);
    expect(alternarDia([3, 1], 2)).toEqual([1, 2, 3]);
    expect(atalhoDosDias([1, 2, 3, 4, 5, 6, 7])).toBe("todos");
    expect(atalhoDosDias([5, 4, 3, 2, 1])).toBe("semana");
    expect(atalhoDosDias([6, 7])).toBe("fim");
    expect(atalhoDosDias([1, 3])).toBeNull();
  });
});
