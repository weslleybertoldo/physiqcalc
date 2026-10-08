import { describe, expect, it } from "vitest";
import {
  FORMATO_EXPORTACAO, PALAVRA_CONFIRMACAO, STATUS_DA_RECUSA, confirmacaoValida, lerRespostaTreino, montarExportacao, nomeDoArquivo, pegadaBloqueia,
} from "../../../../supabase-principal/functions/_shared/conta-aluno-regras";

describe("excluir-minha-conta: confirmação digitada (P19)", () => {
  it("só a palavra EXCLUIR (maiúsculas ou não, espaços nas pontas)", () => {
    expect(PALAVRA_CONFIRMACAO).toBe("EXCLUIR");
    expect(confirmacaoValida("EXCLUIR")).toBe(true);
    expect(confirmacaoValida(" excluir ")).toBe(true);
    expect(confirmacaoValida("Excluir")).toBe(true);
    expect(confirmacaoValida("EXCLUI")).toBe(false);
    expect(confirmacaoValida("DELETAR")).toBe(false);
    expect(confirmacaoValida("")).toBe(false);
    expect(confirmacaoValida(undefined)).toBe(false);
    expect(confirmacaoValida(["EXCLUIR"])).toBe(false);
  });
  it("recusas com o HTTP certo", () => {
    expect(STATUS_DA_RECUSA).toMatchObject({ confirmacao_invalida: 400, profissional: 403, assinatura_ativa: 409, treino_indisponivel: 502 });
  });
});

describe("conversa com o Banco do Treino (delete-my-account, modo servidor)", () => {
  it("lê a resposta: ok, sem vínculo, profissional ou indisponível", () => {
    expect(lerRespostaTreino(200, { ok: true, apaga: {} })).toBe("ok");
    expect(lerRespostaTreino(200, { ok: true, sem_vinculo: true })).toBe("sem_vinculo");
    expect(lerRespostaTreino(403, { ok: false, erro: "profissional" })).toBe("profissional");
    expect(lerRespostaTreino(401, { ok: false, erro: "segredo_invalido" })).toBe("indisponivel");
    expect(lerRespostaTreino(500, { ok: false, erro: "interno" })).toBe("indisponivel");
    expect(lerRespostaTreino(200, { ok: false })).toBe("indisponivel");
    expect(lerRespostaTreino(0, null)).toBe("indisponivel");
  });
  it("hml-09: pelo staging, a recusa da conta com dado em produção (403 conta_real_no_staging) → conta_real", () => {
    expect(lerRespostaTreino(403, { erro: "conta_real_no_staging" })).toBe("conta_real");
    expect(lerRespostaTreino(403, { ok: false, erro: "conta_real_no_staging", motivo: "dados_em_producao" })).toBe("conta_real");
    // só o 403 com esse código: o resto continua "indisponível" (nada foi apagado)
    expect(lerRespostaTreino(409, { ok: false, erro: "conta_real_no_staging" })).toBe("indisponivel");
    expect(lerRespostaTreino(403, { ok: false, erro: "conta_real_protegida" })).toBe("indisponivel");
  });
});

describe("hml-09 (H-23): a conta de teste com dado em produção não sai pelo staging (pegadaBloqueia)", () => {
  it("em produção → bloqueia; só no staging → segue", () => {
    expect(pegadaBloqueia({ em_producao: true, colunas: ["public.pacientes.user_id"] })).toBe(true);
    expect(pegadaBloqueia({ em_producao: true, colunas: [] })).toBe(true);
    expect(pegadaBloqueia({ em_producao: false, colunas: [] })).toBe(false);
    expect(pegadaBloqueia({ em_producao: false })).toBe(false);
    expect(pegadaBloqueia({ em_producao: false, colunas: null })).toBe(false);
  });
  it("nulo ou forma estranha → bloqueia (falha fechada)", () => {
    for (const r of [null, undefined, {}, false, true, 0, "", "false", [], [{ em_producao: false, colunas: [] }], { em_producao: "false" },
      { em_producao: 0 }, { em_producao: null }, { colunas: [] }, { em_producao: false, colunas: ["public.contas.dono_id"] },
      { em_producao: false, colunas: "nenhuma" }, { em_producao: false, colunas: {} }]) {
      expect(pegadaBloqueia(r)).toBe(true);
    }
  });
});

describe("exportar-meus-dados: o arquivo", () => {
  it("formato, ambiente, explicação e os 2 bancos", () => {
    const a = montarExportacao({ ambiente: "public", geradoEm: "2026-09-29T20:00:00Z", principal: { login: { id: "u1" } }, treino: null });
    expect(a.formato).toBe(FORMATO_EXPORTACAO);
    expect(a.ambiente).toBe("public");
    expect(a.banco_principal).toEqual({ login: { id: "u1" } });
    expect(a.banco_do_treino).toBeNull();
    expect(Array.isArray(a.explicacao)).toBe(true);
  });
  it("nome do arquivo sem o e-mail", () => {
    expect(nomeDoArquivo("2026-09-29")).toBe("physiq-meus-dados-2026-09-29.json");
    expect(nomeDoArquivo("lixo")).toMatch(/^physiq-meus-dados-\d{4}-\d{2}-\d{2}\.json$/);
  });
});
