import { describe, expect, it } from "vitest";
import { dataCurta, mesAno, num, rotuloAutor, rotuloSessao, variacaoAbs, variacaoComSinal } from "./formato";
import {
  avaliacaoDoPrincipal,
  avaliacaoDoTreino,
  avaliacoesDaTabela,
  classificacaoDe,
  comparacaoInicial,
  eixoDeMeses,
  fotoDoSlot,
  hojeSP,
  kpisDaSerie,
  linhasDaTabela,
  medidasPorGrupo,
  metricaDoMusculo,
  modoInicialDaTabela,
  montarSerie,
  noPeriodo,
  periodoDaTabela,
  periodoInicial,
  pontosDe,
  posicoesComFotos,
  resumoDoPeriodo,
  sentidoDoObjetivo,
  serieVazia,
  sessoesComPosicao,
  somarMeses,
  tomDaVariacao,
  ultimaAvaliacao,
  variacaoDaMetrica,
} from "./serie";
import type { AntropometriaPrincipal, Autor, FotoPrincipal, LinhaFotoTreino, LinhaTreino } from "./tipos";

const HOJE = "2026-09-30";
const LUCAS: Autor = { id: "u-lucas", nome: "Lucas Ferreira", papel: "personal" };

function linhaTreino(extra: LinhaTreino): LinhaTreino {
  return { id: `a-${String(extra.data_avaliacao)}`, created_at: `${String(extra.data_avaliacao)}T12:00:00Z`, ...extra };
}

function antropo(extra: Partial<AntropometriaPrincipal>): AntropometriaPrincipal {
  return {
    id: `n-${extra.data}`,
    data: "2026-05-28",
    peso: 88.4,
    altura: 178,
    sexo: "masculino",
    idade: 31,
    circunferencias: null,
    dobras: null,
    protocolo: "pollock3",
    resultados: { percentual_gordura: 20.9, massa_gorda: 18.48, massa_magra: 69.92, imc: 27.9, classificacao_imc: "Sobrepeso" },
    autor_id: "u-camila",
    autor_nome: "Camila Rocha",
    criado_em: "2026-05-28T15:00:00Z",
    ...extra,
  };
}

const PERFIL: LinhaTreino = {
  id: "t-diego",
  sexo: "male",
  idade: 31,
  peso: 84.2,
  altura: 178,
  metodo_avaliacao: "dobras_7",
  percentual_gordura: 17.8,
  massa_gorda: 14.99,
  massa_magra: 69.21,
  tmb_mifflin: 1822,
  tmb_katch: 1865,
  tmb_metodo: "katch",
  dobra_1: 12, dobra_2: 14, dobra_3: 10, dobra_4: 13, dobra_5: 22, dobra_6: 18, dobra_7: 15,
  medida_cintura: 84, medida_braco_d: 37.5,
};

describe("formato", () => {
  it("números com vírgula e variações", () => {
    expect(num(84.25)).toBe("84,3");
    expect(num(null)).toBe("—");
    expect(num(1850, 0)).toBe("1.850");
    expect(num(-6.14)).toBe("-6,1");
    expect(num(118)).toBe("118,0");
    expect(variacaoAbs(-6.14)).toBe("6,1");
    expect(variacaoComSinal(1.8)).toBe("+1,8");
    expect(variacaoComSinal(-6.1)).toBe("−6,1");
    expect(variacaoComSinal(0.01)).toBe("0,0");
  });
  it("datas e autor", () => {
    expect(dataCurta("2026-06-14")).toBe("14/06");
    expect(mesAno("2026-09-01")).toBe("Setembro 2026");
    expect(rotuloSessao({ data: "2026-08-26", mensal: false })).toBe("26/08/2026");
    expect(rotuloAutor(LUCAS)).toBe("Lucas Ferreira, seu personal");
    expect(rotuloAutor({ id: null, nome: "Camila Rocha", papel: "nutricionista" })).toBe("Camila Rocha, nutricionista");
    expect(rotuloAutor({ id: null, nome: null, papel: "personal" })).toBe("Seu personal");
  });
});

describe("avaliação do Banco do Treino (Calc)", () => {
  it("7 dobras: título, tipo, dobras com os rótulos do Calc, TMB escolhida e medidas", () => {
    const a = avaliacaoDoTreino(linhaTreino({ ...PERFIL, id: "x", data_avaliacao: "2026-09-22" }), { perfil: PERFIL, autor: LUCAS });
    expect(a.titulo).toBe("Avaliação por 7 dobras");
    expect(a.tipo).toBe("7 dobras");
    expect(a.dobras.map((d) => d.rotulo)).toEqual(["Peitoral", "Axilar média", "Tríceps", "Subescapular", "Abdômen", "Supra-ilíaca", "Coxa"]);
    expect(a.tmb).toEqual({ metodo: "katch", rotulo: "Katch-McArdle", valor: 1865 });
    expect(a.medidas).toEqual({ medida_cintura: 84, medida_braco_d: 37.5 });
    expect(a.sexo).toBe("M");
    expect(a.idade).toBe(31);
    expect(a.autor).toBe(LUCAS);
    expect(a.massaMuscular).toBeNull(); // balança só na bioimpedância
  });

  it("bioimpedância traz os dados da balança; sem % de gordura não é '3 dobras' (a regra da tela antiga)", () => {
    const bio = avaliacaoDoTreino(linhaTreino({ data_avaliacao: "2026-09-25", peso: 83, percentual_gordura: 15, metodo_avaliacao: "bioimpedancia", massa_muscular: 38.4, agua_corporal: 56, gordura_visceral: 7, tmb_balanca: 1850, tmb_metodo: "balanca" }), { perfil: null, autor: LUCAS });
    expect(bio.titulo).toBe("Avaliação por bioimpedância");
    expect(bio.tipo).toBe("Bioimpedância");
    expect([bio.massaMuscular, bio.agua, bio.visceral]).toEqual([38.4, 56, 7]);
    expect(bio.tmb?.rotulo).toBe("Balança");
    expect(bio.dobras).toEqual([]);
    const soMedidas = avaliacaoDoTreino(linhaTreino({ data_avaliacao: "2026-07-17", medida_cintura: 90 }), { perfil: null, autor: LUCAS });
    expect(soMedidas.titulo).toBe("Medidas corporais");
    const semMetodo = avaliacaoDoTreino(linhaTreino({ data_avaliacao: "2026-08-01", peso: 84, percentual_gordura: 8.9 }), { perfil: null, autor: LUCAS });
    expect(semMetodo.tipo).toBe("3 dobras"); // registro sem método (antes de 25/09) é de 3 dobras
  });
});

describe("antropometria do banco principal (Nutri)", () => {
  it("protocolo, % e massas dos resultados, IMC, tórax = peitoral, dobras do Nutri e a autora", () => {
    const a = avaliacaoDoPrincipal(antropo({ data: "2026-05-28", circunferencias: { torax: 101, cintura: 88.5, abdomen: 91, quadril: 100 }, dobras: { triceps: 11, suprailiaca: 18, abdominal: 24 } }));
    expect(a.id).toBe("principal:n-2026-05-28");
    expect(a.titulo).toBe("Avaliação por 3 dobras");
    expect(a.tipo).toBe("Jackson & Pollock — 3 dobras");
    expect([a.gordura, a.massaGorda, a.massaMagra, a.imc]).toEqual([20.9, 18.48, 69.92, 27.9]);
    expect(a.classificacaoImc).toBe("Sobrepeso");
    expect(a.medidas).toEqual({ medida_peitoral: 101, medida_cintura: 88.5, medida_abdomen: 91, medida_quadril: 100 });
    // Pollock 3 masculino mede peitoral, abdominal e coxa (nessa ordem); as outras que vierem vão depois
    expect(a.dobras.map((d) => d.rotulo)).toEqual(["Abdominal", "Tríceps", "Suprailíaca"]);
    const p3 = avaliacaoDoPrincipal(antropo({ dobras: { coxa: 17, abdominal: 24, peitoral: 14 } }));
    expect(p3.dobras.map((d) => d.rotulo)).toEqual(["Peitoral", "Abdominal", "Coxa"]);
    expect(a.autor).toEqual({ id: "u-camila", nome: "Camila Rocha", papel: "nutricionista" });
    expect(a.observacao).toBeNull();
    expect(a.sexo).toBe("M");
  });

  it("sem protocolo = Antropometria (só medidas); altura em metros vira cm", () => {
    const a = avaliacaoDoPrincipal(antropo({ protocolo: "nenhum", altura: 1.78, resultados: { imc: 26 }, circunferencias: { cintura: 85 } }));
    expect(a.titulo).toBe("Antropometria");
    expect(a.metodo).toBe("medidas");
    expect(a.altura).toBe(178);
    expect(a.dobras).toEqual([]);
  });
});

describe("série única dos 2 bancos", () => {
  const treino = {
    perfil: PERFIL,
    avaliacoes: [
      linhaTreino({ data_avaliacao: "2026-03-14", peso: 90.3, percentual_gordura: 22.4, massa_magra: 70.07, metodo_avaliacao: "dobras_7" }),
      linhaTreino({ data_avaliacao: "2026-06-14", peso: 86.3, percentual_gordura: 19.4, massa_magra: 69.56, metodo_avaliacao: "dobras_7" }),
      linhaTreino({ data_avaliacao: "2026-09-22", peso: 84.5, percentual_gordura: 17.9, massa_magra: 69.4, metodo_avaliacao: "dobras_7", observacao: "Bom mês" }),
    ],
    fotos: [
      { id: "f1", mes_ref: "2026-09-01", tipo: "frente", storage_path: "t/2026-09/frente.jpg", url: "https://x/1" },
      { id: "f2", mes_ref: "2026-09-01", tipo: "lateral_direita", storage_path: "t/2026-09/lateral_direita.jpg", url: "https://x/2" },
      { id: "f3", mes_ref: "2026-06-01", tipo: "frente", storage_path: "t/2026-06/frente.jpg", url: "https://x/3" },
    ] as LinhaFotoTreino[],
  };
  const principal = {
    objetivo: "definição",
    antropometrias: [antropo({ data: "2026-05-28" }), antropo({ data: "2026-08-26", peso: 84.9, resultados: { percentual_gordura: 18.2, massa_gorda: 15.45, massa_magra: 69.45 } })],
    fotos: [
      { id: "p1", data: "2026-08-26", posicao: "frente", path: "n/p/1.jpg", autor_id: "u-camila", autor_nome: "Camila Rocha", criado_em: "2026-08-26T15:00:00Z", url: "https://y/1" },
      { id: "p2", data: "2026-08-26", posicao: "lado_e", path: "n/p/2.jpg", autor_id: "u-camila", autor_nome: "Camila Rocha", criado_em: "2026-08-26T15:00:00Z", url: "https://y/2" },
    ] as FotoPrincipal[],
  };
  const s = montarSerie({ treino, principal, personal: { id: "u-lucas", nome: "Lucas Ferreira" } });

  it("junta em ordem de data, com o autor de cada uma — nada copiado, só somado", () => {
    expect(s.avaliacoes.map((a) => `${a.data} ${a.origem} ${a.autor.nome}`)).toEqual([
      "2026-03-14 treino Lucas Ferreira",
      "2026-05-28 principal Camila Rocha",
      "2026-06-14 treino Lucas Ferreira",
      "2026-08-26 principal Camila Rocha",
      "2026-09-22 treino Lucas Ferreira",
    ]);
    expect(s.objetivo).toBe("definição");
  });

  it("a última do Treino fica com os números ATUAIS do perfil (o que a tela antiga mostrava); a data e a observação são da linha", () => {
    const u = ultimaAvaliacao(s)!;
    expect(u.origem).toBe("treino");
    expect(u.atual).toBe(true);
    expect([u.peso, u.gordura, u.massaMagra]).toEqual([84.2, 17.8, 69.21]);
    expect(u.data).toBe("2026-09-22");
    expect(u.observacao).toBe("Bom mês");
    expect(u.tmb?.valor).toBe(1865);
    // as anteriores ficam como foram gravadas
    expect(s.avaliacoes[2].peso).toBe(86.3);
    expect(s.avaliacoes[2].atual).toBeUndefined();
  });

  it("período, cards e variação (a regra da tela 4)", () => {
    expect(somarMeses("2026-09-30", -6)).toBe("2026-03-30");
    expect(somarMeses("2026-03-31", -1)).toBe("2026-02-28");
    expect(noPeriodo(s.avaliacoes, "6m", HOJE).map((a) => a.data)).toEqual(["2026-05-28", "2026-06-14", "2026-08-26", "2026-09-22"]);
    expect(noPeriodo(s.avaliacoes, "tudo", HOJE)).toHaveLength(5);
    const [peso, gordura, musculo] = kpisDaSerie(s, "6m", HOJE);
    expect(peso.valor).toBe(84.2);
    expect(peso.variacao).toBeCloseTo(-4.2, 5); // 88,4 (28/05) → 84,2
    expect(peso.tom).toBe("bom"); // objetivo "definição": peso descendo é bom
    expect(gordura.variacao).toBeCloseTo(-3.1, 5);
    expect(gordura.unidadeVariacao).toBe("pts");
    expect(gordura.tom).toBe("bom");
    expect(musculo.titulo).toBe("M. magra"); // 7 dobras não mede músculo; a balança mede
    expect(musculo.metrica).toBe("massaMagra");
    const [peso1a] = kpisDaSerie(s, "1a", HOJE);
    expect(peso1a.variacao).toBeCloseTo(-6.1, 5); // 90,3 → 84,2 (a tela 4)
  });

  it("peso sem objetivo claro fica neutro; gordura subindo é ruim; músculo subindo é bom", () => {
    expect(sentidoDoObjetivo("Hipertrofia")).toBe("ganhar");
    expect(sentidoDoObjetivo("Emagrecimento")).toBe("perder");
    expect(sentidoDoObjetivo("perder gordura e ganhar massa")).toBeNull();
    expect(sentidoDoObjetivo(null)).toBeNull();
    expect(tomDaVariacao("peso", -2, null)).toBe("neutro");
    expect(tomDaVariacao("peso", 2, "hipertrofia")).toBe("bom");
    expect(tomDaVariacao("gordura", 1, null)).toBe("ruim");
    expect(tomDaVariacao("massaMuscular", 1.8, null)).toBe("bom");
    expect(tomDaVariacao("medida_cintura", -2, null)).toBe("bom");
    expect(tomDaVariacao("medida_braco_d", -1, null)).toBe("ruim");
    expect(tomDaVariacao("gordura", 0.01, null)).toBe("neutro");
  });

  it("abre no 6M; com menos de 2 pesos no 6M e mais no último ano, abre no 1A", () => {
    expect(periodoInicial(s, HOJE)).toBe("6m");
    const rala = montarSerie({
      treino: { perfil: null, fotos: [], avaliacoes: [linhaTreino({ data_avaliacao: "2025-12-01", peso: 90 }), linhaTreino({ data_avaliacao: "2026-02-01", peso: 88 }), linhaTreino({ data_avaliacao: "2026-08-01", peso: 86 })] },
      principal: null,
      personal: null,
    });
    expect(periodoInicial(rala, HOJE)).toBe("1a");
  });

  it("eixo dos meses: 6M = Abr…Set (o mês que mal aparece fica sem rótulo), 3M = Jul, Ago, Set; 1A não passa de 7", () => {
    expect(eixoDeMeses({ inicio: "2026-03-30", fim: HOJE }).map((m) => m.rotulo)).toEqual(["Abr", "Mai", "Jun", "Jul", "Ago", "Set"]);
    expect(eixoDeMeses({ inicio: "2026-06-30", fim: HOJE }).map((m) => m.rotulo)).toEqual(["Jul", "Ago", "Set"]);
    const ano = eixoDeMeses({ inicio: "2025-09-30", fim: HOJE });
    expect(ano.length).toBeLessThanOrEqual(7);
    expect(ano[ano.length - 1].rotulo).toBe("Set");
    for (const m of eixoDeMeses({ inicio: "2026-03-30", fim: HOJE })) expect(m.x).toBeGreaterThan(0);
  });

  it("tabela: a mais recente primeiro, a variação desde a anterior que tem a métrica (as 2 origens juntas)", () => {
    const linhas = linhasDaTabela(s.avaliacoes, ["peso", "gordura"], s.objetivo);
    expect(linhas.map((l) => l.av.data)).toEqual(["2026-09-22", "2026-08-26", "2026-06-14", "2026-05-28", "2026-03-14"]);
    expect(linhas[0].celulas.peso?.valor).toBe(84.2);
    expect(linhas[0].celulas.peso?.delta).toBeCloseTo(-0.7, 5); // 84,9 (nutri, 26/08) → 84,2
    expect(linhas[0].celulas.peso?.tom).toBe("bom");
    expect(linhas[4].celulas.peso?.delta).toBeNull();
    const resumo = resumoDoPeriodo(s.avaliacoes, "tudo", HOJE, s.objetivo);
    const rPeso = resumo.find((r) => r.metrica === "peso")!;
    expect([rPeso.primeira, rPeso.ultima]).toEqual([90.3, 84.2]);
    expect(rPeso.delta).toBeCloseTo(-6.1, 5);
    expect(resumo.some((r) => r.metrica === "medida_cintura")).toBe(true);
  });

  it("hotfix W10: a tabela abre com as do PERÍODO (o N do botão) e o resumo usa a MESMA conta dos cards; 'todas' = o histórico", () => {
    // 6M (desde 30/03): 28/05 (nutri), 14/06, 26/08 (nutri), 22/09 — o 14/03 fica de fora
    expect(modoInicialDaTabela(s, "6m", HOJE)).toBe("periodo");
    const doPeriodo = avaliacoesDaTabela(s, "6m", HOJE, "periodo");
    expect(doPeriodo.map((a) => a.data)).toEqual(["2026-05-28", "2026-06-14", "2026-08-26", "2026-09-22"]);
    expect(doPeriodo).toHaveLength(noPeriodo(s.avaliacoes, "6m", HOJE).length); // o N do botão da tela
    const todas = avaliacoesDaTabela(s, "6m", HOJE, "todas");
    expect(todas).toHaveLength(5);
    expect(periodoDaTabela("6m", "todas")).toBe("tudo");
    for (const [periodo, modo] of [["6m", "periodo"], ["1a", "periodo"], ["3m", "periodo"], ["6m", "todas"]] as const) {
      const efetivo = periodoDaTabela(periodo, modo);
      const [peso, gordura] = kpisDaSerie(s, efetivo, HOJE);
      const resumo = resumoDoPeriodo(s.avaliacoes, efetivo, HOJE, s.objetivo);
      expect(resumo.find((r) => r.metrica === "peso")?.delta).toBe(peso.variacao);
      expect(resumo.find((r) => r.metrica === "gordura")?.delta).toBe(gordura.variacao);
      expect(resumo.find((r) => r.metrica === "peso")?.delta).toBe(variacaoDaMetrica(s.avaliacoes, "peso", efetivo, HOJE).delta);
    }
    // 6M: 88,4 (28/05) → 84,2 = −4,2 no card E no resumo; todas: 90,3 → 84,2 = −6,1
    const r6 = resumoDoPeriodo(s.avaliacoes, "6m", HOJE, s.objetivo).find((r) => r.metrica === "peso")!;
    expect([r6.primeira, r6.ultima]).toEqual([88.4, 84.2]);
    expect(r6.delta).toBeCloseTo(-4.2, 5);
    const rTodas = resumoDoPeriodo(s.avaliacoes, "tudo", HOJE, s.objetivo).find((r) => r.metrica === "peso")!;
    expect(rTodas.delta).toBeCloseTo(-6.1, 5);
    // o resumo do período só lista as métricas que o período tem
    expect(resumoDoPeriodo(s.avaliacoes, "3m", HOJE, s.objetivo).every((r) => r.primeira !== null)).toBe(true);
  });

  it("hotfix W10: período sem nenhuma avaliação abre direto em 'todas'", () => {
    const antiga = montarSerie({ treino: { perfil: null, fotos: [], avaliacoes: [linhaTreino({ data_avaliacao: "2025-11-10", peso: 80 }), linhaTreino({ data_avaliacao: "2025-12-10", peso: 79 })] }, principal: null, personal: null });
    expect(avaliacoesDaTabela(antiga, "6m", HOJE, "periodo")).toHaveLength(0);
    expect(modoInicialDaTabela(antiga, "6m", HOJE)).toBe("todas");
    expect(avaliacoesDaTabela(antiga, "6m", HOJE, modoInicialDaTabela(antiga, "6m", HOJE))).toHaveLength(2);
    expect(modoInicialDaTabela(antiga, "1a", HOJE)).toBe("periodo");
  });

  it("fotos: por data e origem (a mais recente primeiro); Lado = direito, senão o esquerdo; Comparar começa em penúltima × última", () => {
    expect(s.sessoes.map((x) => x.chave)).toEqual(["treino:2026-09-01", "principal:2026-08-26", "treino:2026-06-01"]);
    expect(s.sessoes[0].mensal).toBe(true);
    expect(fotoDoSlot(s.sessoes[0], "lado")?.posicao).toBe("lado_d");
    expect(fotoDoSlot(s.sessoes[1], "lado")?.posicao).toBe("lado_e");
    expect(fotoDoSlot(s.sessoes[0], "costas")).toBeNull();
    expect(fotoDoSlot(s.sessoes[1], "frente")?.autor.nome).toBe("Camila Rocha");
    expect(posicoesComFotos(s.sessoes)).toEqual(["frente", "lado_d", "lado_e"]);
    expect(sessoesComPosicao(s.sessoes, "frente").map((x) => x.chave)).toEqual(["treino:2026-09-01", "principal:2026-08-26", "treino:2026-06-01"]);
    expect(comparacaoInicial(s.sessoes, "frente")).toEqual({ antes: "principal:2026-08-26", depois: "treino:2026-09-01" });
    expect(comparacaoInicial(s.sessoes, "lado_e")).toEqual({ antes: "principal:2026-08-26", depois: "principal:2026-08-26" });
  });
});

describe("paridade com a tela antiga (UserDashboard) — aluno só do Calc", () => {
  // o que o teste@teste.com tem no staging: 3 registros vazios, 1 de 3 dobras e 1 de bioimpedância + o perfil
  const perfil: LinhaTreino = { id: "t", sexo: "male", idade: 29, peso: 83, altura: 178, metodo_avaliacao: "bioimpedancia", percentual_gordura: 15, massa_gorda: 12.4, massa_magra: 70.5, massa_muscular: 38.4, agua_corporal: 56, gordura_visceral: 7, tmb_balanca: 1850, tmb_metodo: "balanca", tmb_mifflin: 1810 };
  const s = montarSerie({
    treino: {
      perfil,
      fotos: [],
      avaliacoes: [
        linhaTreino({ id: "v1", data_avaliacao: "2026-07-17" }),
        linhaTreino({ id: "v2", data_avaliacao: "2026-07-17" }),
        linhaTreino({ id: "v3", data_avaliacao: "2026-07-17" }),
        linhaTreino({ data_avaliacao: "2026-08-01", peso: 84, percentual_gordura: 8.9, massa_gorda: 7.5, massa_magra: 76.5 }),
        linhaTreino({ data_avaliacao: "2026-09-25", peso: 83, percentual_gordura: 15, massa_gorda: 12.4, massa_magra: 70.5, metodo_avaliacao: "bioimpedancia", massa_muscular: 38.4, agua_corporal: 56, gordura_visceral: 7, tmb_balanca: 1850, tmb_metodo: "balanca" }),
      ],
    },
    principal: { objetivo: null, antropometrias: [], fotos: [] },
    personal: { id: "p", nome: "Admin Teste" },
  });

  it("o 'Ver' da última mostra os números da Composição Corporal antiga (perfil) e a Classificação 'Boa Forma'", () => {
    const u = ultimaAvaliacao(s)!;
    expect(u.data).toBe("2026-09-25");
    expect([u.sexo, u.idade, u.peso, u.altura]).toEqual(["M", 29, 83, 178]);
    expect([u.tipo, u.gordura, u.massaGorda, u.massaMagra, u.massaMuscular, u.agua, u.visceral]).toEqual(["Bioimpedância", 15, 12.4, 70.5, 38.4, 56, 7]);
    expect(u.tmb).toEqual({ metodo: "balanca", rotulo: "Balança", valor: 1850 });
    expect(classificacaoDe(u)?.label).toBe("Boa Forma");
    expect(metricaDoMusculo(s)).toBe("massaMuscular");
  });

  it("variação arredondada 1 vez só, como a tela antiga: 15 − 8,9476 = 6,05… → '+6,1'", () => {
    const l = linhasDaTabela(
      montarSerie({ treino: { perfil: null, fotos: [], avaliacoes: [linhaTreino({ data_avaliacao: "2026-08-01", percentual_gordura: 8.947643252857684 }), linhaTreino({ data_avaliacao: "2026-09-25", percentual_gordura: 15 })] }, principal: null, personal: null }).avaliacoes,
      ["gordura"],
    );
    expect(variacaoComSinal(l[0].celulas.gordura?.delta)).toBe("+6,1");
  });

  it("a tabela tem as 5 avaliações (as vazias também, como a linha do tempo antiga) e a variação da última (−1,0 kg · +6,1 pts)", () => {
    const linhas = linhasDaTabela(s.avaliacoes, ["peso", "gordura", "massaMagra", "massaGorda"]);
    expect(linhas).toHaveLength(5);
    expect(linhas[0].celulas.peso?.delta).toBeCloseTo(-1, 5);
    expect(linhas[0].celulas.gordura?.delta).toBeCloseTo(6.1, 5);
    expect(linhas[0].celulas.massaGorda?.delta).toBeCloseTo(4.9, 5);
    expect(linhas[0].celulas.massaMagra?.delta).toBeCloseTo(-6, 5);
    expect(linhas[4].celulas.peso?.valor).toBeNull();
  });

  it("perfil com dados e nenhuma avaliação: a composição atual aparece (a antiga mostrava 'Dados pessoais'); nada → vazio", () => {
    const soPerfil = montarSerie({ treino: { perfil: { id: "t", sexo: "female", idade: 40, peso: 61 }, avaliacoes: [], fotos: [] }, principal: null, personal: null });
    expect(soPerfil.composicaoAtual?.peso).toBe(61);
    expect(serieVazia(soPerfil)).toBe(false);
    expect(ultimaAvaliacao(soPerfil)?.id).toBe("treino:perfil");
    const [peso] = kpisDaSerie(soPerfil, "6m", HOJE);
    expect([peso.valor, peso.variacao]).toEqual([61, null]);
    const nada = montarSerie({ treino: { perfil: { id: "t", peso: null }, avaliacoes: [linhaTreino({ data_avaliacao: "2026-07-15" })], fotos: [] }, principal: null, personal: null });
    expect(serieVazia(nada)).toBe(true);
    expect(nada.avaliacoes).toHaveLength(1);
  });

  it("sexo vazio no Calc classifica como feminino (a regra da tela antiga); na antropometria sem sexo, sem classificação", () => {
    const semSexo = avaliacaoDoTreino(linhaTreino({ data_avaliacao: "2026-08-01", percentual_gordura: 22 }), { perfil: { id: "t" }, autor: LUCAS });
    // 22 %: feminino → "Boa Forma" (até 24); se fosse masculino seria "Aceitável"
    expect(classificacaoDe(semSexo)?.label).toBe("Boa Forma");
    expect(classificacaoDe(avaliacaoDoPrincipal(antropo({ sexo: null })))).toBeNull();
  });
});

describe("medidas por grupo e pontos", () => {
  it("agrupa Tronco, Braços, Pernas só com as preenchidas (o abdômen entra no tronco)", () => {
    const a = avaliacaoDoPrincipal(antropo({ circunferencias: { cintura: 88, abdomen: 91, braco_d: 36, coxa_e: 58 } }));
    expect(medidasPorGrupo(a).map((g) => [g.rotulo, g.itens.map((i) => i.rotulo)])).toEqual([
      ["Tronco", ["Cintura", "Abdômen"]],
      ["Braços", ["Braço D"]],
      ["Pernas", ["Coxa E"]],
    ]);
  });
  it("pontosDe ignora as avaliações sem a métrica", () => {
    const s = montarSerie({ treino: { perfil: null, fotos: [], avaliacoes: [linhaTreino({ data_avaliacao: "2026-07-01", peso: 80 }), linhaTreino({ data_avaliacao: "2026-07-02", medida_cintura: 80 })] }, principal: null, personal: null });
    expect(pontosDe(s.avaliacoes, "peso")).toHaveLength(1);
  });
  it("hoje no fuso de São Paulo", () => {
    expect(hojeSP(new Date("2026-10-01T02:30:00Z"))).toBe("2026-09-30");
  });
});
