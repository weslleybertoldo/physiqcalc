import { beforeEach, describe, expect, it, vi } from "vitest";

// hml-19b (decisão 14): as GRAVAÇÕES do app passam pela função nutricao (functions.invoke) — as mesmas RPCs de hoje lá, como o aluno;
// a foto do diário sobe pelo link assinado que o servidor dá (uploadToSignedUrl). As leituras seguem pelas RPCs/Storage de antes.
const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  upload: vi.fn(),
  subir: vi.fn(),
  remove: vi.fn(),
  assinar: vi.fn(),
}));
vi.mock("@/integrations/principal/client", () => ({
  principalConfigurado: true,
  principal: {
    rpc: (...a: unknown[]) => h.rpc(...a),
    functions: { invoke: (...a: unknown[]) => h.invoke(...a) },
    storage: {
      from: (bucket: string) => ({
        upload: h.upload, remove: h.remove, createSignedUrls: h.assinar, uploadToSignedUrl: (...a: unknown[]) => h.subir(bucket, ...a),
      }),
    },
  },
  PRINCIPAL_SCHEMA: "public",
}));

import { enviarFotoDiario, marcarMeta, marcarRefeicao, minhaDieta, normalizarDieta, urlsDoDiario } from "./pacienteApp";

const recusa = (status: number, erro: string) => ({
  data: null,
  error: { name: "FunctionsHttpError", context: new Response(JSON.stringify({ ok: false, erro }), { status, headers: { "Content-Type": "application/json" } }) },
});
const corpos = () => h.invoke.mock.calls.map(([nome, o]) => ({ nome, ...(o as { body: Record<string, unknown> }).body }));

beforeEach(() => {
  h.rpc.mockReset();
  h.invoke.mockReset();
  h.upload.mockReset();
  h.subir.mockReset();
  h.remove.mockReset().mockResolvedValue({});
  h.assinar.mockReset();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

describe("acesso da aba Dieta ao banco principal", () => {
  it("lê tudo pela minha_dieta(p_dia) e normaliza os números do jsonb", async () => {
    h.rpc.mockResolvedValue({
      data: {
        hoje: "2026-09-30", dia: "2026-09-30", matriculas: [{ id: "m1" }],
        planos: [{ id: "p1", kcal_alvo: "2450", refeicoes: [{ id: "r1", dias_semana: ["1", 3], itens: [{ id: "i1", quantidade_g: "150.00", quantidade_medida: null }] }] }],
        metas: [{ id: "mt1", dias_semana: [1, "5"] }], refeicoes_concluidas: ["r1"], metas_concluidas: null, diario: [],
      },
      error: null,
    });
    const d = await minhaDieta("2026-09-30");
    expect(h.rpc).toHaveBeenCalledWith("minha_dieta", { p_dia: "2026-09-30" });
    expect(d.planos[0].kcal_alvo).toBe(2450);
    expect(d.planos[0].refeicoes[0].dias_semana).toEqual([1, 3]);
    expect(d.planos[0].refeicoes[0].itens[0].quantidade_g).toBe(150);
    expect(d.metas[0].dias_semana).toEqual([1, 5]);
    expect(d.refeicoes_concluidas).toEqual(["r1"]);
    expect(d.metas_concluidas).toEqual([]);
  });
  it("JSON faltando campo não quebra (a tela mostra o vazio)", () => {
    const d = normalizarDieta(null, "2026-09-30");
    expect(d).toMatchObject({ hoje: "2026-09-30", dia: "2026-09-30", matriculas: [], planos: [], metas: [], orientacoes: [], diario: [] });
  });
  it("o ✓ da refeição vai pela nutricao (aluno_marcar_refeicao → a MESMA paciente_marcar_refeicao, como o aluno), com o dia de São Paulo", async () => {
    h.invoke.mockResolvedValue({ data: { ok: true, concluida: true }, error: null });
    expect(await marcarRefeicao("r1", "2026-09-30", true)).toBe(true);
    expect(corpos()).toEqual([{ nome: "nutricao", refeicao_id: "r1", data: "2026-09-30", concluida: true, acao: "aluno_marcar_refeicao" }]);
    expect(h.rpc).not.toHaveBeenCalled(); // nada direto no banco
    // o código da RPC chega na mensagem, como antes (a tela traduz: "Essa refeição ainda não tem alimentos.")
    h.invoke.mockResolvedValue(recusa(400, "sem_alimentos"));
    await expect(marcarRefeicao("r1", "2026-09-30", true)).rejects.toMatchObject({ codigo: "sem_alimentos", message: "sem_alimentos" });
  });
  it("o ✓ da meta vai pela nutricao (aluno_marcar_meta, NF4); a meta pausada chega com o código", async () => {
    h.invoke.mockResolvedValue({ data: { ok: true, concluida: false }, error: null });
    expect(await marcarMeta("mt1", "2026-09-30", false)).toBe(false);
    expect(corpos()).toEqual([{ nome: "nutricao", meta_id: "mt1", data: "2026-09-30", concluida: false, acao: "aluno_marcar_meta" }]);
    h.invoke.mockResolvedValue(recusa(400, "meta_pausada"));
    await expect(marcarMeta("mt1", "2026-09-30", true)).rejects.toThrow("meta_pausada");
  });
  it("sem internet nada é gravado (9A)", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await expect(marcarRefeicao("r1", "2026-09-30", true)).rejects.toThrow("sem_internet");
    await expect(marcarMeta("mt1", "2026-09-30", true)).rejects.toThrow("sem_internet");
    await expect(minhaDieta("2026-09-30")).rejects.toThrow("sem_internet");
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.invoke).not.toHaveBeenCalled();
  });
  it("erro de rede vira sem_internet (na leitura e na função)", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "TypeError: Failed to fetch" } });
    await expect(minhaDieta("2026-09-30")).rejects.toThrow("sem_internet");
    h.invoke.mockResolvedValue({ data: null, error: { name: "FunctionsFetchError", context: new TypeError("Failed to fetch") } });
    await expect(marcarRefeicao("r1", "2026-09-30", true)).rejects.toThrow("sem_internet");
  });
});

describe("foto do diário (pelo link assinado do servidor; o mesmo registro do link público)", () => {
  const mat = { id: "pac-1", link_codigo: " ABC123 ", nutricionista: { id: "nut-1", nome: "Camila", foto_url: null } };
  const LINK = { ok: true, bucket: "diario", caminho: "nut-1/pac-1/0b6c1d3e-0000-4000-8000-000000000001.jpg", token: "tk" };

  it("pede o link (o caminho é do servidor), sobe nele e registra com o código do aluno e o MESMO caminho", async () => {
    h.invoke.mockResolvedValueOnce({ data: LINK, error: null }).mockResolvedValueOnce({ data: { ok: true, registro: { id: "d1", data_hora: "2026-09-30T15:00:00Z" } }, error: null });
    h.subir.mockResolvedValue({ data: { path: LINK.caminho }, error: null });
    const f = new File(["x"], "prato.jpg", { type: "image/jpeg" });
    const r = await enviarFotoDiario(mat, f, { refeicao: "almoco", comentario: " boa ", dataHoraIso: "2026-09-30T15:00:00.000Z" });
    expect(r).toEqual({ id: "d1", data_hora: "2026-09-30T15:00:00Z" });
    const [preparar, enviar] = corpos();
    expect(preparar).toEqual({ nome: "nutricao", paciente_id: "pac-1", nutricionista_id: "nut-1", tipo: "image/jpeg", tamanho: 1, acao: "aluno_diario_preparar" });
    expect(h.subir).toHaveBeenCalledTimes(1);
    const [bucket, caminho, token, arquivo, opcoes] = h.subir.mock.calls[0];
    expect([bucket, caminho, token, arquivo]).toEqual(["diario", LINK.caminho, "tk", f]);
    expect(opcoes).toMatchObject({ contentType: "image/jpeg" });
    expect(enviar).toEqual({
      nome: "nutricao", paciente_id: "pac-1", nutricionista_id: "nut-1", tipo: "image/jpeg", tamanho: 1, caminho: LINK.caminho, codigo: "abc123",
      refeicao: "almoco", comentario: "boa", data_hora: "2026-09-30T15:00:00.000Z", acao: "aluno_diario_enviar",
    });
    // nada direto: nem upload no bucket, nem a RPC, nem o remove
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.remove).not.toHaveBeenCalled();
  });
  it("o servidor recusa o registro → o código do erro (a tela traduz); quem tira o arquivo é o servidor", async () => {
    h.invoke.mockResolvedValueOnce({ data: LINK, error: null }).mockResolvedValueOnce(recusa(403, "codigo_invalido"));
    h.subir.mockResolvedValue({ data: { path: LINK.caminho }, error: null });
    await expect(enviarFotoDiario(mat, new File(["x"], "a.png", { type: "image/png" }), { refeicao: "jantar", comentario: "", dataHoraIso: "2026-09-30T22:00:00.000Z" }))
      .rejects.toThrow("codigo_invalido");
    expect(h.remove).not.toHaveBeenCalled();
  });
  it("a subida falha → a mensagem do Storage (a tela traduz) e nada é registrado", async () => {
    h.invoke.mockResolvedValueOnce({ data: LINK, error: null });
    h.subir.mockResolvedValue({ data: null, error: { message: "new row violates row-level security policy" } });
    await expect(enviarFotoDiario(mat, new File(["x"], "a.png", { type: "image/png" }), { refeicao: "jantar", comentario: "", dataHoraIso: "2026-09-30T22:00:00.000Z" }))
      .rejects.toThrow(/row-level security/);
    expect(corpos().map((c) => c.acao)).toEqual(["aluno_diario_preparar"]);
  });
  it("o servidor recusa o link (pasta fechada) → sem_acesso e nada sobe", async () => {
    h.invoke.mockResolvedValueOnce(recusa(403, "sem_acesso"));
    await expect(enviarFotoDiario(mat, new File(["x"], "a.png", { type: "image/png" }), { refeicao: "jantar", comentario: "", dataHoraIso: "2026-09-30T22:00:00.000Z" }))
      .rejects.toThrow("sem_acesso");
    expect(h.subir).not.toHaveBeenCalled();
  });
  it("URLs assinadas das próprias fotos, por registro (a que falha fica de fora)", async () => {
    h.assinar.mockResolvedValue({ data: [{ path: "a/b/1.jpg", signedUrl: "https://x/1", error: null }, { path: "a/b/2.jpg", signedUrl: "", error: "nope" }], error: null });
    expect(await urlsDoDiario([{ id: "d1", path: "a/b/1.jpg" }, { id: "d2", path: "a/b/2.jpg" }])).toEqual({ d1: "https://x/1" });
    expect(await urlsDoDiario([])).toEqual({});
  });
});
