import { describe, expect, it } from "vitest";
import {
  REGRAS_PADRAO, consultasPorSemana, confirmacaoDe, gerarICS, iniciosDoDia, intervaloDoMes, janelaDoReagendamento, janelaPorMes, mensagemDesistir,
  mensagemReagendar, mesPorExtenso, navegacaoDoMes,
  nomeArquivoICS, normalizarRegras, numerosDaAgenda, periodoDoPacote, resumoDasRegras, rotuloSemana, somarMeses, textoDias, textoHojePorTipo,
  textoPacote, textoSlotsPorDia, textoTrava, tipoPadrao, travasDoDia, ultimoDiaDoMes, type ContextoConsulta, type PacoteSituacao,
  ROTULO_MES_PACOTE, mesUsado,
  TAG_BASE, baseDaArea, calendariosIniciais, destinoAoExcluir, estiloDaTag, inicialDaTag, mensagemErroTag, normalizarNomeTag, normalizarTag,
  tagDaConsulta, tagPadraoDoCalendario, tagsDe, temAsBases, validarTag, type TagAgenda,
} from "./regras";

const pacote = (restam: number, total = 6, meses: PacoteSituacao["meses"] = [{ mes: "2026-10-01", estado: "agendada" }]) => ({ restam, total, meses });
const ctx = (extra: Partial<ContextoConsulta> = {}): ContextoConsulta => ({
  regras: { ...REGRAS_PADRAO },
  reagendamentos: 0,
  mesRef: "2026-10-01",
  hoje: "2026-10-01",
  inicio: "2026-10-15T17:00:00Z", // 14:00 em São Paulo
  profissional: "Lucas Ferreira",
  pacote: null,
  ...extra,
});

describe("regras da agenda (W20) — padrões e slots", () => {
  it("sem configuração = slot de 30 min, 08:00–18:00, todos os dias, 1 reagendamento, só no mês, desistência liberada", () => {
    expect(normalizarRegras(null)).toEqual(REGRAS_PADRAO);
    expect(normalizarRegras({ slot_minutos: 45, atende_inicio: "07:30:00", dias: [5, 1, 1, 9], janela_reagendamento: "x", desistencia: false }))
      .toMatchObject({ slot_minutos: 45, atende_inicio: "07:30", dias: [1, 5], janela_reagendamento: "mes", desistencia: false });
  });

  it("slots do dia DENTRO do horário de atendimento (default A): 08–18 com 30 min = 20; 1 h de consulta não passa das 18:00", () => {
    expect(iniciosDoDia(REGRAS_PADRAO)).toHaveLength(20);
    expect(iniciosDoDia(REGRAS_PADRAO).slice(0, 3)).toEqual(["08:00", "08:30", "09:00"]);
    expect(iniciosDoDia(REGRAS_PADRAO, 30, 60).at(-1)).toBe("17:00");
    expect(iniciosDoDia({ ...REGRAS_PADRAO, atende_inicio: "00:00", atende_fim: "23:59" }, 30)).toHaveLength(47);
    expect(textoSlotsPorDia(REGRAS_PADRAO)).toBe("20 slots de 30 min por dia");
  });

  it("dias e resumo", () => {
    expect(textoDias([0, 1, 2, 3, 4, 5, 6])).toBe("todos os dias");
    expect(textoDias([1, 2, 3, 4, 5])).toBe("seg–sex");
    expect(textoDias([1, 3, 5])).toBe("seg, qua, sex");
    expect(textoDias([])).toBe("nenhum dia");
    expect(resumoDasRegras(REGRAS_PADRAO)).toBe("Slots de 30 min · 08:00–18:00 · todos os dias");
  });

  it("travas recorrentes do dia (de todos os calendários ou do calendário)", () => {
    const t = [
      { id: "a", profissional_id: "p", calendario_id: null, dias: [0, 1, 2, 3, 4, 5, 6], hora_inicio: "13:00", hora_fim: "14:00", motivo: "Almoço" },
      { id: "b", profissional_id: "p", calendario_id: "c2", dias: [3], hora_inicio: "08:00", hora_fim: "09:00", motivo: null },
    ];
    expect(travasDoDia(t, 3, "c1").map((x) => x.id)).toEqual(["a"]);
    expect(travasDoDia(t, 3, "c2").map((x) => x.id)).toEqual(["a", "b"]);
    expect(textoTrava(t[0])).toBe("13:00–14:00 · todos os dias");
  });
});

describe("janela do reagendamento (as 3 opções do pedido)", () => {
  it("só no mês da consulta: até o último dia do mês, nunca antes de hoje", () => {
    expect(janelaDoReagendamento("mes", "2026-10-01", "2026-10-07")).toEqual({ de: "2026-10-07", ate: "2026-10-31" });
    expect(janelaDoReagendamento("mes", "2026-11-01", "2026-10-20")).toEqual({ de: "2026-11-01", ate: "2026-11-30" });
  });
  it("até o fim do mês seguinte (não são 60 dias): o mês atual ou o próximo", () => {
    expect(janelaDoReagendamento("mes_seguinte", "2026-10-01", "2026-10-30")).toEqual({ de: "2026-10-30", ate: "2026-11-30" });
    expect(janelaDoReagendamento("mes_seguinte", "2026-12-01", "2026-12-02")).toEqual({ de: "2026-12-02", ate: "2027-01-31" });
  });
  it("sem trava: qualquer mês, sem fim (H5 — N-11, regra dele de 01/10; antes parava em 180 dias)", () => {
    expect(janelaDoReagendamento("livre", "2026-10-01", "2026-10-07")).toEqual({ de: "2026-10-07", ate: null });
    // a consulta de um mês passado: a janela começa hoje e continua sem fim
    expect(janelaDoReagendamento("livre", "2026-08-01", "2026-10-07")).toEqual({ de: "2026-10-07", ate: null });
  });
  it("datas", () => {
    expect(somarMeses("2026-12-01", 1)).toBe("2027-01-01");
    expect(ultimoDiaDoMes("2028-02-01")).toBe("2028-02-29");
  });
});

describe("mensagem clara ao reagendar (pedido dele)", () => {
  it("padrão (1 vez, só no mês): o texto do pedido", () => {
    const m = mensagemReagendar(ctx());
    expect(m.pode).toBe(true);
    expect(m.texto).toBe("Você só pode reagendar 1 vez neste mês (até 31/10). Se não puder comparecer na nova data, você não terá outra consulta em outubro.");
  });
  it("mais de 1 vez, até o fim do mês seguinte", () => {
    const m = mensagemReagendar(ctx({ regras: { ...REGRAS_PADRAO, reagendamentos_max: 3, janela_reagendamento: "mes_seguinte" }, reagendamentos: 1 }));
    expect(m.texto).toBe("Você pode reagendar 2 vezes para uma data até 30/11 (outubro ou o mês seguinte). Depois do último reagendamento, se não puder comparecer, você perde a consulta de outubro.");
  });
  it("sem trava", () => {
    expect(mensagemReagendar(ctx({ regras: { ...REGRAS_PADRAO, janela_reagendamento: "livre" } })).texto)
      .toBe("Você só pode reagendar 1 vez para qualquer data. Se não puder comparecer na nova data, você perde esta consulta.");
  });
  it("com pacote: quantas restam e o que acontece se faltar", () => {
    expect(mensagemReagendar(ctx({ pacote: pacote(6) })).texto)
      .toBe("Você só pode reagendar 1 vez neste mês (até 31/10). Se não puder comparecer na nova data, você não terá outra consulta em outubro. Seu pacote: restam 6 de 6 consultas; faltando, a de outubro conta como usada.");
    // consulta fora dos meses do pacote: o pacote não entra
    expect(mensagemReagendar(ctx({ pacote: pacote(6, 6, [{ mes: "2026-12-01", estado: "livre" }]) })).texto).not.toContain("pacote");
  });
  it("já reagendou o que podia / reagendar desligado / mês acabou", () => {
    const usado = mensagemReagendar(ctx({ reagendamentos: 1 }));
    expect(usado.pode).toBe(false);
    expect(usado.texto).toBe("Você já usou o seu reagendamento desta consulta. Para mudar a data de novo, fale com Lucas Ferreira.");
    expect(mensagemReagendar(ctx({ regras: { ...REGRAS_PADRAO, reagendamentos_max: 2 }, reagendamentos: 2 })).texto).toContain("os 2 reagendamentos");
    expect(mensagemReagendar(ctx({ regras: { ...REGRAS_PADRAO, reagendamentos_max: 0 } })).pode).toBe(false);
    const passou = mensagemReagendar(ctx({ mesRef: "2026-09-01", hoje: "2026-10-01" }));
    expect(passou.pode).toBe(false);
    expect(passou.titulo).toBe("O prazo para reagendar acabou");
  });
});

describe("mensagem da desistência (o aviso do que ele perde)", () => {
  it("com pacote: a do mês conta como usada e não volta", () => {
    const m = mensagemDesistir(ctx({ pacote: pacote(6) }));
    expect(m.pode).toBe(true);
    expect(m.texto).toBe("Você vai desistir da consulta de qui, 15/10 às 14:00 com Lucas Ferreira. A consulta de outubro conta como usada: ficam 5 de 6 no seu pacote, e ela não volta. Isso não pode ser desfeito.");
    // o mês que já contou não conta de novo
    expect(mensagemDesistir(ctx({ pacote: pacote(5, 6, [{ mes: "2026-10-01", estado: "feita" }]) })).texto).toContain("ficam 5 de 6");
    // ainda há outra consulta viva no mês com o mesmo profissional: o mês não se perde
    expect(mensagemDesistir(ctx({ pacote: pacote(6), outrasNoMes: 1 })).texto).toContain("Você ainda tem outra consulta em outubro com Lucas Ferreira: o seu pacote não muda.");
  });
  it("sem pacote, só no mês: não terá outra consulta no mês; desligada: fale com o profissional", () => {
    expect(mensagemDesistir(ctx()).texto).toContain("Você não terá outra consulta em outubro, a não ser que Lucas Ferreira marque uma nova.");
    expect(mensagemDesistir(ctx({ regras: { ...REGRAS_PADRAO, janela_reagendamento: "livre" } })).texto).toContain("Para marcar de novo, fale com Lucas Ferreira.");
    expect(mensagemDesistir(ctx({ regras: { ...REGRAS_PADRAO, desistencia: false } }))).toMatchObject({ pode: false });
  });
});

describe("pacote", () => {
  it("textos", () => {
    expect(textoPacote({ restam: 5, total: 6 })).toBe("Restam 5 de 6 consultas");
    expect(textoPacote({ restam: 0, total: 6 })).toBe("Nenhuma consulta restante de 6");
    expect(periodoDoPacote({ mes_inicio: "2026-10-01", mes_fim: "2027-03-01" })).toBe("out/2026 a mar/2027 · 1 por mês");
  });
});

describe("pacote — desmarcada pelo profissional não conta (W20c, decisão dele 01/10)", () => {
  it("o mês desmarcado pelo profissional não é usado; falta, desistência e mês sem consulta continuam usados", () => {
    expect(mesUsado("desmarcada")).toBe(false);
    expect(mesUsado("faltou")).toBe(true);
    expect(mesUsado("desistiu")).toBe(true);
    expect(mesUsado("sem_consulta")).toBe(true);
    expect(ROTULO_MES_PACOTE.desmarcada).toBe("profissional desmarcou · não conta");
  });
  it("o crédito continua: 6 de 6 com 1 mês desmarcado = ainda 6, e o período anda 1 mês", () => {
    expect(textoPacote({ restam: 6, total: 6 })).toBe("Restam 6 de 6 consultas");
    expect(periodoDoPacote({ mes_inicio: "2026-10-01", mes_fim: "2027-04-01" })).toBe("out/2026 a abr/2027 · 1 por mês");
  });
});

describe("tipo do agendamento (NF12) pelo papel de quem agenda", () => {
  it("personal → treino; nutricionista → nutrição; os dois → pela relação com o aluno; sem saber → geral", () => {
    expect(tipoPadrao(["personal"], "u1")).toBe("treino");
    expect(tipoPadrao(["dono", "nutricionista"], "u1")).toBe("nutricao");
    expect(tipoPadrao(["dono", "personal", "nutricionista"], "u1", { personal_id: "u1", nutricionista_id: "u2" })).toBe("treino");
    expect(tipoPadrao(["dono", "personal", "nutricionista"], "u1", { personal_id: "u2", nutricionista_id: "u1" })).toBe("nutricao");
    expect(tipoPadrao(["dono", "personal", "nutricionista"], "u1", null)).toBe("geral");
    expect(tipoPadrao(["dono"], "u1", null, ["nutricao"])).toBe("nutricao");
  });
});

describe("Consultas por semana (N-9) e os números do topo", () => {
  const ag = (id: string, inicio: string, status = "agendado", modulo = "nutricao", extra: Record<string, unknown> = {}) =>
    ({ id, inicio, fim: new Date(new Date(inicio).getTime() + 3600_000).toISOString(), status, confirmacao: confirmacaoDe(status as never), modulo, paciente_id: "p", ...extra });
  const lista = [
    ag("1", "2026-10-01T10:00:00Z", "agendado", "treino"),
    ag("2", "2026-10-01T13:00:00Z", "paciente_confirmou", "nutricao"),
    ag("3", "2026-10-01T15:00:00Z", "desmarcado", "nutricao"),
    ag("4", "2026-09-30T12:00:00Z", "confirmado", "treino"),
    ag("5", "2026-09-22T12:00:00Z", "confirmado", "geral"),
  ];
  it("8 semanas (a atual por último), sem as desmarcadas", () => {
    const s = consultasPorSemana(lista, "2026-10-01");
    expect(s).toHaveLength(8);
    expect(s.at(-1)).toMatchObject({ chave: "2026-09-28", rotulo: "28/09–04/10", agendadas: 3, confirmadas: 2 });
    expect(s.at(-2)).toMatchObject({ chave: "2026-09-21", agendadas: 1, confirmadas: 1 });
    expect(rotuloSemana("2026-09-21")).toBe("21–27/09");
  });
  it("Consultas hoje (treino · nutrição), semana, a confirmar e taxa", () => {
    const n = numerosDaAgenda(lista, "2026-10-01", new Date("2026-10-01T09:00:00Z"));
    expect(n).toMatchObject({ hoje: 2, hojeTreino: 1, hojeNutricao: 1, semana: 3, semanaConfirmadas: 2, aConfirmar: 1, taxaConfirmacao: 75 });
    expect(textoHojePorTipo(n)).toBe("1 de treino · 1 de nutrição");
    expect(n.porDia).toHaveLength(14);
  });
});

describe(".ics (N-66)", () => {
  it("RFC 5545 com a marca Physiq e o mesmo UID do site antigo", () => {
    const ics = gerarICS([
      { id: "e1", titulo: "Avaliação física", inicio: new Date("2026-10-15T17:00:00Z"), fim: new Date("2026-10-15T18:00:00Z"), diaInteiro: false, status: "paciente_confirmou", modulo: "treino", aluno: "Rafael Moura", observacao: "Trazer, tênis; e toalha" },
      { id: "e2", titulo: "Feriado", inicio: new Date(2026, 10, 2), fim: new Date(2026, 10, 3), diaInteiro: true, status: "desmarcado" },
    ], new Date("2026-10-01T12:00:00Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Physiq//Agenda//PT")).toBe(true);
    expect(ics).toContain("UID:e1@physiqnutri");
    expect(ics).toContain("DTSTART:20261015T170000Z");
    expect(ics).toContain("SUMMARY:Avaliação física · Rafael Moura");
    expect(ics).toContain("DESCRIPTION:Treino — Aluno confirmou — Trazer\\, tênis\\; e toalha");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261102");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(nomeArquivoICS(new Date("2026-10-01T12:00:00Z"))).toBe("agenda-physiq-2026-10-01.ics");
  });
});

describe("H5 — a janela mês a mês (sem trava = qualquer mês; pacote de vários meses)", () => {
  it("só pagina quando a janela não cabe num pedido (62 dias) ou não tem fim", () => {
    expect(janelaPorMes({ de: "2026-10-07", ate: null })).toBe(true);
    expect(janelaPorMes({ de: "2026-10-07", ate: "2026-10-31" })).toBe(false);
    expect(janelaPorMes({ de: "2026-10-02", ate: "2026-11-30" })).toBe(false); // mês seguinte: 59 dias, uma lista só (como hoje)
    expect(janelaPorMes({ de: "2026-10-01", ate: "2026-12-02" })).toBe(false); // 62 dias: ainda cabe
    expect(janelaPorMes({ de: "2026-10-01", ate: "2026-12-03" })).toBe(true); // pacote de 3 meses
    expect(janelaPorMes(null)).toBe(false);
  });
  it("o mês pedido é cortado pela janela (nunca antes do início nem depois do fim)", () => {
    expect(intervaloDoMes("2026-10-01", { de: "2026-10-07", ate: null })).toEqual({ de: "2026-10-07", ate: "2026-10-31" });
    expect(intervaloDoMes("2027-02-01", { de: "2026-10-07", ate: null })).toEqual({ de: "2027-02-01", ate: "2027-02-28" });
    expect(intervaloDoMes("2026-12-01", { de: "2026-10-01", ate: "2026-12-15" })).toEqual({ de: "2026-12-01", ate: "2026-12-15" });
  });
  it("as setas: volta até o mês do início; sem fim, sempre há o próximo (anos à frente também)", () => {
    const livre = { de: "2026-10-07", ate: null };
    expect(navegacaoDoMes("2026-10-01", livre)).toEqual({ anterior: null, proximo: "2026-11-01" });
    expect(navegacaoDoMes("2026-11-01", livre)).toEqual({ anterior: "2026-10-01", proximo: "2026-12-01" });
    expect(navegacaoDoMes("2029-12-01", livre)).toEqual({ anterior: "2029-11-01", proximo: "2030-01-01" });
    expect(navegacaoDoMes("2026-12-01", { de: "2026-10-01", ate: "2026-12-31" })).toEqual({ anterior: "2026-11-01", proximo: null });
  });
  it("o nome do mês", () => {
    expect(mesPorExtenso("2026-10-01")).toBe("outubro de 2026");
    expect(mesPorExtenso("2027-03-15")).toBe("março de 2027");
  });
});

// ───────────────────────── W2 — tags da agenda ─────────────────────────
describe("tags da agenda (W2 — o Tipo vira tag do profissional)", () => {
  const tg = (extra: Partial<TagAgenda>): TagAgenda => ({ id: "x", profissional_id: "eu", nome: "X", cor: "#94a3b8", area: "geral", base: false, ordem: 9, ...extra });
  const minhas: TagAgenda[] = [
    tg({ id: "bt", nome: "Treino", cor: "#a78bfa", area: "treino", base: true, ordem: 1 }),
    tg({ id: "bn", nome: "Nutrição", cor: "#34d399", area: "nutricao", base: true, ordem: 2 }),
    tg({ id: "bg", nome: "Geral", cor: "#94a3b8", area: "geral", base: true, ordem: 3 }),
    tg({ id: "re", nome: "Reunião", cor: "#f472b6", area: "geral", ordem: 4 }),
    tg({ id: "ac", nome: "Acompanhamento", cor: "#38bdf8", area: "nutricao", ordem: 5 }),
    tg({ id: "velha", nome: "Antiga", area: "treino", ordem: 6, deleted_at: "2026-10-01T00:00:00Z" }),
  ];
  const daCamila: TagAgenda[] = [
    tg({ id: "cn", profissional_id: "camila", nome: "Nutrição", cor: "#34d399", area: "nutricao", base: true, ordem: 2 }),
    tg({ id: "cg", profissional_id: "camila", nome: "Geral", area: "geral", base: true, ordem: 3 }),
    tg({ id: "ct", profissional_id: "camila", nome: "Treino", cor: "#a78bfa", area: "treino", base: true, ordem: 1 }),
  ];
  const todas = [...daCamila, ...minhas];

  it("as 3 base têm as cores do chip de antes (Treino violeta, Nutrição verde) e o Geral no cinza da paleta", () => {
    expect(TAG_BASE).toEqual({ treino: { nome: "Treino", cor: "#a78bfa" }, nutricao: { nome: "Nutrição", cor: "#34d399" }, geral: { nome: "Geral", cor: "#94a3b8" } });
  });

  it("toda lista filtra por profissional (o master lê as de todos): vivas, na ordem, as base primeiro", () => {
    expect(tagsDe(todas, "eu").map((t) => t.id)).toEqual(["bt", "bn", "bg", "re", "ac"]);
    expect(tagsDe(todas, "camila").map((t) => t.id)).toEqual(["ct", "cn", "cg"]);
    expect(tagsDe(todas, null)).toEqual([]);
    expect(baseDaArea(todas, "camila", "nutricao")?.id).toBe("cn");
    expect(temAsBases(todas, "eu")).toBe(true);
    expect(temAsBases(minhas.filter((t) => t.id !== "bg"), "eu")).toBe(false);
  });

  it("tag padrão do novo agendamento: a do calendário (viva e do dono dele); sem ela, a base da área que o papel escolhe", () => {
    expect(tagPadraoDoCalendario({ nutricionista_id: "eu", tag_padrao_id: "ac" }, todas, "treino")?.id).toBe("ac");
    expect(tagPadraoDoCalendario({ nutricionista_id: "eu", tag_padrao_id: null }, todas, "treino")?.id).toBe("bt");
    expect(tagPadraoDoCalendario({ nutricionista_id: "eu", tag_padrao_id: "velha" }, todas, "nutricao")?.id).toBe("bn");
    // calendário da Camila (o dono vendo a equipe): só as tags DELA — a minha "Reunião" não vale lá
    expect(tagPadraoDoCalendario({ nutricionista_id: "camila", tag_padrao_id: "re" }, todas, "nutricao")?.id).toBe("cn");
    expect(tagPadraoDoCalendario(null, todas, "geral")).toBeNull();
  });

  it("a área da tag é o modulo: o tipo de antes (papel) só decide quando o calendário não tem tag padrão", () => {
    const area = tipoPadrao(["personal"], "eu", null, ["treino", "nutricao"]);
    expect(area).toBe("treino");
    expect(tagPadraoDoCalendario({ nutricionista_id: "eu" }, todas, area)?.area).toBe("treino");
    expect(tagPadraoDoCalendario({ nutricionista_id: "eu", tag_padrao_id: "re" }, todas, area)?.area).toBe("geral");
  });

  it("excluir: as consultas vão para a base da MESMA área; a base não sai", () => {
    expect(destinoAoExcluir(minhas[3], todas)?.id).toBe("bg"); // Reunião (geral) → Geral
    expect(destinoAoExcluir(minhas[4], todas)?.id).toBe("bn"); // Acompanhamento (nutrição) → Nutrição
    expect(destinoAoExcluir(minhas[0], todas)).toBeNull();
  });

  it("validar: nome 1–40, sem repetir entre as vivas (sem diferenciar maiúscula), cor da paleta", () => {
    expect(validarTag({ nome: "  ", cor: "#f472b6" }, minhas)).toEqual({ nome: "Dê um nome à tag" });
    expect(validarTag({ nome: "x".repeat(41), cor: "#f472b6" }, minhas).nome).toMatch(/40/);
    expect(validarTag({ nome: "reunião", cor: "#f472b6" }, minhas).nome).toBe("Você já tem uma tag com esse nome");
    expect(validarTag({ nome: "TREINO", cor: "#f472b6" }, minhas).nome).toBe("Você já tem uma tag com esse nome");
    expect(validarTag({ nome: "Reunião", cor: "#f472b6" }, minhas, "re")).toEqual({});
    expect(validarTag({ nome: "Antiga", cor: "#f472b6" }, minhas)).toEqual({}); // a excluída liberou o nome
    expect(validarTag({ nome: "Nova", cor: "azul" }, minhas)).toEqual({ cor: "Escolha uma cor" });
    expect(normalizarNomeTag("  Reunião   de  equipe ")).toBe("Reunião de equipe");
  });

  it("a inicial (visão mês) e a pílula na cor da tag", () => {
    expect(inicialDaTag("reunião")).toBe("R");
    expect(inicialDaTag("  ácido")).toBe("Á");
    expect(estiloDaTag("#f472b6")).toEqual({ background: "rgba(244, 114, 182, .2)", borderColor: "rgba(244, 114, 182, .45)", color: "color-mix(in srgb, #f472b6 62%, var(--p-texto))" });
    expect(estiloDaTag("azul").background).toBe("rgba(148, 163, 184, .2)");
  });

  it("a tag que a consulta mostra: a dela; sem ela no mapa, a base da área do modulo", () => {
    const mapa = new Map(todas.map((t) => [t.id, t]));
    expect(tagDaConsulta("re", "geral", mapa)).toEqual({ id: "re", nome: "Reunião", cor: "#f472b6", area: "geral" });
    expect(tagDaConsulta("sumiu", "nutricao", mapa)).toEqual({ id: null, nome: "Nutrição", cor: "#34d399", area: "nutricao" });
    expect(tagDaConsulta(null, "x", null)).toMatchObject({ id: null, area: "nutricao" });
  });

  it("calendários iniciais: personal E nutri → Treino (padrão) e Nutrição; só personal → 1 com Treino; só nutri → 1 com Nutrição", () => {
    expect(calendariosIniciais(["dono", "personal", "nutricionista"], ["treino", "nutricao"])).toEqual([
      { nome: "Treino", cor: "#a78bfa", padrao: true, area: "treino" },
      { nome: "Nutrição", cor: "#34d399", padrao: false, area: "nutricao" },
    ]);
    expect(calendariosIniciais(["dono", "personal"], ["treino"])).toEqual([{ nome: "Calendário principal", cor: "#a78bfa", padrao: true, area: "treino" }]);
    expect(calendariosIniciais(["nutricionista"], ["treino", "nutricao"])).toEqual([{ nome: "Calendário principal", cor: "#a78bfa", padrao: true, area: "nutricao" }]);
    // só dono numa conta com os 2 módulos: sem tag padrão (a tag vem pelo papel em cada consulta, como hoje)
    expect(calendariosIniciais(["dono"], ["treino", "nutricao"])[0]).toMatchObject({ nome: "Calendário principal", area: null });
    expect(calendariosIniciais(["dono"], ["nutricao"])[0].area).toBe("nutricao");
  });

  it("o que vem do banco vira tag (com os padrões) e os erros do banco viram frase", () => {
    expect(normalizarTag({ id: "a", profissional_id: "p", nome: "Reunião", cor: "#F472B6", area: "geral", base: false, ordem: "4" }))
      .toMatchObject({ id: "a", cor: "#f472b6", area: "geral", ordem: 4, base: false });
    expect(normalizarTag({ id: "a", profissional_id: "p", area: "nutricao", cor: "x" })).toMatchObject({ nome: "Nutrição", cor: "#34d399", area: "nutricao" });
    expect(normalizarTag({ nome: "sem id" })).toBeNull();
    expect(mensagemErroTag('duplicate key value violates unique constraint "agenda_tags_nome_uq"')).toBe("Você já tem uma tag com esse nome");
    expect(mensagemErroTag("tag_base_nao_exclui")).toMatch(/não podem ser excluídas/);
    expect(mensagemErroTag("tag_base_area_fixa")).toBe("A área das tags prontas não muda");
    expect(mensagemErroTag('new row violates row-level security policy for table "agenda_tags"')).toMatch(/outro profissional/);
  });

  it("o .ics do profissional leva a tag em CATEGORIES (a área continua na descrição)", () => {
    const ics = gerarICS([{ id: "a1", titulo: "Retorno", inicio: new Date("2026-10-15T17:00:00Z"), fim: new Date("2026-10-15T18:00:00Z"), diaInteiro: false,
      status: "confirmado", modulo: "nutricao", aluno: "Marina Alves", tag: "Acompanhamento, mensal" }], new Date("2026-10-01T12:00:00Z"));
    expect(ics).toContain("CATEGORIES:Acompanhamento\\, mensal\r\n");
    expect(ics).toContain("DESCRIPTION:Nutrição — Confirmado por você\r\n");
    const sem = gerarICS([{ id: "a2", titulo: "X", inicio: new Date("2026-10-15T17:00:00Z"), fim: new Date("2026-10-15T18:00:00Z"), diaInteiro: false, status: "agendado" }]);
    expect(sem).not.toContain("CATEGORIES");
  });
});
