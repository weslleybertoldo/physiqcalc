import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Physiq W26 — as telas das Ferramentas (Lixeira, Modelos, Impressos, Calculadora) com os dados simulados: o que a tela mostra, as
// recusas em vermelho e a confirmação com o nome do item.
const h = vi.hoisted(() => ({
  conta: {
    id: "c1", nome: "Consultoria Ferreira", modulos: ["treino", "nutricao"], papeis: ["dono", "nutricionista"], profissionais: 2,
  } as Record<string, unknown> | null,
  lixeira: vi.fn(),
  restaurar: vi.fn(),
  apagar: vi.fn(),
  modelos: vi.fn(),
  desfavoritar: vi.fn(),
  baixarImpresso: vi.fn(() => "physiq-ficha-antropometrica-2026-10-01.pdf"),
}));

vi.mock("@/nucleo/conta", () => ({ useConta: () => ({ conta: h.conta, ehMaster: false, ehDono: true }) }));
vi.mock("@/nucleo/sessao", () => ({
  useSessao: () => ({ usuario: { id: "u1", email: "camila@teste.com", user_metadata: { full_name: "Camila Rocha" } }, treino: { estado: "pronto", erro: null } }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "t1" }, papel: "professor" }) }));
vi.mock("@/ui/casca/topo", () => ({ TopoPagina: ({ titulo, subtitulo, acoes }: { titulo?: string; subtitulo?: React.ReactNode; acoes?: React.ReactNode }) => <header><h1>{titulo}</h1>{subtitulo}{acoes}</header> }));
vi.mock("@/ferramentas/lixeira/dados", async (orig) => ({
  ...(await orig<typeof import("@/ferramentas/lixeira/dados")>()),
  listarLixeira: h.lixeira,
  restaurar: h.restaurar,
  apagarDeVez: h.apagar,
}));
vi.mock("@/ferramentas/modelos/dados", () => ({ listarModelos: h.modelos, desfavoritar: h.desfavoritar }));
vi.mock("@/nutricao/editor/lib/profissional", () => ({ nomeDaNutricionista: async () => "Camila Rocha" }));
vi.mock("@/ferramentas/impressos/impressosPdf", () => ({ baixarImpresso: h.baixarImpresso, abrirImpresso: () => ({ nome: "x.pdf", aberto: true }) }));

import { ErroLixeira } from "@/ferramentas/lixeira/dados";
import Lixeira from "./Lixeira";
import Modelos from "./Modelos";
import Impressos from "./Impressos";
import Calculadora from "./Calculadora";

function Endereco() {
  return <output data-endereco={useLocation().search} />;
}
const endereco = () => document.querySelector("[data-endereco]")?.getAttribute("data-endereco") ?? "";

function abrir(no: React.ReactNode, caminho = "/painel") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[caminho]}>{no}<Endereco /></MemoryRouter>
    </QueryClientProvider>,
  );
}

const ONTEM = new Date(Date.now() - 86_400_000).toISOString();
type ItemDeTeste = { tipo: string; id: string; titulo: string } & Record<string, unknown>;
/**
 * hml-14b (B21): o banco devolve UMA página da aba (a pedida, se a pessoa tem a aba; senão a 1ª com itens) com os números das abas — o
 * falso faz igual com a lista de teste (a busca e o corte por página também).
 */
function lixeiraDoBanco(itens: ItemDeTeste[], veClinico: boolean, temNutricao: boolean) {
  return async (_conta: string, p: { tipo: string | null; busca: string; pagina: number }) => {
    const abas = veClinico && temNutricao ? ["resposta", "anamnese", "antropometria", "plano", "paciente"] : ["resposta", "paciente"];
    const totais = { resposta: 0, anamnese: 0, antropometria: 0, plano: 0, paciente: 0 } as Record<string, number>;
    for (const i of itens) if (abas.includes(i.tipo)) totais[i.tipo] += 1;
    const tipo = p.tipo && abas.includes(p.tipo) ? p.tipo : abas.find((a) => totais[a] > 0) ?? "resposta";
    const daAba = itens.filter((i) => i.tipo === tipo && (!p.busca || i.titulo.toLowerCase().includes(p.busca.toLowerCase())));
    return { veClinico, temNutricao, itens: daAba.slice((p.pagina - 1) * 20, p.pagina * 20), pagina: { tipo, totais, total: daAba.length } };
  };
}
const itensLixeira = [
  { tipo: "paciente", id: "pac1", titulo: "Joana Prado", detalhe: "joana@teste.com", paciente_id: null, paciente_nome: null, excluido_em: ONTEM, pode_restaurar: true, pode_apagar: false },
  { tipo: "anamnese", id: "a1", titulo: "Anamnese geral", detalhe: null, paciente_id: "pac2", paciente_nome: "Rafael Moura", excluido_em: ONTEM, pode_restaurar: true, pode_apagar: true },
  { tipo: "plano", id: "p1", titulo: "Plano 1800", detalhe: null, paciente_id: "pac2", paciente_nome: "Rafael Moura", excluido_em: ONTEM, pode_restaurar: true, pode_apagar: true },
];

beforeEach(() => {
  h.conta = { id: "c1", nome: "Consultoria Ferreira", modulos: ["treino", "nutricao"], papeis: ["dono", "nutricionista"], profissionais: 2 };
  h.lixeira.mockReset().mockImplementation(lixeiraDoBanco(itensLixeira, true, true));
  h.restaurar.mockReset().mockResolvedValue({ ok: true });
  h.apagar.mockReset().mockResolvedValue(undefined);
  h.modelos.mockReset();
  h.desfavoritar.mockReset().mockResolvedValue(undefined);
  h.baixarImpresso.mockClear();
});

describe("Ferramentas › Lixeira (N-21)", () => {
  it("5 abas para a nutricionista, alunos ficam até restaurar, contagem por aba", async () => {
    abrir(<Lixeira />, "/painel/lixeira?tipo=paciente");
    expect(await screen.findByText("Joana Prado")).toBeInTheDocument();
    const abas = [...document.querySelectorAll("[data-aba-lixeira-botao]")].map((b) => b.getAttribute("data-aba-lixeira-botao"));
    expect(abas).toEqual(["resposta", "anamnese", "antropometria", "plano", "paciente"]);
    expect(screen.getByText(/fica até você restaurar/)).toBeInTheDocument();
    expect(document.querySelector("[data-btn-apagar-de-vez]")).toBeNull(); // aluno não apaga de vez
    expect(h.lixeira).toHaveBeenCalledWith("c1", { tipo: "paciente", busca: "", pagina: 1 });
    expect(document.querySelector('[data-aba-lixeira-botao="plano"]')?.getAttribute("data-aba-total")).toBe("1");
  });

  it("restaurar aluno com e-mail repetido: a frase vermelha aparece na linha e nada muda", async () => {
    h.restaurar.mockRejectedValueOnce(new ErroLixeira("email_repetido", { campos: ["email"] }));
    abrir(<Lixeira />, "/painel/lixeira?tipo=paciente");
    fireEvent.click(await screen.findByRole("button", { name: /Restaurar/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Já existe um aluno com este e-mail.");
    expect(h.restaurar).toHaveBeenCalledWith("paciente", "pac1");
  });

  it("restaurar aluno de outro profissional (P7): recusa em vermelho", async () => {
    h.restaurar.mockRejectedValueOnce(new ErroLixeira("outro_profissional"));
    abrir(<Lixeira />, "/painel/lixeira?tipo=paciente");
    fireEvent.click(await screen.findByRole("button", { name: /Restaurar/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Este aluno já está com outro profissional.");
  });

  it("apagar de vez pede confirmação com o nome do item e só apaga no confirmar", async () => {
    abrir(<Lixeira />, "/painel/lixeira?tipo=plano");
    fireEvent.click(await screen.findByRole("button", { name: /Apagar de vez/ }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo).toHaveTextContent('"Plano 1800" será apagado de vez e não poderá ser restaurado.');
    expect(h.apagar).not.toHaveBeenCalled();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Apagar de vez" }));
    await waitFor(() => expect(h.apagar).toHaveBeenCalledWith("plano", "p1"));
  });

  it("sem o papel de nutricionista: só Pré-consulta e Alunos (regra clínica da W18) e o aviso", async () => {
    h.lixeira.mockImplementation(lixeiraDoBanco([itensLixeira[0]], false, true));
    abrir(<Lixeira />, "/painel/lixeira?tipo=anamnese");
    expect(await screen.findByText("Joana Prado")).toBeInTheDocument();
    const abas = [...document.querySelectorAll("[data-aba-lixeira-botao]")].map((b) => b.getAttribute("data-aba-lixeira-botao"));
    expect(abas).toEqual(["resposta", "paciente"]);
    expect(screen.getByText(/só aparecem para a nutricionista da conta/)).toBeInTheDocument();
  });

  it("conta sem Nutrição (o master numa conta só de Treino): sem as abas clínicas", async () => {
    h.lixeira.mockImplementation(lixeiraDoBanco([itensLixeira[0]], true, false));
    abrir(<Lixeira />, "/painel/lixeira");
    expect(await screen.findByText("Joana Prado")).toBeInTheDocument();
    expect([...document.querySelectorAll("[data-aba-lixeira-botao]")].map((b) => b.getAttribute("data-aba-lixeira-botao"))).toEqual(["resposta", "paciente"]);
  });

  it("hml-14b: UMA página da aba vem do banco — \"1–20 de 41\", Próxima pede a 2 (no endereço); trocar de aba volta à 1", async () => {
    const removidos = Array.from({ length: 41 }, (_, i) => ({ ...itensLixeira[0], id: `pac${i + 1}`, titulo: i === 40 ? "Zé Último" : `Aluno ${i + 1}` }));
    h.lixeira.mockImplementation(lixeiraDoBanco([...removidos, itensLixeira[2]], true, true));
    abrir(<Lixeira />, "/painel/lixeira?tipo=paciente");
    const pag = await waitFor(() => {
      const el = document.querySelector('[data-paginacao="lixeira"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(pag.querySelector("[data-paginacao-rotulo]")?.textContent).toBe("1–20 de 41");
    expect(document.querySelectorAll('[data-lista="lixeira"] [data-item]').length).toBe(20);
    expect(document.querySelector('[data-aba-lixeira-botao="paciente"]')?.getAttribute("data-aba-total")).toBe("41");
    fireEvent.click(pag.querySelector("[data-pagina-proxima]")!);
    await waitFor(() => expect(h.lixeira).toHaveBeenLastCalledWith("c1", { tipo: "paciente", busca: "", pagina: 2 }), { timeout: 4000 });
    expect(endereco()).toContain("pagina=2");
    fireEvent.click(document.querySelector('[data-aba-lixeira-botao="plano"]')!);
    await waitFor(() => expect(h.lixeira).toHaveBeenLastCalledWith("c1", { tipo: "plano", busca: "", pagina: 1 }), { timeout: 4000 });
    expect(await screen.findByText("Plano 1800")).toBeInTheDocument();
    expect(endereco()).not.toContain("pagina=");
  }, 15_000);

  it("hml-14b: a busca vai ao banco e volta à página 1", async () => {
    const removidos = Array.from({ length: 41 }, (_, i) => ({ ...itensLixeira[0], id: `pac${i + 1}`, titulo: i === 40 ? "Zé Último" : `Aluno ${i + 1}` }));
    h.lixeira.mockImplementation(lixeiraDoBanco(removidos, true, true));
    abrir(<Lixeira />, "/painel/lixeira?tipo=paciente&pagina=2");
    await waitFor(() => expect(h.lixeira).toHaveBeenCalledWith("c1", { tipo: "paciente", busca: "", pagina: 2 }), { timeout: 4000 });
    fireEvent.change(document.querySelector("[data-campo-busca-lixeira]")!, { target: { value: "Zé" } });
    await waitFor(() => expect(h.lixeira).toHaveBeenLastCalledWith("c1", { tipo: "paciente", busca: "Zé", pagina: 1 }), { timeout: 4000 });
    expect(await screen.findByText("Zé Último")).toBeInTheDocument();
    expect(endereco()).not.toContain("pagina=");
  }, 15_000);

  it("hml-14b: erro do banco = o estado de erro (nunca a lixeira vazia)", async () => {
    h.lixeira.mockRejectedValue(new ErroLixeira("erro_interno"));
    abrir(<Lixeira />, "/painel/lixeira?tipo=paciente");
    // a consulta da Lixeira tenta 2 vezes (retry: 1) antes do erro
    expect(await screen.findByText(/Não foi possível abrir a lixeira/, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByText("Nenhum aluno na lixeira.")).toBeNull();
  });

  it("sem conta ativa: estado vazio, sem consultar", () => {
    h.conta = null;
    abrir(<Lixeira />);
    expect(screen.getByText("Nenhuma conta ativa")).toBeInTheDocument();
    expect(h.lixeira).not.toHaveBeenCalled();
  });
});

describe("Ferramentas › Modelos (N-15)", () => {
  it("os ★ em abas por tipo + Treinos; tirar a estrela chama a tela dona", async () => {
    h.modelos.mockResolvedValue({
      erros: {},
      itens: [
        { tipo: "treino", id: "g1", titulo: "Treino A · Peito", resumo: "Pasta Força · 5 exercícios", atualizado_em: null, paciente_id: null, rota: "/painel/treinos?pasta=p&treino=g1", desfavoritavel: false },
        { tipo: "anamnese", id: "a1", titulo: "Anamnese esportiva", resumo: "3 perguntas", atualizado_em: "2026-09-20T15:00:00Z", paciente_id: null, rota: null, desfavoritavel: true },
      ],
    });
    abrir(<Modelos />, "/painel/modelos");
    expect(await screen.findByText("Anamnese esportiva")).toBeInTheDocument();
    expect([...document.querySelectorAll("[data-aba-modelo]")].map((b) => b.getAttribute("data-aba-modelo"))).toEqual(["todos", "treino", "anamnese"]);
    expect(screen.getByText(/edite em: Prontuário do aluno/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tirar a estrela" }));
    await waitFor(() => expect(h.desfavoritar).toHaveBeenCalledWith("anamnese", "a1"));
  });

  it("sem nenhum ★: o vazio explica onde marcar; uma fonte com erro não derruba a tela", async () => {
    h.modelos.mockResolvedValue({ erros: { receita: "falhou" }, itens: [] });
    abrir(<Modelos />, "/painel/modelos");
    expect(await screen.findByText("Nenhum modelo ainda")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar receitas: falhou");
  });
});

describe("Ferramentas › Impressos (N-20) e Calculadora (C52)", () => {
  it("os 7 impressos, com o nome do perfil no cabeçalho; Baixar gera o PDF", async () => {
    abrir(<Impressos />, "/painel/impressos");
    expect(document.querySelectorAll("[data-impresso]")).toHaveLength(7);
    await waitFor(() => expect((document.querySelector("[data-campo-nutricionista]") as HTMLInputElement).value).toBe("Camila Rocha"));
    fireEvent.click(document.querySelector('[data-impresso="ficha-antropometrica"] [data-btn-baixar]')!);
    await waitFor(() => expect(h.baixarImpresso).toHaveBeenCalledWith("ficha-antropometrica", expect.objectContaining({ nutricionista: "Camila Rocha" })));
  });

  it("a busca filtra e o vazio oferece limpar", async () => {
    abrir(<Impressos />, "/painel/impressos?q=nada-disso");
    expect(await screen.findByText("Nenhum impresso com esse nome")).toBeInTheDocument();
  });

  it("calculadora: idade, altura e peso dão a TMB de Mifflin e o gasto por atividade", async () => {
    localStorage.clear();
    abrir(<Calculadora />, "/painel/calculadora");
    fireEvent.change(document.querySelector("[data-campo-idade]")!, { target: { value: "30" } });
    fireEvent.change(document.querySelector("[data-campo-altura]")!, { target: { value: "180" } });
    fireEvent.change(document.querySelector("[data-campo-peso]")!, { target: { value: "80" } });
    expect(await screen.findByText("1780")).toBeInTheDocument();
    expect(document.querySelector("[data-tabela-tdee-mifflin]")).toHaveTextContent("2136"); // 1780 × 1,2
    expect(JSON.parse(localStorage.getItem("physiqcalc-basic") ?? "{}")).toMatchObject({ age: "30", height: "180", weight: "80" });
  });
});
