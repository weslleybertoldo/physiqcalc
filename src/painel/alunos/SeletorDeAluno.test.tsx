import { useState, type ComponentProps } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AlunoDoSeletor } from "./regras";

const h = vi.hoisted(() => ({ buscar: vi.fn(), porId: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/principal/client", () => ({ PRINCIPAL_SCHEMA: "staging", principal: { rpc: h.rpc, from: h.from, functions: { invoke: vi.fn() } } }));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), buscarAlunosDoSeletor: h.buscar, alunoDoSeletorPorId: h.porId }));

import { SeletorDeAluno } from "./SeletorDeAluno";

const aluno = (o: Partial<AlunoDoSeletor> = {}): AlunoDoSeletor => ({
  id: "p1", nome: "Rafael Moura", apelido: null, email: "rafael@x.com", telefone: "82999990000", cpf: null, foto_url: null, ativo: true,
  bloqueado: false, conta_excluida: false, tem_login: true, personal_id: "u-lucas", nutricionista_id: null, ...o,
});
const fila = (n: number) => Array.from({ length: n }, (_, i) => aluno({ id: `p${i + 1}`, nome: `Aluno ${String(i + 1).padStart(2, "0")}` }));
const ZE = aluno({ id: "ze", nome: "Zé Último", telefone: "82988887777", cpf: "12345678900", email: null });

function adiado<T>() {
  let resolver!: (v: T) => void;
  let rejeitar!: (e: unknown) => void;
  const promessa = new Promise<T>((res, rej) => {
    resolver = res;
    rejeitar = rej;
  });
  return { promessa, resolver, rejeitar };
}

type Props = ComponentProps<typeof SeletorDeAluno>;
/** O campo como os diálogos usam: o valor fica com quem chama. */
function Controlado({ inicial = null, aoMudar, ...p }: Partial<Props> & { inicial?: string | null }) {
  const [valor, setValor] = useState<string | null>(inicial);
  return (
    <SeletorDeAluno campo="agendamento" contaId="c1" {...p} valor={valor}
      aoMudar={(a) => { setValor(a?.id ?? null); aoMudar?.(a); }} />
  );
}

function montar(el: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { qc, ...render(<QueryClientProvider client={qc}>{el}</QueryClientProvider>) };
}

const campo = () => document.querySelector("[data-seletor-aluno-busca]") as HTMLInputElement;
const opcoes = () => [...document.querySelectorAll("[data-opcao-aluno]")].map((b) => b.getAttribute("data-opcao-aluno"));
const digitar = (t: string) => fireEvent.change(campo(), { target: { value: t } });

beforeEach(() => {
  h.buscar.mockReset();
  h.porId.mockReset();
  h.rpc.mockReset();
  h.from.mockReset();
});

describe("SeletorDeAluno (hml-14b, B19 · D16)", () => {
  it('abre e busca no BANCO: os 20 primeiros da conta e "20 de N — refine a busca"', async () => {
    h.buscar.mockResolvedValue({ itens: fila(20), total: 41 });
    montar(<Controlado />);
    expect(document.querySelector('[data-seletor-aluno="agendamento"]')).not.toBeNull();
    expect(document.querySelector("[data-seletor-aluno-lista]")).toBeNull(); // fechada até tocar
    fireEvent.focus(campo());
    await waitFor(() => expect(opcoes()).toHaveLength(20));
    expect(h.buscar).toHaveBeenCalledTimes(1);
    expect(h.buscar).toHaveBeenCalledWith("c1", "", "ativos_e_bloqueados", 20, false); // fora do Recibo, sem o CPF
    const mais = document.querySelector("[data-seletor-aluno-mais]");
    expect(mais?.textContent).toBe("20 de 41 — refine a busca");
    expect(mais?.getAttribute("data-total")).toBe("41");
  });

  it("digitar espera 300 ms e manda o termo ao banco (nome sem acento, CPF e telefone: a regra é do banco)", async () => {
    h.buscar.mockResolvedValue({ itens: [ZE], total: 1 });
    montar(<Controlado situacao="todos" />);
    fireEvent.focus(campo());
    await waitFor(() => expect(h.buscar).toHaveBeenCalledTimes(1));
    digitar("ze");
    digitar("ze ul"); // digitou de novo antes dos 300 ms: o "ze" nem sai
    expect(h.buscar).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(h.buscar).toHaveBeenCalledTimes(2), { timeout: 1500 });
    expect(h.buscar.mock.calls[1]).toEqual(["c1", "ze ul", "todos", 20, false]);
    digitar("123.456.789-00");
    await waitFor(() => expect(h.buscar).toHaveBeenCalledTimes(3), { timeout: 1500 });
    expect(h.buscar.mock.calls[2][1]).toBe("123.456.789-00");
    // a busca pelo CPF é do banco; fora do Recibo o CPF não vem nem aparece na linha (dado pessoal mínimo)
    await waitFor(() => expect(document.querySelector("[data-seletor-aluno-lista]")?.getAttribute("data-termo")).toBe("123.456.789-00"));
    expect(document.querySelector('[data-opcao-aluno="ze"]')?.textContent).not.toContain("CPF");
    expect(document.querySelector("[data-seletor-aluno-mais]")).toBeNull(); // 1 de 1: nada para refinar
  });

  it("só o Recibo pede o CPF ao banco (o recibo imprime o CPF): buscando por número, a linha mostra o CPF que achou", async () => {
    h.buscar.mockResolvedValue({ itens: [ZE], total: 1 });
    const aoMudar = vi.fn();
    const { qc } = montar(<Controlado campo="recibo" aoMudar={aoMudar} />);
    fireEvent.focus(campo());
    await waitFor(() => expect(h.buscar).toHaveBeenCalledWith("c1", "", "ativos_e_bloqueados", 20, true));
    digitar("12345678900");
    await waitFor(() => expect(document.querySelector("[data-seletor-aluno-lista]")?.getAttribute("data-termo")).toBe("12345678900"), { timeout: 1500 });
    expect(h.buscar).toHaveBeenLastCalledWith("c1", "12345678900", "ativos_e_bloqueados", 20, true);
    expect(document.querySelector('[data-opcao-aluno="ze"]')?.textContent).toContain("CPF 123.456.789-00");
    fireEvent.click(document.querySelector('[data-opcao-aluno="ze"]')!);
    expect(aoMudar).toHaveBeenCalledWith(ZE);
    // o escolhido fica no cache COM o CPF (a chave do Recibo); a dos outros campos (sem CPF) não recebe o CPF
    expect(qc.getQueryData(["seletor-aluno", "c1", "ze", "com-cpf"])).toEqual(ZE);
    expect(qc.getQueryData(["seletor-aluno", "c1", "ze", "sem-cpf"])).toBeUndefined();
  });

  it("descarta a resposta velha: digitar rápido nunca deixa o resultado de um termo antigo por cima", async () => {
    const velho = adiado<{ itens: AlunoDoSeletor[]; total: number }>();
    const novo = adiado<{ itens: AlunoDoSeletor[]; total: number }>();
    h.buscar
      .mockResolvedValueOnce({ itens: fila(3), total: 3 })
      .mockReturnValueOnce(velho.promessa)
      .mockReturnValueOnce(novo.promessa);
    montar(<Controlado listaSempreAberta campo="ligar" situacao="todos" />);
    await waitFor(() => expect(opcoes()).toHaveLength(3));
    digitar("ra");
    await waitFor(() => expect(h.buscar).toHaveBeenCalledTimes(2), { timeout: 1500 });
    digitar("ze ult");
    await waitFor(() => expect(h.buscar).toHaveBeenCalledTimes(3), { timeout: 1500 });
    await act(async () => novo.resolver({ itens: [ZE], total: 1 }));
    expect(opcoes()).toEqual(["ze"]);
    // a resposta do "ra" chega DEPOIS: fica de fora
    await act(async () => velho.resolver({ itens: [aluno({ id: "rafa" })], total: 1 }));
    expect(opcoes()).toEqual(["ze"]);
    expect(document.querySelector("[data-seletor-aluno-lista]")?.getAttribute("data-termo")).toBe("ze ult");
  });

  it("o aluno já escolhido é lido pelo id (só da conta); não achou → o nome gravado", async () => {
    h.porId.mockResolvedValue(aluno({ id: "p9", nome: "Ana Lima", email: "ana@x.com", bloqueado: true }));
    const r = montar(<Controlado inicial="p9" />);
    await waitFor(() => expect(document.querySelector('[data-seletor-aluno-escolhido="p9"]')?.textContent).toContain("Ana Lima"));
    expect(h.porId).toHaveBeenCalledWith("c1", "p9", false);
    expect(document.querySelector("[data-seletor-aluno-escolhido]")?.textContent).toContain("bloqueado");
    expect(document.querySelector("[data-seletor-aluno-escolhido]")?.textContent).toContain("ana@x.com");
    expect(h.buscar).not.toHaveBeenCalled(); // a lista só busca quando abre
    r.unmount();
    h.porId.mockResolvedValue(null);
    montar(<Controlado inicial="fora" nomeGravado="Carlos (gravado)" />);
    await waitFor(() => expect(document.querySelector("[data-seletor-aluno-escolhido-estado]")?.getAttribute("data-seletor-aluno-escolhido-estado")).toBe("fora"));
    expect(document.querySelector('[data-seletor-aluno-escolhido="fora"]')?.textContent).toContain("Carlos (gravado)");
  });

  it("escolher devolve o aluno inteiro, guarda no cache (não lê de novo pelo id) e fecha a lista", async () => {
    const aoMudar = vi.fn();
    h.buscar.mockResolvedValue({ itens: [ZE, aluno()], total: 2 });
    montar(<Controlado aoMudar={aoMudar} />);
    fireEvent.focus(campo());
    await waitFor(() => expect(opcoes()).toEqual(["ze", "p1"]));
    fireEvent.click(document.querySelector('[data-opcao-aluno="ze"]')!);
    expect(aoMudar).toHaveBeenCalledWith(ZE);
    expect(document.querySelector('[data-seletor-aluno="agendamento"]')?.getAttribute("data-seletor-aluno-valor")).toBe("ze");
    expect(document.querySelector('[data-seletor-aluno-escolhido="ze"]')?.textContent).toContain("Zé Último");
    expect(document.querySelector("[data-seletor-aluno-lista]")).toBeNull();
    expect(h.porId).not.toHaveBeenCalled();
  });

  it("erro do banco: mostra o erro com Tentar de novo — nunca a lista vazia", async () => {
    h.buscar.mockRejectedValueOnce(new Error("banco fora")).mockResolvedValueOnce({ itens: [ZE], total: 1 });
    montar(<Controlado />);
    fireEvent.focus(campo());
    await waitFor(() => expect(document.querySelector("[data-seletor-aluno-erro]")).not.toBeNull());
    expect(document.querySelector("[data-seletor-aluno-vazio]")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("Não deu para buscar os alunos agora.");
    fireEvent.click(document.querySelector("[data-seletor-aluno-tentar]")!);
    await waitFor(() => expect(opcoes()).toEqual(["ze"]), { timeout: 1500 });
    expect(document.querySelector("[data-seletor-aluno-erro]")).toBeNull();
  });

  it('não achou: "Cadastrar aluno" só no campo que já tinha esse caminho; nos outros, só o aviso', async () => {
    h.buscar.mockResolvedValue({ itens: [], total: 0 });
    const aoCadastrar = vi.fn();
    const r = montar(<Controlado campo="ligar" listaSempreAberta aoCadastrar={aoCadastrar} />);
    await waitFor(() => expect(document.querySelector("[data-seletor-aluno-vazio]")).not.toBeNull());
    expect(document.querySelector("[data-seletor-aluno-vazio]")?.textContent).toContain("Nenhum aluno nesta conta ainda.");
    digitar("ninguém");
    await waitFor(() => expect(document.querySelector("[data-seletor-aluno-lista]")?.getAttribute("data-termo")).toBe("ninguém"), { timeout: 1500 });
    expect(document.querySelector("[data-seletor-aluno-vazio]")?.textContent).toContain("Nenhum aluno com essa busca.");
    fireEvent.click(document.querySelector("[data-seletor-aluno-cadastrar]")!);
    expect(aoCadastrar).toHaveBeenCalledTimes(1);
    r.unmount();
    montar(<Controlado campo="recibo" />);
    fireEvent.focus(campo());
    await waitFor(() => expect(document.querySelector("[data-seletor-aluno-vazio]")).not.toBeNull());
    expect(document.querySelector("[data-seletor-aluno-cadastrar]")).toBeNull();
  });

  it('campo opcional: "Sem aluno" na lista e o × no escolhido tiram o aluno', async () => {
    const aoMudar = vi.fn();
    h.porId.mockResolvedValue(aluno());
    h.buscar.mockResolvedValue({ itens: [aluno()], total: 1 });
    montar(<Controlado inicial="p1" opcional rotuloNenhum="Sem aluno (compromisso avulso)" aoMudar={aoMudar} />);
    await waitFor(() => expect(document.querySelector('[data-seletor-aluno-escolhido="p1"]')?.textContent).toContain("Rafael Moura"));
    fireEvent.click(document.querySelector("[data-seletor-aluno-limpar]")!);
    expect(aoMudar).toHaveBeenLastCalledWith(null);
    expect(document.querySelector("[data-seletor-aluno-escolhido]")).toBeNull();
    fireEvent.focus(campo());
    await waitFor(() => expect(opcoes()).toEqual(["p1"]));
    expect(document.querySelector("[data-opcao-aluno-nenhum]")?.textContent).toContain("Sem aluno (compromisso avulso)");
    fireEvent.click(document.querySelector('[data-opcao-aluno="p1"]')!);
    fireEvent.focus(campo());
    await waitFor(() => expect(document.querySelector("[data-opcao-aluno-nenhum]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-opcao-aluno-nenhum]")!);
    expect(aoMudar).toHaveBeenLastCalledWith(null);
  });

  it("teclado: as setas marcam, Enter escolhe e NUNCA envia o formulário em volta", async () => {
    const enviar = vi.fn((e: React.FormEvent) => e.preventDefault());
    const aoMudar = vi.fn();
    h.buscar.mockResolvedValue({ itens: [ZE, aluno()], total: 2 });
    montar(<form onSubmit={enviar}><Controlado campo="movimentacao" aoMudar={aoMudar} /></form>);
    fireEvent.focus(campo());
    await waitFor(() => expect(opcoes()).toHaveLength(2));
    fireEvent.keyDown(campo(), { key: "ArrowDown" });
    fireEvent.keyDown(campo(), { key: "ArrowDown" });
    expect(campo().getAttribute("aria-activedescendant")).toBe(document.querySelector('[data-opcao-aluno="p1"]')?.id);
    // o Enter é cancelado no campo (o navegador não envia o <form>)
    expect(fireEvent.keyDown(campo(), { key: "Enter" })).toBe(false);
    expect(aoMudar).toHaveBeenCalledWith(aluno());
    expect(enviar).not.toHaveBeenCalled();
  });

  it("sem conta ativa: o campo fica desligado e nada vai ao banco", () => {
    montar(<Controlado contaId="" />);
    expect(campo().disabled).toBe(true);
    expect(campo().placeholder).toMatch(/Sem conta ativa/);
    fireEvent.focus(campo());
    expect(document.querySelector("[data-seletor-aluno-lista]")).toBeNull();
    expect(h.buscar).not.toHaveBeenCalled();
  });
});

describe("hml-14b (B19) — o banco por trás do seletor", () => {
  it("busca: a alunos_da_conta (só a conta, P1) com o termo, a situação, offset 0 e 20 — o CPF (exportar) só quando o campo pede", async () => {
    const api = await vi.importActual<typeof import("./api")>("./api");
    const linha = {
      id: "ze", rota_id: "ze", treino_user_id: null, tem_login: false, nome: "Zé Último", email: null, telefone: "82988887777", foto_url: null, tags: [],
      ativo: true, bloqueado: false, conta_excluida: false, personal: { id: "u-lucas", nome: "Lucas" }, nutricionista: null,
    };
    // sem `exportar` o banco não manda apelido nem CPF (a busca pelo CPF continua lá)
    h.rpc.mockResolvedValue({ data: { ok: true, total: 41, itens: [linha] }, error: null });
    const r = await api.buscarAlunosDoSeletor("c1", "  Zé   Último ", "ativos_e_bloqueados");
    expect(h.rpc).toHaveBeenCalledWith("alunos_da_conta", {
      p_conta: "c1", p_filtros: { situacao: "ativos_e_bloqueados", q: "Zé Último" }, p_offset: 0, p_limite: 20,
    });
    expect(r.total).toBe(41);
    expect(r.itens[0]).toMatchObject({ id: "ze", apelido: null, cpf: null, tem_login: false, personal_id: "u-lucas", nutricionista_id: null });
    // o Recibo (comCpf): com `exportar`, apelido e CPF vêm junto
    h.rpc.mockResolvedValue({ data: { ok: true, total: 1, itens: [{ ...linha, apelido: "Zé", cpf: "12345678900" }] }, error: null });
    const recibo = await api.buscarAlunosDoSeletor("c1", "123.456.789-00", "ativos_e_bloqueados", 20, true);
    expect(h.rpc).toHaveBeenLastCalledWith("alunos_da_conta", {
      p_conta: "c1", p_filtros: { situacao: "ativos_e_bloqueados", q: "123.456.789-00", exportar: "true" }, p_offset: 0, p_limite: 20,
    });
    expect(recibo.itens[0]).toMatchObject({ id: "ze", apelido: "Zé", cpf: "12345678900" });
    // termo vazio: sem `q` (a 1ª página da conta)
    await api.buscarAlunosDoSeletor("c1", "   ", "todos", 50);
    expect(h.rpc).toHaveBeenLastCalledWith("alunos_da_conta", { p_conta: "c1", p_filtros: { situacao: "todos" }, p_offset: 0, p_limite: 50 });
    // erro do banco lança (o seletor mostra o erro)
    h.rpc.mockResolvedValue({ data: null, error: { message: "timeout" } });
    await expect(api.buscarAlunosDoSeletor("c1", "ze", "todos")).rejects.toMatchObject({ codigo: "erro_interno" });
  });

  it("pelo id: só desta conta e fora da lixeira; foto só endereço; o CPF só quando o campo pede; não achou = null", async () => {
    const api = await vi.importActual<typeof import("./api")>("./api");
    const chamadas: unknown[][] = [];
    const resposta = { data: null as unknown, error: null as unknown };
    const cadeia = {
      select: (c: string) => (chamadas.push(["select", c]), cadeia),
      eq: (k: string, v: string) => (chamadas.push(["eq", k, v]), cadeia),
      is: (k: string, v: null) => (chamadas.push(["is", k, v]), cadeia),
      maybeSingle: async () => resposta,
    };
    h.from.mockImplementation((t: string) => (chamadas.push(["from", t]), cadeia));
    const linha = {
      id: "p9", nome: "Ana Lima", apelido: null, email: "ana@x.com", telefone: null, foto_url: "fotos/p9.jpg", ativo: true,
      acesso_bloqueado_em: "2026-10-01T10:00:00Z", user_id: "u9", personal_id: null, nutricionista_id: "u-camila", conta_excluida_em: null,
    };
    resposta.data = linha;
    const a = await api.alunoDoSeletorPorId("c1", "p9");
    expect(chamadas).toEqual([
      ["from", "pacientes"], ["select", expect.stringContaining("conta_excluida_em:config->>conta_excluida_em")],
      ["eq", "id", "p9"], ["eq", "conta_id", "c1"], ["is", "deleted_at", null],
    ]);
    expect(chamadas[1][1]).not.toMatch(/\bcpf\b/); // fora do Recibo, o CPF nem é pedido
    expect(a).toMatchObject({ id: "p9", foto_url: null, bloqueado: true, conta_excluida: false, tem_login: true, cpf: null, nutricionista_id: "u-camila" });
    chamadas.length = 0;
    resposta.data = { ...linha, cpf: "98765432100" };
    const doRecibo = await api.alunoDoSeletorPorId("c1", "p9", true);
    expect(chamadas[1][1]).toMatch(/\bcpf\b/);
    expect(doRecibo).toMatchObject({ id: "p9", cpf: "98765432100" });
    resposta.data = null;
    expect(await api.alunoDoSeletorPorId("c1", "de-outra-conta")).toBeNull();
    resposta.error = { message: "permission denied" };
    await expect(api.alunoDoSeletorPorId("c1", "p9")).rejects.toMatchObject({ codigo: "erro_interno" });
  });
});
