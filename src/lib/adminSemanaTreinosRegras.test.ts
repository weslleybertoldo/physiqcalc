import { describe, expect, it } from "vitest";
import {
  periodoDoVolumeValido,
  respostaDoResolver,
  VOLUME_PRATICADO_MAX_DIAS,
} from "../../supabase/functions/admin-semana-treinos/regras";

// hml-14 (H-51 item 5 e H-32) — as decisões puras da admin-semana-treinos: o que o resolverAluno responde e o período que o
// volumePraticado aceita.
const TREINO_ID = "dddddddd-0000-4000-8000-000000000004";

describe("respostaDoResolver (H-51 item 5): sem vínculo e sem acesso respondem IGUAL", () => {
  it("com vínculo e quem chama vê o aluno → o id do Treino", () => {
    expect(respostaDoResolver(TREINO_ID, true)).toEqual({ resposta: { treino_user_id: TREINO_ID }, semAcesso: false });
  });

  it("sem vínculo → { treino_user_id: null }, sem log", () => {
    expect(respostaDoResolver(null, false)).toEqual({ resposta: { treino_user_id: null }, semAcesso: false });
    expect(respostaDoResolver(null, true)).toEqual({ resposta: { treino_user_id: null }, semAcesso: false });
  });

  it("com vínculo que quem chama NÃO vê → a mesma resposta de sem vínculo (antes: 403), e o semAcesso vai só para o log", () => {
    const semAcesso = respostaDoResolver(TREINO_ID, false);
    expect(semAcesso).toEqual({ resposta: { treino_user_id: null }, semAcesso: true });
    // o que sai para quem chama é idêntico, byte a byte
    expect(JSON.stringify(semAcesso.resposta)).toBe(JSON.stringify(respostaDoResolver(null, false).resposta));
  });
});

describe("periodoDoVolumeValido (H-32, D9): no máximo 31 dias", () => {
  it("a semana que a tela pede (7 dias) vale", () => {
    expect(periodoDoVolumeValido("2026-10-05", "2026-10-11")).toBe(true);
  });

  it("1 dia (início = fim) vale", () => {
    expect(periodoDoVolumeValido("2026-10-09", "2026-10-09")).toBe(true);
  });

  it("31 dias (contando o 1º e o último) vale; 32 não", () => {
    expect(VOLUME_PRATICADO_MAX_DIAS).toBe(31);
    expect(periodoDoVolumeValido("2026-01-01", "2026-01-31")).toBe(true);
    expect(periodoDoVolumeValido("2026-01-01", "2026-02-01")).toBe(false);
  });

  it("60 dias → não vale (a prova da spec §4)", () => {
    expect(periodoDoVolumeValido("2026-08-01", "2026-09-29")).toBe(false);
  });

  it("atravessa o ano e o fevereiro bissexto contando os dias certos", () => {
    expect(periodoDoVolumeValido("2025-12-15", "2026-01-14")).toBe(true); // 31 dias
    expect(periodoDoVolumeValido("2028-02-01", "2028-03-02")).toBe(true); // 2028 é bissexto: 31 dias
    expect(periodoDoVolumeValido("2028-02-01", "2028-03-03")).toBe(false); // 32
  });

  it("início depois do fim → não vale", () => {
    expect(periodoDoVolumeValido("2026-10-11", "2026-10-05")).toBe(false);
  });

  it("data que não existe, fora do formato ou que não é texto → não vale", () => {
    expect(periodoDoVolumeValido("2026-02-30", "2026-03-01")).toBe(false);
    expect(periodoDoVolumeValido("2026-13-01", "2026-13-02")).toBe(false);
    expect(periodoDoVolumeValido("2026-10-5", "2026-10-11")).toBe(false);
    expect(periodoDoVolumeValido("2026-10-05T00:00:00Z", "2026-10-11")).toBe(false);
    expect(periodoDoVolumeValido(["2026-10-05"], "2026-10-11")).toBe(false);
    expect(periodoDoVolumeValido(undefined, "2026-10-11")).toBe(false);
    expect(periodoDoVolumeValido(null, null)).toBe(false);
    expect(periodoDoVolumeValido(20261005, 20261011)).toBe(false);
  });
});
