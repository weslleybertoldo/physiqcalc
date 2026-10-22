import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";

// A Prancha por tempo na aba Treino inteira (decisão do Weslley 21/10/2026), sobre o mesmo SQLite falso do PowerSync da
// src/app-aluno/abas/Treino.test.tsx: a prescrição "30" vira a meta em segundos, o cronômetro da série conta e o banco recebe SÓ o
// tempo (peso e repetições nulos), sem peso na academia. O Escalador (mesmo movimento) continua por repetições.
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
vi.mock("@/treino/ui/TrocarExercicio", () => ({ TrocarExercicio: ({ alvo }: { alvo: unknown }) => (alvo ? <div data-testid="modal-trocar">trocar</div> : null) }));
vi.mock("@/components/treinos/SeletorAcademia", () => ({ default: () => <div>seletor</div> }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

import Treino from "@/app-aluno/abas/Treino";
import { PRANCHA_ID, PRANCHA_LATERAL_ID } from "./porTempo";

const ESCALADOR_ID = "32b7d001-7a57-5443-b6da-87ec6ac7c1ee";
const linhaGrupo = (exercicio_id: string, ordem: number, nome: string) => ({
  grupo_id: "g1", exercicio_id, ordem, ex_id: exercicio_id, ex_nome: nome, ex_grupo_muscular: "Abdômen", ex_emoji: "", ex_tipo: "musculacao",
  ex_imagem_url: null, ex_subgrupo: null, ex_dica: null,
});
const EX = (id: string, nome: string) => ({ id, nome, grupo_muscular: "Abdômen", emoji: "", tipo: "musculacao", imagem_url: null, subgrupo: null, dica: null });

function comCore() {
  h.estado.dados = {
    perfil: [{ nome: "Rafa", foto_url: null, tempo_descanso_segundos: 45, series_padrao_qtd: 3, series_travadas: 0 }],
    grupos: [{ id: "g1", nome: "Core" }],
    semana: [{ dia_semana: "QUI", slot_idx: 0, grupo_id: "g1", grupo_usuario_id: null, extra: 0, grupo_treino_id: "g1", grupo_treino_nome: "Core" }],
    gruposEx: [linhaGrupo(PRANCHA_ID, 0, "Prancha"), linhaGrupo(PRANCHA_LATERAL_ID, 1, "Prancha Lateral"), linhaGrupo(ESCALADOR_ID, 2, "Escalador")],
    catalogo: [EX(PRANCHA_ID, "Prancha"), EX(PRANCHA_LATERAL_ID, "Prancha Lateral"), EX(ESCALADOR_ID, "Escalador")],
    seriesPadrao: [
      // a Prancha com meta (as "repetições" do profissional = segundos); a Lateral sem meta (só as séries); o Escalador com reps
      { grupo_id: "g1", grupo_usuario_id: null, exercicio_id: PRANCHA_ID, exercicio_usuario_id: null, num_series: 3, reps_alvo: "30", descanso_segundos: 60, carga_sugerida_kg: null, observacao: null },
      { grupo_id: "g1", grupo_usuario_id: null, exercicio_id: PRANCHA_LATERAL_ID, exercicio_usuario_id: null, num_series: 2, reps_alvo: null, descanso_segundos: null, carga_sugerida_kg: null, observacao: null },
      { grupo_id: "g1", grupo_usuario_id: null, exercicio_id: ESCALADOR_ID, exercicio_usuario_id: null, num_series: 3, reps_alvo: "20", descanso_segundos: null, carga_sugerida_kg: null, observacao: null },
    ],
    academias: [{ id: "a1", nome: "Academia Teste" }],
    series: [],
  };
}

function abrir() {
  return render(
    <ProvedorConfirmar>
      <MemoryRouter useTransitions={false} initialEntries={["/treino"]}>
        <Treino />
      </MemoryRouter>
    </ProvedorConfirmar>,
  );
}

const T0 = new Date(2026, 9, 1, 9, 0, 0).getTime(); // quinta 01/10/2026
let tons = 0;
class AudioFalso {
  state = "running";
  currentTime = 0;
  destination = {};
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {});
  createOscillator() {
    tons++;
    return { connect: () => {}, frequency: { value: 0 }, start: () => {}, stop: () => {} };
  }
  createGain() {
    return { connect: () => {}, gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} } };
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  h.cache.clear();
  h.estado.dados = {};
  h.estado.isStaff = false;
  h.estado.situacao = { master: false, contas: [], matriculas: [{ id: "m1", app: false, ativo: true, modulos: ["treino"] }] };
  localStorage.clear();
  localStorage.setItem("physiq_academia_atual", JSON.stringify({ id: "a1", nome: "Academia Teste" }));
  h.db.execute.mockClear();
  tons = 0;
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} unobserve() {} });
  vi.stubGlobal("AudioContext", AudioFalso);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function abrirExercicio(id: string): Promise<Element> {
  const botao = await waitFor(() => {
    const b = document.querySelector(`[data-exercicio-id="${id}"] [data-exercicio-abrir]`);
    expect(b).not.toBeNull();
    return b as HTMLElement;
  });
  fireEvent.click(botao);
  return document.querySelector(`[data-exercicio-id="${id}"] [data-exercicio-painel]`)!;
}

/** As gravações em tb_treino_series: as colunas pelo nome (o SQL da tela lista as colunas e os valores na mesma ordem). */
function gravacoesDaSerie(): Record<string, unknown>[] {
  return h.db.execute.mock.calls
    .filter((c: unknown[]) => /^INSERT (OR REPLACE )?INTO tb_treino_series/.test(String(c[0]).trim()))
    .map((c: unknown[]) => {
      const sql = String(c[0]);
      const colunas = sql.slice(sql.indexOf("(") + 1, sql.indexOf(")")).split(",").map((s) => s.trim());
      const valores = [...(c[1] as unknown[])];
      if (sql.includes("VALUES (uuid()")) colunas.shift(); // o id sai do uuid() do SQLite
      return Object.fromEntries(colunas.map((col, i) => [col, valores[i]]));
    });
}
const tocouAcademia = () => h.db.execute.mock.calls.some((c: unknown[]) => String(c[0]).includes("tb_academia_pesos"));

describe("Prancha por tempo na aba Treino", () => {
  it("a linha mostra a meta em segundos e nenhuma carga; o Escalador continua por repetições", async () => {
    comCore();
    abrir();
    const prancha = await waitFor(() => {
      const el = document.querySelector(`[data-exercicio-id="${PRANCHA_ID}"] [data-exercicio-linha]`);
      // a Prancha é o exercício "atual" (o 1º com série por fazer): a linha ganha "Série 1 de 3" na frente
      expect(el?.textContent).toBe("Série 1 de 3 · 3 × 30 s · 60 s");
      return el!;
    });
    expect(prancha.closest("[data-exercicio-id]")!.querySelector("[data-exercicio-carga]")).toBeNull();
    expect(document.querySelector(`[data-exercicio-id="${PRANCHA_LATERAL_ID}"] [data-exercicio-linha]`)?.textContent).toBe("2 séries · 45 s");
    expect(document.querySelector(`[data-exercicio-id="${ESCALADOR_ID}"] [data-exercicio-linha]`)?.textContent).toBe("3 × 20 · 45 s");
  });

  it("com meta: ▶ conta 30 s pra baixo, apita e grava SÓ o tempo (peso e reps nulos, nada na academia)", async () => {
    comCore();
    abrir();
    const painel = await abrirExercicio(PRANCHA_ID);
    expect(painel.querySelectorAll("[data-serie-tempo]")).toHaveLength(3);
    expect(painel.querySelectorAll("[data-serie-iniciar]")).toHaveLength(3);
    expect(painel.textContent).toContain("Tempo · meta 00:30");
    fireEvent.click(painel.querySelector('[data-serie="1"] [data-serie-iniciar]')!);
    expect(painel.querySelector('[data-serie-cronometro="meta"]')).not.toBeNull();

    act(() => vi.setSystemTime(T0 + 30_000));
    await waitFor(() => expect(gravacoesDaSerie().some((g) => g.concluida === true)).toBe(true));
    const feita = gravacoesDaSerie().find((g) => g.concluida === true)!;
    expect(feita).toMatchObject({ exercicio_id: PRANCHA_ID, numero_serie: 1, peso: null, reps: null, tempo_segundos: 30, distancia_km: null });
    // as outras 2 séries (ainda da memória) foram guardadas antes, também só com tempo — nunca peso 0 × 10 reps
    for (const g of gravacoesDaSerie().filter((x) => x.concluida === false)) expect(g).toMatchObject({ peso: null, reps: null });
    expect(tocouAcademia()).toBe(false);
    expect(tons).toBe(3);
    await waitFor(() => expect(painel.querySelector('[data-serie="1"][data-serie-feita]')?.textContent).toContain("30 s"));
  });

  it("sem meta: ▶ conta pra cima e o Parar grava o tempo segurado", async () => {
    comCore();
    abrir();
    const painel = await abrirExercicio(PRANCHA_LATERAL_ID);
    expect(painel.textContent).not.toContain("meta");
    fireEvent.click(painel.querySelector('[data-serie="1"] [data-serie-iniciar]')!);
    expect(painel.querySelector('[data-serie-cronometro="livre"]')).not.toBeNull();
    act(() => vi.setSystemTime(T0 + 41_000));
    await waitFor(() => expect(painel.querySelector("[data-cronometro-mostrado]")?.textContent).toBe("00:41"));
    fireEvent.click(painel.querySelector("[data-serie-parar]")!);
    await waitFor(() => expect(gravacoesDaSerie().find((g) => g.concluida === true)).toMatchObject({ exercicio_id: PRANCHA_LATERAL_ID, numero_serie: 1, peso: null, reps: null, tempo_segundos: 41 }));
    expect(tocouAcademia()).toBe(false);
    expect(tons).toBe(0);
  });

  it("corrigir na mão grava só o tempo; o Escalador segue gravando peso × reps e o peso na academia", async () => {
    comCore();
    abrir();
    const painel = await abrirExercicio(PRANCHA_ID);
    const campo = painel.querySelector('[data-serie="2"] input') as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "50" } });
    fireEvent.blur(campo);
    await waitFor(() => expect(gravacoesDaSerie().find((g) => g.numero_serie === 2)).toMatchObject({ peso: null, reps: null, tempo_segundos: 50 }));
    expect(tocouAcademia()).toBe(false);

    h.db.execute.mockClear();
    const esc = await abrirExercicio(ESCALADOR_ID);
    expect(esc.querySelector("[data-serie-iniciar]")).toBeNull();
    fireEvent.click(esc.querySelector('[data-serie="1"] [data-serie-ok]')!);
    await waitFor(() => expect(gravacoesDaSerie().find((g) => g.concluida === true)).toMatchObject({ exercicio_id: ESCALADOR_ID, reps: 20, tempo_segundos: null }));
    expect(tocouAcademia()).toBe(true);
  });
});
