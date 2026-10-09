import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation, useSearchParams } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  criarAnamnese: vi.fn(),
  criarAplicacao: vi.fn(),
  marcarImportada: vi.fn(),
  ligarAluno: vi.fn(),
  respostasPagina: vi.fn(),
}));
vi.mock("@/integrations/principal/client", () => ({ principal: {}, PRINCIPAL_SCHEMA: "public" }));
vi.mock("./dados", async (original) => ({
  ...(await original<typeof import("./dados")>()),
  criarAnamnese: h.criarAnamnese,
  criarAplicacao: h.criarAplicacao,
  marcarImportada: h.marcarImportada,
  ligarAluno: h.ligarAluno,
  listarRespostasPagina: h.respostasPagina,
}));

import type { FormularioPreconsulta, RespostaComFormulario, RespostaDaLista } from "./dados";
import FormularioDialog from "./FormularioDialog";
import Formularios from "./Formularios";
import { origemDoLink } from "./link";
import Respostas from "./Respostas";
import type { ContextoPreConsulta, DadosPreConsulta } from "./usePreConsulta";

const QUANDO = "2026-09-30T15:30:00.000+00:00";
const form = (p: Partial<FormularioPreconsulta>): FormularioPreconsulta => ({
  id: "f1", nutricionista_id: "u-personal", conta_id: "c1", titulo: "Pré-consulta do treino", descricao: "", origem: "personalizado", origem_id: null,
  perguntas: [{ id: "p1", texto: "Treina?", tipo: "sim_nao", max: 4, pontos_sim: 1, opcoes: [] }], faixas: [], slug: "abcd2345", ativo: true,
  created_at: QUANDO, updated_at: QUANDO, deleted_at: null, ...p,
});
const resp = (p: Partial<RespostaComFormulario>): RespostaComFormulario => ({
  id: "r1", nutricionista_id: "u-personal", conta_id: "c1", formulario_id: "f1", titulo: "Pré-consulta do treino",
  perguntas: [{ id: "p1", texto: "Treina?", tipo: "sim_nao", max: 4, pontos_sim: 1, opcoes: [] }], faixas: [], respostas: { p1: true }, pontuacao: 1, faixa: "", nivel: "",
  nome: "Ana Lima", email: "ana.teste@x.com", telefone: "", paciente_id: null, respondido_em: QUANDO, created_at: QUANDO, updated_at: QUANDO, deleted_at: null,
  importada_em: null, importada_tipo: null, importada_id: null,
  formulario: { id: "f1", titulo: "Pré-consulta do treino", origem: "personalizado", origem_id: null, slug: "abcd2345", ativo: true, deleted_at: null }, ...p,
} as RespostaComFormulario);

function contexto(p: Partial<ContextoPreConsulta>): ContextoPreConsulta {
  return {
    uid: "u-personal", contaId: "c1", conta: { id: "c1", nome: "Rafael Lima", profissionais: 1 }, dono: false, souNutri: false, papeis: ["personal"], modulos: ["treino"],
    pessoas: new Map([["u-personal", { nome: "Rafael Lima", papeis: ["dono", "personal"] }], ["u-nutri", { nome: "Camila Rocha", papeis: ["nutricionista"] }]]), pronto: true, ...p,
  } as unknown as ContextoPreConsulta;
}
function dados(p: { formularios?: FormularioPreconsulta[]; respostas?: RespostaComFormulario[] }): DadosPreConsulta {
  const q = (data: unknown) => ({ data, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() });
  return {
    formulariosQ: q(p.formularios ?? []), respostasQ: q(p.respostas ?? []),
    formularios: p.formularios ?? [], respostas: p.respostas ?? [], modelos: [], questionarios: [], recarregar: vi.fn(async () => {}),
  } as unknown as DadosPreConsulta;
}
function montar(el: React.ReactNode, rota = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[rota]}>{el}</MemoryRouter></QueryClientProvider>);
}
/** A aba Respostas como na página: os parâmetros são os do endereço (a página da lista também mora lá). */
function RespostasNaRota({ ctx, d }: { ctx: ContextoPreConsulta; d: DadosPreConsulta }) {
  const [sp, setSp] = useSearchParams();
  const local = useLocation();
  return (
    <>
      <Respostas ctx={ctx} d={d} params={sp} setParams={setSp} />
      <output data-endereco={local.search} />
    </>
  );
}
const endereco = () => document.querySelector("[data-endereco]")?.getAttribute("data-endereco") ?? "";
/** A resposta como a respostas_da_conta devolve: com o aluno ligado embutido (só o da conta, fora da lixeira). */
const daLista = (p: Partial<RespostaDaLista>): RespostaDaLista => ({ aluno: null, ...resp(p), ...p }) as RespostaDaLista;
/** A página do banco (por padrão, só estas e sem filtro). */
const paginaDe = (itens: RespostaDaLista[], extra: Record<string, unknown> = {}) => ({
  itens, total: itens.length, totalConta: itens.length, novas: itens.filter((r) => !r.paciente_id).length, titulos: ["Pré-consulta do treino"], alunoFiltro: null, ...extra,
});
/** espera o elemento aparecer (waitFor só repete quando o callback lança) */
const achar = (sel: string) => waitFor(() => {
  const el = document.querySelector(sel) as HTMLElement | null;
  expect(el).not.toBeNull();
  return el as HTMLElement;
});

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
});

describe("W21 — Pré-consulta › Formulários", () => {
  it("o dono vê os da equipe com o autor, as respostas (e novas) de cada um e o link público no site do ambiente", async () => {
    const d = dados({
      formularios: [form({}), form({ id: "f2", titulo: "Pré-anamnese", origem: "anamnese", nutricionista_id: "u-nutri", slug: "bcdefghj", ativo: false })],
      respostas: [resp({}), resp({ id: "r2", paciente_id: "a1" })],
    });
    montar(<Formularios ctx={contexto({ dono: true })} d={d} aoNovo={vi.fn()} aoEditar={vi.fn()} aoVerRespostas={vi.fn()} />);
    const linha = document.querySelector('[data-formulario="f1"]')!;
    expect(linha.getAttribute("data-formulario-respostas")).toBe("2");
    expect(linha.getAttribute("data-formulario-novas")).toBe("1");
    expect(linha.querySelector("[data-formulario-chip-novas]")?.textContent).toBe("1 NOVA");
    expect(document.querySelector('[data-formulario="f2"] [data-formulario-autor]')?.textContent).toContain("Camila Rocha");
    expect(document.querySelector('[data-formulario="f2"] [data-formulario-situacao]')?.textContent).toBe("INATIVO");
    // o dono sem papel de nutri não lê as respostas do formulário da nutricionista (W18): no lugar da contagem, o aviso
    expect(document.querySelector('[data-formulario="f2"] [data-respostas-com-a-nutri]')?.textContent).toContain("Com a nutricionista");
    expect(document.querySelector('[data-formulario="f1"] [data-respostas-com-a-nutri]')).toBeNull();
    expect([...document.querySelectorAll("[data-grupo-rotulo]")].map((g) => g.textContent)).toEqual(["Pré-anamnese", "Personalizados"]);
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } });
    fireEvent.click(linha.querySelector("[data-btn-copiar-link]")!);
    await waitFor(() => expect(document.querySelector("[data-link-publico]")).not.toBeNull());
    expect(document.querySelector("[data-link-publico]")?.getAttribute("data-link-publico")).toBe(`${origemDoLink()}/f/abcd2345`);
  });

  it("vazio: o texto do personal fala de formulário em branco", () => {
    montar(<Formularios ctx={contexto({})} d={dados({})} aoNovo={vi.fn()} aoEditar={vi.fn()} aoVerRespostas={vi.fn()} />);
    expect(screen.getByText("Nenhum formulário de pré-consulta")).toBeInTheDocument();
    expect(screen.getByText(/formulário em branco/)).toBeInTheDocument();
  });

  it("novo formulário: o personal vai direto ao em branco; a nutricionista escolhe a origem (anamnese, questionário ou em branco)", () => {
    const props = { onOpenChange: vi.fn(), uid: "u", contaId: "c1", modelos: [], questionarios: [], onSalvo: vi.fn() };
    const r = montar(<FormularioDialog open souNutri={false} {...props} />);
    expect(document.querySelector("[data-modal-formulario]")?.getAttribute("data-etapa-formulario")).toBe("dados");
    expect(document.querySelector('[data-form-origem="personalizado"]')).not.toBeNull();
    expect(document.querySelector("[data-btn-voltar-origem]")).toBeNull();
    r.unmount();
    montar(<FormularioDialog open souNutri {...props} />);
    expect(document.querySelector("[data-modal-formulario]")?.getAttribute("data-etapa-formulario")).toBe("origem");
    expect([...document.querySelectorAll("[data-origem]")].map((b) => b.getAttribute("data-origem"))).toEqual(["anamnese", "questionario", "personalizado"]);
  });
});

describe("W21 — Pré-consulta › Respostas", () => {
  const ROTA = "/painel/pre-consulta?aba=respostas";
  const RAFAEL = { id: "a1", nome: "Rafael Moura", nutricionista_id: null };

  it("personal: liga a um aluno e NÃO vê Importar (a anamnese é da nutricionista)", async () => {
    h.respostasPagina.mockResolvedValue(paginaDe([daLista({}), daLista({ id: "r2", paciente_id: "a1", aluno: RAFAEL })]));
    montar(<RespostasNaRota ctx={contexto({})} d={dados({})} />, ROTA);
    await achar('[data-resposta="r1"]');
    expect(h.respostasPagina).toHaveBeenCalledWith("c1", { formulario: "", busca: "", soNovas: false, aluno: "" }, 1);
    expect(document.querySelector('[data-resposta="r1"]')?.getAttribute("data-resposta-nova")).toBe("1");
    expect(document.querySelector('[data-resposta="r1"] [data-resposta-chip-nova]')).not.toBeNull();
    expect(document.querySelector('[data-resposta="r2"] [data-resposta-aluno-nome]')?.getAttribute("data-resposta-aluno-nome")).toBe("Rafael Moura");
    expect(document.querySelectorAll("[data-btn-ligar-resposta]").length).toBe(2);
    expect(document.querySelector("[data-btn-importar-resposta]")).toBeNull();
    expect(document.querySelector("[data-cartao-respostas]")?.getAttribute("data-novas")).toBe("1");
  });

  it("hml-14b: o filtro ?aluno= e o ?sem=1 (novas) vão ao banco; o chip mostra o aluno que o banco achou", async () => {
    h.respostasPagina.mockResolvedValue(paginaDe([daLista({ id: "r2", paciente_id: "a1", aluno: RAFAEL })], { totalConta: 2, alunoFiltro: { id: "a1", nome: "Rafael Moura" } }));
    const r = montar(<RespostasNaRota ctx={contexto({})} d={dados({})} />, `${ROTA}&aluno=a1`);
    await achar('[data-resposta="r2"]');
    expect(h.respostasPagina).toHaveBeenLastCalledWith("c1", expect.objectContaining({ aluno: "a1", soNovas: false }), 1);
    expect(document.querySelector("[data-filtro-aluno]")?.textContent).toContain("Rafael Moura");
    expect(screen.getByText("2 respostas · 1 no filtro")).toBeInTheDocument();
    r.unmount();
    h.respostasPagina.mockResolvedValue(paginaDe([daLista({})], { totalConta: 2 }));
    montar(<RespostasNaRota ctx={contexto({})} d={dados({})} />, `${ROTA}&sem=1`);
    await achar('[data-resposta="r1"]');
    expect(h.respostasPagina).toHaveBeenLastCalledWith("c1", expect.objectContaining({ soNovas: true, aluno: "" }), 1);
  }, 15_000);

  it("nutricionista: Importar com o motivo quando não dá; importa a pré-anamnese para a anamnese do aluno dela", async () => {
    const nutri = contexto({ uid: "u-nutri", souNutri: true, papeis: ["nutricionista"], modulos: ["nutricao"] });
    const formA = { id: "f2", titulo: "Pré-anamnese", origem: "anamnese", origem_id: "m1", slug: "bcdefghj", ativo: true, deleted_at: null };
    h.respostasPagina.mockResolvedValue(paginaDe([
      daLista({ id: "r1", nutricionista_id: "u-nutri", formulario: formA }),
      daLista({ id: "r2", nutricionista_id: "u-nutri", paciente_id: "a2", formulario: formA, aluno: { id: "a2", nome: "Marina Alves", nutricionista_id: "u-nutri" } }),
      daLista({ id: "r3", nutricionista_id: "u-nutri", paciente_id: "a3", formulario: formA, aluno: { id: "a3", nome: "Carlos Souza", nutricionista_id: "u-outra" } }),
    ]));
    const d = dados({});
    h.criarAnamnese.mockResolvedValue({ id: "an1" });
    h.marcarImportada.mockResolvedValue(resp({ id: "r2", paciente_id: "a2", importada_em: QUANDO, importada_tipo: "anamnese", importada_id: "an1" }));
    montar(<RespostasNaRota ctx={nutri} d={d} />, ROTA);
    await achar('[data-resposta="r2"]');
    const botao = (id: string) => document.querySelector(`[data-resposta="${id}"] [data-btn-importar-resposta]`) as HTMLButtonElement;
    expect(botao("r1").disabled).toBe(true);
    expect(botao("r1").getAttribute("data-motivo-sem-importar")).toMatch(/Ligue a resposta/);
    expect(botao("r3").disabled).toBe(true);
    expect(botao("r3").getAttribute("data-motivo-sem-importar")).toMatch(/responsável/);
    expect(botao("r2").disabled).toBe(false);
    fireEvent.click(botao("r2"));
    expect(await screen.findByText(/vai virar uma anamnese no prontuário de Marina Alves/)).toBeInTheDocument();
    fireEvent.click(document.querySelector("[data-btn-confirmar-importar]")!);
    await waitFor(() => expect(h.marcarImportada).toHaveBeenCalledWith("r2", "anamnese", "an1"));
    expect(h.criarAnamnese).toHaveBeenCalledWith("u-nutri", "a2", null, expect.objectContaining({ titulo: "Pré-consulta do treino" }));
    expect(h.criarAplicacao).not.toHaveBeenCalled();
    expect(d.recarregar).toHaveBeenCalledWith("respostas");
  });

  it("hml-14b: 20 por página do banco — \"1–20 de 41\", Próxima pede a 2 (no endereço) e a busca nova volta à 1", async () => {
    const vinte = Array.from({ length: 20 }, (_, i) => daLista({ id: `r${i + 1}`, nome: `Pessoa ${i + 1}` }));
    h.respostasPagina.mockImplementation(async (_conta: string, _f: unknown, pagina: number) =>
      paginaDe(pagina === 3 ? [daLista({ id: "r41", nome: "Zé Último" })] : vinte, { total: 41, totalConta: 41, novas: 41 }));
    montar(<RespostasNaRota ctx={contexto({})} d={dados({})} />, ROTA);
    const pag = await achar('[data-paginacao="respostas"]');
    expect(pag.querySelector("[data-paginacao-rotulo]")?.textContent).toBe("1–20 de 41");
    expect(document.querySelectorAll('[data-lista="respostas"] [data-item]').length).toBe(20);
    fireEvent.click(pag.querySelector("[data-pagina-proxima]")!);
    await waitFor(() => expect(h.respostasPagina).toHaveBeenLastCalledWith("c1", expect.anything(), 2), { timeout: 4000 });
    expect(endereco()).toContain("pagina=2");
    fireEvent.change(document.querySelector("[data-busca-respostas]")!, { target: { value: "zé" } });
    await waitFor(() => expect(h.respostasPagina).toHaveBeenLastCalledWith("c1", expect.objectContaining({ busca: "zé" }), 1), { timeout: 4000 });
    expect(endereco()).not.toContain("pagina=");
  }, 15_000);

  it("hml-14b: o endereço com ?pagina=3 abre a 3 (abrir um aluno e voltar mantém a página)", async () => {
    h.respostasPagina.mockResolvedValue(paginaDe([daLista({ id: "r41" })], { total: 41, totalConta: 41 }));
    montar(<RespostasNaRota ctx={contexto({})} d={dados({})} />, `${ROTA}&pagina=3`);
    await achar('[data-resposta="r41"]');
    expect(h.respostasPagina).toHaveBeenCalledWith("c1", expect.anything(), 3);
    expect(document.querySelector('[data-paginacao="respostas"] [data-paginacao-rotulo]')?.textContent).toBe("41–41 de 41");
  });

  it("hml-14b: erro do banco = o estado de erro (nunca \"Nenhuma resposta\")", async () => {
    h.respostasPagina.mockRejectedValue(new Error("permission denied for function respostas_da_conta"));
    montar(<RespostasNaRota ctx={contexto({})} d={dados({})} />, ROTA);
    expect(await screen.findByText("Não deu para carregar as respostas")).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma resposta ainda")).toBeNull();
    expect(document.querySelector('[data-paginacao="respostas"]')).toBeNull();
  });
});
