// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/anamneseSistema.test.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PERGUNTAS_MAX, PERGUNTA_MAX, TITULO_MAX, ehModeloDoSistema, ordenarModelos, temModeloProprio, tituloCopia } from "./anamneseUtil";

// W40 — o modelo de anamnese DO SISTEMA nasce na migration (fonte única). Aqui lemos o arquivo e conferimos o seed,
// mais as regras puras novas (origem, ordem, cópia).
// (vitest roda com cwd na raiz do repo; `import.meta.url` no ambiente jsdom vira http:// e não serve pra ler arquivo)
const MIGRATION = resolve(process.cwd(), "supabase-principal/migrations/20260920120000_anamnese_sistema.sql");
const BLOCOS = ["História do cliente", "Histórico de peso", "História alimentar", "Sinais e sintomas", "Exames e medidas"];

function seedDaMigration(): { titulo: string; perguntas: string[] } {
  const sql = readFileSync(MIGRATION, "utf-8");
  const m = sql.match(/'sistema:sicnut', '([^']+)', '(\[[\s\S]*?\])'::jsonb/);
  if (!m) throw new Error("seed do modelo do sistema não encontrado na migration");
  return { titulo: m[1], perguntas: JSON.parse(m[2]) as string[] };
}

describe("seed do modelo do sistema (migration W40)", () => {
  const seed = seedDaMigration();

  it("título cabe no limite e diz que é o padrão SICNUT", () => {
    expect(seed.titulo.length).toBeLessThanOrEqual(TITULO_MAX);
    expect(seed.titulo).toContain("SICNUT");
  });

  it("32 perguntas únicas, cada uma dentro do limite, sem aspas simples (a migration usa aspas simples no SQL)", () => {
    expect(seed.perguntas).toHaveLength(32);
    expect(seed.perguntas.length).toBeLessThanOrEqual(PERGUNTAS_MAX);
    const chaves = new Set(seed.perguntas.map((p) => p.trim().toLowerCase()));
    expect(chaves.size).toBe(seed.perguntas.length);
    for (const p of seed.perguntas) {
      expect(p.trim()).toBe(p);
      expect(p.length).toBeGreaterThan(10);
      expect(p.length).toBeLessThanOrEqual(PERGUNTA_MAX);
      expect(p).not.toContain("'");
    }
  });

  it("toda pergunta começa por um dos 5 blocos e cada bloco tem pelo menos 2 perguntas", () => {
    const porBloco = new Map<string, number>(BLOCOS.map((b) => [b, 0]));
    for (const p of seed.perguntas) {
      const bloco = BLOCOS.find((b) => p.startsWith(`${b} — `));
      expect(bloco, p).toBeDefined();
      porBloco.set(bloco as string, (porBloco.get(bloco as string) ?? 0) + 1);
    }
    for (const b of BLOCOS) expect(porBloco.get(b), b).toBeGreaterThanOrEqual(2);
  });

  it("traz o recordatório de 24 horas e os marcadores de consumo do SISVAN (saudável e ultraprocessados)", () => {
    const texto = seed.perguntas.join("\n");
    expect(texto).toContain("Recordatório de 24 horas");
    expect(texto).toContain("marcadores SISVAN de alimentação saudável");
    expect(texto).toContain("marcadores SISVAN de ultraprocessados");
  });
});

describe("ehModeloDoSistema / ordenarModelos / temModeloProprio", () => {
  const sistema = { id: "s", titulo: "Anamnese nutricional completa (padrão SICNUT)", favorito: false, nutricionista_id: null };
  const favorito = { id: "f", titulo: "Zeta favorita", favorito: true, nutricionista_id: "u1" };
  const proprioA = { id: "a", titulo: "Alfa própria", favorito: false, nutricionista_id: "u1" };
  const proprioB = { id: "b", titulo: "Beta própria", favorito: false, nutricionista_id: "u1" };

  it("só NULL é do sistema (undefined e string não são)", () => {
    expect(ehModeloDoSistema(sistema)).toBe(true);
    expect(ehModeloDoSistema(proprioA)).toBe(false);
    expect(ehModeloDoSistema({})).toBe(false);
  });

  it("ordem: favoritos → próprios (alfabético) → do sistema", () => {
    expect(ordenarModelos([sistema, proprioB, favorito, proprioA]).map((m) => m.id)).toEqual(["f", "a", "b", "s"]);
  });

  it("modelo do sistema favoritado não sobe: continua no fim", () => {
    expect(ordenarModelos([{ ...sistema, favorito: true }, proprioA]).map((m) => m.id)).toEqual(["a", "s"]);
  });

  it("temModeloProprio ignora os do sistema e os de outras profissionais", () => {
    expect(temModeloProprio([sistema], "u1")).toBe(false);
    expect(temModeloProprio([sistema, { nutricionista_id: "u2" }], "u1")).toBe(false);
    expect(temModeloProprio([sistema, proprioA], "u1")).toBe(true);
  });
});

describe("tituloCopia", () => {
  it("acrescenta o sufixo e cabe no TITULO_MAX", () => {
    expect(tituloCopia("Anamnese nutricional completa (padrão SICNUT)")).toBe("Anamnese nutricional completa (padrão SICNUT) (minha cópia)");
    const longo = tituloCopia("x".repeat(TITULO_MAX));
    expect(longo.length).toBe(TITULO_MAX);
    expect(longo.endsWith(" (minha cópia)")).toBe(true);
  });
});
