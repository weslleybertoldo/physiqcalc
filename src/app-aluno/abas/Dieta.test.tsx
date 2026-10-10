import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { matricula, situacao } from "@/test/fixturesNucleo";
import type { DadosDieta, ItemDaRefeicao, PlanoAlimentar, RefeicaoDoPlano } from "@/nutricao/app/tipos";

const h = vi.hoisted(() => ({
  sessao: {} as Record<string, unknown>,
  dados: {} as Record<string, unknown>,
  chamadas: [] as string[],
  marcar: vi.fn(),
  meta: vi.fn(),
  pratos: vi.fn(),
}));

vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));
vi.mock("@/integrations/principal/client", () => ({ principalConfigurado: true, principal: {} }));
vi.mock("@/nutricao/app/pacienteApp", () => ({
  minhaDieta: async (dia: string) => {
    h.chamadas.push(dia);
    if (navigator.onLine === false) throw new Error("sem_internet");
    const d = (h.dados[dia] ?? h.dados.padrao) as DadosDieta;
    return { ...d, dia };
  },
  marcarRefeicao: (...a: unknown[]) => h.marcar(...a),
  marcarMeta: (...a: unknown[]) => h.meta(...a),
  urlsDoDiario: async (regs: { id: string }[]) => Object.fromEntries(regs.map((r) => [r.id, `https://fotos/${r.id}.jpg`])),
  enviarFotoDiario: vi.fn(),
}));
vi.mock("@/app-aluno/sozinho/api", () => ({
  buscarPratos: (...a: unknown[]) => h.pratos(...a),
  ErroApp: class extends Error {},
}));

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

function Local() {
  const l = useLocation();
  return <span data-testid="local">{l.pathname + l.search}</span>;
}
function montar(rota = "/dieta") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter useTransitions={false} initialEntries={[rota]}>
        <Routes>
          <Route path="/dieta" element={<><Dieta /><Local /></>} />
        </Routes>
      </MemoryRouter>
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
    h.marcar.mockReset().mockRejectedValue(new Error("sem_alimentos"));
    montar();
    await pronto();
    fireEvent.click(screen.getByRole("button", { name: "Marcar Almoço como feita" }));
    await waitFor(() => expect(h.marcar).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector('[data-refeicao="almoco"]')!.getAttribute("data-refeicao-estado")).toBe("agora"));
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
