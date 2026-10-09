import { describe, expect, it } from "vitest";
import { numerosDaAgenda } from "@/agenda/regras";
import { adesaoDoPeriodo } from "@/nutricao/editor/lib/adesao";
import { resumoSemanaDoAluno } from "@/treino/editor/regras";
import type { DadosEditor } from "@/treino/editor/tipos";
import {
  LIMIAR_SEM_DIETA,
  LIMIAR_SEM_TREINAR,
  adesaoDieta,
  adesaoDoAluno,
  adesaoMedia,
  adesaoTreino,
  aniversariantesDaSemana,
  atencaoDoFinanceiro,
  atividadeRecente,
  avaliacaoVencidaHa,
  avaliacoesVencidas,
  cadastrosPendentes,
  consultasDeHoje,
  dataPorExtenso,
  diasEntre,
  fotosSemReacao,
  itensAniversario,
  LINK_FOTOS_SEM_REACAO,
  juntarAlunos,
  juntarAtencao,
  preConsultasNovas,
  profissionaisDasConsultas,
  recordes,
  semMarcarDieta,
  semTreinar,
  textoAdesao,
  ultimosDiasAte,
  type AlunoDash,
  type AlunoPrincipal,
  type AlunoTreino,
  type DietaResumo,
  type SerieRecorde,
} from "./regras";

// quinta-feira 01/10/2026 (São Paulo)
const HOJE = "2026-10-01";
const DIAS = ultimosDiasAte(HOJE, 7);

function principal(o: Partial<AlunoPrincipal> = {}): AlunoPrincipal {
  return {
    id: "m-rafael", rota_id: "t-rafael", user_id: "u-rafael", treino_user_id: null, nome: "Rafael Moura", apelido: null, foto_url: null, nascimento: null,
    criado_em: "2026-09-01T12:00:00Z", modulos: ["treino", "nutricao"], personal_id: "u-lucas", nutricionista_id: "u-camila", tem_login: true,
    acesso_app: true, ultima_antropometria: null, dieta: null, ...o,
  };
}

const GRUPO_A = "g-a";
const GRUPO_B = "g-b";
function treino(o: Partial<AlunoTreino> = {}): AlunoTreino {
  return {
    id: "t-rafael", principal_user_id: "u-rafael", nome: "Rafael Moura", criado_em: "2026-09-01T12:00:00", proxima_avaliacao: null, ultima_avaliacao: null,
    ultimo_treino: "2026-09-29",
    semana: ["SEG", "TER", "QUA", "QUI", "SEX"].map((d, i) => ({ dia_semana: d, slot_idx: 0, grupo_id: i % 2 ? GRUPO_B : GRUPO_A, grupo_usuario_id: null, extra: false })),
    dias_config: [], grupos_catalogo: [GRUPO_A, GRUPO_B], grupos_pessoais: [], overrides: [],
    concluidos: [{ data_treino: "2026-09-28", slot_idx: 0 }, { data_treino: "2026-09-29", slot_idx: 0 }], ...o,
  };
}

const dash = (p: Partial<AlunoPrincipal> = {}, t: AlunoTreino | null = treino()): AlunoDash => ({ ...principal(p), treino: t });

function dieta(o: Partial<DietaResumo> = {}): DietaResumo {
  return {
    planos: [{
      id: "pl1", favorito: false, created_at: "2026-09-10T12:00:00Z",
      refeicoes: [
        { id: "cafe", nome: "Café da manhã", horario: "07:00:00", ordem: 0, dias_semana: null, itens: 3 },
        { id: "almoco", nome: "Almoço", horario: "12:00:00", ordem: 1, dias_semana: null, itens: 4 },
        { id: "agua", nome: "Água", horario: null, ordem: 2, dias_semana: null, itens: 0 },
      ],
    }],
    concluidas: [{ refeicao_id: "cafe", data: "2026-09-30" }, { refeicao_id: "almoco", data: "2026-09-30" }, { refeicao_id: "cafe", data: "2026-10-01" }],
    ultima_marcacao: "2026-10-01",
    ...o,
  };
}

describe("datas", () => {
  it("o subtítulo da tela 6 e as contas de dias", () => {
    expect(dataPorExtenso("2026-07-16")).toBe("Quinta-feira, 16 de julho de 2026");
    expect(dataPorExtenso("2026-10-01")).toBe("Quinta-feira, 1 de outubro de 2026");
    expect(diasEntre("2026-09-24", HOJE)).toBe(7);
    expect(DIAS).toEqual(["2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"]);
  });
});

describe("juntar a matrícula com o treino", () => {
  it("pelo usuário do Treino guardado na matrícula ou pelo login (vínculo de identidade); sem Treino = null", () => {
    const t = { ok: true as const, hoje: HOJE, de: DIAS[0], todos: true, historico: [], recordes: [],
      alunos: [treino(), treino({ id: "t-joao", principal_user_id: null })] };
    const [porLogin, porId, sem] = juntarAlunos([principal(), principal({ id: "m-joao", user_id: null, treino_user_id: "t-joao" }), principal({ id: "m-x", user_id: "u-x" })], t);
    expect(porLogin.treino?.id).toBe("t-rafael");
    expect(porId.treino?.id).toBe("t-joao");
    expect(sem.treino).toBeNull();
    expect(juntarAlunos([principal()], null)[0].treino).toBeNull();
  });
});

describe("adesão (NF6) — a mesma conta das telas de origem", () => {
  it("treino: dias feitos ÷ dias com treino nos últimos 7 dias (a regra do 'N de M na semana')", () => {
    // 25/09 (sex), 28 (seg), 29 (ter), 30 (qua) e 01/10 (qui) com treino; feitos 28 e 29
    expect(adesaoTreino(treino(), DIAS)).toMatchObject({ feitos: 2, total: 5 });
    // a semana atual (seg 28/09 – dom 04/10) do card Treino do Resumo do aluno: 2 de 5 — a mesma função por baixo
    const d = { semana: treino().semana, gruposDisponiveis: [{ id: GRUPO_A, nome: "A", tipo: "catalogo" }, { id: GRUPO_B, nome: "B", tipo: "catalogo" }], diasConfig: [] } as unknown as DadosEditor;
    expect(resumoSemanaDoAluno(d, { overrides: [], concluidos: treino().concluidos }, new Date(2026, 9, 1, 12))).toEqual({ feitos: 2, total: 5 });
  });
  it("treino: troca do dia vale no lugar da semana; treino que o aluno não tem mais não conta", () => {
    const t = treino({ grupos_catalogo: [GRUPO_A], overrides: [{ data_treino: "2026-09-26", slot_idx: 0, grupo_id: GRUPO_A, grupo_usuario_id: null }] });
    // sem o B: só seg, qua e sex (25, 28, 30) + a troca do sábado 26 → 4 dias; feito só o 28 (o 29 era do B, mas o concluído conta o dia)
    expect(adesaoTreino(t, DIAS)).toMatchObject({ feitos: 2, total: 5 });
  });
  it("dieta: refeições marcadas ÷ marcáveis do plano atual (a do card Dieta do Resumo do aluno); sem refeição com alimento = nada para medir", () => {
    const a = adesaoDieta(dieta(), DIAS)!;
    expect(a).toMatchObject({ feitas: 3, total: 14 });
    // igual à adesaoDoPeriodo direta (CardDieta)
    const plano = dieta().planos[0];
    expect(adesaoDoPeriodo(plano.refeicoes.map((r) => ({ ...r, itens: Array.from({ length: r.itens }) })), dieta().concluidas, DIAS).pct).toBe(a.pct);
    expect(adesaoDieta(dieta({ planos: [{ ...plano, refeicoes: [plano.refeicoes[2]] }] }), DIAS)).toBeNull();
    expect(adesaoDieta(dieta({ planos: [] }), DIAS)).toBeNull();
  });
  it("o plano atual é o favorito mais recente (planoAtivo)", () => {
    const plano = dieta().planos[0];
    const fav = { ...plano, id: "fav", favorito: true, created_at: "2026-08-01T12:00:00Z", refeicoes: [{ ...plano.refeicoes[0], id: "so-cafe" }] };
    expect(adesaoDieta(dieta({ planos: [plano, fav], concluidas: [{ refeicao_id: "so-cafe", data: HOJE }] }), DIAS)).toMatchObject({ feitas: 1, total: 7 });
  });
  it("do aluno: a média dos módulos medidos; a média da conta: entre os alunos com o que medir", () => {
    const rafael = dash({ dieta: dieta() });
    const a = adesaoDoAluno(rafael, DIAS);
    expect(a.treino).toEqual({ feitos: 2, total: 5 });
    expect(a.dieta).toEqual({ feitas: 3, total: 14 });
    expect(a.fracao).toBeCloseTo((2 / 5 + 3 / 14) / 2, 5);
    const soTreino = dash({ id: "m-carlos", modulos: ["treino"] }, treino({ id: "t-carlos", concluidos: [] }));
    const nada = dash({ id: "m-diego", modulos: [] }, null);
    const m = adesaoMedia([rafael, soTreino, nada], DIAS);
    expect(m.alunos).toBe(2);
    expect(m.pct).toBe(Math.round((((2 / 5 + 3 / 14) / 2 + 0) / 2) * 100));
    expect(m.serie).toHaveLength(7);
    expect(m.temTreino && m.temDieta).toBe(true);
    expect(textoAdesao(m)).toBe("treinos feitos e dieta marcada");
    expect(adesaoMedia([nada], DIAS).pct).toBeNull();
    expect(textoAdesao(adesaoMedia([soTreino], DIAS))).toBe("treinos feitos · 7 dias");
  });
  it("a dieta de quem você não vê (dieta = null), de quem não usa o app e o módulo que o aluno não tem não entram", () => {
    const semDieta = adesaoDoAluno(dash({ dieta: null }), DIAS);
    expect(semDieta.dieta).toBeNull();
    // sem login (ninguém marca) ou com o app desligado: a dieta fica fora da média
    expect(adesaoDoAluno(dash({ dieta: dieta(), tem_login: false, user_id: null }), DIAS).dieta).toBeNull();
    expect(adesaoDoAluno(dash({ dieta: dieta(), acesso_app: false }), DIAS).dieta).toBeNull();
    expect(adesaoMedia([dash({ modulos: ["nutricao"], dieta: dieta(), tem_login: false })], DIAS).pct).toBeNull();
    const semModulo = adesaoDoAluno(dash({ modulos: ["nutricao"], dieta: dieta() }), DIAS);
    expect(semModulo.treino).toBeNull();
  });
});

describe("Precisam de atenção — limiares da P28", () => {
  it("7 dias sem treinar (último treino) e quem nunca treinou desde que entrou; 6 dias não", () => {
    expect(LIMIAR_SEM_TREINAR).toBe(7);
    const sete = semTreinar([dash({}, treino({ ultimo_treino: "2026-09-24" }))], HOJE);
    expect(sete).toHaveLength(1);
    expect(sete[0]).toMatchObject({ texto: "Sem treinar há 7 dias", chip: "TREINO", link: "/painel/alunos/t-rafael/treino" });
    expect(semTreinar([dash({}, treino({ ultimo_treino: "2026-09-25" }))], HOJE)).toHaveLength(0);
    expect(semTreinar([dash({}, treino({ ultimo_treino: null, criado_em: "2026-09-22T10:00:00" }))], HOJE)[0].texto).toBe("Nenhum treino desde que entrou (9 dias)");
    // sem semana montada, sem Treino na matrícula ou sem os dados do Treino: nada
    expect(semTreinar([dash({}, treino({ ultimo_treino: "2026-09-01", semana: [] }))], HOJE)).toHaveLength(0);
    expect(semTreinar([dash({ modulos: ["nutricao"] }, treino({ ultimo_treino: "2026-09-01" }))], HOJE)).toHaveLength(0);
    expect(semTreinar([dash({}, null)], HOJE)).toHaveLength(0);
  });
  it("avaliação vencida pela data marcada; sem data, 60 dias da última (Treino ou antropometria)", () => {
    expect(avaliacaoVencidaHa(dash({}, treino({ proxima_avaliacao: "2026-09-19" })), HOJE)).toBe(12);
    expect(avaliacaoVencidaHa(dash({}, treino({ proxima_avaliacao: HOJE })), HOJE)).toBeNull();
    expect(avaliacaoVencidaHa(dash({}, treino({ proxima_avaliacao: "2026-11-01", ultima_avaliacao: "2026-01-01" })), HOJE)).toBeNull();
    // 20/07 + 60 = 18/09 → vencida há 13 dias; a antropometria mais nova vale
    expect(avaliacaoVencidaHa(dash({}, treino({ ultima_avaliacao: "2026-07-20" })), HOJE)).toBe(13);
    expect(avaliacaoVencidaHa(dash({ ultima_antropometria: "2026-08-20" }, treino({ ultima_avaliacao: "2026-07-20" })), HOJE)).toBeNull();
    expect(avaliacaoVencidaHa(dash({ ultima_antropometria: "2026-07-01" }, null), HOJE)).toBe(32);
    // nunca avaliado: não é "vencida"
    expect(avaliacaoVencidaHa(dash({}, treino()), HOJE)).toBeNull();
    // sem o resumo do Treino (a nutricionista): o aluno com Treino fica de fora (a data marcada mora lá); o só de Nutrição continua
    expect(avaliacaoVencidaHa(dash({ ultima_antropometria: "2026-06-13" }, null), HOJE, false)).toBeNull();
    expect(avaliacaoVencidaHa(dash({ modulos: ["nutricao"], ultima_antropometria: "2026-06-13" }, null), HOJE, false)).toBe(50);
    expect(avaliacoesVencidas([dash({}, treino({ proxima_avaliacao: "2026-09-19" }))], HOJE)[0]).toMatchObject({
      texto: "Avaliação vencida há 12 dias", chip: "AVALIAÇÃO", tom: "t", link: "/painel/alunos/t-rafael/avaliacao",
    });
  });
  it("3 dias sem marcar a dieta: do último ✓ ou, sem ✓, do início do plano atual; só quem usa o app", () => {
    expect(LIMIAR_SEM_DIETA).toBe(3);
    const tres = semMarcarDieta([dash({ dieta: dieta({ ultima_marcacao: "2026-09-28" }) })], HOJE);
    expect(tres[0]).toMatchObject({ texto: "Sem marcar a dieta há 3 dias", chip: "DIETA", tom: "n", link: "/painel/alunos/t-rafael/dieta" });
    expect(semMarcarDieta([dash({ dieta: dieta({ ultima_marcacao: "2026-09-29" }) })], HOJE)).toHaveLength(0);
    // nunca marcou: conta do plano (10/09) → 21 dias; plano novo (ontem) → ainda não
    expect(semMarcarDieta([dash({ dieta: dieta({ ultima_marcacao: null }) })], HOJE)[0].texto).toBe("Sem marcar a dieta há 21 dias");
    const novo = dieta({ ultima_marcacao: "2026-08-01", planos: [{ ...dieta().planos[0], created_at: "2026-09-30T15:00:00Z" }] });
    expect(semMarcarDieta([dash({ dieta: novo })], HOJE)).toHaveLength(0);
    // sem login, app desligado, sem a dieta (não é a nutri) ou sem refeição com alimento: nada
    const velho = dieta({ ultima_marcacao: "2026-09-01" });
    expect(semMarcarDieta([dash({ dieta: velho, tem_login: false })], HOJE)).toHaveLength(0);
    expect(semMarcarDieta([dash({ dieta: velho, acesso_app: false })], HOJE)).toHaveLength(0);
    expect(semMarcarDieta([dash({ dieta: null })], HOJE)).toHaveLength(0);
    expect(semMarcarDieta([dash({ dieta: { ...velho, planos: [{ ...velho.planos[0], refeicoes: [velho.planos[0].refeicoes[2]] }] } })], HOJE)).toHaveLength(0);
  });
  it("cadastros pendentes e respostas novas: 1 item com o número e a tela que mostra o mesmo número", () => {
    expect(cadastrosPendentes(0)).toEqual([]);
    expect(cadastrosPendentes(2)[0]).toMatchObject({ nome: "2 cadastros pendentes", link: "/painel/alunos?pendentes=1" });
    expect(preConsultasNovas(1)[0]).toMatchObject({ nome: "1 resposta nova", link: "/painel/pre-consulta?aba=respostas" });
  });
  it("aniversariantes de segunda a domingo desta semana (29/02 no ano comum cai no 28/02)", () => {
    const lista = [
      principal({ id: "a", nome: "Bia", nascimento: "1998-10-03" }),
      principal({ id: "b", nome: "Caio", nascimento: "2000-10-01" }),
      principal({ id: "c", nome: "Duda", nascimento: "1990-10-05" }),
      principal({ id: "d", nome: "Edu", nascimento: null }),
    ];
    expect(aniversariantesDaSemana(lista, HOJE)).toEqual([
      { id: "b", nome: "Caio", dia: "2026-10-01", idade: 26, ehHoje: true },
      { id: "a", nome: "Bia", dia: "2026-10-03", idade: 28, ehHoje: false },
    ]);
    expect(aniversariantesDaSemana([principal({ id: "x", nome: "Fê", nascimento: "2000-02-29" })], "2026-02-26")[0]).toMatchObject({ dia: "2026-02-28" });
    const itens = itensAniversario(lista.map((p) => ({ ...p, treino: null })), HOJE);
    expect(itens.map((i) => i.texto)).toEqual(["Aniversário hoje · 26 anos", "Aniversário sáb, 03/10 · 28 anos"]);
    expect(itens[0].link).toBe("/painel/alunos/t-rafael");
  });
  it("ordem da tela 6: Pix, vencida, treino (o mais grave primeiro), avaliação, dieta, cadastro, pré-consulta, aniversário", () => {
    const fin = atencaoDoFinanceiro([
      { chave: "pix:1", paciente_id: "m-joao", nome: "João Pedro", texto: "Pix aguardando sua confirmação", chip: "PIX", ordem: "0:x" },
      { chave: "m:2", paciente_id: "m-x", nome: "Ana", texto: "Mensalidade vencida desde 10/09", chip: "VENCIDA", ordem: "1:y" },
    ], []);
    expect(fin[0]).toMatchObject({ tipo: "pix", chip: "PIX", tom: "a", link: "/painel/financeiro?aba=mensalidades&ver=comprovantes" });
    expect(fin[1]).toMatchObject({ tipo: "cobranca", chip: "VENCIDA", link: "/painel/financeiro?aba=mensalidades" });
    const treinos = semTreinar([dash({ id: "m1", nome: "Carlos" }, treino({ ultimo_treino: "2026-09-20" })), dash({ id: "m2", nome: "Ana" }, treino({ ultimo_treino: "2026-09-10" }))], HOJE);
    const todos = juntarAtencao(preConsultasNovas(1), treinos, cadastrosPendentes(1), fin,
      semMarcarDieta([dash({ dieta: dieta({ ultima_marcacao: "2026-09-20" }) })], HOJE), avaliacoesVencidas([dash({}, treino({ proxima_avaliacao: "2026-09-19" }))], HOJE));
    expect(todos.map((i) => i.chip)).toEqual(["PIX", "VENCIDA", "TREINO", "TREINO", "AVALIAÇÃO", "DIETA", "CADASTRO", "PRÉ-CONSULTA"]);
    expect(todos[2].nome).toBe("Ana"); // 21 dias antes de 11
  });
});

describe("Atividade recente", () => {
  const rec = (o: Partial<SerieRecorde>): SerieRecorde => ({
    user_id: "t-rafael", exercicio: "Supino reto com barra", exercicio_id: "ex1", exercicio_usuario_id: null, data_treino: "2026-09-30", peso: 70, anterior: 65,
    quando: "2026-09-30T21:00:00Z", ...o,
  });
  it("recorde = passou a maior carga de antes (precisa ter feito antes); 1 por exercício, o mais recente", () => {
    expect(recordes([rec({ anterior: null })])).toHaveLength(0);
    expect(recordes([rec({ peso: 65 })])).toHaveLength(0);
    const r = recordes([rec({ data_treino: "2026-09-28", peso: 67.5 }), rec({}), rec({ exercicio_id: "ex2", exercicio: "Agachamento" })]);
    expect(r.map((x) => `${x.exercicio_id}:${x.data_treino}`).sort()).toEqual(["ex1:2026-09-30", "ex2:2026-09-30"]);
  });
  it("junta as 5 fontes, mais recente primeiro, com a tela de origem de cada uma", () => {
    const rafael = dash({ apelido: null }, treino());
    const marina = dash({ id: "m-marina", rota_id: "m-marina", nome: "Marina Alves", user_id: "u-marina" }, null);
    const itens = atividadeRecente({
      alunos: [rafael, marina],
      historico: [{ user_id: "t-rafael", nome_treino: "Treino A", concluido_em: "2026-10-01T14:58:00Z" }, { user_id: "t-outro", nome_treino: "X", concluido_em: "2026-10-01T15:00:00Z" }],
      recordes: [rec({ quando: "2026-10-01T14:35:00Z", peso: "70.00" })],
      comprovantes: [{ id: "c1", paciente_id: "m-joao", nome: "João Pedro", enviado_em: "2026-10-01T14:00:00Z" }],
      preConsultas: [{ id: "r1", nome: "Beatriz Lima", respondido_em: "2026-10-01T13:00:00Z", paciente_id: null }],
      fotos: [{ id: "f1", paciente_id: "m-marina", refeicao: "almoco", data_hora: "2026-10-01T12:00:00Z" }, { id: "f2", paciente_id: "m-marina", refeicao: "ceia", data_hora: "2026-09-30T23:00:00Z" }],
    });
    expect(itens.map((i) => `${i.quem} ${i.texto}`)).toEqual([
      "Rafael concluiu o Treino A",
      "Rafael bateu recorde no Supino reto com barra (70 kg)",
      "João enviou o comprovante do Pix",
      "Beatriz respondeu a pré-consulta",
      "Marina mandou foto do almoço",
    ]);
    expect(itens.map((i) => i.link)).toEqual([
      "/painel/alunos/t-rafael/treino", "/painel/alunos/t-rafael/treino", "/painel/financeiro?aba=mensalidades&ver=comprovantes",
      "/painel/pre-consulta?aba=respostas", "/painel/dietas?aba=diario&dias=7&aluno=m-marina",
    ]);
    const ceia = atividadeRecente({ alunos: [marina], historico: [], recordes: [], comprovantes: [], preConsultas: [],
      fotos: [{ id: "f2", paciente_id: "m-marina", refeicao: "ceia", data_hora: "2026-09-30T23:00:00Z" }] });
    expect(ceia[0].texto).toBe("mandou foto da ceia");
  });
});

describe("Agenda de hoje = o número do 'Consultas hoje' da Agenda", () => {
  it("a lista do dia tem o mesmo tamanho do numerosDaAgenda().hoje (desmarcadas e dia inteiro fora), por hora", () => {
    const ev = (id: string, iso: string, status = "agendado", diaInteiro = false) => ({ id, inicio: new Date(iso), fim: new Date(new Date(iso).getTime() + 3600_000), status, diaInteiro, modulo: "treino" });
    const evs = [
      ev("b", "2026-10-01T12:30:00Z"), ev("a", "2026-10-01T10:00:00Z", "confirmado"), ev("x", "2026-10-01T15:00:00Z", "desmarcado"),
      ev("y", "2026-10-01T16:00:00Z", "paciente_desmarcou"), ev("z", "2026-10-01T03:00:00Z", "agendado", true), ev("w", "2026-10-02T02:30:00Z"), ev("v", "2026-10-02T03:30:00Z"), ev("f", "2026-10-01T21:00:00Z", "nao_compareceu"),
    ];
    const lista = consultasDeHoje(evs, HOJE);
    // 02:30 UTC de 02/10 = 23:30 de 01/10 em São Paulo (entra); 03:30 UTC = 00:30 de 02/10 (fica para amanhã)
    expect(lista.map((e) => e.id)).toEqual(["a", "b", "f", "w"]);
    const n = numerosDaAgenda(evs.map((e) => ({ id: e.id, inicio: e.inicio.toISOString(), fim: e.fim.toISOString(), status: e.status, modulo: e.modulo, dia_inteiro: e.diaInteiro })), HOJE, new Date("2026-10-01T15:00:00Z"));
    expect(n.hoje).toBe(lista.length);
  });
  it("H1: as tags lidas são só as dos profissionais das consultas (sem repetir, em ordem; o master lê todas pela RLS)", () => {
    expect(profissionaisDasConsultas([{ nutricionista_id: "u2" }, { nutricionista_id: "u1" }, { nutricionista_id: "u2" }, { nutricionista_id: null }, {}]))
      .toEqual(["u1", "u2"]);
    expect(profissionaisDasConsultas([])).toEqual([]);
  });
});

// o "Recibos no mês" (H4) é contado no banco desde a hml-14b (financeiro_recibos — useDashboard), não mais aqui
describe("H4 — o que o Nutri mostrava no Dashboard e o Physiq não: fotos aguardando reação", () => {
  it("fotos do diário sem reação: 1 item com o número e o link do Diário que mostra o MESMO número (7 dias, só não reagidas)", () => {
    expect(fotosSemReacao(0)).toEqual([]);
    const [i] = fotosSemReacao(3);
    expect(i).toMatchObject({ tipo: "diario", nome: "3 fotos do diário", chip: "DIÁRIO", link: LINK_FOTOS_SEM_REACAO });
    expect(LINK_FOTOS_SEM_REACAO).toBe("/painel/dietas?aba=diario&dias=7&nao_reagidas=1");
    expect(fotosSemReacao(1)[0].nome).toBe("1 foto do diário");
  });
  it("o item do diário entra depois dos de dieta e antes do cadastro pendente (a ordem da tela 6)", () => {
    const dieta = semMarcarDieta([], HOJE);
    const lista = juntarAtencao(cadastrosPendentes(2), fotosSemReacao(4), dieta, preConsultasNovas(1));
    expect(lista.map((x) => x.tipo)).toEqual(["diario", "cadastro", "preconsulta"]);
  });
});
