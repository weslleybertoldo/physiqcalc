import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { padraoVibracaoAndroid, tonsDoSom, type SomDescanso } from "./somDescanso";

// O fim do descanso no APK vibra e toca pelo serviço nativo (TimerForegroundService), que roda sem a WebView: ele guarda
// uma cópia da tabela de tons e do padrão de vibração. Sem Java/Android SDK aqui, a prova de que o nativo usa o MESMO
// ritmo do web é ler o .java e comparar os números com os de src/lib/somDescanso.ts.
const SERVICO = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../android/app/src/main/java/com/bertoldo/physiqcalc/TimerForegroundService.java",
);
const PLUGIN = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../android/app/src/main/java/com/bertoldo/physiqcalc/CountdownNotificationPlugin.java",
);
const java = readFileSync(SERVICO, "utf8");

const numeros = (txt: string) => txt.split(",").map((x) => Number(x.trim()));

/** {som → padrão} das linhas `if ("<som>".equals(som)) return new long[]{…};` do padraoVibracao. */
function padroesDoJava(): Record<string, number[]> {
  const corpo = java.slice(java.indexOf("static long[] padraoVibracao(String som)"));
  const fim = corpo.indexOf("\n    }");
  const bloco = corpo.slice(0, fim);
  const out: Record<string, number[]> = {};
  for (const m of bloco.matchAll(/if \("(\w+)"\.equals\(som\)\) return new long\[\]\{([^}]*)\};/g)) out[m[1]] = numeros(m[2]);
  if (/if \("silencio"\.equals\(som\)\) return new long\[0\];/.test(bloco)) out.silencio = [];
  return out;
}

/** {som → tons} das linhas do tonsDoSom do .java. */
function tonsDoJava(som: string): number[][] {
  const corpo = java.slice(java.indexOf("static double[][] tonsDoSom(String som)"));
  const ini = corpo.indexOf(`if ("${som}".equals(som))`);
  const trecho = corpo.slice(ini, corpo.indexOf("}\n", corpo.indexOf("};", ini)));
  return [...trecho.matchAll(/\{([\d.,\s]+)\}/g)].map((m) => numeros(m[1]));
}

describe("vibração do fim do descanso — nativo (Java) = web (TS)", () => {
  const SONS: SomDescanso[] = ["bip", "sino", "alarme", "vibrar", "silencio"];

  it("o padraoVibracao do serviço nativo tem os mesmos números do padraoVibracaoAndroid do web, som a som", () => {
    const doJava = padroesDoJava();
    for (const som of SONS) expect(doJava[som], som).toEqual(padraoVibracaoAndroid(som));
  });

  it("a tabela de tons do nativo é a do web (o ritmo da vibração sai dela)", () => {
    for (const som of ["bip", "sino", "alarme"] as const) expect(tonsDoJava(som), som).toEqual(tonsDoSom(som));
  });

  it("o fim do descanso e a prévia passam o som escolhido pra vibração", () => {
    expect(java).toContain("vibrar(this, som);");
    expect(java).not.toMatch(/long\[\] pattern = \{0, 3000/);
    const plugin = readFileSync(PLUGIN, "utf8");
    expect(plugin).toMatch(/call\.getString\("som", "vibrar"\)/);
    expect(plugin).toContain("TimerForegroundService.vibrar(getContext(), som);");
  });
});
