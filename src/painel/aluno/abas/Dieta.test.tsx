import { fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PerfilAluno } from "@/painel/aluno/dados/tipos";
import { perfil } from "@/test/fixturesPerfilAluno";

// W-A P6 — a aba Dieta da ficha com o "Dia a dia" (spec §4.5; P7 e Q1 do Weslley): a nutri (e o dono e o master) ganham a seção "Dia a dia" (a
// 2ª, depois do Plano; ?secao=dia-a-dia); o personal (só o plano) vê o dia a dia embaixo da adesão, só para ler; o dono sem papel de nutri, a
// seção dentro do modo só leitura. As seções de verdade e o dia a dia são fingidos (cada um tem o teste dele).
const h = vi.hoisted(() => ({ perfil: null as unknown }));
vi.mock("@/painel/aluno/dados/usePerfilAluno", () => ({
  usePerfilAluno: () => ({ data: h.perfil, isLoading: false, error: null, refetch: vi.fn() }),
  chavePerfilAluno: (id: string) => ["aluno-perfil", id],
}));
vi.mock("@/nutricao/editor/secoes/Planejamento", () => ({ default: () => <div data-plano-falso /> }));
vi.mock("@/nutricao/editor/ui/ConcluidasDoPeriodo", () => ({ ConcluidasDoPeriodo: () => <div data-adesao-falsa /> }));
vi.mock("@/nutricao/editor/lib/consultas", () => ({ usePlanosDoAluno: () => ({ data: [], isLoading: false }) }));
vi.mock("@/painel/aluno/diaADia/DiaADia", () => ({
  default: (p: { alunoId: string; pacienteId: string; nome: string | null }) => <div data-dia-a-dia-falso={`${p.alunoId}|${p.pacienteId}|${p.nome}`} />,
}));

import Dieta from "./Dieta";

const NUTRI = { id: "u2", dono: false, personal: false, nutricionista: true, master: false };
const PERSONAL = { id: "u1", dono: false, personal: true, nutricionista: false, master: false };
const DONO = { id: "u9", dono: true, personal: true, nutricionista: false, master: false };

let local = "";
function Onde() {
  const l = useLocation();
  local = `${l.pathname}${l.search}`;
  return null;
}
function montar(p: PerfilAluno, rota = "/painel/alunos/rota-1/dieta") {
  h.perfil = p;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[rota]}>
        <Dieta alunoId="rota-1" />
        <Onde />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const achar = (sel: string) => waitFor(() => {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`sem ${sel}`);
  return el as HTMLElement;
});

beforeEach(() => {
  local = "";
});

describe("W-A P6 — a aba Dieta da ficha com o Dia a dia", () => {
  it("a nutri: 8 seções (o 'Dia a dia' é a 2ª); tocar abre a seção pelo ?secao= com a rota, a matrícula e o nome", async () => {
    montar(perfil({ eu: NUTRI, nutricionista: { id: "u2", nome: "Camila Rocha" } }));
    await achar('[data-acesso-dieta="editar"]');
    const botoes = [...document.querySelectorAll("[data-secao-dieta-botao]")];
    expect(botoes.map((b) => b.getAttribute("data-secao-dieta-botao"))).toEqual([
      "planejamento", "dia-a-dia", "acompanhamento", "calculo-energetico", "suplementos", "manipulados", "orientacoes", "metas",
    ]);
    expect(botoes[1].textContent).toBe("Dia a dia");
    expect(document.querySelector("[data-dia-a-dia-falso]")).toBeNull();
    fireEvent.click(botoes[1]);
    const dia = await achar("[data-dia-a-dia-falso]");
    expect(dia.getAttribute("data-dia-a-dia-falso")).toBe("rota-1|p1|Rafael Moura");
    expect(local).toBe("/painel/alunos/rota-1/dieta?secao=dia-a-dia");
    expect(document.querySelector('[data-aba-dieta-aluno]')!.getAttribute("data-secao-dieta")).toBe("dia-a-dia");
  });

  it("o personal (só o plano, Q1): sem as seções; o plano, a adesão e, embaixo dela, o dia a dia (só para ler)", async () => {
    montar(perfil({ eu: PERSONAL }));
    await achar('[data-acesso-dieta="so-plano"]');
    expect(document.querySelectorAll("[data-secao-dieta-botao]")).toHaveLength(0);
    const dia = await achar("[data-dia-a-dia-falso]");
    const ordem = [...document.querySelectorAll("[data-plano-falso], [data-adesao-falsa], [data-dia-a-dia-falso]")].map((e) =>
      e.hasAttribute("data-plano-falso") ? "plano" : e.hasAttribute("data-adesao-falsa") ? "adesao" : "dia");
    expect(ordem).toEqual(["plano", "adesao", "dia"]);
    expect(dia.getAttribute("data-dia-a-dia-falso")).toBe("rota-1|p1|Rafael Moura");
  });

  it("o dono sem papel de nutri ('ver'): o Dia a dia pelo ?secao= dentro do modo só leitura", async () => {
    montar(perfil({ eu: DONO }), "/painel/alunos/rota-1/dieta?secao=dia-a-dia");
    await achar('[data-acesso-dieta="ver"]');
    await achar("[data-dieta-leitura] [data-dia-a-dia-falso]");
  });

  it("aluno sem a Nutrição: 'Este aluno não tem dieta' (nada do dia a dia)", async () => {
    montar(perfil({ eu: NUTRI, modulos: ["treino"] }));
    await waitFor(() => expect(document.body.textContent).toContain("Este aluno não tem dieta"));
    expect(document.querySelector("[data-dia-a-dia-falso]")).toBeNull();
  });
});
