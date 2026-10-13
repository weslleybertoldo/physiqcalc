import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AcessosDoAluno } from "@/acessos/tipos";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";

const h = vi.hoisted(() => ({
  ler: vi.fn(),
  series: vi.fn(),
  salvar: vi.fn(),
  salvarSeries: vi.fn(),
  existe: vi.fn(),
  online: true,
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/acessos/api", async (orig) => ({
  ...(await orig<typeof import("@/acessos/api")>()),
  lerAcessos: (...a: unknown[]) => h.ler(...a),
  lerSeries: (...a: unknown[]) => h.series(...a),
  salvarAcesso: (...a: unknown[]) => h.salvar(...a),
  salvarSeries: (...a: unknown[]) => h.salvarSeries(...a),
}));
vi.mock("@/rotas/registro", () => ({ existe: (g: string, n: string) => h.existe(g, n) }));
vi.mock("@/ui/premium/useOnline", () => ({ useOnline: () => h.online }));
vi.mock("sonner", () => ({ toast: h.toast }));

import { ErroAcessos } from "@/acessos/api";
import { ListaDeAcessos } from "./ListaDeAcessos";

const acessos = (o: Partial<AcessosDoAluno> = {}): AcessosDoAluno & { ok: true } => ({
  ok: true, paciente_id: "p1", tem_login: true, modulos: ["treino", "nutricao"], conta_modulos: ["treino", "nutricao"], tem_nutricionista: true,
  pode_mudar: true, linhas: { acesso_app: "liberado", diario_alimentar: "liberado", acesso_link: "liberado", dieta: "ver" },
  mudancas: { acesso_link: { de: "bloqueado", para: "liberado", em: "2026-10-12T20:20:00Z", por_nome: "Ana Paula Souza" } }, ...o,
});

let qc: QueryClient;
function abrir() {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProvedorConfirmar>
        <ListaDeAcessos alunoId="p1" nome="Rafael Moura" />
      </ProvedorConfirmar>
    </QueryClientProvider>,
  );
}
const linha = (chave: string) => document.querySelector(`[data-acessos-linha="${chave}"]`) as HTMLElement | null;
const radio = (chave: string, rotulo: string) => within(linha(chave)!).getByRole("radio", { name: rotulo }) as HTMLInputElement;
const pronta = () => waitFor(() => expect(document.querySelector('[data-aba-acessos="pronto"]')).not.toBeNull());

beforeEach(() => {
  for (const f of [h.ler, h.series, h.salvar, h.salvarSeries, h.existe, h.toast, h.toast.success, h.toast.error]) f.mockReset();
  h.ler.mockResolvedValue(acessos());
  h.series.mockResolvedValue({ ok: true, series: "mexer", pode_mudar: true });
  h.existe.mockReturnValue(false);
  h.online = true;
});

describe("W-A P4 — aba Acessos › as linhas (spec §4.1)", () => {
  it("as 6 linhas na ordem, os níveis marcados, o 'Mudado por', as séries lidas à parte e o resumo do rodapé", async () => {
    abrir();
    await pronta();
    expect(h.ler).toHaveBeenCalledWith("p1");
    await waitFor(() => expect(linha("treino_series")?.getAttribute("data-acessos-estado")).toBe("pronto"));
    expect(h.series).toHaveBeenCalledWith("p1");
    expect([...document.querySelectorAll("[data-acessos-linha]")].map((e) => e.getAttribute("data-acessos-linha"))).toEqual([
      "acesso_app", "treino_series", "dieta", "diario_alimentar", "acesso_link", "rotinas",
    ]);
    expect(radio("acesso_app", "Liberado").checked).toBe(true);
    expect(radio("treino_series", "Pode mexer").checked).toBe(true);
    expect(radio("dieta", "Só ver").checked).toBe(true);
    expect(within(linha("acesso_link")!).getByText("Mudado por Ana em 12/10 17:20")).toBeInTheDocument();
    expect(within(linha("rotinas")!).queryByRole("radio")).toBeNull();
    expect(within(linha("rotinas")!).getByText("Sempre liberadas")).toBeInTheDocument();
    expect(document.querySelector("[data-acessos-resumo]")?.textContent).toBe("App liberado · séries: pode mexer · dieta: só ver · rotinas sempre");
  });

  it("muda na hora (otimista) e salva pela função; deu certo → 'Salvo' e o perfil do aluno relido", async () => {
    let soltar: (v: unknown) => void = () => {};
    h.salvar.mockImplementation(() => new Promise((ok) => (soltar = ok)));
    abrir();
    await pronta();
    const invalidar = vi.spyOn(qc, "invalidateQueries");
    fireEvent.click(radio("acesso_link", "Bloqueado"));
    await waitFor(() => expect(radio("acesso_link", "Bloqueado").checked).toBe(true));
    expect(h.salvar).toHaveBeenCalledWith("p1", "acesso_link", "bloqueado");
    soltar(acessos({ linhas: { ...acessos().linhas, acesso_link: "bloqueado" } }));
    await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith("Salvo"));
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ["aluno-perfil", "p1"] });
    expect(radio("acesso_link", "Bloqueado").checked).toBe(true);
  });

  it("a função recusou → o nível volta e a frase fixa do código aparece", async () => {
    h.salvar.mockRejectedValue(new ErroAcessos("sem_nutricao"));
    abrir();
    await pronta();
    fireEvent.click(radio("dieta", "Pode mexer"));
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith("Só vale para aluno com nutricionista numa conta com Nutrição."));
    await waitFor(() => expect(radio("dieta", "Só ver").checked).toBe(true));
  });

  it("'App: Bloqueado' pede a confirmação do app — Cancelar não grava; 'Bloquear' grava", async () => {
    abrir();
    await pronta();
    fireEvent.click(radio("acesso_app", "Bloqueado"));
    let dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText("Bloquear o app de Rafael?")).toBeInTheDocument();
    fireEvent.click(dialogo.querySelector("[data-confirmar-cancelar]")!);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(h.salvar).not.toHaveBeenCalled();
    expect(radio("acesso_app", "Liberado").checked).toBe(true);
    h.salvar.mockResolvedValue(acessos({ linhas: { ...acessos().linhas, acesso_app: "bloqueado" } }));
    fireEvent.click(radio("acesso_app", "Bloqueado"));
    dialogo = await screen.findByRole("alertdialog");
    fireEvent.click(dialogo.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(h.salvar).toHaveBeenCalledWith("p1", "acesso_app", "bloqueado"));
  });

  it("sem login: o App fica desligado com o aviso; liberar não pede confirmação", async () => {
    h.ler.mockResolvedValue(acessos({ tem_login: false, linhas: { ...acessos().linhas, acesso_app: "bloqueado" } }));
    h.series.mockRejectedValue(new ErroAcessos("sem_treino"));
    abrir();
    await pronta();
    expect(radio("acesso_app", "Liberado").disabled).toBe(true);
    expect(within(linha("acesso_app")!).getByText("Ele ainda não tem login: crie o acesso em Login do aluno.")).toBeInTheDocument();
    await waitFor(() => expect(linha("treino_series")?.getAttribute("data-acessos-estado")).toBe("antes_do_acesso"));
    expect(within(linha("treino_series")!).getByText("Vale depois do 1º acesso do aluno ao app.")).toBeInTheDocument();
    expect(within(linha("treino_series")!).queryByRole("radio")).toBeNull();
    expect(document.querySelector("[data-acessos-resumo]")?.textContent).toBe("App sem login · dieta: só ver · rotinas sempre");
  });
});

describe("W-A P4 — a linha das séries (Banco do Treino, à parte)", () => {
  it("a nutri trava as séries pela treino-acessos: 'Só ver' → salva, 'Salvo' e a aba relida (o 'Mudado por' das séries)", async () => {
    h.salvarSeries.mockResolvedValue({ ok: true, series: "ver", registrado: true });
    abrir();
    await pronta();
    await waitFor(() => expect(linha("treino_series")?.getAttribute("data-acessos-estado")).toBe("pronto"));
    fireEvent.click(radio("treino_series", "Só ver"));
    await waitFor(() => expect(h.salvarSeries).toHaveBeenCalledWith("p1", "ver"));
    await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith("Salvo"));
    await waitFor(() => expect(h.ler).toHaveBeenCalledTimes(2));
    expect(radio("treino_series", "Só ver").checked).toBe(true);
  });

  it("o Treino de OUTRA conta (sem_acesso): só o texto da aba Treino, sem os níveis — as outras linhas seguem", async () => {
    h.series.mockRejectedValue(new ErroAcessos("sem_acesso"));
    abrir();
    await pronta();
    await waitFor(() => expect(linha("treino_series")?.getAttribute("data-acessos-estado")).toBe("outra_conta"));
    expect(linha("treino_series")!.textContent).toContain("Treino de outro personal");
    expect(within(linha("treino_series")!).queryByRole("radio")).toBeNull();
    expect(radio("dieta", "Só ver").disabled).toBe(false);
  });

  it("o erro da linha não derruba as outras; 'Tentar de novo' relê só as séries", async () => {
    // a consulta repete 1 vez o que pode passar sozinho (a rede, o principal fora): as 2 idas falham
    h.series.mockRejectedValue(new ErroAcessos("principal_indisponivel"));
    abrir();
    await pronta();
    await waitFor(() => expect(linha("treino_series")?.getAttribute("data-acessos-estado")).toBe("erro"), { timeout: 4000 });
    expect(h.series).toHaveBeenCalledTimes(2);
    expect(linha("treino_series")!.textContent).toContain("Não deu para ler o Treino agora.");
    expect(radio("acesso_app", "Liberado").checked).toBe(true);
    h.series.mockResolvedValue({ ok: true, series: "mexer", pode_mudar: true });
    fireEvent.click(document.querySelector("[data-acessos-series-tentar]")!);
    await waitFor(() => expect(linha("treino_series")?.getAttribute("data-acessos-estado")).toBe("pronto"));
    expect(h.ler).toHaveBeenCalledTimes(1);
  });

  it("sem o módulo Treino a linha some e a treino-acessos nem é chamada; sem nutricionista: 'Este aluno não tem dieta' e sem diário/link", async () => {
    h.ler.mockResolvedValue(acessos({ modulos: ["nutricao"], tem_nutricionista: false }));
    abrir();
    await pronta();
    expect(linha("treino_series")).toBeNull();
    expect(within(linha("dieta")!).getByText("Este aluno não tem dieta")).toBeInTheDocument();
    expect(within(linha("dieta")!).queryByRole("radio")).toBeNull();
    expect(linha("diario_alimentar")).toBeNull();
    expect(linha("acesso_link")).toBeNull();
    await new Promise((ok) => setTimeout(ok, 20));
    expect(h.series).not.toHaveBeenCalled();
  });
});

describe("W-A P4 — quem só vê, sem internet, as rotinas e o erro da aba", () => {
  it("quem não pode mudar (pode_mudar = false) vê tudo desligado e o aviso", async () => {
    h.ler.mockResolvedValue(acessos({ pode_mudar: false }));
    abrir();
    await pronta();
    expect(document.querySelector("[data-acessos-so-leitura]")).not.toBeNull();
    expect([...document.querySelectorAll<HTMLInputElement>("[data-acessos-radio]")].every((r) => r.disabled)).toBe(true);
  });

  it("sem internet: os níveis desligados com o aviso", async () => {
    h.online = false;
    abrir();
    await pronta();
    expect(document.querySelector("[data-acessos-sem-internet]")?.textContent).toContain("Sem internet");
    expect(radio("acesso_link", "Bloqueado").disabled).toBe(true);
  });

  it("a dica das rotinas aponta para o card Rotinas do Resumo só quando ele existe (a P6)", async () => {
    abrir();
    await pronta();
    expect(linha("rotinas")!.textContent).not.toContain("card Rotinas do Resumo");
    h.existe.mockImplementation((g: string, n: string) => g === "resumoAluno" && n === "CardRotinas");
    abrir();
    await waitFor(() => expect(document.querySelectorAll('[data-acessos-linha="rotinas"]').length).toBe(2));
    expect(document.querySelectorAll('[data-acessos-linha="rotinas"]')[1].textContent).toContain("As suas você cria no card Rotinas do Resumo.");
  });

  it("a aba não abriu (a rede, 2 vezes — a consulta repete 1) → o erro com 'Tentar de novo' (relê); sem acesso não repete", async () => {
    h.ler.mockRejectedValueOnce(new ErroAcessos("rede")).mockRejectedValueOnce(new ErroAcessos("rede"));
    abrir();
    expect(await screen.findByText("Não deu para abrir os acessos", {}, { timeout: 4000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Tentar de novo/ }));
    await pronta();
    h.ler.mockReset();
    h.ler.mockRejectedValue(new ErroAcessos("sem_acesso"));
    abrir();
    expect(await screen.findByText("Você não tem permissão para mudar os acessos deste aluno.")).toBeInTheDocument();
    expect(h.ler).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByRole("button", { name: /Tentar de novo/ })).toHaveLength(0);
  });
});
