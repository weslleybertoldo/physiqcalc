import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
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

function abrir(no: React.ReactNode, caminho = "/painel") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[caminho]}>{no}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const ONTEM = new Date(Date.now() - 86_400_000).toISOString();
const itensLixeira = [
  { tipo: "paciente", id: "pac1", titulo: "Joana Prado", detalhe: "joana@teste.com", paciente_id: null, paciente_nome: null, excluido_em: ONTEM, pode_restaurar: true, pode_apagar: false },
  { tipo: "anamnese", id: "a1", titulo: "Anamnese geral", detalhe: null, paciente_id: "pac2", paciente_nome: "Rafael Moura", excluido_em: ONTEM, pode_restaurar: true, pode_apagar: true },
  { tipo: "plano", id: "p1", titulo: "Plano 1800", detalhe: null, paciente_id: "pac2", paciente_nome: "Rafael Moura", excluido_em: ONTEM, pode_restaurar: true, pode_apagar: true },
];

beforeEach(() => {
  h.conta = { id: "c1", nome: "Consultoria Ferreira", modulos: ["treino", "nutricao"], papeis: ["dono", "nutricionista"], profissionais: 2 };
  h.lixeira.mockReset().mockResolvedValue({ veClinico: true, temNutricao: true, itens: itensLixeira });
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
    expect(h.lixeira).toHaveBeenCalledWith("c1");
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
    h.lixeira.mockResolvedValue({ veClinico: false, temNutricao: true, itens: [itensLixeira[0]] });
    abrir(<Lixeira />, "/painel/lixeira?tipo=anamnese");
    expect(await screen.findByText("Joana Prado")).toBeInTheDocument();
    const abas = [...document.querySelectorAll("[data-aba-lixeira-botao]")].map((b) => b.getAttribute("data-aba-lixeira-botao"));
    expect(abas).toEqual(["resposta", "paciente"]);
    expect(screen.getByText(/só aparecem para a nutricionista da conta/)).toBeInTheDocument();
  });

  it("conta sem Nutrição (o master numa conta só de Treino): sem as abas clínicas", async () => {
    h.lixeira.mockResolvedValue({ veClinico: true, temNutricao: false, itens: [itensLixeira[0]] });
    abrir(<Lixeira />, "/painel/lixeira");
    expect(await screen.findByText("Joana Prado")).toBeInTheDocument();
    expect([...document.querySelectorAll("[data-aba-lixeira-botao]")].map((b) => b.getAttribute("data-aba-lixeira-botao"))).toEqual(["resposta", "paciente"]);
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
