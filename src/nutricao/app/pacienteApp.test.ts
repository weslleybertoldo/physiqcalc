import { beforeEach, describe, expect, it, vi } from "vitest";

// hml-19b (decisão 14): as GRAVAÇÕES do app passam pela função nutricao (functions.invoke) — as mesmas RPCs de hoje lá, como o aluno;
// a foto do diário sobe pelo link assinado que o servidor dá (uploadToSignedUrl).
// hml-20a (H-42): as LEITURAS também — a minha_dieta pela consulta aluno_dieta e as URLs do diário pela aluno_diario_urls (ação `ler`,
// no lote); nada direto na RPC nem no Storage. O erro de leitura chega com o CÓDIGO na mensagem (a tela compara "sem_internet").
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
  PRINCIPAL_URL: "https://principal.teste.invalid",
}));

import { IDS_DO_DIARIO_POR_LEITURA, enviarFotoDiario, marcarMeta, marcarRefeicao, minhaDieta, normalizarDieta, urlsDoDiario } from "./pacienteApp";

const recusa = (status: number, erro: string) => ({
  data: null,
  error: { name: "FunctionsHttpError", context: new Response(JSON.stringify({ ok: false, erro }), { status, headers: { "Content-Type": "application/json" } }) },
});
const corpos = (): Array<Record<string, unknown>> => h.invoke.mock.calls.map(([nome, o]) => ({ nome, ...(o as { body: Record<string, unknown> }).body }));
/** A resposta da ação `ler` com 1 item por consulta pedida (na ordem). */
const leitura = (...itens: unknown[]) => ({ data: { ok: true, itens }, error: null });

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
  it("lê tudo pela minha_dieta(p_dia) — agora pela função (consulta aluno_dieta { dia }) — e normaliza os números do jsonb", async () => {
    h.invoke.mockResolvedValue(leitura({
      ok: true,
      valor: {
        hoje: "2026-09-30", dia: "2026-09-30", matriculas: [{ id: "m1" }],
        planos: [{ id: "p1", kcal_alvo: "2450", refeicoes: [{ id: "r1", dias_semana: ["1", 3], itens: [{ id: "i1", quantidade_g: "150.00", quantidade_medida: null }] }] }],
        metas: [{ id: "mt1", dias_semana: [1, "5"] }], refeicoes_concluidas: ["r1"], metas_concluidas: null, diario: [],
      },
    }));
    const d = await minhaDieta("2026-09-30");
    expect(corpos()).toEqual([{ nome: "nutricao", acao: "ler", itens: [{ dia: "2026-09-30", q: "aluno_dieta" }] }]);
    expect(h.rpc).not.toHaveBeenCalled(); // nada direto no banco
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
    h.invoke.mockResolvedValueOnce({ data: null, error: { name: "FunctionsFetchError", context: new TypeError("Failed to fetch") } });
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
  it("URLs assinadas das próprias fotos, por registro (a que falha fica de fora) — só os ids vão; o servidor relê o caminho e assina", async () => {
    h.invoke.mockResolvedValue(leitura({
      ok: true,
      linhas: [
        { id: "d1", path: "a/b/1.jpg", url: "/storage/v1/object/sign/diario/a/b/1.jpg?token=t1" },
        { id: "d2", path: "a/b/2.jpg", url: null },
      ],
    }));
    expect(await urlsDoDiario([{ id: "d1", path: "a/b/1.jpg" }, { id: "d2", path: "a/b/2.jpg" }, { id: "d3", path: "" }])).toEqual({
      d1: "https://principal.teste.invalid/storage/v1/object/sign/diario/a/b/1.jpg?token=t1",
    });
    expect(corpos()).toEqual([{ nome: "nutricao", acao: "ler", itens: [{ ids: ["d1", "d2"], q: "aluno_diario_urls" }] }]);
    expect(h.assinar).not.toHaveBeenCalled(); // a assinatura saiu do navegador
    h.invoke.mockClear();
    expect(await urlsDoDiario([])).toEqual({});
    expect(h.invoke).not.toHaveBeenCalled();
  });
  it("mais de 60 registros: os ids vão em itens de até 60 no MESMO lote (1 chamada); a leitura que falha devolve vazio, como antes", async () => {
    const registros = Array.from({ length: 61 }, (_, i) => ({ id: `d${i}`, path: `a/b/${i}.jpg` }));
    h.invoke.mockImplementation(async (_n: string, o: { body: { itens: Array<{ ids: string[] }> } }) =>
      leitura(...o.body.itens.map((it) => ({ ok: true, linhas: it.ids.map((id) => ({ id, url: `/storage/v1/object/sign/diario/${id}.jpg?token=t` })) }))));
    const urls = await urlsDoDiario(registros);
    expect(IDS_DO_DIARIO_POR_LEITURA).toBe(60);
    expect(Object.keys(urls)).toHaveLength(61);
    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect((h.invoke.mock.calls[0][1] as { body: { itens: Array<{ ids: string[] }> } }).body.itens.map((i) => i.ids.length)).toEqual([60, 1]);
    h.invoke.mockReset().mockResolvedValue(leitura({ ok: false, erro: "tempo_esgotado" }));
    expect(await urlsDoDiario([{ id: "d1", path: "a/b/1.jpg" }])).toEqual({});
  });
  it("revisão: o PRAZO da função (25 s) chega como tempo_esgotado (o erro com 'Tentar de novo'), NUNCA sem_internet; a rede caída segue sem_internet", async () => {
    h.invoke.mockResolvedValueOnce({ data: null, error: { name: "FunctionsFetchError", context: new DOMException("The operation was aborted.", "AbortError") } });
    const prazo = await minhaDieta("2026-09-30").catch((e) => e);
    expect(prazo).toMatchObject({ codigo: "tempo_esgotado", message: "tempo_esgotado" });
    expect(prazo.message).not.toBe("sem_internet"); // a Dieta compara d.erro.message === "sem_internet" para o "Sem conexão"
    h.invoke.mockResolvedValueOnce({ data: null, error: { name: "FunctionsFetchError", context: new TypeError("Failed to fetch") } });
    await expect(minhaDieta("2026-09-30")).rejects.toMatchObject({ message: "sem_internet" });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await expect(minhaDieta("2026-09-30")).rejects.toThrow("sem_internet");
  });
  it("a leitura da dieta que falha no servidor chega com o código na mensagem (a tela mostra o estado de erro, não o 'sem internet')", async () => {
    h.invoke.mockResolvedValue(leitura({ ok: false, erro: "tempo_esgotado" }));
    await expect(minhaDieta("2026-09-30")).rejects.toMatchObject({ codigo: "tempo_esgotado", message: "tempo_esgotado" });
  });
});
