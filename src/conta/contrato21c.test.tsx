// Physiq hml-21c (H-43 · jeito 2, etapa 3) — o CONTRATO tela × servidor da parte 4: cada lib que mudou (o login do aluno, os dados/ajustes/
// link/faixa do aluno, a pré-checagem do e-mail/CPF, o responsável, a reserva do envio, o Perfil e a Conta das Configurações, a Equipe, o
// ZIP da exclusão, a Mensagens, a Lixeira e os ★ dos Modelos) chama lerConta/acaoConta (ou lerNutricao/lerFinanceiro e as ações *_editar)
// com os params certos, o corpo PASSA nas regras REAIS do servidor (o catálogo e as listas fechadas de _shared/conta-{leituras,regras}.ts:
// nenhuma chave a mais, nenhum valor fora da forma, nenhum dono) e devolve o MESMO tipo e o MESMO erro de hoje. A função responde pelos
// MÓDULOS DE VERDADE (src/test/contaFalsa.ts — a conta; src/test/leituraFalsa.ts — o motor com o catálogo da nutricao/financeiro) sobre o
// banco falso deste teste: a RPC que chega ao banco é a de hoje, com os argumentos de hoje. E as séries: a Mensagens (o resumo + a fila + o
// perfil) numa ida; a casca (o número de Alunos e o da Mensagens + a faixa) numa ida; os Modelos com 1 `ler` da nutricao ∥ 1 da financeiro.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lerPedidoDeLeitura, type CatalogoLeitura } from "../../supabase-principal/functions/_shared/leitura-lote";
import { CATALOGO_CONTA } from "../../supabase-principal/functions/_shared/conta-leituras";
import { CORPOS_DAS_ACOES, lerCorpoDaAcao, moduloDoPedido, type AcaoConta } from "../../supabase-principal/functions/_shared/conta-regras";
import { ACOES, ACOES_DIETA, montarGravacao, montarGravacaoDieta } from "../../supabase-principal/functions/_shared/nutricao-regras";
import { ACOES_FINANCEIRO, montarGravacaoFinanceiro } from "../../supabase-principal/functions/_shared/financeiro-gravar-regras";

const EU = "33333333-3333-4333-8333-333333333333";
const CONTA = "c0c0c0c0-0000-4000-8000-000000000001";
const A1 = "a1111111-1111-4111-8111-111111111111";
const M1 = "b2222222-2222-4222-8222-222222222222";

type Banco = {
  rpc?: (nome: string, args?: Record<string, unknown>) => unknown;
  from?: (t: string) => Record<string, unknown>;
  storage?: { from: (b: string) => Record<string, unknown> };
};
const h = vi.hoisted(() => ({
  eu: "33333333-3333-4333-8333-333333333333",
  banco: {} as Record<string, unknown>,
  corpos: [] as Array<{ nome: string; corpo: Record<string, unknown> }>,
  /** a resposta das AÇÕES da nutricao/financeiro (o "tirar a ★"): null = { ok: true, linha }; um código = a recusa da função */
  recusaDaAcao: null as string | null,
  /** a aluno-enviar não responde (a reserva entra) */
  enviarFalha: true,
  /** 🟡5 da revisão: o `ler` da nutricao cai inteiro (a rede) — a financeiro segue respondendo */
  nutricaoLerFalha: false,
}));

vi.mock("@/integrations/principal/client", async () => {
  const { invocarContaPeloModulo } = await import("@/test/contaFalsa");
  const { lerPeloMotor } = await import("@/test/leituraFalsa");
  const { CATALOGO_NUTRICAO } = await import("../../supabase-principal/functions/_shared/nutricao-leituras");
  const { CATALOGO_FINANCEIRO } = await import("../../supabase-principal/functions/_shared/financeiro-leituras");
  const banco = {
    rpc: (...a: unknown[]) => (h.banco as Banco).rpc?.(...(a as [string, Record<string, unknown>])),
    from: (t: string) => (h.banco as Banco).from?.(t),
    storage: { from: (b: string) => (h.banco as Banco).storage?.from(b) },
  };
  const conta = invocarContaPeloModulo(banco, { userId: h.eu });
  const nutricao = lerPeloMotor(CATALOGO_NUTRICAO, banco, { userId: h.eu });
  const financeiro = lerPeloMotor(CATALOGO_FINANCEIRO, banco, { userId: h.eu });
  const recusa = (erro: string) => ({
    data: null,
    error: { name: "FunctionsHttpError", context: new Response(JSON.stringify({ ok: false, erro }), { status: erro === "nao_encontrado" ? 404 : 400 }) },
  });
  return {
    PRINCIPAL_URL: "https://api-principal.physiqcalc.com.br",
    PRINCIPAL_SCHEMA: "staging",
    principalConfigurado: true,
    principal: {
      functions: {
        invoke: async (nome: string, o: { body: Record<string, unknown> }) => {
          h.corpos.push({ nome, corpo: o.body });
          if (nome === "conta") return conta(o.body);
          if (nome === "nutricao" && o.body.acao === "ler" && h.nutricaoLerFalha) return { data: null, error: { name: "FunctionsFetchError", message: "Failed to fetch" } };
          if ((nome === "nutricao" || nome === "financeiro") && o.body.acao === "ler") return (nome === "nutricao" ? nutricao : financeiro)(o.body);
          if (nome === "nutricao" || nome === "financeiro") return h.recusaDaAcao ? recusa(h.recusaDaAcao) : { data: { ok: true, linha: { id: o.body.id } }, error: null };
          if (nome === "aluno-enviar" && h.enviarFalha) return { data: null, error: { name: "FunctionsFetchError", message: "Failed to fetch" } };
          return { data: null, error: { name: "FunctionsHttpError" } };
        },
      },
    },
  };
});

import { lerResultado } from "@/painel/aluno/envio/regras";
import * as acesso from "@/painel/aluno/resumo/acesso/api";
import { textoErroAcesso } from "@/painel/aluno/resumo/acesso/regras";
import * as dados from "@/painel/aluno/dados/api";
import { enviarAoAluno } from "@/painel/aluno/envio/api";
import { conferirDadoLivre } from "@/nucleo/dadoLivre";
import * as responsavel from "@/publico/legal/responsavel/api";
import * as perfil from "@/painel/configuracoes/perfil/api";
import { dadosParaGravar } from "@/painel/configuracoes/perfil/regras";
import * as equipe from "@/painel/configuracoes/equipe/api";
import { prontuariosParaBaixar } from "@/painel/configuracoes/excluirConta/api";
import * as mensagens from "@/painel/mensagens/api";
import { CONFIG_PADRAO, paraGravar } from "@/painel/mensagens/disparosUtil";
import * as lixeira from "@/ferramentas/lixeira/dados";
import { desfavoritar, listarModelos } from "@/ferramentas/modelos/dados";
import { MENSAGEM_ERRO_LEITURA } from "@/nutricao/leitura";
import { ERRO_LER_MODELOS } from "@/nutricao/editor/lib/planos";
import { listarAlunos } from "@/painel/alunos/api";
import { FILTROS_PADRAO } from "@/painel/alunos/regras";

/** O corpo que a tela mandou à conta PASSA nas regras reais do servidor: a ação/as consultas conhecidas e NENHUMA chave fora da lista. */
function passaNoServidor(corpo: Record<string, unknown>) {
  const pedido = moduloDoPedido(corpo);
  expect(pedido, JSON.stringify(corpo)).not.toBeNull();
  if (pedido!.modulo === "leitura") {
    const r = lerPedidoDeLeitura(corpo, CATALOGO_CONTA.consultas as CatalogoLeitura);
    expect(r.ok).toBe(true);
    for (const item of (corpo.itens as Array<Record<string, unknown>>) ?? []) {
      const declarados = Object.keys((CATALOGO_CONTA.consultas as Record<string, { params: object }>)[String(item.q)].params);
      expect(Object.keys(item).filter((k) => k !== "q" && !declarados.includes(k)), String(item.q)).toEqual([]);
    }
    if (r.ok === true) for (const i of r.itens) expect(i.ok, JSON.stringify(i)).toBe(true);
    return;
  }
  const acao = pedido!.acao as AcaoConta;
  expect(lerCorpoDaAcao(acao, corpo), acao).toMatchObject({ ok: true });
  const declarados = Object.keys(CORPOS_DAS_ACOES[acao]);
  expect(Object.keys(corpo).filter((k) => k !== "acao" && !declarados.includes(k)), acao).toEqual([]);
  for (const dono of ["nutricionista_id", "profissional_id", "user_id", "p_aluno"]) expect(Object.keys(corpo), `${acao}.${dono}`).not.toContain(dono);
}
const daFuncao = (nome: string) => h.corpos.filter((c) => c.nome === nome).map((c) => c.corpo);
const todosPassam = () => {
  for (const c of daFuncao("conta")) passaNoServidor(c);
};
/** As RPCs que chegaram ao banco (o nome e os args), na ordem. */
function rpcs(responder: (nome: string, args: Record<string, unknown>) => { data: unknown; error: unknown }) {
  const lista: Array<[string, Record<string, unknown>]> = [];
  h.banco = { ...h.banco, rpc: (nome: string, args: Record<string, unknown> = {}) => (lista.push([nome, args]), responder(nome, args)) };
  return lista;
}
const ok = (data: unknown) => ({ data, error: null });
const levanta = (codigo: string) => ({ data: null, error: { code: "P0001", message: codigo } });

beforeEach(() => {
  h.banco = {};
  h.corpos = [];
  h.recusaDaAcao = null;
  h.enviarFalha = true;
  h.nutricaoLerFalha = false;
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});
afterEach(() => vi.restoreAllMocks());

// ───────────────────────── o login do aluno (aba Acessos) ─────────────────────────
describe("hml-21c — o login do aluno (src/painel/aluno/resumo/acesso/api.ts): as 3 RPCs pela conta; o erro com o CÓDIGO na mensagem", () => {
  const dadosDoCard = { paciente_id: A1, nome: "Ana", email: "ana@x.com", ativo: true, conta_id: CONTA, acesso: null, agora: "2026-10-13T12:00:00Z" };
  it("acessoDoAluno → acesso_ler (a aluno_acesso com o p_aluno) → os dados do card como vieram", async () => {
    const r = rpcs(() => ok(dadosDoCard));
    expect(await acesso.acessoDoAluno(A1)).toEqual(dadosDoCard);
    expect(r).toEqual([["aluno_acesso", { p_aluno: A1 }]]);
    expect(daFuncao("conta")).toEqual([{ aluno: A1, acao: "acesso_ler" }]);
    todosPassam();
  });

  it("criar (o e-mail aparado e em minúsculas, a senha como veio) e a senha nova: as MESMAS RPCs e args; o user_id novo como texto", async () => {
    const r = rpcs((nome) => ok(nome === "paciente_criar_acesso" ? M1 : null));
    expect(await acesso.criarAcessoDoAluno(A1, "  Ana@X.COM ", "Senha1234")).toBe(M1);
    await acesso.criarSenhaNovaDoAluno(A1, "Outra5678");
    expect(r).toEqual([
      ["paciente_criar_acesso", { p_paciente_id: A1, p_email: "ana@x.com", p_senha: "Senha1234" }],
      ["paciente_redefinir_senha", { p_paciente_id: A1, p_senha: "Outra5678" }],
    ]);
    todosPassam();
  });

  it("o erro: a mensagem = o CÓDIGO (o retry do card e o textoErroAcesso leem o message — as frases de hoje); a rede → \"Sem conexão\"", async () => {
    // cada código pela RPC que o levanta (a varredura da decisão B): o ler (aluno_acesso), o criar e a senha nova
    const pelo = {
      ler: () => acesso.acessoDoAluno(A1), criar: () => acesso.criarAcessoDoAluno(A1, "a@b.co", "x"), senha: () => acesso.criarSenhaNovaDoAluno(A1, "x"),
    };
    for (const [codigo, chamada, frase] of [
      ["sem_acesso", pelo.ler, /não mexe no acesso/], ["aluno_inexistente", pelo.ler, /Aluno não encontrado/], ["ja_tem_acesso", pelo.criar, /já tem acesso/],
      ["email_invalido", pelo.criar, /e-mail válido/], ["email_em_uso", pelo.criar, /Já existe uma conta/], ["senha_curta", pelo.criar, /pelo menos 8/],
      ["sem_conta", pelo.senha, /ainda não tem acesso/], ["senha_curta", pelo.senha, /pelo menos 8/],
    ] as const) {
      rpcs(() => levanta(codigo));
      const e = await chamada().catch((x: unknown) => x as Error);
      expect((e as Error).message, codigo).toBe(codigo);
      expect(textoErroAcesso((e as Error).message), codigo).toMatch(frase);
    }
    // o card não repete o sem_acesso/aluno_inexistente (o regex do retry casa a mensagem); o inesperado → a frase padrão
    rpcs(() => levanta("aluno_inexistente"));
    const naoExiste = await acesso.acessoDoAluno(A1).catch((x: unknown) => x as Error);
    expect(/sem_acesso|aluno_inexistente/.test((naoExiste as Error).message)).toBe(true);
    rpcs(() => ({ data: null, error: { code: "XX000", message: "detalhe do banco" } }));
    const quebrou = await acesso.acessoDoAluno(A1).catch((x: unknown) => x as Error);
    expect((quebrou as Error).message).toBe("erro_interno");
    expect(textoErroAcesso((quebrou as Error).message, "Não deu para carregar agora.")).toBe("Não deu para carregar agora.");
    // sem internet: nada vai ao servidor e a frase é a de hoje ("Failed to fetch" → "Sem conexão agora")
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    h.corpos = [];
    const semRede = await acesso.criarSenhaNovaDoAluno(A1, "Senha1234").catch((x: unknown) => x as Error);
    expect(daFuncao("conta")).toEqual([]);
    expect(textoErroAcesso((semRede as Error).message)).toBe("Sem conexão agora. Tente de novo.");
  });
});

// ───────────────────────── o Resumo: dados, ajustes, link, faixa, pré-checagem, responsável, envio ─────────────────────────
describe("hml-21c — o Resumo do aluno (dados/api.ts, dadoLivre.ts, responsavel/api.ts, envio/api.ts)", () => {
  it("os dados, as \"Mensagens automáticas\" e o link: as MESMAS RPCs e args; o MESMO tipo; o { ok: false } e o raise → ErroPerfil com o código", async () => {
    const r = rpcs((nome, args) => {
      if (nome === "aluno_salvar_dados") return ok({ ok: true, perfil: { paciente_id: A1, nome: (args.p_dados as { nome?: string }).nome } });
      if (nome === "aluno_salvar_ajustes") return ok({ ok: true, paciente_id: A1, ajustes: { mensagens_automaticas: true } });
      return ok({ ok: true, paciente_id: A1, link_codigo: "abc123" });
    });
    expect(await dados.salvarDadosAluno(A1, { nome: "Ana Maria", resumo: "" })).toEqual({ paciente_id: A1, nome: "Ana Maria" });
    expect(await dados.salvarAjusteAluno(A1, "mensagens_automaticas", true)).toEqual({ mensagens_automaticas: true });
    expect(await dados.gerarNovoLink(A1)).toBe("abc123");
    expect(r).toEqual([
      ["aluno_salvar_dados", { p_aluno: A1, p_dados: { nome: "Ana Maria", resumo: "" } }],
      ["aluno_salvar_ajustes", { p_aluno: A1, p_ajustes: { mensagens_automaticas: true } }],
      ["aluno_novo_link", { p_aluno: A1 }],
    ]);
    todosPassam();
    rpcs(() => ok({ ok: false, erro: "email_repetido", campos: ["email"] }));
    await expect(dados.salvarDadosAluno(A1, { email: "x@y.co" })).rejects.toMatchObject({ codigo: "email_repetido", extra: { campos: ["email"] } });
    rpcs(() => levanta("aluno_inexistente"));
    await expect(dados.gerarNovoLink(A1)).rejects.toMatchObject({ codigo: "aluno_inexistente", message: "aluno_inexistente" });
    // a chave que foi para a aba Acessos (W-A P4) não passa pela conta: a recusa do servidor (nada roda)
    h.corpos = [];
    const r2 = rpcs(() => ok({ ok: true }));
    await expect(dados.salvarAjusteAluno(A1, "acesso_app" as never, true)).rejects.toMatchObject({ codigo: "dados_invalidos" });
    expect(r2).toEqual([]);
  });

  it("a faixa da casca: ler (no lote), \"Ligar para todos\" (os ids) e fechar — as MESMAS RPCs; o null e o tipo de hoje", async () => {
    const r = rpcs((nome) => {
      if (nome === "mensagens_desligadas") return ok({ mostrar: true, whatsapp: true, visto: null, total: 1, alunos: [{ id: A1, nome: "Ana" }] });
      if (nome === "mensagens_ligar_para_todos") return ok({ ok: true, ligados: 2 });
      return ok({ ok: true });
    });
    expect(await dados.buscarMensagensDesligadas()).toMatchObject({ mostrar: true, total: 1, alunos: [{ id: A1 }] });
    expect(await dados.ligarMensagensParaTodos([A1, M1])).toBe(2);
    await dados.fecharAvisoMensagens();
    expect(r).toEqual([["mensagens_desligadas", {}], ["mensagens_ligar_para_todos", { p_ids: [A1, M1] }], ["mensagens_aviso_fechar", {}]]);
    todosPassam();
    rpcs(() => ok(null));
    expect(await dados.buscarMensagensDesligadas()).toBeNull();
  });

  it("a pré-checagem do e-mail/CPF: q=dado_livre com os args de hoje (normalizados); não deu para conferir → null (a tela não trava)", async () => {
    const r = rpcs(() => ok({ ok: true, email_livre: false, cpf_livre: true }));
    expect(await conferirDadoLivre({ email: "  Ana@Mail.COM ", cpf: "529.982.247-25", pacienteId: A1 })).toEqual({ email_livre: false, cpf_livre: true });
    expect(r).toEqual([["paciente_dado_livre", { p_email: "ana@mail.com", p_cpf: "52998224725", p_paciente: A1 }]]);
    todosPassam();
    rpcs(() => ok({ ok: false, erro: "sem_acesso" }));
    expect(await conferirDadoLivre({ email: "a@b.co" })).toBeNull();
    rpcs(() => ({ data: null, error: { code: "XX000", message: "x" } }));
    expect(await conferirDadoLivre({ cpf: "1" })).toBeNull();
  });

  it("o responsável: ler (no lote) e registrar/retirar (o dadosDoRegistro em lista fechada) — as MESMAS RPCs; o { ok: false } com o código", async () => {
    const secao = { ok: true, ligado: true, faixa: "16_17", pode_editar: true, atual: null };
    const r = rpcs(() => ok(secao));
    expect(await responsavel.buscarResponsavel(A1)).toMatchObject({ ligado: true, faixa: "16_17", pode_editar: true, atual: null });
    await responsavel.registrarResponsavel(A1, { nome: "  Maria   Souza ", vinculo: "mae", forma: "presencial", confirmo: true });
    await responsavel.retirarResponsavel(A1);
    expect(r[0]).toEqual(["aluno_responsavel", { p_aluno: A1 }]);
    expect(r[1][0]).toBe("aluno_responsavel_registrar");
    expect(r[1][1]).toMatchObject({ p_aluno: A1, p_dados: { acao: "registrar", nome: "Maria Souza", vinculo: "mae", forma: "presencial", confirmo: true } });
    expect(r[2][1]).toMatchObject({ p_aluno: A1, p_dados: { acao: "retirar" } });
    todosPassam();
    rpcs(() => ok({ ok: false, erro: "falta_confirmar" }));
    await expect(responsavel.registrarResponsavel(A1, { nome: "Maria", vinculo: "mae", forma: "presencial", confirmo: false })).rejects.toMatchObject({ codigo: "falta_confirmar" });
  });

  it("a reserva do envio (a aluno-enviar não respondeu): só o sino pela conta — a MESMA aluno_avisar_plano; os erros de regra os mesmos", async () => {
    const r = rpcs(() => ok({ ok: true, avisado: true }));
    expect(await enviarAoAluno(A1, ["treino", "dieta"])).toEqual({ avisado: true, repetido: false, semLogin: false, email: null });
    expect(r).toEqual([["aluno_avisar_plano", { p_aluno: A1, p_modulos: ["treino", "dieta"] }]]);
    todosPassam();
    rpcs(() => levanta("sem_acesso"));
    await expect(enviarAoAluno(A1, ["dieta"])).rejects.toMatchObject({ codigo: "sem_acesso" });
    rpcs(() => levanta("qualquer_outro"));
    await expect(enviarAoAluno(A1, ["dieta"])).rejects.toMatchObject({ codigo: "erro_interno" });
    rpcs(() => ok({ ok: false, erro: "sem_modulo" }));
    await expect(enviarAoAluno(A1, ["dieta"])).rejects.toMatchObject({ codigo: "sem_modulo" });
    expect(lerResultado).toBeTypeOf("function");
  });
});

// ───────────────────────── as Configurações ─────────────────────────
describe("hml-21c — as Configurações (perfil/api.ts novo, equipe/api.ts, o ZIP)", () => {
  const ATUAL = { foto_url: "https://api-principal.physiqcalc.com.br/storage/v1/object/public/fotos-perfil-staging/x/foto-1.jpg", crn: "VELHO", plano: { a: 1 } };
  function bancoDoPerfil(gravadas: unknown[]) {
    const linha = { nome: "Nutri", email: "n@x.com", tipo_perfil: "nutricionista", area_outra: null, dados_profissionais: ATUAL };
    return {
      from: (t: string) => {
        const c: Record<string, unknown> = {};
        let gravando = false;
        for (const op of ["select", "eq", "limit"]) c[op] = () => c;
        c.update = (v: unknown) => (gravadas.push([t, v]), (gravando = true), c);
        c.maybeSingle = async () => ({ data: { dados_profissionais: ATUAL }, error: null });
        c.then = (ok2: (x: unknown) => unknown) => Promise.resolve(ok2({ data: gravando ? [{ id: EU, nome: "x" }] : [linha], error: null }));
        return c;
      },
    };
  }
  it("o Perfil: buscarPerfil (q=perfil_profissional, o de quem está logado) e salvarPerfil = o MESMO efeito do buscarPerfil + update de hoje", async () => {
    const gravadas: unknown[] = [];
    h.banco = bancoDoPerfil(gravadas);
    expect(await perfil.buscarPerfil("o-uid-nao-decide")).toMatchObject({ nome: "Nutri", tipo_perfil: "nutricionista", dados_profissionais: ATUAL });
    const form = { nome: "Nutri Nova", tipo: "personal" as const, areaOutra: "", registro: "CREF 1", whatsapp: "(11) 99999-8888", endereco: "", cidade: "SP", uf: "SP" };
    await perfil.salvarPerfil({ nome: form.nome, tipo_perfil: form.tipo, area_outra: null, dados: dadosParaGravar(form, {}) });
    // o JSON gravado = o dadosParaGravar(form, atual) de hoje (o atual lido NO SERVIDOR, as chaves do form por cima)
    expect(gravadas).toEqual([["profiles", { nome: "Nutri Nova", dados_profissionais: dadosParaGravar(form, ATUAL), tipo_perfil: "personal", area_outra: null }]]);
    todosPassam();
  });

  it("a foto do profissional pelas ações da 21a (o caminho que subiu → a URL nova; null → tirar) e o nome da conta (0 linha = recusa)", async () => {
    const gravadas: unknown[] = [];
    h.banco = bancoDoPerfil(gravadas);
    expect(await perfil.gravarFotoDoPerfil(null)).toBeNull();
    expect(daFuncao("conta").map((c) => c.acao)).toEqual(["perfil_foto_tirar"]);
    await perfil.salvarNomeDaConta(CONTA, "Consultoria X");
    expect(gravadas.at(-1)).toEqual(["contas", { nome: "Consultoria X" }]);
    expect(daFuncao("conta").at(-1)).toEqual({ conta: CONTA, nome: "Consultoria X", acao: "conta_salvar" });
    todosPassam();
    h.banco = { from: () => ({ update: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }) }) };
    await expect(perfil.salvarNomeDaConta(CONTA, "Y")).rejects.toMatchObject({ codigo: "nao_encontrado" });
  });

  it("a foto do profissional (⚪7 da revisão): o caminho que subiu → perfil_foto_salvar (a 21a) → a URL nova no dados_profissionais; a anterior sai do bucket", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const removidos: unknown[] = [];
    let dados: Record<string, unknown> = { crn: "1", foto_url: `https://api-principal.physiqcalc.com.br/storage/v1/object/public/fotos-perfil-staging/${EU}/foto-1.jpg` };
    h.banco = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { dados_profissionais: dados }, error: null }) }) }),
        update: (v: Record<string, unknown>) => {
          updates.push(v);
          if (v.dados_profissionais) dados = v.dados_profissionais as Record<string, unknown>;
          return { eq: () => ({ select: async () => ({ data: [{ id: EU }], error: null }) }) };
        },
      }),
      storage: {
        from: () => ({
          list: async (_p: string, o: { search: string }) => ({ data: [{ name: o.search }], error: null }),
          remove: async (c: string[]) => (removidos.push(...c), { data: c, error: null }),
        }),
      },
    };
    const caminho = `${EU}/foto-1760000000000.png`;
    const url = `https://api-principal.physiqcalc.com.br/storage/v1/object/public/fotos-perfil-staging/${caminho}`;
    expect(await perfil.gravarFotoDoPerfil(caminho)).toBe(url);
    expect(daFuncao("conta")).toEqual([{ caminho, acao: "perfil_foto_salvar" }]);
    expect(updates).toEqual([{ dados_profissionais: { crn: "1", foto_url: url } }]);
    expect(removidos).toEqual([`${EU}/foto-1.jpg`]);
    todosPassam();
    // o caminho de OUTRA pessoa → a recusa do servidor (nada grava)
    updates.length = 0;
    await expect(perfil.gravarFotoDoPerfil(`${A1}/foto-1760000000000.png`)).rejects.toMatchObject({ codigo: "dados_invalidos" });
    expect(updates).toEqual([]);
  });

  it("a Equipe e o Convite: as MESMAS RPCs e args (os 2 do remover); o { ok: false } → ErroEquipe com o código; a função que falha → erro_interno", async () => {
    const r = rpcs((nome) => ok(nome === "garantir_meu_codigo" ? { ok: true, codigo: "XYZ" } : { ok: true, papeis: ["personal"], alunos_treino: 0 }));
    await equipe.alterarPapeisMembro(M1, ["personal"]);
    await equipe.removerMembro(M1, A1, null);
    expect(await equipe.garantirMeuCodigo(CONTA)).toBe("XYZ");
    expect(r).toEqual([
      ["alterar_papeis_membro", { p_membro: M1, p_papeis: ["personal"] }],
      ["remover_membro", { p_membro: M1, p_novo_personal: A1, p_novo_nutri: null }],
      ["garantir_meu_codigo", { p_conta: CONTA }],
    ]);
    todosPassam();
    rpcs(() => ok({ ok: false, erro: "so_dono" }));
    await expect(equipe.removerMembro(M1, null, null)).rejects.toMatchObject({ codigo: "so_dono" });
    rpcs(() => ({ data: null, error: { code: "XX000", message: "x" } }));
    await expect(equipe.garantirMeuCodigo(CONTA)).rejects.toMatchObject({ codigo: "erro_interno", extra: { codigo: "erro_interno" } });
  });

  it("o ZIP da exclusão: 1 lote pela ação (o p_conta null EXPLÍCITO dos pacientes sem conta); o tipo de hoje; o { ok: false } com o código", async () => {
    const r = rpcs(() => ok({ ok: true, clinico: true, emissor: "Nutri", pacientes: [{ id: A1, nome: "Ana", nascimento: null, na_lixeira: false, registros: [] }] }));
    expect(await prontuariosParaBaixar(null, [A1])).toEqual({ clinico: true, emissor: "Nutri", pacientes: [{ id: A1, nome: "Ana", nascimento: null, na_lixeira: false, registros: [] }] });
    await prontuariosParaBaixar(CONTA, [A1, M1]);
    expect(r).toEqual([["w2l_prontuarios_para_baixar", { p_conta: null, p_pacientes: [A1] }], ["w2l_prontuarios_para_baixar", { p_conta: CONTA, p_pacientes: [A1, M1] }]]);
    todosPassam();
    rpcs(() => ok({ ok: false, erro: "so_dono" }));
    await expect(prontuariosParaBaixar(CONTA, [A1])).rejects.toMatchObject({ codigo: "so_dono" });
  });
});

// ───────────────────────── a Mensagens, a casca e a Lixeira ─────────────────────────
describe("hml-21c — a Mensagens (1 ida), a casca (1 ida) e a Lixeira", () => {
  it("a Mensagens abre com o resumo + a fila + o perfil numa ida só; os args de hoje; o MESMO tipo", async () => {
    const r = rpcs((nome) => ok(nome === "whatsapp_resumo" ? { dono: true, falhas: 2, serie_enviadas: ["1", 2] } : { escopo: "conta", filtro: "falhas", itens: [{ id: M1 }], mais: false }));
    h.banco = { ...h.banco, from: () => ({ select: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [{ nome: "Nutri", dados_profissionais: {}, config: {} }], error: null }) }) }) }) };
    const [resumo, fila, perfilWhats] = await Promise.all([
      mensagens.buscarResumo(CONTA),
      mensagens.listarFila({ contaId: CONTA, escopo: "conta", filtro: "falhas", limite: 30, cursor: { antes: "2026-10-13T12:00:00.123456+00:00", antesId: M1 } }),
      mensagens.lerPerfilWhatsapp("o-uid-nao-decide"),
    ]);
    expect(resumo).toMatchObject({ falhas: 2, serie_enviadas: [1, 2] });
    expect(fila).toMatchObject({ itens: [{ id: M1 }] });
    expect(perfilWhats).toEqual({ nome: "Nutri", dados_profissionais: {}, config: {} });
    expect(daFuncao("conta")).toHaveLength(1);
    expect((daFuncao("conta")[0].itens as Array<{ q: string }>).map((i) => i.q)).toEqual(["whatsapp_resumo", "whatsapp_fila", "perfil_mensagens"]);
    expect(r).toEqual([
      ["whatsapp_resumo", { p_conta: CONTA }],
      ["whatsapp_fila", { p_conta: CONTA, p_escopo: "conta", p_filtro: "falhas", p_limite: 30, p_antes: "2026-10-13T12:00:00.123456+00:00", p_antes_id: M1 }],
    ]);
    todosPassam();
  });

  it("as gravações da Mensagens: a config (o paraGravar inteiro, na lista fechada), o reenviar, o \"Limpar\"; o { ok: false } → ErroMensagens com o código", async () => {
    const cfg = { ...CONFIG_PADRAO, ativo: false, momentos: { aniversario: true }, textos: { lembrete_dia: "Oi {nome}!" } };
    const r = rpcs((nome) => ok(nome === "whatsapp_salvar_config" ? { ok: true, whatsapp: paraGravar(cfg) } : { ok: true }));
    expect(await mensagens.salvarConfig(cfg)).toEqual(paraGravar(cfg));
    await mensagens.reenviar(M1);
    await mensagens.limparFalhas();
    expect(r).toEqual([["whatsapp_salvar_config", { p_whatsapp: paraGravar(cfg) }], ["whatsapp_reenviar", { p_id: M1 }], ["whatsapp_limpar_falhas", {}]]);
    todosPassam();
    rpcs(() => ok({ ok: false, erro: "nao_conectado" }));
    await expect(mensagens.reenviar(M1)).rejects.toMatchObject({ codigo: "nao_conectado" });
    rpcs(() => ({ data: null, error: { code: "XX000", message: "column x does not exist" } }));
    const e = await mensagens.buscarResumo(null).catch((x: unknown) => x as Error);
    expect(e).toMatchObject({ codigo: "erro_interno" });
    expect(String((e as Error).message)).not.toContain("column");
  });

  it("a casca: o número de Alunos (21b), o da Mensagens e a faixa no MESMO `ler`", async () => {
    rpcs((nome) => ok(nome === "whatsapp_resumo" ? { falhas: 0 } : null));
    // (o formato da lista de Alunos é da 21b: aqui só importa a ida — as 3 leituras da casca no mesmo pedido)
    await Promise.allSettled([listarAlunos(CONTA, FILTROS_PADRAO, 0, 0), mensagens.buscarResumo(CONTA), dados.buscarMensagensDesligadas()]);
    expect(daFuncao("conta")).toHaveLength(1);
    expect((daFuncao("conta")[0].itens as Array<{ q: string }>).map((i) => i.q)).toEqual(["alunos_da_conta", "whatsapp_resumo", "mensagens_desligadas"]);
    todosPassam();
  });

  it("a Lixeira: a página (num lote só dela) e restaurar/apagar — as MESMAS RPCs; o { ok: false } com o código; a falha da ida → erro_interno", async () => {
    const r = rpcs((nome) => ok(nome === "lixeira_da_conta" ? { ok: true, ve_clinico: true, tem_nutricao: true, tipo: "anamnese", totais: { anamnese: 1 }, total: 1, itens: [] } : { ok: true }));
    const l = await lixeira.listarLixeira(CONTA, { tipo: "anamnese", busca: " ana ", pagina: 2 });
    expect(l.pagina).toMatchObject({ tipo: "anamnese", total: 1 });
    await lixeira.restaurar("anamnese", A1);
    await lixeira.apagarDeVez("anamnese", A1);
    expect(r).toEqual([
      ["lixeira_da_conta", { p_conta: CONTA, p_tipo: "anamnese", p_busca: "ana", p_offset: 20, p_limite: 20 }],
      ["lixeira_restaurar", { p_tipo: "anamnese", p_id: A1 }],
      ["lixeira_apagar", { p_tipo: "anamnese", p_id: A1 }],
    ]);
    todosPassam();
    rpcs(() => ok({ ok: false, erro: "nao_esta_na_lixeira" }));
    await expect(lixeira.restaurar("anamnese", A1)).rejects.toMatchObject({ codigo: "nao_esta_na_lixeira" });
    rpcs(() => ({ data: null, error: { code: "XX000", message: "x" } }));
    await expect(lixeira.apagarDeVez("anamnese", A1)).rejects.toMatchObject({ codigo: "erro_interno", extra: { codigo: "erro_interno" } });
  });
});

// ───────────────────────── os Modelos (★) ─────────────────────────
describe("hml-21c — os Modelos (★): 1 `ler` da nutricao ∥ 1 da financeiro; o \"tirar a ★\" pelas ações *_editar", () => {
  const TODOS = ["anamnese", "plano", "orientacao", "recibo", "documento", "meta", "manipulado", "exame", "questionario", "produto", "receita"] as const;
  it("listarModelos: os 9 ★ da nutrição NUM `ler` da nutricao ∥ os planos ★ (o lote só deles — o listarPlanosFavoritos da 20c) ∥ os de recibo na financeiro", async () => {
    const linhas: Record<string, unknown[]> = {
      modelos_anamnese: [{ id: "m-an", updated_at: "2026-10-01", titulo: "Anamnese ★", perguntas: [] }],
      modelos_recibo: [{ id: "m-re", updated_at: "2026-10-02", titulo: "Recibo ★", conteudo: "texto" }],
      receitas: [{ id: "m-rc", nome: "Bolo", updated_at: "2026-10-03", porcoes: 2, rendimento_g: null, ingredientes: [] }],
    };
    h.banco = {
      rpc: () => ok([]),
      from: (t: string) => {
        const c: Record<string, unknown> = {};
        for (const op of ["select", "eq", "is", "limit", "in", "order"]) c[op] = () => c;
        c.then = (ok2: (x: unknown) => unknown) => Promise.resolve(ok2({ data: linhas[t] ?? [], error: null }));
        return c;
      },
    };
    const r = await listarModelos({ uid: EU, contaId: CONTA, treinoId: null, fontes: new Set(TODOS) });
    expect(r.erros).toEqual({});
    expect(r.itens.map((i) => i.id).sort()).toEqual(["m-an", "m-rc", "m-re"]);
    const nutricao = daFuncao("nutricao");
    const financeiro = daFuncao("financeiro");
    // as 3 idas em PARALELO (nenhuma espera a outra — não é série): os 9 ★ num `ler`; os planos ★ no lote só deles (`sozinha`: a RPC pesada
    // não segura a tela — o desenho da 20c no src/nutricao/editor/lib/planos.ts, fora desta W; ## TEMPO no progresso); o recibo ★ na financeiro
    expect([nutricao.length, financeiro.length, daFuncao("conta").length]).toEqual([2, 1, 0]);
    const qs = nutricao.map((c) => (c.itens as Array<{ q: string }>).map((i) => i.q).sort());
    expect(qs).toContainEqual([
      "modelos_favoritos_anamnese", "modelos_favoritos_documento", "modelos_favoritos_exame", "modelos_favoritos_manipulado", "modelos_favoritos_meta",
      "modelos_favoritos_orientacao", "modelos_favoritos_produto", "modelos_favoritos_questionario", "modelos_favoritos_receita",
    ]);
    expect(qs).toContainEqual(["planos_favoritos"]);
    expect(financeiro[0].itens).toEqual([{ q: "fin_modelos_recibo_favoritos" }]);
    // nenhum dono no corpo: o servidor filtra pelo user do token
    expect(JSON.stringify([nutricao, financeiro])).not.toMatch(/nutricionista_id|"uid"/);
  });

  // 🟡5 da revisão: o listarModelos com os 2 caminhos de erro (o `Promise.allSettled` por fonte: uma que falha não derruba a tela)
  /** O banco falso dos ★: as linhas de cada tabela; `quebrada` responde o erro cru do Postgres (a mensagem não pode chegar à tela). */
  function bancoDosModelos(linhas: Record<string, unknown[]>, quebrada?: string) {
    return {
      rpc: () => ok([]),
      from: (t: string) => {
        const c: Record<string, unknown> = {};
        for (const op of ["select", "eq", "is", "limit", "in", "order"]) c[op] = () => c;
        c.then = (ok2: (x: unknown) => unknown) =>
          Promise.resolve(ok2(t === quebrada ? { data: null, error: { code: "XX000", message: "column modelos_meta.segredo does not exist" } } : { data: linhas[t] ?? [], error: null }));
        return c;
      },
    };
  }
  const LINHAS_DOS_MODELOS = {
    modelos_anamnese: [{ id: "m-an", updated_at: "2026-10-01", titulo: "Anamnese ★", perguntas: [] }],
    modelos_meta: [{ id: "m-me", updated_at: "2026-10-04", titulo: "Meta ★", dias_semana: [] }],
    modelos_recibo: [{ id: "m-re", updated_at: "2026-10-02", titulo: "Recibo ★", conteudo: "texto" }],
  };

  it("listarModelos: 1 tipo que falha (o item da consulta dele com erro no banco) → SÓ ele em `erros`, com a frase fixa do código (nunca a do banco); os outros listam", async () => {
    h.banco = bancoDosModelos(LINHAS_DOS_MODELOS, "modelos_meta");
    const r = await listarModelos({ uid: EU, contaId: CONTA, treinoId: null, fontes: new Set(TODOS) });
    expect(r.erros).toEqual({ meta: MENSAGEM_ERRO_LEITURA.erro_interno });
    expect(JSON.stringify(r)).not.toMatch(/segredo|does not exist/);
    expect(r.itens.map((i) => i.id).sort()).toEqual(["m-an", "m-re"]);
    // as MESMAS idas: o item com erro volta no MESMO lote dos 9 (os outros 8 do lote passam) ∥ os planos ★ ∥ o recibo ★
    expect([daFuncao("nutricao").length, daFuncao("financeiro").length]).toEqual([2, 1]);
    // controle: sem a tabela quebrada, a meta lista
    h.banco = bancoDosModelos(LINHAS_DOS_MODELOS);
    expect((await listarModelos({ uid: EU, contaId: CONTA, treinoId: null, fontes: new Set(TODOS) })).itens.map((i) => i.id).sort()).toEqual(["m-an", "m-me", "m-re"]);
  });

  it("listarModelos: o `ler` da nutricao que cai (a rede) → os 9 tipos da nutrição e os planos ★ em `erros` (as frases de hoje); o recibo ★ (a financeiro, em paralelo) lista", async () => {
    h.banco = bancoDosModelos(LINHAS_DOS_MODELOS);
    h.nutricaoLerFalha = true;
    const r = await listarModelos({ uid: EU, contaId: CONTA, treinoId: null, fontes: new Set(TODOS) });
    const daNutricao = ["anamnese", "orientacao", "documento", "meta", "manipulado", "exame", "questionario", "produto", "receita"];
    expect(Object.keys(r.erros).sort()).toEqual([...daNutricao, "plano"].sort());
    for (const tipo of daNutricao) expect(r.erros[tipo as keyof typeof r.erros], tipo).toBe(MENSAGEM_ERRO_LEITURA.rede);
    expect(r.erros.plano).toBe(ERRO_LER_MODELOS);
    expect(r.itens.map((i) => i.id)).toEqual(["m-re"]);
    // a nutricao foi tentada (o lote dos 9 e o dos planos) e a financeiro respondeu sozinha — nenhuma espera a outra
    expect([daFuncao("nutricao").length, daFuncao("financeiro").length]).toEqual([2, 1]);
  });

  it("desfavoritar: a ação *_editar de cada tipo (o favorito — a receita, o favorita — = false; o recibo pela financeiro); 0 linha → a frase de hoje", async () => {
    const esperado: Record<string, [string, string, string]> = {
      anamnese: ["nutricao", "modelo_anamnese_editar", "favorito"], plano: ["nutricao", "plano_editar", "favorito"],
      orientacao: ["nutricao", "modelo_orientacao_editar", "favorito"], recibo: ["financeiro", "modelo_recibo_editar", "favorito"],
      documento: ["nutricao", "modelo_documento_editar", "favorito"], meta: ["nutricao", "modelo_meta_editar", "favorito"],
      manipulado: ["nutricao", "modelo_formula_editar", "favorito"], exame: ["nutricao", "exame_catalogo_editar", "favorito"],
      questionario: ["nutricao", "questionario_editar", "favorito"], produto: ["nutricao", "produto_editar", "favorito"],
      receita: ["nutricao", "receita_editar", "favorita"],
    };
    for (const [tipo, [funcao, acao, coluna]] of Object.entries(esperado)) {
      h.corpos = [];
      await desfavoritar(tipo as never, A1);
      expect(h.corpos, tipo).toEqual([{ nome: funcao, corpo: { id: A1, [coluna]: false, acao } }]);
      // a ação existe na função e aceita a coluna (a lista fechada de hoje)
      const mapa = (funcao === "financeiro" ? ACOES_FINANCEIRO : { ...ACOES, ...ACOES_DIETA }) as unknown as Record<string, { campos: Record<string, unknown> }>;
      expect(Object.keys(mapa[acao].campos), tipo).toContain(coluna);
      // ⚪6 da revisão: o corpo passa nas regras REAIS de gravação da função (o montarGravacao* que o servidor roda) → a edição do id com SÓ a
      // coluna da ★ = false (+ os fixos da ação, como o updated_at) — nenhuma outra coluna da tela vai junto
      const corpo = h.corpos[0].corpo;
      const g = (funcao === "financeiro" ? montarGravacaoFinanceiro(acao, corpo, EU) : acao in ACOES ? montarGravacao(acao, corpo, EU)
        : montarGravacaoDieta(acao, corpo, EU)) as { ok: boolean; operacao?: string; id?: string; valores?: Record<string, unknown> };
      expect(g, tipo).toMatchObject({ ok: true, operacao: "editar", id: A1 });
      expect(g.valores?.[coluna], tipo).toBe(false);
      expect(Object.keys(g.valores ?? {}).filter((k) => k !== coluna && k !== "updated_at"), tipo).toEqual([]);
    }
    h.recusaDaAcao = "nao_encontrado";
    await expect(desfavoritar("anamnese", A1)).rejects.toThrow("Só quem criou pode tirar a estrela.");
    await expect(desfavoritar("recibo", A1)).rejects.toThrow("Só quem criou pode tirar a estrela.");
    h.recusaDaAcao = "sem_acesso";
    const e = await desfavoritar("meta", A1).catch((x: unknown) => x as Error);
    expect((e as Error).message).not.toBe("Só quem criou pode tirar a estrela.");
    expect((e as { codigo?: string }).codigo).toBe("sem_acesso");
    await expect(desfavoritar("treino", A1)).rejects.toThrow(/Os treinos não têm estrela/);
  });
});
