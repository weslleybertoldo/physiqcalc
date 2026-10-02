import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hojeSP } from "@/financeiro/regras";
import { somarDias } from "@/agenda/regras";

const HOJE = hojeSP();
const ONTEM = somarDias(HOJE, -1);
const DEZ_DIAS = somarDias(HOJE, -10);
/** meio-dia de hoje em São Paulo (15:00 UTC) + n horas */
const hojeAs = (h: number) => new Date(Date.parse(`${HOJE}T${String(h).padStart(2, "0")}:00:00-03:00`)).toISOString();

const h = vi.hoisted(() => ({
  conta: { id: "c1", nome: "Consultoria Ferreira", papeis: ["dono", "personal", "nutricionista"], modulos: ["treino", "nutricao"] } as { id: string; nome: string; papeis: string[]; modulos: string[] },
  treino: "ok" as string,
  principal: vi.fn(), treinoResumo: vi.fn(), respostas: vi.fn(), alunos: vi.fn(), novos: vi.fn(), rpc: vi.fn(), trans: vi.fn(), cobs: vi.fn(), resumoFin: vi.fn(),
  agenda: vi.fn(), alunosAgenda: vi.fn(), tags: vi.fn(), diario: vi.fn(), urls: vi.fn(), novas: vi.fn(),
}));
vi.mock("@/nucleo/conta", () => ({ useConta: () => ({ conta: h.conta, ehMaster: false, ehDono: h.conta.papeis.includes("dono") }) }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: { id: "u-lucas", email: "lucas@x.com", user_metadata: {} }, situacao: { nome: "Lucas Ferreira" } }) }));
vi.mock("@/ui/casca/topo", () => ({
  TopoPagina: ({ titulo, subtitulo, acoes }: { titulo?: ReactNode; subtitulo?: ReactNode; acoes?: ReactNode }) => (
    <header><h1>{titulo}</h1><p data-testid="subtitulo">{subtitulo}</p>{acoes}</header>
  ),
}));
vi.mock("@/ui/casca/treinoDaPagina", () => ({ useTreinoDaPagina: () => ({ tipo: h.treino }), MENSAGEM_TREINO_PAINEL: { rede: "Sem rede." } }));
vi.mock("@/integrations/principal/client", () => ({ PRINCIPAL_SCHEMA: "staging", principal: { rpc: h.rpc, from: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "staging", supabase: { functions: { invoke: vi.fn() }, from: vi.fn() } }));
vi.mock("@/painel/dashboard/dados", async (orig) => ({
  ...(await orig<typeof import("@/painel/dashboard/dados")>()),
  buscarResumoPrincipal: h.principal, buscarResumoTreino: h.treinoResumo, listarRespostasRecentes: h.respostas,
}));
vi.mock("@/painel/alunos/api", async (orig) => ({ ...(await orig<typeof import("@/painel/alunos/api")>()), listarAlunos: h.alunos }));
vi.mock("@/painel/financeiro/dados", async (orig) => ({ ...(await orig<typeof import("@/painel/financeiro/dados")>()), listarTransacoes: h.trans, listarCobrancasDoResumo: h.cobs }));
vi.mock("@/financeiro/api", async (orig) => ({ ...(await orig<typeof import("@/financeiro/api")>()), buscarResumoDaConta: h.resumoFin }));
vi.mock("@/painel/agenda/dados", async (orig) => ({
  ...(await orig<typeof import("@/painel/agenda/dados")>()), listarAgendamentos: h.agenda, listarAlunosDaAgenda: h.alunosAgenda, listarTags: h.tags,
}));
vi.mock("@/painel/dietas/diario", async (orig) => ({ ...(await orig<typeof import("@/painel/dietas/diario")>()), listarDiarioDaConta: h.diario, urlsAssinadas: h.urls }));
vi.mock("@/painel/preconsulta/novas", async (orig) => ({ ...(await orig<typeof import("@/painel/preconsulta/novas")>()), contarRespostasNovas: h.novas }));

import Dashboard from "./Dashboard";

const aluno = (o: Record<string, unknown>) => ({
  id: "m-rafael", rota_id: "t-rafael", user_id: "u-rafael", treino_user_id: "t-rafael", nome: "Rafael Moura", apelido: null, foto_url: null, nascimento: null,
  criado_em: "2026-09-01T12:00:00Z", modulos: ["treino", "nutricao"], personal_id: "u-lucas", nutricionista_id: "u-lucas", tem_login: true, acesso_app: true,
  ultima_antropometria: null, dieta: null, ...o,
});
const PRINCIPAL = {
  ok: true, hoje: HOJE,
  alunos: [
    aluno({ dieta: { planos: [{ id: "pl", favorito: true, created_at: "2026-09-01T12:00:00Z", refeicoes: [{ id: "r1", nome: "Almoço", horario: "12:00:00", ordem: 0, dias_semana: null, itens: 2 }] }],
      concluidas: [{ refeicao_id: "r1", data: HOJE }], ultima_marcacao: HOJE } }),
    aluno({ id: "m-carlos", rota_id: "t-carlos", user_id: "u-carlos", treino_user_id: "t-carlos", nome: "Carlos Souza", modulos: ["treino"], nutricionista_id: null }),
    aluno({ id: "m-beatriz", rota_id: "m-beatriz", user_id: "u-bia", treino_user_id: null, nome: "Beatriz Lima", modulos: ["nutricao"], personal_id: null,
      dieta: { planos: [{ id: "pl2", favorito: false, created_at: "2026-09-01T12:00:00Z", refeicoes: [{ id: "r2", nome: "Café", horario: "07:00:00", ordem: 0, dias_semana: null, itens: 1 }] }],
        concluidas: [], ultima_marcacao: DEZ_DIAS } }),
  ],
  conta: { id: "c1", nome: "Consultoria Ferreira", modulos: ["treino", "nutricao"] },
  eu: { id: "u-lucas", dono: true, personal: true, nutricionista: true, master: false },
};
const semana = ["SEG", "TER", "QUA", "QUI", "SEX", "SAB", "DOM"].map((d) => ({ dia_semana: d, slot_idx: 0, grupo_id: "g1", grupo_usuario_id: null, extra: false }));
const TREINO = {
  ok: true, hoje: HOJE, de: somarDias(HOJE, -6), todos: true,
  alunos: [
    { id: "t-rafael", principal_user_id: "u-rafael", nome: "Rafael Moura", criado_em: "2026-09-01T12:00:00", proxima_avaliacao: somarDias(HOJE, -12), ultima_avaliacao: null,
      ultimo_treino: HOJE, semana, dias_config: [], grupos_catalogo: ["g1"], grupos_pessoais: [], overrides: [], concluidos: [{ data_treino: HOJE, slot_idx: 0 }] },
    { id: "t-carlos", principal_user_id: "u-carlos", nome: "Carlos Souza", criado_em: "2026-09-01T12:00:00", proxima_avaliacao: null, ultima_avaliacao: null,
      ultimo_treino: DEZ_DIAS, semana, dias_config: [], grupos_catalogo: ["g1"], grupos_pessoais: [], overrides: [], concluidos: [] },
  ],
  historico: [{ user_id: "t-rafael", nome_treino: "Treino A", concluido_em: new Date(Date.now() - 2 * 60_000).toISOString() }],
  recordes: [{ user_id: "t-carlos", exercicio: "Supino", exercicio_id: "e1", exercicio_usuario_id: null, data_treino: DEZ_DIAS, peso: 70, anterior: 65, quando: new Date(Date.now() - 25 * 60_000).toISOString() }],
};
const AGENDA = [
  { id: "ag1", nutricionista_id: "u-lucas", calendario_id: "cal", paciente_id: "m-rafael", titulo: "Avaliação física", inicio: hojeAs(7), fim: hojeAs(8), dia_inteiro: false, status: "confirmado", confirmacao: "confirmado", modulo: "treino", tag_id: "tg-aval" },
  { id: "ag2", nutricionista_id: "u-lucas", calendario_id: "cal", paciente_id: "m-beatriz", titulo: "Retorno", inicio: hojeAs(9), fim: hojeAs(10), dia_inteiro: false, status: "agendado", confirmacao: "a_confirmar", modulo: "nutricao" },
  { id: "ag3", nutricionista_id: "u-lucas", calendario_id: "cal", paciente_id: "m-carlos", titulo: "Cancelada", inicio: hojeAs(11), fim: hojeAs(12), dia_inteiro: false, status: "desmarcado", confirmacao: "desmarcado", modulo: "treino" },
];

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/painel"]}>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.conta = { id: "c1", nome: "Consultoria Ferreira", papeis: ["dono", "personal", "nutricionista"], modulos: ["treino", "nutricao"] };
  h.treino = "ok";
  h.principal.mockReset().mockResolvedValue(PRINCIPAL);
  h.treinoResumo.mockReset().mockResolvedValue(TREINO);
  h.respostas.mockReset().mockResolvedValue([{ id: "r1", nome: "Beatriz Lima", respondido_em: new Date(Date.now() - 2 * 3600_000).toISOString(), paciente_id: null }]);
  h.alunos.mockReset().mockResolvedValue({ total: 3, pendentes: 1, itens: [] });
  // o card da página Alunos e o KPI usam a MESMA função do banco (alunos_novos_por_mes)
  h.novos.mockReset().mockResolvedValue({ ok: true, mes_atual: HOJE.slice(0, 7), meses: [{ mes: "2026-09", novos: 1 }, { mes: HOJE.slice(0, 7), novos: 2 }] });
  h.rpc.mockReset().mockImplementation(async (nome: string) => (nome === "alunos_novos_por_mes" ? { data: await h.novos(), error: null } : { data: null, error: null }));
  h.trans.mockReset().mockResolvedValue([{ id: "t1", tipo: "entrada", valor: 300, data: HOJE, estornada: false, descricao: "Consulta", metodo: "pix", paciente: null }]);
  h.cobs.mockReset().mockResolvedValue([]);
  h.resumoFin.mockReset().mockResolvedValue({
    ok: true, hoje: HOJE, agora: new Date().toISOString(), dono: true, alunos: [],
    pendentes: [{ id: "cb1", paciente_id: "m-carlos", enviado_em: new Date(Date.now() - 3600_000).toISOString(), created_at: new Date().toISOString(), aluno: { paciente_id: "m-carlos", treino_user_id: null, nome: "Carlos Souza", email: null } }],
  });
  h.agenda.mockReset().mockResolvedValue(AGENDA);
  h.alunosAgenda.mockReset().mockResolvedValue([{ id: "m-rafael", nome: "Rafael Moura", apelido: null, foto_url: null }, { id: "m-beatriz", nome: "Beatriz Lima", apelido: null, foto_url: null }]);
  // H1: as tags do profissional das consultas (a "Avaliação" é dele; a consulta da Beatriz não tem tag carregada → a base da área)
  h.tags.mockReset().mockResolvedValue([{ id: "tg-aval", profissional_id: "u-lucas", nome: "Avaliação", cor: "#fb923c", area: "treino", base: false, ordem: 4 }]);
  h.diario.mockReset().mockResolvedValue([
    { id: "d1", paciente_id: "m-beatriz", refeicao: "almoco", data_hora: new Date(Date.now() - 3 * 3600_000).toISOString(), path: "n/p/1.jpg", reacao_nutri: "otimo", comentario: "", comentario_nutri: "", reagido_em: null,
      paciente: { id: "m-beatriz", nome: "Beatriz Lima", apelido: null, link_codigo: "abc", foto_url: null, conta_id: "c1", nutricionista_id: "u-lucas" } },
  ]);
  h.urls.mockReset().mockResolvedValue({ d1: "https://x.invalid/1.jpg" });
  h.novas.mockReset().mockResolvedValue(2);
});

const valor = (sel: string, attr: string) => document.querySelector(sel)?.getAttribute(attr);

describe("W25 — Painel › Dashboard (tela 6)", () => {
  it("os 4 números saem das telas de origem: alunos ativos (+novos), receita do mês, consultas hoje (sem a desmarcada) e a adesão", async () => {
    montar();
    expect(await screen.findByText(/Lucas/)).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('[data-kpi-bloco="alunos"]')?.textContent).toContain("3"));
    await waitFor(() => expect(valor("[data-kpi-novos]", "data-kpi-novos")).toBe("2"));
    await waitFor(() => expect(valor("[data-kpi-receita]", "data-kpi-receita")).toBe("300.00"));
    await waitFor(() => expect(valor("[data-kpi-consultas]", "data-kpi-consultas")).toBe("2"));
    expect(document.querySelector("[data-hoje-por-tipo]")?.textContent).toBe("1 de treino · 1 de nutrição");
    await waitFor(() => expect(valor('[data-kpi-bloco="adesao"]', "data-adesao")).not.toBe(""));
    expect(valor('[data-kpi-bloco="alunos"]', "data-kpi-link")).toBe("/painel/alunos");
    expect(valor('[data-kpi-bloco="receita"]', "data-kpi-link")).toBe("/painel/financeiro");
    expect(valor('[data-kpi-bloco="consultas"]', "data-kpi-link")).toBe("/painel/agenda");
  });

  it("agenda de hoje = a lista do 'Consultas hoje' (com hora, aluno e a tag); precisam de atenção pela P28, com a tela de origem", async () => {
    montar();
    await waitFor(() => expect(document.querySelectorAll("[data-agenda-hoje-evento]")).toHaveLength(2));
    expect(screen.getByText("Rafael Moura", { selector: "[data-agenda-hoje-evento] b" })).toBeInTheDocument();
    // H1: a pílula da TAG (a "Avaliação" dele, na cor dela; sem tag, a base da área) — não mais o chip TREINO/NUTRI
    const pilula = (id: string) => document.querySelector(`[data-agenda-hoje-evento="${id}"] [data-tag-pilula]`);
    expect(pilula("ag1")?.getAttribute("data-tag-nome")).toBe("Avaliação");
    expect((pilula("ag1") as HTMLElement | null)?.style.background).toContain("251, 146, 60");
    expect(pilula("ag2")?.getAttribute("data-tag-nome")).toBe("Nutrição");
    expect(document.querySelector("[data-cartao-agenda-hoje-dashboard] [data-chip]")).toBeNull();
    // só as tags dos profissionais das consultas (o master lê todas pela RLS) e sem gravar nada
    expect(h.tags).toHaveBeenCalledWith(["u-lucas"]);
    await waitFor(() => expect(document.querySelector('[data-atencao-item="pix"]')).not.toBeNull());
    await waitFor(() => expect(document.querySelector('[data-atencao-item="treino"]')).not.toBeNull());
    const tipos = () => [...document.querySelectorAll("[data-atencao-item]")].map((e) => e.getAttribute("data-atencao-item"));
    // 6 itens: o card mostra 4 (como a tela 6) e o "Ver todas (6)" abre o resto
    await waitFor(() => expect(document.querySelector("[data-atencao-contador]")?.textContent).toBe("6"));
    expect(tipos()).toEqual(["pix", "treino", "avaliacao", "dieta"]);
    fireEvent.click(document.querySelector("[data-atencao-ver-todas]")!);
    expect(tipos()).toEqual(["pix", "treino", "avaliacao", "dieta", "cadastro", "preconsulta"]);
    expect(document.querySelector('[data-atencao-item="treino"]')?.textContent).toContain("Sem treinar há 10 dias");
    expect(document.querySelector('[data-atencao-item="avaliacao"]')?.textContent).toContain("Avaliação vencida há 12 dias");
    expect(document.querySelector('[data-atencao-item="dieta"]')?.textContent).toContain("Sem marcar a dieta há 10 dias");
    expect(valor('[data-atencao-item="cadastro"]', "data-atencao-link")).toBe("/painel/alunos?pendentes=1");
    expect(valor('[data-atencao-item="preconsulta"]', "data-atencao-link")).toBe("/painel/pre-consulta?aba=respostas");
  });

  it("H1: as tags não carregaram → a 'Agenda de hoje' aparece assim mesmo, com a base da área de cada consulta", async () => {
    h.tags.mockRejectedValue(new Error("rede"));
    montar();
    await waitFor(() => expect(document.querySelectorAll("[data-agenda-hoje-evento]")).toHaveLength(2), { timeout: 5000 });
    const nomes = [...document.querySelectorAll("[data-agenda-hoje-evento] [data-tag-pilula]")].map((e) => e.getAttribute("data-tag-nome"));
    expect(nomes).toEqual(["Treino", "Nutrição"]);
  });

  it("diário de hoje (a nutricionista da conta) com a reação e a atividade recente com as 5 fontes", async () => {
    montar();
    await waitFor(() => expect(document.querySelectorAll("[data-diario-foto]")).toHaveLength(1));
    expect(document.querySelector("[data-diario-reacao]")?.textContent).toBe("Ótimo");
    await waitFor(() => expect(document.querySelectorAll("[data-atividade-item]").length).toBe(5));
    const tipos = [...document.querySelectorAll("[data-atividade-item]")].map((e) => e.getAttribute("data-atividade-item"));
    expect(tipos).toEqual(["treino", "recorde", "comprovante", "preconsulta", "foto"]);
    expect(document.querySelector('[data-atividade-item="recorde"]')?.textContent).toContain("Carlos bateu recorde no Supino (70 kg)");
  });

  it("o personal sem papel de nutricionista não vê o Diário de hoje nem os itens de dieta (regra clínica)", async () => {
    h.conta = { id: "c1", nome: "Consultoria Ferreira", papeis: ["personal"], modulos: ["treino", "nutricao"] };
    h.principal.mockResolvedValue({ ...PRINCIPAL, alunos: PRINCIPAL.alunos.map((a) => ({ ...a, dieta: null })), eu: { ...PRINCIPAL.eu, dono: false, nutricionista: false } });
    montar();
    await waitFor(() => expect(document.querySelector('[data-atencao-item="treino"]')).not.toBeNull());
    expect(document.querySelector("[data-cartao-diario-hoje]")).toBeNull();
    expect(document.querySelector('[data-atencao-item="dieta"]')).toBeNull();
    expect(h.diario).not.toHaveBeenCalled();
  });

  it("conta só de Nutrição: sem o resumo do Treino (nem chama a função); a nutricionista sem a sessão do Treino também não", async () => {
    h.conta = { id: "c1", nome: "Clínica Sabor", papeis: ["dono", "nutricionista"], modulos: ["nutricao"] };
    montar();
    await waitFor(() => expect(document.querySelector("[data-cartao-diario-hoje]")).not.toBeNull());
    expect(h.treinoResumo).not.toHaveBeenCalled();
    expect(document.querySelector('[data-pagina-dashboard]')?.getAttribute("data-treino")).toBe("fora");
  });

  it("tudo vazio: cada bloco com o texto do estado vazio, nada inventado", async () => {
    h.principal.mockResolvedValue({ ...PRINCIPAL, alunos: [] });
    h.treinoResumo.mockResolvedValue({ ...TREINO, alunos: [], historico: [], recordes: [] });
    h.respostas.mockResolvedValue([]);
    h.alunos.mockResolvedValue({ total: 0, pendentes: 0, itens: [] });
    h.novos.mockResolvedValue({ ok: true, mes_atual: HOJE.slice(0, 7), meses: [{ mes: HOJE.slice(0, 7), novos: 0 }] });
    h.trans.mockResolvedValue([]);
    h.resumoFin.mockResolvedValue({ ok: true, hoje: HOJE, agora: new Date().toISOString(), dono: true, alunos: [], pendentes: [] });
    h.agenda.mockResolvedValue([]);
    h.diario.mockResolvedValue([]);
    h.novas.mockResolvedValue(0);
    montar();
    await waitFor(() => expect(document.querySelector('[data-bloco-vazio="agenda"]')).not.toBeNull());
    await waitFor(() => expect(document.querySelector('[data-bloco-vazio="atencao"]')).not.toBeNull());
    await waitFor(() => expect(document.querySelector('[data-bloco-vazio="diario"]')).not.toBeNull());
    await waitFor(() => expect(document.querySelector('[data-bloco-vazio="atividade"]')).not.toBeNull());
    expect(document.querySelector('[data-bloco-vazio="atencao"]')?.textContent).toMatch(/^Tudo em dia/);
    await waitFor(() => expect(valor("[data-kpi-novos]", "data-kpi-novos")).toBe("0"));
    expect(valor('[data-kpi-bloco="adesao"]', "data-adesao")).toBe("");
    expect(screen.getByText("Nenhuma entrada no período")).toBeInTheDocument();
  });
});

describe("W25 — o /painel abre o Dashboard (registro por convenção)", () => {
  it("a página Dashboard está registrada: o item do menu deixa de cair em Alunos", async () => {
    const { existe } = await import("@/rotas/registro");
    expect(existe("paginasPainel", "Dashboard")).toBe(true);
  });
});
