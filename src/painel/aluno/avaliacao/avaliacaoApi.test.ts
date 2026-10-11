import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  invoke: vi.fn(async () => ({ data: { ok: true }, error: null })),
  invokeP: vi.fn(),
  subir: vi.fn(),
  treino: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  DB_SCHEMA: "staging",
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: "tok-treino" } } }) },
    functions: { invoke: h.invoke },
    // hml-19c: a foto mensal só sobe pelo link assinado que a admin-avaliacoes dá; upload/remove direto e tabela quebram o teste
    storage: {
      from: (bucket: string) => ({
        uploadToSignedUrl: (...a: unknown[]) => h.subir(bucket, ...a),
        upload: () => {
          throw new Error("upload direto no Storage do Treino");
        },
        remove: () => {
          throw new Error("remove direto no Storage do Treino");
        },
      }),
    },
    from: (t: string) => {
      throw new Error(`gravação direta na tabela ${t}`);
    },
  },
}));
// hml-19c: o aviso vai pela função nutricao (o cliente do principal só pode chamar a função; RPC direta quebra o teste)
vi.mock("@/integrations/principal/client", () => ({
  PRINCIPAL_SCHEMA: "staging",
  principalConfigurado: true,
  principal: {
    functions: { invoke: (...a: unknown[]) => h.invokeP(...a) },
    rpc: (f: string) => {
      throw new Error(`RPC direta ${f}`);
    },
  },
}));
vi.mock("./fontes", () => ({ carregarTreinoDoPainel: (...a: unknown[]) => h.treino(...a) }));
// o navegador do teste não decodifica imagem: a compressão devolve o JPEG pronto
vi.mock("@/lib/registrosFotos", async (original) => ({
  ...(await original<typeof import("@/lib/registrosFotos")>()),
  comprimirImagem: async () => new Blob(["jpeg"], { type: "image/jpeg" }),
}));

import { ACOES_QUE_GRAVAM, lerExclusaoDeFoto, lerPedidoDeFoto } from "../../../../supabase/functions/admin-avaliacoes/regras";
import { ErroNutricao } from "@/nutricao/servidor";
import {
  ErroAvaliacao, avisarAvaliacaoNova, excluirAvaliacaoFisica, excluirFotoMensal, registrarAvaliacaoFisica, salvarProximaAvaliacao, subirFotoMensal,
} from "./avaliacaoApi";
import { mensagemDoErro } from "./mensagens";

const resposta = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  h.invoke.mockClear();
  h.invokeP.mockReset();
  h.subir.mockReset();
  h.treino.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("avaliação física no Banco do Treino (W17) — gravar sem duplicar", () => {
  it("cria numa tentativa só (o cliente do Treino repetiria o pedido lento e duplicaria a avaliação) e atualiza o perfil", async () => {
    fetchMock.mockResolvedValueOnce(resposta(200, { avaliacao: { id: "av1" } }));
    const r = await registrarAvaliacaoFisica("t1", { data: "2026-10-01", colunas: { peso: 83.6, observacao: "x" }, atualizarPerfil: true });
    expect(r).toEqual({ id: "av1", perfilAtualizado: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/functions\/v1\/admin-avaliacoes$/);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-treino");
    expect((init.headers as Record<string, string>)["x-schema"]).toBe("staging");
    expect(JSON.parse(String(init.body))).toEqual({ action: "create", userId: "t1", avaliacao: { peso: 83.6, observacao: "x", data_avaliacao: "2026-10-01" } });
    // o perfil recebe a composição sem a observação (que é da avaliação)
    expect(h.invoke).toHaveBeenCalledWith("admin-update-user", { body: { userId: "t1", data: { peso: 83.6 } } });
  });

  it("não sendo a mais recente, não mexe no perfil; erro da função vira o código", async () => {
    fetchMock.mockResolvedValueOnce(resposta(200, { avaliacao: { id: "av2" } }));
    await registrarAvaliacaoFisica("t1", { data: "2026-01-01", colunas: { peso: 80 }, atualizarPerfil: false });
    expect(h.invoke).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(resposta(403, { error: "plano_vencido" }));
    await expect(salvarProximaAvaliacao("t1", "2026-10-22")).rejects.toMatchObject({ codigo: "plano_vencido" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("excluir: 'forbidden' de uma linha que já saiu (o 1º pedido lento excluiu) = excluída; ainda lá = erro", async () => {
    fetchMock.mockResolvedValueOnce(resposta(403, { error: "forbidden" }));
    h.treino.mockResolvedValueOnce({ parte: { avaliacoes: [{ id: "outra" }] } });
    await expect(excluirAvaliacaoFisica("av1", { treinoUserId: "t1", colunas: { peso: 84.2 } }, "rota1")).resolves.toBeUndefined();
    expect(h.invoke).toHaveBeenCalledWith("admin-update-user", { body: { userId: "t1", data: { peso: 84.2 } } });

    fetchMock.mockResolvedValueOnce(resposta(403, { error: "forbidden" }));
    h.treino.mockResolvedValueOnce({ parte: { avaliacoes: [{ id: "av1" }] } });
    await expect(excluirAvaliacaoFisica("av1", null, "rota1")).rejects.toBeInstanceOf(ErroAvaliacao);

    // sem como conferir (o Treino não respondeu), não finge que excluiu
    fetchMock.mockResolvedValueOnce(resposta(403, { error: "forbidden" }));
    h.treino.mockRejectedValueOnce(new Error("rede"));
    await expect(excluirAvaliacaoFisica("av1", null, "rota1")).rejects.toMatchObject({ codigo: "forbidden" });
  });
});

// ───────────────────────── hml-19c (H-41 · jeito 2): a foto mensal e o aviso pelo servidor ─────────────────────────
const ALUNO = "aaaaaaaa-0000-4000-8000-000000000001";
const CAMINHO = `${ALUNO}/2026-10/frente.jpg`;
const FOTO = "cccccccc-0000-4000-8000-000000000003";
const ARQUIVO = () => new File(["png"], "foto.png", { type: "image/png" });
const corpos = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>);

describe("hml-19c — a foto mensal pela admin-avaliacoes (foto_preparar → o link assinado → foto_salvar; foto_excluir)", () => {
  it("subir: preparar (aluno, mês, tipo) → o PUT no link assinado do SERVIDOR (com o trocar) → salvar com o MESMO caminho; os corpos passam nas regras reais", async () => {
    fetchMock.mockResolvedValueOnce(resposta(200, { ok: true, bucket: "registros-staging", caminho: CAMINHO, token: "tk" }));
    fetchMock.mockResolvedValueOnce(resposta(200, { ok: true, foto: { id: FOTO } }));
    h.subir.mockResolvedValueOnce({ data: { path: CAMINHO }, error: null });
    await expect(subirFotoMensal(ALUNO, "2026-10", "frente", ARQUIVO())).resolves.toBeUndefined();
    expect(corpos()).toEqual([
      { action: "foto_preparar", userId: ALUNO, mes: "2026-10", tipo: "frente" },
      { action: "foto_salvar", userId: ALUNO, mes: "2026-10", tipo: "frente", caminho: CAMINHO },
    ]);
    for (const c of corpos()) {
      expect(ACOES_QUE_GRAVAM.has(String(c.action)), String(c.action)).toBe(true);
      expect(lerPedidoDeFoto(c), String(c.action)).toEqual({ ok: true, alunoId: ALUNO, mes: "2026-10", tipo: "frente", caminho: CAMINHO });
    }
    for (const [url, init] of fetchMock.mock.calls as Array<[string, RequestInit]>) {
      expect(url).toMatch(/\/functions\/v1\/admin-avaliacoes$/);
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-treino");
      expect((init.headers as Record<string, string>)["x-schema"]).toBe("staging");
    }
    expect(h.subir).toHaveBeenCalledTimes(1);
    const [bucket, caminho, token, blob, opcoes] = h.subir.mock.calls[0];
    expect([bucket, caminho, token]).toEqual(["registros-staging", CAMINHO, "tk"]);
    expect(blob).toBeInstanceOf(Blob);
    expect(opcoes).toEqual({ upsert: true, contentType: "image/jpeg" });
  });

  it("subir: o servidor recusa (fora do escopo) → ErroAvaliacao com o código e a frase da tela; nada sobe nem é salvo", async () => {
    fetchMock.mockResolvedValueOnce(resposta(403, { error: "forbidden" }));
    const e = await subirFotoMensal(ALUNO, "2026-10", "frente", ARQUIVO()).catch((x) => x);
    expect(e).toMatchObject({ codigo: "forbidden" });
    expect(mensagemDoErro(e)).toBe("Você não muda a avaliação física deste aluno (é do personal responsável).");
    expect(h.subir).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("subir: a subida no link falhou → upload_falhou (frase fixa) e o salvar NÃO é chamado", async () => {
    fetchMock.mockResolvedValueOnce(resposta(200, { ok: true, bucket: "registros-staging", caminho: CAMINHO, token: "tk" }));
    h.subir.mockResolvedValueOnce({ data: null, error: { message: "new row violates row-level security policy" } });
    const e = await subirFotoMensal(ALUNO, "2026-10", "frente", ARQUIVO()).catch((x) => x);
    expect(e).toMatchObject({ codigo: "upload_falhou" });
    expect(mensagemDoErro(e)).toBe("Não foi possível enviar a foto. Tente de novo.");
    expect(corpos().map((c) => c.action)).toEqual(["foto_preparar"]);
  });

  it("subir: o arquivo não chegou (404 arquivo_ausente) → a frase fixa, nunca a mensagem crua do Storage/banco", async () => {
    fetchMock.mockResolvedValueOnce(resposta(200, { ok: true, bucket: "registros-staging", caminho: CAMINHO, token: "tk" }));
    fetchMock.mockResolvedValueOnce(resposta(404, { error: "arquivo_ausente" }));
    h.subir.mockResolvedValueOnce({ data: { path: CAMINHO }, error: null });
    const e = await subirFotoMensal(ALUNO, "2026-10", "frente", ARQUIVO()).catch((x) => x);
    expect(e).toMatchObject({ codigo: "arquivo_ausente" });
    expect(mensagemDoErro(e)).toBe("A foto não chegou. Envie de novo.");
    // 500 da função: o texto genérico de sempre (o código "internal" não tem frase própria)
    fetchMock.mockResolvedValueOnce(resposta(500, { error: "internal" }));
    expect(mensagemDoErro(await subirFotoMensal(ALUNO, "2026-10", "frente", ARQUIVO()).catch((x) => x))).toBe("Não deu certo agora. Tente de novo.");
  });

  it("excluir: 1 pedido foto_excluir só com o id da linha (o caminho NÃO vai: o servidor lê da linha)", async () => {
    fetchMock.mockResolvedValueOnce(resposta(200, { ok: true }));
    await excluirFotoMensal({ id: FOTO, caminho: `${ALUNO}/2026-10/frente.jpg` });
    expect(corpos()).toEqual([{ action: "foto_excluir", fotoId: FOTO }]);
    expect(lerExclusaoDeFoto(corpos()[0])).toEqual({ ok: true, fotoId: FOTO });
    expect(ACOES_QUE_GRAVAM.has("foto_excluir")).toBe(true);
    fetchMock.mockResolvedValueOnce(resposta(403, { error: "forbidden" }));
    await expect(excluirFotoMensal({ id: FOTO, caminho: "x" })).rejects.toMatchObject({ codigo: "forbidden" });
  });

  it("sem internet ou mês fora do formato: nada é chamado", async () => {
    await expect(subirFotoMensal(ALUNO, "2026/10", "frente", ARQUIVO())).rejects.toMatchObject({ codigo: "mes_invalido" });
    vi.stubGlobal("navigator", { onLine: false });
    await expect(subirFotoMensal(ALUNO, "2026-10", "frente", ARQUIVO())).rejects.toMatchObject({ codigo: "sem_internet" });
    await expect(excluirFotoMensal({ id: FOTO, caminho: "x" })).rejects.toMatchObject({ codigo: "sem_internet" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.subir).not.toHaveBeenCalled();
  });
});

describe("hml-19c — o aviso 'avaliação nova' pela função nutricao (avaliacao_avisar)", () => {
  it("1 chamada com o aluno da rota → { avisado, semLogin } (a mesma volta de antes)", async () => {
    h.invokeP.mockResolvedValueOnce({ data: { ok: true, avisado: true, sem_login: false }, error: null });
    expect(await avisarAvaliacaoNova(ALUNO)).toEqual({ avisado: true, semLogin: false });
    expect(h.invokeP).toHaveBeenCalledTimes(1);
    expect(h.invokeP).toHaveBeenCalledWith("nutricao", { body: { alunoId: ALUNO, acao: "avaliacao_avisar" } });
    h.invokeP.mockResolvedValueOnce({ data: { ok: true, avisado: false, sem_login: true }, error: null });
    expect(await avisarAvaliacaoNova(ALUNO)).toEqual({ avisado: false, semLogin: true });
  });

  it("falhou (403 sem_acesso, rede) ou sem internet → { false, false }: o aviso que falha não desfaz nada, como hoje", async () => {
    h.invokeP.mockResolvedValueOnce({
      data: null,
      error: { name: "FunctionsHttpError", context: new Response(JSON.stringify({ ok: false, erro: "sem_acesso" }), { status: 403 }) },
    });
    expect(await avisarAvaliacaoNova(ALUNO)).toEqual({ avisado: false, semLogin: false });
    h.invokeP.mockResolvedValueOnce({ data: null, error: { name: "FunctionsFetchError", message: "Failed to send a request" } });
    expect(await avisarAvaliacaoNova(ALUNO)).toEqual({ avisado: false, semLogin: false });
    vi.stubGlobal("navigator", { onLine: false });
    expect(await avisarAvaliacaoNova(ALUNO)).toEqual({ avisado: false, semLogin: false });
    expect(h.invokeP).toHaveBeenCalledTimes(2);
  });

  it("o erro da nutricao (antropometria, foto de evolução) chega à tela com a frase fixa do código", () => {
    expect(mensagemDoErro(new ErroNutricao("nao_encontrado"))).toBe("Não encontrado: o registro foi excluído ou não é seu.");
    expect(mensagemDoErro(new ErroNutricao("sem_acesso"))).toBe("Você não tem permissão para fazer isso com este aluno.");
  });
});
