import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Session } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  aalDoToken,
  codigoValido,
  erroDoCodigo,
  estadoDoisFatores,
  fatoresVerificados,
  fatorParaPedir,
  ligadaDesde,
  limparCodigo,
  pedeCodigo,
  qrComoImagem,
  TEXTO_ERRO_CODIGO,
} from "./doisFatoresRegras";

// hml-22 (H-22) — o 2FA do master no site: a regra pura da tela do código, os textos e as travas de fonte (o corte do app e a marca).
const RAIZ = resolve(__dirname, "../..");
const ler = (caminho: string) => readFileSync(resolve(RAIZ, caminho), "utf8");
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const token = (claims: Record<string, unknown>) => `cab.${b64(claims)}.ass`;
const verificado = { id: "f1", factor_type: "totp", status: "verified", created_at: "2026-10-14T18:59:00Z", updated_at: "2026-10-14T19:01:00Z" };
const pelaMetade = { id: "f2", factor_type: "totp", status: "unverified", created_at: "2026-10-14T18:00:00Z", updated_at: "2026-10-14T18:00:00Z" };
const sessao = (aal: string | null, factors?: unknown[]) =>
  ({ access_token: token(aal ? { sub: "u1", aal } : { sub: "u1" }), user: { id: "u1", factors } }) as unknown as Pick<Session, "access_token" | "user">;

/** Os arquivos .ts/.tsx do src/ fora dos testes. */
function fontes(pasta = resolve(RAIZ, "src")): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return nome === "test" ? [] : fontes(caminho);
    return /\.(ts|tsx)$/.test(nome) && !/\.test\.(ts|tsx)$/.test(nome) ? [relative(RAIZ, caminho)] : [];
  });
}

describe("hml-22 — pedeCodigo: quando o site pede o código do app autenticador", () => {
  it("sem sessão ou sem usuário: nunca", () => {
    expect(pedeCodigo(null)).toBe(false);
    expect(pedeCodigo(undefined)).toBe(false);
    expect(pedeCodigo({ access_token: token({ aal: "aal1" }) } as unknown as Pick<Session, "access_token" | "user">)).toBe(false);
  });
  it("sem fator (hoje: todo mundo): nunca — aal1, aal2 ou sem a claim", () => {
    for (const aal of ["aal1", "aal2", null]) {
      expect(pedeCodigo(sessao(aal))).toBe(false);
      expect(pedeCodigo(sessao(aal, []))).toBe(false);
    }
  });
  it("só o cadastro pela metade (fator não verificado): não pede", () => {
    expect(pedeCodigo(sessao("aal1", [pelaMetade]))).toBe(false);
  });
  it("fator verificado + aal1 (senha ou Google): pede; + aal2 (depois do código): livre", () => {
    expect(pedeCodigo(sessao("aal1", [verificado]))).toBe(true);
    expect(pedeCodigo(sessao("aal1", [pelaMetade, verificado]))).toBe(true);
    expect(pedeCodigo(sessao("aal2", [verificado]))).toBe(false);
    expect(estadoDoisFatores(sessao("aal1", [verificado]))).toBe("pede_codigo");
    expect(estadoDoisFatores(sessao("aal2", [verificado]))).toBe("livre");
    expect(estadoDoisFatores(null)).toBe("livre");
  });
  it("fator verificado + token sem a claim aal (ou quebrado): pede (só o aal2 libera)", () => {
    expect(pedeCodigo(sessao(null, [verificado]))).toBe(true);
    expect(pedeCodigo({ access_token: "quebrado", user: { id: "u1", factors: [verificado] } } as unknown as Pick<Session, "access_token" | "user">)).toBe(true);
    expect(aalDoToken("quebrado")).toBeNull();
    expect(aalDoToken(token({ aal: "aal2" }))).toBe("aal2");
  });
});

describe("hml-22 — fatores, código e datas", () => {
  it("fatoresVerificados: só os 'verified' com id; o resto fica de fora", () => {
    expect(fatoresVerificados([verificado, pelaMetade, null, "x", { status: "verified" }, { id: "f3", status: "VERIFIED" }]))
      .toEqual([{ id: "f1", status: "verified", factor_type: "totp", created_at: verificado.created_at, updated_at: verificado.updated_at }]);
    expect(fatoresVerificados(undefined)).toEqual([]);
    expect(fatoresVerificados({ status: "verified", id: "f1" })).toEqual([]);
  });
  it("fatorParaPedir: o TOTP verificado (nenhum → null)", () => {
    expect(fatorParaPedir([pelaMetade, verificado])?.id).toBe("f1");
    expect(fatorParaPedir([{ ...verificado, id: "p1", factor_type: "phone" }, verificado])?.id).toBe("f1");
    expect(fatorParaPedir([pelaMetade])).toBeNull();
  });
  it("o código: exatamente 6 números; o que vem colado com espaço ou traço é limpo", () => {
    expect(codigoValido("123456")).toBe(true);
    for (const c of ["12345", "1234567", "12345a", " 123456", ""]) expect(codigoValido(c), c).toBe(false);
    expect(limparCodigo("123 456")).toBe("123456");
    expect(limparCodigo("12-34-56-78")).toBe("123456");
    expect(limparCodigo("abc")).toBe("");
  });
  it("o erro do Auth vira o texto da tela (§2.5): errado, muitas tentativas, fator sumiu, o resto", () => {
    expect(erroDoCodigo({ status: 422, code: "mfa_verification_failed" })).toBe("errado");
    expect(erroDoCodigo({ status: 429, code: "over_request_rate_limit" })).toBe("muitas");
    expect(erroDoCodigo({ status: 429 })).toBe("muitas");
    expect(erroDoCodigo({ status: 404, code: "mfa_factor_not_found" })).toBe("sem_fator");
    expect(erroDoCodigo({ status: 422, code: "mfa_challenge_expired" })).toBe("falhou");
    expect(erroDoCodigo({ status: 0, name: "AuthRetryableFetchError" })).toBe("falhou");
    expect(erroDoCodigo(null)).toBe("falhou");
    expect(TEXTO_ERRO_CODIGO).toEqual({
      errado: "Código errado. Confira o app e tente de novo.",
      muitas: "Muitas tentativas. Espere alguns minutos.",
      falhou: "Não deu para conferir agora. Tente de novo.",
    });
  });
  it("o QR do cadastro vai codificado no <img> (o \"#\" de uma cor no SVG não corta a imagem); outro formato passa como veio", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#000000" width="10%"/></svg>';
    const img = qrComoImagem(`data:image/svg+xml;utf-8,${svg}`);
    expect(img.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(img).not.toContain("#");
    expect(decodeURIComponent(img.slice("data:image/svg+xml;charset=utf-8,".length))).toBe(svg);
    expect(qrComoImagem("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
  });
  it("'Ligada desde': o dia (em São Paulo) da verificação do fator", () => {
    expect(ligadaDesde(verificado)).toBe("14/10/2026");
    expect(ligadaDesde({ created_at: "2026-10-15T02:30:00Z", updated_at: null })).toBe("14/10/2026");
    expect(ligadaDesde({ created_at: null, updated_at: null })).toBeNull();
    expect(ligadaDesde({ created_at: "x", updated_at: null })).toBeNull();
    expect(ligadaDesde(null)).toBeNull();
  });
});

describe("hml-22 — as telas do 2FA são só do site (o corte do app e a 4ª marca do sem-master)", () => {
  it("o Rotas.tsx corta a tela do código com a MESMA expressão do master (sem função no meio)", () => {
    expect(ler("src/rotas/Rotas.tsx")).toContain(
      'const TelaCodigo = import.meta.env.VITE_APP_NATIVO === "1" ? null : lazy(() => import("@/master/doisFatores/TelaCodigo"));',
    );
  });
  it("a tela do código vem antes das 3 áreas logadas (o app do aluno, o painel e o master); a entrada e as públicas, não", () => {
    const rotas = ler("src/rotas/Rotas.tsx");
    expect(rotas).toContain("<Route element={<ComCodigo><AppAlunoLayout /></ComCodigo>}>");
    expect(rotas).toMatch(/path="\/painel\/\*" element=\{<ComCodigo>/);
    expect(rotas).toMatch(/path="\/master\/\*" element=\{<ComCodigo>/);
    expect(rotas.match(/<ComCodigo>/g)).toHaveLength(3);
  });
  it("o MasterLayout repete a barreira DEPOIS de conferir que é master", () => {
    const layout = ler("src/master/MasterLayout.tsx");
    const master = layout.indexOf("if (!dados.ehMaster) return");
    const barreira = layout.indexOf('if (doisFatores === "pede_codigo") return <TelaCodigo />;');
    expect(master).toBeGreaterThan(-1);
    expect(barreira).toBeGreaterThan(master);
  });
  it("a 4ª marca do sem-master.sh existe e só aparece nas telas do 2FA (src/master/doisFatores/)", () => {
    expect(ler("scripts/ci/sem-master.sh")).toContain('"Verificação em 2 etapas"');
    const com = fontes().filter((f) => ler(f).includes("Verificação em 2 etapas"));
    expect(com.length).toBeGreaterThan(0);
    expect(com.every((f) => f.startsWith("src/master/doisFatores/")), com.join(", ")).toBe(true);
  });
  it("as regras puras (vão para o app) não chamam o Auth nem levam a marca; as chamadas do 2FA moram só no mfa.ts (LOGIN da guarda)", () => {
    const regras = ler("src/nucleo/doisFatoresRegras.ts");
    expect(regras).not.toMatch(/\.auth\s*\./);
    expect(regras).not.toContain("Verificação em 2 etapas");
    const comMfa = fontes().filter((f) => /\.auth\s*\.\s*mfa\s*\./.test(ler(f)));
    expect(comMfa).toEqual(["src/master/doisFatores/mfa.ts"]);
    expect(ler("src/integrations/semBancoNoNavegador.test.ts")).toMatch(/LOGIN = \[[\s\S]*"src\/master\/doisFatores\/mfa\.ts"[\s\S]*\] as const;/);
  });
});
