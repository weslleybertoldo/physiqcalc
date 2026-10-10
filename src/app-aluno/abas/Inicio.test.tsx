import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { montarSerie } from "@/evolucao/serie";

// O Início (W12) com os cards DE VERDADE (registro por convenção) sobre fontes falsas: o SQLite do PowerSync (a leitura da aba
// Treino), a dieta (useDieta da W11), a evolução (W10) e o Perfil (W7). Sem rede.
const h = vi.hoisted(() => {
  const cache = new Map<string, unknown[]>();
  const chave = (sql: string) => {
    const s = sql.replace(/\s+/g, " ");
    if (s.includes("UNION ALL")) return "busca";
    if (s.includes("FROM physiq_profiles")) return "perfil";
    if (s.includes("FROM tb_grupos_treino ORDER")) return "grupos";
    if (s.includes("FROM tb_grupos_treino_usuario")) return "gruposPessoais";
    if (s.includes("FROM tb_semana_treinos s")) return "semana";
    if (s.includes("FROM tb_semana_dia_config")) return "diaConfig";
    if (s.includes("FROM tb_treino_dia_override")) return "overrides";
    if (s.includes("SELECT DISTINCT data_treino FROM tb_treino_concluido")) return "concluidosMes";
    if (s.includes("FROM tb_treino_concluido")) return "concluidos";
    if (s.includes("FROM tb_grupos_exercicios ge")) return "gruposEx";
    if (s.includes("FROM tb_grupos_exercicios_usuario geu")) return "gruposExUsuario";
    if (s.includes("FROM tb_exercicios_usuario")) return "exUsuario";
    if (s.includes("FROM tb_exercicios")) return "catalogo";
    if (s.includes("FROM exercicio_substituicao_usuario")) return "subst";
    if (s.includes("FROM tb_series_padrao_usuario")) return "seriesPadrao";
    if (s.includes("FROM tb_academias")) return "academias";
    if (s.includes("FROM tb_treino_series")) return "series";
    return "outro";
  };
  return {
    cache,
    chave,
    sql: {} as Record<string, unknown[]>,
    hasSynced: true,
    buscaCarregando: false,
    modulos: ["treino", "nutricao"] as string[],
    situacao: null as null | Record<string, unknown>,
    treino: { estado: "pronto", erro: null } as { estado: string; erro: string | null },
    authUser: { id: "t1", user_metadata: {} } as null | { id: string; user_metadata: Record<string, unknown> },
    dieta: null as null | Record<string, unknown>,
    ev: null as null | Record<string, unknown>,
    perfil: null as null | Record<string, unknown>,
    agenda: [] as unknown[],
    marcarMeta: vi.fn(async () => {}),
    db: {
      getAll: vi.fn(async () => []),
      execute: vi.fn(async () => {}),
      getUploadQueueStats: vi.fn(async () => ({ count: 0 })),
    },
  };
});

vi.mock("@powersync/react", () => ({
  usePowerSync: () => h.db,
  useQuery: (sql: string) => {
    const k = h.chave(sql);
    if (k === "busca" && h.buscaCarregando) return { data: undefined, isLoading: true, isFetching: true, error: undefined };
    if (!h.cache.has(k)) h.cache.set(k, h.sql[k] ?? []);
    return { data: h.cache.get(k), isLoading: false, isFetching: false, error: undefined };
  },
  useStatus: () => ({ connected: true, hasSynced: h.hasSynced, dataFlowStatus: {} }),
}));
vi.mock("@/ui/casca/dadosCasca", () => ({
  useDadosCasca: () => ({ modulosAluno: h.modulos, usuario: { id: "p1", nome: "Diego Almeida", email: "d@x", fotoUrl: null } }),
}));
vi.mock("@/nucleo/sessao", () => ({
  useSessao: () => ({ usuario: { id: "p1" }, situacao: h.situacao, treino: h.treino, tentarTreinoDeNovo: vi.fn() }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: h.authUser, isStaff: false }) }));
vi.mock("@/nutricao/app/useDieta", () => ({ useDieta: () => h.dieta }));
vi.mock("@/evolucao/useEvolucaoDoAluno", () => ({ useEvolucaoDoAluno: () => h.ev }));
vi.mock("@/app-aluno/perfil/pecas/api", () => ({ meuPerfilAluno: async () => h.perfil, minhaAgenda: async () => h.agenda }));
vi.mock("@/ui/premium/Sino", () => ({ Sino: () => <button type="button">Avisos</button> }));
vi.mock("@/app-aluno/AppAlunoLayout", () => ({ AvisosDoTopo: () => <div data-testid="avisos-topo" /> }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false }, registerPlugin: () => ({}) }));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: { cancel: vi.fn(), schedule: vi.fn() } }));
vi.mock("@/lib/nativeNotifications", () => ({
  agendarAvisosTreinoLongo: vi.fn(async () => {}),
  cancelarAvisosTreinoLongo: vi.fn(async () => {}),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

import Inicio from "./Inicio";

// ───────────── as fontes ─────────────
const EXS = [
  ["e1", "Supino reto com barra", "Peitoral"],
  ["e2", "Supino inclinado com halteres", "Peitoral"],
  ["e3", "Crucifixo com halteres", "Peitoral"],
  ["e4", "Tríceps pulley", "Tríceps"],
  ["e5", "Tríceps francês", "Tríceps"],
];
const semana = (dia: string, g: string, nome: string) => ({ dia_semana: dia, slot_idx: 0, grupo_id: g, grupo_usuario_id: null, extra: 0, grupo_treino_id: g, grupo_treino_nome: nome });

function treinoDoDiego() {
  h.sql = {
    perfil: [{ nome: "Diego", foto_url: null, tempo_descanso_segundos: 90, series_padrao_qtd: 3, series_travadas: 0 }],
    grupos: [
      { id: "g1", nome: "Peito e Tríceps" },
      { id: "g2", nome: "Costas e Bíceps" },
      { id: "g3", nome: "Pernas" },
    ],
    // quarta 30/09/2026 — Seg A · Ter B · Qua A · Qui B · Sex C
    semana: [semana("SEG", "g1", "Peito e Tríceps"), semana("TER", "g2", "Costas e Bíceps"), semana("QUA", "g1", "Peito e Tríceps"),
      semana("QUI", "g2", "Costas e Bíceps"), semana("SEX", "g3", "Pernas")],
    concluidos: [{ data_treino: "2026-09-28", slot_idx: 0 }, { data_treino: "2026-09-29", slot_idx: 0 }],
    gruposEx: EXS.map(([id, nome, grupo], i) => ({ grupo_id: "g1", exercicio_id: id, ordem: i, ex_id: id, ex_nome: nome, ex_grupo_muscular: grupo, ex_emoji: "", ex_tipo: null,
      ex_imagem_url: null, ex_subgrupo: null, ex_dica: null })),
    catalogo: EXS.map(([id, nome, grupo]) => ({ id, nome, grupo_muscular: grupo, emoji: "", tipo: null, imagem_url: null, subgrupo: null, dica: null })),
    busca: [
      ...EXS.map(([id, nome, grupo]) => ({ id, nome, grupo_muscular: grupo, treino: "Peito e Tríceps" })),
    ],
  };
}

const alimento = (id: string, nome: string, kcal: number) => ({ id, nome, fonte: "taco", energia_kcal: kcal, proteina_g: 10, carboidrato_g: 20, lipidio_g: 5, fibra_g: 1, sodio_mg: 0 });
const item = (id: string, nome: string, kcal: number) => ({ id: `i-${id}`, alimento_id: id, quantidade_g: 100, medida_caseira_id: null, quantidade_medida: null, ordem: 0,
  substitutos: [], observacao: null, created_at: "2026-09-01T00:00:00Z", alimento: alimento(id, nome, kcal) });
const DADOS_DIETA = {
  hoje: "2026-09-30",
  dia: "2026-09-30",
  matriculas: [{ id: "m-n", nome: "Diego", conta_id: "c1", conta_nome: "Consultoria", ativo: true, link_codigo: "x", nutricionista: { id: "n1", nome: "Camila Rocha", foto_url: null } }],
  planos: [{
    id: "pl1", paciente_id: "m-n", nutricionista_id: "n1", titulo: "Plano", metodo: "alimentos", kcal_alvo: 2450, observacao: null, favorito: true,
    created_at: "2026-09-20T00:00:00Z", updated_at: "2026-09-20T00:00:00Z",
    refeicoes: [
      { id: "r1", nome: "Café da manhã", horario: "07:00", ordem: 0, observacao: null, dias_semana: [], itens: [item("pao", "Pão integral", 300), item("ovo", "Ovo cozido", 150)] },
      { id: "r2", nome: "Almoço", horario: "13:00", ordem: 1, observacao: null, dias_semana: [], itens: [item("arroz", "Arroz integral", 400), item("frango", "Frango grelhado", 300)] },
      { id: "r3", nome: "Jantar", horario: "19:00", ordem: 2, observacao: null, dias_semana: [], itens: [item("peixe", "Tilápia", 350)] },
    ],
  }],
  orientacoes: [],
  metas: [
    { id: "mt1", paciente_id: "m-n", titulo: "Beber 3 L de água", descricao: null, dias_semana: [1, 2, 3, 4, 5, 6, 7], ativa: true, inicio: null, created_at: "2026-09-01T00:00:01Z" },
    { id: "mt2", paciente_id: "m-n", titulo: "Comer 1 fruta", descricao: null, dias_semana: [3], ativa: true, inicio: null, created_at: "2026-09-01T00:00:02Z" },
    { id: "mt3", paciente_id: "m-n", titulo: "Dormir 8 horas", descricao: null, dias_semana: [1, 2, 3, 4, 5], ativa: true, inicio: null, created_at: "2026-09-01T00:00:03Z" },
    { id: "mt4", paciente_id: "m-n", titulo: "Só no sábado", descricao: null, dias_semana: [6], ativa: true, inicio: null, created_at: "2026-09-01T00:00:04Z" },
  ],
  refeicoes_concluidas: ["r1", "r3"],
  metas_concluidas: ["mt1", "mt2"],
  diario: [],
};

function dieta(dados: unknown = DADOS_DIETA, extra: Record<string, unknown> = {}) {
  h.dieta = { uid: "p1", hoje: "2026-09-30", dados, carregando: !dados, erro: null, recarregar: vi.fn(), fotos: {}, marcarRefeicao: vi.fn(),
    salvandoRefeicao: null, marcarMeta: h.marcarMeta, salvandoMeta: null, ...extra };
}

const antropo = (id: string, data: string, peso: number) => ({ id, data, peso, altura: 178, sexo: "masculino", idade: 30, circunferencias: null, dobras: null,
  protocolo: null, resultados: null, autor_id: "n1", autor_nome: "Camila Rocha", criado_em: `${data}T12:00:00Z` });
function evolucao(pesos: [string, number][] = [["2026-04-10", 89.1], ["2026-06-14", 86.0], ["2026-09-10", 84.2]]) {
  const serie = montarSerie({ treino: null, principal: { objetivo: "definição", antropometrias: pesos.map(([d, p], i) => antropo(`a${i}`, d, p)), fotos: [] }, personal: null });
  h.ev = { fase: "pronto", serie, deCache: false, salvoEm: null, falhas: { treino: null, principal: null }, recarregar: vi.fn() };
}

const matricula = (modulos: string[], extra: Record<string, unknown> = {}) => ({ id: "m1", ativo: true, app: false, modulos, ...extra });

function Onde() {
  const l = useLocation();
  return <div data-testid="rota">{l.pathname + l.search}</div>;
}

function abrir() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter useTransitions={false} initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="*" element={<Onde />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const card = (marca: string) => document.querySelector(`[${marca}]`) as HTMLElement | null;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 30, 9, 30, 0)); // quarta 30/09/2026, 9h30
  localStorage.clear();
  h.cache.clear();
  h.hasSynced = true;
  h.modulos = ["treino", "nutricao"];
  h.situacao = { master: false, contas: [], matriculas: [matricula(["treino", "nutricao"])], modulos_aluno: ["treino", "nutricao"], nome: "Diego Almeida" };
  h.treino = { estado: "pronto", erro: null };
  h.authUser = { id: "t1", user_metadata: {} };
  h.perfil = { nome: "Diego Almeida", foto_url: null, profissionais: [{ id: "n1", papel: "nutricionista", nome: "Camila Rocha", foto_url: null, whatsapp: null, conta_nome: null }] };
  h.agenda = [{ id: "ag1", paciente_id: "m1", titulo: "Retorno", inicio: "2026-10-02T13:00:00Z", fim: "2026-10-02T14:00:00Z", dia_inteiro: false, status: "confirmado",
    modulo: "nutricao", profissional: "Camila Rocha", papel: "nutricionista" }];
  h.marcarMeta.mockClear();
  h.buscaCarregando = false;
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  treinoDoDiego();
  dieta();
  evolucao();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("aba Início (W12 — tela 1)", () => {
  it("2 módulos: saudação, busca, sino, faixas da casca e os 6 blocos com os números das abas", async () => {
    abrir();
    expect(screen.getByText("Bom dia,")).toBeInTheDocument();
    expect(screen.getByText("Diego")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buscar" })).toBeInTheDocument();
    expect(screen.getByText("Avisos")).toBeInTheDocument();
    expect(screen.getByTestId("avisos-topo")).toBeInTheDocument();

    // treino de hoje (C15): quarta = Peito e Tríceps (Treino A), 5 exercícios, 2 de 5 na semana (Seg e Ter feitos)
    const treino = await screen.findByText("Peito e Tríceps", {}, { timeout: 4000 });
    const hero = treino.closest("[data-card-treino-hoje]") as HTMLElement;
    expect(hero.getAttribute("data-card-treino-hoje")).toBe("treino");
    expect(within(hero).getByText("Treino A")).toBeInTheDocument();
    expect(within(hero).getByText("5 exercícios")).toBeInTheDocument();
    expect(within(hero).getByText("2 de 5 na semana")).toBeInTheDocument();
    // a duração sai das séries do dia (3 por exercício) e do descanso do profissional (90 s): 15×45 + 14×90 + 5×60 = 37,25 min → 35
    await waitFor(() => expect(hero.querySelector("[data-treino-hoje-duracao]")?.textContent).toBe("~35 min"));
    expect(hero.querySelector("[data-treino-hoje-foto]")?.getAttribute("data-treino-hoje-foto")).toBe("/fotos/treino/peito.webp");

    // dieta de hoje: 800 / 1.500 kcal (Café 450 + Jantar 350 de Café 450 + Almoço 700 + Jantar 350), 2 de 3 refeições, 53%
    const kcal = await waitFor(() => {
      const el = card("data-dieta-hoje-kcal");
      expect(el).not.toBeNull();
      return el!;
    });
    expect(kcal.getAttribute("data-dieta-hoje-kcal")).toBe("800/1500");
    expect(kcal.textContent).toContain("800");
    expect(kcal.textContent).toContain("1.500 kcal");
    expect(card("data-dieta-hoje-refeicoes")?.textContent).toBe("2 de 3 refeições");
    expect(card("data-dieta-hoje-pct")?.textContent).toBe("53%");

    // metas de hoje: as 3 que valem na quarta, 2 com ✓ (a de sábado fica de fora)
    const metas = card("data-card-metas-hoje")!;
    expect(metas.getAttribute("data-metas-hoje")).toBe("3");
    expect(metas.getAttribute("data-metas-hoje-feitas")).toBe("2");
    expect(within(metas).queryByText("Só no sábado")).toBeNull();
    expect(within(metas).getByText("Dormir 8 horas")).toBeInTheDocument();

    // próxima consulta: Camila, nutricionista, sex 02/10 10:00, em 2 dias
    await waitFor(() => expect(card('data-card-consulta="proxima"')).not.toBeNull());
    expect(card("data-consulta-profissional")?.textContent).toBe("Camila Rocha");
    expect(card("data-consulta-quando")?.textContent).toBe("Nutricionista · sex, 02/10 · 10:00");
    expect(card("data-consulta-em")?.textContent).toBe("Em 2 dias");

    // peso: o card Peso da Evolução no 6M (84,2 kg; 89,1 → 84,2 = −4,9 kg em 6 meses)
    const peso = card('data-card-peso="dados"')!;
    expect(peso.textContent).toContain("84,2 kg");
    expect(peso.querySelector("[data-peso-linha]")?.textContent).toBe("4,9 kg em 6 meses");
    expect(peso.getAttribute("data-peso-periodo")).toBe("6m");
  });

  it("marcar a meta de hoje usa a MESMA mutação da aba Dieta (aluno_marcar_meta)", async () => {
    abrir();
    const dormir = await screen.findByRole("button", { name: /Dormir 8 horas: marcar como feita/ }, { timeout: 4000 });
    fireEvent.click(dormir);
    await waitFor(() => expect(h.marcarMeta).toHaveBeenCalledWith({ id: "mt3", concluida: true }));
  });

  it("Começar treino: liga o cronômetro do treino de hoje e abre a aba Treino", async () => {
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: /Começar treino/ }, { timeout: 4000 }));
    expect(screen.getByTestId("rota").textContent).toBe("/treino");
    const cron = JSON.parse(localStorage.getItem("physiq_workout_timer") ?? "{}");
    expect(cron).toMatchObject({ ativo: true, dateKey: "2026-09-30", grupoNome: "Peito e Tríceps" });
  });

  it("só Treino: sem os cards da dieta e das metas (o resto fica)", async () => {
    h.modulos = ["treino"];
    h.situacao = { master: false, contas: [], matriculas: [matricula(["treino"])], modulos_aluno: ["treino"] };
    abrir();
    await screen.findByText("Peito e Tríceps", {}, { timeout: 4000 });
    await waitFor(() => expect(card("data-card-consulta")).not.toBeNull());
    expect(card("data-card-dieta-hoje")).toBeNull();
    expect(card("data-card-metas-hoje")).toBeNull();
    expect(card("data-card-peso")).not.toBeNull();
  });

  it("só Nutrição: sem o card do treino; a dieta e as metas lado a lado", async () => {
    h.modulos = ["nutricao"];
    h.situacao = { master: false, contas: [], matriculas: [matricula(["nutricao"])], modulos_aluno: ["nutricao"] };
    h.authUser = null;
    abrir();
    await waitFor(() => expect(card("data-dieta-hoje-kcal")).not.toBeNull(), { timeout: 4000 });
    expect(card("data-card-treino-hoje")).toBeNull();
    expect(card("data-card-metas-hoje")).not.toBeNull();
  });

  it("sem profissional (W7b, Treino + Alimentação): o treino pronto, os pratos prontos; sem metas, consulta nem peso", async () => {
    h.modulos = ["treino", "nutricao"];
    h.situacao = { master: false, contas: [], matriculas: [matricula(["treino", "nutricao"], { app: true, app_plano: "app_treino_alimentacao" })], modulos_aluno: ["treino", "nutricao"] };
    h.sql = { perfil: [], grupos: [], semana: [], concluidos: [] };
    abrir();
    await waitFor(() => expect(card('data-card-treino-hoje="escolher"')).not.toBeNull(), { timeout: 4000 });
    expect(screen.getByRole("button", { name: /Treino pronto/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Montar o meu/ })).toBeInTheDocument();
    await waitFor(() => expect(card('data-card-dieta-hoje="pratos"')).not.toBeNull());
    expect(card("data-card-metas-hoje")).toBeNull();
    expect(card("data-card-consulta")).toBeNull();
    expect(card("data-card-peso")).toBeNull();
  });

  it("a troca de token ainda não chegou: o card do treino espera no lugar; a dieta abre", async () => {
    h.situacao = { ...h.situacao, precisa_treino: true };
    h.treino = { estado: "trocando", erro: null };
    h.authUser = null;
    abrir();
    await waitFor(() => expect(card('data-card-treino-hoje="carregando"')).not.toBeNull(), { timeout: 4000 });
    await waitFor(() => expect(card("data-dieta-hoje-kcal")).not.toBeNull());
    // o peso soma os 2 bancos: espera a sessão do Treino (senão mostraria só o lado da nutricionista e depois mudaria)
    expect(card('data-card-peso="carregando"')).not.toBeNull();
    expect(card('data-card-peso="dados"')).toBeNull();
  });

  it("sem internet: o treino abre (SQLite do aparelho); a dieta sem nada guardado mostra 'Sem conexão'", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    dieta(null, { carregando: false });
    h.agenda = [];
    try {
      abrir();
      await screen.findByText("Peito e Tríceps", {}, { timeout: 4000 });
      await waitFor(() => expect(card('data-card-dieta-hoje="sem-internet"')).not.toBeNull());
      expect(card('data-card-dieta-hoje="sem-internet"')?.textContent).toContain("A dieta aparece quando a internet voltar.");
      expect(card('data-card-metas-hoje="sem-internet"')).not.toBeNull();
    } finally {
      online.mockRestore();
    }
  });

  it("dia sem treino na semana: 'Nenhum treino para hoje' com 'Ver a semana' e a troca", async () => {
    h.sql.semana = [semana("SEG", "g1", "Peito e Tríceps")];
    abrir();
    await waitFor(() => expect(card('data-card-treino-hoje="sem-treino"')).not.toBeNull(), { timeout: 4000 });
    expect(screen.getByRole("button", { name: /Ver a semana/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trocar o treino de hoje" })).toBeInTheDocument();
    // Seg (com treino, feito) e Ter (feito, sem treino marcado agora): 2 de 2 — a mesma conta dos "· 2 feitos" da aba Treino
    expect(card("data-treino-semana")?.getAttribute("data-treino-semana")).toBe("2/2");
  });

  it("busca: enquanto o SQLite do aparelho não responde, 'Buscando…' (nunca 'Nada com …' antes da hora)", async () => {
    h.buscaCarregando = true;
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    const campo = await screen.findByPlaceholderText("Buscar exercício ou alimento");
    fireEvent.change(campo, { target: { value: "triceps" } });
    expect(await screen.findByText("Buscando no seu plano…")).toBeInTheDocument();
    expect(screen.queryByText(/Nada com/)).toBeNull();
  });

  it("busca: acha o exercício do treino e o alimento do plano (sem acento)", async () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    const campo = await screen.findByPlaceholderText("Buscar exercício ou alimento");
    fireEvent.change(campo, { target: { value: "triceps" } });
    expect(await screen.findByText("Tríceps pulley")).toBeInTheDocument();
    fireEvent.change(campo, { target: { value: "frango" } });
    const frango = await screen.findByText("Frango grelhado");
    fireEvent.click(frango);
    await waitFor(() => expect(screen.getByTestId("rota").textContent).toBe("/dieta?ver=refeicao&r=r2"));
  });
});

describe("H5 — N-48: o atalho do diário no Início (pendência da W12)", () => {
  it("com nutricionista e o diário ligado: 'Foto pro diário' abre a folha do diário da aba Dieta; tocar no card abre a Dieta", async () => {
    abrir();
    const atalho = await screen.findByRole("button", { name: "Foto pro diário" });
    expect(card('data-card-dieta-hoje="plano"')).not.toBeNull();
    fireEvent.click(atalho);
    await waitFor(() => expect(screen.getByTestId("rota").textContent).toBe("/dieta?ver=diario"));
  });
  it("o card continua abrindo a aba Dieta (a camada do card)", async () => {
    abrir();
    await screen.findByRole("button", { name: "Foto pro diário" });
    fireEvent.click(screen.getByRole("button", { name: "Abrir a dieta" }));
    await waitFor(() => expect(screen.getByTestId("rota").textContent).toBe("/dieta"));
  });
  it("diário desligado pelo profissional (R12): sem o atalho", async () => {
    dieta({ ...DADOS_DIETA, matriculas: [{ ...DADOS_DIETA.matriculas[0], diario_alimentar: false }] });
    abrir();
    await waitFor(() => expect(card("data-dieta-hoje-kcal")).not.toBeNull());
    expect(screen.queryByRole("button", { name: "Foto pro diário" })).toBeNull();
  });
  it("sem nutricionista (pratos prontos do app): sem o atalho", async () => {
    dieta({ ...DADOS_DIETA, matriculas: [] });
    abrir();
    await waitFor(() => expect(card("data-card-dieta-hoje")).not.toBeNull());
    expect(screen.queryByRole("button", { name: "Foto pro diário" })).toBeNull();
  });
});
