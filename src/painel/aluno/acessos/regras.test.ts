import { describe, expect, it } from "vitest";
import type { AcessosDoAluno } from "@/acessos/tipos";
import {
  LINHAS_DE_ACESSO, TEXTOS, avisoDaLinha, comNivel, confirmacaoDoBloqueio, dicaDaLinha, estadoDasSeries, linhasVisiveis, nivelDaLinha, pedeConfirmacao,
  resumoDosAcessos, textoDaMudanca, type EstadoDasSeries,
} from "./regras";

const acessos = (o: Partial<AcessosDoAluno> = {}): AcessosDoAluno => ({
  paciente_id: "p1", tem_login: true, modulos: ["treino", "nutricao"], conta_modulos: ["treino", "nutricao"], tem_nutricionista: true, pode_mudar: true,
  linhas: { acesso_app: "liberado", diario_alimentar: "liberado", acesso_link: "liberado", dieta: "ver" }, mudancas: {}, ...o,
});
const frase = (c: string) => `frase:${c}`;
const pronto = (series: "ver" | "mexer"): EstadoDasSeries => ({ tipo: "pronto", series, podeMudar: true });

describe("W-A P4 — as 6 linhas da aba Acessos (spec §4.1)", () => {
  it("a ordem e os níveis da tabela da spec (com a cor: neutro · azul · verde)", () => {
    expect(LINHAS_DE_ACESSO.map((l) => l.chave)).toEqual(["acesso_app", "treino_series", "dieta", "diario_alimentar", "acesso_link", "rotinas"]);
    expect(LINHAS_DE_ACESSO.map((l) => l.rotulo)).toEqual([
      "Acesso ao app", "Treino — séries", "Dieta", "Diário alimentar com fotos", "Envio de fotos pelo link", "Rotinas",
    ]);
    const niveis = Object.fromEntries(LINHAS_DE_ACESSO.map((l) => [l.chave, l.niveis.map((n) => `${n.rotulo}/${n.tom}`)]));
    expect(niveis.acesso_app).toEqual(["Bloqueado/neutro", "Liberado/verde"]);
    expect(niveis.treino_series).toEqual(["Só ver/azul", "Pode mexer/verde"]);
    expect(niveis.dieta).toEqual(["Só ver/azul", "Pode mexer/verde"]);
    expect(niveis.rotinas).toEqual(["Sempre liberadas/verde"]);
  });

  it("quando aparece: as séries só com Treino; o diário e o link só com nutricionista de verdade; o resto sempre", () => {
    expect(linhasVisiveis(acessos()).map((l) => l.chave)).toEqual(["acesso_app", "treino_series", "dieta", "diario_alimentar", "acesso_link", "rotinas"]);
    expect(linhasVisiveis(acessos({ modulos: ["nutricao"] })).map((l) => l.chave)).toEqual(["acesso_app", "dieta", "diario_alimentar", "acesso_link", "rotinas"]);
    expect(linhasVisiveis(acessos({ modulos: ["treino"], tem_nutricionista: false })).map((l) => l.chave)).toEqual(["acesso_app", "treino_series", "dieta", "rotinas"]);
  });

  it("a dica das rotinas só aponta para o card Rotinas do Resumo quando ele existe (a P6)", () => {
    const rotinas = LINHAS_DE_ACESSO.find((l) => l.chave === "rotinas")!;
    expect(dicaDaLinha(rotinas, false)).toBe("Ele cria, muda e apaga as rotinas dele (creatina, remédio…).");
    expect(dicaDaLinha(rotinas, true)).toBe("Ele cria, muda e apaga as rotinas dele (creatina, remédio…). As suas você cria no card Rotinas do Resumo.");
    expect(dicaDaLinha(LINHAS_DE_ACESSO[0], true)).toBe(LINHAS_DE_ACESSO[0].dica);
  });

  it("os avisos: sem login no app; o link sem o diário; as séries antes do 1º acesso, de outra conta ou com erro", () => {
    expect(avisoDaLinha("acesso_app", acessos({ tem_login: false }))).toBe("Ele ainda não tem login: crie o acesso em Login do aluno.");
    expect(avisoDaLinha("acesso_app", acessos())).toBeNull();
    expect(avisoDaLinha("acesso_link", acessos({ linhas: { ...acessos().linhas, diario_alimentar: "bloqueado" } }))).toBe("Vale quando o diário estiver liberado.");
    expect(avisoDaLinha("acesso_link", acessos())).toBeNull();
    expect(avisoDaLinha("treino_series", acessos(), { tipo: "antes_do_acesso" })).toBe("Vale depois do 1º acesso do aluno ao app.");
    expect(avisoDaLinha("treino_series", acessos(), { tipo: "outra_conta" })).toBe(TEXTOS.seriesOutraConta);
    expect(avisoDaLinha("treino_series", acessos(), { tipo: "erro", mensagem: "Não deu para ler o Treino agora." })).toBe("Não deu para ler o Treino agora.");
    expect(avisoDaLinha("treino_series", acessos(), pronto("ver"))).toBeNull();
  });
});

describe("W-A P4 — a linha das séries carrega à parte (Banco do Treino)", () => {
  const erro = (codigo: string) => ({ isLoading: false, isError: true, error: { codigo }, data: undefined });
  it("sem Treino a linha some; carregando; pronto com o nível e quem muda", () => {
    expect(estadoDasSeries(false, { isLoading: true, isError: false, error: null }, frase)).toEqual({ tipo: "fora" });
    expect(estadoDasSeries(true, { isLoading: true, isError: false, error: null }, frase)).toEqual({ tipo: "carregando" });
    expect(estadoDasSeries(true, { isLoading: false, isError: false, error: null, data: { series: "ver", pode_mudar: false } }, frase))
      .toEqual({ tipo: "pronto", series: "ver", podeMudar: false });
  });

  it("sem_treino = antes do 1º acesso; sem_acesso = o Treino de outra conta; o resto = o erro da linha (com a frase só nos códigos que explicam)", () => {
    expect(estadoDasSeries(true, erro("sem_treino"), frase)).toEqual({ tipo: "antes_do_acesso" });
    expect(estadoDasSeries(true, erro("sem_acesso"), frase)).toEqual({ tipo: "outra_conta" });
    expect(estadoDasSeries(true, erro("principal_indisponivel"), frase)).toEqual({ tipo: "erro", mensagem: "Não deu para ler o Treino agora." });
    expect(estadoDasSeries(true, erro("rede"), frase)).toEqual({ tipo: "erro", mensagem: "Não deu para ler o Treino agora." });
    expect(estadoDasSeries(true, erro("sem_internet"), frase)).toEqual({ tipo: "erro", mensagem: "frase:sem_internet" });
    expect(estadoDasSeries(true, { isLoading: false, isError: true, error: new Error("x") }, frase)).toEqual({ tipo: "erro", mensagem: "Não deu para ler o Treino agora." });
  });

  it("o nível marcado de cada linha (as séries só quando prontas; as rotinas sempre)", () => {
    const l = acessos().linhas;
    expect(nivelDaLinha("acesso_app", l, pronto("ver"))).toBe("liberado");
    expect(nivelDaLinha("dieta", l, pronto("ver"))).toBe("ver");
    expect(nivelDaLinha("treino_series", l, pronto("mexer"))).toBe("mexer");
    expect(nivelDaLinha("treino_series", l, { tipo: "carregando" })).toBeNull();
    expect(nivelDaLinha("rotinas", l, { tipo: "fora" })).toBe("sempre");
  });
});

describe("W-A P4 — o 'Mudado por', o resumo do rodapé e o ✓ otimista", () => {
  it("'Mudado por Ana em 12/10 17:20' no horário de São Paulo; sem o nome (o servidor), 'Mudado em'; sem mudança, nada", () => {
    expect(textoDaMudanca({ de: "liberado", para: "bloqueado", em: "2026-10-12T20:20:00Z", por_nome: "Ana Paula Souza" })).toBe("Mudado por Ana em 12/10 17:20");
    expect(textoDaMudanca({ de: "ver", para: "mexer", em: "2026-10-13T02:05:00Z", por_nome: null })).toBe("Mudado em 12/10 23:05");
    expect(textoDaMudanca(undefined)).toBeNull();
    expect(textoDaMudanca({ de: "a", para: "b", em: "não é data", por_nome: "Ana" })).toBeNull();
  });

  it("o resumo: 'App liberado · séries: pode mexer · dieta: só ver · rotinas sempre' (o exemplo da spec) e as variações", () => {
    expect(resumoDosAcessos(acessos(), pronto("mexer"))).toBe("App liberado · séries: pode mexer · dieta: só ver · rotinas sempre");
    expect(resumoDosAcessos(acessos({ linhas: { ...acessos().linhas, acesso_app: "bloqueado", dieta: "mexer" } }), pronto("ver")))
      .toBe("App bloqueado · séries: só ver · dieta: pode mexer · rotinas sempre");
    expect(resumoDosAcessos(acessos({ tem_login: false, tem_nutricionista: false }), { tipo: "antes_do_acesso" })).toBe("App sem login · rotinas sempre");
  });

  it("o ✓ otimista troca só a chave escolhida; só 'App: Bloqueado' pede confirmação (com o nome)", () => {
    const d = acessos();
    const novo = comNivel(d, "dieta", "mexer");
    expect(novo.linhas).toEqual({ ...d.linhas, dieta: "mexer" });
    expect(novo.mudancas).toBe(d.mudancas);
    expect(pedeConfirmacao("acesso_app", "bloqueado")).toBe(true);
    expect(pedeConfirmacao("acesso_app", "liberado")).toBe(false);
    expect(pedeConfirmacao("diario_alimentar", "bloqueado")).toBe(false);
    expect(confirmacaoDoBloqueio("Rafael Moura").titulo).toBe("Bloquear o app de Rafael?");
    expect(confirmacaoDoBloqueio(null).titulo).toBe("Bloquear o app do aluno?");
  });
});
