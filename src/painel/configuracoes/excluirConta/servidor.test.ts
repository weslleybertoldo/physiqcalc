import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { STATUS_DA_RECUSA } from "../../../../supabase-principal/functions/_shared/conta-aluno-regras";
import {
  STATUS_DA_RECUSA_PROFISSIONAL,
  cobrancasACancelar,
  conferenciaParaATela,
  excluirContaProfissional,
  fluxoDoPedido,
  resumoDoFeito,
  type DepsExclusao,
} from "../../../../supabase-principal/functions/_shared/exclusao-profissional-regras";

// W2 da loja — a borda excluir-minha-conta: a TRAVA (o caminho novo só no pedido do app novo; o cliente antigo recebe exatamente a
// resposta de hoje) e a ORDEM da exclusão do profissional (a cobrança para antes; o login sai por último).

const CONFERENCIA = {
  ok: true, simulacao: true, perfil: "dono", nome: "Diana Dono",
  contas_dono: [{
    id: "c1", nome: "W2L Consultoria", origem: "nova", plano: "treino_nutricao", situacao: "teste", eu_nutri: true,
    alunos: { total: 2, para_o_app: 1, guardados: 1, lista: [{ id: "p1", nome: "Alice", destino: "app" }, { id: "p2", nome: "Bruno", destino: "guardado" }] },
    membros: [{ id: "m1", nome: "Eduardo", email: "e@x.app", papeis: ["personal"], status: "ativo" }],
    convites_pendentes: 1,
    cobrancas: {
      plano: [{ id: "a1", mp_preapproval_id: "pre-plano-1", status: "pending", simulada: false }],
      alunos: [{ id: "s1", paciente_id: "p1", mp_preapproval_id: "sim-alice", status: "authorized" }],
    },
    prontuarios: [{ paciente_id: "p2", conta_id: "c1", nome: "Bruno", registros: 2, restritos: 0 }],
  }],
  equipes: [], ex_equipes: 0, sem_conta: null, aluno: null, arquivos: [],
};
const TREINO = { ok: true, apaga: { tb_treino_series: 3 }, mantem: { alunos: 1, treinos_montados: 2 },
  cobrancas: { plano: [{ mp_preapproval_id: "pre-plano-1", status: "pending" }], alunos: [{ mp_preapproval_id: "pre-calc-velha", status: "authorized" }] } };

function falsos(sobrescrever: Partial<DepsExclusao> = {}, chamadas: string[] = []): DepsExclusao {
  const anota = <T>(nome: string, v: T) => { chamadas.push(nome); return v; };
  return {
    conferir: async () => anota("conferir", CONFERENCIA),
    excluir: async () => anota("excluir", { ...CONFERENCIA, simulacao: false, arquivos: [{ bucket: "diario", path: "u/1.jpg" }],
      contas_dono: [{ ...CONFERENCIA.contas_dono[0], feito: { alunos_na_lixeira: 2, membros_removidos: 1 } }] }),
    treino: async (acao) => anota(`treino:${acao}`, { passo: "ok" as const, corpo: TREINO }),
    cancelarPlano: async (a) => anota(`plano:${a.id}`, true),
    cancelarDosAlunos: async (ids) => anota(`alunos:${ids.join(",")}`, { canceladas: ids.length, falhas: 0 }),
    cancelarSolta: async (id) => anota(`solta:${id}`, true),
    dispararEspelho: async () => { anota("espelho", null); },
    apagarArquivos: async (arq) => anota(`arquivos:${arq.length}`, arq.length + 1),
    apagarLogin: async () => { anota("login", null); },
    ...sobrescrever,
  };
}

describe("a trava: o caminho novo só no pedido do app novo", () => {
  it("sem o campo (site de hoje, APK antigo) é sempre o caminho de sempre", () => {
    for (const corpo of [{}, { simular: true }, { confirmacao: "EXCLUIR" }, { fluxo: "Profissional" }, { fluxo: "profissional " }, { fluxo: true },
      { fluxo: ["profissional"] }, { versao: 2 }, null, undefined, [], "profissional", 0]) {
      expect(fluxoDoPedido(corpo)).toBe("aluno");
    }
  });
  it("só { fluxo: \"profissional\" } entra no caminho novo", () => {
    expect(fluxoDoPedido({ fluxo: "profissional" })).toBe("profissional");
    expect(fluxoDoPedido({ fluxo: "profissional", simular: true })).toBe("profissional");
    expect(fluxoDoPedido({ fluxo: "profissional", confirmacao: "EXCLUIR" })).toBe("profissional");
  });
  it("as recusas do caminho de hoje não mudaram (403 profissional, 409, 502)", () => {
    expect(STATUS_DA_RECUSA).toEqual({ confirmacao_invalida: 400, profissional: 403, assinatura_ativa: 409, treino_indisponivel: 502 });
  });
  it("na borda, o desvio vem antes do caminho de hoje, que segue inteiro (403 do master, excluir_dados_aluno, hard delete do aluno)", () => {
    const fonte = readFileSync(resolve(__dirname, "../../../../supabase-principal/functions/excluir-minha-conta/index.ts"), "utf8");
    const desvio = fonte.indexOf('if (fluxoDoPedido(pedido) === "profissional") {');
    const limiteDeHoje = fonte.indexOf("if (!permitido(`${schema}:${user.id}`)) return json({ ok: false, erro: \"rate_limited\" }, 429, origin);");
    expect(desvio).toBeGreaterThan(0);
    expect(limiteDeHoje).toBeGreaterThan(desvio);
    const deHoje = fonte.slice(limiteDeHoje);
    for (const linha of [
      "const simular = body.simular === true;",
      'if (!simular && !confirmacaoValida(body.confirmacao)) return recusa("confirmacao_invalida", origin);',
      'if (papelAuth === "master" || papelAuth === "admin") return recusa("profissional", origin, { motivo: "master" });',
      'const { data: pre, error: ep } = await db.rpc("excluir_dados_aluno", { p_uid: user.id, p_simular: true });',
      'if (treinoPre.passo === "profissional") return recusa("profissional", origin, { motivo: "treino" });',
      "const { error: ed } = await authAdmin.auth.admin.deleteUser(user.id);",
    ]) expect(deHoje).toContain(linha);
    // o caminho novo devolve antes (nada dele cai no de hoje)
    expect(fonte.slice(desvio, limiteDeHoje)).toContain("return json(r.corpo, r.status, origin);");
  });
});

describe("hml-09 (H-23): pelo staging, a conta de teste com dado em produção não é excluída (o Auth é o mesmo)", () => {
  const fonte = readFileSync(resolve(__dirname, "../../../../supabase-principal/functions/excluir-minha-conta/index.ts"), "utf8");
  it("a trava vem logo depois do e-mail de teste, só no staging, antes dos 2 fluxos (simular e excluir) e de qualquer passo", () => {
    const email = fonte.indexOf('if (schema === "staging" && !emailDeTeste(email)) return json({ ok: false, erro: "conta_real_no_staging" }, 403, origin);');
    const trava = fonte.indexOf('if (schema === "staging") {', email);
    const fim = fonte.indexOf("\n  }\n", trava);
    expect(email).toBeGreaterThan(0);
    expect(trava).toBeGreaterThan(email);
    // entre o e-mail de teste e a trava, só o comentário
    expect(fonte.slice(email, trava).split("\n").slice(1).every((l) => l.trim() === "" || l.trim().startsWith("//"))).toBe(true);
    const bloco = fonte.slice(trava, fim);
    for (const linha of [
      'const dbStaging = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" }, auth: { persistSession: false } });',
      'const { data: pegada, error: epg } = await dbStaging.rpc("pegada_em_producao", { p_uid: user.id });',
      'return json({ ok: false, erro: "erro_interno" }, 500, origin);',
      "if (pegadaBloqueia(pegada)) return dadosEmProducao(origin);",
    ]) expect(bloco).toContain(linha);
    expect(fonte).toContain('json({ ok: false, erro: "conta_real_no_staging", motivo: "dados_em_producao" }, 403, origin)');
    // antes de ler o pedido, do desvio do profissional e do caminho do aluno; e só ali (produção: nem uma chamada a mais)
    for (const depois of ["const pedido = await lerCorpo(req.clone());", 'if (fluxoDoPedido(pedido) === "profissional") {', 'db.rpc("excluir_dados_aluno"',
      'chamarTreino(schema, "conferir"']) {
      expect(fonte.indexOf(depois)).toBeGreaterThan(fim);
    }
    expect(fonte.split('.rpc("pegada_em_producao"').length - 1).toBe(1);
  });
  it("a recusa do Treino (conta_real) volta igual nos 2 passos do aluno; o STATUS_DA_RECUSA não muda", () => {
    expect(fonte).toContain('if (treinoPre.passo === "conta_real") return dadosEmProducao(origin);');
    expect(fonte).toContain('if (treino.passo === "conta_real") return dadosEmProducao(origin);');
    expect(STATUS_DA_RECUSA).not.toHaveProperty("conta_real_no_staging");
    expect(STATUS_DA_RECUSA_PROFISSIONAL.conta_real_no_staging).toBe(403);
  });
});

describe("a exclusão do profissional: a ordem e as recusas", () => {
  it("o master nunca exclui por aqui (nada é chamado)", async () => {
    const chamadas: string[] = [];
    const r = await excluirContaProfissional({ simular: true, confirmacao: null, papelAuth: "master" }, falsos({}, chamadas));
    expect(r).toEqual({ status: 403, corpo: { ok: false, erro: "profissional", motivo: "master" } });
    expect(chamadas).toEqual([]);
  });
  it("conferência: confere os 2 bancos e não mexe em nada; a tela não recebe ids do Mercado Pago", async () => {
    const chamadas: string[] = [];
    const r = await excluirContaProfissional({ simular: true, confirmacao: null, papelAuth: "" }, falsos({}, chamadas));
    expect(r.status).toBe(200);
    expect(chamadas).toEqual(["conferir", "treino:conferir_profissional"]);
    const texto = JSON.stringify(r.corpo);
    expect(texto).not.toMatch(/pre-plano|sim-alice|mp_preapproval/);
    expect(r.corpo).toMatchObject({ ok: true, simulacao: true, perfil: "dono", cobrancas_a_cancelar: 3 });
    const conta = (r.corpo.contas as Array<Record<string, unknown>>)[0];
    expect(conta).toMatchObject({ nome: "W2L Consultoria", cobrancas: { plano: 1, alunos: 1 }, convites_pendentes: 1 });
    expect(conta.membros).toEqual([{ nome: "Eduardo", email: "e@x.app", papeis: ["personal"], convite: false }]);
    expect(conta.prontuarios).toEqual([{ paciente_id: "p2", conta_id: "c1", nome: "Bruno", registros: 2, restritos: 0 }]);
  });
  it("excluir sem a palavra EXCLUIR → 400, nada é chamado", async () => {
    const chamadas: string[] = [];
    const r = await excluirContaProfissional({ simular: false, confirmacao: "excluir já", papelAuth: "" }, falsos({}, chamadas));
    expect(r.status).toBe(400);
    expect(r.corpo.erro).toBe("confirmacao_invalida");
    expect(chamadas).toEqual([]);
  });
  it("as recusas do banco param antes do Treino (só aluno → 409 nao_profissional; cobrança no cartão → 409 assinatura_ativa)", async () => {
    for (const erro of ["nao_profissional", "assinatura_ativa", "conta_legada"]) {
      const chamadas: string[] = [];
      const r = await excluirContaProfissional({ simular: true, confirmacao: null, papelAuth: "" },
        falsos({ conferir: async () => { chamadas.push("conferir"); return { ok: false, erro }; } }, chamadas));
      expect(r).toEqual({ status: 409, corpo: { ok: false, erro } });
      expect(chamadas).toEqual(["conferir"]);
    }
    expect(STATUS_DA_RECUSA_PROFISSIONAL.profissional).toBe(403);
  });
  it("Treino fora do ar na conferência → 502 e nada muda", async () => {
    const chamadas: string[] = [];
    const r = await excluirContaProfissional({ simular: false, confirmacao: "EXCLUIR", papelAuth: "" },
      falsos({ treino: async (acao) => { chamadas.push(`treino:${acao}`); return { passo: "indisponivel", corpo: {} }; } }, chamadas));
    expect(r.status).toBe(502);
    expect(r.corpo.erro).toBe("treino_indisponivel");
    expect(chamadas).toEqual(["conferir", "treino:conferir_profissional"]);
  });
  it("hml-09: pelo staging, o Treino recusa a conta com dado em produção (conta_real) → 403 e nada muda (simular e excluir)", async () => {
    const recusaDoTreino = { ok: false, erro: "conta_real_no_staging", motivo: "dados_em_producao" };
    for (const entrada of [{ simular: true, confirmacao: null }, { simular: false, confirmacao: "EXCLUIR" }]) {
      const chamadas: string[] = [];
      const r = await excluirContaProfissional({ ...entrada, papelAuth: "" },
        falsos({ treino: async (acao) => { chamadas.push(`treino:${acao}`); return { passo: "conta_real", corpo: recusaDoTreino }; } }, chamadas));
      expect(r).toEqual({ status: 403, corpo: { ok: false, erro: "conta_real_no_staging", motivo: "dados_em_producao" } });
      expect(chamadas).toEqual(["conferir", "treino:conferir_profissional"]);
    }
  });
  it("hml-09: o Treino recusa (conta_real) só na exclusão → 403; o principal e o login ficam", async () => {
    const chamadas: string[] = [];
    const r = await excluirContaProfissional({ simular: false, confirmacao: "EXCLUIR", papelAuth: "" },
      falsos({ treino: async (acao) => {
        chamadas.push(`treino:${acao}`);
        return acao === "excluir_profissional" ? { passo: "conta_real", corpo: { ok: false, erro: "conta_real_no_staging" } } : { passo: "ok", corpo: TREINO };
      } }, chamadas));
    expect(r).toEqual({ status: 403, corpo: { ok: false, erro: "conta_real_no_staging", motivo: "dados_em_producao" } });
    expect(chamadas).toContain("treino:excluir_profissional");
    expect(chamadas).not.toContain("excluir");
    expect(chamadas).not.toContain("login");
  });
  it("o Mercado Pago não confirmou um cancelamento → 502 e NADA mais muda (nem Treino, nem conta, nem login)", async () => {
    const chamadas: string[] = [];
    const r = await excluirContaProfissional({ simular: false, confirmacao: "EXCLUIR", papelAuth: "" },
      falsos({ cancelarPlano: async (a) => { chamadas.push(`plano:${a.id}`); return false; } }, chamadas));
    expect(r).toEqual({ status: 502, corpo: { ok: false, erro: "cobranca_nao_cancelada", canceladas: 2, falhas: 1 } });
    expect(chamadas).not.toContain("treino:excluir_profissional");
    expect(chamadas).not.toContain("excluir");
    expect(chamadas).not.toContain("login");
  });
  it("tudo certo: cobrança → Treino → principal → espelho → arquivos → login, nessa ordem", async () => {
    const chamadas: string[] = [];
    const r = await excluirContaProfissional({ simular: false, confirmacao: " excluir ", papelAuth: "" }, falsos({}, chamadas));
    expect(chamadas).toEqual([
      "conferir", "treino:conferir_profissional", "plano:a1", "alunos:p1", "solta:pre-calc-velha", "treino:excluir_profissional", "excluir",
      "espelho", "arquivos:1", "login",
    ]);
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ ok: true, perfil: "dono",
      resultado: { contas: ["W2L Consultoria"], alunos_para_o_app: 1, alunos_guardados: 2, membros_removidos: 1, cobrancas_canceladas: 3, arquivos: 2 } });
  });
  it("Treino fora do ar na exclusão → 502; o principal e o login ficam (o pedido de novo termina)", async () => {
    const chamadas: string[] = [];
    const r = await excluirContaProfissional({ simular: false, confirmacao: "EXCLUIR", papelAuth: "" },
      falsos({ treino: async (acao) => { chamadas.push(`treino:${acao}`); return acao === "excluir_profissional" ? { passo: "indisponivel", corpo: {} } : { passo: "ok", corpo: TREINO }; } }, chamadas));
    expect(r.status).toBe(502);
    expect(chamadas).not.toContain("excluir");
    expect(chamadas).not.toContain("login");
  });
  it("o principal recusou no fim (sobrou cobrança viva) → 409 e o login fica", async () => {
    const chamadas: string[] = [];
    const r = await excluirContaProfissional({ simular: false, confirmacao: "EXCLUIR", papelAuth: "" },
      falsos({ excluir: async () => { chamadas.push("excluir"); return { ok: false, erro: "cobranca_ativa" }; } }, chamadas));
    expect(r).toEqual({ status: 409, corpo: { ok: false, erro: "cobranca_ativa" } });
    expect(chamadas).not.toContain("login");
  });
  it("o espelho falhar não trava; o login falhar devolve 500 (pedir de novo refaz só o que falta)", async () => {
    const r1 = await excluirContaProfissional({ simular: false, confirmacao: "EXCLUIR", papelAuth: "" },
      falsos({ dispararEspelho: async () => { throw new Error("pg_net"); } }));
    expect(r1.status).toBe(200);
    const r2 = await excluirContaProfissional({ simular: false, confirmacao: "EXCLUIR", papelAuth: "" },
      falsos({ apagarLogin: async () => { throw new Error("auth"); } }));
    expect(r2).toEqual({ status: 500, corpo: { ok: false, erro: "erro_interno" } });
  });
  it("sem vínculo no Treino (nunca usou o Treino): conferência sem a parte do Treino", async () => {
    const r = await excluirContaProfissional({ simular: true, confirmacao: null, papelAuth: "" },
      falsos({ treino: async () => ({ passo: "sem_vinculo", corpo: { ok: true, sem_vinculo: true } }) }));
    expect(r.corpo.treino).toBeNull();
    expect(r.corpo.cobrancas_a_cancelar).toBe(2);
  });
});

describe("W2 (revisão I-2): o Mercado Pago DA CONTA de quem excluiu sai do ar (o job deixa de renovar o acesso de quem saiu)", () => {
  const comMp = (chamadas: string[], o: Partial<DepsExclusao> = {}) => falsos({
    desligarMpDasContas: async (ids) => { chamadas.push(`mp:${ids.join(",")}`); },
    ...o,
  }, chamadas);
  it("o passo vem DEPOIS do SQL de verdade (excluir) e antes do espelho, com as contas de que ele era dono", async () => {
    const chamadas: string[] = [];
    const r = await excluirContaProfissional({ simular: false, confirmacao: "EXCLUIR", papelAuth: "" }, comMp(chamadas));
    expect(r.status).toBe(200);
    expect(chamadas).toEqual([
      "conferir", "treino:conferir_profissional", "plano:a1", "alunos:p1", "solta:pre-calc-velha", "treino:excluir_profissional", "excluir",
      "mp:c1", "espelho", "arquivos:1", "login",
    ]);
  });
  it("nunca na conferência (simular), nem quando o SQL recusou ou o MP não cancelou a cobrança (nada foi excluído)", async () => {
    for (const [nome, entrada, sobre] of [
      ["simular", { simular: true, confirmacao: null, papelAuth: "" }, {}],
      ["o SQL recusou", { simular: false, confirmacao: "EXCLUIR", papelAuth: "" }, { excluir: async () => ({ ok: false, erro: "cobranca_ativa" }) }],
      ["o MP não cancelou", { simular: false, confirmacao: "EXCLUIR", papelAuth: "" }, { cancelarPlano: async () => false }],
    ] as const) {
      const chamadas: string[] = [];
      await excluirContaProfissional(entrada, comMp(chamadas, sobre as Partial<DepsExclusao>));
      expect(chamadas.some((c) => c.startsWith("mp:")), nome).toBe(false);
    }
  });
  it("o passo que falha não volta a exclusão (a conta já foi excluída): só o registro, e o espelho, os arquivos e o login seguem", async () => {
    const chamadas: string[] = [];
    const registros: string[] = [];
    const r = await excluirContaProfissional({ simular: false, confirmacao: "EXCLUIR", papelAuth: "" }, comMp(chamadas, {
      desligarMpDasContas: async () => { chamadas.push("mp"); throw new Error("banco"); },
      registrar: (m) => registros.push(m),
    }));
    expect(r.status).toBe(200);
    expect(chamadas.slice(chamadas.indexOf("excluir"))).toEqual(["excluir", "mp", "espelho", "arquivos:1", "login"]);
    expect(registros).toEqual(["mp: Error: banco"]);
  });
  it("na borda (exclusao-profissional.ts): só com a W2 no schema; a integração vira desconectada (data e trava), SEM apagar os tokens; o erro vai ao log.excecao", () => {
    const fonte = readFileSync(resolve(__dirname, "../../../../supabase-principal/functions/_shared/exclusao-profissional.ts"), "utf8");
    const i = fonte.indexOf("desligarMpDasContas: async (contaIds) => {");
    expect(i).toBeGreaterThan(fonte.indexOf("const deps: DepsExclusao = {"));
    const passo = fonte.slice(i, fonte.indexOf("\n    },", i));
    const ordem = ["try {", "if (!(await schemaTemW2(db, p.schema))) return;", '.from("recebimento_integracoes").update({ status: "desconectada", desconectada_em: ',
      "mp_renovando_ate: null", '.in("conta_id", contaIds).eq("provedor", "mercadopago").neq("status", "desconectada")', "if (error) throw error;",
      "} catch (e) {", 'p.log.excecao(e, { codigo: "exclusao_mp_desconectar_falhou"'];
    let de = -1;
    for (const t of ordem) {
      const pos = passo.indexOf(t, de + 1);
      expect(pos, t).toBeGreaterThan(de);
      de = pos;
    }
    expect(passo).not.toMatch(/mp_access_token|mp_refresh_token|\.delete\(/);   // os tokens ficam para a faxina de 7 dias (decisão 10)
    expect(passo).not.toMatch(/\bthrow\b(?! error;)/);                           // nunca lança para a ordem
  });
});

describe("o que precisa parar de cobrar", () => {
  it("plano + alunos do núcleo + as antigas do Calc que só o Treino conhece (sem repetir as do núcleo)", () => {
    const c = cobrancasACancelar(CONFERENCIA, TREINO);
    expect(c.plano).toEqual([{ id: "a1", conta_id: "c1", mp_preapproval_id: "pre-plano-1", status: "pending", simulada: false }]);
    expect(c.pacientesComAssinatura).toEqual(["p1"]);
    expect(c.soltasDoTreino).toEqual(["pre-calc-velha"]);
  });
  it("membro (não dono) e ex-membro não têm cobrança a cancelar", () => {
    const c = cobrancasACancelar({ ok: true, perfil: "membro", contas_dono: [], equipes: [{ conta_nome: "X" }] }, null);
    expect(c).toEqual({ plano: [], pacientesComAssinatura: [], soltasDoTreino: [] });
    expect(conferenciaParaATela({ ok: true, perfil: "membro", contas_dono: [] }, null)).toMatchObject({ perfil: "membro", contas: [], cobrancas_a_cancelar: 0 });
  });
  it("o resumo do fim só tem contagens", () => {
    expect(resumoDoFeito({ contas_dono: [{ nome: "A", alunos: { para_o_app: 3 }, feito: { alunos_na_lixeira: 4, membros_removidos: 2 } }], equipes: [{}] }, null, 2, 5))
      .toEqual({ contas: ["A"], alunos_para_o_app: 3, alunos_guardados: 4, membros_removidos: 2, equipes_que_saiu: 1, cobrancas_canceladas: 2, treino: null, arquivos: 5 });
  });
});
