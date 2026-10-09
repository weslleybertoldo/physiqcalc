import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
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
  nomesParaCopia: vi.fn(),
  duplicar: vi.fn(),
  diario: vi.fn(),
  diarioPagina: vi.fn(),
  alunosDiario: vi.fn(),
  contarDiario: vi.fn(),
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
  listarReceitasPagina: h.receitas,
  listarGrupos: h.gruposReceita,
  nomesParaCopia: h.nomesParaCopia,
  duplicarReceita: h.duplicar,
  nomeDaNutricionista: async () => "Camila Rocha",
  dadosProfissionais: async () => null,
}));
vi.mock("@/painel/dietas/diario", async (orig) => ({
  ...(await orig<typeof import("@/painel/dietas/diario")>()),
  listarDiarioDaConta: h.diario,
  listarDiarioPaginaComDias: h.diarioPagina,
  listarAlunosDoDiario: h.alunosDiario,
  contarDiario: h.contarDiario,
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

/** o endereço atual (a página da lista mora no ?pagina=) */
function Endereco() {
  return <output data-endereco={useLocation().search} />;
}
const endereco = () => document.querySelector("[data-endereco]")?.getAttribute("data-endereco") ?? "";

function montar(rota = "/painel/dietas") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[rota]}>
        <Dietas />
        <Endereco />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.conta = { id: "c1", nome: "Consultoria Ferreira", papeis: ["nutricionista"], modulos: ["treino", "nutricao"] };
  h.master = false;
  h.dono = false;
  for (const f of [h.listarAlimentos, h.excluirAlimento, h.grupos, h.atualizar, h.criar, h.receitas, h.gruposReceita, h.nomesParaCopia, h.duplicar, h.diario,
    h.diarioPagina, h.alunosDiario, h.contarDiario, h.reagir, h.urls]) f.mockReset();
  h.listarAlimentos.mockResolvedValue({ itens: [alimento("a-taco"), LEITE, DE_OUTRA], total: 3 });
  h.grupos.mockResolvedValue([{ grupo: "Cereais e derivados", total: 64 }]);
  h.receitas.mockResolvedValue({ itens: [], total: 0, totalGeral: 0, favoritas: 0, porGrupo: {} });
  h.gruposReceita.mockResolvedValue([]);
  h.diario.mockResolvedValue([]);
  h.diarioPagina.mockResolvedValue({ itens: [], total: 0, porDia: {} });
  h.alunosDiario.mockResolvedValue([]);
  h.contarDiario.mockResolvedValue(0);
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
  }, 15_000); // 2 aberturas do Editar: com o notebook carregado passa de 5 s

  it("hml-14b (P1): páginas numeradas no lugar do \"Ver mais\" — \"1–20 de 597\", Próxima pede a 2 (no endereço); filtro volta à 1", async () => {
    const vinte = Array.from({ length: 20 }, (_, i) => alimento(`a${i}`, { nome: `Alimento ${i}` }));
    h.listarAlimentos.mockImplementation(async () => ({ itens: vinte, total: 597 }));
    montar();
    const pag = await achar('[data-paginacao="alimentos"]');
    expect(pag.querySelector("[data-paginacao-rotulo]")?.textContent).toBe("1–20 de 597");
    expect(document.querySelectorAll('[data-lista="alimentos"] [data-item]').length).toBe(20);
    expect(document.querySelector("[data-ver-mais]")).toBeNull();
    fireEvent.click(pag.querySelector("[data-pagina-proxima]")!);
    await waitFor(() => expect(h.listarAlimentos).toHaveBeenLastCalledWith({ q: "", grupo: "", fonte: "" }, UID, 20, 20), { timeout: 4000 });
    expect(endereco()).toContain("pagina=2");
    fireEvent.change(document.querySelector("[data-filtro-fonte]")!, { target: { value: "proprio" } });
    await waitFor(() => expect(h.listarAlimentos).toHaveBeenLastCalledWith({ q: "", grupo: "", fonte: "proprio" }, UID, 0, 20), { timeout: 4000 });
    expect(endereco()).not.toContain("pagina=");
  }, 15_000);

  it("hml-14b: erro do banco = o estado de erro (nunca a lista vazia)", async () => {
    h.listarAlimentos.mockRejectedValue(new Error("canceling statement due to statement timeout"));
    montar();
    expect(await screen.findByText(/Não foi possível carregar os alimentos: canceling statement/)).toBeInTheDocument();
    expect(screen.queryByText("Nenhum alimento por aqui")).toBeNull();
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
  const BOLINHO = {
    id: "r1", nutricionista_id: UID, nome: "Bolinho de atum", grupo_id: null, porcoes: 2, rendimento_g: null, tempo_preparo_min: 30, modo_preparo: "", observacao: "", favorita: true, deleted_at: null,
    ingredientes: [{ id: "i1", receita_id: "r1", alimento_id: "a1", quantidade_g: 200, medida_caseira_id: null, quantidade_medida: null, ordem: 0, observacao: "",
      alimento: { id: "a1", nome: "Atum", fonte: "taco", grupo: null, energia_kcal: 166, proteina_g: 26.2, carboidrato_g: 0, lipidio_g: 6, fibra_g: 0, sodio_mg: 362, medidas_caseiras: [] } }],
  };
  const receita = (id: string, extra: Record<string, unknown> = {}) => ({ ...BOLINHO, id, nome: `Receita ${id}`, favorita: false, ingredientes: [], ...extra });

  it("só as SUAS receitas (o banco separa as dela antes de cortar), com kcal por porção e os números do banco", async () => {
    h.receitas.mockResolvedValue({ itens: [BOLINHO], total: 1, totalGeral: 1, favoritas: 1, porGrupo: {} });
    montar("/painel/dietas?aba=receitas");
    const r1 = await achar('[data-receita="r1"]');
    expect(h.receitas).toHaveBeenCalledWith({ q: "", grupo: "", favoritas: false }, 1);
    expect(h.gruposReceita).toHaveBeenCalledWith(UID);
    expect(r1.getAttribute("data-receita-kcal-porcao")).toBe("166");
    expect(screen.getByText("1 receita · 1 favorita")).toBeInTheDocument();
    expect(within(r1).getByText("PDF")).toBeInTheDocument();
  });

  it("hml-14b: 20 por página do banco — \"1–20 de 41\", Próxima pede a 2; Favoritas vai ao banco e volta à 1", async () => {
    const vinte = Array.from({ length: 20 }, (_, i) => receita(`r${i}`));
    h.receitas.mockImplementation(async () => ({ itens: vinte, total: 41, totalGeral: 41, favoritas: 0, porGrupo: {} }));
    montar("/painel/dietas?aba=receitas");
    const pag = await achar('[data-paginacao="receitas"]');
    expect(pag.querySelector("[data-paginacao-rotulo]")?.textContent).toBe("1–20 de 41");
    expect(document.querySelectorAll('[data-lista="receitas"] [data-item]').length).toBe(20);
    fireEvent.click(pag.querySelector("[data-pagina-proxima]")!);
    await waitFor(() => expect(h.receitas).toHaveBeenLastCalledWith({ q: "", grupo: "", favoritas: false }, 2), { timeout: 4000 });
    expect(endereco()).toContain("pagina=2");
    fireEvent.click(document.querySelector("[data-btn-filtro-favoritas]")!);
    await waitFor(() => expect(h.receitas).toHaveBeenLastCalledWith({ q: "", grupo: "", favoritas: true }, 1), { timeout: 4000 });
    expect(endereco()).not.toContain("pagina=");
  }, 15_000);

  it("hml-14b: os números dos grupos vêm do banco e o Duplicar escolhe o \"(cópia N)\" entre todas as suas", async () => {
    h.receitas.mockResolvedValue({ itens: [BOLINHO], total: 1, totalGeral: 9, favoritas: 1, porGrupo: { g1: 7 } });
    h.gruposReceita.mockResolvedValue([{ id: "g1", nutricionista_id: UID, nome: "Lanches", ordem: 0, created_at: "", updated_at: "", deleted_at: null }]);
    h.nomesParaCopia.mockResolvedValue(["Bolinho de atum", "Bolinho de atum (cópia)"]);
    h.duplicar.mockResolvedValue({ ...BOLINHO, id: "r9", nome: "Bolinho de atum (cópia 2)" });
    montar("/painel/dietas?aba=receitas");
    const r1 = await achar('[data-receita="r1"]');
    fireEvent.click(within(r1).getByText("Duplicar"));
    await waitFor(() => expect(h.duplicar).toHaveBeenCalledWith(expect.objectContaining({ id: "r1" }), "Bolinho de atum (cópia 2)"), { timeout: 4000 });
    expect(h.nomesParaCopia).toHaveBeenCalledWith(UID, "Bolinho de atum");
    fireEvent.click(screen.getByRole("button", { name: /Grupos \(1\)/ }));
    const g1 = await achar('[data-grupo="g1"]');
    expect(g1.getAttribute("data-grupo-receitas")).toBe("7");
  }, 15_000);

  it("hml-14b: erro do banco = o estado de erro (nunca \"Nenhuma receita\")", async () => {
    h.receitas.mockRejectedValue(new Error("canceling statement due to statement timeout"));
    montar("/painel/dietas?aba=receitas");
    expect(await screen.findByText(/Não foi possível carregar as receitas: canceling statement/)).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma receita culinária")).toBeNull();
  });
});

describe("W24 — Painel › Dietas › Diário (N-18)", () => {
  const reg = (id: string, extra: Record<string, unknown> = {}) => ({
    id, nutricionista_id: UID, paciente_id: "p1", data_hora: new Date(2026, 9, 1, 12, 40).toISOString(), refeicao: "almoco", path: `${UID}/p1/${id}.jpg`, mime: "image/jpeg",
    tamanho: 1000, comentario: "Frango e salada", reacao_nutri: null, comentario_nutri: "", reagido_em: null, created_at: "2026-10-01T15:40:00Z", updated_at: "2026-10-01T15:40:00Z",
    deleted_at: null, paciente: { id: "p1", nome: "Rafael Moura", apelido: null, link_codigo: "abc1234567", foto_url: null, conta_id: "c1", nutricionista_id: UID }, ...extra,
  });

  const RAFAEL = { id: "p1", nome: "Rafael Moura", apelido: null, link_codigo: "abc1234567", foto_url: null };

  it("nutricionista: as fotos da conta ativa por dia; reagir grava (Ótimo + comentário) e o número da aba conta as não reagidas", async () => {
    const registros = [reg("d1"), reg("d2", { refeicao: "jantar", data_hora: new Date(2026, 9, 1, 20, 5).toISOString(), reacao_nutri: "bom", reagido_em: "2026-10-01T23:10:00Z" })];
    h.diario.mockResolvedValue(registros); // o número da aba (Dietas): os 7 dias, como antes
    h.diarioPagina.mockResolvedValue({ itens: registros, total: 2, porDia: {} });
    h.alunosDiario.mockResolvedValue([RAFAEL]);
    h.contarDiario.mockResolvedValue(1);
    h.reagir.mockResolvedValue({});
    montar("/painel/dietas?aba=diario");
    const d1 = await achar('[data-registro="d1"]');
    expect(h.diarioPagina).toHaveBeenCalledWith("c1", UID, { deIso: expect.any(String), alunoId: "", soNaoReagidas: false }, 1);
    expect(h.contarDiario).toHaveBeenCalledWith("c1", UID, { deIso: expect.any(String), alunoId: "", soNaoReagidas: true });
    expect(within(d1).getByText("Almoço · 12:40")).toBeInTheDocument();
    expect(document.querySelector("[data-contador-nao-reagidas]")?.textContent).toBe("1");
    await waitFor(() => expect(document.querySelector("[data-btn-nao-reagidas]")?.getAttribute("data-badge-nao-reagidas")).toBe("1"));
    expect(document.querySelector("[data-contagem-diario]")?.textContent).toBe("últimos 7 dias · 2 registros · 1 não reagida");
    fireEvent.click(within(d1).getByRole("button", { name: "Ótimo" }));
    fireEvent.change(within(d1).getByPlaceholderText(/Comentário para o aluno/), { target: { value: "Boa escolha!" } });
    fireEvent.click(within(d1).getByRole("button", { name: /Enviar reação/ }));
    await waitFor(() => expect(h.reagir).toHaveBeenCalledWith("d1", "otimo", "Boa escolha!"));
    expect(within(document.querySelector('[data-registro="d2"]') as HTMLElement).getByText("BOM")).toBeInTheDocument();
  });

  it("hml-14b: 20 por página do banco; o dia partido pela página diz o total do dia (do banco), não só o que coube", async () => {
    const vinte = Array.from({ length: 20 }, (_, i) => reg(`d${i}`, { data_hora: new Date(2026, 9, 1, 20, 59 - i).toISOString() }));
    h.diarioPagina.mockResolvedValue({ itens: vinte, total: 41, porDia: { "01/10/2026": 25 } });
    h.alunosDiario.mockResolvedValue([RAFAEL]);
    montar("/painel/dietas?aba=diario");
    const pag = await achar('[data-paginacao="diario"]');
    expect(pag.querySelector("[data-paginacao-rotulo]")?.textContent).toBe("1–20 de 41");
    expect(document.querySelectorAll('[data-lista="diario"] [data-item]').length).toBe(20);
    const dia = document.querySelector('[data-dia="01/10/2026"]') as HTMLElement;
    expect(dia.getAttribute("data-dia-total")).toBe("25");
    expect(within(dia).getByText(/25 registros$/)).toBeInTheDocument();
    fireEvent.click(pag.querySelector("[data-pagina-proxima]")!);
    await waitFor(() => expect(h.diarioPagina).toHaveBeenLastCalledWith("c1", UID, expect.objectContaining({ alunoId: "" }), 2), { timeout: 4000 });
    expect(endereco()).toContain("pagina=2");
  }, 15_000);

  it("hml-14b: o filtro de aluno oferece quem tem foto no período (do banco, não da página) e escolher volta à 1", async () => {
    const ZE = { id: "p9", nome: "Zé Último", apelido: null, link_codigo: "zzz9999999", foto_url: null };
    h.diarioPagina.mockResolvedValue({ itens: [reg("d1")], total: 41, porDia: {} });
    h.alunosDiario.mockResolvedValue([RAFAEL, ZE]);
    montar("/painel/dietas?aba=diario&pagina=2");
    await achar('[data-registro="d1"]');
    expect(h.alunosDiario).toHaveBeenCalledWith("c1", UID, expect.any(String));
    await waitFor(() => expect([...document.querySelectorAll("[data-campo-aluno] option")].map((o) => o.textContent)).toEqual(["Todos os alunos", "Rafael Moura", "Zé Último"]), { timeout: 4000 });
    fireEvent.change(document.querySelector("[data-campo-aluno]")!, { target: { value: "p9" } });
    await waitFor(() => expect(h.diarioPagina).toHaveBeenLastCalledWith("c1", UID, expect.objectContaining({ alunoId: "p9" }), 1), { timeout: 4000 });
    expect(endereco()).not.toContain("pagina=");
    expect(endereco()).toContain("aluno=p9");
  }, 15_000);

  it("hml-14b: erro do banco = o estado de erro (nunca \"Nenhuma foto\")", async () => {
    h.diarioPagina.mockRejectedValue(new Error("canceling statement due to statement timeout"));
    montar("/painel/dietas?aba=diario");
    expect(await screen.findByText(/Não foi possível carregar o diário: canceling statement/)).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma foto no diário")).toBeNull();
  });

  it("personal (ou dono sem papel de nutricionista) não lê o diário — nem consulta", async () => {
    h.conta = { id: "c1", nome: "Consultoria Ferreira", papeis: ["personal"], modulos: ["treino", "nutricao"] };
    montar("/painel/dietas?aba=diario");
    expect(await screen.findByText("O diário alimentar é da nutricionista")).toBeInTheDocument();
    expect(h.diario).not.toHaveBeenCalled();
    for (const f of [h.diarioPagina, h.alunosDiario, h.contarDiario]) expect(f).not.toHaveBeenCalled();
  });
});
