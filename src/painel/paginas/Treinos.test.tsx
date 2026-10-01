import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Catalogo } from "@/painel/treinos/tipos";

const h = vi.hoisted(() => ({
  sessao: { tipo: "ok" } as { tipo: string },
  auth: { user: { id: "u-lucas" }, papel: "professor" } as { user: { id: string } | null; papel: string },
  catalogo: vi.fn(),
  alunos: vi.fn(),
  recebe: vi.fn(),
  dar: vi.fn(),
  tirar: vi.fn(),
  aplicar: vi.fn(),
  prescrever: vi.fn(),
  criarModelo: vi.fn(),
}));
vi.mock("@/ui/casca/treinoDaPagina", () => ({ useTreinoDaPagina: () => h.sessao }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => h.auth }));
vi.mock("@/ui/casca/topo", () => ({
  TopoPagina: ({ titulo, subtitulo, acoes }: { titulo?: ReactNode; subtitulo?: ReactNode; acoes?: ReactNode }) => (
    <header><h1>{titulo}</h1><p data-testid="subtitulo">{subtitulo}</p>{acoes}</header>
  ),
}));
vi.mock("@/ui/casca/SemConexaoTreino", () => ({ SemConexaoTreino: ({ estado }: { estado: { tipo: string } }) => <div data-testid="sem-treino">{estado.tipo}</div> }));
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "staging", supabase: { functions: { invoke: vi.fn() }, from: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock("@/integrations/principal/client", () => ({ PRINCIPAL_SCHEMA: "staging", principal: { rpc: vi.fn(), auth: { getSession: vi.fn() }, functions: { invoke: vi.fn() } } }));
vi.mock("@/painel/treinos/api", async (orig) => ({
  ...(await orig<typeof import("@/painel/treinos/api")>()),
  carregarCatalogo: h.catalogo,
  carregarAlunos: h.alunos,
  carregarQuemRecebe: h.recebe,
  darModelo: h.dar,
  tirarModelo: h.tirar,
  aplicarModeloNoAluno: h.aplicar,
  prescreverModelo: h.prescrever,
  criarModelo: h.criarModelo,
}));

import Treinos from "./Treinos";

const catalogo: Catalogo = {
  modelos: [
    { id: "g1", nome: "Peito e tríceps", professor_id: "u-lucas" },
    { id: "g2", nome: "Costas", professor_id: null },
  ],
  pastas: [{ id: "p1", nome: "Hipertrofia", professor_id: "u-lucas" }],
  vinculos: [{ pasta_id: "p1", grupo_id: "g1" }],
  linhas: [
    { grupo_id: "g1", exercicio_id: "e1", ordem: 0, num_series: 4, reps_alvo: "10", descanso_segundos: 60, carga_sugerida_kg: 60 },
    { grupo_id: "g1", exercicio_id: "e2", ordem: 1, num_series: null, reps_alvo: null, descanso_segundos: null, carga_sugerida_kg: null },
    { grupo_id: "g2", exercicio_id: "e3", ordem: 0, num_series: null, reps_alvo: null, descanso_segundos: null, carga_sugerida_kg: null },
  ],
  exercicios: [
    { id: "e1", nome: "Supino Reto com Barra", grupo_muscular: "Peitoral", emoji: null, tipo: "musculacao", imagem_url: null, subgrupo: "Peitoral médio (esternal)", dica: null, professor_id: null, padrao_movimento: "supino_reto", equipamento: "barra", variacao: null },
    { id: "e2", nome: "Tríceps Pulley", grupo_muscular: "Tríceps", emoji: null, tipo: "musculacao", imagem_url: null, subgrupo: null, dica: null, professor_id: null, padrao_movimento: null, equipamento: "polia", variacao: null },
    { id: "e3", nome: "Puxada Aberta Frontal", grupo_muscular: "Costas", emoji: null, tipo: "musculacao", imagem_url: null, subgrupo: null, dica: null, professor_id: null, padrao_movimento: "puxada_vertical", equipamento: "polia", variacao: null },
    { id: "e4", nome: "Rosca Martelo no Cross", grupo_muscular: "Bíceps / Braquial", emoji: null, tipo: "musculacao", imagem_url: null, subgrupo: null, dica: null, professor_id: "u-lucas", padrao_movimento: "rosca_martelo", equipamento: "polia", variacao: null },
  ],
  musculos: [{ id: "m1", nome: "Peitoral", professor_id: null }],
};

let local = "";
function Onde() {
  const l = useLocation();
  local = l.pathname + l.search;
  return null;
}

function montar(rota = "/painel/treinos") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[rota]}>
        <Treinos />
        <Onde />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.sessao = { tipo: "ok" };
  h.auth = { user: { id: "u-lucas" }, papel: "professor" };
  for (const f of [h.catalogo, h.alunos, h.recebe, h.dar, h.tirar, h.aplicar, h.prescrever, h.criarModelo]) f.mockReset();
  h.catalogo.mockResolvedValue(catalogo);
  h.alunos.mockResolvedValue([
    { id: "a1", nome: "Rafael Moura", email: "rafael@x.com", foto_url: null },
    { id: "a2", nome: "Marina Alves", email: "marina@x.com", foto_url: null },
  ]);
  h.recebe.mockResolvedValue([{ grupo_id: "g1", user_id: "a1" }]);
  h.dar.mockResolvedValue({ ok: true, prescricao_do_modelo: 1 });
  h.prescrever.mockResolvedValue(undefined);
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("W23 — Painel › Treinos › Meus treinos (padrão da tela 8)", () => {
  it("lista o meu e o global; abre o 1º com abas, chips, exercícios com SÉRIES/REPS/DESCANSO/CARGA do modelo e a biblioteca", async () => {
    montar();
    expect(await screen.findByText("Peito e tríceps", { selector: "[data-modelo-item] b" })).toBeInTheDocument();
    const itens = [...document.querySelectorAll("[data-modelo-item]")].map((e) => e.getAttribute("data-modelo-item"));
    expect(itens).toEqual(["Costas", "Peito e tríceps"]);
    // o global abre só para ler (o 1º em ordem de nome)
    await waitFor(() => expect(document.querySelector("[data-modelo-detalhe]")?.getAttribute("data-modelo-nome")).toBe("Costas"));
    expect(screen.getByText("GLOBAL · SÓ LEITURA")).toBeInTheDocument();
    expect(document.querySelector("[data-modelo-adicionar]")).toBeNull();
    expect(document.querySelector("[data-modelo-excluir]")).toBeNull();
    // abre o meu
    fireEvent.click(document.querySelector('[data-modelo="g1"]')!);
    await waitFor(() => expect(document.querySelector("[data-modelo-detalhe]")?.getAttribute("data-modelo-nome")).toBe("Peito e tríceps"));
    expect(local).toContain("treino=g1");
    const card = document.querySelector("[data-modelo-detalhe]") as HTMLElement;
    expect(within(card).getByText("2 EXERCÍCIOS")).toBeInTheDocument();
    expect(within(card).getByText("7 SÉRIES")).toBeInTheDocument(); // 4 + 3
    expect(await within(card).findByText("1 ALUNO")).toBeInTheDocument();
    const supino = card.querySelector('[data-exercicio-nome="Supino Reto com Barra"]') as HTMLElement;
    expect((supino.querySelector('[data-campo-input="series"]') as HTMLInputElement).value).toBe("4");
    expect((supino.querySelector('[data-campo-input="reps"]') as HTMLInputElement).value).toBe("10");
    expect((supino.querySelector('[data-campo-input="descanso"]') as HTMLInputElement).value).toBe("60 s");
    expect((supino.querySelector('[data-campo-input="carga"]') as HTMLInputElement).value).toBe("60 kg");
    // global (81) + os meus com GIF: aqui nenhum tem imagem
    expect(card.querySelector("[data-modelo-adicionar]")?.textContent).toContain("Adicionar exercício da biblioteca (0 com GIF)");
  });

  it("digitar a repetição no exercício sem prescrição grava no MODELO (as séries ficam sem — o aluno usa o padrão dele)", async () => {
    montar("/painel/treinos?treino=g1");
    const card = (await screen.findByText("Tríceps Pulley")).closest("[data-modelo-detalhe]") as HTMLElement;
    const reps = within(card).getByLabelText("reps de Tríceps Pulley") as HTMLInputElement;
    fireEvent.focus(reps);
    fireEvent.change(reps, { target: { value: "12" } });
    fireEvent.blur(reps);
    await waitFor(() => expect(h.prescrever).toHaveBeenCalledWith("g1", "e2", { reps_alvo: "12" }));
  });

  it("digitar os 4 campos em sequência (a gravação anterior ainda a caminho) grava cada um — nenhum se perde", async () => {
    let soltar: () => void = () => undefined;
    h.prescrever.mockImplementation(() => new Promise<void>((r) => { soltar = r; }));
    montar("/painel/treinos?treino=g1");
    const card = (await screen.findByText("Tríceps Pulley")).closest("[data-modelo-detalhe]") as HTMLElement;
    const campo = (k: string) => within(card).getByLabelText(`${k} de Tríceps Pulley`) as HTMLInputElement;
    for (const [k, v] of [["séries", "4"], ["reps", "10"], ["descanso", "90"], ["carga", "40"]] as const) {
      const c = campo(k);
      fireEvent.focus(c);
      fireEvent.change(c, { target: { value: v } });
      fireEvent.blur(c);
    }
    await waitFor(() => expect(h.prescrever).toHaveBeenCalledTimes(4));
    expect(h.prescrever.mock.calls.map((c) => c[2])).toEqual([{ num_series: 4 }, { reps_alvo: "10" }, { descanso_segundos: 90 }, { carga_sugerida_kg: 40 }]);
    soltar();
    // a tela já mostra os 4 (atualizada na hora)
    expect(campo("reps").value).toBe("10");
    expect(campo("carga").value).toBe("40 kg");
  });

  it("quem recebe: marcado = recebe; marcar dá o modelo ao aluno (pela função, com a prescrição do modelo)", async () => {
    montar("/painel/treinos?treino=g1");
    await screen.findByText("Rafael Moura");
    const rafael = document.querySelector('[data-quem-recebe-aluno="a1"]')!;
    const marina = document.querySelector('[data-quem-recebe-aluno="a2"]')!;
    expect(rafael.getAttribute("data-recebe")).toBe("1");
    expect(marina.getAttribute("data-recebe")).toBe("0");
    expect(screen.getByText("1 DE 2")).toBeInTheDocument();
    fireEvent.click(marina);
    await waitFor(() => expect(h.dar).toHaveBeenCalledWith("a2", "g1"));
    // tirar pede confirmação e chama a ação da W15
    h.tirar.mockResolvedValue({ ok: true });
    fireEvent.click(document.querySelector('[data-quem-recebe-aluno="a1"]')!);
    await waitFor(() => expect(h.tirar).toHaveBeenCalledWith("a1", "g1"));
  });

  it("aplicar a quem recebe: a prescrição do modelo nos alunos que já recebem (1 chamada por aluno)", async () => {
    h.aplicar.mockResolvedValue({ ok: true, preenchidos: 1 });
    montar("/painel/treinos?treino=g1");
    fireEvent.click(await screen.findByRole("button", { name: /Aplicar a quem recebe/ }));
    await waitFor(() => expect(h.aplicar).toHaveBeenCalledTimes(1));
    expect(h.aplicar).toHaveBeenCalledWith("a1", "g1");
  });

  it("pasta aberta: os treinos dela viram as abas (A/B/C do programa)", async () => {
    montar("/painel/treinos?t=grupos&pasta=p1");
    await waitFor(() => expect(document.querySelector("[data-pasta-aberta]")?.getAttribute("data-pasta-aberta")).toBe("p1"));
    expect([...document.querySelectorAll("[data-modelo-item]")].map((e) => e.getAttribute("data-modelo-item"))).toEqual(["Peito e tríceps"]);
    expect([...document.querySelectorAll("[data-modelo-aba]")].map((e) => e.textContent)).toEqual(["Peito e tríceps"]);
  });

  it("Novo treino (botão do topo) cria para o personal (professor_id = ele)", async () => {
    h.criarModelo.mockResolvedValue("g9");
    montar();
    await screen.findByText("Peito e tríceps", { selector: "[data-modelo-item] b" });
    fireEvent.click(document.querySelector("[data-btn-novo-treino]")!);
    const campo = await screen.findByPlaceholderText("Ex.: A · Peito e tríceps");
    fireEvent.change(campo, { target: { value: "B · Costas e bíceps" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar treino" }));
    await waitFor(() => expect(h.criarModelo).toHaveBeenCalledWith("B · Costas e bíceps", "u-lucas"));
  });
});

describe("W23 — Biblioteca, links antigos e sem sessão do Treino", () => {
  it("?t=biblioteca&b=minha (link antigo) abre a Biblioteca › Minha com o exercício próprio (movimento e equipamento)", async () => {
    montar("/painel/treinos?t=biblioteca&b=minha");
    const linha = await screen.findByText("Rosca Martelo no Cross");
    const li = linha.closest("[data-exercicio-biblioteca]") as HTMLElement;
    expect(within(li).getByText("Bíceps / Braquial · Rosca martelo · Polia (cabo)")).toBeInTheDocument();
    expect(li.querySelector("[data-exercicio-editar-bib]")).not.toBeNull();
    expect(screen.getByRole("radio", { name: "Minha (1)" })).toHaveAttribute("aria-checked", "true");
  });

  it("a Global é só leitura para o personal (cadeado, sem editar)", async () => {
    montar("/painel/treinos?aba=biblioteca");
    const li = (await screen.findByText("Supino Reto com Barra")).closest("[data-exercicio-biblioteca]") as HTMLElement;
    expect(li.querySelector("[data-exercicio-global]")).not.toBeNull();
    expect(li.querySelector("[data-exercicio-editar-bib]")).toBeNull();
  });

  it("o master edita a Global (e não tem o seletor Global/Minha)", async () => {
    h.auth = { user: { id: "u-master" }, papel: "master" };
    montar("/painel/treinos?aba=biblioteca");
    const li = (await screen.findByText("Supino Reto com Barra")).closest("[data-exercicio-biblioteca]") as HTMLElement;
    expect(li.querySelector("[data-exercicio-editar-bib]")).not.toBeNull();
    expect(screen.queryByRole("radio", { name: /Minha/ })).toBeNull();
  });

  it("quem não tem papel no Treino (o dono que não é personal) só lê: sem Novo treino", async () => {
    h.auth = { user: { id: "u-dono" }, papel: "aluno" };
    montar();
    await screen.findByText("Costas", { selector: "[data-modelo-item] b" });
    expect(document.querySelector("[data-btn-novo-treino]")).toBeNull();
    expect(screen.queryAllByRole("button", { name: /Novo treino/ })).toHaveLength(0);
    expect(document.querySelector("[data-so-ver]")).not.toBeNull();
  });

  it("sem a sessão do Treino: o estado do módulo Treino (W5), sem chamar o banco", async () => {
    h.sessao = { tipo: "sem-papel" };
    montar();
    expect(await screen.findByTestId("sem-treino")).toHaveTextContent("sem-papel");
    expect(h.catalogo).not.toHaveBeenCalled();
  });
});
