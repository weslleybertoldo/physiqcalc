// Physiq hml-20c (H-102 🟡 · jeito 2, decisão 8 da spec hml-20) — as 5 gravações da Pré-consulta que saíram do navegador: as regras PURAS
// (supabase-principal/functions/_shared/nutricao-regras.ts → ACOES_PRECONSULTA, montarGravacaoPreconsulta, slugDaPreconsulta) e o módulo
// da função (functions/nutricao/preconsulta.ts — os imports da porta são só de tipo: roda aqui com um cliente falso no lugar do PostgREST
// com o RLS de quem chama). Positivo: cada ação grava as colunas que a tela grava hoje (src/painel/preconsulta/dados.ts:72, :101, :108, :147,
// :161), o dono = quem chama, o slug nasce no servidor no formato do /f/:slug, a linha volta com as colunas que a tela usa. Negativo: coluna
// fora da lista cai (o dono, a conta no editar, o slug, o importada_em, o deleted_at do corpo), uuid/origem/tipo ruins, nada a mudar, os
// códigos dos gatilhos da W21, 0 linha → nao_encontrado, 5 conflitos de slug → conflito. As 4 listas de antes e o `ler` não mudam.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  ACOES_DA_AVALIACAO, ACOES_DA_DIETA, ACOES_DA_PRECONSULTA, ACOES_DO_ALUNO, ACOES_NUTRICAO, ACOES_PRECONSULTA, COLUNAS_FORMULARIO_PRECONSULTA,
  COLUNAS_RESPOSTA_PRECONSULTA, ERROS_DA_PRECONSULTA, IMPORTACOES_PRECONSULTA, ORIGENS_PRECONSULTA, SLUG_PRECONSULTA_ALFABETO, SLUG_PRECONSULTA_TAMANHO,
  SLUG_PRECONSULTA_TENTATIVAS, STATUS_DO_ERRO, TABELAS_PRECONSULTA, VOLTA_FORMULARIO_PRECONSULTA, VOLTA_RESPOSTA_PRECONSULTA, acaoDaPreconsulta,
  erroDaRpc, montarGravacaoPreconsulta, moduloDoPedido, slugDaPreconsulta, statusDoErro,
} from "../../supabase-principal/functions/_shared/nutricao-regras";
import { atenderPreconsulta } from "../../supabase-principal/functions/nutricao/preconsulta";
import { ORIGENS, SLUG_ALFABETO, SLUG_TAMANHO, slugValido } from "@/painel/preconsulta/preconsultaUtil";

const RAIZ = resolve(__dirname, "../..");
const EU = "33333333-3333-4333-8333-333333333333";
const OUTRA = "99999999-9999-4999-8999-999999999999";
const CONTA = "66666666-6666-4666-8666-666666666666";
const ID = "22222222-2222-4222-8222-222222222222";
const ALUNO = "55555555-5555-4555-8555-555555555555";
const ALVO = "88888888-8888-4888-8888-888888888888";
const AGORA = new Date("2026-10-12T14:00:00.000Z");

/** As colunas do Row de uma tabela no tipo gerado do principal (o "tipo" que a tela recebe). */
function colunasDoTipo(tabela: string): string[] {
  const tipos = readFileSync(resolve(RAIZ, "src/integrations/principal/types.ts"), "utf-8");
  const m = new RegExp(`\\n      ${tabela}: \\{\\n        Row: \\{\\n([\\s\\S]*?)\\n        \\}`).exec(tipos);
  if (!m) throw new Error(`tabela ${tabela} fora do tipo gerado`);
  return [...m[1].matchAll(/^ {10}([a-z_0-9]+)\??: /gm)].map((x) => x[1]).sort();
}

/** O formulário como a tela grava hoje (dados.ts:72): o registro + a conta (o dono e o slug a tela mandava; agora o servidor põe). */
const FORMULARIO = {
  conta_id: CONTA, titulo: "Pré-anamnese", descricao: "antes da consulta", origem: "anamnese", origem_id: ALVO,
  perguntas: [{ id: "p1", tipo: "texto", texto: "Como você dorme?" }], faixas: [], ativo: true,
};

describe("hml-20c — as 5 ações da Pré-consulta (a lista fechada; as 4 de antes e o `ler` não mudam)", () => {
  it("as 5 ações, nas 2 tabelas, e nenhuma cruza com as listas de antes nem com o `ler`", () => {
    expect([...ACOES_DA_PRECONSULTA].sort()).toEqual([
      "preconsulta_formulario_criar", "preconsulta_formulario_editar", "preconsulta_formulario_excluir", "preconsulta_resposta_excluir", "preconsulta_resposta_ligar",
    ]);
    expect([...new Set(ACOES_DA_PRECONSULTA.map((a) => ACOES_PRECONSULTA[a].tabela))].sort()).toEqual([...TABELAS_PRECONSULTA].sort());
    const antes = [...ACOES_NUTRICAO, ...ACOES_DA_DIETA, ...ACOES_DO_ALUNO, ...ACOES_DA_AVALIACAO, "ler"] as string[];
    for (const a of ACOES_DA_PRECONSULTA) expect(antes, a).not.toContain(a);
  });

  it("o despacho: as 5 vão ao módulo da Pré-consulta; as de antes seguem no módulo de antes; o resto, acao_invalida", () => {
    for (const acao of ACOES_DA_PRECONSULTA) expect(moduloDoPedido({ acao }), acao).toEqual({ modulo: "preconsulta", acao });
    expect(moduloDoPedido({ acao: "ler" })).toEqual({ modulo: "leitura", acao: "ler" });
    expect(moduloDoPedido({ acao: "anamnese_criar" })?.modulo).toBe("prontuario");
    expect(moduloDoPedido({ acao: "plano_criar" })?.modulo).toBe("dieta");
    expect(moduloDoPedido({ acao: "aluno_marcar_refeicao" })?.modulo).toBe("aluno");
    expect(moduloDoPedido({ acao: "antropometria_criar" })?.modulo).toBe("avaliacao");
    for (const acao of ["preconsulta_formulario", "preconsulta_responder", "formulario_criar", "PRECONSULTA_FORMULARIO_CRIAR", "__proto__", null]) {
      expect(moduloDoPedido({ acao }), String(acao)).toBeNull();
      expect(acaoDaPreconsulta(acao), String(acao)).toBeNull();
    }
    // o índice da função conhece o módulo novo
    const indice = readFileSync(resolve(RAIZ, "supabase-principal/functions/nutricao/index.ts"), "utf-8");
    expect(indice).toMatch(/import \{ atenderPreconsulta \} from "\.\/preconsulta\.ts";/);
  });

  it("os códigos dos gatilhos da W21 voltam como eles (403); os status de antes não mudam", () => {
    expect(ERROS_DA_PRECONSULTA).toEqual(["aluno_invisivel", "resposta_imutavel", "formulario_imutavel"]);
    for (const e of ERROS_DA_PRECONSULTA) {
      expect(statusDoErro(e), e).toBe(403);
      // o banco levanta com o 42501 e a mensagem = o código: volta o código (não o sem_acesso genérico), sem aviso de defeito
      expect(erroDaRpc({ code: "42501", message: e }, ERROS_DA_PRECONSULTA), e).toEqual({ erro: e, inesperado: false });
    }
    expect(erroDaRpc({ code: "42501", message: "new row violates row-level security policy" }, ERROS_DA_PRECONSULTA)).toEqual({ erro: "sem_acesso", inesperado: false });
    expect([STATUS_DO_ERRO.sem_acesso, STATUS_DO_ERRO.nao_encontrado, STATUS_DO_ERRO.conflito, statusDoErro("dados_invalidos")]).toEqual([403, 404, 409, 400]);
  });

  it("as colunas que a tela recebe = as do Row de hoje (o select('*') escrito coluna a coluna); a resposta com o formulário embutido (SELECT_RESPOSTA)", () => {
    expect([...COLUNAS_FORMULARIO_PRECONSULTA].sort()).toEqual(colunasDoTipo("formularios_preconsulta"));
    expect([...COLUNAS_RESPOSTA_PRECONSULTA].sort()).toEqual(colunasDoTipo("respostas_preconsulta"));
    expect(VOLTA_FORMULARIO_PRECONSULTA).toBe(COLUNAS_FORMULARIO_PRECONSULTA.join(", "));
    expect(VOLTA_RESPOSTA_PRECONSULTA).toBe(`${COLUNAS_RESPOSTA_PRECONSULTA.join(", ")}, formulario:formularios_preconsulta(id, titulo, origem, origem_id, slug, ativo, deleted_at)`);
    for (const v of [VOLTA_FORMULARIO_PRECONSULTA, VOLTA_RESPOSTA_PRECONSULTA]) expect(v).not.toContain("*");
  });

  it("as listas do servidor = as da tela: as origens, o tipo da importação, o alfabeto e o tamanho do slug (o /f/:slug aceita o que nasce aqui)", () => {
    expect([...ORIGENS_PRECONSULTA]).toEqual(ORIGENS.map((o) => o.valor));
    expect([...IMPORTACOES_PRECONSULTA]).toEqual(["anamnese", "questionario"]);
    expect(SLUG_PRECONSULTA_ALFABETO).toBe(SLUG_ALFABETO);
    expect(SLUG_PRECONSULTA_TAMANHO).toBe(SLUG_TAMANHO);
    expect(SLUG_PRECONSULTA_TENTATIVAS).toBe(5);
    expect(SLUG_PRECONSULTA_ALFABETO).toHaveLength(32); // 256 % 32 = 0: cada byte aleatório cai num caractere sem viés
    for (let i = 0; i < 50; i++) {
      const slug = slugDaPreconsulta(crypto.getRandomValues(new Uint8Array(SLUG_PRECONSULTA_TAMANHO)));
      expect(slug, slug).toHaveLength(8);
      expect(slugValido(slug), slug).toBe(true);
    }
    // cada byte → o caractere da posição (byte % 32): 0 a, 1 b, 31 9, 32 a, 255 9, 64 a, 100 e, 7 h
    expect(slugDaPreconsulta([0, 1, 31, 32, 255, 64, 100, 7])).toBe("ab9a9aeh");
  });
});

describe("hml-20c — montarGravacaoPreconsulta: as colunas que a tela grava, o dono = quem chama, o resto do corpo cai", () => {
  it("formulário › criar (dados.ts:72): a conta, o título, a descrição, a origem, as perguntas, as faixas e o ativo; o dono = quem chama; slug/dono/datas do corpo caem", () => {
    const g = montarGravacaoPreconsulta("preconsulta_formulario_criar", { ...FORMULARIO, nutricionista_id: OUTRA, slug: "escolhido", deleted_at: "x", id: ID, created_at: "x" }, EU, AGORA);
    expect(g).toEqual({
      ok: true, tabela: "formularios_preconsulta", operacao: "inserir", volta: VOLTA_FORMULARIO_PRECONSULTA,
      valores: { ...FORMULARIO, nutricionista_id: EU },
    });
  });

  it("formulário › criar: faltando conta/título/origem/perguntas/faixas, uuid ruim, origem fora da lista, perguntas que não são lista → dados_invalidos", () => {
    for (const campo of ["conta_id", "titulo", "origem", "perguntas", "faixas"]) {
      const corpo: Record<string, unknown> = { ...FORMULARIO };
      delete corpo[campo];
      expect(montarGravacaoPreconsulta("preconsulta_formulario_criar", corpo, EU), campo).toEqual({ ok: false, erro: "dados_invalidos", campo });
    }
    expect(montarGravacaoPreconsulta("preconsulta_formulario_criar", { ...FORMULARIO, conta_id: "x" }, EU)).toMatchObject({ ok: false, campo: "conta_id" });
    expect(montarGravacaoPreconsulta("preconsulta_formulario_criar", { ...FORMULARIO, origem: "outra" }, EU)).toMatchObject({ ok: false, campo: "origem" });
    expect(montarGravacaoPreconsulta("preconsulta_formulario_criar", { ...FORMULARIO, perguntas: {} }, EU)).toMatchObject({ ok: false, campo: "perguntas" });
    expect(montarGravacaoPreconsulta("preconsulta_formulario_criar", { ...FORMULARIO, titulo: "x".repeat(501) }, EU)).toMatchObject({ ok: false, campo: "titulo" });
    expect(montarGravacaoPreconsulta("preconsulta_formulario_criar", FORMULARIO, "nao-uuid")).toEqual({ ok: false, erro: "dados_invalidos", campo: "user" });
  });

  it("formulário › editar (dados.ts:101): só o patch de hoje (título, descrição, perguntas, faixas, ativo) — a conta, a origem e o dono do corpo caem", () => {
    const g = montarGravacaoPreconsulta("preconsulta_formulario_editar", { id: ID.toUpperCase(), ativo: false, conta_id: OUTRA, origem: "questionario", nutricionista_id: OUTRA, slug: "x" }, EU);
    expect(g).toEqual({ ok: true, tabela: "formularios_preconsulta", operacao: "editar", id: ID, valores: { ativo: false }, volta: VOLTA_FORMULARIO_PRECONSULTA });
    expect(montarGravacaoPreconsulta("preconsulta_formulario_editar", { id: ID, titulo: "Novo", descricao: "", perguntas: [], faixas: [] }, EU)).toMatchObject({
      ok: true, valores: { titulo: "Novo", descricao: "", perguntas: [], faixas: [] },
    });
    expect(montarGravacaoPreconsulta("preconsulta_formulario_editar", { id: ID, conta_id: CONTA }, EU)).toEqual({ ok: false, erro: "dados_invalidos", campo: "nada_a_mudar" });
    expect(montarGravacaoPreconsulta("preconsulta_formulario_editar", { id: "x", ativo: true }, EU)).toEqual({ ok: false, erro: "dados_invalidos", campo: "id" });
  });

  it("formulário › excluir e resposta › excluir (dados.ts:108, :161): a Lixeira (deleted_at = o agora do servidor); o deleted_at do corpo não vale", () => {
    for (const [acao, tabela] of [["preconsulta_formulario_excluir", "formularios_preconsulta"], ["preconsulta_resposta_excluir", "respostas_preconsulta"]] as const) {
      expect(montarGravacaoPreconsulta(acao, { id: ID, deleted_at: "1999-01-01T00:00:00Z" }, EU, AGORA), acao).toEqual({
        ok: true, tabela, operacao: "excluir_suave", id: ID, valores: { deleted_at: AGORA.toISOString() },
      });
      expect(montarGravacaoPreconsulta(acao, {}, EU), acao).toEqual({ ok: false, erro: "dados_invalidos", campo: "id" });
    }
  });

  it("resposta › ligar (dados.ts:147): o aluno (null desliga); a importação (o tipo e o id JUNTOS, o importada_em do servidor); o resto cai", () => {
    expect(montarGravacaoPreconsulta("preconsulta_resposta_ligar", { id: ID, paciente_id: ALUNO, nutricionista_id: OUTRA, conta_id: OUTRA, formulario_id: OUTRA }, EU, AGORA)).toEqual({
      ok: true, tabela: "respostas_preconsulta", operacao: "editar", id: ID, valores: { paciente_id: ALUNO }, volta: VOLTA_RESPOSTA_PRECONSULTA,
    });
    expect(montarGravacaoPreconsulta("preconsulta_resposta_ligar", { id: ID, paciente_id: null }, EU, AGORA)).toMatchObject({ ok: true, valores: { paciente_id: null } });
    expect(montarGravacaoPreconsulta("preconsulta_resposta_ligar", { id: ID, importada_tipo: "anamnese", importada_id: ALVO, importada_em: "1999-01-01T00:00:00Z" }, EU, AGORA)).toMatchObject({
      ok: true, valores: { importada_tipo: "anamnese", importada_id: ALVO, importada_em: AGORA.toISOString() },
    });
    expect(montarGravacaoPreconsulta("preconsulta_resposta_ligar", { id: ID, importada_tipo: "anamnese" }, EU)).toEqual({ ok: false, erro: "dados_invalidos", campo: "importada" });
    expect(montarGravacaoPreconsulta("preconsulta_resposta_ligar", { id: ID, importada_id: ALVO }, EU)).toEqual({ ok: false, erro: "dados_invalidos", campo: "importada" });
    expect(montarGravacaoPreconsulta("preconsulta_resposta_ligar", { id: ID, importada_tipo: "documento", importada_id: ALVO }, EU)).toMatchObject({ ok: false, campo: "importada_tipo" });
    expect(montarGravacaoPreconsulta("preconsulta_resposta_ligar", { id: ID, paciente_id: "x" }, EU)).toMatchObject({ ok: false, campo: "paciente_id" });
    expect(montarGravacaoPreconsulta("preconsulta_resposta_ligar", { id: ID, nome: "outro nome" }, EU)).toEqual({ ok: false, erro: "dados_invalidos", campo: "nada_a_mudar" });
    expect(montarGravacaoPreconsulta("preconsulta_responder", { id: ID }, EU)).toEqual({ ok: false, erro: "acao_invalida" });
  });
});

// ───────────────────────── o módulo, com o cliente falso (o PostgREST com o RLS de quem chama) ─────────────────────────
type Passo = [string, ...unknown[]];
interface Ida {
  tabela: string;
  passos: Passo[];
}
function contexto(acao: string, corpo: Record<string, unknown>, responder: (ida: Ida) => { data: unknown; error: unknown }) {
  const idas: Ida[] = [];
  const cadeia = (ida: Ida) => {
    const b: Record<string, unknown> = {};
    for (const op of ["insert", "update", "eq", "is", "select", "single"]) b[op] = (...args: unknown[]) => (ida.passos.push([op, ...args]), b);
    b.then = (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) => Promise.resolve(responder(ida)).then(ok, falhou);
    return b;
  };
  const comoPessoa = {
    from: (tabela: string) => {
      const ida: Ida = { tabela, passos: [] };
      idas.push(ida);
      return cadeia(ida);
    },
    rpc: () => {
      throw new Error("a Pré-consulta não chama RPC");
    },
  };
  const log = { info: vi.fn(), aviso: vi.fn(), erro: vi.fn(), excecao: vi.fn() };
  const c = { schema: "staging", origin: null, corpo: { ...corpo, acao }, userId: EU, comoPessoa, log };
  return { c: c as unknown as Parameters<typeof atenderPreconsulta>[0], idas, log };
}
const slugDa = (ida: Ida) => ((ida.passos[0][1] as Record<string, unknown>).slug as string) ?? "";

describe("hml-20c — o módulo da Pré-consulta (como a pessoa): o que vai ao banco e o que volta à tela", () => {
  it("criar: insert com as colunas conferidas + o dono (quem chama) + o slug nascido aqui; select das colunas da tela; volta a linha", async () => {
    const linha = { id: ID, slug: "abcd2345" };
    const { c, idas } = contexto("preconsulta_formulario_criar", { ...FORMULARIO, nutricionista_id: OUTRA, slug: "meu-slug" }, () => ({ data: linha, error: null }));
    expect(await atenderPreconsulta(c, "preconsulta_formulario_criar")).toEqual({ ok: true, linha });
    expect(idas).toHaveLength(1);
    const [ida] = idas;
    expect(ida.tabela).toBe("formularios_preconsulta");
    const slug = slugDa(ida);
    expect(slugValido(slug), slug).toBe(true);
    expect(ida.passos).toEqual([["insert", { ...FORMULARIO, nutricionista_id: EU, slug }], ["select", VOLTA_FORMULARIO_PRECONSULTA], ["single"]]);
  });

  it("criar: o conflito do slug (23505) tenta OUTRO slug; 5 conflitos → conflito (409); outro erro não tenta de novo", async () => {
    let n = 0;
    const duas = contexto("preconsulta_formulario_criar", FORMULARIO, () => (++n < 3 ? { data: null, error: { code: "23505", message: "duplicate key" } } : { data: { id: ID }, error: null }));
    expect(await atenderPreconsulta(duas.c, "preconsulta_formulario_criar")).toEqual({ ok: true, linha: { id: ID } });
    expect(duas.idas).toHaveLength(3);
    expect(new Set(duas.idas.map(slugDa)).size).toBeGreaterThan(1); // (8 caracteres aleatórios: repetir 3 vezes é impossível na prática)
    const sempre = contexto("preconsulta_formulario_criar", FORMULARIO, () => ({ data: null, error: { code: "23505", message: "duplicate key" } }));
    expect(await atenderPreconsulta(sempre.c, "preconsulta_formulario_criar")).toEqual({ ok: false, erro: "conflito" });
    expect(sempre.idas).toHaveLength(SLUG_PRECONSULTA_TENTATIVAS);
    const rls = contexto("preconsulta_formulario_criar", FORMULARIO, () => ({ data: null, error: { code: "42501", message: "new row violates row-level security policy" } }));
    expect(await atenderPreconsulta(rls.c, "preconsulta_formulario_criar")).toEqual({ ok: false, erro: "sem_acesso" });
    expect(rls.idas).toHaveLength(1);
    expect(rls.log.excecao).not.toHaveBeenCalled();
  });

  it("editar e ligar: update das colunas conferidas pelo id, a linha com as colunas da tela; 0 linha → nao_encontrado; o código do gatilho volta como ele", async () => {
    const ok = contexto("preconsulta_formulario_editar", { id: ID, ativo: false, nutricionista_id: OUTRA }, () => ({ data: [{ id: ID, ativo: false }], error: null }));
    expect(await atenderPreconsulta(ok.c, "preconsulta_formulario_editar")).toEqual({ ok: true, linha: { id: ID, ativo: false } });
    expect(ok.idas).toEqual([{ tabela: "formularios_preconsulta", passos: [["update", { ativo: false }], ["eq", "id", ID], ["select", VOLTA_FORMULARIO_PRECONSULTA]] }]);
    const lig = contexto("preconsulta_resposta_ligar", { id: ID, paciente_id: ALUNO }, () => ({ data: [{ id: ID, paciente_id: ALUNO }], error: null }));
    expect(await atenderPreconsulta(lig.c, "preconsulta_resposta_ligar")).toEqual({ ok: true, linha: { id: ID, paciente_id: ALUNO } });
    expect(lig.idas).toEqual([{ tabela: "respostas_preconsulta", passos: [["update", { paciente_id: ALUNO }], ["eq", "id", ID], ["select", VOLTA_RESPOSTA_PRECONSULTA]] }]);
    const nada = contexto("preconsulta_resposta_ligar", { id: ID, paciente_id: ALUNO }, () => ({ data: [], error: null }));
    expect(await atenderPreconsulta(nada.c, "preconsulta_resposta_ligar")).toEqual({ ok: false, erro: "nao_encontrado" });
    for (const codigo of ERROS_DA_PRECONSULTA) {
      const g = contexto("preconsulta_resposta_ligar", { id: ID, paciente_id: ALUNO }, () => ({ data: null, error: { code: "42501", message: codigo } }));
      expect(await atenderPreconsulta(g.c, "preconsulta_resposta_ligar"), codigo).toEqual({ ok: false, erro: codigo });
      expect(g.log.excecao).not.toHaveBeenCalled();
    }
  });

  it("excluir (formulário e resposta): o update do deleted_at pelo id, só o id de volta; 0 linha (outra conta ou já excluído) → nao_encontrado", async () => {
    for (const [acao, tabela] of [["preconsulta_formulario_excluir", "formularios_preconsulta"], ["preconsulta_resposta_excluir", "respostas_preconsulta"]] as const) {
      const ok = contexto(acao, { id: ID }, () => ({ data: [{ id: ID }], error: null }));
      expect(await atenderPreconsulta(ok.c, acao), acao).toEqual({ ok: true });
      expect(ok.idas, acao).toHaveLength(1);
      expect(ok.idas[0].tabela).toBe(tabela);
      expect(ok.idas[0].passos[0][0]).toBe("update");
      expect(Object.keys(ok.idas[0].passos[0][1] as object)).toEqual(["deleted_at"]);
      expect(ok.idas[0].passos.slice(1)).toEqual([["eq", "id", ID], ["select", "id"]]);
      const nada = contexto(acao, { id: ID }, () => ({ data: [], error: null }));
      expect(await atenderPreconsulta(nada.c, acao), acao).toEqual({ ok: false, erro: "nao_encontrado" });
    }
  });

  it("o corpo fora da forma não vai ao banco (dados_invalidos); o log não leva o corpo (título, perguntas, ids)", async () => {
    const r = contexto("preconsulta_formulario_criar", { ...FORMULARIO, origem: "outra", titulo: "Formulário Sigiloso" }, () => {
      throw new Error("não devia ir ao banco");
    });
    expect(await atenderPreconsulta(r.c, "preconsulta_formulario_criar")).toEqual({ ok: false, erro: "dados_invalidos" });
    expect(r.idas).toEqual([]);
    const texto = JSON.stringify([r.log.aviso.mock.calls, r.log.info.mock.calls]);
    for (const proibido of ["Sigiloso", "Como você dorme", CONTA, ALVO]) expect(texto, proibido).not.toContain(proibido);
  });

  it("o módulo grava como a pessoa (nenhuma chave secreta) e passa os códigos dos gatilhos ao traduzir o erro", () => {
    const fonte = readFileSync(resolve(RAIZ, "supabase-principal/functions/nutricao/preconsulta.ts"), "utf-8");
    expect(fonte).not.toMatch(/SERVICE_ROLE|service_role|createClient\(/);
    expect(fonte).toMatch(/c\.comoPessoa\.from\(g\.tabela\)/);
    expect(fonte.match(/falha\(c, acao, error, ERROS_DA_PRECONSULTA\)/g)).toHaveLength(3);
    expect(fonte).toMatch(/crypto\.getRandomValues\(new Uint8Array\(SLUG_PRECONSULTA_TAMANHO\)\)/);
  });
});
