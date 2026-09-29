import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Physiq 3.0 (W0): o versionCode do APK é injetado pelos workflows a partir do package.json.
// A fórmula antiga (MAJOR*10000 + MINOR*100 + PATCH) daria 30000 pra "3.0" — MENOR que os 33600
// da 2.136 — e o Android recusaria a atualização por cima. Estes testes leem a fórmula DOS
// PRÓPRIOS workflows (é ela que roda no CI) e conferem que a série 3.x sempre sobe.
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOWS = [".github/workflows/build-apk.yml", ".github/workflows/build-apk-check.yml"];
const FORMULA = /CODE=\$\(\(MA \* (\d+) \+ MI \* (\d+) \+ PA\)\)/;

function formulaDo(workflow: string): { major: number; minor: number } {
  const m = readFileSync(resolve(RAIZ, workflow), "utf8").match(FORMULA);
  if (!m) throw new Error(`fórmula do versionCode não encontrada em ${workflow}`);
  return { major: Number(m[1]), minor: Number(m[2]) };
}

/** Mesmo cálculo do passo "Inject version into build.gradle" (PATCH vazio = 0). */
function versionCode(versao: string, f = formulaDo(WORKFLOWS[0])): number {
  const [ma, mi, pa = "0"] = versao.split(".");
  return Number(ma) * f.major + Number(mi) * f.minor + Number(pa);
}

/** versionCode que a 2.135/2.136 receberam (fórmula antiga). */
const codigoAntigo = (versao: string) => {
  const [ma, mi, pa = "0"] = versao.split(".");
  return Number(ma) * 10000 + Number(mi) * 100 + Number(pa);
};

describe("versionCode do APK (Physiq 3.x)", () => {
  it("os dois workflows usam a mesma fórmula, MAJOR*100000 + MINOR*100 + PATCH", () => {
    const [release, check] = WORKFLOWS.map(formulaDo);
    expect(release).toEqual({ major: 100000, minor: 100 });
    expect(check).toEqual(release);
  });

  it("3.0 fica acima da 2.136 e da última release (2.135)", () => {
    expect(codigoAntigo("2.136")).toBe(33600);
    expect(versionCode("3.0")).toBe(300000);
    expect(versionCode("3.0")).toBeGreaterThan(codigoAntigo("2.136"));
    expect(versionCode("3.0")).toBeGreaterThan(codigoAntigo("2.135"));
  });

  it("o bump do CI (MINOR + 1) sempre sobe dentro da 3.x e na troca pra 4.0", () => {
    let anterior = versionCode("3.0");
    for (let minor = 1; minor <= 999; minor++) {
      const atual = versionCode(`3.${minor}`);
      expect(atual).toBeGreaterThan(anterior);
      anterior = atual;
    }
    expect(versionCode("4.0")).toBeGreaterThan(versionCode("3.999"));
  });

  it("o package.json já está na série 3.x", () => {
    const pkg = JSON.parse(readFileSync(resolve(RAIZ, "package.json"), "utf8")) as { version: string };
    expect(Number(pkg.version.split(".")[0])).toBeGreaterThanOrEqual(3);
    expect(versionCode(pkg.version)).toBeGreaterThan(codigoAntigo("2.136"));
  });
});
