import { describe, expect, it } from "vitest";
import { perfil } from "@/test/fixturesPerfilAluno";
import { valoresVazios } from "@/lib/avaliacao";
import { montarSerie, kpisDaSerie } from "@/evolucao/serie";
import type { Avaliacao } from "@/evolucao/tipos";
import {
  aberturaDoParametro, autorNoPainel, chipDaUltima, colunasDaFisica, composicaoDepoisDeExcluir, detalheDoKpi, eAMaisRecente, faltandoNaFisica, numerosDoHistorico,
  permissoesDaAvaliacao, podeExcluir, podeRegistrar, pontosDoCard, textoDaProxima, tituloDoHistorico, type FormFisica,
} from "./regras";

const HOJE = "2026-09-30";

function formFisica(o: Partial<FormFisica> = {}): FormFisica {
  const valores = valoresVazios("dobras_7");
  valores.dobras7 = ["11", "12", "9", "13", "19", "15", "13"];
  return {
    data: "2026-09-30", sexo: "male", idade: "31", peso: "84,2", altura: "178", valores, tmb: "katch",
    medidas: { medida_cintura: "84", medida_braco_d: "37,5" }, observacao: "  Ótima evolução  ", ...o,
  };
}

/** Uma série dos 2 bancos (o Diego da massa da W10): 3 do personal e 1 da nutri. */
function serie() {
  const linha = (id: string, data: string, peso: number, bf: number) => ({
    id, data_avaliacao: data, peso, altura: 178, percentual_gordura: bf, massa_gorda: peso * bf / 100, massa_magra: peso - peso * bf / 100,
    metodo_avaliacao: "dobras_7", dobra_1: 11, dobra_2: 12, dobra_3: 9, dobra_4: 13, dobra_5: 19, dobra_6: 15, dobra_7: 13, created_at: `${data}T13:00:00Z`,
  });
  return montarSerie({
    treino: {
      perfil: { id: "t1", sexo: "male", idade: 31, peso: 84.2, altura: 178, metodo_avaliacao: "dobras_7", percentual_gordura: 15.9 },
      avaliacoes: [linha("a1", "2026-03-14", 90.3, 22.4), linha("a2", "2026-06-14", 86.3, 18.4), linha("a3", "2026-09-22", 84.2, 15.9)],
      fotos: [],
    },
    principal: {
      objetivo: "definição",
      antropometrias: [{
        id: "n1", data: "2026-08-26", peso: 84.9, altura: 178, sexo: "masculino", idade: 31, circunferencias: { cintura: 85.5 }, dobras: { peitoral: 14 },
        protocolo: "pollock3", resultados: { percentual_gordura: 16.8, massa_magra: 70.6, massa_gorda: 14.3, imc: 26.8 }, autor_id: "u2", autor_nome: "Camila Rocha", criado_em: "2026-08-26T17:00:00Z",
      }],
      fotos: [],
    },
    personal: { id: "u1", nome: "Lucas Ferreira" },
  });
}

describe("Avaliação (W17) — quem registra o quê (spec 4.1)", () => {
  it("personal responsável: avaliação física; nutricionista responsável: antropometria; dono-personal sem papel de nutri: só a física", () => {
    const personal = perfil({ eu: { id: "u1", dono: false, personal: true, nutricionista: false, master: false } });
    expect(permissoesDaAvaliacao(personal, true)).toEqual({ fisica: true, antropometria: false });
    const nutri = perfil({ eu: { id: "u2", dono: false, personal: false, nutricionista: true, master: false } });
    expect(permissoesDaAvaliacao(nutri, false)).toEqual({ fisica: false, antropometria: true });
    const donoPersonal = perfil();
    expect(permissoesDaAvaliacao(donoPersonal, true)).toEqual({ fisica: true, antropometria: false });
  });

  it("dono com os 2 papéis e master registram os 2; quem só vê não registra", () => {
    const ambos = perfil({ eu: { id: "u9", dono: true, personal: true, nutricionista: true, master: false } });
    expect(permissoesDaAvaliacao(ambos, true)).toEqual({ fisica: true, antropometria: true });
    const master = perfil({ eu: { id: "m", dono: false, personal: false, nutricionista: false, master: true } });
    expect(permissoesDaAvaliacao(master, true)).toEqual({ fisica: true, antropometria: true });
    const donoSoVe = perfil({ eu: { id: "u9", dono: true, personal: false, nutricionista: false, master: false } });
    const p = permissoesDaAvaliacao(donoSoVe, false);
    expect(p).toEqual({ fisica: false, antropometria: false });
    expect(podeRegistrar(p)).toBe(false);
  });

  it("aluno sem o módulo: nada daquele lado (só Nutrição → sem avaliação física; conta sem Nutrição → sem antropometria)", () => {
    const soNutri = perfil({ modulos: ["nutricao"], eu: { id: "u9", dono: true, personal: true, nutricionista: true, master: false } });
    expect(permissoesDaAvaliacao(soNutri, true)).toEqual({ fisica: false, antropometria: true });
    const contaSoTreino = perfil({ conta_modulos: ["treino"], eu: { id: "u9", dono: true, personal: true, nutricionista: true, master: false } });
    expect(permissoesDaAvaliacao(contaSoTreino, true).antropometria).toBe(false);
  });

  it("excluir: a física quem muda o treino, a antropometria quem muda a nutrição; a composição sem registro nunca", () => {
    const perm = { fisica: true, antropometria: false };
    expect(podeExcluir({ origem: "treino", id: "treino:a1" }, perm)).toBe(true);
    expect(podeExcluir({ origem: "principal", id: "principal:n1" }, perm)).toBe(false);
    expect(podeExcluir({ origem: "treino", id: "treino:perfil" }, perm)).toBe(false);
    expect(podeExcluir({ origem: "principal", id: "principal:n1" }, { fisica: false, antropometria: true })).toBe(true);
    // a mais recente do Treino (com os números do perfil, W10) é uma linha de verdade: sai
    const ultima = serie().avaliacoes[serie().avaliacoes.length - 1];
    expect(ultima.atual).toBe(true);
    expect(podeExcluir(ultima, perm)).toBe(true);
  });

  it("excluída a mais recente, a composição atual volta à da anterior; excluir uma antiga não mexe no perfil", () => {
    const linhas = [
      { id: "a1", data_avaliacao: "2026-03-14", peso: 90.3, percentual_gordura: 22.4, metodo_avaliacao: "dobras_7", medida_cintura: 92 },
      { id: "a3", data_avaliacao: "2026-09-22", peso: 84.2, percentual_gordura: 15.9, metodo_avaliacao: "dobras_7", medida_cintura: 84 },
      { id: "a2", data_avaliacao: "2026-06-14", peso: 86.3, percentual_gordura: 18.4, metodo_avaliacao: "dobras_7", medida_cintura: 87.5 },
    ];
    const c = composicaoDepoisDeExcluir("a3", linhas)!;
    expect([c.peso, c.percentual_gordura, c.medida_cintura, c.metodo_avaliacao]).toEqual([86.3, 18.4, 87.5, "dobras_7"]);
    expect(c.medida_braco_d).toBeNull();
    expect(c).not.toHaveProperty("observacao");
    expect(composicaoDepoisDeExcluir("a2", linhas)).toBeNull();
    expect(composicaoDepoisDeExcluir("a1", [linhas[0]])).toBeNull();
  });

  it("?nova= abre o formulário do papel (o do cabeçalho manda 1, o do Fluxo de consulta 'antropometria'); com os 2, escolhe", () => {
    const so = { fisica: true, antropometria: false };
    const ambos = { fisica: true, antropometria: true };
    expect(aberturaDoParametro("1", so)).toBe("fisica");
    expect(aberturaDoParametro("1", { fisica: false, antropometria: true })).toBe("antropometria");
    expect(aberturaDoParametro("1", ambos)).toBe("escolher");
    expect(aberturaDoParametro("antropometria", ambos)).toBe("antropometria");
    expect(aberturaDoParametro("antropometria", so)).toBe("fisica");
    expect(aberturaDoParametro("1", { fisica: false, antropometria: false })).toBeNull();
    expect(aberturaDoParametro(null, ambos)).toBeNull();
  });
});

describe("Avaliação (W17) — o formulário do Calc vira as colunas de physiq_avaliacoes", () => {
  it("7 dobras: composição, TMBs e a escolhida, peso, altura, as medidas digitadas e a observação (aparada)", () => {
    const c = colunasDaFisica(formFisica());
    expect(c.metodo_avaliacao).toBe("dobras_7");
    expect([c.dobra_1, c.dobra_7]).toEqual([11, 13]);
    expect(c.peso).toBe(84.2);
    expect(c.altura).toBe(178);
    expect(c.percentual_gordura).toBeGreaterThan(10);
    expect(c.percentual_gordura).toBeLessThan(20);
    expect(Number(c.massa_gorda) + Number(c.massa_magra)).toBeCloseTo(84.2, 1);
    expect(c.tmb_metodo).toBe("katch");
    expect(c.tmb_mifflin).toBe(Math.round(10 * 84.2 + 6.25 * 178 - 5 * 31 + 5));
    expect(c.medida_cintura).toBe(84);
    expect(c.medida_braco_d).toBe(37.5);
    expect(c.medida_coxa_d).toBeNull();
    expect(c.observacao).toBe("Ótima evolução");
    expect(c).not.toHaveProperty("data_avaliacao");
  });

  it("bioimpedância: o % de gordura e a massa muscular da balança; sem as dobras", () => {
    const v = valoresVazios("bioimpedancia");
    v.bio = { percentual_gordura: "17,8", massa_muscular: "38,9", agua_corporal: "55", gordura_visceral: "8", tmb_balanca: "1850" };
    const c = colunasDaFisica(formFisica({ valores: v, tmb: "balanca" }));
    expect(c.percentual_gordura).toBe(17.8);
    expect(c.massa_muscular).toBe(38.9);
    expect(c.tmb_balanca).toBe(1850);
    expect(c.tmb_metodo).toBe("balanca");
    expect(c.dobra_1).toBeNull();
  });

  it("o que falta para salvar (com a mensagem), e a data não pode ser futura", () => {
    expect(faltandoNaFisica(formFisica(), HOJE)).toBeNull();
    expect(faltandoNaFisica(formFisica({ peso: "" }), HOJE)).toBe("Informe o peso em kg.");
    expect(faltandoNaFisica(formFisica({ data: "2026-10-05" }), HOJE)).toBe("A data da avaliação não pode ser no futuro.");
    expect(faltandoNaFisica(formFisica({ idade: "" }), HOJE)).toContain("idade");
    const falta = formFisica();
    falta.valores = { ...falta.valores, dobras7: ["11", "", "9", "13", "19", "15", "13"] };
    expect(faltandoNaFisica(falta, HOJE)).toBe("Preencha as 7 dobras.");
    expect(faltandoNaFisica(formFisica({ altura: "1,78" }), HOJE)).toBe("A altura é em cm (ex.: 178).");
    const bio = valoresVazios("bioimpedancia");
    expect(faltandoNaFisica(formFisica({ valores: bio }), HOJE)).toContain("balança");
  });

  it("a nova vira a composição atual do perfil só quando é a mais recente do Treino (antropometria não conta)", () => {
    const avs = serie().avaliacoes;
    expect(eAMaisRecente("2026-09-30", avs)).toBe(true);
    expect(eAMaisRecente("2026-09-22", avs)).toBe(true);
    expect(eAMaisRecente("2026-07-01", avs)).toBe(false);
    expect(eAMaisRecente("2026-01-01", [])).toBe(true);
  });
});

describe("Avaliação (W17) — o que a tela mostra", () => {
  it("histórico único dos 2 bancos, em ordem de data, com o autor e a origem", () => {
    const s = serie();
    expect(s.avaliacoes.map((a) => `${a.data} ${a.origem}`)).toEqual([
      "2026-03-14 treino", "2026-06-14 treino", "2026-08-26 principal", "2026-09-22 treino",
    ]);
    const nutri = s.avaliacoes.find((a) => a.origem === "principal") as Avaliacao;
    const fisica = s.avaliacoes[s.avaliacoes.length - 1];
    expect(tituloDoHistorico(fisica)).toBe("Avaliação física · 7 dobras");
    expect(tituloDoHistorico(nutri)).toMatch(/^Antropometria · /);
    expect(autorNoPainel(fisica.autor)).toBe("Lucas Ferreira · personal");
    expect(autorNoPainel(nutri.autor)).toBe("Camila Rocha · nutricionista");
    expect(numerosDoHistorico(fisica)).toMatch(/^84,2 kg · 15,9% de gordura/);
  });

  it("os números do cabeçalho: o mais recente e a variação de 6 meses ('6,1 kg em 6 meses', '4,6 pontos' — tela 7)", () => {
    const [peso, gordura] = kpisDaSerie(serie(), "6m", HOJE);
    expect(peso.valor).toBe(84.2);
    expect(detalheDoKpi(peso)).toBe("2,1 kg em 6 meses");
    expect(gordura.valor).toBe(15.9);
    expect(detalheDoKpi(gordura)).toBe("2,5 pontos");
    expect(detalheDoKpi({ ...gordura, variacao: null })).toBeNull();
  });

  it("card Evolução: o chip da última ('7 DOBRAS · 22/09') e o gráfico de 6 meses (ou do ano)", () => {
    const s = serie();
    expect(chipDaUltima(s.avaliacoes[s.avaliacoes.length - 1])).toBe("7 DOBRAS · 22/09");
    expect(chipDaUltima(null)).toBeNull();
    const g = pontosDoCard(s, HOJE);
    expect(g.periodo).toBe("6m");
    expect(g.pontos.map((p) => p.valor)).toEqual([86.3, 84.9, 84.2]);
  });

  it("próxima avaliação (NF7): data curta e quanto falta (ou há quanto venceu)", () => {
    expect(textoDaProxima("2026-10-03", HOJE)).toEqual({ data: "03/10", detalhe: "em 3 dias", atrasada: false });
    expect(textoDaProxima("2026-09-30", HOJE)?.detalhe).toBe("hoje");
    expect(textoDaProxima("2026-10-01", HOJE)?.detalhe).toBe("amanhã");
    expect(textoDaProxima("2026-09-28", HOJE)).toEqual({ data: "28/09", detalhe: "venceu há 2 dias", atrasada: true });
    expect(textoDaProxima(null, HOJE)).toBeNull();
  });
});
