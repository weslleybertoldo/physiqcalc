import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Aluno, AlunoDoApp, ContaLinha, PessoaSemConta } from "../tipos";

// hml-14d (B21 · D28): as listas do painel master em páginas de 20 do BANCO — cada tela pede a página (o número vai no pedido à
// função), mostra "1–20 de N" com o total da resposta, a página mora no endereço (`?pagina=`), a busca vai ao banco (300 ms) e volta
// à 1, filtro novo volta à 1 e erro do banco é o estado de erro (nunca lista vazia).
const h = vi.hoisted(() => ({
  listarContas: vi.fn(), financeiro: vi.fn(), integracoes: vi.fn(), alunosDoApp: vi.fn(), listarAlunos: vi.fn(), semConta: vi.fn(),
}));
vi.mock("../api", () => ({
  listarContas: h.listarContas, financeiro: h.financeiro, integracoes: h.integracoes, alunosDoApp: h.alunosDoApp, listarAlunos: h.listarAlunos,
  semConta: h.semConta, acaoConta: vi.fn(), bloquearAluno: vi.fn(),
  ErroMaster: class ErroMaster extends Error {
    constructor(public codigo: string, public extra: Record<string, unknown> = {}) {
      super(codigo);
    }
  },
}));
vi.mock("@/ui/casca/topo", () => ({
  TopoPagina: ({ titulo, subtitulo, acoes }: { titulo?: ReactNode; subtitulo?: ReactNode; acoes?: ReactNode }) => (
    <header><h1>{titulo}</h1><p>{subtitulo}</p>{acoes}</header>
  ),
}));
vi.mock("../contas/DetalheConta", () => ({
  DetalheConta: ({ contaId, aoFechar }: { contaId: string | null; aoFechar: () => void }) => (contaId ? <button type="button" data-detalhe-aberto={contaId} onClick={aoFechar} /> : null),
}));
vi.mock("../contas/NovaContaDialog", () => ({ NovaContaDialog: () => null }));
vi.mock("../alunos/MoverAlunosDialog", () => ({ MoverAlunosDialog: () => null }));
vi.mock("@/painel/aluno/resumo/acesso/SheetSenhaAluno", () => ({ SheetSenhaAluno: () => null }));
vi.mock("../app/TreinosProntos", () => ({ TreinosProntos: () => null }));
vi.mock("../app/PratosProntos", () => ({ PratosProntos: () => null }));

import Alunos from "./Alunos";
import AppAluno from "./AppAluno";
import Contas from "./Contas";
import Financeiro from "./Financeiro";
import Integracoes from "./Integracoes";

const conta = (i: number, c: Partial<ContaLinha> = {}): ContaLinha => ({
  id: `c${i}`, nome: `Conta ${String(i).padStart(2, "0")}`, origem: "nova", plano: "treino", modulos: ["treino"], faixa: "f10", periodicidade: "mensal",
  situacao: "ativa", situacao_efetiva: "ativa", teste_ate: null, vence_em: "2026-11-02", tolerancia_dias: 0, valor_travado: null, valor_mensal: 29.9,
  regra_pix: "mes", cobranca_legada: false, isenta_motivo: null, recebimento_modo: "pix_manual", bloquear_app_inadimplente: false,
  alunos_bloqueados_em: null, alunos_bloqueados_msg: null, criado_em: "2026-10-01T10:00:00Z", eh_app: false,
  dono: { id: `d${i}`, nome: `Dono ${i}`, email: `dono${i}@x.com`, master: false }, membros: 1, convidados: 0, alunos_ativos: 3, alunos_total: 3,
  limite_alunos: 10, assinatura: null, legado_nutri: null, ultima_fatura: null, chave_pix: null, ...c,
});
/** a página `n` de uma lista de 41 (a 3ª tem só o 41º) */
const daPagina = <T,>(n: number, fazer: (i: number) => T, total = 41) =>
  Array.from({ length: Math.max(0, Math.min(20, total - (n - 1) * 20)) }, (_, k) => fazer((n - 1) * 20 + k + 1));
const RESUMO = { todas: 41, ativas: 41, vencidas: 0, suspensas: 0 };

function montar(el: ReactNode, rota: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Endereco() {
    const l = useLocation();
    return <output data-endereco={l.search} />;
  }
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[rota]}>{el}<Endereco /></MemoryRouter></QueryClientProvider>);
}
const endereco = () => document.querySelector("[data-endereco]")?.getAttribute("data-endereco") ?? "";
const rotulo = (lista: string) => document.querySelector(`[data-paginacao="${lista}"] [data-paginacao-rotulo]`)?.textContent;
const itens = (lista: string) => document.querySelectorAll(`[data-lista="${lista}"] [data-item]`).length;
const proxima = (lista: string) => fireEvent.click(document.querySelector(`[data-paginacao="${lista}"] [data-pagina-proxima]`)!);
const ESPERA = { timeout: 4000 };

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
});

describe("hml-14d — Master › Contas", () => {
  beforeEach(() => {
    h.listarContas.mockImplementation(async (_f: unknown, n: number) => ({ contas: daPagina(n, (i) => conta(i)), resumo: RESUMO, hoje: "2026-10-09", total: 41 }));
  });

  it("página 1 do banco: 20 linhas, \"1–20 de 41\"; Próxima pede a 2 (no endereço); ?conta= abre e fecha mantendo a página", async () => {
    montar(<Contas />, "/master/contas");
    await waitFor(() => expect(rotulo("master-contas")).toBe("1–20 de 41"));
    expect(itens("master-contas")).toBe(20);
    expect(h.listarContas).toHaveBeenLastCalledWith({ situacao: null, origem: null, busca: null }, 1);
    expect(document.querySelector("[data-pagina-master=contas]")?.getAttribute("data-total-contas")).toBe("41");
    proxima("master-contas");
    await waitFor(() => expect(h.listarContas).toHaveBeenLastCalledWith(expect.anything(), 2), ESPERA);
    expect(endereco()).toContain("pagina=2");
    fireEvent.click(document.querySelector('[data-linha-conta="Conta 21"]')!);
    await waitFor(() => expect(document.querySelector("[data-detalhe-aberto=c21]")).not.toBeNull());
    expect(endereco()).toContain("pagina=2");
    expect(endereco()).toContain("conta=c21");
    fireEvent.click(document.querySelector("[data-detalhe-aberto=c21]")!);
    await waitFor(() => expect(endereco()).not.toContain("conta="));
    expect(endereco()).toContain("pagina=2");
    expect(rotulo("master-contas")).toBe("21–40 de 41");
  });

  it("a busca vai ao banco (300 ms depois) e volta à 1; o filtro de situação também volta à 1", async () => {
    montar(<Contas />, "/master/contas?pagina=3");
    await waitFor(() => expect(h.listarContas).toHaveBeenLastCalledWith(expect.anything(), 3));
    await waitFor(() => expect(rotulo("master-contas")).toBe("41–41 de 41"));
    fireEvent.change(document.querySelector("[data-busca-contas]")!, { target: { value: "  zé último " } });
    await waitFor(() => expect(h.listarContas).toHaveBeenLastCalledWith({ situacao: null, origem: null, busca: "zé último" }, 1), ESPERA);
    expect(endereco()).not.toContain("pagina=");
    proxima("master-contas");
    await waitFor(() => expect(endereco()).toContain("pagina=2"), ESPERA);
    fireEvent.click(document.querySelector('[data-filtro="vencida"]')!);
    await waitFor(() => expect(h.listarContas).toHaveBeenLastCalledWith({ situacao: "vencida", origem: null, busca: "zé último" }, 1), ESPERA);
    expect(endereco()).not.toContain("pagina=");
  }, 15_000);

  it("erro do banco = o estado de erro (nunca \"Nenhuma conta\")", async () => {
    h.listarContas.mockRejectedValue(new Error("boom"));
    montar(<Contas />, "/master/contas");
    expect(await screen.findByText("Não deu certo agora. Tente de novo.")).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma conta neste filtro")).toBeNull();
    expect(document.querySelector('[data-paginacao="master-contas"]')).toBeNull();
  });
});

describe("hml-14d — Master › Financeiro", () => {
  it("contas em páginas do banco; o chip de \"Faturas recentes\" é o total do banco (o cartão continua com 10)", async () => {
    const fatura = (i: number) => ({ id: `f${i}`, conta_id: "c1", conta_nome: "Conta 01", tipo: "mensal", valor: 10, status: "approved", forma: "pix",
      cobre_de: null, cobre_ate: null, pago_em: null, criado_em: "2026-10-01T10:00:00Z", descricao: null, registrado_por: null });
    h.financeiro.mockImplementation(async (_f: string, n: number) => ({
      contas: daPagina(n, (i) => conta(i)), faturas: Array.from({ length: 40 }, (_, i) => fatura(i)), faturas_total: 57, resumo: { todas: 41 },
      hoje: "2026-10-09", total: 41,
    }));
    montar(<Financeiro />, "/master/financeiro");
    await waitFor(() => expect(rotulo("master-financeiro")).toBe("1–20 de 41"));
    expect(itens("master-financeiro")).toBe(20);
    expect(document.querySelector("[data-faturas-total]")?.textContent).toBe("57");
    expect(document.querySelectorAll("[data-fatura-master]").length).toBe(10);
    proxima("master-financeiro");
    await waitFor(() => expect(h.financeiro).toHaveBeenLastCalledWith("todas", 2), ESPERA);
    fireEvent.click(document.querySelector('[data-filtro="vencidas"]')!);
    await waitFor(() => expect(h.financeiro).toHaveBeenLastCalledWith("vencidas", 1), ESPERA);
    expect(endereco()).not.toContain("pagina=");
  });
});

describe("hml-14d — Master › Integrações", () => {
  it("o KPI \"Contas\" é o total do banco; a página vem do banco; erro = estado de erro", async () => {
    h.integracoes.mockImplementation(async (n: number) => ({ contas: daPagina(n, (i) => conta(i)), resumo: { pix_manual: 41 }, total: 41 }));
    const r = montar(<Integracoes />, "/master/integracoes?pagina=2");
    await waitFor(() => expect(rotulo("master-integracoes")).toBe("21–40 de 41"));
    expect(h.integracoes).toHaveBeenLastCalledWith(2);
    expect(itens("master-integracoes")).toBe(20);
    expect(document.querySelector('[data-kpi="Contas"]')?.textContent).toContain("41");
    r.unmount();
    h.integracoes.mockRejectedValue(new Error("boom"));
    montar(<Integracoes />, "/master/integracoes");
    expect(await screen.findByText("Não deu para carregar")).toBeInTheDocument();
  });
});

describe("hml-14d — Master › App do aluno", () => {
  const aluno = (i: number): AlunoDoApp => ({
    paciente_id: `p${i}`, user_id: null, nome: `Aluno App ${i}`, email: `a${i}@x.com`, ativo: true, plano: "treino", plano_nome: "Treino", valor: 29.9,
    objetivo: null, teste_ate: null, pago_ate: null, pausada: null, assinatura: null, encerrada_em: null, encerrada_motivo: null, criado_em: "2026-10-01T10:00:00Z",
  });

  it("página + busca no banco (CPF/telefone/e-mail); a busca volta à 1; vazio da busca ≠ vazio do app", async () => {
    h.alunosDoApp.mockImplementation(async (n: number, busca: string) => (busca === "nada"
      ? { alunos: [], conta_id: "app", total: 0 }
      : { alunos: daPagina(n, aluno, 57), conta_id: "app", total: 57 }));
    montar(<AppAluno />, "/master/app-aluno?pagina=2");
    await waitFor(() => expect(rotulo("master-app")).toBe("21–40 de 57"));
    expect(h.alunosDoApp).toHaveBeenLastCalledWith(2, "");
    expect(itens("master-app")).toBe(20);
    fireEvent.change(document.querySelector("[data-busca-app]")!, { target: { value: "123.456" } });
    await waitFor(() => expect(h.alunosDoApp).toHaveBeenLastCalledWith(1, "123.456"), ESPERA);
    expect(endereco()).not.toContain("pagina=");
    fireEvent.change(document.querySelector("[data-busca-app]")!, { target: { value: "nada" } });
    expect(await screen.findByText("Nenhum aluno com essa busca", undefined, ESPERA)).toBeInTheDocument();
    expect(document.querySelector("[data-busca-app]")).not.toBeNull();
  });
});

describe("hml-14d — Master › Alunos (e Sem conta)", () => {
  const aluno = (i: number): Aluno => ({
    paciente_id: `m${i}`, nome: `Aluno ${String(i).padStart(2, "0")}`, email: null, user_id: null, tem_login: false, ativo: true, criado_em: "2026-10-01T10:00:00Z",
    conta: { id: "c1", nome: "Conta 01", origem: "nova", eh_app: false }, personal: null, nutricionista: null, modulos: [], bloqueado: false, conta_bloqueada: false,
    p7: false, app: null,
  });
  const pessoa = (i: number): PessoaSemConta => ({ user_id: `u${i}`, nome: `Pessoa ${i}`, email: `p${i}@x.com`, papel: null, criado_em: "2026-10-01T10:00:00Z", ultimo_acesso: null });
  beforeEach(() => {
    h.listarAlunos.mockImplementation(async (_f: unknown, offset: number, limite: number) => ({
      modo: "ativos", total: 41, offset, limite, alunos: daPagina(offset / 20 + 1, aluno), contas: [{ id: "c1", nome: "Conta 01", origem: "nova", plano: "treino", modulos: ["treino"] }],
      contagens: { ativos: 41, app: 0, p7: 0, sem_conta: 76 },
    }));
    h.semConta.mockImplementation(async (_b: string, n: number) => ({ pessoas: daPagina(n, pessoa, 76), total: 76 }));
  });

  it("20 por página do banco (deslocamento e limite 20), \"Marcar todos\" = a página, a busca no endereço vai ao banco e volta à 1", async () => {
    montar(<Alunos />, "/master/alunos?pagina=2");
    await waitFor(() => expect(rotulo("master-alunos")).toBe("21–40 de 41"));
    expect(h.listarAlunos).toHaveBeenLastCalledWith({ modo: "ativos", conta_id: null, busca: null }, 20, 20);
    expect(itens("master-alunos")).toBe(20);
    expect(document.querySelector("[data-paginas-alunos]")).toBeNull();
    fireEvent.click(document.querySelector("[data-marcar-todos]")!);
    await waitFor(() => expect(document.querySelector("[data-master-mover]")?.textContent).toBe("Mover 20"));
    fireEvent.change(document.querySelector("[data-busca-alunos]")!, { target: { value: "123.456.789-00" } });
    await waitFor(() => expect(h.listarAlunos).toHaveBeenLastCalledWith({ modo: "ativos", conta_id: null, busca: "123.456.789-00" }, 0, 20), ESPERA);
    expect(endereco()).toContain("busca=123.456.789-00");
    expect(endereco()).not.toContain("pagina=");
  }, 15_000);

  it("o endereço com ?busca= e ?pagina= (voltar do perfil do aluno) abre na mesma busca e página", async () => {
    montar(<Alunos />, "/master/alunos?busca=z%C3%A9&pagina=2");
    await waitFor(() => expect(h.listarAlunos).toHaveBeenLastCalledWith({ modo: "ativos", conta_id: null, busca: "zé" }, 20, 20));
    expect((document.querySelector("[data-busca-alunos]") as HTMLInputElement).value).toBe("zé");
  });

  it("Sem conta: a página do banco com o total (76 = 4 páginas), Próxima pede a 2; trocar o modo volta à 1", async () => {
    montar(<Alunos />, "/master/alunos?modo=sem_conta");
    await waitFor(() => expect(rotulo("master-sem-conta")).toBe("1–20 de 76"));
    expect(h.semConta).toHaveBeenLastCalledWith("", 1);
    expect(itens("master-sem-conta")).toBe(20);
    proxima("master-sem-conta");
    await waitFor(() => expect(h.semConta).toHaveBeenLastCalledWith("", 2), ESPERA);
    fireEvent.click(document.querySelector('[data-filtro="ativos"]')!);
    await waitFor(() => expect(h.listarAlunos).toHaveBeenLastCalledWith({ modo: "ativos", conta_id: null, busca: null }, 0, 20), ESPERA);
    expect(endereco()).not.toContain("pagina=");
  });

  it("erro do banco = o estado de erro (nunca \"Nenhum aluno\")", async () => {
    h.listarAlunos.mockRejectedValue(new Error("boom"));
    montar(<Alunos />, "/master/alunos");
    expect(await screen.findByText("Não deu certo agora. Tente de novo.")).toBeInTheDocument();
    expect(screen.queryByText("Nenhum aluno neste filtro")).toBeNull();
  });
});
