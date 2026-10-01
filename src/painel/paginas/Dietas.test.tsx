import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const UID = "u-camila";
const h = vi.hoisted(() => ({
  conta: { id: "c1", nome: "Consultoria Ferreira", papeis: ["nutricionista"], modulos: ["treino", "nutricao"] } as { id: string; nome: string; papeis: string[]; modulos: string[] },
  master: false,
  dono: false,
  listarAlimentos: vi.fn(),
  excluirAlimento: vi.fn(),
  grupos: vi.fn(),
  atualizar: vi.fn(),
  criar: vi.fn(),
  receitas: vi.fn(),
  gruposReceita: vi.fn(),
  diario: vi.fn(),
  reagir: vi.fn(),
  urls: vi.fn(),
}));
vi.mock("@/nucleo/conta", () => ({ useConta: () => ({ conta: h.conta, ehMaster: h.master, ehDono: h.dono }) }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: { id: "u-camila" } }) }));
vi.mock("@/ui/casca/topo", () => ({
  TopoPagina: ({ titulo, subtitulo, acoes }: { titulo?: ReactNode; subtitulo?: ReactNode; acoes?: ReactNode }) => (
    <header><h1>{titulo}</h1><p data-testid="subtitulo">{subtitulo}</p>{acoes}</header>
  ),
}));
vi.mock("@/integrations/principal/client", () => ({ PRINCIPAL_SCHEMA: "staging", principal: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock("@/painel/dietas/alimentosPainel", async (orig) => ({
  ...(await orig<typeof import("@/painel/dietas/alimentosPainel")>()),
  listarAlimentosDoPainel: h.listarAlimentos,
  excluirAlimentoDoPainel: h.excluirAlimento,
}));
vi.mock("@/nutricao/editor/lib/alimentos", async (orig) => ({
  ...(await orig<typeof import("@/nutricao/editor/lib/alimentos")>()),
  listarGrupos: h.grupos,
  atualizarAlimento: h.atualizar,
  criarAlimento: h.criar,
}));
vi.mock("@/nutricao/editor/lib/receitas", async (orig) => ({
  ...(await orig<typeof import("@/nutricao/editor/lib/receitas")>()),
  listarReceitas: h.receitas,
  listarGrupos: h.gruposReceita,
  nomeDaNutricionista: async () => "Camila Rocha",
  dadosProfissionais: async () => null,
}));
vi.mock("@/painel/dietas/diario", async (orig) => ({
  ...(await orig<typeof import("@/painel/dietas/diario")>()),
  listarDiarioDaConta: h.diario,
  reagir: h.reagir,
  urlsAssinadas: h.urls,
}));

import Dietas from "./Dietas";

const alimento = (id: string, extra: Record<string, unknown> = {}) => ({
  id, nome: "Arroz, integral, cozido", grupo: "Cereais e derivados", fonte: "taco", marca: null, nutricionista_id: null, porcao_g: 100,
  energia_kcal: 124, proteina_g: 2.6, carboidrato_g: 25.8, lipidio_g: 1, fibra_g: 2.7, sodio_mg: 1, nutrientes: {}, deleted_at: null,
  created_at: "2026-09-20T10:00:00Z", updated_at: "2026-09-20T10:00:00Z", busca: "arroz integral cozido", medidas_caseiras: [], ...extra,
});
// o leite em pó de TESTE do rótulo: 127 kcal em 26 g → 488,46 kcal/100 g (H1)
const LEITE = alimento("a-leite", {
  nome: "Leite em pó teste", fonte: "proprio", marca: "Marca W24", nutricionista_id: UID, grupo: "Leite e derivados", porcao_g: 26,
  energia_kcal: 488.46, proteina_g: 26.92, carboidrato_g: 38.46, lipidio_g: 26.92, fibra_g: 0, sodio_mg: 296.15, nutrientes: { calcio_mg: 950 },
});
const DE_OUTRA = alimento("a-outra", { nome: "Granola da outra nutri", fonte: "proprio", nutricionista_id: "u-outra" });

/** espera o elemento aparecer (waitFor só repete quando o callback lança) */
const achar = (sel: string) => waitFor(() => {
  const el = document.querySelector(sel) as HTMLElement | null;
  expect(el).not.toBeNull();
  return el as HTMLElement;
});

function montar(rota = "/painel/dietas") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[rota]}>
        <Dietas />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.conta = { id: "c1", nome: "Consultoria Ferreira", papeis: ["nutricionista"], modulos: ["treino", "nutricao"] };
  h.master = false;
  h.dono = false;
  for (const f of [h.listarAlimentos, h.excluirAlimento, h.grupos, h.atualizar, h.criar, h.receitas, h.gruposReceita, h.diario, h.reagir, h.urls]) f.mockReset();
  h.listarAlimentos.mockResolvedValue({ itens: [alimento("a-taco"), LEITE, DE_OUTRA], total: 3 });
  h.grupos.mockResolvedValue([{ grupo: "Cereais e derivados", total: 64 }]);
  h.receitas.mockResolvedValue([]);
  h.gruposReceita.mockResolvedValue([]);
  h.diario.mockResolvedValue([]);
  h.urls.mockResolvedValue({});
});

describe("W24 — Painel › Dietas › Alimentos (N-16)", () => {
  it("TACO só leitura + os seus (Editar/Excluir só no seu, nunca no de outra pessoa); Ver mostra a porção de referência", async () => {
    montar();
    await achar("[data-lista-alimentos]");
    expect(h.listarAlimentos).toHaveBeenCalledWith({ q: "", grupo: "", fonte: "" }, UID, 0, 20);
    const linha = (id: string) => document.querySelector(`[data-alimento="${id}"]`) as HTMLElement;
    expect(within(linha("a-taco")).queryByText("Editar")).toBeNull();
    expect(within(linha("a-outra")).queryByText("Editar")).toBeNull();
    expect(within(linha("a-leite")).getByText("Editar")).toBeInTheDocument();
    expect(within(linha("a-leite")).getByText("MARCA W24")).toBeInTheDocument();
    fireEvent.click(within(linha("a-leite")).getByText("Ver"));
    expect(within(linha("a-leite")).getByText("Por porção de referência (26 g)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Novo alimento/ })).toBeInTheDocument();
  });

  it("H1: o Editar mostra o rótulo NA PORÇÃO (127 kcal em 26 g); salvar sem mexer grava o mesmo; mudar grava o equivalente em 100 g", async () => {
    h.atualizar.mockImplementation(async (id: string, reg: Record<string, unknown>) => ({ ...LEITE, ...reg, id }));
    montar();
    const linha = await achar('[data-alimento="a-leite"]');
    fireEvent.click(within(linha).getByText("Editar"));
    const kcal = (await achar("[data-campo-kcal]")) as HTMLInputElement;
    expect(kcal.value).toBe("127");
    expect((document.querySelector("[data-campo-proteina]") as HTMLInputElement).value).toBe("7");
    expect(document.querySelector("[data-legenda-valores]")?.textContent).toBe("Valores por porção (26 g)");
    expect(document.querySelector("[data-previa-100g]")?.getAttribute("data-previa-100g")).toBe("488.46");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(h.atualizar).toHaveBeenCalledTimes(1));
    expect(h.atualizar.mock.calls[0][1]).toMatchObject({ porcao_g: 26, energia_kcal: 488.46, proteina_g: 26.92, carboidrato_g: 38.46, lipidio_g: 26.92, sodio_mg: 296.15, nutrientes: { calcio_mg: 950 } });

    // de novo, agora mudando a kcal do rótulo: 130 kcal em 26 g → 500 kcal/100 g
    fireEvent.click(within(document.querySelector('[data-alimento="a-leite"]') as HTMLElement).getByText("Editar"));
    const kcal2 = (await achar("[data-campo-kcal]")) as HTMLInputElement;
    fireEvent.change(kcal2, { target: { value: "130" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(h.atualizar).toHaveBeenCalledTimes(2));
    expect(h.atualizar.mock.calls[1][1]).toMatchObject({ energia_kcal: 500, proteina_g: 26.92 });
  });

  it("quem não é nutricionista da conta (personal, dono sem papel de nutri) só consulta: sem Novo alimento e sem Editar", async () => {
    h.conta = { id: "c1", nome: "Consultoria Ferreira", papeis: ["dono", "personal"], modulos: ["treino", "nutricao"] };
    montar();
    await achar("[data-lista-alimentos]");
    expect(screen.queryByRole("button", { name: /Novo alimento/ })).toBeNull();
    expect(screen.queryByText("Editar")).toBeNull();
    expect(screen.getByText(/Só a nutricionista da conta cadastra alimentos/)).toBeInTheDocument();
  });
});

describe("W24 — Painel › Dietas › Receitas (N-17)", () => {
  it("só as SUAS receitas (o master lê as de todos no banco), com kcal por porção, favoritas primeiro", async () => {
    h.receitas.mockResolvedValue([
      { id: "r1", nutricionista_id: UID, nome: "Bolinho de atum", grupo_id: null, porcoes: 2, rendimento_g: null, tempo_preparo_min: 30, modo_preparo: "", observacao: "", favorita: true, deleted_at: null,
        ingredientes: [{ id: "i1", receita_id: "r1", alimento_id: "a1", quantidade_g: 200, medida_caseira_id: null, quantidade_medida: null, ordem: 0, observacao: "",
          alimento: { id: "a1", nome: "Atum", fonte: "taco", grupo: null, energia_kcal: 166, proteina_g: 26.2, carboidrato_g: 0, lipidio_g: 6, fibra_g: 0, sodio_mg: 362, medidas_caseiras: [] } }] },
      { id: "r2", nutricionista_id: "u-outra", nome: "Receita de outra nutri", grupo_id: null, porcoes: 1, rendimento_g: null, tempo_preparo_min: null, modo_preparo: "", observacao: "", favorita: false, deleted_at: null, ingredientes: [] },
    ]);
    montar("/painel/dietas?aba=receitas");
    const r1 = await achar('[data-receita="r1"]');
    expect(r1.getAttribute("data-receita-kcal-porcao")).toBe("166");
    expect(document.querySelector('[data-receita="r2"]')).toBeNull();
    expect(screen.getByText("1 receita · 1 favorita")).toBeInTheDocument();
    expect(within(r1).getByText("PDF")).toBeInTheDocument();
  });
});

describe("W24 — Painel › Dietas › Diário (N-18)", () => {
  const reg = (id: string, extra: Record<string, unknown> = {}) => ({
    id, nutricionista_id: UID, paciente_id: "p1", data_hora: new Date(2026, 9, 1, 12, 40).toISOString(), refeicao: "almoco", path: `${UID}/p1/${id}.jpg`, mime: "image/jpeg",
    tamanho: 1000, comentario: "Frango e salada", reacao_nutri: null, comentario_nutri: "", reagido_em: null, created_at: "2026-10-01T15:40:00Z", updated_at: "2026-10-01T15:40:00Z",
    deleted_at: null, paciente: { id: "p1", nome: "Rafael Moura", apelido: null, link_codigo: "abc1234567", foto_url: null, conta_id: "c1", nutricionista_id: UID }, ...extra,
  });

  it("nutricionista: as fotos da conta ativa por dia; reagir grava (Ótimo + comentário) e o número da aba conta as não reagidas", async () => {
    h.diario.mockResolvedValue([reg("d1"), reg("d2", { refeicao: "jantar", data_hora: new Date(2026, 9, 1, 20, 5).toISOString(), reacao_nutri: "bom", reagido_em: "2026-10-01T23:10:00Z" })]);
    h.reagir.mockResolvedValue({});
    montar("/painel/dietas?aba=diario");
    const d1 = await achar('[data-registro="d1"]');
    expect(h.diario).toHaveBeenCalledWith("c1", UID, expect.any(String));
    expect(within(d1).getByText("Almoço · 12:40")).toBeInTheDocument();
    expect(document.querySelector("[data-contador-nao-reagidas]")?.textContent).toBe("1");
    fireEvent.click(within(d1).getByRole("button", { name: "Ótimo" }));
    fireEvent.change(within(d1).getByPlaceholderText(/Comentário para o aluno/), { target: { value: "Boa escolha!" } });
    fireEvent.click(within(d1).getByRole("button", { name: /Enviar reação/ }));
    await waitFor(() => expect(h.reagir).toHaveBeenCalledWith("d1", "otimo", "Boa escolha!"));
    expect(within(document.querySelector('[data-registro="d2"]') as HTMLElement).getByText("BOM")).toBeInTheDocument();
  });

  it("personal (ou dono sem papel de nutricionista) não lê o diário — nem consulta", async () => {
    h.conta = { id: "c1", nome: "Consultoria Ferreira", papeis: ["personal"], modulos: ["treino", "nutricao"] };
    montar("/painel/dietas?aba=diario");
    expect(await screen.findByText("O diário alimentar é da nutricionista")).toBeInTheDocument();
    expect(h.diario).not.toHaveBeenCalled();
  });
});
