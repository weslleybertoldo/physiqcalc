// Physiq hml-20c (⚪ H-106 · a lição ⚪7 da revisão da 20b) — a URL assinada que o servidor devolve RELATIVA (/storage/v1/object/sign/…)
// é montada com o domínio do cliente num lugar SÓ (src/nutricao/leitura.ts → urlAssinadaDoServidor). Antes eram 3 cópias: esta, a
// urlDoServidor da Evolução (src/evolucao/fontes.ts) e a privada do app do aluno (src/nutricao/app/pacienteApp.ts) — as 2 importam esta,
// com a MESMA saída para as mesmas entradas e a base que cada uma passava (o cliente do principal); as URLs do diário do painel também.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/principal/client", () => ({ PRINCIPAL_URL: "https://api-principal.exemplo.br", principal: {} }));
vi.mock("@/nutricao/editor/lib/banco", () => ({ supabase: {} }));

import { urlAssinadaDoServidor } from "./leitura";

const RAIZ = resolve(__dirname, "../..");
const REL = "/storage/v1/object/sign/diario-staging/n/a/1.jpg?token=t";

/** A montagem de antes (a mesma nas 3 cópias), para comparar a saída. */
const deAntes = (base: string, relativa: unknown): string | null =>
  typeof relativa !== "string" || !relativa.startsWith("/storage/v1/object/sign/") || !base ? null : `${base.replace(/\/+$/, "")}${relativa}`;

describe("hml-20c (H-106) — uma montagem só da URL relativa, com a mesma saída de antes", () => {
  it("válida: o domínio do cliente + o caminho relativo; a barra no fim da base não dobra; a base padrão é o cliente do principal", () => {
    expect(urlAssinadaDoServidor(REL)).toBe(`https://api-principal.exemplo.br${REL}`);
    expect(urlAssinadaDoServidor(REL, "https://api.x.br/")).toBe(`https://api.x.br${REL}`);
    expect(urlAssinadaDoServidor(REL, "https://api.x.br///")).toBe(`https://api.x.br${REL}`);
  });

  it("fora do prefixo de leitura (absoluta, pública, sem a barra, upload), não texto, ou sem domínio → null", () => {
    for (const r of ["https://outro.site/x.jpg", "/storage/v1/object/public/a.jpg", "storage/v1/object/sign/a.jpg", "/storage/v1/object/upload/sign/a.jpg", null, 3, undefined]) {
      expect(urlAssinadaDoServidor(r, "https://api.x.br"), String(r)).toBeNull();
    }
    expect(urlAssinadaDoServidor(REL, "")).toBeNull();
  });

  it("a MESMA saída da montagem de antes para as mesmas entradas (as 3 cópias eram iguais)", () => {
    const bases = ["https://api.x.br", "https://api.x.br/", ""];
    const relativas = [REL, "/storage/v1/object/sign/evolucao/a b.jpg?token=x", "https://x/y", "", null];
    for (const b of bases) for (const r of relativas) expect(urlAssinadaDoServidor(r, b), `${b} ${String(r)}`).toBe(deAntes(b, r));
  });

  it("no src/ inteiro, o prefixo da URL assinada só é montado em leitura.ts; a Evolução e o app do aluno importam a função (sem cópia)", () => {
    const andar = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const c = join(dir, n);
        return statSync(c).isDirectory() ? andar(c) : /\.(ts|tsx)$/.test(n) && !/\.(test|spec)\./.test(n) ? [c] : [];
      });
    const comPrefixo = andar(resolve(RAIZ, "src")).filter((arq) => /["'`]\/storage\/v1\/object\/sign\//.test(readFileSync(arq, "utf-8")));
    expect(comPrefixo.map((a) => relative(RAIZ, a))).toEqual(["src/nutricao/leitura.ts"]);
    for (const arq of ["src/evolucao/fontes.ts", "src/nutricao/app/pacienteApp.ts", "src/painel/dietas/diario.ts"]) {
      const fonte = readFileSync(resolve(RAIZ, arq), "utf-8");
      expect(fonte, arq).toMatch(/import \{[^}]*\burlAssinadaDoServidor\b[^}]*\} from "@\/nutricao\/leitura";/);
      expect(fonte, arq).not.toMatch(/function urlAssinadaDoServidor|function urlDoServidor/);
    }
  });
});
