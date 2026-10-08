import { describe, expect, it } from "vitest";
import {
  ehAcaoConta, ehMaster, emailDeTeste, idsDe, lerPedidoCriarConta, origemDoApp, schemaDoPedido, statusDoErro, textoDoAvisoDePlano,
} from "../../supabase-principal/functions/_shared/master-regras";

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
