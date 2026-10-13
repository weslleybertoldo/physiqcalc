import { fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiaDoAluno, ItemDoDia, RotinaDoProfissional, RotinasDoAluno } from "@/aluno-dia/tipos";

// W-A P6 — o "Dia a dia" da aba Dieta da ficha (spec §4.5; P7 e Q1): os 14 dias (hoje escolhido), por refeição os itens do plano (riscado o que
// ele tirou), o que ele pôs ("pelo aluno", com os macros) e o ✓; a refeição extra; o que ficou fora do plano ("refeição tirada do plano"); o
// total comido × plano; as rotinas do dia; a faixa "Só ver" quando travada; o vazio; o erro; e no modo só leitura os dias continuam trocando.
// A aluno-dia é fingida (a porta da P2) e o plano e os ✓ vêm das consultas da ficha (fingidas aqui — a nutricao é da ficha).
const h = vi.hoisted(() => ({
  lerDia: vi.fn(),
  lerRotinas: vi.fn(),
  planos: { data: [] as unknown[], isLoading: false, isError: false },
  concluidas: { data: [] as { refeicao_id: string; data: string }[], isLoading: false, isError: false },
}));
vi.mock("@/aluno-dia/api", async (orig) => ({
  ...(await orig<typeof import("@/aluno-dia/api")>()),
  lerDiaDoAluno: (...a: unknown[]) => h.lerDia(...a),
  lerRotinasDoAluno: (...a: unknown[]) => h.lerRotinas(...a),
}));
vi.mock("@/nutricao/editor/lib/consultas", () => ({
  usePlanosDoAluno: () => h.planos,
  useConcluidas: () => h.concluidas,
}));

import { ErroAlunoDia } from "@/aluno-dia/api";
import { hojeSP } from "@/aluno-dia/regras";
import { somarDias } from "@/nutricao/app/dia";
import { SomenteLeitura } from "@/nutricao/editor/ui/SomenteLeitura";
import DiaADia from "./DiaADia";
import { TEXTOS_DIA } from "./regras";

const HOJE = hojeSP();
const ONTEM = somarDias(HOJE, -1);
const al = (id: string, kcal: number) => ({ id, nome: id === "pao" ? "Pão francês" : id === "ovo" ? "Ovo cozido" : "Arroz", fonte: "taco", grupo: null,
  energia_kcal: kcal, proteina_g: 5, carboidrato_g: 20, lipidio_g: 2, fibra_g: 1, sodio_mg: 0 });
const it_ = (id: string, kcal: number, ordem = 0) => ({ id, alimento_id: id, quantidade_g: 100, medida_caseira_id: null, quantidade_medida: null, ordem,
  substitutos: null, observacao: null, created_at: "2026-10-01T00:00:00Z", alimento: al(id, kcal) });
const PLANO = {
  id: "plano", paciente_id: "pac", favorito: true, created_at: "2026-10-01T00:00:00Z", titulo: "Plano", metodo: "alimentos", kcal_alvo: null, observacao: null,
  refeicoes: [
    { id: "cafe", nome: "Café da manhã", horario: "07:00:00", ordem: 0, observacao: null, dias_semana: [], itens: [it_("pao", 300), it_("ovo", 150, 1)] },
    { id: "almoco", nome: "Almoço", horario: "12:00:00", ordem: 1, observacao: null, dias_semana: [], itens: [it_("arroz", 400)] },
  ],
};
const posto = (o: Partial<ItemDoDia> & Pick<ItemDoDia, "id" | "tipo">): ItemDoDia => ({
  paciente_id: "pac", dia: HOJE, refeicao_id: null, extra_id: null, item_refeicao_id: null, alimento_id: null, aluno_alimento_id: null, aluno_receita_id: null,
  quantidade_g: 100, porcoes: null, refeicao_nome: null, nome: "x", energia_kcal: 0, proteina_g: 0, carboidrato_g: 0, lipidio_g: 0, fibra_g: 0,
  criado_em: new Date().toISOString(), ...o,
});
const DIA: DiaDoAluno = {
  paciente_id: "pac", nivel: "mexer", liberada: true,
  extras: [{ id: "e1", dia: HOJE, nome: "Lanche da tarde", horario: "16:00", concluida_em: new Date().toISOString() }],
  itens: [
    posto({ id: "t1", tipo: "tirado", refeicao_id: "cafe", refeicao_nome: "Café da manhã", item_refeicao_id: "ovo", nome: "Ovo cozido", energia_kcal: 150 }),
    posto({ id: "a1", tipo: "adicionado", refeicao_id: "cafe", refeicao_nome: "Café da manhã", nome: "Banana prata", quantidade_g: 120, energia_kcal: 118.8,
      proteina_g: 1.56, carboidrato_g: 31.2, lipidio_g: 0.12 }),
    posto({ id: "a2", tipo: "adicionado", extra_id: "e1", nome: "Vitamina", quantidade_g: null, porcoes: 2, energia_kcal: 260 }),
    posto({ id: "a3", tipo: "adicionado", refeicao_nome: "Ceia", nome: "Iogurte natural", energia_kcal: 90 }),
    posto({ id: "a4", tipo: "adicionado", refeicao_id: "almoco", refeicao_nome: "Almoço", nome: "Feijão", dia: ONTEM, energia_kcal: 140 }),
  ],
};
const rotina = (o: Partial<RotinaDoProfissional> & Pick<RotinaDoProfissional, "id">): RotinaDoProfissional => ({
  origem: "aluno", paciente_id: null, nome: o.id, detalhe: null, tipo: "suplemento", horario: null, dias_semana: [1, 2, 3, 4, 5, 6, 7], lembrete: false,
  ordem: 0, criada_em: "2026-10-01T10:00:00Z", alterada_em: "2026-10-01T10:00:00Z", arquivada_em: null, pode_editar: false, criada_por_nome: null,
  arquivada_pelo_aluno: false, ...o,
});
const ROTINAS: RotinasDoAluno = {
  paciente_id: "pac", tem_login: true, pode_criar: true, historico: [],
  rotinas: [rotina({ id: "creatina", nome: "Creatina", detalhe: "5 g", horario: "08:00" }),
    rotina({ id: "agua", nome: "Água 2 L", origem: "profissional", horario: "10:00", criada_por_nome: "Ana" })],
  feitas: [{ rotina_id: "creatina", dia: HOJE, feita_em: new Date().toISOString() }],
};

function montar(leitura = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const el = <DiaADia alunoId="rota-1" pacienteId="pac" nome="Bianca Souza" />;
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{leitura ? <SomenteLeitura>{el}</SomenteLeitura> : el}</MemoryRouter>
    </QueryClientProvider>,
  );
}
const achar = (sel: string) => waitFor(() => {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`sem ${sel}`);
  return el as HTMLElement;
});
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;

beforeEach(() => {
  h.lerDia.mockReset().mockResolvedValue(DIA);
  h.lerRotinas.mockReset().mockResolvedValue(ROTINAS);
  h.planos = { data: [PLANO], isLoading: false, isError: false };
  h.concluidas = { data: [{ refeicao_id: "cafe", data: HOJE }], isLoading: false, isError: false };
});

describe("W-A P6 — o Dia a dia da ficha", () => {
  it("hoje: o ✓ da refeição, o item que ele tirou riscado, o que ele pôs com os macros, a extra, o que ficou fora do plano, o total e as rotinas", async () => {
    montar();
    await achar('[data-dia-a-dia="pronto"]');
    expect(h.lerDia).toHaveBeenCalledWith("rota-1", somarDias(HOJE, -13), HOJE);
    expect(h.lerRotinas).toHaveBeenCalledWith("rota-1", somarDias(HOJE, -13), HOJE);
    expect(document.querySelectorAll("[data-dia-a-dia-botao]")).toHaveLength(14);
    expect(q("[data-dia-a-dia-botao][aria-pressed=true]")!.textContent).toBe("Hoje");
    expect(q(`[data-dia-a-dia-botao="${HOJE}"]`)!.getAttribute("data-dia-a-dia-com")).toBe("1");
    expect(q("[data-dia-a-dia-conteudo]")!.getAttribute("data-dia-a-dia-conteudo")).toBe(HOJE);
    // o café com ✓, o ovo riscado ("tirou"), a banana "pelo aluno" com os macros; o almoço sem ✓
    expect(q('[data-dia-refeicao="cafe"]')!.getAttribute("data-dia-refeicao-feita")).toBe("1");
    expect(q('[data-dia-refeicao="almoco"]')!.getAttribute("data-dia-refeicao-feita")).toBe("0");
    expect(q('[data-dia-item="ovo"]')!.getAttribute("data-dia-item-tirado")).toBe("1");
    expect(q('[data-dia-item="ovo"] [data-dia-item-tirou]')!.textContent).toBe("tirou");
    expect(q('[data-dia-item="pao"]')!.getAttribute("data-dia-item-tirado")).toBe("0");
    expect(q('[data-dia-refeicao="cafe"] [data-dia-posto="a1"]')!.textContent).toContain("Banana prata");
    expect(q('[data-dia-posto="a1"] [data-dia-posto-macros]')!.textContent).toBe("≈ 119 kcal · P 1,6 g · C 31,2 g · G 0,1 g");
    // a extra com "Já comi" e o que ele pôs nela (em porções)
    expect(q('[data-dia-extra="e1"]')!.getAttribute("data-dia-extra-feita")).toBe("1");
    expect(q('[data-dia-extra="e1"] [data-dia-posto="a2"]')!.textContent).toContain("2 porções");
    // a nutri tirou a "Ceia" do plano depois: o retrato com o selo
    expect(q('[data-dia-fora="Ceia"] [data-dia-fora-selo]')!.textContent).toBe("refeição tirada do plano");
    expect(q('[data-dia-fora="Ceia"] [data-dia-posto="a3"]')).not.toBeNull();
    // ontem não entra no dia de hoje
    expect(q('[data-dia-posto="a4"]')).toBeNull();
    // o total: o café (o pão; o ovo tirado não) + a banana + a vitamina da extra × o plano (café + almoço)
    const total = q("[data-dia-a-dia-total]")!;
    expect([total.getAttribute("data-kcal-comido"), total.getAttribute("data-kcal-plano")]).toEqual(["679", "850"]);
    expect(total.textContent).toContain("679 de 850 kcal");
    // as rotinas do dia: a creatina feita, a água não
    expect(q("[data-dia-rotinas]")!.getAttribute("data-dia-rotinas")).toBe("2");
    expect(q('[data-dia-rotinas] [data-rotina-painel="creatina"]')!.getAttribute("data-rotina-feita")).toBe("1");
    expect(q('[data-dia-rotinas] [data-rotina-painel="agua"]')!.getAttribute("data-rotina-feita")).toBe("0");
    // liberada: sem a faixa, o selo "PODE MEXER"
    expect(q("[data-dia-a-dia-travada]")).toBeNull();
    expect(q("[data-dia-a-dia-nivel]")!.textContent).toBe("PODE MEXER");
  });

  it("trocar de dia: 'Ontem' mostra o que ele pôs ontem (e não o de hoje)", async () => {
    montar();
    fireEvent.click(await achar(`[data-dia-a-dia-botao="${ONTEM}"]`));
    await waitFor(() => expect(q("[data-dia-a-dia-conteudo]")!.getAttribute("data-dia-a-dia-conteudo")).toBe(ONTEM));
    expect(q('[data-dia-refeicao="almoco"] [data-dia-posto="a4"]')).not.toBeNull();
    expect(q('[data-dia-posto="a1"]')).toBeNull();
    expect(q('[data-dia-item="ovo"]')!.getAttribute("data-dia-item-tirado")).toBe("0");
  });

  it("travada ('Só ver'): a faixa com o atalho para a aba Acessos; o que ele registrou antes continua aparecendo (spec §2.2-12)", async () => {
    h.lerDia.mockResolvedValue({ ...DIA, nivel: "ver", liberada: false });
    montar();
    await achar('[data-dia-a-dia="pronto"]');
    expect(q("[data-dia-a-dia-travada]")!.textContent).toBe(TEXTOS_DIA.travada);
    expect(q("[data-dia-a-dia-acessos]")!.getAttribute("href")).toBe("/painel/alunos/rota-1/acessos");
    expect(q("[data-dia-a-dia-nivel]")!.textContent).toBe("SÓ VER");
    expect(q('[data-dia-posto="a1"]')).not.toBeNull();
  });

  it("nada registrado nos 14 dias: 'Nada registrado pelo aluno nestes dias.'", async () => {
    h.lerDia.mockResolvedValue({ ...DIA, extras: [], itens: [] });
    h.lerRotinas.mockResolvedValue({ ...ROTINAS, feitas: [] });
    h.concluidas = { data: [], isLoading: false, isError: false };
    montar();
    await achar('[data-dia-a-dia="vazio"]');
    expect(q("[data-dia-a-dia-vazio]")!.textContent).toBe("Nada registrado pelo aluno nestes dias.");
  });

  it("o erro do dia: o texto e 'Tentar de novo' (relê)", async () => {
    h.lerDia.mockRejectedValueOnce(new ErroAlunoDia("sem_internet")).mockResolvedValueOnce(DIA);
    montar();
    await achar('[data-dia-a-dia="erro"]');
    expect(q('[data-dia-a-dia="erro"]')!.textContent).toContain(TEXTOS_DIA.erro);
    fireEvent.click(q("[data-dia-a-dia-tentar]")!);
    await achar('[data-dia-a-dia="pronto"]');
  });

  it("sem plano: as extras, o que ficou fora e as rotinas seguem, com o aviso", async () => {
    h.planos = { data: [], isLoading: false, isError: false };
    montar();
    await achar('[data-dia-a-dia="pronto"]');
    expect(q("[data-dia-a-dia-sem-plano]")).not.toBeNull();
    expect(q('[data-dia-extra="e1"]')).not.toBeNull();
    expect(q('[data-dia-fora="Café da manhã"]')).not.toBeNull();
  });

  it("dentro do modo só leitura (o dono sem papel de nutri): os botões dos dias continuam trocando o dia (data-leitura)", async () => {
    montar(true);
    const ontem = await achar(`[data-dia-a-dia-botao="${ONTEM}"]`);
    expect((ontem as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(ontem);
    await waitFor(() => expect(q("[data-dia-a-dia-conteudo]")!.getAttribute("data-dia-a-dia-conteudo")).toBe(ONTEM));
  });
});
