import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

// hml-08 (H-22) — o painel master fica só no site: o build do app (VITE_APP_NATIVO=1) e o app nativo (Capacitor) não abrem o master.
const h = vi.hoisted(() => ({ nativo: false }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => h.nativo } }));

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ler = (caminho: string) => readFileSync(resolve(RAIZ, caminho), "utf8");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  h.nativo = false;
});

describe("plataforma: onde o master abre (hml-08)", () => {
  it("site (navegador, build sem VITE_APP_NATIVO): o master abre", async () => {
    vi.stubEnv("VITE_APP_NATIVO", "");
    const m = await import("./plataforma");
    expect(m.BUILD_DO_APP).toBe(false);
    expect(m.masterNesteAparelho()).toBe(true);
  });

  it("app nativo (Capacitor), mesmo num build sem a flag (feito à mão): o master não abre", async () => {
    vi.stubEnv("VITE_APP_NATIVO", "");
    h.nativo = true;
    const m = await import("./plataforma");
    expect(m.BUILD_DO_APP).toBe(false);
    expect(m.masterNesteAparelho()).toBe(false);
  });

  it("build do app (VITE_APP_NATIVO=1): o master não abre nem no navegador (o preview do build:apk)", async () => {
    vi.stubEnv("VITE_APP_NATIVO", "1");
    const m = await import("./plataforma");
    expect(m.BUILD_DO_APP).toBe(true);
    expect(m.masterNesteAparelho()).toBe(false);
  });

  it("só o valor exato '1' liga a flag", async () => {
    for (const v of ["0", "true", "sim", " 1", "01"]) {
      vi.resetModules();
      vi.stubEnv("VITE_APP_NATIVO", v);
      const m = await import("./plataforma");
      expect(m.BUILD_DO_APP, JSON.stringify(v)).toBe(false);
    }
  });
});

describe("os builds do app saem sem o master (hml-08)", () => {
  it("npm run build:apk e build:loja ligam a flag; o npm run build (site, Vercel) não", () => {
    const { scripts } = JSON.parse(ler("package.json")) as { scripts: Record<string, string> };
    expect(scripts["build:apk"]).toBe("VITE_APP_NATIVO=1 vite build");
    expect(scripts["build:loja"]).toMatch(/(^| )VITE_APP_NATIVO=1 vite build$/);
    expect(scripts.build).toBe("vite build");
  });

  it("a condição que corta o master do bundle é a expressão do Vite direto no Rotas.tsx e no registro.ts (sem função no meio)", () => {
    expect(ler("src/rotas/Rotas.tsx")).toContain(
      'const RotasMaster = import.meta.env.VITE_APP_NATIVO === "1" ? null : lazy(() => import("@/master/RotasMaster"));',
    );
    expect(ler("src/rotas/registro.ts")).toMatch(/paginasMaster: import\.meta\.env\.VITE_APP_NATIVO === "1" \? \(\{\} as Grupo\) : montarGrupo\(import\.meta\.glob\(\["\/src\/master\/paginas\/\*\.tsx"/);
  });

  it("o APK (build-apk.yml e o check da branch) sai do build:apk e passa pelo sem-master.sh logo depois", () => {
    for (const arquivo of [".github/workflows/build-apk.yml", ".github/workflows/build-apk-check.yml"]) {
      const wf = ler(arquivo);
      const job = wf.slice(0, wf.indexOf("\n  aab-loja:"));
      const build = job.indexOf("run: npm run build:apk\n");
      const conferir = job.indexOf("run: bash scripts/ci/sem-master.sh dist\n");
      const sync = job.indexOf("run: npx cap sync android");
      expect(build, arquivo).toBeGreaterThan(0);
      expect(conferir, arquivo).toBeGreaterThan(build);
      expect(sync, arquivo).toBeGreaterThan(conferir);
      expect(job, arquivo).not.toMatch(/run: npm run build\n/);
    }
  });

  it("o AAB confere o dist/ no passo web e o JS de dentro do AAB na (f); o script do CI é executável", () => {
    const aab = ler("scripts/ci/aab-loja.sh");
    const web = aab.slice(aab.indexOf("passo_web() {"), aab.indexOf("passo_gradle() {"));
    expect(web).toMatch(/npm run build:loja[\s\S]*bash "\$RAIZ\/scripts\/ci\/sem-master\.sh" dist[\s\S]*npx cap sync android/);
    const conferir = aab.slice(aab.indexOf("passo_conferir() {"), aab.indexOf("passo_local() {"));
    expect(conferir).toContain('conferir_sem_master "$aab" || falhas=$((falhas + 1))');
    expect(aab).toContain("sem-master) conferir_sem_master");
    expect(statSync(resolve(RAIZ, "scripts/ci/sem-master.sh")).mode & 0o111).not.toBe(0);
    for (const marca of ["master-contas", "master-professores", "Contas, planos e alunos"]) expect(ler("scripts/ci/sem-master.sh")).toContain(`"${marca}"`);
  });
});
