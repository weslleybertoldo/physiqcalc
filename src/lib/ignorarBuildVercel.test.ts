import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// O "Ignored Build Step" da Vercel (vercel.json → ignoreCommand): 0 = pula o build, 1 = builda. O site só publica o commit que
// também gera o APK, para a versão do site ser a da release Latest (W7: commit de bump; W9: commit sem GitHub Actions).
const SCRIPT = resolve(__dirname, "../../scripts/vercel/ignorar-build.sh");

function rodar(mensagem: string) {
  const r = spawnSync("bash", [SCRIPT], { env: { ...process.env, VERCEL_GIT_COMMIT_MESSAGE: mensagem }, encoding: "utf8" });
  return { codigo: r.status, saida: r.stdout };
}

describe("scripts/vercel/ignorar-build.sh", () => {
  it("pula o commit de bump do CI (a release já saiu do merge)", () => {
    expect(rodar("chore: bump version to v3.11 [skip ci]").codigo).toBe(0);
  });

  it("pula o commit que o GitHub Actions não roda (sem APK): a marca no título ou no corpo", () => {
    const r = rodar("test(e2e): W8b — testes de produção só limpam a contagem do IP do próprio aparelho [skip actions] (#73)");
    expect(r.codigo).toBe(0);
    expect(r.saida).toContain("[skip actions]");
    expect(rodar("docs: ajuste\n\nSó texto, sem tela. [skip actions]").codigo).toBe(0);
    for (const marca of ["[actions skip]", "[skip ci]", "[ci skip]", "[no ci]"]) expect(rodar(`chore: algo ${marca}`).codigo, marca).toBe(0);
  });

  it("builda o merge normal (que gera o APK), mesmo citando a regra sem os colchetes", () => {
    expect(rodar("feat(treino): W9 — trocar exercício por equivalente (#74)").codigo).toBe(1);
    expect(rodar("fix: a Vercel agora pula os commits com a marca skip actions").codigo).toBe(1);
    expect(rodar("feat: [skip]actions sem espaço não conta").codigo).toBe(1);
  });
});
