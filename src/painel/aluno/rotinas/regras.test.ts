// Physiq W-A P6 — as regras PURAS das rotinas no painel (src/painel/aluno/rotinas/regras.ts): a janela de 14 dias de SP, as de hoje com o ✓ do
// aluno (sem as apagadas), as que valiam num dia passado (criadas até o dia; apagadas depois aparecem com o selo), o selo de quem criou, o texto
// da apagada (pelo aluno / por quem / sem quem), o histórico em frases (campo a campo, na ordem da folha) e o estado do card.
import { describe, expect, it } from "vitest";
import { MENSAGEM_ERRO_ALUNO_DIA } from "@/aluno-dia/api";
import type { EventoDaRotina, RotinaDoProfissional, RotinasDoAluno } from "@/aluno-dia/tipos";
import {
  JANELA_DIAS, TEXTOS, apagadasDoAluno, estadoDoCard, eventoNaTela, fmtDiaMes, fmtDiaMesHora, janelaDoPainel, nomeDaRotina, proximasNoCard,
  rotinasDeHoje, rotinasNoDia, seloDaRotina, textoApagada, valorDoCampo,
} from "./regras";

const TER = "2026-10-13"; // terça-feira (ISO 2)
const AGORA = new Date("2026-10-14T02:30:00Z"); // 23:30 de terça em São Paulo

const rotina = (o: Partial<RotinaDoProfissional> & Pick<RotinaDoProfissional, "id">): RotinaDoProfissional => ({
  origem: "aluno", paciente_id: null, nome: o.id, detalhe: null, tipo: "outro", horario: null, dias_semana: [1, 2, 3, 4, 5, 6, 7], lembrete: false,
  ordem: 0, criada_em: "2026-10-01T10:00:00Z", alterada_em: "2026-10-01T10:00:00Z", arquivada_em: null, pode_editar: false, criada_por_nome: null,
  arquivada_pelo_aluno: false, ...o,
});
const evento = (o: Partial<EventoDaRotina> & Pick<EventoDaRotina, "rotina_id" | "o_que">): EventoDaRotina => ({
  quem: "profissional", antes: null, depois: null, em: "2026-10-12T20:20:00Z", por_nome: "Ana Paula Souza", ...o,
});
const dados = (o: Partial<RotinasDoAluno> = {}): RotinasDoAluno => ({
  paciente_id: "p1", tem_login: true, pode_criar: true, rotinas: [], feitas: [], historico: [], ...o,
});

describe("W-A P6: a janela e as datas de São Paulo", () => {
  it("os últimos 14 dias terminando hoje (23:30 de terça em SP ainda é terça); dd/mm e dd/mm hh:mm em SP", () => {
    expect(JANELA_DIAS).toBe(14);
    expect(janelaDoPainel(AGORA)).toEqual({ de: "2026-09-30", ate: TER });
    expect(fmtDiaMes("2026-10-13T02:30:00Z")).toBe("12/10");
    expect(fmtDiaMesHora("2026-10-12T20:20:00Z")).toBe("12/10 17:20");
  });
});

describe("W-A P6: as rotinas de hoje (o card) e as de um dia passado (o dia a dia)", () => {
  const lista = [
    rotina({ id: "agua", horario: "10:00", origem: "profissional", pode_editar: true, criada_por_nome: "Ana Paula" }),
    rotina({ id: "creatina", horario: "08:00" }),
    rotina({ id: "fds", dias_semana: [6, 7] }),
    rotina({ id: "apagada", horario: "07:00", arquivada_em: "2026-10-12T15:00:00Z", arquivada_pelo_aluno: true }),
    rotina({ id: "nova", horario: "09:00", criada_em: "2026-10-13T12:00:00Z" }),
  ];
  const feitas = [
    { rotina_id: "creatina", dia: TER, feita_em: "2026-10-13T11:00:00Z" },
    { rotina_id: "apagada", dia: "2026-10-12", feita_em: "2026-10-12T10:05:00Z" },
    { rotina_id: "agua", dia: "2026-10-12", feita_em: "2026-10-12T13:00:00Z" },
  ];

  it("hoje: as vivas do dia da semana, pela hora, com o ✓ do aluno (a regra do app); sem as apagadas e as de outro dia da semana", () => {
    const hoje = rotinasDeHoje({ rotinas: lista, feitas }, TER);
    expect(hoje.map((r) => [r.id, r.feita])).toEqual([["creatina", true], ["nova", false], ["agua", false]]);
    expect(hoje.find((r) => r.id === "agua")!.pode_editar).toBe(true); // o que o servidor mandou vai junto
  });

  it("um dia passado: as que já existiam e não tinham sido apagadas ANTES dele (a apagada depois vem com o selo); o ✓ daquele dia", () => {
    const seg = rotinasNoDia(lista, feitas, "2026-10-12");
    expect(seg.map((r) => [r.id, r.feita, r.apagada])).toEqual([["apagada", true, true], ["creatina", false, false], ["agua", true, false]]);
    // criada no dia 13 não aparece no 12; a apagada no 12 não aparece no 13
    expect(rotinasNoDia(lista, feitas, TER).map((r) => r.id)).toEqual(["creatina", "nova", "agua"]);
    // a de fim de semana só no sábado e no domingo
    expect(rotinasNoDia(lista, feitas, "2026-10-11").map((r) => r.id)).toEqual(["apagada", "creatina", "agua", "fds"]);
  });

  it("o card: primeiro as que faltam, depois as feitas; até 4 e o '+N'", () => {
    const l = [{ id: "a", feita: true }, { id: "b", feita: false }, { id: "c", feita: false }, { id: "d", feita: true }, { id: "e", feita: false }];
    expect(proximasNoCard(l)).toEqual({ visiveis: [l[1], l[2], l[4], l[0]], resto: 1 });
    expect(proximasNoCard(l.slice(0, 2))).toEqual({ visiveis: [l[1], l[0]], resto: 0 });
  });
});

describe("W-A P6: o selo, as apagadas e o histórico", () => {
  it("o selo: 'do aluno' · 'de <1º nome de quem criou>' · 'do profissional' (sem o nome)", () => {
    expect(seloDaRotina({ origem: "aluno", criada_por_nome: null })).toBe("do aluno");
    expect(seloDaRotina({ origem: "profissional", criada_por_nome: "Ana Paula Souza" })).toBe("de Ana");
    expect(seloDaRotina({ origem: "profissional", criada_por_nome: null })).toBe("do profissional");
  });

  it("a apagada: 'apagada pelo aluno em 12/10' (P8b) · 'apagada por Ana em 12/10' (pelo histórico) · 'apagada em 12/10'; as apagadas, a mais nova primeiro", () => {
    const pelo = rotina({ id: "x", arquivada_em: "2026-10-12T15:00:00Z", arquivada_pelo_aluno: true });
    const porAna = rotina({ id: "y", origem: "profissional", arquivada_em: "2026-10-12T16:00:00Z" });
    const semQuem = rotina({ id: "z", origem: "profissional", arquivada_em: "2026-10-10T16:00:00Z" });
    const hist = [evento({ rotina_id: "y", o_que: "arquivou" })];
    expect(textoApagada(pelo, hist)).toBe("apagada pelo aluno em 12/10");
    expect(textoApagada(porAna, hist)).toBe("apagada por Ana em 12/10");
    expect(textoApagada(semQuem, hist)).toBe("apagada em 10/10");
    expect(textoApagada(rotina({ id: "viva" }), hist)).toBe("");
    expect(apagadasDoAluno([semQuem, rotina({ id: "viva" }), pelo, porAna]).map((r) => r.id)).toEqual(["y", "x", "z"]);
  });

  it("o histórico em frases: quem, o quê e, no 'mudou', cada campo 'antes → depois' na ordem da folha", () => {
    const mudou = eventoNaTela(evento({
      rotina_id: "a", o_que: "mudou", antes: { horario: "08:00", detalhe: null, lembrete: false, dias_semana: [1, 2, 3, 4, 5, 6, 7] },
      depois: { lembrete: true, horario: "09:00", detalhe: "5 g", dias_semana: [1, 2, 3, 4, 5] },
    }));
    expect(mudou).toEqual({
      quem: "Ana", acao: "mudou", quando: "12/10 17:20",
      mudancas: ["detalhe sem detalhe → 5 g", "horário 08:00 → 09:00", "dias Todos os dias → Seg a Sex", "lembrete desligado → ligado"],
    });
    expect(eventoNaTela(evento({ rotina_id: "a", o_que: "arquivou", quem: "aluno", por_nome: null }))).toMatchObject({ quem: "O aluno", acao: "apagou", mudancas: [] });
    expect(eventoNaTela(evento({ rotina_id: "a", o_que: "criou", por_nome: null, depois: { nome: "Água" } }))).toMatchObject({ quem: "Um profissional", acao: "criou", mudancas: [] });
    expect([valorDoCampo("tipo", "remedio"), valorDoCampo("horario", null), valorDoCampo("nome", "Creatina")]).toEqual(["Remédio", "sem horário", "Creatina"]);
    expect(nomeDaRotina([rotina({ id: "a", nome: "Creatina" })], "a")).toBe("Creatina");
    expect(nomeDaRotina([], "sumiu")).toBe("Rotina apagada");
  });
});

describe("W-A P6: o estado do card", () => {
  const hoje = TER;
  it("carregando · sem internet (a consulta parada, sem o dado) · erro · sem login · vazio (nenhuma viva) · nenhuma hoje · lista", () => {
    expect(estadoDoCard({ isLoading: true, isError: false }, hoje)).toBe("carregando");
    expect(estadoDoCard({ isLoading: false, isError: false, fetchStatus: "paused" }, hoje)).toBe("sem-internet");
    expect(estadoDoCard({ isLoading: false, isError: true }, hoje)).toBe("erro");
    // uma releitura que falhou depois não apaga o que já estava na tela
    expect(estadoDoCard({ isLoading: false, isError: true, data: dados({ rotinas: [rotina({ id: "a" })] }) }, hoje)).toBe("lista");
    expect(estadoDoCard({ isLoading: false, isError: false, data: dados({ tem_login: false }) }, hoje)).toBe("sem-login");
    expect(estadoDoCard({ isLoading: false, isError: false, data: dados({ rotinas: [rotina({ id: "x", arquivada_em: "2026-10-01T00:00:00Z" })] }) }, hoje)).toBe("vazio");
    expect(estadoDoCard({ isLoading: false, isError: false, data: dados({ rotinas: [rotina({ id: "fds", dias_semana: [6, 7] })] }) }, hoje)).toBe("nenhuma-hoje");
    expect(estadoDoCard({ isLoading: false, isError: false, data: dados({ rotinas: [rotina({ id: "a" })] }) }, hoje)).toBe("lista");
  });

  it("o texto do 'sem login' é o da função (a mesma frase do sem_login_do_aluno)", () => {
    expect(TEXTOS.semLogin).toBe(MENSAGEM_ERRO_ALUNO_DIA.sem_login_do_aluno);
  });
});
