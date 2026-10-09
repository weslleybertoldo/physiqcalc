import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AlunoDoSeletor } from "./regras";

// hml-14b (B19): os 4 campos que escolhem aluno no painel usam o SeletorDeAluno (busca no banco) — sem a lista de 1000 alunos.
const h = vi.hoisted(() => ({
  buscar: vi.fn(), porId: vi.fn(), listar: vi.fn(), rpc: vi.fn(),
  criarTransacao: vi.fn(), emitir: vi.fn(), horarios: vi.fn(), ligar: vi.fn(),
}));
vi.mock("@/integrations/principal/client", () => ({ PRINCIPAL_SCHEMA: "staging", principal: { rpc: h.rpc, from: vi.fn(), functions: { invoke: vi.fn() } } }));
vi.mock("@/painel/alunos/api", async (orig) => ({
  ...(await orig<typeof import("@/painel/alunos/api")>()), buscarAlunosDoSeletor: h.buscar, alunoDoSeletorPorId: h.porId, listarAlunos: h.listar,
}));
vi.mock("@/painel/financeiro/dados", async (orig) => ({
  ...(await orig<typeof import("@/painel/financeiro/dados")>()), criarTransacao: h.criarTransacao, emitirRecibo: h.emitir,
}));
vi.mock("@/painel/agenda/dados", async (orig) => ({ ...(await orig<typeof import("@/painel/agenda/dados")>()), horariosDoDia: h.horarios }));
vi.mock("@/painel/preconsulta/dados", async (orig) => ({ ...(await orig<typeof import("@/painel/preconsulta/dados")>()), ligarAluno: h.ligar }));

import { REGRAS_PADRAO } from "@/agenda/regras";
import AgendamentoDialog from "@/painel/agenda/AgendamentoDialog";
import type { Calendario } from "@/painel/agenda/dados";
import type { ContextoAgenda } from "@/painel/agenda/useAgenda";
import MovimentacaoDialog from "@/painel/financeiro/MovimentacaoDialog";
import ReciboDialog from "@/painel/financeiro/ReciboDialog";
import { padraoDoRecibo } from "@/painel/financeiro/recibosUtil";
import LigarAlunoDialog from "@/painel/preconsulta/LigarAlunoDialog";
import type { RespostaComFormulario } from "@/painel/preconsulta/dados";

const aluno = (o: Partial<AlunoDoSeletor> = {}): AlunoDoSeletor => ({
  id: "p1", nome: "Rafael Moura", apelido: null, email: "rafael@x.com", telefone: "82999990000", cpf: null, foto_url: null, ativo: true,
  bloqueado: false, conta_excluida: false, tem_login: true, personal_id: "u1", nutricionista_id: null, ...o,
});
const ZE = aluno({ id: "ze", nome: "Zé Último", email: null, telefone: "82988887777", cpf: "12345678900" });

function montar(el: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>);
}
const raiz = (campo: string) => document.querySelector(`[data-seletor-aluno="${campo}"]`);
async function escolherNaBusca(campo: string, id: string) {
  await waitFor(() => expect(raiz(campo)).not.toBeNull());
  fireEvent.focus(raiz(campo)!.querySelector("[data-seletor-aluno-busca]")!);
  await waitFor(() => expect(document.querySelector(`[data-seletor-aluno="${campo}"] [data-opcao-aluno="${id}"]`)).not.toBeNull());
  fireEvent.click(document.querySelector(`[data-seletor-aluno="${campo}"] [data-opcao-aluno="${id}"]`)!);
}

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
});

describe("hml-14b (B19) — Movimentação", () => {
  it("o aluno vem da busca no banco (ativos e bloqueados, como a lista de antes) e vai no registro", async () => {
    h.buscar.mockResolvedValue({ itens: [ZE], total: 1 });
    h.criarTransacao.mockImplementation(async (_u: string, _c: string, reg: Record<string, unknown>) => ({ id: "t1", ...reg }));
    montar(<MovimentacaoDialog open onOpenChange={vi.fn()} transacao={null} uid="u1" contaId="c1" categorias={[]} onSalvo={vi.fn()} onGerenciarCategorias={vi.fn()} />);
    await escolherNaBusca("movimentacao", "ze");
    expect(h.buscar).toHaveBeenCalledWith("c1", "", "ativos_e_bloqueados", 20);
    expect(document.querySelector("[data-campo-paciente]")?.getAttribute("data-campo-paciente")).toBe("ze");
    fireEvent.change(document.querySelector("[data-campo-descricao]")!, { target: { value: "Mensalidade" } });
    fireEvent.change(document.querySelector("[data-campo-valor]")!, { target: { value: "150" } });
    fireEvent.submit(document.querySelector("[data-form-movimentacao]")!);
    await waitFor(() => expect(h.criarTransacao).toHaveBeenCalledTimes(1));
    expect(h.criarTransacao.mock.calls[0][2]).toMatchObject({ paciente_id: "ze", descricao: "Mensalidade", valor: 150 });
  });

  it("editando: o aluno gravado que não é mais achado aparece pelo nome gravado; o × deixa sem aluno", async () => {
    h.porId.mockResolvedValue(null);
    const transacao = {
      id: "t9", nutricionista_id: "u1", conta_id: "c1", paciente_id: "removido", tipo: "entrada", descricao: "Consulta", valor: 100, data: "2026-10-01",
      metodo: "pix", observacao: null, estornada: false, recibo_id: null, categoria_id: null, created_at: "2026-10-01T10:00:00Z", categoria: null,
      paciente: { nome: "Carlos Antigo", cpf: null },
    };
    montar(<MovimentacaoDialog open onOpenChange={vi.fn()} transacao={transacao} uid="u1" contaId="c1" categorias={[]} onSalvo={vi.fn()} onGerenciarCategorias={vi.fn()} />);
    await waitFor(() => expect(document.querySelector('[data-seletor-aluno-escolhido="removido"]')?.textContent).toContain("Carlos Antigo"));
    expect(h.porId).toHaveBeenCalledWith("c1", "removido");
    fireEvent.click(document.querySelector("[data-seletor-aluno-limpar]")!);
    expect(document.querySelector("[data-campo-paciente]")?.getAttribute("data-campo-paciente")).toBe("nenhum");
  });
});

describe("hml-14b (B19) — Recibo avulso", () => {
  it("o <select> com a lista inteira virou a busca no banco; o CPF do escolhido vai à prévia", async () => {
    h.buscar.mockResolvedValue({ itens: [ZE], total: 1 });
    const modelo = { id: "m1", nutricionista_id: "u1", titulo: "Padrão", conteudo: "Recebi de *|NOME_PACIENTE|*, CPF *|NUMERO_DOCUMENTO_PACIENTE|*.", favorito: true };
    montar(<ReciboDialog open onOpenChange={vi.fn()} aluno={null} transacao={null} modelos={[modelo]} proximoNumero={7} nomeProfissional="Lucas"
      padrao={padraoDoRecibo(["personal"])} uid="u1" contaId="c1" onSalvo={vi.fn()} onGerenciarModelos={vi.fn()} />);
    await waitFor(() => expect(raiz("recibo")).not.toBeNull());
    expect(document.querySelector("select[data-campo-aluno-recibo]")).toBeNull();
    expect((document.querySelector("[data-btn-salvar-recibo]") as HTMLButtonElement).disabled).toBe(true);
    await escolherNaBusca("recibo", "ze");
    await waitFor(() => expect(document.querySelector("[data-previa-recibo]")?.textContent).toBe("Recebi de Zé Último, CPF 123.456.789-00."));
    expect((document.querySelector("[data-btn-salvar-recibo]") as HTMLButtonElement).disabled).toBe(false);
  });

  it("recibo de um aluno já definido (perfil do aluno, entrada com aluno): sem seletor", async () => {
    montar(<ReciboDialog open onOpenChange={vi.fn()} aluno={{ id: "p1", nome: "Rafael Moura", apelido: null, cpf: null }} transacao={null} modelos={[]} proximoNumero={1}
      nomeProfissional={null} padrao={padraoDoRecibo(["personal"])} uid="u1" contaId="c1" onSalvo={vi.fn()} onGerenciarModelos={vi.fn()} />);
    await waitFor(() => expect(document.querySelector("[data-form-recibo]")).not.toBeNull());
    expect(raiz("recibo")).toBeNull();
    expect(h.porId).not.toHaveBeenCalled();
  });
});

describe("hml-14b (B19) — Agendamento", () => {
  const cal = { id: "cal1", nutricionista_id: "u1", nome: "Principal", cor: "#8B5CF6", padrao: true, faixa_inicio: "08:00", faixa_fim: "18:00", slot_minutos: 60,
    conta_id: "c1", tag_padrao_id: null, created_at: "2026-10-01T00:00:00Z", deleted_at: null } satisfies Calendario;
  const ctx = {
    uid: "u1", contaId: "c1", conta: { id: "c1" }, dono: true, papeis: ["personal"], modulos: ["treino"],
    pessoas: new Map([["u1", { id: "u1", nome: "Lucas", papeis: ["personal"] }]]), pronto: true,
  } as unknown as ContextoAgenda;
  const abrir = (pacienteId: string | null) => montar(
    <AgendamentoDialog open onOpenChange={vi.fn()} agendamento={null} inicial={{ pacienteId }} calendarios={[cal]} eventos={[]} bloqueios={[]} travas={[]}
      regras={REGRAS_PADRAO} ctx={ctx} tags={[]} onSalvo={vi.fn()} />,
  );

  it("o ?aluno= é lido pelo id (só da conta); o aviso depende do login; trocar pela busca", async () => {
    h.horarios.mockResolvedValue({ slots: [], regras: REGRAS_PADRAO, slotCalendario: null });
    h.porId.mockResolvedValue(aluno({ id: "p9", nome: "Ana Lima", tem_login: false }));
    h.buscar.mockResolvedValue({ itens: [ZE], total: 1 });
    abrir("p9");
    await waitFor(() => expect(document.querySelector('[data-seletor-aluno-escolhido="p9"]')?.textContent).toContain("Ana Lima"));
    expect(h.porId).toHaveBeenCalledWith("c1", "p9");
    expect(document.querySelector("[data-campo-paciente]")?.getAttribute("data-campo-paciente")).toBe("p9");
    expect((document.querySelector("[data-campo-avisar] input") as HTMLInputElement).disabled).toBe(true); // sem login no app
    await escolherNaBusca("agendamento", "ze");
    expect(h.buscar).toHaveBeenCalledWith("c1", "", "ativos_e_bloqueados", 20);
    expect(document.querySelector("[data-campo-paciente]")?.getAttribute("data-campo-paciente")).toBe("ze");
    expect((document.querySelector("[data-campo-avisar] input") as HTMLInputElement).disabled).toBe(false);
    expect(document.querySelector("[data-campo-avisar]")?.textContent).toContain("Avisar Zé");
  });

  it("o ?aluno= que não é achado (de outra conta, removido) → sem aluno, como antes", async () => {
    h.horarios.mockResolvedValue({ slots: [], regras: REGRAS_PADRAO, slotCalendario: null });
    h.porId.mockResolvedValue(null);
    abrir("de-outra-conta");
    await waitFor(() => expect(document.querySelector("[data-campo-paciente]")?.getAttribute("data-campo-paciente")).toBe("nenhum"));
    expect(document.querySelector("[data-seletor-aluno-escolhido]")).toBeNull();
    expect(document.querySelector("[data-campo-avisar]")).toBeNull();
  });
});

describe("hml-14b (B19) — Ligar aluno (pré-consulta)", () => {
  const resposta = (o: Partial<RespostaComFormulario> = {}) => ({
    id: "r1", nutricionista_id: "u1", conta_id: "c1", formulario_id: "f1", titulo: "Pré-consulta", perguntas: [], faixas: [], respostas: {}, pontuacao: 0, faixa: "",
    nivel: "", nome: "Ana Lima", email: "ana.teste@x.com", telefone: "", paciente_id: null, respondido_em: "2026-10-01T10:00:00Z", created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z", deleted_at: null, importada_em: null, importada_tipo: null, importada_id: null, formulario: null, ...o,
  } as unknown as RespostaComFormulario);
  const ANA = aluno({ id: "a1", nome: "Ana Lima", email: "ana.teste@x.com" });

  it("a sugestão vem do banco (mesmo e-mail, a mesma regra) e a lista aberta é a busca do banco; liga o escolhido", async () => {
    h.buscar.mockImplementation(async (_c: string, termo: string) => (termo === "ana.teste@x.com" ? { itens: [ANA], total: 1 } : { itens: [ANA, ZE], total: 2 }));
    h.ligar.mockResolvedValue(resposta({ paciente_id: "a1" }));
    const onLigada = vi.fn();
    montar(<LigarAlunoDialog open onOpenChange={vi.fn()} resposta={resposta()} contaId="c1" onLigada={onLigada} />);
    await waitFor(() => expect(h.buscar).toHaveBeenCalledWith("c1", "", "todos", 20)); // a lista abre já buscando (como era)
    await waitFor(() => expect(document.querySelector('[data-sugestao-aluno="a1"]')?.getAttribute("data-sugestao-por")).toBe("email"));
    expect(h.buscar).toHaveBeenCalledWith("c1", "ana.teste@x.com", "todos", 50);
    fireEvent.click(document.querySelector("[data-btn-usar-sugestao]")!);
    expect(document.querySelector('[data-seletor-aluno-escolhido="a1"]')?.textContent).toContain("Ana Lima");
    fireEvent.click(document.querySelector("[data-btn-salvar-ligar]")!);
    await waitFor(() => expect(h.ligar).toHaveBeenCalledWith("r1", "a1"));
    expect(onLigada.mock.calls[0][1]).toMatchObject({ id: "a1", nome: "Ana Lima", email: "ana.teste@x.com" });
  });

  it("sugestão pelo telefone com DDI (os 8 últimos dígitos vão ao banco); a busca que não acha oferece o cadastro", async () => {
    h.buscar.mockImplementation(async (_c: string, termo: string) => (termo === "88887777" ? { itens: [ZE], total: 1 } : { itens: [], total: 0 }));
    h.listar.mockResolvedValue(null);
    montar(<LigarAlunoDialog open onOpenChange={vi.fn()} resposta={resposta({ nome: "José Ultimo", email: null, telefone: "+55 (82) 98888-7777" })} contaId="c1" onLigada={vi.fn()} />);
    await waitFor(() => expect(document.querySelector('[data-sugestao-aluno="ze"]')?.getAttribute("data-sugestao-por")).toBe("telefone"));
    expect(h.buscar.mock.calls.map((c) => c[1])).not.toContain("+55 (82) 98888-7777");
    await waitFor(() => expect(document.querySelector('[data-seletor-aluno="ligar"] [data-seletor-aluno-cadastrar]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-seletor-aluno="ligar"] [data-seletor-aluno-cadastrar]')!);
    expect(await screen.findByText("Cadastrar e ligar")).toBeInTheDocument();
    expect((document.querySelector("[data-cadastro-resposta-nome]") as HTMLInputElement).value).toBe("José Ultimo");
  });
});
