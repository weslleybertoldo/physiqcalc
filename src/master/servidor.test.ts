import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ehAcaoConta, ehMaster, emailDeTeste, idsDe, lerPedidoCriarConta, masterComAal, origemDoApp, schemaDoPedido, statusDoErro,
  temFatorVerificado, textoDoAvisoDePlano,
} from "../../supabase-principal/functions/_shared/master-regras";

const ler = (caminho: string) => readFileSync(resolve(__dirname, "../..", caminho), "utf-8");

describe("funções do master (W27) — quem é master e o que cada ação recebe", () => {
  it("master = papel no Auth OU perfil master do schema (a mesma regra do sou_master)", () => {
    expect(ehMaster({ role: "master" }, null)).toBe(true);
    expect(ehMaster({}, "master")).toBe(true);
    expect(ehMaster({ role: "paciente" }, "pessoa")).toBe(false);
    expect(ehMaster(null, null)).toBe(false);
  });
  it("schema do pedido e contas de teste do staging (P26)", () => {
    expect(schemaDoPedido(null)).toBe("public");
    expect(schemaDoPedido("STAGING")).toBe("staging");
    expect(schemaDoPedido("outro")).toBeNull();
    expect(emailDeTeste("w27.dono.a.teste.claude@physiqnutri.app")).toBe(true);
    expect(emailDeTeste("teste@teste.com")).toBe(true);
    expect(emailDeTeste("pessoa@gmail.com")).toBe(false);
  });
  it("Nova conta: e-mail, nome, tipo, plano, senha e motivo da isenção", () => {
    const base = { email: "Novo.Teste.Claude@physiqnutri.app", nome: "Ana", tipo: "personal", plano: "treino", faixa: "f30", modo: "senha", senha: "abcd1234" };
    const ok = lerPedidoCriarConta(base, "staging");
    expect(ok.ok && ok.pedido.email).toBe("novo.teste.claude@physiqnutri.app");
    expect(ok.ok && ok.pedido.nome_conta).toBe("Ana");
    expect(lerPedidoCriarConta({ ...base, email: "real@gmail.com" }, "staging")).toEqual({ ok: false, erro: "conta_real_no_staging" });
    expect(lerPedidoCriarConta({ ...base, email: "real@gmail.com" }, "public").ok).toBe(true);
    expect(lerPedidoCriarConta({ ...base, senha: "123" }, "staging")).toEqual({ ok: false, erro: "senha_curta" });
    expect(lerPedidoCriarConta({ ...base, modo: "google", senha: null }, "staging").ok).toBe(true);
    expect(lerPedidoCriarConta({ ...base, tipo: "chef" }, "staging")).toEqual({ ok: false, erro: "tipo_invalido" });
    expect(lerPedidoCriarConta({ ...base, plano: "premium" }, "staging")).toEqual({ ok: false, erro: "plano_invalido" });
    expect(lerPedidoCriarConta({ ...base, isentar: true, motivo: "" }, "staging")).toEqual({ ok: false, erro: "motivo_obrigatorio" });
    expect(lerPedidoCriarConta({ ...base, email: "x" }, "public")).toEqual({ ok: false, erro: "email_invalido" });
  });
  it("ações, ids, status HTTP e o texto do aviso do plano", () => {
    expect(ehAcaoConta("isentar")).toBe(true);
    expect(ehAcaoConta("apagar_tudo")).toBe(false);
    expect(idsDe(["a", "3f1b6c1e-1111-4111-8111-111111111111", "3f1b6c1e-1111-4111-8111-111111111111"])).toEqual(["3f1b6c1e-1111-4111-8111-111111111111"]);
    expect(idsDe("x")).toEqual([]);
    expect(statusDoErro("so_master")).toBe(403);
    expect(statusDoErro("so_no_site")).toBe(403);
    expect(statusDoErro("sem_login")).toBe(401);
    expect(statusDoErro("conta_inexistente")).toBe(404);
    expect(statusDoErro("motivo_obrigatorio")).toBe(400);
    expect(textoDoAvisoDePlano({ situacao_efetiva: "vencida", vence_em: "2026-10-01" })).toContain("venceu em 01/10");
    expect(textoDoAvisoDePlano({ situacao_efetiva: "teste", teste_ate: "2026-10-16" })).toContain("até 16/10");
    expect(textoDoAvisoDePlano({ situacao_efetiva: "ativa", vence_em: "2026-11-02" })).toContain("vence em 02/11");
    expect(textoDoAvisoDePlano({}, "  Mensagem do master  ")).toBe("Mensagem do master");
  });
});

describe("hml-08 (H-22) — o painel master é só do site", () => {
  it("as origens do app (WebView do Android e do iOS) são recusadas; as do site, não", () => {
    expect(origemDoApp("https://localhost")).toBe(true);
    expect(origemDoApp("capacitor://localhost")).toBe(true);
    expect(origemDoApp("https://physiqcalc.com.br")).toBe(false);
    expect(origemDoApp("https://physiqcalc-staging.vercel.app")).toBe(false);
    expect(origemDoApp("http://localhost:8080")).toBe(false);
    expect(origemDoApp("https://localhost.evil.com")).toBe(false);
    expect(origemDoApp(null)).toBe(false);
    expect(origemDoApp(undefined)).toBe(false);
  });
});

describe("hml-22 (H-22) — o 2FA do master no servidor (a regra do master_aal_ok do banco)", () => {
  const verificado = { id: "f1", factor_type: "totp", status: "verified" };
  const pelaMetade = { id: "f2", factor_type: "totp", status: "unverified" };

  it("fator verificado = qualquer fator com status 'verified' (o cadastro pela metade não conta)", () => {
    expect(temFatorVerificado([verificado])).toBe(true);
    expect(temFatorVerificado([pelaMetade, verificado])).toBe(true);
    expect(temFatorVerificado([pelaMetade])).toBe(false);
    expect(temFatorVerificado([])).toBe(false);
    expect(temFatorVerificado(undefined)).toBe(false);
    expect(temFatorVerificado(null)).toBe(false);
    expect(temFatorVerificado("verified")).toBe(false);
    expect(temFatorVerificado([null, "x", { status: "VERIFIED" }])).toBe(false);
  });

  it("masterComAal: sem fator = como hoje (qualquer aal); com fator, só aal2", () => {
    for (const aal of ["aal1", "aal2", undefined, null, ""]) {
      expect(masterComAal(undefined, aal)).toBe(true);
      expect(masterComAal([], aal)).toBe(true);
      expect(masterComAal([pelaMetade], aal)).toBe(true);
    }
    expect(masterComAal([verificado], "aal1")).toBe(false);
    expect(masterComAal([verificado], undefined)).toBe(false);
    expect(masterComAal([verificado], "AAL2")).toBe(false);
    expect(masterComAal([verificado], "aal2")).toBe(true);
    expect(masterComAal([pelaMetade, verificado], "aal2")).toBe(true);
  });

  it("a mesma matriz A do banco (master_aal_regra): tem_fator × aal → só (sem fator, *) e (*, aal2) abrem", () => {
    const linhas = [false, true].flatMap((temFator) => ["aal1", "aal2", null].map((aal) =>
      `${temFator}×${aal}=${masterComAal(temFator ? [verificado] : [], aal)}`));
    expect(linhas).toEqual([
      "false×aal1=true", "false×aal2=true", "false×null=true",
      "true×aal1=false", "true×aal2=true", "true×null=false",
    ]);
  });

  it("precisa_2fa = 403 (a tela pede o código)", () => {
    expect(statusDoErro("precisa_2fa")).toBe(403);
  });

  it("a porta das 3 master-* confere o 2FA DEPOIS do master e ANTES do freio e da ação (o fator do Auth, o aal do token)", () => {
    const porta = ler("supabase-principal/functions/_shared/master-porta.ts");
    const iMaster = porta.indexOf('erro: "so_master" }, 403');
    const i2fa = porta.indexOf("if (!masterComAal(u?.user?.factors, claimsDoJwt(token)?.aal)) {");
    const iFreio = porta.indexOf("if (!permitido(");
    expect(iMaster).toBeGreaterThan(-1);
    expect(i2fa).toBeGreaterThan(iMaster);
    expect(iFreio).toBeGreaterThan(i2fa);
    expect(porta.slice(i2fa, iFreio)).toContain('log.aviso({ codigo: "precisa_2fa", schema, ref: ud.user.id });');
    expect(porta.slice(i2fa, iFreio)).toContain('return json({ ok: false, erro: "precisa_2fa" }, 403, origin);');
  });

  it("pagamentos-aluno: o poder de master segue a mesma regra (em aal1 com fator, a pessoa comum — sem recusa)", () => {
    const fonte = ler("supabase-principal/functions/pagamentos-aluno/index.ts");
    expect(fonte).toMatch(/const ehMaster = \(user\.app_metadata as Record<string, unknown> \| undefined\)\?\.role === "master"\s*&& masterComAal\(user\.factors, claimsDoJwt\(auth\.slice\(7\)\)\?\.aal\);/);
    expect(fonte.match(/const ehMaster =/g)).toHaveLength(1);
    expect(fonte).not.toContain('"precisa_2fa"');
  });
});
