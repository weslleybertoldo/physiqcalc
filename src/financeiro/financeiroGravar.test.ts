// Physiq hml-19d (H-41 · jeito 2) — as regras PURAS da função financeiro (supabase-principal/functions/_shared/financeiro-gravar-regras.ts):
// as mesmas que rodam na borda (Deno). Positivo: cada ação conhecida monta a gravação certa, com o dono = quem chama e o select de hoje.
// Negativo: ação desconhecida, coluna fora da lista, dono/Lixeira no corpo, uuid ruim, texto acima do limite da tela, valor fora do
// numeric(12,2), o status de cada erro e a tradução do banco (o 23505 das categorias = nome_repetido). E os textos padrão da semente
// iguais aos de hoje (as telas reexportam daqui) e o número do recibo igual ao da tela.
import { describe, expect, it } from "vitest";
import {
  ACOES_DO_FINANCEIRO, ACOES_FINANCEIRO, CATEGORIAS_PADRAO, CATEGORIA_NOME_MAX, CONTEUDO_MODELO_MAX, CONTEUDO_MODELO_PADRAO,
  CONTEUDO_MODELO_PADRAO_NUTRI, DESCRICAO_MAX, DESCRICAO_RECIBO_MAX, ERROS_DAS_RPCS_DO_FINANCEIRO, MARCA_NUMERO_RECIBO, METODOS_MOVIMENTACAO,
  OBSERVACAO_MAX, RPCS_DO_FINANCEIRO, STATUS_DO_ERRO_FINANCEIRO, TABELAS_FINANCEIRO, TAGS_MAX, TAG_MAX, TEXTO_RECIBO_MAX, TIPOS_MOVIMENTACAO,
  TITULO_MODELO_MAX, TITULO_MODELO_PADRAO, VALOR_MAX, VOLTA_CATEGORIA, VOLTA_MODELO_RECIBO, VOLTA_RECIBO, VOLTA_TRANSACAO, acaoDoFinanceiro,
  ehSoNutricionista, erroDoFinanceiro, lerPadroes, lerReciboEmitir, lerReciboExcluir, lerTags, modeloPadraoDoRecibo, montarGravacaoFinanceiro,
  numeroDoRecibo, statusDoErroFinanceiro, type AcaoFinanceiroGravar,
} from "../../supabase-principal/functions/_shared/financeiro-gravar-regras";
import { LIMITE_CORPO } from "../../supabase-principal/functions/_shared/nutricao-regras";
import * as financeiroUtil from "@/painel/financeiro/financeiroUtil";
import { CONTEUDO_MODELO_PADRAO_NUTRI as NUTRI_DA_TELA, padraoDoRecibo } from "@/painel/financeiro/recibosUtil";
import * as lancamentos from "./lancamentos";
import * as recibos from "./recibos";
import { normalizarConteudo } from "@/nutricao/editor/lib/orientacoesUtil";

const EU = "33333333-3333-4333-8333-333333333333";
const OUTRA = "44444444-4444-4444-8444-444444444444";
const CONTA = "c0000000-0000-4000-8000-00000000000a";
const P = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";
const CAT = "55555555-5555-4555-8555-555555555555";
const AGORA = new Date("2026-10-11T15:30:00.000Z");

/** Um corpo válido de cada ação declarativa (o que as libs da tela mandam). */
const EXEMPLOS: Record<string, Record<string, unknown>> = {
  transacao_criar: {
    conta_id: CONTA, tipo: "entrada", descricao: "Consulta", valor: 150, data: "2026-10-11", categoria_id: CAT, metodo: "pix", paciente_id: P, observacao: null,
  },
  transacao_editar: {
    id: ID, tipo: "saida", descricao: "Aluguel", valor: 1234.56, data: "2026-10-01", categoria_id: null, metodo: "boleto", paciente_id: null, observacao: "x",
  },
  transacao_estornar: { id: ID, estornada: true },
  transacao_excluir: { id: ID },
  categoria_criar: { conta_id: CONTA, nome: "Cursos" },
  categoria_renomear: { id: ID, nome: "Cursos e eventos" },
  categoria_excluir: { id: ID },
  modelo_recibo_criar: { conta_id: CONTA, titulo: "Recibo simples", conteudo: "Recebi de *|NOME_PACIENTE|*", favorito: false },
  modelo_recibo_editar: { id: ID, favorito: true },
  modelo_recibo_excluir: { id: ID },
};
const ESPECIAIS: AcaoFinanceiroGravar[] = ["padroes_garantir", "recibo_emitir", "recibo_excluir", "tags_salvar"];
const DECLARATIVAS = ACOES_DO_FINANCEIRO.filter((a) => !ESPECIAIS.includes(a));

describe("hml-19d — a lista fechada de ações da financeiro", () => {
  it("14 ações: 10 declarativas (movimentação, categoria, modelo) + 4 especiais (sementes, emitir/excluir recibo, tags)", () => {
    expect(ACOES_DO_FINANCEIRO).toHaveLength(14);
    expect(DECLARATIVAS).toHaveLength(10);
    for (const a of ESPECIAIS) expect(ACOES_FINANCEIRO[a].operacao, a).toBe("especial");
    expect(Object.keys(EXEMPLOS).sort()).toEqual([...DECLARATIVAS].sort());
    expect(TABELAS_FINANCEIRO).toEqual(["transacoes", "categorias_financeiras", "modelos_recibo", "recibos", "pacientes"]);
    // as 3 RPCs da migration 20261011120000: as sementes e o recibo
    expect(RPCS_DO_FINANCEIRO).toEqual(["financeiro_garantir_padroes", "financeiro_emitir_recibo", "financeiro_excluir_recibo"]);
    expect([ACOES_FINANCEIRO.padroes_garantir.rpc, ACOES_FINANCEIRO.recibo_emitir.rpc, ACOES_FINANCEIRO.recibo_excluir.rpc]).toEqual([...RPCS_DO_FINANCEIRO]);
  });

  it("ação desconhecida (ou herdada do objeto) → null / acao_invalida", () => {
    for (const v of ["", "transacao_apagar", "__proto__", "toString", "constructor", null, 1, {}]) expect(acaoDoFinanceiro(v)).toBeNull();
    expect(montarGravacaoFinanceiro("transacao_apagar", { id: ID }, EU)).toEqual({ ok: false, erro: "acao_invalida" });
    // as especiais não passam pelo CRUD declarativo
    for (const a of ESPECIAIS) expect(montarGravacaoFinanceiro(a, { id: ID }, EU)).toEqual({ ok: false, erro: "acao_invalida" });
  });

  it("o corpo cabe no limite da porta (2 MB): o maior texto aceito (o do recibo) fica muito abaixo", () => {
    expect(TEXTO_RECIBO_MAX * 6).toBeLessThan(LIMITE_CORPO);
  });
});

describe("hml-19d — cada ação declarativa monta a gravação certa (o dono = quem chama; o select de hoje)", () => {
  it.each(DECLARATIVAS.map((a) => [a] as const))("%s", (acao) => {
    const g = montarGravacaoFinanceiro(acao, EXEMPLOS[acao], EU, AGORA);
    expect(g.ok, acao).toBe(true);
    if (!g.ok) return;
    expect(g.tabela).toBe(ACOES_FINANCEIRO[acao].tabela);
    if (g.operacao === "inserir") {
      expect(g.valores.nutricionista_id).toBe(EU);
      const { nutricionista_id: _dono, ...resto } = g.valores;
      expect(resto).toEqual(EXEMPLOS[acao]);
    } else {
      expect(g.id).toBe(ID);
      if (g.operacao === "excluir_suave") expect(g.valores).toEqual({ deleted_at: AGORA.toISOString() });
      else {
        const { id: _id, ...resto } = EXEMPLOS[acao];
        expect(g.valores).toEqual(resto);
      }
    }
    if (g.operacao !== "excluir_suave") {
      const volta = { transacoes: VOLTA_TRANSACAO, categorias_financeiras: VOLTA_CATEGORIA, modelos_recibo: VOLTA_MODELO_RECIBO }[g.tabela as string];
      expect(g.volta).toBe(volta);
    }
  });

  it("os selects de volta são os MESMOS das libs de hoje (src/painel/financeiro/dados.ts no 87205e1)", () => {
    expect(VOLTA_TRANSACAO).toBe(
      "id, nutricionista_id, conta_id, paciente_id, tipo, descricao, valor, data, metodo, observacao, estornada, recibo_id, categoria_id, created_at, " +
      "categoria:categorias_financeiras(nome), paciente:pacientes(nome, cpf)",
    );
    expect(VOLTA_RECIBO).toBe("id, nutricionista_id, paciente_id, transacao_id, modelo_id, numero, valor, data, descricao, texto, created_at, " +
      "paciente:pacientes(nome, cpf), transacao:transacoes!recibos_transacao_id_fkey(descricao, data)");
    expect(VOLTA_CATEGORIA).toBe("id, nome, nutricionista_id");
    expect(VOLTA_MODELO_RECIBO).toBe("id, nutricionista_id, titulo, conteudo, favorito");
  });

  it("o dono, a Lixeira e as colunas fora da lista CAEM (nutricionista_id/deleted_at do corpo ignorados)", () => {
    const g = montarGravacaoFinanceiro("transacao_criar", {
      ...EXEMPLOS.transacao_criar, nutricionista_id: OUTRA, deleted_at: "2026-01-01T00:00:00Z", estornada: true, recibo_id: ID, id: ID, created_at: "x",
    }, EU);
    expect(g.ok && g.operacao === "inserir" && g.valores).toEqual({ ...EXEMPLOS.transacao_criar, nutricionista_id: EU });
    const e = montarGravacaoFinanceiro("transacao_editar", { ...EXEMPLOS.transacao_editar, nutricionista_id: OUTRA, conta_id: CONTA, deleted_at: null, estornada: false }, EU);
    expect(e.ok && e.operacao === "editar" && Object.keys(e.valores).sort()).toEqual(
      ["categoria_id", "data", "descricao", "metodo", "observacao", "paciente_id", "tipo", "valor"],
    );
    const s = montarGravacaoFinanceiro("transacao_estornar", { id: ID, estornada: false, descricao: "outra", deleted_at: null }, EU);
    expect(s.ok && s.operacao === "editar" && s.valores).toEqual({ estornada: false });
    const c = montarGravacaoFinanceiro("categoria_criar", { nome: "Cursos", nutricionista_id: OUTRA }, EU);
    expect(c.ok && c.operacao === "inserir" && c.valores).toEqual({ nome: "Cursos", nutricionista_id: EU });
    const m = montarGravacaoFinanceiro("modelo_recibo_editar", { id: ID, titulo: "T", deleted_at: "2026-01-01T00:00:00Z", conta_id: OUTRA }, EU);
    expect(m.ok && m.operacao === "editar" && m.valores).toEqual({ titulo: "T" });
    // o excluir só leva o id (o "agora" é do servidor)
    const x = montarGravacaoFinanceiro("categoria_excluir", { id: ID.toUpperCase(), deleted_at: "1999-01-01T00:00:00Z" }, EU, AGORA);
    expect(x).toEqual({ ok: true, tabela: "categorias_financeiras", operacao: "excluir_suave", id: ID, valores: { deleted_at: AGORA.toISOString() } });
  });
});

describe("hml-19d — negativos: uuid ruim, texto acima do limite da tela, valor fora do numeric(12,2), ação sem o que mudar", () => {
  const recusa = (acao: string, corpo: Record<string, unknown>) => montarGravacaoFinanceiro(acao, corpo, EU);
  it("uuid ruim → dados_invalidos (id, conta, categoria, aluno; o dono do token também)", () => {
    expect(recusa("transacao_excluir", { id: "1" })).toEqual({ ok: false, erro: "dados_invalidos", campo: "id" });
    expect(recusa("transacao_editar", { ...EXEMPLOS.transacao_editar, id: "x" })).toMatchObject({ erro: "dados_invalidos", campo: "id" });
    expect(recusa("transacao_criar", { ...EXEMPLOS.transacao_criar, conta_id: "c1" })).toMatchObject({ erro: "dados_invalidos", campo: "conta_id" });
    expect(recusa("transacao_criar", { ...EXEMPLOS.transacao_criar, categoria_id: "cat1" })).toMatchObject({ erro: "dados_invalidos", campo: "categoria_id" });
    expect(recusa("transacao_criar", { ...EXEMPLOS.transacao_criar, paciente_id: 7 })).toMatchObject({ erro: "dados_invalidos", campo: "paciente_id" });
    expect(montarGravacaoFinanceiro("categoria_criar", { nome: "x" }, "nao-e-uuid")).toMatchObject({ erro: "dados_invalidos", campo: "user" });
  });

  it("os limites de HOJE das telas: 1 caractere a mais → dados_invalidos", () => {
    const casos: Array<[string, Record<string, unknown>, string]> = [
      ["transacao_criar", { ...EXEMPLOS.transacao_criar, descricao: "x".repeat(DESCRICAO_MAX + 1) }, "descricao"],
      ["transacao_criar", { ...EXEMPLOS.transacao_criar, observacao: "x".repeat(OBSERVACAO_MAX + 1) }, "observacao"],
      ["categoria_criar", { nome: "x".repeat(CATEGORIA_NOME_MAX + 1) }, "nome"],
      ["categoria_renomear", { id: ID, nome: "x".repeat(CATEGORIA_NOME_MAX + 1) }, "nome"],
      ["modelo_recibo_criar", { ...EXEMPLOS.modelo_recibo_criar, titulo: "x".repeat(TITULO_MODELO_MAX + 1) }, "titulo"],
      ["modelo_recibo_editar", { id: ID, conteudo: "x".repeat(CONTEUDO_MODELO_MAX + 1) }, "conteudo"],
    ];
    for (const [acao, corpo, campo] of casos) expect(recusa(acao, corpo), `${acao}.${campo}`).toEqual({ ok: false, erro: "dados_invalidos", campo });
    // no limite passa
    expect(recusa("transacao_criar", { ...EXEMPLOS.transacao_criar, descricao: "x".repeat(DESCRICAO_MAX) }).ok).toBe(true);
    expect(recusa("modelo_recibo_criar", { ...EXEMPLOS.modelo_recibo_criar, conteudo: "x".repeat(CONTEUDO_MODELO_MAX) }).ok).toBe(true);
    // os limites são os da tela
    expect([DESCRICAO_MAX, OBSERVACAO_MAX, CATEGORIA_NOME_MAX, VALOR_MAX]).toEqual([
      financeiroUtil.DESCRICAO_MAX, financeiroUtil.OBSERVACAO_MAX, financeiroUtil.CATEGORIA_NOME_MAX, financeiroUtil.VALOR_MAX,
    ]);
    expect([TITULO_MODELO_MAX, CONTEUDO_MODELO_MAX, DESCRICAO_RECIBO_MAX]).toEqual([recibos.TITULO_MODELO_MAX, recibos.CONTEUDO_MODELO_MAX, recibos.DESCRICAO_RECIBO_MAX]);
  });

  it("valor: > 0 e dentro do numeric(12,2); tipo e forma de pagamento nas listas do banco; data no formato", () => {
    for (const valor of [0, -1, VALOR_MAX + 1, Number.NaN, "150", null]) {
      expect(recusa("transacao_criar", { ...EXEMPLOS.transacao_criar, valor }), String(valor)).toMatchObject({ erro: "dados_invalidos", campo: "valor" });
    }
    expect(recusa("transacao_criar", { ...EXEMPLOS.transacao_criar, valor: VALOR_MAX }).ok).toBe(true);
    expect(recusa("transacao_criar", { ...EXEMPLOS.transacao_criar, tipo: "transferencia" })).toMatchObject({ campo: "tipo" });
    expect(recusa("transacao_criar", { ...EXEMPLOS.transacao_criar, metodo: "cheque" })).toMatchObject({ campo: "metodo" });
    expect(recusa("transacao_criar", { ...EXEMPLOS.transacao_criar, data: "11/10/2026" })).toMatchObject({ campo: "data" });
    expect(TIPOS_MOVIMENTACAO).toEqual(financeiroUtil.TIPOS.map((t) => t.valor));
    expect(METODOS_MOVIMENTACAO).toEqual(financeiroUtil.METODOS.map((m) => m.valor));
    expect(METODOS_MOVIMENTACAO).toEqual(lancamentos.METODOS_LANCAMENTO.map((m) => m.valor));
  });

  it("obrigatórios e o que mudar: criar sem descrição, estornar sem o estado, renomear sem nome, editar vazio", () => {
    const { descricao: _d, ...semDescricao } = EXEMPLOS.transacao_criar;
    expect(recusa("transacao_criar", semDescricao)).toMatchObject({ erro: "dados_invalidos", campo: "descricao" });
    expect(recusa("transacao_estornar", { id: ID })).toMatchObject({ erro: "dados_invalidos", campo: "estornada" });
    expect(recusa("transacao_estornar", { id: ID, estornada: "sim" })).toMatchObject({ erro: "dados_invalidos", campo: "estornada" });
    expect(recusa("categoria_renomear", { id: ID })).toMatchObject({ erro: "dados_invalidos", campo: "nome" });
    expect(recusa("modelo_recibo_criar", { titulo: "T" })).toMatchObject({ erro: "dados_invalidos", campo: "conteudo" });
    expect(recusa("modelo_recibo_editar", { id: ID, nutricionista_id: OUTRA })).toEqual({ ok: false, erro: "dados_invalidos", campo: "nada_a_mudar" });
    expect(recusa("transacao_criar", { ...EXEMPLOS.transacao_criar, observacao: 3 })).toMatchObject({ campo: "observacao" });
  });
});

describe("hml-19d — as especiais: sementes, recibo e tags", () => {
  it("padroes_garantir { conta_id }: a conta é obrigatória e uuid", () => {
    expect(lerPadroes({ conta_id: CONTA.toUpperCase() })).toEqual({ ok: true, contaId: CONTA });
    for (const conta_id of [undefined, null, "", "c1"]) expect(lerPadroes({ conta_id })).toEqual({ ok: false, erro: "dados_invalidos", campo: "conta_id" });
  });

  it("recibo_emitir: as colunas do recibo de hoje (o dono e o número nunca do corpo); obrigatórios; limites", () => {
    const corpo = {
      conta_id: CONTA, paciente_id: P, transacao_id: ID, modelo_id: null, valor: 180, data: "2026-10-11", descricao: "Atendimento",
      texto: `Recibo nº ${MARCA_NUMERO_RECIBO}`,
    };
    expect(lerReciboEmitir({ ...corpo, nutricionista_id: OUTRA, numero: 7, deleted_at: null, id: ID })).toEqual({ ok: true, recibo: corpo });
    expect(lerReciboEmitir({ ...corpo, transacao_id: null, conta_id: null })).toMatchObject({ ok: true });
    for (const campo of ["paciente_id", "valor", "data", "descricao", "texto"]) {
      const { [campo]: _x, ...sem } = corpo as Record<string, unknown>;
      expect(lerReciboEmitir(sem), campo).toEqual({ ok: false, erro: "dados_invalidos", campo });
    }
    expect(lerReciboEmitir({ ...corpo, descricao: "x".repeat(DESCRICAO_RECIBO_MAX + 1) })).toMatchObject({ campo: "descricao" });
    expect(lerReciboEmitir({ ...corpo, texto: "x".repeat(TEXTO_RECIBO_MAX + 1) })).toMatchObject({ campo: "texto" });
    expect(lerReciboEmitir({ ...corpo, valor: 0 })).toMatchObject({ campo: "valor" });
    expect(lerReciboEmitir({ ...corpo, transacao_id: "t1" })).toMatchObject({ campo: "transacao_id" });
  });

  it("recibo_excluir { id }", () => {
    expect(lerReciboExcluir({ id: ID })).toEqual({ ok: true, id: ID });
    expect(lerReciboExcluir({ id: "r1" })).toEqual({ ok: false, erro: "dados_invalidos", campo: "id" });
  });

  it("tags_salvar { paciente_id, tags }: a lista como a tela marcou; tipo e tamanho conferidos; vazia vale (tirar todas)", () => {
    expect(lerTags({ paciente_id: P, tags: ["VIP", "Pagante"], nutricionista_id: OUTRA, mensalidade_valor: 1 })).toEqual({ ok: true, pacienteId: P, tags: ["VIP", "Pagante"] });
    expect(lerTags({ paciente_id: P, tags: [] })).toEqual({ ok: true, pacienteId: P, tags: [] });
    expect(lerTags({ tags: ["VIP"] })).toMatchObject({ erro: "dados_invalidos", campo: "paciente_id" });
    expect(lerTags({ paciente_id: P })).toMatchObject({ erro: "dados_invalidos", campo: "tags" });
    expect(lerTags({ paciente_id: P, tags: "VIP" })).toMatchObject({ campo: "tags" });
    expect(lerTags({ paciente_id: P, tags: [1] })).toMatchObject({ campo: "tags" });
    expect(lerTags({ paciente_id: P, tags: ["x".repeat(TAG_MAX + 1)] })).toMatchObject({ campo: "tags" });
    expect(lerTags({ paciente_id: P, tags: Array.from({ length: TAGS_MAX + 1 }, (_, i) => `t${i}`) })).toMatchObject({ campo: "tags" });
    // a tag nova da tela tem até 40: cabe com folga
    expect(TAG_MAX).toBeGreaterThan(40);
  });
});

describe("hml-19d — os erros: o status de cada código e a tradução do banco", () => {
  it("STATUS_DO_ERRO_FINANCEIRO (o resto é 400: acao_invalida, dados_invalidos, schema_invalido)", () => {
    expect(STATUS_DO_ERRO_FINANCEIRO).toEqual({
      sem_login: 401, sem_acesso: 403, nao_encontrado: 404, metodo: 405, nome_repetido: 409, conflito: 409, corpo_grande: 413, muitas_acoes: 429,
      erro_interno: 500, tempo_esgotado: 504,
    });
    for (const c of ["acao_invalida", "dados_invalidos", "schema_invalido", "qualquer", undefined, null]) expect(statusDoErroFinanceiro(c)).toBe(400);
    expect(statusDoErroFinanceiro("nome_repetido")).toBe(409);
  });

  it("o 23505 nas categorias = nome_repetido; fora delas = conflito; os raise das RPCs passam; o resto não vaza", () => {
    expect(erroDoFinanceiro("categoria_criar", { code: "23505", message: "duplicate key value violates unique constraint" })).toEqual({ erro: "nome_repetido", inesperado: false });
    expect(erroDoFinanceiro("categoria_renomear", { code: "23505" })).toEqual({ erro: "nome_repetido", inesperado: false });
    expect(erroDoFinanceiro("padroes_garantir", { code: "23505" })).toEqual({ erro: "conflito", inesperado: false });
    expect(erroDoFinanceiro("recibo_emitir", { code: "P0002", message: "nao_encontrado" })).toEqual({ erro: "nao_encontrado", inesperado: false });
    expect(erroDoFinanceiro("padroes_garantir", { code: "42501", message: "sem_acesso" })).toEqual({ erro: "sem_acesso", inesperado: false });
    expect(erroDoFinanceiro("recibo_excluir", { code: "42501", message: "sem_login" })).toEqual({ erro: "sem_login", inesperado: false });
    expect(erroDoFinanceiro("recibo_emitir", { code: "22023", message: "dados_invalidos" })).toEqual({ erro: "dados_invalidos", inesperado: false });
    expect(erroDoFinanceiro("transacao_criar", { code: "42501", message: "new row violates row-level security policy" })).toEqual({ erro: "sem_acesso", inesperado: false });
    expect(erroDoFinanceiro("transacao_criar", { code: "23514" })).toEqual({ erro: "dados_invalidos", inesperado: false });
    expect(erroDoFinanceiro("transacao_criar", { code: "22003" })).toEqual({ erro: "dados_invalidos", inesperado: false });
    expect(erroDoFinanceiro("transacao_criar", { message: "TimeoutError: signal timed out" })).toEqual({ erro: "tempo_esgotado", inesperado: true });
    expect(erroDoFinanceiro("transacao_criar", { code: "XX000", message: "boom" })).toEqual({ erro: "erro_interno", inesperado: true });
    expect(erroDoFinanceiro("recibo_emitir", { code: "P0002", message: "outra coisa" })).toEqual({ erro: "erro_interno", inesperado: true });
    expect(ERROS_DAS_RPCS_DO_FINANCEIRO).toEqual(["sem_login", "sem_acesso", "dados_invalidos", "nao_encontrado"]);
  });
});

describe("hml-19d — os textos padrão da semente são os de HOJE (byte a byte) e as telas reexportam daqui", () => {
  it("as 6 categorias e o título do modelo", () => {
    expect(CATEGORIAS_PADRAO).toEqual(["Consulta", "Retorno", "Plano alimentar", "Aluguel", "Material", "Outros"]);
    expect(TITULO_MODELO_PADRAO).toBe("Recibo padrão");
    expect(financeiroUtil.CATEGORIAS_PADRAO).toEqual(CATEGORIAS_PADRAO);
    expect(lancamentos.CATEGORIAS_PADRAO).toEqual(CATEGORIAS_PADRAO);
    expect(recibos.TITULO_MODELO_PADRAO).toBe(TITULO_MODELO_PADRAO);
  });

  it("os 2 textos do modelo (o do Physiq e o do Nutri), byte a byte os de hoje", () => {
    const corpo = (fim: string) => [
      `Recebi de *|NOME_PACIENTE|*, CPF *|NUMERO_DOCUMENTO_PACIENTE|*, a quantia de *|VALOR_CONSULTA|* (*|VALOR_POR_EXTENSO|*), referente a ${fim}.`,
      "", "Para maior clareza, firmo o presente recibo.", "", "*|DATA_HOJE|*", "", "*|NOME_NUTRICIONISTA|*", "*|CARIMBO|*",
    ].join("\n");
    expect(CONTEUDO_MODELO_PADRAO).toBe(corpo("atendimento"));
    expect(CONTEUDO_MODELO_PADRAO_NUTRI).toBe(corpo("atendimento nutricional"));
    expect([CONTEUDO_MODELO_PADRAO.length, CONTEUDO_MODELO_PADRAO_NUTRI.length]).toEqual([242, 254]);
    expect(recibos.CONTEUDO_MODELO_PADRAO).toBe(CONTEUDO_MODELO_PADRAO);
    expect(NUTRI_DA_TELA).toBe(CONTEUDO_MODELO_PADRAO_NUTRI);
  });

  it("o texto escolhido pelo papel é o mesmo do padraoDoRecibo da tela (decisão C)", () => {
    for (const papeis of [[], ["dono"], ["personal"], ["nutricionista"], ["dono", "nutricionista"], ["personal", "nutricionista"], ["dono", "personal"], null]) {
      expect(modeloPadraoDoRecibo(papeis), JSON.stringify(papeis)).toEqual({ titulo: "Recibo padrão", conteudo: padraoDoRecibo(papeis).conteudoModelo, favorito: true });
      expect(ehSoNutricionista(papeis)).toBe(padraoDoRecibo(papeis).nutri);
    }
  });
});

describe("hml-19d — o número do recibo: o servidor escreve igual à tela (e a marca não se mexe)", () => {
  it("numeroDoRecibo = formatarNumeroRecibo (4 dígitos com zero à esquerda; acima disso, inteiro — sem cortar)", () => {
    for (const n of [0, 1, 7, 42, 999, 1000, 9999, 10000, 12345, 123456]) expect(numeroDoRecibo(n), String(n)).toBe(recibos.formatarNumeroRecibo(n));
    expect([numeroDoRecibo(1), numeroDoRecibo(9999), numeroDoRecibo(12345)]).toEqual(["0001", "9999", "12345"]);
  });

  it("a marca: nem o normalizarConteudo (espaços, linhas) nem as tags (*|…|*) mexem nela", () => {
    expect(MARCA_NUMERO_RECIBO).toBe("\u0001NUMERO_RECIBO\u0001");
    const texto = `${MARCA_NUMERO_RECIBO}  \r\nRecibo nº ${MARCA_NUMERO_RECIBO}\n\n\n\n${MARCA_NUMERO_RECIBO}`;
    expect(normalizarConteudo(texto)).toBe(`${MARCA_NUMERO_RECIBO}\nRecibo nº ${MARCA_NUMERO_RECIBO}\n\n${MARCA_NUMERO_RECIBO}`);
    expect(recibos.temTagPendente(MARCA_NUMERO_RECIBO)).toBe(false);
  });
});
