import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { matricula, situacao } from "@/test/fixturesNucleo";
import type { DadosDieta, ItemDaRefeicao, PlanoAlimentar, RefeicaoDoPlano } from "@/nutricao/app/tipos";

// hml-19b (decisão 14): o ✓ da refeição e da meta passa pela função nutricao — o marcarRefeicao/marcarMeta de VERDADE chamam a
// functions.invoke, e a invoke falsa leva aos mesmos h.marcar/h.meta (o "banco" do teste); a recusa volta como a da função
// ({ ok: false, erro }), com o código. As leituras (minha_dieta, URLs) seguem falsificadas como antes.
// W-A P5: a aluno-dia também passa pela invoke falsa — as leituras (q = dia, rotinas, biblioteca, alimentos) devolvem o "banco" do teste
// (h.meuDia: travada por padrão, como hoje) e cada gravação vai ao h.gravar(acao, corpo) (a recusa: o código, como a função).
const h = vi.hoisted(() => {
  const resposta = (dados: unknown) => ({ data: dados, error: null });
  const recusa = (codigo: string, status = 400) => ({
    data: null,
    error: { name: "FunctionsHttpError", context: new Response(JSON.stringify({ ok: false, erro: codigo }), { status, headers: { "Content-Type": "application/json" } }) },
  });
  const h = {
    sessao: {} as Record<string, unknown>,
    dados: {} as Record<string, unknown>,
    chamadas: [] as string[],
    alunoDia: [] as string[],
    meuDia: {} as Record<string, unknown>,
    busca: [] as Record<string, unknown>[],
    marcar: vi.fn(),
    meta: vi.fn(),
    pratos: vi.fn(),
    gravar: vi.fn(),
    toastErro: vi.fn(),
    toastOk: vi.fn(),
    invocar: async (nome: string, o: { body: Record<string, unknown> }) => {
      const b = o.body;
      if (nome === "aluno-dia") {
        h.alunoDia.push(b.acao === "ler" ? `ler:${String(b.q)}` : String(b.acao));
        if (b.acao === "ler") {
          if (b.q === "dia") return resposta({ ok: true, ...h.meuDia });
          if (b.q === "rotinas") return resposta({ ok: true, hoje: "2026-09-30", rotinas: [], feitas: [] });
          if (b.q === "alimentos") return resposta({ ok: true, pagina: 0, tem_mais: false, itens: String(b.termo).length >= 2 ? h.busca : [] });
          if (b.q === "biblioteca") return resposta({ ok: true, alimentos: [], receitas: [] });
          throw new Error(`leitura inesperada: ${String(b.q)}`);
        }
        try {
          return resposta({ ok: true, ...(await h.gravar(b.acao, b)) });
        } catch (e) {
          const codigo = (e as Error).message;
          return recusa(codigo, codigo === "dieta_travada" ? 409 : 400);
        }
      }
      const f = b.acao === "aluno_marcar_refeicao" ? h.marcar : b.acao === "aluno_marcar_meta" ? h.meta : null;
      if (nome !== "nutricao" || !f) throw new Error(`chamada inesperada: ${nome} ${String(b.acao)}`);
      try {
        return resposta({ ok: true, concluida: await f(b.refeicao_id ?? b.meta_id, b.data, b.concluida) });
      } catch (e) {
        return recusa((e as Error).message);
      }
    },
  };
  return h;
});

vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => h.toastOk(...a), info: vi.fn(), error: (...a: unknown[]) => h.toastErro(...a) } }));
vi.mock("@/integrations/principal/client", () => ({
  principalConfigurado: true,
  PRINCIPAL_SCHEMA: "public",
  principal: { functions: { invoke: (nome: string, o: { body: Record<string, unknown> }) => h.invocar(nome, o) } },
}));
vi.mock("@/nutricao/app/pacienteApp", async (orig) => ({
  ...(await orig<typeof import("@/nutricao/app/pacienteApp")>()),
  minhaDieta: async (dia: string) => {
    h.chamadas.push(dia);
    if (navigator.onLine === false) throw new Error("sem_internet");
    const d = (h.dados[dia] ?? h.dados.padrao) as DadosDieta;
    return { ...d, dia };
  },
  urlsDoDiario: async (regs: { id: string }[]) => Object.fromEntries(regs.map((r) => [r.id, `https://fotos/${r.id}.jpg`])),
  enviarFotoDiario: vi.fn(),
}));
vi.mock("@/app-aluno/sozinho/api", () => ({
  buscarPratos: (...a: unknown[]) => h.pratos(...a),
  ErroApp: class extends Error {},
}));

import { ProvedorConfirmar } from "@/ui/premium/Confirmar";
import Dieta from "./Dieta";

// ─── massa: o plano da tela 3 (Camila Rocha), café e lanche da manhã feitos ───
const alimento = (id: string, nome: string, kcal: number, p: number, c: number, l: number) => ({
  id, nome, fonte: "taco", energia_kcal: kcal, proteina_g: p, carboidrato_g: c, lipidio_g: l, fibra_g: 1, sodio_mg: 1, medidas_caseiras: [],
});
const OVO = { ...alimento("ovo", "Ovo, de galinha, inteiro, cozido/10minutos", 145.7, 13.29, 0.61, 9.48), medidas_caseiras: [{ id: "un", descricao: "1 unidade", gramas: 50, ordem: 0 }] };
const AVEIA = alimento("aveia", "Aveia, flocos, crua", 393.82, 13.92, 66.64, 8.5);
const FRANGO = alimento("frango", "Frango, peito, sem pele, grelhado", 159.19, 32.03, 0, 2.48);
const ARROZ = alimento("arroz", "Arroz, integral, cozido", 123.53, 2.59, 25.81, 1);
const MACA = alimento("maca", "Maçã, Fuji, com casca, crua", 55.52, 0.29, 15.15, 0);
const it0 = (id: string, a: ReturnType<typeof alimento>, g: number, extra: Partial<ItemDaRefeicao> = {}): ItemDaRefeicao => ({
  id, alimento_id: a.id, quantidade_g: g, medida_caseira_id: null, quantidade_medida: null, ordem: 0, substitutos: [], observacao: null,
  created_at: "2026-09-01T10:00:00Z", alimento: a, ...extra,
});
const ref = (id: string, nome: string, horario: string, ordem: number, itens: ItemDaRefeicao[], dias: number[] = []): RefeicaoDoPlano => ({
  id, nome, horario, ordem, observacao: null, dias_semana: dias, itens,
});
const CAFE = ref("cafe", "Café da manhã", "07:00:00", 0, [it0("i-ovo", OVO, 150, { medida_caseira_id: "un", quantidade_medida: 3 }), it0("i-aveia", AVEIA, 50)]);
const LANCHE_M = ref("lanche-m", "Lanche da manhã", "10:00:00", 1, [it0("i-maca", MACA, 130)]);
const ALMOCO = ref("almoco", "Almoço", "13:00:00", 2, [
  it0("i-frango", FRANGO, 150),
  it0("i-arroz", ARROZ, 150, { substitutos: [{ alimento_id: "batata", nome: "Batata, doce, cozida", quantidade_g: 241.4 }, { alimento_id: "mandioca", nome: "Mandioca, cozida", quantidade_g: 147.8 }] }),
]);
const LANCHE_T = ref("lanche-t", "Lanche da tarde", "16:00:00", 3, [it0("i-maca2", MACA, 130)]);
const CEIA_FIM = ref("ceia", "Ceia", "22:00:00", 4, [it0("i-arroz2", ARROZ, 100)], [6, 7]);
const PLANO: PlanoAlimentar = {
  id: "plano-atual", paciente_id: "pac-1", nutricionista_id: "u-camila", titulo: "Plano · definição", metodo: "alimentos", kcal_alvo: 2450,
  observacao: "Beba água ao longo do dia.", favorito: true, created_at: "2026-09-20T10:00:00Z", updated_at: "2026-09-28T15:00:00Z",
  refeicoes: [ALMOCO, CAFE, LANCHE_T, LANCHE_M, CEIA_FIM],
};
const ANTERIOR: PlanoAlimentar = { ...PLANO, id: "plano-velho", titulo: "Plano de agosto", favorito: false, created_at: "2026-08-01T10:00:00Z", refeicoes: [CAFE] };
const base = (o: Partial<DadosDieta> = {}): DadosDieta => ({
  hoje: "2026-09-30", dia: "2026-09-30",
  matriculas: [{ id: "pac-1", nome: "Diego Almeida", conta_id: "c1", conta_nome: "Consultoria Ferreira", ativo: true, link_codigo: "abc123",
    nutricionista: { id: "u-camila", nome: "Camila Rocha", foto_url: "https://fotos/camila.jpg" } }],
  planos: [PLANO, ANTERIOR],
  orientacoes: [{ id: "o1", paciente_id: "pac-1", titulo: "Orientações gerais", conteudo: "## Hidratação\nBeba **2 litros** de água.\n\n- Frutas inteiras", created_at: "2026-09-20T10:00:00Z", updated_at: "2026-09-20T10:00:00Z" }],
  metas: [
    { id: "agua", paciente_id: "pac-1", titulo: "Beber 2 litros de água", descricao: "", dias_semana: [1, 2, 3, 4, 5, 6, 7], ativa: true, inicio: "2026-09-01", created_at: "2026-09-01T10:00:00Z" },
    { id: "caminhar", paciente_id: "pac-1", titulo: "Caminhar 30 minutos", descricao: "", dias_semana: [1, 3, 5], ativa: true, inicio: "2026-09-01", created_at: "2026-09-02T10:00:00Z" },
    { id: "frutas", paciente_id: "pac-1", titulo: "Comer 3 porções de frutas", descricao: "", dias_semana: [6, 7], ativa: true, inicio: "2026-09-01", created_at: "2026-09-03T10:00:00Z" },
    { id: "diario", paciente_id: "pac-1", titulo: "Registrar o diário", descricao: "", dias_semana: [1, 2, 3, 4, 5, 6, 7], ativa: false, inicio: "2026-09-01", created_at: "2026-09-04T10:00:00Z" },
  ],
  refeicoes_concluidas: ["cafe", "lanche-m"],
  metas_concluidas: ["agua"],
  diario: [{ id: "d-almoco", paciente_id: "pac-1", data_hora: "2026-09-30T16:10:00Z", refeicao: "almoco", comentario: "", reacao_nutri: null, comentario_nutri: "", reagido_em: null, path: "u-camila/pac-1/x.jpg" }],
  ...o,
});

// W-A P5: o dia dele na aluno-dia (meu_dia): a matrícula pac-1 travada ("Só ver") ou liberada ("Pode mexer"), o plano ativo e o que ele registrou
const meuDia = (o: { liberada?: boolean; itens?: unknown[]; extras?: unknown[]; matriculas?: { paciente_id: string; liberada: boolean }[] } = {}) => ({
  dia: "2026-09-30", hoje: "2026-09-30", pode_gravar: true,
  matriculas: o.matriculas ?? [{ paciente_id: "pac-1", liberada: o.liberada ?? true }],
  plano_ativo: { plano_id: "plano-atual", paciente_id: "pac-1" }, extras: o.extras ?? [], itens: o.itens ?? [],
});
const itemDoDia = (o: Record<string, unknown>) => ({
  id: "d1", paciente_id: "pac-1", dia: "2026-09-30", tipo: "adicionado", refeicao_id: null, extra_id: null, item_refeicao_id: null, alimento_id: null,
  aluno_alimento_id: null, aluno_receita_id: null, quantidade_g: 100, porcoes: null, refeicao_nome: "Café da manhã", nome: "Banana, prata, crua",
  energia_kcal: 98.25, proteina_g: 1.27, carboidrato_g: 25.96, lipidio_g: 0.07, fibra_g: 2, criado_em: "2026-09-30T10:00:00Z", ...o,
});

function Local() {
  const l = useLocation();
  return <span data-testid="local">{l.pathname + l.search}</span>;
}
function montar(rota = "/dieta") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProvedorConfirmar>
        <MemoryRouter useTransitions={false} initialEntries={[rota]}>
          <Routes>
            <Route path="/dieta" element={<><Dieta /><Local /></>} />
          </Routes>
        </MemoryRouter>
      </ProvedorConfirmar>
    </QueryClientProvider>,
  );
}
function online(sim: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => sim });
}
const pronto = () => waitFor(() => expect(document.querySelector('[data-aba-dieta="plano"]')).not.toBeNull());

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-30T12:00:00-03:00")); // quarta
  online(true);
  h.chamadas = [];
  h.dados = { padrao: base() };
  // o "banco" do teste guarda o ✓ (a releitura depois de marcar devolve o que foi gravado, como a minha_dieta de verdade)
  const gravar = (campo: "refeicoes_concluidas" | "metas_concluidas") => async (id: string, _dia: string, concluida: boolean) => {
    const d = h.dados.padrao as DadosDieta;
    d[campo] = concluida ? [...d[campo].filter((x) => x !== id), id] : d[campo].filter((x) => x !== id);
    return concluida;
  };
  h.marcar.mockReset().mockImplementation(gravar("refeicoes_concluidas"));
  h.toastErro.mockReset();
  h.toastOk.mockReset();
  h.alunoDia = [];
  h.meuDia = meuDia({ liberada: false });
  h.busca = [];
  h.gravar.mockReset().mockImplementation(async (acao: string) => {
    throw new Error(`gravação inesperada: ${acao}`);
  });
  h.meta.mockReset().mockImplementation(gravar("metas_concluidas"));
  h.pratos.mockReset();
  h.sessao = {
    usuario: { id: "u-diego" },
    situacao: situacao({
      modulos_aluno: ["treino", "nutricao"],
      matriculas: [matricula({ modulos: ["treino", "nutricao"], nutricionista: { id: "u-camila", nome: "Camila Rocha" } })],
    }),
  };
});
afterEach(() => {
  vi.useRealTimers();
});

describe("aba Dieta (W11 — tela 3)", () => {
  it("cartão do plano com kcal e macros MARCADOS, refeições de hoje com ✓, 'Feito' na próxima e a foto do diário (P29)", async () => {
    montar();
    await pronto();
    expect(screen.getByRole("heading", { name: "Dieta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Orientações" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver outro dia" })).toBeInTheDocument();
    expect(document.querySelector("[data-plano-autor]")!.textContent).toBe("Plano de Camila Rocha · atualizado em 28/09");
    // café (3 ovos 218,55 + aveia 196,91) + lanche da manhã (maçã 72,18) = 487,64 de 487,64 + 424,38 (almoço) + 72,18 (lanche da tarde)
    expect(document.querySelector("[data-kcal-marcadas]")!.getAttribute("data-kcal-marcadas")).toBe("488");
    expect(document.querySelector("[data-kcal-do-dia]")!.textContent).toBe("de 984 kcal");
    expect(document.querySelector('[data-macro="proteina_g"]')!.getAttribute("data-macro-marcado")).toBe("27");
    expect(screen.getByText("Refeições de hoje")).toBeInTheDocument();
    expect(document.querySelector("[data-refeicoes-contagem]")!.textContent).toBe("2 de 4");
    // a ceia é só de sábado e domingo (NF3): não aparece na quarta
    expect(document.querySelectorAll("[data-refeicao]").length).toBe(4);
    expect(document.querySelector('[data-refeicao="ceia"]')).toBeNull();
    expect(document.querySelector('[data-refeicao="cafe"]')!.getAttribute("data-refeicao-estado")).toBe("feita");
    expect(document.querySelector('[data-refeicao="almoco"]')!.getAttribute("data-refeicao-estado")).toBe("agora");
    expect(document.querySelector('[data-refeicao="lanche-t"]')!.getAttribute("data-refeicao-estado")).toBe("pendente");
    expect(document.querySelector('[data-refeicao="cafe"] [data-refeicao-linha]')!.textContent).toBe("07:00 · Ovo · Aveia");
    // P29: o almoço tem a foto do diário de hoje; o café usa a foto padrão do tipo
    await waitFor(() => expect(document.querySelector('[data-refeicao="almoco"] img')!.getAttribute("src")).toBe("https://fotos/d-almoco.jpg"));
    expect(document.querySelector('[data-refeicao="cafe"] img')!.getAttribute("src")).toBe("/fotos/refeicoes/cafe-da-manha.webp");
    expect(screen.getByRole("button", { name: /Foto pro diário/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Metas/ })).toBeInTheDocument();
    expect(h.chamadas).toEqual(["2026-09-30"]);
  });

  it("'Feito' marca pela MESMA função do site antigo (hoje, em São Paulo) e a próxima passa a ser o lanche; ✓ de novo desmarca", async () => {
    montar();
    await pronto();
    fireEvent.click(screen.getByRole("button", { name: "Marcar Almoço como feita" }));
    await waitFor(() => expect(h.marcar).toHaveBeenCalledWith("almoco", "2026-09-30", true));
    await waitFor(() => expect(document.querySelector('[data-refeicao="almoco"]')!.getAttribute("data-refeicao-estado")).toBe("feita"));
    expect(document.querySelector('[data-refeicao="lanche-t"]')!.getAttribute("data-refeicao-estado")).toBe("agora");
    expect(document.querySelector("[data-refeicoes-contagem]")!.textContent).toBe("3 de 4");
    fireEvent.click(screen.getByRole("button", { name: "Desmarcar Café da manhã" }));
    await waitFor(() => expect(h.marcar).toHaveBeenLastCalledWith("cafe", "2026-09-30", false));
  });

  it("se o banco recusa, a marcação volta atrás", async () => {
    // hml-19b: a recusa vem da função nutricao ({ ok: false, erro: "sem_alimentos" }) e a tela mostra o texto fixo do código
    h.marcar.mockReset().mockRejectedValue(new Error("sem_alimentos"));
    montar();
    await pronto();
    fireEvent.click(screen.getByRole("button", { name: "Marcar Almoço como feita" }));
    await waitFor(() => expect(h.marcar).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector('[data-refeicao="almoco"]')!.getAttribute("data-refeicao-estado")).toBe("agora"));
    await waitFor(() => expect(h.toastErro).toHaveBeenCalledWith("Essa refeição ainda não tem alimentos."));
  });

  it("o ✓ zera no dia seguinte (fuso de São Paulo): às 00:00 a aba busca o dia novo e nada vem marcado", async () => {
    vi.setSystemTime(new Date("2026-09-30T23:59:00-03:00"));
    h.dados = { padrao: base(), "2026-10-01": base({ hoje: "2026-10-01", refeicoes_concluidas: [], metas_concluidas: [], diario: [] }) };
    montar();
    await pronto();
    expect(document.querySelector("[data-refeicoes-contagem]")!.textContent).toBe("2 de 4");
    vi.setSystemTime(new Date("2026-10-01T00:00:05-03:00"));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(document.querySelector("[data-aba-dieta]")!.getAttribute("data-dieta-hoje")).toBe("2026-10-01"));
    await waitFor(() => expect(document.querySelector("[data-refeicoes-contagem]")!.textContent).toBe("0 de 4"));
    expect(h.chamadas).toEqual(["2026-09-30", "2026-10-01"]);
    expect(document.querySelector('[data-refeicao="cafe"]')!.getAttribute("data-refeicao-estado")).toBe("agora");
  });

  it("folha da refeição: alimentos, quantidade e os substitutos; marca por lá também", async () => {
    montar();
    await pronto();
    fireEvent.click(screen.getByRole("button", { name: "Ver Almoço" }));
    await waitFor(() => expect(screen.getByTestId("local").textContent).toBe("/dieta?ver=refeicao&r=almoco"));
    const folha = document.querySelector('[data-folha-refeicao="almoco"]') as HTMLElement;
    expect(within(folha).getByText("Arroz, integral, cozido")).toBeInTheDocument();
    expect(folha.querySelector('[data-item="i-arroz"] [data-item-substitutos]')!.textContent).toBe("ou 241,4 g de Batata, doce, cozida · 147,8 g de Mandioca, cozida");
    fireEvent.click(screen.getByRole("button", { name: /Marcar como feita/ }));
    await waitFor(() => expect(h.marcar).toHaveBeenCalledWith("almoco", "2026-09-30", true));
  });

  it("metas (NF4): as de hoje com ✓, as de outros dias e as pausadas recolhidas; o ✓ vai para aluno_marcar_meta", async () => {
    montar("/dieta?ver=metas");
    await pronto();
    const folha = await waitFor(() => document.querySelector("[data-folha-metas]") as HTMLElement);
    expect(folha.getAttribute("data-metas-hoje")).toBe("2");
    expect(within(folha).getByText("1 de 2")).toBeInTheDocument();
    expect(folha.querySelector('[data-meta="agua"]')!.getAttribute("data-meta-feita")).toBe("1");
    expect(folha.querySelector('[data-meta="frutas"]')!.hasAttribute("data-meta-outro-dia")).toBe(true);
    expect(within(folha).getByText("1 pausada")).toBeInTheDocument();
    fireEvent.click(folha.querySelector('[data-meta="caminhar"]')!);
    await waitFor(() => expect(h.meta).toHaveBeenCalledWith("caminhar", "2026-09-30", true));
    await waitFor(() => expect(folha.querySelector('[data-meta="caminhar"]')!.getAttribute("data-meta-feita")).toBe("1"));
  });

  it("orientações abrem pelo link antigo /app/orientacoes (→ ?ver=orientacoes) com o markdown", async () => {
    montar("/dieta?ver=orientacoes");
    await pronto();
    const folha = await waitFor(() => document.querySelector("[data-folha-orientacoes]") as HTMLElement);
    expect(within(folha).getByText("Orientações gerais")).toBeInTheDocument();
    expect(within(folha).getByText("2 litros").tagName).toBe("STRONG");
    expect(folha.querySelector('[data-bloco-tipo="lista"]')!.textContent).toContain("Frutas inteiras");
  });

  it("calendário (NF3): o plano de outro dia só para ver; sábado tem a ceia; 'hoje' volta", async () => {
    montar();
    await pronto();
    fireEvent.click(screen.getByRole("button", { name: "Ver outro dia" }));
    const sabado = await waitFor(() => document.querySelector('[data-dia="2026-10-03"]') as HTMLElement);
    expect(sabado.getAttribute("data-dia-refeicoes")).toBe("5");
    fireEvent.click(sabado);
    await waitFor(() => expect(screen.getByText("Refeições de sábado · 03/10")).toBeInTheDocument());
    expect(document.querySelector('[data-refeicao="ceia"]')).not.toBeNull();
    expect(document.querySelector('[data-refeicao="cafe"]')!.getAttribute("data-refeicao-estado")).toBe("leitura");
    expect(screen.queryByRole("button", { name: /como feita/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Voltar para hoje" }));
    await waitFor(() => expect(screen.getByText("Refeições de hoje")).toBeInTheDocument());
  });

  it("plano anterior (como os chips do site antigo): abre para consulta, sem ✓", async () => {
    montar();
    await pronto();
    fireEvent.click(document.querySelector("[data-cartao-plano]")!);
    const outro = await waitFor(() => document.querySelector('[data-outro-plano="plano-velho"]') as HTMLElement);
    fireEvent.click(outro);
    await waitFor(() => expect(document.querySelector("[data-dieta-plano-anterior]")).not.toBeNull());
    expect(document.querySelector('[data-refeicao="cafe"]')!.getAttribute("data-refeicao-estado")).toBe("leitura");
    fireEvent.click(screen.getByRole("button", { name: "Plano atual" }));
    await waitFor(() => expect(document.querySelector("[data-dieta-plano-anterior]")).toBeNull());
  });

  it("dia sem refeição: o aviso e 'Ver outro dia'", async () => {
    h.dados = { padrao: base({ planos: [{ ...PLANO, refeicoes: [CEIA_FIM] }], refeicoes_concluidas: [] }) };
    montar();
    await pronto();
    expect(document.querySelector("[data-dieta-dia-sem-refeicao]")!.textContent).toContain("Nenhuma refeição hoje");
    expect(document.querySelector("[data-plano-aviso]")!.textContent).toBe("O seu plano não tem refeição para hoje.");
    expect(document.querySelector("[data-ver-outro-dia]")).not.toBeNull();
  });

  it("sem plano ainda: o vazio, mas o diário e as metas seguem", async () => {
    h.dados = { padrao: base({ planos: [], refeicoes_concluidas: [] }) };
    montar();
    await waitFor(() => expect(document.querySelector('[data-aba-dieta="sem-plano"]')).not.toBeNull());
    expect(screen.getByText("Nenhum plano alimentar ainda")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Foto pro diário/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver outro dia" })).toBeNull();
  });

  it("sem internet: 'A dieta aparece quando a internet voltar' (nada é pedido ao banco)", async () => {
    online(false);
    montar();
    await waitFor(() => expect(document.querySelector('[data-aba-dieta="sem-internet"]')).not.toBeNull());
    expect(screen.getByText("A dieta aparece quando a internet voltar.")).toBeInTheDocument();
  });

  it("aluno sem profissional no Treino + Alimentação: a aba Dieta mostra os pratos prontos (W7b)", async () => {
    h.sessao = {
      usuario: { id: "u-app" },
      situacao: situacao({ modulos_aluno: ["treino", "nutricao"], matriculas: [matricula({ app: true, app_plano: "app_treino_alimentacao", objetivo_app: "emagrecer", modulos: ["treino", "nutricao"], nutricionista: null })] }),
    };
    h.pratos.mockResolvedValue({ ok: true, objetivo: "emagrecer", pratos: [{ codigo: "p1", nome: "Omelete de claras", refeicao: "cafe_da_manha", objetivos: ["emagrecer"], kcal: 250, proteina_g: 20, carboidrato_g: 10, lipidio_g: 8, itens: [{ nome: "Ovo", quantidade_g: 100, kcal: 150 }], foto_url: null }] });
    montar();
    await waitFor(() => expect(document.querySelector('[data-aba-dieta="pratos"]')).not.toBeNull());
    await waitFor(() => expect(document.querySelector('[data-prato-pronto="p1"]')).not.toBeNull());
    expect(screen.getByText("Pratos prontos · Emagrecer")).toBeInTheDocument();
    expect(h.chamadas).toEqual([]);
  });
});

describe("W-A P5 — a Dieta 'Pode mexer' (spec §4.4) e as rotinas na Dieta (§4.3)", () => {
  const liberar = (o: Parameters<typeof meuDia>[0] = {}) => {
    h.meuDia = meuDia({ liberada: true, ...o });
  };
  const prontoLivre = () => waitFor(() => expect(document.querySelector('[data-dieta-livre="liberada"]')).not.toBeNull());
  /** espera o elemento aparecer (o waitFor só repete o que lança) */
  const achar = <T extends HTMLElement = HTMLElement>(seletor: string, timeout = 3000) =>
    waitFor(() => {
      const el = document.querySelector(seletor);
      if (!el) throw new Error(`sem ${seletor}`);
      return el as T;
    }, { timeout });
  afterEach(() => {
    // o "offline" do teste da internet deixa o onlineManager do React Query parado: volta para os próximos
    online(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
  });

  it("'Só ver' (o padrão): tudo como hoje — nenhum botão novo, a folha sem 'Tirar hoje'; só a leitura do dia; as rotinas no fim", async () => {
    montar();
    await pronto();
    await waitFor(() => expect(document.querySelector("[data-aba-dieta]")!.getAttribute("data-dieta-dia-livre")).toBe("travada"));
    expect(document.querySelector("[data-dieta-livre]")).toBeNull();
    expect(screen.queryByRole("button", { name: /Nova refeição/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Meus alimentos e receitas/ })).toBeNull();
    expect(document.querySelector("[data-kcal-marcadas]")!.getAttribute("data-kcal-marcadas")).toBe("488");
    fireEvent.click(screen.getByRole("button", { name: "Ver Café da manhã" }));
    const folha = await waitFor(() => document.querySelector('[data-folha-refeicao="cafe"]') as HTMLElement);
    expect(folha.querySelector("[data-item-tirar]")).toBeNull();
    expect(folha.querySelector("[data-dieta-adicionar]")).toBeNull();
    expect(folha.querySelectorAll("[data-item]").length).toBe(2);
    await waitFor(() => expect(document.querySelector("[data-card-rotinas-dieta]")).not.toBeNull());
    expect(h.alunoDia.filter((x) => x !== "ler:dia" && x !== "ler:rotinas")).toEqual([]);
    expect(h.gravar).not.toHaveBeenCalled();
  });

  it("'Pode mexer': tira um item SÓ hoje (riscado, com 'Voltar') e volta — a aluno-dia com o dia de hoje e o item do plano", async () => {
    liberar();
    h.gravar.mockImplementation(async (acao: string, b: Record<string, unknown>) => {
      if (acao === "dia_tirar") {
        h.meuDia = meuDia({ itens: [itemDoDia({ id: "t1", tipo: "tirado", refeicao_id: "cafe", item_refeicao_id: b.item, nome: "Aveia, flocos, crua", energia_kcal: 196.91 })] });
        return { item: {} };
      }
      if (acao === "dia_desfazer") {
        h.meuDia = meuDia();
        return {};
      }
      throw new Error(`gravação inesperada: ${acao}`);
    });
    montar("/dieta?ver=refeicao&r=cafe");
    await prontoLivre();
    const folha = (await achar('[data-folha-refeicao="cafe"] [data-item-tirar="i-aveia"]')).closest("[data-folha-refeicao]") as HTMLElement;
    fireEvent.click(folha.querySelector('[data-item-tirar="i-aveia"]')!);
    await waitFor(() => expect(h.gravar).toHaveBeenCalledWith("dia_tirar", expect.objectContaining({ dia: "2026-09-30", item: "i-aveia" })));
    await waitFor(() => expect(folha.querySelector('[data-item="i-aveia"]')!.getAttribute("data-item-tirado")).toBe("1"));
    expect(folha.querySelector('[data-item="i-aveia"] [data-item-nome]')!.className).toContain("line-through");
    expect(document.querySelector('[data-refeicao="cafe"] [data-refeicao-linha]')!.textContent).toBe("07:00 · Ovo");
    fireEvent.click(folha.querySelector('[data-item-voltar="i-aveia"]')!);
    await waitFor(() => expect(h.gravar).toHaveBeenCalledWith("dia_desfazer", expect.objectContaining({ id: "t1" })));
    await waitFor(() => expect(folha.querySelector('[data-item="i-aveia"]')!.getAttribute("data-item-tirado")).toBe("0"));
  });

  it("o anel e as barras contam o que ele comeu: o café feito sem a aveia que ele tirou e com a banana que pôs; o plano do dia não muda", async () => {
    liberar({ itens: [itemDoDia({ id: "t1", tipo: "tirado", refeicao_id: "cafe", item_refeicao_id: "i-aveia", nome: "Aveia", energia_kcal: 196.91 }), itemDoDia({ id: "p1", refeicao_id: "cafe" })] });
    montar();
    await prontoLivre();
    // café 218,55 (os 3 ovos) + 98,25 (a banana) + o lanche da manhã 72,18 = 388,98 — de 984 (o plano do dia)
    await waitFor(() => expect(document.querySelector("[data-kcal-marcadas]")!.getAttribute("data-kcal-marcadas")).toBe("389"));
    expect(document.querySelector("[data-kcal-do-dia]")!.textContent).toBe("de 984 kcal");
    expect(document.querySelector('[data-refeicao="cafe"] [data-refeicao-linha]')!.textContent).toBe("07:00 · Ovo · Banana");
    expect(document.querySelector("[data-refeicoes-contagem]")!.textContent).toBe("2 de 4");
    fireEvent.click(screen.getByRole("button", { name: "Ver Café da manhã" }));
    const folha = (await achar('[data-folha-refeicao="cafe"] [data-item-posto="p1"]')).closest("[data-folha-refeicao]") as HTMLElement;
    expect(folha.querySelector('[data-item-posto="p1"] [data-item-selo]')!.textContent).toBe("você pôs");
    expect(folha.querySelector('[data-item-posto="p1"] [data-item-qtd]')!.textContent).toBe("100 g · 98 kcal");
  });

  it("põe um alimento: 'Adicionar alimento' → a busca → as gramas (com as kcal antes) → 'Pôr no dia' → volta para a refeição", async () => {
    liberar();
    h.busca = [{ tipo: "taco", id: "taco-arroz", nome: "Arroz, tipo 1, cozido", porcao_g: 100, energia_kcal: 128.26, proteina_g: 2.52, carboidrato_g: 28.06, lipidio_g: 0.23, fibra_g: 1.56 }];
    h.gravar.mockImplementation(async (acao: string) => {
      if (acao === "dia_adicionar") return { item: {} };
      throw new Error(`gravação inesperada: ${acao}`);
    });
    montar("/dieta?ver=refeicao&r=almoco");
    await prontoLivre();
    const adicionar = await achar('[data-folha-refeicao="almoco"] [data-dieta-adicionar]');
    fireEvent.click(adicionar);
    await waitFor(() => expect(screen.getByTestId("local").textContent).toBe("/dieta?ver=adicionar&r=almoco"));
    const busca = await achar<HTMLInputElement>("[data-busca-termo]");
    fireEvent.change(busca, { target: { value: "ar" } });
    const achado = await achar('[data-busca-item="taco-arroz"]');
    expect(achado.textContent).toContain("TACO · 128 kcal em 100 g");
    fireEvent.click(achado);
    const qtd = await achar<HTMLInputElement>("[data-quantidade]");
    expect(qtd.value).toBe("100");
    fireEvent.change(qtd, { target: { value: "150" } });
    expect(document.querySelector("[data-quantidade-macros]")!.getAttribute("data-quantidade-macros")).toBe("192");
    fireEvent.click(document.querySelector("[data-escolha-por]")!);
    await waitFor(() =>
      expect(h.gravar).toHaveBeenCalledWith("dia_adicionar", expect.objectContaining({ dia: "2026-09-30", dados: { refeicao_id: "almoco", alimento_id: "taco-arroz", quantidade_g: 150 } })),
    );
    await waitFor(() => expect(screen.getByTestId("local").textContent).toBe("/dieta?ver=refeicao&r=almoco"));
    expect(h.toastOk).toHaveBeenCalledWith("Posto no seu dia.");
  });

  it("'Nova refeição' (nome, horário, 'Já comi' ligado): sem nome não vai; com nome, a extra de hoje pela aluno-dia e na lista", async () => {
    liberar();
    h.gravar.mockImplementation(async (acao: string) => {
      if (acao === "extra_salvar") {
        h.meuDia = meuDia({ extras: [{ id: "e1", paciente_id: "pac-1", nome: "Lanche da tarde", horario: "12:00", concluida_em: "2026-09-30T15:00:00Z" }] });
        return { extra: {} };
      }
      throw new Error(`gravação inesperada: ${acao}`);
    });
    montar();
    await prontoLivre();
    fireEvent.click(document.querySelector("[data-dieta-nova-refeicao]")!);
    const nome = await achar<HTMLInputElement>("[data-extra-nome]");
    expect((document.querySelector("[data-extra-horario]") as HTMLInputElement).value).toBe("12:00");
    expect(document.querySelector("[data-extra-ja-comi]")!.getAttribute("data-extra-ja-comi")).toBe("1");
    fireEvent.click(document.querySelector("[data-extra-salvar]")!);
    await waitFor(() => expect(nome.getAttribute("aria-invalid")).toBe("true"));
    expect(h.gravar).not.toHaveBeenCalled();
    fireEvent.change(nome, { target: { value: "Lanche da tarde" } });
    fireEvent.click(document.querySelector("[data-extra-salvar]")!);
    await waitFor(() =>
      expect(h.gravar).toHaveBeenCalledWith("extra_salvar", expect.objectContaining({ id: null, dados: { dia: "2026-09-30", nome: "Lanche da tarde", horario: "12:00", ja_comi: true } })),
    );
    await waitFor(() => expect(document.querySelector('[data-extra="e1"]')).not.toBeNull());
    expect(document.querySelector('[data-extra="e1"] [data-refeicao-estado]')!.getAttribute("data-refeicao-estado")).toBe("feita");
    expect(document.querySelector('[data-extra="e1"] [data-refeicao-linha]')!.textContent).toBe("12:00 · Nada ainda · extra");
  });

  it("a refeição extra aberta: 'Adicionar alimento' → a receita dele em porções → na extra; o 'Já comi' desmarca pela aluno-dia", async () => {
    const extra = { id: "e1", paciente_id: "pac-1", nome: "Lanche da tarde", horario: "16:00", concluida_em: "2026-09-30T19:00:00Z" };
    liberar({ extras: [extra] });
    h.busca = [{ tipo: "receita", id: "rc1", nome: "Vitamina de banana", porcao_g: null, energia_kcal: 210, proteina_g: 8, carboidrato_g: 30, lipidio_g: 5, fibra_g: 2 }];
    h.gravar.mockImplementation(async (acao: string) => {
      if (acao === "dia_adicionar") {
        h.meuDia = meuDia({ extras: [extra], itens: [itemDoDia({ id: "p9", extra_id: "e1", aluno_receita_id: "rc1", quantidade_g: null, porcoes: 1, nome: "Vitamina de banana", energia_kcal: 210 })] });
        return { item: {} };
      }
      if (acao === "extra_marcar") return { concluida_em: null };
      throw new Error(`gravação inesperada: ${acao}`);
    });
    montar();
    await prontoLivre();
    fireEvent.click(await achar('[data-extra="e1"] [data-refeicao-abrir]'));
    await waitFor(() => expect(screen.getByTestId("local").textContent).toBe("/dieta?ver=extra&e=e1"));
    fireEvent.click(await achar('[data-folha-extra="e1"] [data-dieta-adicionar]'));
    await waitFor(() => expect(screen.getByTestId("local").textContent).toBe("/dieta?ver=adicionar&e=e1"));
    fireEvent.change(await achar<HTMLInputElement>("[data-busca-termo]"), { target: { value: "vitamina" } });
    fireEvent.click(await achar('[data-busca-item="rc1"]'));
    expect((await achar<HTMLInputElement>("[data-quantidade]")).value).toBe("1");
    fireEvent.click(document.querySelector("[data-escolha-por]")!);
    await waitFor(() =>
      expect(h.gravar).toHaveBeenCalledWith("dia_adicionar", expect.objectContaining({ dia: "2026-09-30", dados: { extra_id: "e1", aluno_receita_id: "rc1", porcoes: 1 } })),
    );
    await waitFor(() => expect(screen.getByTestId("local").textContent).toBe("/dieta?ver=extra&e=e1"));
    const posto = await achar('[data-folha-extra="e1"] [data-item-posto="p9"]');
    expect(posto.querySelector("[data-item-qtd]")!.textContent).toBe("1 porção · 210 kcal");
    fireEvent.click(document.querySelector('[data-folha-extra="e1"] [data-extra-feita]')!);
    await waitFor(() => expect(h.gravar).toHaveBeenCalledWith("extra_marcar", expect.objectContaining({ id: "e1", feita: false })));
  });

  it("a Dieta travou no meio: 'A sua dieta voltou a ser só para ver.', a folha fecha e a tela volta ao 'só ver'", async () => {
    liberar();
    h.gravar.mockImplementation(async () => {
      h.meuDia = meuDia({ liberada: false });
      throw new Error("dieta_travada");
    });
    montar("/dieta?ver=refeicao&r=cafe");
    await prontoLivre();
    const tirar = await achar('[data-folha-refeicao="cafe"] [data-item-tirar="i-ovo"]');
    fireEvent.click(tirar);
    await waitFor(() => expect(h.toastErro).toHaveBeenCalledWith("A sua dieta voltou a ser só para ver."));
    await waitFor(() => expect(document.querySelector("[data-dieta-livre]")).toBeNull());
    await waitFor(() => expect(screen.getByTestId("local").textContent).toBe("/dieta"));
    expect(document.querySelector("[data-aba-dieta]")!.getAttribute("data-dieta-dia-livre")).toBe("travada");
  });

  it("sem internet: os botões da dieta liberada ficam desligados (como o ✓ de hoje)", async () => {
    liberar();
    montar("/dieta?ver=refeicao&r=cafe");
    await prontoLivre();
    const tirar = await achar<HTMLButtonElement>('[data-folha-refeicao="cafe"] [data-item-tirar="i-ovo"]');
    expect(tirar.disabled).toBe(false);
    online(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    await waitFor(() => expect(tirar.disabled).toBe(true));
    expect((document.querySelector('[data-folha-refeicao="cafe"] [data-dieta-adicionar]') as HTMLButtonElement).disabled).toBe(true);
    expect((document.querySelector("[data-dieta-nova-refeicao]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("2 matrículas: a OUTRA liberada não libera a tela — vale a matrícula do plano ativo", async () => {
    h.meuDia = meuDia({ matriculas: [{ paciente_id: "pac-1", liberada: false }, { paciente_id: "pac-2", liberada: true }] });
    const primeira = montar();
    await pronto();
    await waitFor(() => expect(document.querySelector("[data-aba-dieta]")!.getAttribute("data-dieta-dia-livre")).toBe("travada"));
    expect(document.querySelector("[data-dieta-livre]")).toBeNull();
    primeira.unmount();
    // o inverso: a do plano ativo liberada e a outra travada → liberada
    h.meuDia = meuDia({ matriculas: [{ paciente_id: "pac-1", liberada: true }, { paciente_id: "pac-2", liberada: false }] });
    montar();
    await prontoLivre();
  });

  it("outro dia ou plano anterior: só para ver, mesmo liberada (a dieta liberada é do dia de hoje)", async () => {
    liberar();
    montar();
    await prontoLivre();
    fireEvent.click(screen.getByRole("button", { name: "Ver outro dia" }));
    fireEvent.click(await achar('[data-dia="2026-10-03"]'));
    await waitFor(() => expect(screen.getByText("Refeições de sábado · 03/10")).toBeInTheDocument());
    expect(document.querySelector("[data-dieta-livre]")).toBeNull();
    expect(document.querySelector("[data-aba-dieta]")!.getAttribute("data-dieta-dia-livre")).toBe("travada");
  });

  it("pratos prontos (o aluno do app sem profissional): a seção 'Rotinas de hoje' no fim também; o dia livre nem é lido", async () => {
    h.sessao = {
      usuario: { id: "u-app" },
      situacao: situacao({ modulos_aluno: ["treino", "nutricao"], matriculas: [matricula({ app: true, app_plano: "app_treino_alimentacao", objetivo_app: "emagrecer", modulos: ["treino", "nutricao"], nutricionista: null })] }),
    };
    h.pratos.mockResolvedValue({ ok: true, objetivo: "emagrecer", pratos: [] });
    montar();
    await waitFor(() => expect(document.querySelector('[data-aba-dieta="pratos"]')).not.toBeNull());
    await waitFor(() => expect(document.querySelector("[data-card-rotinas-dieta]")).not.toBeNull());
    expect(h.alunoDia).not.toContain("ler:dia");
  });
});
