import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventoDaRotina, RotinaDoProfissional, RotinasDoAluno } from "@/aluno-dia/tipos";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";

// W-A P6 — o card "Rotinas" do Resumo (spec §4.5): as de hoje com o ✓ do ALUNO (só leitura), o selo de quem criou, "Nova rotina" pela folha
// da P3 no modo do profissional (na matrícula da rota), mudar só as de profissional desta matrícula (pode_editar), o "Ver tudo" (as apagadas
// — "apagada pelo aluno em …" — e o histórico), sem login, o erro com "Tentar de novo" e sem internet. A função é fingida (a porta da P2).
const h = vi.hoisted(() => ({
  ler: vi.fn(),
  profSalvar: vi.fn(),
  profArquivar: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/aluno-dia/api", async (orig) => ({
  ...(await orig<typeof import("@/aluno-dia/api")>()),
  lerRotinasDoAluno: (...a: unknown[]) => h.ler(...a),
  profSalvarRotina: (...a: unknown[]) => h.profSalvar(...a),
  profArquivarRotina: (...a: unknown[]) => h.profArquivar(...a),
}));
vi.mock("sonner", () => ({ toast: h.toast }));

import { ErroAlunoDia, MENSAGEM_ERRO_ALUNO_DIA } from "@/aluno-dia/api";
import { hojeSP } from "@/aluno-dia/regras";
import { fmtDiaMes } from "../rotinas/regras";
import CardRotinas from "./CardRotinas";

const HOJE = hojeSP();
const rotina = (o: Partial<RotinaDoProfissional> & Pick<RotinaDoProfissional, "id">): RotinaDoProfissional => ({
  origem: "aluno", paciente_id: null, nome: o.id, detalhe: null, tipo: "suplemento", horario: null, dias_semana: [1, 2, 3, 4, 5, 6, 7], lembrete: false,
  ordem: 0, criada_em: "2026-10-01T10:00:00Z", alterada_em: "2026-10-01T10:00:00Z", arquivada_em: null, pode_editar: false, criada_por_nome: null,
  arquivada_pelo_aluno: false, ...o,
});
const dados = (o: Partial<RotinasDoAluno> = {}): RotinasDoAluno => ({
  paciente_id: "p1", tem_login: true, pode_criar: true, rotinas: [], feitas: [], historico: [], ...o,
});
const LISTA = dados({
  rotinas: [
    rotina({ id: "creatina", nome: "Creatina", detalhe: "5 g", horario: "08:00" }),
    rotina({ id: "agua", nome: "Água 2 L", origem: "profissional", paciente_id: "p1", horario: "10:00", pode_editar: true, criada_por_nome: "Ana Paula" }),
    rotina({ id: "magnesio", nome: "Magnésio", origem: "profissional", paciente_id: "p9", horario: "21:00", criada_por_nome: "Bruno Lima" }),
  ],
  feitas: [{ rotina_id: "creatina", dia: HOJE, feita_em: new Date().toISOString() }],
});

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ProvedorConfirmar>
          <CardRotinas alunoId="p1" />
        </ProvedorConfirmar>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const achar = (sel: string) => waitFor(() => {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`sem ${sel}`);
  return el as HTMLElement;
});
const estado = () => document.querySelector("[data-card-rotinas]")?.getAttribute("data-card-rotinas");
const campo = (rotulo: string) => screen.getByLabelText(new RegExp(`^${rotulo.replace(/[()]/g, "\\$&")}`)) as HTMLInputElement;

beforeEach(() => {
  for (const f of [h.ler, h.profSalvar, h.profArquivar, h.toast, h.toast.success, h.toast.error]) f.mockReset();
  h.ler.mockResolvedValue(LISTA);
  h.profSalvar.mockImplementation(async (_a: string, id: string | null, d: Record<string, unknown>) => ({ ok: true, rotina: rotina({ id: id ?? "nova", origem: "profissional", ...d }) }));
});
afterEach(() => {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  window.dispatchEvent(new Event("online"));
});

describe("W-A P6 — o card Rotinas do Resumo", () => {
  it("as de hoje: as que faltam pela hora e depois as feitas; o ✓ do aluno (só leitura); o selo de quem criou; lê a janela de 14 dias da rota", async () => {
    montar();
    await achar('[data-card-rotinas="lista"]');
    expect(h.ler).toHaveBeenCalledWith("p1", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), HOJE);
    const ul = document.querySelector("[data-rotinas-hoje]")!;
    expect(ul.getAttribute("data-rotinas-hoje")).toBe("3");
    expect(ul.getAttribute("data-rotinas-hoje-feitas")).toBe("1");
    const ids = [...document.querySelectorAll("[data-rotinas-hoje] [data-rotina-painel]")].map((e) => e.getAttribute("data-rotina-painel"));
    expect(ids).toEqual(["agua", "magnesio", "creatina"]);
    const selos = [...document.querySelectorAll("[data-rotina-painel-selo]")].map((e) => e.textContent);
    expect(selos).toEqual(["de Ana", "de Bruno", "do aluno"]);
    expect(document.querySelector('[data-rotina-painel="creatina"]')!.getAttribute("data-rotina-feita")).toBe("1");
    expect(screen.getByLabelText("feita pelo aluno")).toBeInTheDocument();
    // só a de profissional DESTA matrícula abre a folha; as do aluno e a da outra matrícula, não
    expect(document.querySelector('[data-rotina-painel-abrir="agua"]')).not.toBeNull();
    expect(document.querySelector('[data-rotina-painel-abrir="creatina"]')).toBeNull();
    expect(document.querySelector('[data-rotina-painel-abrir="magnesio"]')).toBeNull();
    expect(document.querySelector("[data-card-rotinas]")!.textContent).toContain("3 VIVAS");
  });

  it("mudar a do profissional desta matrícula: a folha da P3 no modo do profissional; salvar → a função com a rota e o id; relê o card", async () => {
    montar();
    fireEvent.click(await achar('[data-rotina-painel-abrir="agua"]'));
    await achar('[data-folha-rotina="mudar"][data-folha-modo="profissional"]');
    expect(campo("Nome").value).toBe("Água 2 L");
    fireEvent.change(campo("Horário (opcional)"), { target: { value: "11:00" } });
    fireEvent.click(document.querySelector("[data-rotina-salvar]")!);
    await waitFor(() => expect(h.profSalvar).toHaveBeenCalledWith("p1", "agua", expect.objectContaining({ nome: "Água 2 L", horario: "11:00" })));
    await waitFor(() => expect(h.ler).toHaveBeenCalledTimes(2));
    expect(h.toast.success).toHaveBeenCalledWith("Rotina salva.");
  });

  it("nenhuma ainda: o texto e 'Nova rotina' → a folha nova (profissional) → cria na matrícula da rota → 'Rotina criada.' e relê", async () => {
    h.ler.mockResolvedValue(dados());
    montar();
    await achar('[data-card-rotinas="vazio"]');
    expect(document.querySelector("[data-card-rotinas]")!.textContent).toContain("Nenhuma rotina ainda.");
    fireEvent.click(await achar("[data-rotinas-nova]"));
    await achar('[data-folha-rotina="nova"][data-folha-modo="profissional"]');
    fireEvent.change(campo("Nome"), { target: { value: "Água 2 L" } });
    fireEvent.click(screen.getByRole("radio", { name: "Hábito" }));
    fireEvent.click(document.querySelector("[data-rotina-salvar]")!);
    await waitFor(() => expect(h.profSalvar).toHaveBeenCalledWith("p1", null, {
      nome: "Água 2 L", detalhe: null, tipo: "habito", horario: null, dias_semana: [1, 2, 3, 4, 5, 6, 7], lembrete: false,
    }));
    expect(h.toast.success).toHaveBeenCalledWith("Rotina criada.");
    await waitFor(() => expect(h.ler).toHaveBeenCalledTimes(2));
  });

  it("aluno sem login: a frase da spec e o atalho para a aba Acessos; sem 'Nova rotina' nem 'Ver tudo'", async () => {
    h.ler.mockResolvedValue(dados({ tem_login: false, pode_criar: false }));
    montar();
    await achar('[data-card-rotinas="sem-login"]');
    expect(document.querySelector("[data-rotinas-sem-login]")!.textContent).toBe(MENSAGEM_ERRO_ALUNO_DIA.sem_login_do_aluno);
    expect(document.querySelector("[data-rotinas-acessos]")!.getAttribute("href")).toBe("/painel/alunos/p1/acessos");
    expect(document.querySelector("[data-rotinas-nova]")).toBeNull();
    expect(document.querySelector("[data-rotinas-ver-tudo]")).toBeNull();
  });

  it("quem só vê (pode_criar = false): a lista sem 'Nova rotina'; nenhuma rotina abre a folha", async () => {
    h.ler.mockResolvedValue({ ...LISTA, pode_criar: false, rotinas: LISTA.rotinas.map((r) => ({ ...r, pode_editar: false })) });
    montar();
    await achar('[data-card-rotinas="lista"]');
    expect(document.querySelector("[data-card-rotinas]")!.getAttribute("data-rotinas-pode-criar")).toBe("0");
    expect(document.querySelector("[data-rotinas-nova]")).toBeNull();
    expect(document.querySelectorAll("[data-rotina-painel-abrir]")).toHaveLength(0);
  });

  it("o erro da função: a frase do código e 'Tentar de novo' (relê)", async () => {
    // um código que não repete sozinho (o "rede" repetiria 1 vez — o retry da consulta — e a tela iria direto para a lista)
    h.ler.mockRejectedValueOnce(new ErroAlunoDia("sem_internet")).mockResolvedValueOnce(LISTA);
    montar();
    await achar('[data-card-rotinas="erro"]');
    expect(document.querySelector("[data-rotinas-erro]")!.textContent).toBe(MENSAGEM_ERRO_ALUNO_DIA.sem_internet);
    fireEvent.click(document.querySelector("[data-rotinas-tentar]")!);
    await achar('[data-card-rotinas="lista"]');
  });

  it("sem acesso (outro profissional): a frase e nenhum 'Tentar de novo'", async () => {
    h.ler.mockRejectedValue(new ErroAlunoDia("sem_acesso"));
    montar();
    await achar('[data-card-rotinas="erro"]');
    expect(document.querySelector("[data-rotinas-erro]")!.textContent).toBe(MENSAGEM_ERRO_ALUNO_DIA.sem_acesso);
    expect(document.querySelector("[data-rotinas-tentar]")).toBeNull();
  });

  it("'Ver tudo': as vivas, a apagada pelo aluno ('apagada pelo aluno em dd/mm') e o histórico em frases (horário 08:00 → 09:00)", async () => {
    const apagadaEm = "2026-10-12T15:00:00Z";
    const historico: EventoDaRotina[] = [
      { rotina_id: "cha", quem: "aluno", o_que: "arquivou", antes: null, depois: null, em: apagadaEm, por_nome: null },
      { rotina_id: "cha", quem: "profissional", o_que: "mudou", antes: { horario: "08:00" }, depois: { horario: "09:00" }, em: "2026-10-11T12:00:00Z", por_nome: "Ana Paula" },
      { rotina_id: "cha", quem: "profissional", o_que: "criou", antes: null, depois: { nome: "Chá verde" }, em: "2026-10-10T12:00:00Z", por_nome: "Ana Paula" },
    ];
    h.ler.mockResolvedValue({
      ...LISTA,
      rotinas: [...LISTA.rotinas, rotina({ id: "cha", nome: "Chá verde", origem: "profissional", paciente_id: "p1", arquivada_em: apagadaEm, arquivada_pelo_aluno: true })],
      historico,
    });
    montar();
    fireEvent.click(await achar("[data-rotinas-ver-tudo]"));
    await achar("[data-rotinas-tudo]");
    expect(document.querySelector("[data-rotinas-tudo-vivas]")!.getAttribute("data-rotinas-tudo-vivas")).toBe("3");
    const apagada = document.querySelector('[data-rotina-apagada="cha"]')!;
    expect(apagada.getAttribute("data-rotina-apagada-pelo-aluno")).toBe("1");
    expect(apagada.querySelector("[data-rotina-apagada-texto]")!.textContent).toBe(`apagada pelo aluno em ${fmtDiaMes(apagadaEm)}`);
    expect([...document.querySelectorAll("[data-rotina-evento]")].map((e) => e.getAttribute("data-rotina-evento"))).toEqual(["arquivou", "mudou", "criou"]);
    expect(document.querySelector('[data-rotina-evento="mudou"] [data-rotina-evento-mudanca]')!.textContent).toBe("horário 08:00 → 09:00");
    expect(document.querySelector('[data-rotina-evento="arquivou"]')!.textContent).toContain("O aluno apagou Chá verde");
    // da lista do "Ver tudo", a do profissional desta matrícula abre a folha (e o "Ver tudo" fecha)
    fireEvent.click(document.querySelector('[data-rotinas-tudo] [data-rotina-painel-abrir="agua"]')!);
    await achar('[data-folha-rotina="mudar"]');
  });

  it("sem internet: 'Nova rotina' desligada com o aviso; a lista lida antes continua", async () => {
    montar();
    await achar('[data-card-rotinas="lista"]');
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    window.dispatchEvent(new Event("offline"));
    await achar("[data-rotinas-sem-internet]");
    expect((document.querySelector("[data-rotinas-nova]") as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('[data-rotina-painel-abrir="agua"]')).toBeNull();
    expect(estado()).toBe("lista");
  });
});
