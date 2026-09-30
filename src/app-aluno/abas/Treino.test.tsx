import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A aba Treino nova (W8) sobre um SQLite falso do PowerSync: a mesma leitura que a tela faz, sem rede.
const h = vi.hoisted(() => {
  const cache = new Map<string, unknown[]>();
  const estado = {
    dados: {} as Record<string, unknown[]>,
    situacao: null as null | Record<string, unknown>,
    isStaff: false,
  };
  const chave = (sql: string) => {
    const s = sql.replace(/\s+/g, " ");
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
    if (s.includes("FROM treino_historico")) return "historico";
    return "outro";
  };
  const db = {
    getAll: vi.fn(async (sql: string) => (sql.includes("SELECT 1 FROM tb_exercicios") ? [{ 1: 1 }] : [])),
    execute: vi.fn(async () => {}),
    getUploadQueueStats: vi.fn(async () => ({ count: 0 })),
  };
  return { cache, estado, chave, db };
});

vi.mock("@powersync/react", () => ({
  usePowerSync: () => h.db,
  // referência estável por consulta (como o watch do PowerSync): senão cada render re-dispara os efeitos
  useQuery: (sql: string) => {
    const k = h.chave(sql);
    if (!h.cache.has(k)) h.cache.set(k, h.estado.dados[k] ?? []);
    return { data: h.cache.get(k), isLoading: false, isFetching: false, error: undefined };
  },
  useStatus: () => ({ connected: true, hasSynced: true, dataFlowStatus: {} }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1", user_metadata: {} }, isStaff: h.estado.isStaff }) }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ situacao: h.estado.situacao }) }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false }, registerPlugin: () => ({}) }));
vi.mock("@/app-aluno/perfil/pecas/SheetSom", () => ({ SheetSom: () => null }));
vi.mock("@/lib/nativeNotifications", () => ({
  MARCOS_TREINO_LONGO_MIN: [90, 120, 180],
  formatMarcoTreinoLongo: (m: number) => `${m}min`,
  agendarAvisosTreinoLongo: vi.fn(async () => {}),
  cancelarAvisosTreinoLongo: vi.fn(async () => {}),
  avisarTreinoLongoWeb: vi.fn(),
  requestNotificationPermission: vi.fn(async () => {}),
  startTimerNotifications: vi.fn(async () => {}),
  showTimerFinishedNotification: vi.fn(async () => {}),
  cancelTimerNotification: vi.fn(async () => {}),
}));
vi.mock("@/components/treinos/ModalTrocarExercicio", () => ({ default: () => <div data-testid="modal-trocar">trocar</div> }));
vi.mock("@/components/treinos/SeletorAcademia", () => ({ default: () => <div>seletor</div> }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

import Treino from "./Treino";

const EX = (id: string, nome: string, grupo = "Peitoral") => ({ id, nome, grupo_muscular: grupo, emoji: "", tipo: null, imagem_url: null, subgrupo: null, dica: "Desça devagar" });
const serie = (exercicio_id: string, numero_serie: number, concluida: boolean, peso = 60, reps = 10) => ({
  id: `${exercicio_id}-${numero_serie}`, exercicio_id, exercicio_usuario_id: null, slot_idx: 0, numero_serie, peso, reps, concluida: concluida ? 1 : 0,
  data_treino: "2026-10-01", academia_nome: null, tempo_segundos: null, distancia_km: null, pace_segundos_km: null,
});

function comTreino() {
  h.estado.dados = {
    perfil: [{ nome: "Rafa", foto_url: null, tempo_descanso_segundos: 45, series_padrao_qtd: 3, series_travadas: 0 }],
    grupos: [{ id: "g1", nome: "Peito e Tríceps" }],
    semana: [
      { dia_semana: "QUI", slot_idx: 0, grupo_id: "g1", grupo_usuario_id: null, extra: 0, grupo_treino_id: "g1", grupo_treino_nome: "Peito e Tríceps" },
      { dia_semana: "SEX", slot_idx: 0, grupo_id: "g1", grupo_usuario_id: null, extra: 0, grupo_treino_id: "g1", grupo_treino_nome: "Peito e Tríceps" },
    ],
    concluidos: [{ data_treino: "2026-09-28", slot_idx: 0 }],
    gruposEx: [
      { grupo_id: "g1", exercicio_id: "e1", ordem: 0, ex_id: "e1", ex_nome: "Supino reto com barra", ex_grupo_muscular: "Peitoral", ex_emoji: "", ex_tipo: null, ex_imagem_url: null, ex_subgrupo: null, ex_dica: null },
      { grupo_id: "g1", exercicio_id: "e2", ordem: 1, ex_id: "e2", ex_nome: "Crucifixo com halteres", ex_grupo_muscular: "Peitoral", ex_emoji: "", ex_tipo: null, ex_imagem_url: null, ex_subgrupo: null, ex_dica: null },
    ],
    catalogo: [EX("e1", "Supino reto com barra"), EX("e2", "Crucifixo com halteres")],
    seriesPadrao: [{ grupo_id: "g1", grupo_usuario_id: null, exercicio_id: "e1", exercicio_usuario_id: null, num_series: 4, reps_alvo: "10", descanso_segundos: 60, carga_sugerida_kg: 60, observacao: null }],
    series: [serie("e1", 1, true), serie("e1", 2, true), serie("e1", 3, true), serie("e1", 4, true), serie("e2", 1, true, 14, 12), serie("e2", 2, false, 14, 12), serie("e2", 3, false, 14, 12)],
  };
}

function abrir() {
  return render(
    <MemoryRouter initialEntries={["/treino"]}>
      <Treino />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 1, 9, 0, 0)); // quinta 01/10/2026
  h.cache.clear();
  h.estado.dados = {};
  h.estado.isStaff = false;
  h.estado.situacao = { master: false, contas: [], matriculas: [{ id: "m1", app: false, ativo: true, modulos: ["treino"] }] };
  localStorage.clear();
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} unobserve() {} });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("aba Treino (tela 2)", () => {
  it("faixa Seg–Dom, card do treino e a lista com a prescrição (NF1) e o exercício atual", async () => {
    comTreino();
    abrir();
    expect(await screen.findByText("Treino")).toBeInTheDocument();
    const hoje = document.querySelector('[data-dia="2026-10-01"]')!;
    expect(hoje.getAttribute("aria-current")).toBe("date");
    expect(document.querySelector('[data-dia="2026-09-28"]')!.getAttribute("data-dia-estado")).toBe("feito");
    expect(document.querySelector('[data-dia="2026-10-02"]')!.getAttribute("data-dia-estado")).toBe("treino");
    expect(document.querySelector('[data-dia="2026-10-03"]')!.getAttribute("data-dia-estado")).toBe("livre");

    await waitFor(() => expect(document.querySelector("[data-treino-feitos]")?.textContent).toBe("1 de 2 exercícios feitos"));
    expect(document.querySelector("[data-treino-nome]")?.textContent).toBe("Peito e Tríceps");
    expect(document.querySelector("[data-treino-chip]")?.textContent).toBe("TREINO A");
    expect(document.querySelector("[data-treino-series]")?.textContent).toContain("7 séries");
    expect(document.querySelector("[data-treino-pct]")?.textContent).toBe("50%");

    const supino = document.querySelector('[data-exercicio-id="e1"]')!;
    expect(supino.getAttribute("data-exercicio-estado")).toBe("feito");
    expect(supino.querySelector("[data-exercicio-linha]")?.textContent).toBe("4 × 10 · 60 s · 60 kg");
    const cruc = document.querySelector('[data-exercicio-id="e2"]')!;
    expect(cruc.getAttribute("data-exercicio-estado")).toBe("atual");
    expect(cruc.querySelector("[data-exercicio-linha]")?.textContent).toBe("Série 2 de 3 · 3 × 12 · 45 s");
    expect(cruc.querySelector("[data-exercicio-carga]")?.textContent).toBe("14 kg");
  });

  it("tocar no exercício abre as séries e as ações (ficha, histórico, anotações, trocar, remover); Trocar abre o modal de hoje", async () => {
    comTreino();
    abrir();
    const abrirEx = await waitFor(() => {
      const b = document.querySelector('[data-exercicio-id="e2"] [data-exercicio-abrir]');
      expect(b).not.toBeNull();
      return b as HTMLElement;
    });
    fireEvent.click(abrirEx);
    const painel = document.querySelector('[data-exercicio-id="e2"] [data-exercicio-painel]')!;
    expect([...painel.querySelectorAll("[data-acao-exercicio]")].map((b) => b.getAttribute("data-acao-exercicio"))).toEqual(["ficha", "historico", "anotacoes", "trocar", "remover"]);
    expect(painel.querySelectorAll("[data-serie]")).toHaveLength(3);
    expect(painel.querySelectorAll("[data-serie-ok]")).toHaveLength(2); // S1 feita, S2 e S3 com OK
    fireEvent.click(painel.querySelector('[data-acao-exercicio="trocar"]')!);
    expect(await screen.findByTestId("modal-trocar")).toBeInTheDocument();
  });

  it("aluno sem profissional num dia sem treino: \"Montar o meu\" e \"Usar um treino pronto\"", async () => {
    h.estado.situacao = { master: false, contas: [], matriculas: [{ id: "m1", app: true, ativo: true, modulos: ["treino"] }] };
    h.estado.dados = { perfil: [{ nome: "Ana" }] };
    abrir();
    expect(await screen.findByText("Nenhum treino para este dia")).toBeInTheDocument();
    expect(screen.getByText("Montar o meu")).toBeInTheDocument();
    expect(screen.getByText("Usar um treino pronto")).toBeInTheDocument();
    expect(document.querySelector("[data-sem-treino-adicionar]")).toBeNull();
  });

  it("aluno com profissional num dia sem treino: \"Adicionar treino\" (sem o treino pronto)", async () => {
    h.estado.dados = { perfil: [{ nome: "Rafa" }] };
    abrir();
    expect(await screen.findByText("Adicionar treino")).toBeInTheDocument();
    expect(screen.queryByText("Usar um treino pronto")).toBeNull();
    fireEvent.click(screen.getByText("Adicionar treino"));
    expect(await screen.findByText("Sem treino neste dia (descanso)")).toBeInTheDocument();
    expect(screen.getByText("Montar o meu")).toBeInTheDocument();
  });

  it("o profissional no app de aluno tem o atalho para o Painel (o aluno comum não)", async () => {
    comTreino();
    const { unmount } = abrir();
    await screen.findByText("Treino");
    expect(document.querySelector("[data-treino-painel]")).toBeNull();
    unmount();
    h.cache.clear();
    h.estado.isStaff = true;
    abrir();
    await screen.findByText("Treino");
    expect(document.querySelector("[data-treino-painel]")).not.toBeNull();
  });

  it("cronômetro rodando: pílula vermelha com o tempo no cabeçalho", async () => {
    comTreino();
    localStorage.setItem("physiq_workout_timer", JSON.stringify({ ativo: true, startedAt: Date.now() - (32 * 60 + 10) * 1000, dateKey: "2026-10-01", grupoNome: "Peito e Tríceps", avisos: [] }));
    abrir();
    const pilula = await waitFor(() => {
      const p = document.querySelector("[data-pilula-tempo]");
      expect(p).not.toBeNull();
      return p!;
    });
    expect(pilula.textContent).toMatch(/32:1\d/);
    expect(pilula.className).toContain("pq-chip-r");
    expect(document.querySelector("[data-comecar-treino]")).toBeNull();
  });
});
