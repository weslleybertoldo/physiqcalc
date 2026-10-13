// Physiq W-A P2 — a porta da TELA da aluno-dia (src/aluno-dia/api.ts): cada função exportada chama a aluno-dia com a ação certa, 1 vez, e o
// corpo que ela manda PASSA nas regras REAIS do servidor (supabase-principal/functions/_shared/aluno-dia-regras.ts — as mesmas da borda); toda
// leitura é { acao: "ler", q }. Meta-teste: toda função exportada está na tabela. Os negativos: a frase fixa, sem internet, a rede.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/principal/client", () => ({
  PRINCIPAL_SCHEMA: "staging",
  principalConfigurado: true,
  principal: {
    functions: { invoke: (...a: unknown[]) => h.invoke(...a) },
    from: (t: string) => {
      throw new Error(`tabela direta ${t}`);
    },
    rpc: (f: string) => {
      throw new Error(`RPC direta ${f}`);
    },
  },
}));

import { STATUS_DO_ERRO_ALUNO_DIA, pedidoDoAlunoDia } from "../../supabase-principal/functions/_shared/aluno-dia-regras";
import * as api from "./api";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const HOJE = "2026-10-13";

/** Cada porta: os argumentos de exemplo e a ação (ou ler:<q>) que ela tem de mandar. */
const PORTAS: Record<string, [unknown[], string]> = {
  lerMinhasRotinas: [[HOJE, HOJE], "ler:rotinas"],
  lerMeuDia: [[HOJE], "ler:dia"],
  lerMinhaBiblioteca: [[], "ler:biblioteca"],
  buscarAlimentosDoAluno: [["arroz", 1], "ler:alimentos"],
  lerRotinasDoAluno: [[A, "2026-10-07", HOJE], "ler:aluno_rotinas"],
  lerDiaDoAluno: [[A, "2026-10-07", HOJE], "ler:aluno_dia"],
  salvarRotina: [[null, { nome: "Creatina", tipo: "suplemento", horario: "08:00", lembrete: true }], "rotina_salvar"],
  arquivarRotina: [[A], "rotina_arquivar"],
  marcarRotina: [[A, HOJE, true], "rotina_marcar"],
  ordenarRotinas: [[[A, B]], "rotinas_ordenar"],
  adicionarNoDia: [[HOJE, { refeicao_id: A, alimento_id: B, quantidade_g: 100 }], "dia_adicionar"],
  tirarDoDia: [[HOJE, A], "dia_tirar"],
  desfazerNoDia: [[A], "dia_desfazer"],
  salvarExtra: [[null, { dia: HOJE, nome: "Lanche", horario: "16:00" }], "extra_salvar"],
  excluirExtra: [[A], "extra_excluir"],
  marcarExtra: [[A, false], "extra_marcar"],
  salvarAlimento: [[null, { nome: "Pão", energia_kcal: 280 }], "alimento_salvar"],
  excluirAlimento: [[A], "alimento_excluir"],
  salvarReceita: [[null, { nome: "Vitamina", porcoes: 2, itens: [{ alimento_id: A, quantidade_g: 200 }] }], "receita_salvar"],
  excluirReceita: [[A], "receita_excluir"],
  profSalvarRotina: [[A, null, { nome: "Remédio", tipo: "remedio" }], "prof_rotina_salvar"],
  profArquivarRotina: [[A, B], "prof_rotina_arquivar"],
};

beforeEach(() => {
  h.invoke.mockReset();
  h.invoke.mockResolvedValue({ data: { ok: true }, error: null });
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

describe("W-A P2: a porta da tela — aluno-dia", () => {
  it.each(Object.entries(PORTAS))("%s: 1 chamada à aluno-dia; o corpo passa nas regras do servidor com a ação certa (a ação por último)", async (nome, [args, esperado]) => {
    const fn = (api as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[nome];
    await fn(...args);
    expect(h.invoke).toHaveBeenCalledTimes(1);
    const [funcao, opcoes] = h.invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(funcao).toBe("aluno-dia");
    expect(Object.keys(opcoes.body).slice(-1)[0]).toBe("acao"); // (sem o .at: o tsconfig do app é ES2020)
    const r = pedidoDoAlunoDia(opcoes.body);
    if (!r.ok) throw new Error(`${nome}: o servidor recusaria (${JSON.stringify(r)})`);
    expect(r.pedido.q ? `ler:${r.pedido.q}` : r.pedido.acao).toBe(esperado);
  });

  it("meta: toda função exportada (fora a frase e o erro) está na tabela", () => {
    const exportadas = Object.entries(api).filter(([n, v]) => typeof v === "function" && /^[a-z]/.test(n) && n !== "mensagemErroAlunoDia").map(([n]) => n);
    expect(exportadas.sort()).toEqual(Object.keys(PORTAS).sort());
  });

  it("o erro vira ErroAlunoDia com a frase fixa; a rede → rede; sem internet → sem_internet sem chamar", async () => {
    h.invoke.mockResolvedValueOnce({ data: null, error: { name: "FunctionsHttpError", context: new Response(JSON.stringify({ ok: false, erro: "dieta_travada" }), { status: 409 }) } });
    const e = await api.adicionarNoDia(HOJE, { refeicao_id: A, alimento_id: B, quantidade_g: 100 }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(api.ErroAlunoDia);
    expect((e as api.ErroAlunoDia).message).toBe(api.MENSAGEM_ERRO_ALUNO_DIA.dieta_travada);
    h.invoke.mockResolvedValueOnce({ data: null, error: { name: "FunctionsFetchError" } });
    await expect(api.lerMeuDia(HOJE)).rejects.toMatchObject({ codigo: "rede" });
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    h.invoke.mockClear();
    await expect(api.marcarRotina(A, HOJE, true)).rejects.toMatchObject({ codigo: "sem_internet" });
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it("toda frase existe: os códigos da função e os da porta", () => {
    for (const c of [...Object.keys(STATUS_DO_ERRO_ALUNO_DIA), "sem_internet", "rede"]) expect(api.MENSAGEM_ERRO_ALUNO_DIA[c], c).toBeTruthy();
  });
});
