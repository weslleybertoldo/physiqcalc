import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { REGRAS_PADRAO, type TagAgenda } from "@/agenda/regras";
import ChipEvento from "./ChipEvento";
import type { Calendario } from "./dados";
import PainelAgenda from "./PainelAgenda";
import type { EventoPainel } from "./visao";

const tg = (extra: Partial<TagAgenda>): TagAgenda => ({ id: "x", profissional_id: "eu", nome: "X", cor: "#94a3b8", area: "geral", base: false, ordem: 9, ...extra });
const cal = (id: string, dono: string, nome: string): Calendario => ({
  id, nutricionista_id: dono, nome, cor: "#a78bfa", padrao: true, faixa_inicio: "07:00:00", faixa_fim: "20:00:00", slot_minutos: null, conta_id: "k",
  tag_padrao_id: null, created_at: "", deleted_at: null,
});

const TAGS: TagAgenda[] = [
  tg({ id: "bt", nome: "Treino", cor: "#a78bfa", area: "treino", base: true, ordem: 1 }),
  tg({ id: "bn", nome: "Nutrição", cor: "#34d399", area: "nutricao", base: true, ordem: 2 }),
  tg({ id: "bg", nome: "Geral", area: "geral", base: true, ordem: 3 }),
  tg({ id: "re", nome: "Reunião", cor: "#f472b6", area: "geral", ordem: 4 }),
  tg({ id: "cn", profissional_id: "camila", nome: "Nutrição", cor: "#34d399", area: "nutricao", base: true, ordem: 2 }),
  // um profissional que não está nesta agenda (o master lê as tags de todos pela RLS): não pode aparecer
  tg({ id: "zz", profissional_id: "outro", nome: "Tag de outro", cor: "#f87171", area: "treino", ordem: 4 }),
];

const painel = (tags = TAGS) =>
  render(
    <PainelAgenda uid="eu" calendarios={[cal("c1", "eu", "Treino"), cal("c2", "camila", "Nutrição")]} ocultos={new Set()} nomes={new Map([["camila", "Camila Rocha"]])}
      tags={tags} tagsCarregando={false} onNovaTag={() => {}} onEditarTag={() => {}} onExcluirTag={() => {}}
      regras={REGRAS_PADRAO} regrasCarregando={false} travas={[]} bloqueios={[]} exportando={false} onAlternar={() => {}} onNovoCalendario={() => {}}
      onEditarCalendario={() => {}} onEditarRegras={() => {}} onTravar={() => {}} onLiberarTrava={() => {}} onExcluirBloqueio={() => {}} onExportar={() => {}} />,
  );

describe("Agenda › bloco Tags (W2)", () => {
  it("lista as MINHAS tags (cor, nome, área); as 3 prontas sem excluir; as minhas com editar e excluir", () => {
    painel();
    const itens = [...document.querySelectorAll("[data-tags-minhas] [data-tag-item]")].map((e) => e.getAttribute("data-tag-item"));
    expect(itens).toEqual(["bt", "bn", "bg", "re"]);
    expect(document.querySelector('[data-btn-excluir-tag="bt"]')).toBeNull();
    expect(document.querySelector('[data-btn-excluir-tag="re"]')).not.toBeNull();
    expect(document.querySelector('[data-btn-editar-tag="bt"]')).not.toBeNull();
    expect(document.querySelector('[data-tag-item="re"]')?.textContent).toContain("Geral");
  });

  it("o dono vê as tags da equipe só para ler; as de quem não está na agenda (master) não aparecem", () => {
    painel();
    const equipe = document.querySelector('[data-tags-membro="camila"]');
    expect(equipe?.textContent).toContain("Camila Rocha");
    expect(equipe?.querySelector('[data-tag-pilula="cn"]')).not.toBeNull();
    expect(document.querySelector('[data-btn-excluir-tag="cn"]')).toBeNull();
    expect(document.body.textContent).not.toContain("Tag de outro");
  });
});

describe("Agenda › a consulta mostra a tag (W2)", () => {
  const ev = { id: "e1", titulo: "Reunião de equipe", inicio: new Date(2026, 9, 15, 9), fim: new Date(2026, 9, 15, 10), diaInteiro: false, status: "agendado",
    confirmacao: "a_confirmar", calendarioId: "c1", profissionalId: "eu", pacienteId: null, aluno: null, foto: null, observacao: null, modulo: "geral",
    tag: { id: "re", nome: "Reunião", cor: "#f472b6" }, reagendamentos: 0, origem: "profissional", cor: "#a78bfa" } as EventoPainel;

  it("semana: o nome da tag na cor dela (a inicial só quando o chip é estreito — container query); mês: só a inicial", () => {
    const { unmount } = render(<ChipEvento ev={ev} onAbrir={() => {}} />);
    const p = document.querySelector("[data-tag-pilula]") as HTMLElement;
    expect(p.getAttribute("data-tag-nome")).toBe("Reunião");
    expect(p.getAttribute("title")).toBe("Reunião");
    expect(p.querySelector("[data-tag-nome-completo]")?.textContent).toBe("Reunião");
    expect(p.querySelector("[data-tag-inicial]")?.textContent).toBe("R");
    expect(p.style.background).toContain("244, 114, 182");
    expect(document.querySelector("[data-evento]")?.getAttribute("data-tag-evento")).toBe("re");
    expect(document.querySelector("[data-evento]")?.className).toContain("@container");
    unmount();
    render(<ChipEvento ev={ev} onAbrir={() => {}} compacto inicialDaTag />);
    expect(document.querySelector("[data-tag-pilula]")?.textContent).toBe("R");
    expect(document.querySelector("[data-tag-nome-completo]")).toBeNull();
  });
});
