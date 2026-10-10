import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "./__fixtures__/planoStagingHml17.json";

// hml-17 (H-38): o painel lê o plano pelas RPCs do banco (planos_do_aluno · plano_alimentar · planos_favoritos), que montam o
// plano com os alimentos de verdade para quem vê o aluno — lido direto das tabelas, o RLS de alimentos tirava o alimento próprio
// da nutri de quem não é a autora e o mesmo plano somava 1.540 kcal em vez de 1.894. A fixture é o plano de TESTE do staging
// (w5p-aluna, 5 refeições, 22 itens, 3 alimentos próprios da nutri), anonimizado (uuids falsos, nomes próprios trocados).
const h = vi.hoisted(() => ({ rpc: vi.fn(), consultas: [] as { tabela: string; chamadas: unknown[][] }[], respostas: [] as unknown[] }));
vi.mock("@/integrations/principal/client", () => ({
  PRINCIPAL_SCHEMA: "staging",
  principal: {
    rpc: h.rpc,
    from: (tabela: string) => {
      const registro = { tabela, chamadas: [] as unknown[][] };
      h.consultas.push(registro);
      const resposta = h.respostas.shift();
      const cadeia: unknown = new Proxy({}, {
        get: (_alvo, nome) =>
          nome === "then"
            ? (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => Promise.resolve(resposta).then(ok, falha)
            : (...args: unknown[]) => {
                registro.chamadas.push([String(nome), ...args]);
                return cadeia;
              },
      });
      return cadeia;
    },
  },
}));

import { totaisDoPlano } from "./dietaUtil";
import {
  ERRO_LER_MODELOS, ERRO_LER_PLANO, ERRO_LER_PLANOS, atualizarItem, buscarPlano, listarPlanos, listarPlanosFavoritos, manterAlimento,
  salvarSubstitutos, type Item,
} from "./planos";

type Bruto = (typeof fixture)[number];
const copia = (): Bruto[] => JSON.parse(JSON.stringify(fixture)) as Bruto[];
const itensDe = (p: { refeicoes: { itens: unknown[] }[] }) => p.refeicoes.flatMap((r) => r.itens) as Item[];
const ERRO_DO_BANCO = { message: 'permission denied for function planos_do_aluno — detalhe "cru" do banco', code: "42501" };

let avisos: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  h.rpc.mockReset();
  h.consultas.length = 0;
  h.respostas.length = 0;
  avisos = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => avisos.mockRestore());

describe("planos.ts › leitura pelas RPCs (hml-17, H-38)", () => {
  it("listarPlanos chama planos_do_aluno com p_aluno e monta como o select antigo: 5 refeições, 22 itens, todos com o alimento, 1.894 kcal", async () => {
    h.rpc.mockResolvedValueOnce({ data: copia(), error: null });
    const planos = await listarPlanos("aluno-1");
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(h.rpc).toHaveBeenCalledWith("planos_do_aluno", { p_aluno: "aluno-1" });
    expect(h.consultas).toEqual([]); // nada direto nas tabelas
    expect(planos).toHaveLength(1);
    const p = planos[0];
    expect(p.refeicoes).toHaveLength(5);
    const itens = itensDe(p);
    expect(itens).toHaveLength(22);
    expect(itens.every((i) => i.alimento && i.alimento.id === i.alimento_id)).toBe(true);
    expect(Math.round(totaisDoPlano(p.refeicoes).energia_kcal)).toBe(1894);
    // a montagem de sempre: refeições pela ordem, itens pela ordem, medidas caseiras ordenadas
    expect(p.refeicoes.map((r) => r.ordem)).toEqual([...p.refeicoes.map((r) => r.ordem)].sort((a, b) => a - b));
    for (const r of p.refeicoes) expect(r.itens.map((i) => i.ordem)).toEqual([...r.itens.map((i) => i.ordem)].sort((a, b) => a - b));
    for (const i of itens) {
      const ordens = (i.alimento?.medidas_caseiras ?? []).map((m) => m.ordem);
      expect(ordens).toEqual([...ordens].sort((a, b) => a - b));
    }
  });

  it("controle: os 3 itens com alimento próprio da nutri contam (sem eles o total caía para 1.540 — o que o personal via)", async () => {
    const bruto = copia();
    for (const r of bruto[0].refeicoes) for (const i of r.itens) if (i.alimento && i.alimento.fonte !== "taco") (i as { alimento: unknown }).alimento = null;
    h.rpc.mockResolvedValueOnce({ data: bruto, error: null });
    const [p] = await listarPlanos("aluno-1");
    expect(itensDe(p).filter((i) => !i.alimento)).toHaveLength(3);
    expect(Math.round(totaisDoPlano(p.refeicoes).energia_kcal)).toBe(1540);
  });

  it("quem não vê o aluno recebe [] (lista vazia, sem erro)", async () => {
    h.rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await listarPlanos("de-outra-conta")).toEqual([]);
  });

  it("buscarPlano chama plano_alimentar com p_plano e devolve o plano montado; null (não existe, lixeira ou não vê) → null", async () => {
    h.rpc.mockResolvedValueOnce({ data: copia()[0], error: null });
    const p = await buscarPlano("plano-1");
    expect(h.rpc).toHaveBeenCalledWith("plano_alimentar", { p_plano: "plano-1" });
    expect(p && itensDe(p)).toHaveLength(22);
    h.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await buscarPlano("plano-que-nao-existe")).toBeNull();
  });

  it("listarPlanosFavoritos chama planos_favoritos (sem argumentos) e mantém o paciente {id, nome, conta_id}", async () => {
    const bruto = copia().map((p) => ({ ...p, paciente: { id: "aluno-1", nome: "Aluna de teste", conta_id: "conta-1" } }));
    h.rpc.mockResolvedValueOnce({ data: bruto, error: null });
    const lista = await listarPlanosFavoritos();
    expect(h.rpc).toHaveBeenCalledWith("planos_favoritos");
    expect(lista[0].paciente).toEqual({ id: "aluno-1", nome: "Aluna de teste", conta_id: "conta-1" });
    expect(Math.round(totaisDoPlano(lista[0].refeicoes).energia_kcal)).toBe(1894);
  });

  it.each([
    ["listarPlanos", () => listarPlanos("aluno-1"), ERRO_LER_PLANOS],
    ["buscarPlano", () => buscarPlano("plano-1"), ERRO_LER_PLANO],
    ["listarPlanosFavoritos", () => listarPlanosFavoritos(), ERRO_LER_MODELOS],
  ] as const)("%s: erro da RPC → Error com texto fixo (sem a frase do banco); o código vai para o console", async (_nome, chamar, texto) => {
    h.rpc.mockResolvedValueOnce({ data: null, error: ERRO_DO_BANCO });
    const erro = await chamar().catch((e: Error) => e);
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toBe(texto);
    expect((erro as Error).message).not.toMatch(/permission|denied|42501|cru/);
    expect(avisos).toHaveBeenCalledWith("[planos] leitura:", "42501", ERRO_DO_BANCO.message);
  });
});

describe("planos.ts › gravação do item não troca o alimento por null (hml-17)", () => {
  const item = (): Item => itensDe(copia()[0] as never)[0];

  it("atualizarItem: o embed do RLS volta sem o alimento → fica o alimento que o editor tinha", async () => {
    const antes = item();
    h.respostas.push({ data: { ...antes, quantidade_g: 50, alimento: null }, error: null });
    const salvo = await atualizarItem(antes.id, { quantidade_g: 50, medida_caseira_id: null, quantidade_medida: null, observacao: null }, antes.alimento);
    expect(h.consultas[0].tabela).toBe("itens_refeicao");
    expect(salvo.quantidade_g).toBe(50);
    expect(salvo.alimento).toEqual(antes.alimento);
  });

  it("salvarSubstitutos: idem (o alimento atual fica)", async () => {
    const antes = item();
    h.respostas.push({ data: { ...antes, substitutos: [], alimento: null }, error: null });
    const salvo = await salvarSubstitutos(antes.id, [], antes.alimento);
    expect(salvo.alimento).toEqual(antes.alimento);
  });

  it("controle: com o alimento no embed, vale o do banco; alimento atual de OUTRO id não entra; sem o atual, continua null", () => {
    const antes = item();
    const doBanco = { ...antes.alimento!, nome: "Nome novo do banco" };
    expect(manterAlimento({ ...antes, alimento: doBanco }, antes.alimento).alimento?.nome).toBe("Nome novo do banco");
    expect(manterAlimento({ ...antes, alimento: null }, { ...antes.alimento!, id: "outro-alimento" }).alimento).toBeNull();
    expect(manterAlimento({ ...antes, alimento: null }, null).alimento).toBeNull();
  });
});
