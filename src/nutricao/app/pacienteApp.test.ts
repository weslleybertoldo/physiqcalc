import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  assinar: vi.fn(),
}));
vi.mock("@/integrations/principal/client", () => ({
  principalConfigurado: true,
  principal: {
    rpc: (...a: unknown[]) => h.rpc(...a),
    storage: { from: () => ({ upload: h.upload, remove: h.remove, createSignedUrls: h.assinar }) },
  },
  PRINCIPAL_SCHEMA: "public",
}));

import { enviarFotoDiario, marcarMeta, marcarRefeicao, minhaDieta, normalizarDieta, urlsDoDiario } from "./pacienteApp";

beforeEach(() => {
  h.rpc.mockReset();
  h.upload.mockReset();
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
  it("o ✓ da refeição é a MESMA função do site antigo (paciente_marcar_refeicao) com o dia de São Paulo", async () => {
    h.rpc.mockResolvedValue({ data: true, error: null });
    expect(await marcarRefeicao("r1", "2026-09-30", true)).toBe(true);
    expect(h.rpc).toHaveBeenCalledWith("paciente_marcar_refeicao", { p_refeicao_id: "r1", p_data: "2026-09-30", p_concluida: true });
    h.rpc.mockResolvedValue({ data: null, error: { message: "sem_alimentos" } });
    await expect(marcarRefeicao("r1", "2026-09-30", true)).rejects.toThrow("sem_alimentos");
  });
  it("o ✓ da meta é a aluno_marcar_meta (NF4)", async () => {
    h.rpc.mockResolvedValue({ data: false, error: null });
    expect(await marcarMeta("mt1", "2026-09-30", false)).toBe(false);
    expect(h.rpc).toHaveBeenCalledWith("aluno_marcar_meta", { p_meta_id: "mt1", p_data: "2026-09-30", p_concluida: false });
  });
  it("sem internet nada é gravado (9A)", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await expect(marcarRefeicao("r1", "2026-09-30", true)).rejects.toThrow("sem_internet");
    await expect(minhaDieta("2026-09-30")).rejects.toThrow("sem_internet");
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("erro de rede vira sem_internet", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "TypeError: Failed to fetch" } });
    await expect(minhaDieta("2026-09-30")).rejects.toThrow("sem_internet");
  });
});

describe("foto do diário (o mesmo caminho do link público do Nutri)", () => {
  const mat = { id: "pac-1", link_codigo: " ABC123 ", nutricionista: { id: "nut-1", nome: "Camila", foto_url: null } };
  it("sobe na pasta <nutricionista>/<paciente>/ e grava pela diario_enviar com o código do aluno", async () => {
    h.upload.mockResolvedValue({ error: null });
    h.rpc.mockResolvedValue({ data: { id: "d1", data_hora: "2026-09-30T15:00:00Z" }, error: null });
    const f = new File(["x"], "prato.jpg", { type: "image/jpeg" });
    const r = await enviarFotoDiario(mat, f, { refeicao: "almoco", comentario: " boa ", dataHoraIso: "2026-09-30T15:00:00.000Z" });
    expect(r.id).toBe("d1");
    const caminho = h.upload.mock.calls[0][0] as string;
    expect(caminho).toMatch(/^nut-1\/pac-1\/[0-9a-f-]{36}\.jpg$/);
    expect(h.rpc).toHaveBeenCalledWith("diario_enviar", expect.objectContaining({ p_codigo: "abc123", p_path: caminho, p_mime: "image/jpeg", p_refeicao: "almoco", p_comentario: "boa" }));
  });
  it("se a função recusa, tenta tirar o arquivo e devolve o código do erro", async () => {
    h.upload.mockResolvedValue({ error: null });
    h.rpc.mockResolvedValue({ data: null, error: { message: "codigo_invalido" } });
    await expect(enviarFotoDiario(mat, new File(["x"], "a.png", { type: "image/png" }), { refeicao: "jantar", comentario: "", dataHoraIso: "2026-09-30T22:00:00.000Z" })).rejects.toThrow("codigo_invalido");
    expect(h.remove).toHaveBeenCalled();
  });
  it("URLs assinadas das próprias fotos, por registro (a que falha fica de fora)", async () => {
    h.assinar.mockResolvedValue({ data: [{ path: "a/b/1.jpg", signedUrl: "https://x/1", error: null }, { path: "a/b/2.jpg", signedUrl: "", error: "nope" }], error: null });
    expect(await urlsDoDiario([{ id: "d1", path: "a/b/1.jpg" }, { id: "d2", path: "a/b/2.jpg" }])).toEqual({ d1: "https://x/1" });
    expect(await urlsDoDiario([])).toEqual({});
  });
});
