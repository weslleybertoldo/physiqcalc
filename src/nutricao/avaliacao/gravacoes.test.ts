// Physiq hml-19c (H-41 · jeito 2) — o contrato entre as 3 libs da AVALIAÇÃO (Perfil do aluno › Avaliação) e o servidor: cada função de
// GRAVAÇÃO (as mesmas assinaturas de antes) chama a função certa com a ação certa — a nutricao (antropometria, fotos de evolução, o aviso)
// ou a admin-avaliacoes do Treino (a foto mensal; a avaliação física e a próxima avaliação, que já eram pela função) —, 1 chamada por
// passo, nunca grava direto no banco (tabela, RPC ou Storage fora do link assinado) e o corpo que ela manda PASSA nas regras REAIS do
// servidor (_shared/nutricao-regras.ts e admin-avaliacoes/regras.ts — as mesmas que rodam na borda); o dono nunca vai no corpo. O que
// volta é o que a tela usa. Meta-teste: toda outra função exportada das 3 libs é leitura. Os negativos: a frase fixa (ou a frase de
// antes da tela), a subida que falha e o sem internet.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Chamada = { funcao: string; acao: string; corpo: Record<string, unknown> };
const h = vi.hoisted(() => ({
  ordem: [] as Array<{ funcao: string; acao: string; corpo: Record<string, unknown> }>,
  invoke: vi.fn(),
  subir: vi.fn(),
  treino: vi.fn(),
}));
vi.mock("@/integrations/principal/client", () => ({
  PRINCIPAL_SCHEMA: "staging",
  principalConfigurado: true,
  principal: {
    functions: { invoke: (...a: unknown[]) => h.invoke(...a) },
    storage: { from: (bucket: string) => ({ uploadToSignedUrl: (...a: unknown[]) => h.subir("principal", bucket, ...a) }) },
    from: (t: string) => {
      throw new Error(`gravação direta na tabela ${t} (principal)`);
    },
    rpc: (f: string) => {
      throw new Error(`RPC direta ${f} (principal)`);
    },
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  DB_SCHEMA: "staging",
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: "tok-treino" } } }) },
    functions: {
      invoke: async (nome: string, o: { body: Record<string, unknown> }) => {
        h.ordem.push({ funcao: nome, acao: "(perfil)", corpo: o.body });
        return { data: { ok: true }, error: null };
      },
    },
    storage: { from: (bucket: string) => ({ uploadToSignedUrl: (...a: unknown[]) => h.subir("treino", bucket, ...a) }) },
    from: (t: string) => {
      throw new Error(`gravação direta na tabela ${t} (Treino)`);
    },
    rpc: (f: string) => {
      throw new Error(`RPC direta ${f} (Treino)`);
    },
  },
}));
vi.mock("@/painel/aluno/avaliacao/fontes", () => ({ carregarTreinoDoPainel: (...a: unknown[]) => h.treino(...a) }));
vi.mock("@/lib/registrosFotos", async (original) => ({
  ...(await original<typeof import("@/lib/registrosFotos")>()),
  comprimirImagem: async () => new Blob(["jpeg"], { type: "image/jpeg" }),
}));

import {
  ehUuid, lerPedidoDeFotoEvolucao, lerRegistroDeFotoEvolucao, montarGravacaoAvaliacao,
} from "../../../supabase-principal/functions/_shared/nutricao-regras";
import { ACOES_QUE_GRAVAM, lerExclusaoDeFoto, lerPedidoDeFoto } from "../../../supabase/functions/admin-avaliacoes/regras";
import { formNovo, formParaRegistro } from "@/nutricao/editor/lib/antropometriaUtil";
import * as antropometrias from "@/nutricao/editor/lib/antropometrias";
import * as avaliacaoApi from "@/painel/aluno/avaliacao/avaliacaoApi";
import * as evolucao from "./evolucao";

const EU = "33333333-3333-4333-8333-333333333333";
const P = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";
const ALUNO = "aaaaaaaa-0000-4000-8000-000000000001";
const LINHA = { id: ID, posicao: "frente" };
const CAMINHO_EVOLUCAO = `${EU}/${P}/${ID}-minha-foto.jpg`;
const CAMINHO_MENSAL = `${ALUNO}/2026-10/frente.jpg`;
/** O que a nutricao responde (o servidor monta o caminho de QUEM CHAMA — aqui, EU). */
const RESPOSTA_NUTRICAO = { ok: true, linha: LINHA, bucket: "evolucao-staging", caminho: CAMINHO_EVOLUCAO, token: "tk-p", avisado: true, sem_login: false };
/** O que a admin-avaliacoes responde. */
const RESPOSTA_TREINO = { ok: true, bucket: "registros-staging", caminho: CAMINHO_MENSAL, token: "tk-t", foto: { id: ID }, avaliacao: { id: "av1" }, proxima_avaliacao: "2026-10-22" };

const REGISTRO = formParaRegistro({
  ...formNovo({ genero: "masculino", nascimento: "1988-02-10" }, "pollock7", new Date("2026-10-11T13:00:00.000Z")),
  peso: "83,6", altura: "178", circunferencias: { cintura: "86" }, observacao: "retorno",
});
const FOTO = () => new File(["png"], "Minha Foto.JPG", { type: "image/jpeg" });

const chamadas = (): Chamada[] => h.ordem.filter((c) => c.funcao !== "storage");

/** O corpo passa nas regras do servidor (o que a função aceita)? */
function aceitaNoServidor(c: Chamada): boolean {
  if (c.funcao === "admin-avaliacoes") {
    if (c.acao === "foto_preparar" || c.acao === "foto_salvar") return lerPedidoDeFoto({ ...c.corpo }).ok === true;
    if (c.acao === "foto_excluir") return lerExclusaoDeFoto({ ...c.corpo }).ok === true;
    return ACOES_QUE_GRAVAM.has(c.acao); // create/delete/proxima: as de antes (já pela função, sem mudança nesta W)
  }
  if (c.funcao === "admin-update-user") return true; // a composição do perfil (já pela função; fica)
  switch (c.acao) {
    case "foto_evolucao_preparar":
      return lerPedidoDeFotoEvolucao(c.corpo).ok === true;
    case "foto_evolucao_registrar":
      return lerRegistroDeFotoEvolucao(c.corpo, EU).ok === true;
    case "foto_evolucao_excluir":
      return ehUuid(c.corpo.id);
    case "avaliacao_avisar":
      return ehUuid(c.corpo.alunoId);
    default: {
      const g = montarGravacaoAvaliacao(c.acao, c.corpo, EU);
      if (g.ok === false) throw new Error(`${c.acao}: o servidor recusaria (${g.erro} ${g.campo ?? ""})`);
      return true;
    }
  }
}

/** Cada função de gravação das 3 libs, com o que a tela passa, as chamadas esperadas (função › ação) e o que a tela recebe de volta. */
const CASOS: Array<{ nome: string; passos: string[]; rodar: () => Promise<unknown>; volta?: unknown }> = [
  // a nutricao (banco principal)
  {
    nome: "evolucao.enviarFoto", passos: ["nutricao › foto_evolucao_preparar", "storage › principal:evolucao-staging", "nutricao › foto_evolucao_registrar"],
    rodar: () => evolucao.enviarFoto(EU, P, FOTO(), { posicao: "frente", data: "2026-10-11", observacao: "  início   do  acompanhamento " }), volta: LINHA,
  },
  { nome: "evolucao.atualizarFoto", passos: ["nutricao › foto_evolucao_editar"], rodar: () => evolucao.atualizarFoto(ID, { posicao: "lado_e", observacao: "" }), volta: LINHA },
  { nome: "evolucao.excluirFoto", passos: ["nutricao › foto_evolucao_excluir"], rodar: () => evolucao.excluirFoto({ id: ID, path: "qualquer/caminho" }) },
  { nome: "antropometrias.criarAntropometria", passos: ["nutricao › antropometria_criar"], rodar: () => antropometrias.criarAntropometria(EU, P, REGISTRO), volta: LINHA },
  { nome: "antropometrias.atualizarAntropometria", passos: ["nutricao › antropometria_editar"], rodar: () => antropometrias.atualizarAntropometria(ID, REGISTRO), volta: LINHA },
  { nome: "antropometrias.excluirAntropometria", passos: ["nutricao › antropometria_excluir"], rodar: () => antropometrias.excluirAntropometria(ID) },
  { nome: "avaliacaoApi.avisarAvaliacaoNova", passos: ["nutricao › avaliacao_avisar"], rodar: () => avaliacaoApi.avisarAvaliacaoNova(ALUNO), volta: { avisado: true, semLogin: false } },
  // a admin-avaliacoes (Treino): a foto mensal (nova nesta W) e as de antes (já pela função)
  {
    nome: "avaliacaoApi.subirFotoMensal", passos: ["admin-avaliacoes › foto_preparar", "storage › treino:registros-staging", "admin-avaliacoes › foto_salvar"],
    rodar: () => avaliacaoApi.subirFotoMensal(ALUNO, "2026-10", "frente", FOTO()),
  },
  { nome: "avaliacaoApi.excluirFotoMensal", passos: ["admin-avaliacoes › foto_excluir"], rodar: () => avaliacaoApi.excluirFotoMensal({ id: ID, caminho: CAMINHO_MENSAL }) },
  {
    nome: "avaliacaoApi.registrarAvaliacaoFisica", passos: ["admin-avaliacoes › create", "admin-update-user › (perfil)"],
    rodar: () => avaliacaoApi.registrarAvaliacaoFisica(ALUNO, { data: "2026-10-11", colunas: { peso: 83.6 }, atualizarPerfil: true }), volta: { id: "av1", perfilAtualizado: true },
  },
  { nome: "avaliacaoApi.excluirAvaliacaoFisica", passos: ["admin-avaliacoes › delete"], rodar: () => avaliacaoApi.excluirAvaliacaoFisica("av1", null) },
  { nome: "avaliacaoApi.salvarProximaAvaliacao", passos: ["admin-avaliacoes › proxima"], rodar: () => avaliacaoApi.salvarProximaAvaliacao(ALUNO, "2026-10-22"), volta: "2026-10-22" },
];

const resposta = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
const recusa = (status: number, erro: string) => ({
  data: null,
  error: { name: "FunctionsHttpError", context: new Response(JSON.stringify({ ok: false, erro }), { status, headers: { "Content-Type": "application/json" } }) },
});

beforeEach(() => {
  h.ordem.length = 0;
  h.invoke.mockReset();
  h.subir.mockReset();
  h.treino.mockReset();
  h.invoke.mockImplementation(async (nome: string, o: { body: Record<string, unknown> }) => {
    const { acao, ...corpo } = o.body;
    h.ordem.push({ funcao: nome, acao: String(acao), corpo });
    return { data: RESPOSTA_NUTRICAO, error: null };
  });
  h.subir.mockImplementation(async (cliente: string, bucket: string) => {
    h.ordem.push({ funcao: "storage", acao: `${cliente}:${bucket}`, corpo: {} });
    return { data: { path: "x" }, error: null };
  });
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const { action, ...corpo } = JSON.parse(String(init.body)) as Record<string, unknown>;
    h.ordem.push({ funcao: "admin-avaliacoes", acao: String(action), corpo });
    return resposta(200, RESPOSTA_TREINO);
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("hml-19c — as 3 libs da Avaliação gravam pelo servidor (mesmas assinaturas)", () => {
  it("as 12 funções de gravação estão aqui; toda outra função exportada das 3 libs é leitura (nenhuma gravação ficou de fora)", () => {
    expect(CASOS).toHaveLength(12);
    const modulos = { evolucao, antropometrias, avaliacaoApi };
    // hml-20b: + buscar (a buscarAntropometria — o "Editar" da Avaliação lendo pela função, consulta antropometria { id })
    const LEITURA = /^(listar|buscar|url|urls|ErroAvaliacao$)/;
    const noContrato = new Set(CASOS.map((c) => c.nome));
    const semDecisao: string[] = [];
    for (const [modulo, exportados] of Object.entries(modulos)) {
      for (const [nome, valor] of Object.entries(exportados)) {
        if (typeof valor !== "function" || LEITURA.test(nome)) continue;
        if (!noContrato.has(`${modulo}.${nome}`)) semDecisao.push(`${modulo}.${nome}`);
      }
    }
    expect(semDecisao).toEqual([]);
  });

  it.each(CASOS.map((c) => [c.nome, c] as const))("%s: a função e a ação certas, 1 chamada por passo, o corpo aceito pelo servidor", async (_n, c) => {
    const volta = await c.rodar();
    expect(h.ordem.map((x) => (x.funcao === "storage" ? `storage › ${x.acao}` : `${x.funcao} › ${x.acao}`))).toEqual(c.passos);
    for (const f of chamadas()) {
      expect(aceitaNoServidor(f), `${f.funcao} › ${f.acao}`).toBe(true);
      // o dono e a Lixeira nunca vão no corpo (o servidor põe quem chama)
      expect(f.corpo, f.acao).not.toHaveProperty("nutricionista_id");
      expect(f.corpo, f.acao).not.toHaveProperty("deleted_at");
    }
    if ("volta" in c) expect(volta).toEqual(c.volta);
  });

  it("foto de evolução: a imagem sobe no link que o servidor deu (bucket, caminho e token dele) e o registro leva o MESMO caminho", async () => {
    await evolucao.enviarFoto(EU, P, FOTO(), { posicao: "costas", data: "2026-10-10", observacao: "  início   do  acompanhamento " });
    expect(h.subir).toHaveBeenCalledTimes(1);
    const [cliente, bucket, caminho, token, arquivo, opcoes] = h.subir.mock.calls[0];
    expect([cliente, bucket, caminho, token]).toEqual(["principal", "evolucao-staging", CAMINHO_EVOLUCAO, "tk-p"]);
    expect(arquivo).toBeInstanceOf(File);
    expect(opcoes).toMatchObject({ contentType: "image/jpeg" });
    const [preparar, registrar] = chamadas();
    expect(preparar.corpo).toEqual({ paciente_id: P, nome: "Minha Foto.JPG", tipo: "image/jpeg", tamanho: 3 });
    expect(registrar.corpo).toEqual({
      paciente_id: P, caminho: CAMINHO_EVOLUCAO, nome: "Minha Foto.JPG", tipo: "image/jpeg", tamanho: 3, posicao: "costas", data: "2026-10-10",
      observacao: "início do acompanhamento",
    });
  });

  it("antropometria: as 10 colunas de hoje (o colunas(r)), o aluno à parte no criar e o id no editar", async () => {
    await antropometrias.criarAntropometria(EU, P, REGISTRO);
    await antropometrias.atualizarAntropometria(ID, REGISTRO);
    const [criar, editar] = chamadas();
    expect(criar.corpo).toEqual({ ...REGISTRO, paciente_id: P });
    expect(editar.corpo).toEqual({ ...REGISTRO, id: ID });
  });
});

describe("hml-19c — os erros: a frase fixa (ou a de antes da tela), a subida que falha e o sem internet", () => {
  it("foto de evolução: a subida falhou → upload_falhou e nada é registrado", async () => {
    h.subir.mockResolvedValueOnce({ data: null, error: { message: "row-level security" } });
    await expect(evolucao.enviarFoto(EU, P, FOTO(), { posicao: "frente", data: "2026-10-11", observacao: "" })).rejects.toMatchObject({
      codigo: "upload_falhou", message: "Não foi possível enviar o arquivo. Tente de novo.",
    });
    expect(chamadas().map((f) => f.acao)).toEqual(["foto_evolucao_preparar"]);
  });

  it("foto de evolução: tipo e tamanho recusados no servidor → as frases de antes da tela (o validarImagem); o resto, a frase fixa", async () => {
    h.invoke.mockResolvedValueOnce(recusa(400, "tipo_invalido"));
    await expect(evolucao.enviarFoto(EU, P, FOTO(), { posicao: "frente", data: "2026-10-11", observacao: "" })).rejects.toThrow("Use uma imagem JPG, PNG ou WebP");
    h.invoke.mockResolvedValueOnce(recusa(400, "arquivo_grande"));
    await expect(evolucao.enviarFoto(EU, P, FOTO(), { posicao: "frente", data: "2026-10-11", observacao: "" })).rejects.toThrow("Imagem acima de 10 MB");
    h.invoke.mockResolvedValueOnce(recusa(403, "sem_acesso"));
    await expect(evolucao.enviarFoto(EU, P, FOTO(), { posicao: "frente", data: "2026-10-11", observacao: "" })).rejects.toThrow("Você não tem permissão para fazer isso com este aluno.");
  });

  it("antropometria e foto: 0 linha / sem acesso → a frase fixa, nunca a mensagem crua do banco (antes o toast mostrava o erro do Postgres)", async () => {
    h.invoke.mockResolvedValueOnce(recusa(404, "nao_encontrado"));
    await expect(antropometrias.excluirAntropometria(ID)).rejects.toThrow("Não encontrado: o registro foi excluído ou não é seu.");
    h.invoke.mockResolvedValueOnce(recusa(400, "dados_invalidos"));
    await expect(antropometrias.criarAntropometria(EU, P, REGISTRO)).rejects.toThrow("Confira os dados e tente de novo.");
    h.invoke.mockResolvedValueOnce(recusa(404, "nao_encontrado"));
    await expect(evolucao.atualizarFoto(ID, { data: "2026-10-01" })).rejects.toMatchObject({ codigo: "nao_encontrado" });
  });

  it("sem internet: nenhuma chamada (nutricao e admin-avaliacoes)", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await expect(antropometrias.excluirAntropometria(ID)).rejects.toMatchObject({ codigo: "sem_internet" });
    await expect(evolucao.excluirFoto({ id: ID, path: "x" })).rejects.toMatchObject({ codigo: "sem_internet" });
    await expect(avaliacaoApi.excluirFotoMensal({ id: ID, caminho: CAMINHO_MENSAL })).rejects.toMatchObject({ codigo: "sem_internet" });
    expect(h.ordem).toEqual([]);
  });
});
