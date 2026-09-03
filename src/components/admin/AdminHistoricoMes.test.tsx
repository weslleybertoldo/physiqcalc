import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));
// O histórico completo puxa PowerSync; aqui só interessa saber se ele foi (ou não) oferecido.
vi.mock("@/components/treinos/HistoricoTreinos", () => ({
  default: ({ userId }: { userId: string }) => <div data-testid="historico-completo">{userId}</div>,
}));

import AdminHistoricoMes from "./AdminHistoricoMes";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const hoje = new Date();
const MES_ATUAL = hoje.getMonth() + 1;
const ANO_ATUAL = hoje.getFullYear();

const ITENS = [
  {
    chave: "h:t1", userId: "u-jaise", pessoa: "Jaise Soares", data: `${ANO_ATUAL}-09-01`, diaSemana: "TER",
    nomeTreino: "Treino A · Quadríceps", duracaoSegundos: 35700, totalExercicios: 6, academia: "Gaviões", comCronometro: true,
  },
  {
    chave: `c:u-livia:${ANO_ATUAL}-09-02:0`, userId: "u-livia", pessoa: "Lívia Cavalcante", data: `${ANO_ATUAL}-09-02`, diaSemana: "QUA",
    nomeTreino: "Treino B", duracaoSegundos: null, totalExercicios: 4, academia: null, comCronometro: false,
  },
];
const USERS = [
  { id: "u-jaise", nome: "Jaise Soares", email: "jaise@exemplo.com" },
  { id: "u-livia", nome: "Lívia Cavalcante", email: "livia@exemplo.com" },
  { id: "u-anne", nome: "Anne", email: "anne@exemplo.com" },
];
const TREINO = {
  id: "t1",
  nome_treino: "Treino A · Quadríceps",
  iniciado_em: `${ANO_ATUAL}-09-01T10:00:00.000Z`,
  concluido_em: `${ANO_ATUAL}-09-01T19:55:00.000Z`,
  duracao_segundos: 35700,
  exercicios_concluidos: [
    {
      exercicio_id: "e1", nome: "Agachamento Livre", series_concluidas: 2, academia_nome: "Gaviões",
      series: [{ numero_serie: 1, peso: 60, reps: 10 }, { numero_serie: 2, peso: 60, reps: 8 }],
    },
  ],
};

/** Edge fake: lista do mês e detalhe de um treino, como a admin-relatorio responde. */
function edgeFake(itens = ITENS) {
  invoke.mockImplementation(async (_fn: string, { body }: { body: { action: string } }) => {
    if (body.action === "historicoMes") return { data: { itens }, error: null };
    if (body.action === "historicoTreino") return { data: { treino: TREINO }, error: null };
    return { data: null, error: new Error(`ação inesperada: ${body.action}`) };
  });
}

beforeEach(() => {
  invoke.mockReset();
  edgeFake();
});
afterEach(cleanup);

describe("AdminHistoricoMes — usuário fixo (Configurar Usuário › Histórico)", () => {
  it("lista só os treinos do aluno, com filtro de mês e ano e sem escolher aluno", async () => {
    render(<AdminHistoricoMes userId="u-jaise" />);
    await screen.findByText(/1 treino em/);

    // mesma edge da aba do painel, mês atual pré-selecionado
    expect(invoke).toHaveBeenCalledWith("admin-relatorio", {
      body: { action: "historicoMes", ano: ANO_ATUAL, mes: MES_ATUAL },
    });

    // a linha é igual à do painel: data, pessoa, treino, duração, exercícios, academia
    const linha = screen.getByText("Treino A · Quadríceps").closest("[data-historico-linha]") as HTMLElement;
    expect(within(linha).getByText("01/09 TER")).toBeInTheDocument();
    expect(within(linha).getByText("Jaise Soares")).toBeInTheDocument();
    expect(within(linha).getByText("9h55m")).toBeInTheDocument();
    expect(within(linha).getByText("6 exercícios")).toBeInTheDocument();
    expect(within(linha).getByText("Gaviões")).toBeInTheDocument();

    // o treino de outro aluno não entra
    expect(screen.queryByText("Treino B")).toBeNull();
    expect(screen.queryByText("Lívia Cavalcante")).toBeNull();

    // só mês e ano; nada de escolher aluno nem buscar o histórico completo
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
    expect(screen.queryByText("Todos os alunos")).toBeNull();
    expect(screen.queryByText("Histórico completo de um aluno")).toBeNull();
    expect(screen.queryByText("Buscar")).toBeNull();
  });

  it("trocar o mês recarrega pela edge e, sem treinos, mostra a mensagem do aluno", async () => {
    render(<AdminHistoricoMes userId="u-jaise" />);
    await screen.findByText(/1 treino em/);

    const outroMes = MES_ATUAL === 1 ? 2 : 1;
    edgeFake([]);
    const [selectMes] = screen.getAllByRole("combobox");
    fireEvent.change(selectMes, { target: { value: String(outroMes) } });

    await screen.findByText(`Este aluno não tem treinos em ${MESES[outroMes - 1]} de ${ANO_ATUAL}.`);
    expect(invoke).toHaveBeenLastCalledWith("admin-relatorio", {
      body: { action: "historicoMes", ano: ANO_ATUAL, mes: outroMes },
    });
  });

  it("clicar na linha abre o popup daquele treino do aluno", async () => {
    render(<AdminHistoricoMes userId="u-jaise" />);
    await screen.findByText(/1 treino em/);

    fireEvent.click(screen.getByText("Treino A · Quadríceps"));
    await screen.findByText("Exercícios realizados");

    expect(invoke).toHaveBeenLastCalledWith("admin-relatorio", {
      body: { action: "historicoTreino", userId: "u-jaise", chave: "h:t1" },
    });
    expect(screen.getByText("Agachamento Livre", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Volume total")).toBeInTheDocument();
  });
});

describe("AdminHistoricoMes — painel (todos os alunos) segue igual", () => {
  it("mantém seletor de aluno, busca do histórico completo e a lista de todos", async () => {
    render(<AdminHistoricoMes users={USERS} />);
    await screen.findByText(/2 treinos em/);

    expect(screen.getByText("Histórico completo de um aluno")).toBeInTheDocument();
    expect(screen.getByText("Buscar")).toBeInTheDocument();
    expect(screen.getByText("Treino A · Quadríceps")).toBeInTheDocument();
    expect(screen.getByText("Treino B")).toBeInTheDocument();

    // busca (aluno), mês, ano, filtro de aluno
    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(4);
    const filtroAluno = selects[3];
    // só quem treinou no mês entra no filtro (Anne fica de fora)
    const opcoes = within(filtroAluno).getAllByRole("option").map((o) => o.textContent);
    expect(opcoes).toEqual(["Todos os alunos", "Jaise Soares", "Lívia Cavalcante"]);

    fireEvent.change(filtroAluno, { target: { value: "u-livia" } });
    expect(screen.getByText("Treino B")).toBeInTheDocument();
    expect(screen.queryByText("Treino A · Quadríceps")).toBeNull();
    expect(screen.getByText(/1 treino em/)).toBeInTheDocument();
  });
});
