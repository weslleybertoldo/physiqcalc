import { describe, expect, it } from "vitest";
import {
  acoesDoEmailAgenda, aguardaConfirmacao, assuntoDaAgenda, consultasComDetalhes, consultasDoEmail, destinoDoEmailAgenda, duracaoPorExtenso,
  duracaoTexto, htmlDaAgenda, linkDaAgenda, mesDaConsulta, modeloDaAgenda, podeReagendarConsulta, quandoConsulta, quandoNoAssunto,
  quandoPorExtenso, regrasDoReagendamento, rotuloDoTipo, statusDoErroAgenda, textoDaAgenda, tipoDaConsulta, type DadosEmailAgenda,
  type RegrasDoReagendamento,
} from "../../supabase-principal/functions/_shared/agenda-regras";
import { IMAGENS_EMAIL } from "../../supabase-principal/functions/_shared/email-modelo";
import { REGRAS_PADRAO, mensagemReagendar, tipoDe, tituloPadrao, type Janela } from "./regras";

const uma = [{ id: "a1", inicio: "2026-10-15T17:00:00Z", fim: "2026-10-15T18:00:00Z", titulo: "Avaliação física", modulo: "treino" }];
const regras: RegrasDoReagendamento = { reagendamentos_max: 1, janela_reagendamento: "mes" };
const link = "https://physiqcalc.com.br/perfil/agenda";
const dados = (x: Partial<DadosEmailAgenda> = {}): DadosEmailAgenda => ({
  email: "a@b.com", aluno: "Rafael Moura", quem: "Lucas Ferreira", consultas: uma, link, regras, hoje: "2026-10-01", ...x,
});

/** Os textos dos botões do HTML (o primário e os secundários). */
const botoes = (html: string) => [...html.matchAll(/<a href="[^"]*" style="display:block;[^"]*">([^<]*)<\/a>/g)].map((m) => m[1]);

describe("função agenda-avisar (W20) — o e-mail \"consulta marcada\" no molde C (H3)", () => {
  it("STAGING manda SEMPRE para a caixa de teste do Resend; produção: teste → caixa de teste, pessoa real → o e-mail dela", () => {
    expect(destinoDoEmailAgenda("staging", "fulano@gmail.com")).toEqual({ para: "delivered@resend.dev", teste: true });
    expect(destinoDoEmailAgenda("public", "w20.aluno.teste.claude@physiqnutri.app")).toEqual({ para: "delivered@resend.dev", teste: true });
    expect(destinoDoEmailAgenda("public", "Fulano@Gmail.com")).toEqual({ para: "fulano@gmail.com", teste: false });
  });

  it("datas em São Paulo: a do sino (igual), por extenso, a do assunto e a duração", () => {
    expect(quandoConsulta("2026-10-15T17:00:00Z")).toBe("qui, 15/10 às 14:00");
    expect(quandoConsulta("x")).toBe("");
    expect(quandoPorExtenso("2026-10-01T16:30:00Z")).toBe("Quinta, 1 de outubro · 13:30");
    expect(quandoPorExtenso("2026-03-07T12:05:00Z")).toBe("Sábado, 7 de março · 09:05");
    expect(quandoNoAssunto("2026-10-01T16:30:00Z")).toBe("quinta, 1/10, 13:30");
    expect(quandoNoAssunto("2027-01-03T02:00:00Z")).toBe("sábado, 2/1, 23:00"); // 02:00 UTC = 23:00 do dia anterior em SP
    expect(quandoNoAssunto("x")).toBe("");
    expect(duracaoTexto("2026-10-15T17:00:00Z", "2026-10-15T18:30:00Z")).toBe("1 h 30 min");
    expect(duracaoTexto("2026-10-15T17:00:00Z", "2026-10-15T17:30:00Z")).toBe("30 min");
    expect(duracaoPorExtenso("2026-10-15T17:00:00Z", "2026-10-15T17:30:00Z")).toBe("30 minutos");
    expect(duracaoPorExtenso("2026-10-15T17:00:00Z", "2026-10-15T18:00:00Z")).toBe("1 hora");
    expect(duracaoPorExtenso("2026-10-15T17:00:00Z", "2026-10-15T18:30:00Z")).toBe("1 hora e 30 minutos");
    expect(duracaoPorExtenso("2026-10-15T17:00:00Z", "2026-10-15T19:01:00Z")).toBe("2 horas e 1 minuto");
    expect(duracaoPorExtenso("2026-10-15T17:00:00Z", "2026-10-15T17:00:00Z")).toBe("");
  });

  it("assunto no estilo da C: 1 consulta esperando o aluno, já confirmada, várias; teste diz para quem era", () => {
    const c = { inicio: "2026-10-01T16:30:00Z", fim: "2026-10-01T17:00:00Z" };
    expect(assuntoDaAgenda(dados({ consultas: [c] }))).toBe("Confirme sua consulta de quinta, 1/10, 13:30");
    expect(assuntoDaAgenda(dados({ consultas: [{ ...c, status: "encaixe" }] }))).toBe("Confirme sua consulta de quinta, 1/10, 13:30");
    expect(assuntoDaAgenda(dados({ consultas: [{ ...c, status: "confirmado" }] }))).toBe("Consulta marcada: quinta, 1/10, 13:30");
    expect(assuntoDaAgenda(dados({ consultas: [...uma, ...uma, ...uma] }))).toBe("Confirme suas 3 consultas com Lucas Ferreira");
    expect(assuntoDaAgenda(dados({ consultas: [1, 2].map(() => ({ ...uma[0], status: "confirmado" })) }))).toBe("2 consultas marcadas com Lucas Ferreira");
    expect(assuntoDaAgenda(dados({ consultas: [c], paraTeste: "a@b.com" }))).toBe("[teste → a@b.com] Confirme sua consulta de quinta, 1/10, 13:30");
    expect(assuntoDaAgenda(dados({ consultas: [], quem: " " }))).toBe("Consulta marcada com seu profissional");
  });

  it("1 consulta: o mesmo e-mail da Opção C (calendário, tipo, hora grande, dados em linhas, 3 botões para a Agenda)", () => {
    const c = { id: "c1", inicio: "2026-10-01T16:30:00Z", fim: "2026-10-01T17:00:00Z", titulo: "Consulta de nutrição", modulo: "nutricao", status: "agendado" };
    const d = dados({ aluno: "Weslley Bertoldo", quem: "Weslley Bertoldo", consultas: [c] });
    const m = modeloDaAgenda(d);
    expect(m.rotulo).toBe("Convite de consulta");
    expect(m.destaques).toEqual([{ visual: { tipo: "calendario", semana: "Qui", dia: "1", mes: "Out" }, olho: "Consulta de nutrição", titulo: "13:30", sub: "até 14:00 · 30 min" }]);
    expect(m.linhas.map((l) => [l.rotulo, l.valor])).toEqual([
      ["Quando", "Quinta, 1 de outubro · 13:30"], ["Duração", "30 minutos"], ["Tipo", "Consulta de nutrição"], ["Com", "Weslley Bertoldo"],
    ]);
    expect(m.linhas.map((l) => l.icone ?? l.iniciais)).toEqual(["calendario", "relogio", "salada", "WB"]);
    expect(m.preheader).toBe("Weslley Bertoldo marcou uma consulta de nutrição para quinta, 1 de outubro, às 13:30. Confirme pelo app.");
    expect(m.rodape).toBe("Você recebeu este e-mail porque é aluno de Weslley Bertoldo no Physiq.");
    const html = htmlDaAgenda(d);
    expect(html).toContain("Olá, Weslley! <strong");
    expect(html).toContain(">Weslley Bertoldo</strong> marcou esta consulta para você.");
    expect(botoes(html)).toEqual(["Confirmar presença", "Reagendar", "Ver minha agenda"]);
    expect([...html.matchAll(/<a href="([^"]*)"/g)].map((x) => x[1]).filter((h) => !h.startsWith("mailto:"))).toEqual([link, link, link, link, "https://physiqcalc.com.br"]);
    expect(html).toContain(">physiqcalc.com.br/perfil/agenda</a>");
    expect(html).toContain("Os botões abrem o app. Se não abrir, use o link:");
    expect(html).toContain(`${IMAGENS_EMAIL}/cal-violeta.png`);
    expect(html).not.toMatch(/<svg/i);
  });

  it("\"Confirmar presença\" só enquanto a consulta espera o aluno; \"Reagendar\" só quando a regra deixa", () => {
    const c = { ...uma[0], status: "agendado", reagendamentos: 0, mes_referencia: "2026-10-01" };
    expect(botoes(htmlDaAgenda(dados({ consultas: [c] })))).toEqual(["Confirmar presença", "Reagendar", "Ver minha agenda"]);
    // já confirmada pelo profissional: o primário vira "Ver minha agenda"
    const conf = htmlDaAgenda(dados({ consultas: [{ ...c, status: "confirmado" }] }));
    expect(botoes(conf)).toEqual(["Ver minha agenda", "Reagendar"]);
    expect(conf).toContain(">Consulta marcada</td>");
    expect(conf).toContain("marcou e confirmou esta consulta para você.");
    // sem reagendamento na regra, já reagendou ou sem as regras (o banco não respondeu): sem "Reagendar"
    expect(botoes(htmlDaAgenda(dados({ consultas: [c], regras: { ...regras, reagendamentos_max: 0 } })))).toEqual(["Confirmar presença", "Ver minha agenda"]);
    expect(botoes(htmlDaAgenda(dados({ consultas: [{ ...c, reagendamentos: 1 }] })))).toEqual(["Confirmar presença", "Ver minha agenda"]);
    expect(botoes(htmlDaAgenda(dados({ consultas: [c], regras: null })))).toEqual(["Confirmar presença", "Ver minha agenda"]);
    // confirmada e sem reagendar: só "Ver minha agenda" e o texto da reserva no singular
    const so = htmlDaAgenda(dados({ consultas: [{ ...c, status: "confirmado" }], regras: null }));
    expect(botoes(so)).toEqual(["Ver minha agenda"]);
    expect(so).toContain("O botão abre o app. Se não abrir, use o link:");
    expect(acoesDoEmailAgenda(dados({ consultas: [c] }))).toEqual({ confirmar: true, reagendar: true });
    expect(aguardaConfirmacao({ status: null })).toBe(true);
    expect(aguardaConfirmacao({ status: "paciente_confirmou" })).toBe(false);
  });

  it("\"Reagendar\" = a MESMA conta do app (mensagemReagendar(...).pode), em toda combinação de regra, vezes, mês e hoje", () => {
    const janelas: Janela[] = ["mes", "mes_seguinte", "livre"];
    const meses = ["2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01", "2027-01-01"];
    const hojes = ["2026-09-15", "2026-09-30", "2026-10-01", "2026-10-31", "2026-11-30", "2026-12-31"];
    let casos = 0;
    for (const janela of janelas) for (const max of [0, 1, 2, 3]) for (const vezes of [0, 1, 2, 3]) for (const mesRef of meses) for (const hoje of hojes) {
      const doApp = mensagemReagendar({ regras: { ...REGRAS_PADRAO, reagendamentos_max: max, janela_reagendamento: janela }, reagendamentos: vezes, mesRef, hoje, inicio: `${mesRef.slice(0, 8)}15T12:00:00Z` }).pode;
      expect(podeReagendarConsulta({ reagendamentos_max: max, janela_reagendamento: janela }, vezes, mesRef, hoje), `${janela} max=${max} vezes=${vezes} mes=${mesRef} hoje=${hoje}`).toBe(doApp);
      casos++;
    }
    expect(casos).toBe(1440);
  });

  it("as regras que vêm do banco ganham os padrões do app no que faltar; o mês da consulta", () => {
    expect(regrasDoReagendamento({ reagendamentos_max: 2, janela_reagendamento: "livre", slot_minutos: 30 })).toEqual({ reagendamentos_max: 2, janela_reagendamento: "livre" });
    expect(regrasDoReagendamento({ reagendamentos_max: "x", janela_reagendamento: "?" })).toEqual({ reagendamentos_max: REGRAS_PADRAO.reagendamentos_max, janela_reagendamento: REGRAS_PADRAO.janela_reagendamento });
    expect(regrasDoReagendamento(null)).toBeNull();
    expect(regrasDoReagendamento([1])).toBeNull();
    expect(mesDaConsulta({ inicio: "2026-11-01T01:00:00Z" })).toBe("2026-10-01"); // 22:00 de 31/10 em SP
    expect(mesDaConsulta({ inicio: "2026-11-20T12:00:00Z", mes_referencia: "2026-10-01" })).toBe("2026-10-01");
  });

  it("o tipo da consulta é o mesmo do app (tipoDe / tituloPadrao) e escolhe o ícone", () => {
    for (const m of ["treino", "nutricao", "geral", null, "outro"]) {
      expect(tipoDaConsulta(m)).toBe(tipoDe(m));
      expect(rotuloDoTipo(tipoDaConsulta(m))).toBe(tituloPadrao(tipoDe(m)));
    }
    const treino = modeloDaAgenda(dados({ consultas: [{ ...uma[0], titulo: null }] }));
    expect(treino.linhas.find((l) => l.rotulo === "Tipo")).toMatchObject({ icone: "halter", valor: "Consulta de treino" });
    expect(treino.destaques![0].olho).toBe("Consulta de treino");
    const titulo = modeloDaAgenda(dados());
    expect(titulo.destaques![0].olho).toBe("Avaliação física"); // o título que o profissional deu
    expect(titulo.preheader).toBe("Lucas Ferreira marcou uma consulta de treino para quinta, 15 de outubro, às 14:00. Confirme pelo app.");
    const geral = modeloDaAgenda(dados({ consultas: [{ ...uma[0], modulo: "geral" }] }));
    expect(geral.linhas.find((l) => l.rotulo === "Tipo")).toMatchObject({ icone: "lista", valor: "Consulta" });
  });

  it("várias consultas (até 10) num e-mail = um bloco por consulta; as linhas ficam com o tipo (se igual) e quem marcou", () => {
    const tres = [0, 7, 14].map((n, i) => ({ id: `x${i}`, inicio: new Date(Date.parse("2026-10-06T12:00:00Z") + n * 864e5).toISOString(), fim: new Date(Date.parse("2026-10-06T13:00:00Z") + n * 864e5).toISOString(), modulo: "treino", status: "agendado" }));
    const m = modeloDaAgenda(dados({ consultas: tres }));
    expect(m.destaques!.map((d) => `${d.visual.tipo === "calendario" ? `${d.visual.semana} ${d.visual.dia} ${d.visual.mes}` : ""} ${d.titulo} ${d.sub}`)).toEqual([
      "Ter 6 Out 09:00 até 10:00 · 1 h", "Ter 13 Out 09:00 até 10:00 · 1 h", "Ter 20 Out 09:00 até 10:00 · 1 h",
    ]);
    expect(m.rotulo).toBe("Convite de consultas");
    expect(m.linhas.map((l) => l.rotulo)).toEqual(["Tipo", "Com"]);
    expect(m.preheader).toBe("Lucas Ferreira marcou 3 consultas para você; a primeira é terça, 6 de outubro, às 09:00. Confirme pelo app.");
    const html = htmlDaAgenda(dados({ consultas: tres }));
    expect([...html.matchAll(/>Ter<\/td>/g)]).toHaveLength(3);
    expect(html).toContain("marcou estas 3 consultas para você.");
    const mistas = modeloDaAgenda(dados({ consultas: [tres[0], { ...tres[1], modulo: "nutricao" }] }));
    expect(mistas.linhas.map((l) => l.rotulo)).toEqual(["Com"]);
    expect(consultasDoEmail(Array.from({ length: 12 }, () => uma[0]))).toHaveLength(10);
  });

  it("HTML escapado (nome do aluno, de quem marcou e o título) e a versão em texto", () => {
    const d = dados({ aluno: "Ana <b>Lima</b>", quem: "Lucas & Cia", consultas: [{ ...uma[0], titulo: "<i>Retorno</i>" }], link: linkDaAgenda("public", null) });
    const html = htmlDaAgenda(d);
    expect(html).not.toContain("<b>Lima</b>");
    expect(html).not.toContain("<i>Retorno</i>");
    expect(html).toContain("&lt;i&gt;Retorno&lt;/i&gt;");
    expect(html).toContain("Lucas &amp; Cia");
    expect(html).toContain('href="https://physiqcalc.com.br/perfil/agenda"');
    const texto = textoDaAgenda(d);
    expect(texto).toContain("- Quinta, 15 de outubro · 14:00 (1 h) · <i>Retorno</i>");
    expect(texto).toContain("Abra o app para confirmar a presença ou reagendar: https://physiqcalc.com.br/perfil/agenda");
    expect(texto).toContain("Você recebeu este e-mail porque é aluno de Lucas & Cia no Physiq.");
    expect(textoDaAgenda(dados({ consultas: [{ ...uma[0], status: "confirmado" }], regras: null }))).toContain("Veja na sua agenda do app: ");
    expect(linkDaAgenda("staging", "https://physiqcalc.com.br")).toBe("https://physiqcalc-staging.vercel.app/perfil/agenda");
  });

  it("o que vem do banco é filtrado (no máximo 10), ganha os detalhes pelo id e os erros viram status", () => {
    expect(consultasDoEmail([{ inicio: "x", fim: "y" }, ...uma, null])).toHaveLength(1);
    expect(consultasDoEmail(uma)[0]).toMatchObject({ id: "a1", modulo: "treino" });
    const det = consultasComDetalhes(consultasDoEmail(uma), [{ id: "a1", status: "confirmado", reagendamentos: 1, mes_referencia: "2026-10-01" }, { id: "zz", status: "agendado" }]);
    expect(det[0]).toMatchObject({ status: "confirmado", reagendamentos: 1, mes_referencia: "2026-10-01" });
    expect(consultasComDetalhes(consultasDoEmail(uma), null)[0].status).toBeUndefined();
    expect(statusDoErroAgenda("sem_acesso")).toBe(403);
    expect(statusDoErroAgenda("outro")).toBe(400);
  });
});
