import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AlunoDaLista, Catalogo, ExercicioCatalogo, FiltrosExercicios, FiltrosModelos, PerfilRecebe } from "@/painel/treinos/tipos";

// hml-14d (B21): o "banco" falso faz o que as RPCs e as funções fazem — página de 20, total, busca sem acento, pasta e escopo —
// para a tela ser provada com a página que vem de fora (nenhuma lista inteira desce)
const norm = (t: string) => (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const h = vi.hoisted(() => ({
  sessao: { tipo: "ok" } as { tipo: string },
  auth: { user: { id: "u-lucas" }, papel: "professor" } as { user: { id: string } | null; papel: string },
  dados: null as unknown as Catalogo,
  alunos: [] as AlunoDaLista[],
  perfis: [] as { grupo_id: string; user_id: string }[],
  pagina: vi.fn(),
  porId: vi.fn(),
  pastas: vi.fn(),
  musculos: vi.fn(),
  exercicios: vi.fn(),
  recebe: vi.fn(),
  recebeLista: vi.fn(),
  buscarAlunos: vi.fn(),
  historicoMes: vi.fn(),
  historicoCompleto: vi.fn(),
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
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "staging", supabase: { functions: { invoke: vi.fn() }, from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock("@/integrations/principal/client", () => ({ PRINCIPAL_SCHEMA: "staging", principal: { rpc: vi.fn(), auth: { getSession: vi.fn() }, functions: { invoke: vi.fn() } } }));
vi.mock("@/painel/treinos/api", async (orig) => ({
  ...(await orig<typeof import("@/painel/treinos/api")>()),
  carregarPaginaDeModelos: h.pagina,
  carregarModeloPorId: h.porId,
  carregarPastas: h.pastas,
  carregarMusculos: h.musculos,
  listarExercicios: h.exercicios,
  carregarQuemRecebe: h.recebe,
  carregarQuemRecebeLista: h.recebeLista,
  buscarAlunosDoTreino: h.buscarAlunos,
  carregarHistoricoDoMes: h.historicoMes,
  carregarHistoricoCompleto: h.historicoCompleto,
  darModelo: h.dar,
  tirarModelo: h.tirar,
  aplicarModeloNoAluno: h.aplicar,
  prescreverModelo: h.prescrever,
  criarModelo: h.criarModelo,
}));

import Treinos from "./Treinos";

const meuId = () => h.auth.user?.id ?? null;
const visivel = (r: { professor_id: string | null }) => !r.professor_id || r.professor_id === meuId();

function paginaFalsa(_meu: string | null, f: FiltrosModelos, pagina: number) {
  const d = h.dados;
  const modelos = d.modelos.filter(visivel);
  const pastasVis = new Set(d.pastas.filter(visivel).map((p) => p.id));
  const exVis = new Map(d.exercicios.filter(visivel).map((e) => [e.id, e]));
  const t = norm(f.q);
  const filtrados = modelos
    .filter((m) => !f.pasta || d.vinculos.some((v) => v.pasta_id === f.pasta && v.grupo_id === m.id && pastasVis.has(v.pasta_id)))
    .filter((m) => !t || norm(m.nome).includes(t) || d.linhas.some((l) => l.grupo_id === m.id && norm(exVis.get(l.exercicio_id)?.nome ?? "").includes(t)))
    .sort((a, b) => norm(a.nome).localeCompare(norm(b.nome)) || a.id.localeCompare(b.id));
  const itens = filtrados.slice((pagina - 1) * 20, pagina * 20);
  const ids = new Set(itens.map((m) => m.id));
  const porPasta: Record<string, number> = {};
  for (const v of d.vinculos) if (pastasVis.has(v.pasta_id) && modelos.some((m) => m.id === v.grupo_id)) porPasta[v.pasta_id] = (porPasta[v.pasta_id] ?? 0) + 1;
  const linhas = d.linhas.filter((l) => ids.has(l.grupo_id));
  return {
    itens, total: filtrados.length, totalGeral: modelos.length, porPasta,
    detalhes: { linhas, exercicios: [...exVis.values()].filter((e) => linhas.some((l) => l.exercicio_id === e.id)), vinculos: d.vinculos.filter((v) => ids.has(v.grupo_id)) },
  };
}
function porIdFalso(_meu: string | null, id: string) {
  const m = h.dados.modelos.find((x) => x.id === id && visivel(x)) ?? null;
  const linhas = m ? h.dados.linhas.filter((l) => l.grupo_id === m.id) : [];
  return { modelo: m, detalhes: { linhas, exercicios: h.dados.exercicios.filter((e) => visivel(e) && linhas.some((l) => l.exercicio_id === e.id)), vinculos: h.dados.vinculos.filter((v) => v.grupo_id === m?.id) } };
}
const primario = (gm: string) => norm((gm || "").split("/")[0]);
function exerciciosFalsos(f: FiltrosExercicios, pagina: number, porPagina = 20) {
  const eu = meuId();
  const escopo = (e: ExercicioCatalogo) =>
    f.professor ? !e.professor_id || e.professor_id === f.professor
      : f.escopo === "global" ? !e.professor_id : f.escopo === "minha" ? e.professor_id === eu : !e.professor_id || e.professor_id === eu;
  const noEscopo = h.dados.exercicios.filter(escopo);
  const t = norm(f.q ?? "");
  const filtrados = noEscopo
    .filter((e) => !f.musculos?.length || f.musculos.includes(primario(e.grupo_muscular)))
    .filter((e) => !f.fora?.length || !f.fora.includes(primario(e.grupo_muscular)))
    .filter((e) => (!t && !f.codigos?.length) || (t && [e.nome, e.grupo_muscular, e.subgrupo, e.variacao].some((x) => norm(x ?? "").includes(t))) || f.codigos?.includes(e.padrao_movimento ?? "") || f.codigos?.includes(e.equipamento ?? ""))
    .sort((a, b) => norm(a.nome).localeCompare(norm(b.nome)) || a.id.localeCompare(b.id));
  return {
    itens: filtrados.slice((pagina - 1) * porPagina, pagina * porPagina), total: filtrados.length,
    totalGlobal: h.dados.exercicios.filter((e) => !e.professor_id).length, totalMeu: h.dados.exercicios.filter((e) => e.professor_id === eu).length,
    totalProfessores: 0, comGif: noEscopo.filter((e) => e.imagem_url).length, totalEscopo: noEscopo.length, semClassificacao: 0,
  };
}
function recebeListaFalsa(grupo: string, busca: string, pagina: number) {
  const recebem = new Set(h.perfis.filter((p) => p.grupo_id === grupo).map((p) => p.user_id));
  const t = norm(busca);
  const todos = h.alunos.map((a) => ({ ...a, recebe: recebem.has(a.id) }));
  const filtrados = todos.filter((a) => !t || norm(`${a.nome} ${a.email}`).includes(t))
    .sort((a, b) => Number(b.recebe) - Number(a.recebe) || a.nome.localeCompare(b.nome, "pt-BR") || a.id.localeCompare(b.id));
  return { grupo, itens: filtrados.slice((pagina - 1) * 20, pagina * 20), total: filtrados.length, totalRecebem: todos.filter((a) => a.recebe).length, totalAlunos: todos.length };
}

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

/** 41 treinos do Lucas ("HOMOLOG Treino 01".."41") + os 2 de cima; o 07 tem a "Remada Cavalinho Ímpar"; 5 na pasta p1. */
function catalogoGrande(): Catalogo {
  const modelos = [...catalogo.modelos];
  for (let i = 1; i <= 41; i++) modelos.push({ id: `h${String(i).padStart(2, "0")}`, nome: `HOMOLOG Treino ${String(i).padStart(2, "0")}`, professor_id: "u-lucas" });
  return {
    ...catalogo,
    modelos,
    vinculos: [...catalogo.vinculos, ...["h01", "h02", "h03", "h04"].map((g) => ({ pasta_id: "p1", grupo_id: g }))],
    linhas: [...catalogo.linhas, { grupo_id: "h07", exercicio_id: "e9", ordem: 0, num_series: null, reps_alvo: null, descanso_segundos: null, carga_sugerida_kg: null }],
    exercicios: [...catalogo.exercicios, { ...catalogo.exercicios[2], id: "e9", nome: "Remada Cavalinho Ímpar" }],
  };
}

let local = "";
function Onde() {
  const l = useLocation();
  local = l.pathname + l.search;
  return null;
}

function montar(rota = "/painel/treinos") {
  // as consultas da tela repetem 1 vez (como antes): aqui sem a espera de 1 s entre as tentativas
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 1 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter useTransitions={false} initialEntries={[rota]}>
        <Treinos />
        <Onde />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.sessao = { tipo: "ok" };
  h.auth = { user: { id: "u-lucas" }, papel: "professor" };
  h.dados = catalogo;
  h.alunos = [
    { id: "a1", nome: "Rafael Moura", email: "rafael@x.com", foto_url: null },
    { id: "a2", nome: "Marina Alves", email: "marina@x.com", foto_url: null },
  ];
  h.perfis = [{ grupo_id: "g1", user_id: "a1" }];
  for (const f of [h.pagina, h.porId, h.pastas, h.musculos, h.exercicios, h.recebe, h.recebeLista, h.buscarAlunos, h.historicoMes, h.historicoCompleto, h.dar, h.tirar, h.aplicar, h.prescrever, h.criarModelo]) f.mockReset();
  h.pagina.mockImplementation(async (m: string | null, f: FiltrosModelos, p: number) => paginaFalsa(m, f, p));
  h.porId.mockImplementation(async (m: string | null, id: string) => porIdFalso(m, id));
  h.pastas.mockImplementation(async () => h.dados.pastas.filter(visivel));
  h.musculos.mockImplementation(async () => h.dados.musculos);
  h.exercicios.mockImplementation(async (f: FiltrosExercicios, p: number, n?: number) => exerciciosFalsos(f, p, n));
  h.recebe.mockImplementation(async (grupos: string[]) => h.perfis.filter((x) => grupos.includes(x.grupo_id)) as PerfilRecebe[]);
  h.recebeLista.mockImplementation(async (g: string, b: string, p: number) => recebeListaFalsa(g, b, p));
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
    // global + os meus com GIF (a contagem do banco): aqui nenhum tem imagem
    expect(card.querySelector("[data-modelo-adicionar]")?.textContent).toContain("Adicionar exercício da biblioteca (0 com GIF)");
    // a lista é a página do banco: só os detalhes dos treinos da página, e a lista de alunos inteira não é mais baixada
    expect(h.pagina).toHaveBeenCalledWith("u-lucas", { q: "", pasta: null }, 1);
    expect(document.querySelector('[data-lista="modelos"]')?.querySelectorAll("[data-item]")).toHaveLength(2);
    expect(document.querySelector('[data-paginacao="modelos"] [data-paginacao-rotulo]')?.textContent).toBe("1–2 de 2");
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
    // hml-14d (B19): a busca fica SEMPRE à vista (antes só com mais de 6 alunos)
    expect(document.querySelector("[data-quem-recebe-busca]")).not.toBeNull();
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
    expect(h.recebe).toHaveBeenCalledWith(["g1"]);
  });

  it("pasta aberta: os treinos dela viram as abas (A/B/C do programa)", async () => {
    montar("/painel/treinos?t=grupos&pasta=p1");
    await waitFor(() => expect(document.querySelector("[data-pasta-aberta]")?.getAttribute("data-pasta-aberta")).toBe("p1"));
    await waitFor(() => expect([...document.querySelectorAll("[data-modelo-item]")].map((e) => e.getAttribute("data-modelo-item"))).toEqual(["Peito e tríceps"]));
    expect([...document.querySelectorAll("[data-modelo-aba]")].map((e) => e.textContent)).toEqual(["Peito e tríceps"]);
    expect(h.pagina).toHaveBeenLastCalledWith("u-lucas", { q: "", pasta: "p1" }, 1);
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

describe("hml-14d (B21 · D23) — Meus treinos em páginas de 20 do banco", () => {
  beforeEach(() => {
    h.dados = catalogoGrande();
  });

  it("'1–20 de 43', Próxima até a última (o 43º aparece), ?pagina= no endereço; abrir um treino mantém a página", async () => {
    montar();
    await waitFor(() => expect(document.querySelector('[data-paginacao="modelos"] [data-paginacao-rotulo]')?.textContent).toBe("1–20 de 43"));
    expect(document.querySelector('[data-lista="modelos"]')!.querySelectorAll("[data-item]")).toHaveLength(20);
    expect(document.querySelector("[data-meus-treinos]")?.getAttribute("data-meus-treinos")).toBe("43");
    fireEvent.click(document.querySelector('[data-paginacao="modelos"] [data-pagina-proxima]')!);
    await waitFor(() => expect(local).toContain("pagina=2"));
    await waitFor(() => expect(h.pagina).toHaveBeenLastCalledWith("u-lucas", { q: "", pasta: null }, 2));
    fireEvent.click(document.querySelector('[data-paginacao="modelos"] [data-pagina-proxima]')!);
    await waitFor(() => expect(document.querySelector('[data-paginacao="modelos"] [data-paginacao-rotulo]')?.textContent).toBe("41–43 de 43"));
    expect([...document.querySelectorAll("[data-modelo-item]")].map((e) => e.getAttribute("data-modelo-item"))).toEqual(["HOMOLOG Treino 40", "HOMOLOG Treino 41", "Peito e tríceps"]);
    fireEvent.click(document.querySelector('[data-modelo="h41"]')!);
    await waitFor(() => expect(document.querySelector("[data-modelo-detalhe]")?.getAttribute("data-modelo-nome")).toBe("HOMOLOG Treino 41"));
    expect(local).toContain("pagina=3");
    expect(local).toContain("treino=h41");
  });

  it("a busca vai ao banco (nome do treino ou de um EXERCÍCIO dele, 300 ms) e volta à página 1; a pasta conta pelo banco", async () => {
    montar("/painel/treinos?pagina=3");
    await waitFor(() => expect(document.querySelector('[data-paginacao="modelos"] [data-paginacao-rotulo]')?.textContent).toBe("41–43 de 43"));
    expect(document.querySelector('[data-pasta="p1"] [data-pasta-total]')?.textContent).toBe("5");
    fireEvent.change(document.querySelector("[data-busca-modelos]")!, { target: { value: "impar" } });
    await waitFor(() => expect(h.pagina).toHaveBeenLastCalledWith("u-lucas", { q: "impar", pasta: null }, 1));
    await waitFor(() => expect([...document.querySelectorAll("[data-modelo-item]")].map((e) => e.getAttribute("data-modelo-item"))).toEqual(["HOMOLOG Treino 07"]));
    expect(local).not.toContain("pagina=");
    expect(document.querySelector('[data-paginacao="modelos"] [data-paginacao-rotulo]')?.textContent).toBe("1–1 de 1");
  });

  it("?treino=<id fora da página> abre pelo id estando na página 1", async () => {
    montar("/painel/treinos?treino=h41");
    await waitFor(() => expect(document.querySelector("[data-modelo-detalhe]")?.getAttribute("data-modelo-nome")).toBe("HOMOLOG Treino 41"));
    expect(h.porId).toHaveBeenCalledWith("u-lucas", "h41");
    expect(document.querySelector('[data-paginacao="modelos"] [data-paginacao-rotulo]')?.textContent).toBe("1–20 de 43");
    expect(document.querySelector('[data-modelo="h41"]')).toBeNull();
  });

  it("erro do banco na página: o estado de erro (nunca a lista vazia), e Tentar de novo relê", async () => {
    h.pagina.mockRejectedValueOnce(new Error("statement timeout")).mockRejectedValueOnce(new Error("statement timeout"));
    montar();
    expect(await screen.findByText("Não deu para abrir os treinos")).toBeInTheDocument();
    expect(document.querySelector('[data-lista="modelos"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Tentar/ }));
    await waitFor(() => expect(document.querySelector('[data-paginacao="modelos"] [data-paginacao-rotulo]')?.textContent).toBe("1–20 de 43"));
  });
});

describe("hml-14d (B19/B21 · D25) — Quem recebe pelo servidor", () => {
  it("25 alunos: a 1ª página com quem recebe primeiro, '1–20 de 25', ?pagina_recebe=; a busca vai à função e volta à 1", async () => {
    h.alunos = Array.from({ length: 25 }, (_, i) => ({ id: `a${i + 1}`, nome: i === 24 ? "Zé Último" : `Aluno ${String(i + 1).padStart(2, "0")}`, email: `a${i + 1}@x.com`, foto_url: null }));
    h.perfis = [{ grupo_id: "g1", user_id: "a25" }];
    montar("/painel/treinos?treino=g1");
    await waitFor(() => expect(document.querySelector('[data-paginacao="quem-recebe"] [data-paginacao-rotulo]')?.textContent).toBe("1–20 de 25"));
    const lista = document.querySelector('[data-lista="quem-recebe"]')!;
    expect(lista.querySelectorAll("[data-item]")).toHaveLength(20);
    expect(lista.querySelector("[data-quem-recebe-aluno]")?.getAttribute("data-quem-recebe-aluno")).toBe("a25");
    expect(screen.getByText("1 DE 25")).toBeInTheDocument();
    fireEvent.click(document.querySelector('[data-paginacao="quem-recebe"] [data-pagina-proxima]')!);
    await waitFor(() => expect(local).toContain("pagina_recebe=2"));
    await waitFor(() => expect(h.recebeLista).toHaveBeenLastCalledWith("g1", "", 2));
    fireEvent.change(document.querySelector("[data-quem-recebe-busca]")!, { target: { value: "ze ultimo" } });
    await waitFor(() => expect(h.recebeLista).toHaveBeenLastCalledWith("g1", "ze ultimo", 1));
    await waitFor(() => expect([...document.querySelectorAll("[data-quem-recebe-aluno]")].map((e) => e.getAttribute("data-quem-recebe-aluno"))).toEqual(["a25"]));
    expect(local).not.toContain("pagina_recebe=");
  });

  it("erro da função: o estado de erro do cartão (nunca 'nenhum aluno')", async () => {
    h.recebeLista.mockRejectedValue(new Error("internal"));
    montar("/painel/treinos?treino=g1");
    expect(await screen.findByText("Não deu para abrir os alunos")).toBeInTheDocument();
    expect(document.querySelector("[data-quem-recebe-vazio]")).toBeNull();
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
    expect(screen.getByRole("radio", { name: "Global (3)" })).toBeInTheDocument();
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

  it("hml-14d: o grupo e a busca vão ao banco (músculos do grupo; os rótulos viram códigos), a página e o total vêm de lá", async () => {
    montar("/painel/treinos?aba=biblioteca");
    await screen.findByText("Supino Reto com Barra");
    expect(h.exercicios).toHaveBeenCalledWith({ escopo: "global" }, 1);
    expect(document.querySelector('[data-paginacao="biblioteca"] [data-paginacao-rotulo]')?.textContent).toBe("1–3 de 3");
    fireEvent.click(document.querySelector('[data-filtro-grupo="costas"]')!);
    await waitFor(() => expect(h.exercicios).toHaveBeenLastCalledWith(expect.objectContaining({ escopo: "global", musculos: expect.arrayContaining(["costas", "dorsal"]) }), 1));
    await waitFor(() => expect([...document.querySelectorAll("[data-exercicio-biblioteca-nome]")].map((e) => e.getAttribute("data-exercicio-biblioteca-nome"))).toEqual(["Puxada Aberta Frontal"]));
    fireEvent.click(document.querySelector('[data-filtro-grupo="todos"]')!);
    fireEvent.change(document.querySelector("[data-biblioteca-busca-painel]")!, { target: { value: "cabo" } });
    await waitFor(() => expect(h.exercicios).toHaveBeenLastCalledWith({ escopo: "global", q: "cabo", codigos: ["polia"] }, 1));
    await waitFor(() => expect([...document.querySelectorAll("[data-exercicio-biblioteca-nome]")].map((e) => e.getAttribute("data-exercicio-biblioteca-nome"))).toEqual(["Puxada Aberta Frontal", "Tríceps Pulley"]));
    expect(document.querySelector('[data-lista="biblioteca"]')?.querySelectorAll("[data-item]")).toHaveLength(2);
  });

  it("hml-14d: erro do banco na biblioteca → o estado de erro", async () => {
    h.exercicios.mockRejectedValue(new Error("statement timeout"));
    montar("/painel/treinos?aba=biblioteca");
    expect(await screen.findByText("Não deu para abrir a biblioteca")).toBeInTheDocument();
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
    expect(h.pagina).not.toHaveBeenCalled();
  });
});

describe("hml-14d (B19/B21 · D26) — Histórico com o seletor do Treino e o mês em páginas", () => {
  const item = (i: number, userId = "a1") => ({
    chave: `h:${i}`, userId, pessoa: userId === "a1" ? "Rafael Moura" : "Marina Alves", data: `2026-10-${String(1 + (i % 28)).padStart(2, "0")}`, diaSemana: "SEG",
    nomeTreino: `Treino ${i}`, duracaoSegundos: 60, totalExercicios: 3, academia: null, comCronometro: true,
  });

  it("'1–20 de 41' do servidor; o aluno do seletor (busca no banco) vai como userId e a página volta à 1", async () => {
    h.historicoMes.mockImplementation(async (_a: number, _m: number, p: number, userId?: string | null) => {
      const todos = Array.from({ length: 41 }, (_, i) => item(i, i % 2 ? "a2" : "a1")).filter((x) => !userId || x.userId === userId);
      return { itens: todos.slice((p - 1) * 20, p * 20), total: todos.length };
    });
    h.buscarAlunos.mockImplementation(async (_q: unknown, termo: string) => {
      const todos = h.alunos.filter((a) => !termo || norm(a.nome).includes(norm(termo)));
      return { itens: todos, total: todos.length };
    });
    montar("/painel/treinos?aba=historico");
    await waitFor(() => expect(document.querySelector('[data-paginacao="historico-mes"] [data-paginacao-rotulo]')?.textContent).toBe("1–20 de 41"));
    expect(document.querySelector('[data-lista="historico-mes"]')?.querySelectorAll("[data-item]")).toHaveLength(20);
    expect(document.querySelector("[data-historico-contagem]")?.textContent).toBe("41 TREINOS");
    fireEvent.click(document.querySelector('[data-paginacao="historico-mes"] [data-pagina-proxima]')!);
    await waitFor(() => expect(local).toContain("pagina=2"));
    const busca = document.querySelector('[data-seletor-aluno-treino="historico"] [data-seletor-aluno-treino-busca]') as HTMLInputElement;
    expect(document.querySelector("[data-seletor-aluno]")).toBeNull(); // o atributo da 14b não colide
    fireEvent.focus(busca);
    fireEvent.change(busca, { target: { value: "rafa" } });
    await waitFor(() => expect(h.buscarAlunos).toHaveBeenLastCalledWith(expect.anything(), "rafa"));
    fireEvent.click(await screen.findByText("Rafael Moura", { selector: "[data-opcao-aluno-treino] b" }));
    await waitFor(() => expect(h.historicoMes).toHaveBeenLastCalledWith(expect.any(Number), expect.any(Number), 1, "a1"));
    await waitFor(() => expect(document.querySelector('[data-paginacao="historico-mes"] [data-paginacao-rotulo]')?.textContent).toBe("1–20 de 21"));
    expect(document.querySelector("[data-seletor-aluno-treino]")?.getAttribute("data-seletor-aluno-treino-valor")).toBe("a1");
    expect(local).not.toContain("pagina=");
    // todo o histórico do aluno: a folha com a página dela (20 + o total do servidor)
    h.historicoCompleto.mockImplementation(async (_u: string, p: number) => ({
      itens: Array.from({ length: 20 }, (_, i) => ({ id: `t${p}-${i}`, nome_treino: `T${i}`, iniciado_em: "2026-10-05T10:00:00Z", concluido_em: "2026-10-05T11:00:00Z", duracao_segundos: 60, exercicios_concluidos: [] })),
      total: 52,
    }));
    fireEvent.click(document.querySelector("[data-historico-completo-abrir]")!);
    await waitFor(() => expect(document.body.querySelector('[data-paginacao="historico-aluno"] [data-paginacao-rotulo]')?.textContent).toBe("1–20 de 52"));
    expect(h.historicoCompleto).toHaveBeenLastCalledWith("a1", 1);
    await act(async () => {
      fireEvent.click(document.body.querySelector('[data-paginacao="historico-aluno"] [data-pagina-proxima]')!);
    });
    await waitFor(() => expect(h.historicoCompleto).toHaveBeenLastCalledWith("a1", 2));
  });

  it("'Todos os alunos' volta ao mês de todos; erro do servidor → o estado de erro", async () => {
    h.historicoMes.mockImplementation(async (_a: number, _m: number, _p: number, userId?: string | null) => {
      if (userId === "a2") throw new Error("internal");
      return { itens: [item(userId ? 2 : 1)], total: 1 };
    });
    h.buscarAlunos.mockResolvedValue({ itens: h.alunos, total: 2 });
    montar("/painel/treinos?aba=historico");
    await screen.findByText("Treino 1");
    const busca = document.querySelector("[data-seletor-aluno-treino-busca]") as HTMLInputElement;
    fireEvent.focus(busca);
    fireEvent.click(await screen.findByText("Marina Alves", { selector: "[data-opcao-aluno-treino] b" }));
    expect(await screen.findByText("Não deu para abrir o histórico")).toBeInTheDocument();
    fireEvent.focus(busca);
    fireEvent.click(await screen.findByText("Todos os alunos"));
    // o mês de todos volta (do cache: já tinha sido lido), sem o aluno no seletor
    expect(await screen.findByText("Treino 1")).toBeInTheDocument();
    expect(document.querySelector("[data-seletor-aluno-treino]")?.getAttribute("data-seletor-aluno-treino-valor")).toBe("");
    expect(h.historicoMes.mock.calls.every((c) => c[3] === undefined || c[3] === "a2")).toBe(true);
  });
});
