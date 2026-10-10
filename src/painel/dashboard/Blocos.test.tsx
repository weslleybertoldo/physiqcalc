import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { TAG_BASE, tagDaConsulta, type TagAgenda } from "@/agenda/regras";
import type { EventoPainel } from "@/painel/agenda/visao";
import { AgendaHoje } from "./Blocos";

const REUNIAO: TagAgenda = { id: "t-reuniao", profissional_id: "u1", nome: "Reunião", cor: "#f472b6", area: "geral", base: false, ordem: 4 };
const NUTRI: TagAgenda = { id: "t-nutri", profissional_id: "u1", nome: "Nutrição", cor: "#34d399", area: "nutricao", base: true, ordem: 2 };
const TAGS = new Map([REUNIAO, NUTRI].map((t) => [t.id, t]));

const evento = (id: string, hora: string, modulo: EventoPainel["modulo"], tagId: string | null, extra: Partial<EventoPainel> = {}): EventoPainel => {
  const inicio = new Date(`2026-10-02T${hora}:00-03:00`);
  const t = tagDaConsulta(tagId, modulo, TAGS);
  return {
    id, titulo: "Consulta", inicio, fim: new Date(inicio.getTime() + 1_800_000), diaInteiro: false, status: "agendado", confirmacao: "a_confirmar",
    calendarioId: "c1", profissionalId: "u1", pacienteId: "p1", aluno: "Marina Alves", foto: null, observacao: null, modulo,
    tag: { id: t.id, nome: t.nome, cor: t.cor }, reagendamentos: 0, origem: "profissional", cor: "#a78bfa", ...extra,
  };
};

function montar(eventos: EventoPainel[] | null, carregando = false) {
  return render(
    <MemoryRouter useTransitions={false}>
      <AgendaHoje eventos={eventos} carregando={carregando} erro={false} aoTentar={() => {}} hoje="2026-10-02" />
    </MemoryRouter>,
  );
}

const pilula = (id: string) => document.querySelector(`[data-agenda-hoje-evento="${id}"] [data-tag-pilula]`) as HTMLElement | null;

describe("Dashboard › Agenda de hoje — a pílula da TAG (H1)", () => {
  it("cada consulta com a pílula da tag dela (nome e cor), como na página Agenda; sem o chip TREINO/NUTRI de antes", () => {
    montar([
      evento("a", "09:00", "geral", REUNIAO.id, { pacienteId: null, aluno: null, titulo: "Reunião de equipe" }),
      evento("b", "10:00", "nutricao", NUTRI.id, { titulo: "Consulta de nutrição" }),
    ]);
    expect(pilula("a")?.getAttribute("data-tag-nome")).toBe("Reunião");
    expect(pilula("a")?.textContent).toBe("Reunião");
    expect(pilula("a")?.style.background).toContain("244, 114, 182");
    expect(document.querySelector('[data-agenda-hoje-evento="a"]')?.getAttribute("data-agenda-hoje-tag")).toBe(REUNIAO.id);
    expect(pilula("b")?.getAttribute("data-tag-nome")).toBe("Nutrição");
    expect(pilula("b")?.style.background).toContain("52, 211, 153");
    const card = document.querySelector("[data-cartao-agenda-hoje-dashboard]")!;
    expect(card.querySelector("[data-chip]")).toBeNull();
    expect(card.textContent).not.toMatch(/TREINO|NUTRI\b/);
    // a linha de baixo: o título; sem título próprio (compromisso sem aluno), a tag
    expect(document.querySelector('[data-agenda-hoje-evento="b"]')?.textContent).toContain("Consulta de nutrição");
  });

  it("sem a tag carregada (ou de quem não dá para ler), a base da área do modulo", () => {
    montar([evento("c", "11:00", "treino", "tag-que-nao-veio")]);
    expect(pilula("c")?.getAttribute("data-tag-nome")).toBe(TAG_BASE.treino.nome);
    expect(pilula("c")?.style.background).toContain("167, 139, 250");
    expect(document.querySelector('[data-agenda-hoje-evento="c"]')?.getAttribute("data-agenda-hoje-tag")).toBe("");
  });

  it("carregando (as consultas ou as tags na 1ª carga): o esqueleto, sem lista", () => {
    montar(null, true);
    expect(document.querySelector("[data-agenda-hoje-evento]")).toBeNull();
    expect(document.querySelector("[data-cartao-agenda-hoje-dashboard]")?.getAttribute("data-agenda-hoje")).toBe("0");
  });
});
