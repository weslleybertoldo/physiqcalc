import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { matricula, situacao } from "@/test/fixturesNucleo";
import type { ParteTreino, PartePrincipal } from "@/evolucao/tipos";

const h = vi.hoisted(() => ({
  sessao: {} as Record<string, unknown>,
  treinoUser: null as null | { id: string },
  treino: null as null | ParteTreino,
  principal: null as null | PartePrincipal,
  erroTreino: false,
  erroPrincipal: false,
  cache: new Map<string, unknown>(),
  chamadas: { treino: 0, principal: 0 },
}));

vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: h.treinoUser }) }));
vi.mock("@/integrations/principal/client", () => ({ principalConfigurado: true, principal: {} }));
vi.mock("@/evolucao/fontes", () => ({
  carregarTreino: async () => {
    h.chamadas.treino++;
    if (h.erroTreino) throw new Error("rede");
    return h.treino;
  },
  carregarPrincipal: async () => {
    h.chamadas.principal++;
    if (h.erroPrincipal) throw new Error("rede");
    return h.principal;
  },
}));
vi.mock("@/evolucao/cache", () => ({
  lerCache: async (uid: string) => (h.cache.get(uid) as never) ?? null,
  guardarCache: async (uid: string, d: Record<string, unknown>) => {
    h.cache.set(uid, { versao: 1, uid, salvoEm: "2026-09-29T12:00:00.000Z", ...d });
  },
}));

import Evolucao from "./Evolucao";

const PERFIL = {
  id: "t1", sexo: "male", idade: 31, peso: 84.2, altura: 178, metodo_avaliacao: "dobras_7", percentual_gordura: 15.9, massa_gorda: 13.39,
  massa_magra: 70.81, tmb_mifflin: 1822, tmb_katch: 1900, tmb_metodo: "katch", dobra_1: 11, dobra_2: 12, dobra_3: 9, dobra_4: 13, dobra_5: 19,
  dobra_6: 15, dobra_7: 13, medida_cintura: 84, medida_braco_d: 37.5,
};
const av = (data: string, peso: number, bf: number) => ({
  id: `a-${data}`, data_avaliacao: data, peso, percentual_gordura: bf, massa_gorda: +(peso * bf / 100).toFixed(2), massa_magra: +(peso - peso * bf / 100).toFixed(2),
  metodo_avaliacao: "dobras_7", created_at: `${data}T13:00:00Z`,
});
const TREINO: ParteTreino = {
  perfil: PERFIL,
  avaliacoes: [av("2026-03-14", 90.3, 22.4), av("2026-04-15", 89.1, 21.1), av("2026-06-14", 86.3, 18.4), av("2026-09-22", 84.2, 15.9)],
  fotos: [
    { id: "f1", mes_ref: "2026-09-01", tipo: "frente", storage_path: "t1/2026-09/frente.jpg", url: "https://treino/1.jpg" },
    { id: "f2", mes_ref: "2026-09-01", tipo: "lateral_direita", storage_path: "t1/2026-09/ld.jpg", url: "https://treino/2.jpg" },
    { id: "f3", mes_ref: "2026-09-01", tipo: "costas", storage_path: "t1/2026-09/costas.jpg", url: "https://treino/3.jpg" },
    { id: "f4", mes_ref: "2026-06-01", tipo: "frente", storage_path: "t1/2026-06/frente.jpg", url: "https://treino/4.jpg" },
  ],
};
const PRINCIPAL: PartePrincipal = {
  objetivo: "definição",
  antropometrias: [
    {
      id: "n1", data: "2026-08-26", peso: 84.9, altura: 178, sexo: "masculino", idade: 31, circunferencias: { cintura: 85.5, abdomen: 88 }, dobras: { peitoral: 14, abdominal: 24, coxa: 17 },
      protocolo: "pollock3", resultados: { percentual_gordura: 16.8, massa_gorda: 14.26, massa_magra: 70.64, imc: 26.8, classificacao_imc: "Sobrepeso" },
      autor_id: "u-camila", autor_nome: "Camila Rocha", criado_em: "2026-08-26T17:00:00Z",
    },
  ],
  fotos: [{ id: "p1", data: "2026-08-26", posicao: "frente", path: "c/p/1.jpg", autor_id: "u-camila", autor_nome: "Camila Rocha", criado_em: "2026-08-26T17:00:00Z", url: "https://principal/1.jpg" }],
};

function montar() {
  return render(
    <MemoryRouter useTransitions={false} initialEntries={["/evolucao"]}>
      <Evolucao />
    </MemoryRouter>,
  );
}

function online(sim: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => sim });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-30T12:00:00-03:00"));
  online(true);
  h.cache.clear();
  h.chamadas = { treino: 0, principal: 0 };
  h.erroTreino = false;
  h.erroPrincipal = false;
  h.treinoUser = { id: "t1" };
  h.treino = TREINO;
  h.principal = PRINCIPAL;
  h.sessao = {
    usuario: { id: "u1", email: "diego@teste.com" },
    situacao: situacao({
      modulos_aluno: ["treino", "nutricao"],
      matriculas: [matricula({ modulos: ["treino", "nutricao"], personal: { id: "u-lucas", nome: "Lucas Ferreira" }, nutricionista: { id: "u-camila", nome: "Camila Rocha" } })],
    }),
  };
});
afterEach(() => {
  vi.useRealTimers();
});

describe("aba Evolução (W10 — tela 4)", () => {
  it("2 bancos juntos: cards, gráfico do peso, 'N avaliações', a última com o autor e as fotos com cadeado", async () => {
    montar();
    await waitFor(() => expect(document.querySelector('[data-aba-evolucao="dados"]')).not.toBeNull());
    expect(screen.getByRole("heading", { name: "Evolução" })).toBeInTheDocument();
    // 6M é o filtro de abertura
    expect(screen.getByRole("radio", { name: "6M" })).toHaveAttribute("aria-checked", "true");
    const peso = document.querySelector('[data-kpi-evolucao="peso"]')!;
    expect(peso.textContent).toContain("84,2");
    expect(peso.textContent).toContain("4,9 kg"); // 89,1 (15/04) → 84,2 (22/09)
    expect(document.querySelector('[data-kpi-evolucao="gordura"]')!.textContent).toContain("5,2 pts");
    expect(document.querySelector('[data-kpi-evolucao="massaMagra"]')!.textContent).toContain("M. magra");
    expect(document.querySelector("[data-grafico-titulo]")!.textContent).toBe("De 89,1 kg pra 84,2 kg");
    // 15/04, 14/06, 26/08 (nutri), 22/09 = 4 no período
    expect(document.querySelector("[data-evolucao-contagem]")!.textContent).toBe("4 avaliações");
    expect(document.querySelector("[data-grafico-balao]")!.textContent).toContain("22/09");
    const ultima = document.querySelector("[data-ultima-avaliacao]")!;
    expect(ultima.textContent).toContain("Avaliação por 7 dobras");
    expect(ultima.textContent).toContain("22/09 · Lucas Ferreira, seu personal");
    // fotos da data mais recente (setembro, do personal): Frente, Lado, Costas desfocadas até tocar
    expect(document.querySelector("[data-fotos-sessao]")!.textContent).toBe("Setembro 2026 · Lucas Ferreira, seu personal");
    const frente = document.querySelector('[data-foto-slot="frente"] [data-foto-cadeado]')!;
    expect(frente.getAttribute("data-foto-cadeado")).toBe("fechada");
    fireEvent.click(frente);
    expect(frente.getAttribute("data-foto-cadeado")).toBe("aberta");
    fireEvent.click(frente);
    expect(frente.getAttribute("data-foto-cadeado")).toBe("fechada");
    expect(h.chamadas).toEqual({ treino: 1, principal: 1 });
  });

  it("1A muda os cards e o gráfico (90,3 → 84,2 = 6,1 kg); 3M também", async () => {
    montar();
    await waitFor(() => expect(document.querySelector("[data-grafico-titulo]")).not.toBeNull());
    fireEvent.click(screen.getByRole("radio", { name: "1A" }));
    expect(document.querySelector("[data-grafico-titulo]")!.textContent).toBe("De 90,3 kg pra 84,2 kg");
    expect(document.querySelector('[data-kpi-evolucao="peso"]')!.textContent).toContain("6,1 kg");
    expect(document.querySelector("[data-evolucao-contagem]")!.textContent).toBe("5 avaliações");
    fireEvent.click(screen.getByRole("radio", { name: "3M" }));
    expect(document.querySelector("[data-grafico-titulo]")!.textContent).toBe("De 84,9 kg pra 84,2 kg");
  });

  it("Ver: a composição completa da última (perfil atual): tipo, %, massas, classificação, dobras, medidas e TMB", async () => {
    montar();
    await waitFor(() => expect(document.querySelector("[data-ver-avaliacao]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-ver-avaliacao]")!);
    const painel = await screen.findByRole("dialog");
    const txt = painel.textContent ?? "";
    for (const esperado of ["Composição corporal", "7 dobras", "15,9%", "13,4 kg", "70,8 kg", "Masculino", "31 anos", "84,2 kg", "178 cm", "Boa Forma", "Peitoral", "Cintura", "84,0", "TMB Katch-McArdle", "1.900"]) {
      expect(txt).toContain(esperado);
    }
  });

  it("'N avaliações' abre a tabela com as 2 origens e a variação desde a anterior; a linha abre a composição dela", async () => {
    montar();
    await waitFor(() => expect(document.querySelector("[data-evolucao-contagem]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-evolucao-contagem]")!);
    const painel = await screen.findByRole("dialog");
    const linhas = painel.querySelectorAll("[data-linha-avaliacao]");
    // o mesmo N do botão (4 no 6M): o 14/03 fica fora dos 6 meses
    expect(document.querySelector("[data-evolucao-contagem]")!.textContent).toBe("4 avaliações");
    expect(painel.textContent).toContain("4 avaliações");
    expect([...linhas].map((l) => l.getAttribute("data-linha-origem"))).toEqual(["treino", "principal", "treino", "treino"]);
    expect(linhas[1].querySelector("[data-linha-autor]")!.textContent).toBe("Pollock 3 · Camila");
    expect(linhas[0].querySelector('[data-celula="peso"]')!.textContent).toContain("−0,7"); // 84,9 (nutri) → 84,2
    // o resumo do período = o card Peso do período (89,1 → 84,2 = −4,9)
    expect(painel.querySelector("[data-resumo-titulo]")!.textContent).toBe("Resumo do período");
    expect(painel.querySelector('[data-resumo="peso"]')!.textContent).toContain("−4,9");
    expect(document.querySelector('[data-kpi-evolucao="peso"]')!.textContent).toContain("4,9 kg");
    // "Ver todas (5)": o histórico inteiro e o resumo "Desde a 1ª avaliação" (90,3 → 84,2 = −6,1)
    fireEvent.click(painel.querySelector("[data-tabela-ver-todas]")!);
    expect(painel.querySelectorAll("[data-linha-avaliacao]")).toHaveLength(5);
    expect(painel.querySelector("[data-resumo-titulo]")!.textContent).toBe("Desde a 1ª avaliação");
    expect(painel.querySelector('[data-resumo="peso"]')!.textContent).toContain("−6,1");
    fireEvent.click(painel.querySelector("[data-tabela-ver-periodo]")!);
    expect(painel.querySelectorAll("[data-linha-avaliacao]")).toHaveLength(4);
    fireEvent.click(painel.querySelectorAll("[data-linha-avaliacao]")[1]);
    await waitFor(() => expect(document.querySelector('[data-composicao="principal:n1"]')).not.toBeNull());
    const comp = document.querySelector('[data-composicao="principal:n1"]')!.textContent ?? "";
    expect(comp).toContain("Jackson & Pollock — 3 dobras");
    expect(comp).toContain("26,8 · Sobrepeso");
    expect(comp).toContain("Abdômen");
  });

  it("Comparar: a mesma posição em 2 datas das 2 origens (penúltima × última)", async () => {
    montar();
    await waitFor(() => expect(document.querySelector("[data-comparar]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-comparar]")!);
    await waitFor(() => expect(document.querySelector("[data-sheet-comparar]")).not.toBeNull());
    const antes = document.querySelector('[data-comparar-data="antes"]') as HTMLSelectElement;
    const depois = document.querySelector('[data-comparar-data="depois"]') as HTMLSelectElement;
    expect(antes.value).toBe("principal:2026-08-26");
    expect(depois.value).toBe("treino:2026-09-01");
    expect(document.querySelector('[data-comparar-legenda="antes"]')!.textContent).toBe("26/08/2026 · nutricionista");
    fireEvent.change(antes, { target: { value: "treino:2026-06-01" } });
    expect(document.querySelector('[data-comparar-legenda="antes"]')!.textContent).toBe("Junho 2026 · personal");
    expect(document.querySelectorAll('[data-sheet-comparar] [data-foto-cadeado="fechada"]')).toHaveLength(2);
  });

  it("aluno sem nenhuma avaliação e sem foto: o estado vazio (e o do aluno sem profissional)", async () => {
    h.treino = { perfil: { id: "t1", peso: null }, avaliacoes: [], fotos: [] };
    h.principal = { objetivo: null, antropometrias: [], fotos: [] };
    montar();
    await waitFor(() => expect(document.querySelector('[data-aba-evolucao="vazia"]')).not.toBeNull());
    expect(screen.getByText("Sua evolução aparece aqui")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "6M" })).toBeNull();
    expect(document.querySelector("[data-evolucao-ver-registros]")).toBeNull();
  });

  it("aluno só de Nutrição (sem sessão do Treino): só a parte do principal, sem erro", async () => {
    h.treinoUser = null;
    h.sessao = { ...h.sessao, situacao: situacao({ modulos_aluno: ["nutricao"], matriculas: [matricula({ modulos: ["nutricao"], personal: null, nutricionista: { id: "u-camila", nome: "Camila Rocha" } })] }) };
    montar();
    await waitFor(() => expect(document.querySelector('[data-aba-evolucao="dados"]')).not.toBeNull());
    expect(h.chamadas.treino).toBe(0);
    expect(document.querySelector("[data-ultima-avaliacao]")!.textContent).toContain("26/08 · Camila Rocha, nutricionista");
    expect(document.querySelector("[data-grafico-sem-pontos]")).not.toBeNull(); // 1 avaliação: o gráfico explica
    expect(document.querySelector("[data-evolucao-aviso]")).toBeNull();
  });

  it("uma parte falha: a outra aparece e o aviso diz qual (Tentar de novo busca de novo)", async () => {
    h.erroPrincipal = true;
    montar();
    await waitFor(() => expect(document.querySelector('[data-evolucao-aviso="erro"]')).not.toBeNull());
    expect(document.querySelector("[data-evolucao-aviso]")!.textContent).toContain("nutricionista");
    expect(document.querySelector("[data-ultima-avaliacao]")!.textContent).toContain("Lucas Ferreira");
    h.erroPrincipal = false;
    fireEvent.click(document.querySelector("[data-evolucao-tentar]")!);
    await waitFor(() => expect(document.querySelector("[data-evolucao-aviso]")).toBeNull());
    expect(h.chamadas.principal).toBe(2);
  });

  it("sem internet: mostra o que já foi aberto (cache do aparelho); sem nada guardado, 'Sem conexão'", async () => {
    const r = montar();
    await waitFor(() => expect(document.querySelector('[data-aba-evolucao="dados"]')).not.toBeNull());
    await waitFor(() => expect(h.cache.size).toBe(1));
    r.unmount();
    online(false);
    h.chamadas = { treino: 0, principal: 0 };
    montar();
    await waitFor(() => expect(document.querySelector('[data-evolucao-aviso="sem-conexao"]')).not.toBeNull());
    expect(document.querySelector("[data-evolucao-aviso]")!.textContent).toContain("mostrando o que foi aberto");
    expect(document.querySelector("[data-ultima-avaliacao]")).not.toBeNull();
    expect(h.chamadas).toEqual({ treino: 0, principal: 0 });
    // outra pessoa no aparelho, sem nada guardado
    h.sessao = { ...h.sessao, usuario: { id: "u2", email: "outra@teste.com" } };
    const r2 = montar();
    await waitFor(() => expect(r2.container.querySelector('[data-aba-evolucao="sem-conexao"]')).not.toBeNull());
    expect(within(r2.container).getByText("Sem conexão")).toBeInTheDocument();
  });

  it("só do Calc com registros sem número: o vazio oferece ver as avaliações (a linha do tempo antiga as mostrava)", async () => {
    h.treino = { perfil: { id: "t1" }, avaliacoes: [{ id: "v1", data_avaliacao: "2026-07-15", created_at: "2026-07-15T12:00:00Z" }], fotos: [] };
    h.principal = { objetivo: null, antropometrias: [], fotos: [] };
    montar();
    await waitFor(() => expect(document.querySelector("[data-evolucao-ver-registros]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-evolucao-ver-registros]")!);
    const painel = await screen.findByRole("dialog");
    expect(painel.querySelectorAll("[data-linha-avaliacao]")).toHaveLength(1);
    expect(painel.textContent).toContain("15/07/26");
  });

  it("período sem nenhuma avaliação: '0 no período' abre a tabela direto em todas", async () => {
    h.treino = { perfil: null, fotos: [], avaliacoes: [av("2025-10-10", 88, 20), av("2025-11-10", 87, 19)] };
    h.principal = { objetivo: null, antropometrias: [], fotos: [] };
    montar();
    await waitFor(() => expect(document.querySelector("[data-evolucao-contagem]")).not.toBeNull());
    fireEvent.click(screen.getByRole("radio", { name: "3M" }));
    expect(document.querySelector("[data-evolucao-contagem]")!.textContent).toBe("2 no total");
    fireEvent.click(document.querySelector("[data-evolucao-contagem]")!);
    const painel = await screen.findByRole("dialog");
    expect(painel.querySelector("[data-sheet-avaliacoes]")!.getAttribute("data-sheet-avaliacoes")).toBe("todas");
    expect(painel.querySelectorAll("[data-linha-avaliacao]")).toHaveLength(2);
    expect(painel.querySelector("[data-tabela-ver-periodo]")).toBeNull();
  });
});
