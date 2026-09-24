import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// O fim do descanso vibra pelo serviço nativo (TimerForegroundService.vibrar) e a prévia "Ouvir" pelo
// navigator.vibrate da WebView — os dois exigem a permissão VIBRATE; sem ela o Android bloqueia calado
// e o "Só vibrar" fica mudo (foi assim até a v2.132).
const MANIFESTO = resolve(dirname(fileURLToPath(import.meta.url)), "../../android/app/src/main/AndroidManifest.xml");

describe("AndroidManifest", () => {
  it("declara a permissão de vibrar", () => {
    expect(readFileSync(MANIFESTO, "utf8")).toMatch(
      /<uses-permission\s+android:name="android\.permission\.VIBRATE"\s*\/>/,
    );
  });
});
