import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// hml-18a (H-40, E) — a pré-carga das telas da área: depois do 1º render, no ocioso, o carregar() de cada tela, uma por vez, 1 vez;
// nada com a economia de dados nem em 2G; as rotas pesadas nunca. O registro é trocado por um falso (os carregar() são espiões).

const h = vi.hoisted(() => ({ registro: {} as Record<string, Record<string, { nome: string; caminho: string; carregar: () => Promise<unknown>; Componente: unknown }>> }));
vi.mock("./registro", () => ({ registro: h.registro }));

import { filaDaPreCarga, NAO_PRECARREGAR, podePreCarregar, usePreCarga } from "./usePreCarga";

const chamados: string[] = [];
function grupo(nome: string, telas: string[]) {
  h.registro[nome] = Object.fromEntries(
    telas.map((t) => [t, { nome: t, caminho: `/src/${nome}/${t}.tsx`, Componente: null, carregar: vi.fn(async () => { chamados.push(`${nome}/${t}`); return { default: () => null }; }) }]),
  );
}

let ociosos: (() => void)[] = [];
const conexao = (c: object | undefined) => Object.defineProperty(navigator, "connection", { value: c, configurable: true });

beforeEach(() => {
  chamados.length = 0;
  for (const k of Object.keys(h.registro)) delete h.registro[k];
  grupo("paginasPainel", ["Dashboard", "Alunos", "Treinos", "Dietas", "Agenda"]);
  grupo("abasAluno", ["Treino", "Dieta", "Avaliacao", "Prontuario"]);
  grupo("resumoAluno", ["CardTreino"]);
  grupo("abasConfig", ["Perfil"]);
  grupo("abasApp", ["Inicio", "Treino", "Dieta", "Evolucao", "Perfil"]);
  grupo("perfilApp", ["Pagamentos"]);
  grupo("inicioApp", ["CardPeso"]);
  grupo("paginasMaster", ["VisaoGeral", "Contas"]);
  ociosos = [];
  vi.stubGlobal("requestIdleCallback", (fn: () => void) => ociosos.push(fn));
  vi.stubGlobal("cancelIdleCallback", vi.fn());
  vi.stubEnv("MODE", "production"); // nos testes a pré-carga fica desligada (o resto da suíte); aqui ela liga
  conexao(undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  conexao(undefined);
});

/** Roda o próximo "ocioso" e espera o carregar dele terminar (o seguinte só é agendado depois). */
async function proximoOcioso() {
  const fn = ociosos.shift();
  if (!fn) return false;
  await act(async () => {
    fn();
  });
  return true;
}

describe("usePreCarga (hml-18a): a pré-carga das telas da área", () => {
  it("painel: as páginas do MENU (na ordem dele) + abas do aluno + Resumo + Configurações, uma por vez, depois do ocioso — sem as pesadas", async () => {
    renderHook(() => usePreCarga("painel", { paginas: ["Dashboard", "Alunos", "Treinos", "Agenda"] }));
    expect(chamados).toEqual([]); // nada antes do ocioso
    const esperado = [
      "paginasPainel/Dashboard", "paginasPainel/Alunos", "paginasPainel/Treinos", "paginasPainel/Agenda",
      "abasAluno/Treino", "abasAluno/Avaliacao", "resumoAluno/CardTreino", "abasConfig/Perfil",
    ];
    for (let i = 0; i < esperado.length; i++) {
      await waitFor(() => expect(ociosos).toHaveLength(1)); // o próximo só é agendado depois que o anterior terminou
      await proximoOcioso();
      await waitFor(() => expect(chamados).toHaveLength(i + 1)); // um por vez: 1 carregar por ocioso
    }
    expect(chamados).toEqual(esperado);
    // acabou a fila: o ocioso que sobra não carrega mais nada
    while (ociosos.length) await proximoOcioso();
    expect(chamados).toHaveLength(esperado.length);
    // a página fora do menu da conta (Dietas, conta só de Treino) e as pesadas (Dieta e Prontuário do aluno) nunca
    expect(chamados).not.toContain("paginasPainel/Dietas");
    expect(chamados).not.toContain("abasAluno/Dieta");
    expect(chamados).not.toContain("abasAluno/Prontuario");
  });

  it("cada tela entra 1 vez (sem repetir) e o app pré-carrega as 5 abas, o Perfil e o Início; o master, as páginas dele", () => {
    const app = filaDaPreCarga("app").map((i) => i.caminho);
    expect(app).toEqual(["/src/abasApp/Inicio.tsx", "/src/abasApp/Treino.tsx", "/src/abasApp/Dieta.tsx", "/src/abasApp/Evolucao.tsx", "/src/abasApp/Perfil.tsx",
      "/src/perfilApp/Pagamentos.tsx", "/src/inicioApp/CardPeso.tsx"]);
    expect(new Set(app).size).toBe(app.length);
    expect(filaDaPreCarga("master").map((i) => i.nome)).toEqual(["VisaoGeral", "Contas"]);
    expect([...NAO_PRECARREGAR]).toEqual(["abasAluno/Dieta", "abasAluno/Prontuario"]);
  });

  it("com a economia de dados (saveData) não pré-carrega nada", async () => {
    conexao({ saveData: true, effectiveType: "4g" });
    renderHook(() => usePreCarga("app"));
    expect(ociosos).toHaveLength(0);
    expect(chamados).toEqual([]);
  });

  it("em 2G (e slow-2g) não pré-carrega; em 3G/4G sim", () => {
    expect(podePreCarregar({ connection: { effectiveType: "2g" } } as unknown as Navigator)).toBe(false);
    expect(podePreCarregar({ connection: { effectiveType: "slow-2g" } } as unknown as Navigator)).toBe(false);
    expect(podePreCarregar({ connection: { effectiveType: "3g" } } as unknown as Navigator)).toBe(true);
    expect(podePreCarregar({} as Navigator)).toBe(true);
    conexao({ effectiveType: "2g" });
    renderHook(() => usePreCarga("master"));
    expect(ociosos).toHaveLength(0);
  });

  it("antes da casca aparecer (ligado = false) nada; depois, começa", async () => {
    const r = renderHook(({ ligado }) => usePreCarga("master", { ligado }), { initialProps: { ligado: false } });
    expect(ociosos).toHaveLength(0);
    r.rerender({ ligado: true });
    expect(ociosos).toHaveLength(1);
    await proximoOcioso();
    await waitFor(() => expect(chamados).toEqual(["paginasMaster/VisaoGeral"]));
  });

  it("sem requestIdleCallback (Safari): o próximo entra 1,5 s depois", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("requestIdleCallback", undefined);
    vi.useFakeTimers();
    renderHook(() => usePreCarga("master"));
    expect(chamados).toEqual([]);
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(chamados).toEqual(["paginasMaster/VisaoGeral"]);
  });

  it("saiu da área no meio: a fila para (nada mais carrega)", async () => {
    const r = renderHook(() => usePreCarga("app"));
    await proximoOcioso();
    await waitFor(() => expect(chamados).toHaveLength(1));
    r.unmount();
    while (ociosos.length) await proximoOcioso();
    expect(chamados).toHaveLength(1);
  });
});
