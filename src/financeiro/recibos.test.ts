import { describe, expect, it } from "vitest";
import { valorComSinal } from "./lancamentos";
import {
  aplicarTags,
  CONTEUDO_MODELO_PADRAO,
  formatarCPF,
  formatarDataRecibo,
  formatarNumeroRecibo,
  nomeArquivoPDFRecibo,
  ordenarModelosRecibo,
  podeEmitirRecibo,
  temTagPendente,
  validarModelo,
  valorPorExtenso,
} from "./recibos";

// O recibo e os lançamentos do aluno no painel (C46–C47, N-45): porte do Nutri (recibosUtil/financeiroUtil) para o Physiq.
describe("recibo do aluno", () => {
  it("número, CPF, data e nome do arquivo", () => {
    expect(formatarNumeroRecibo(7)).toBe("0007");
    expect(formatarNumeroRecibo(12345)).toBe("12345");
    expect(formatarCPF("12345678901")).toBe("123.456.789-01");
    expect(formatarDataRecibo("2026-09-29")).toBe("29/09/2026");
    expect(nomeArquivoPDFRecibo(3, "João Conceição")).toBe("recibo-0003-joao-conceicao.pdf");
    expect(nomeArquivoPDFRecibo(3, "")).toBe("recibo-0003-aluno.pdf");
  });
  it("valor por extenso", () => {
    expect(valorPorExtenso(249)).toBe("duzentos e quarenta e nove reais");
    expect(valorPorExtenso(1)).toBe("um real");
    expect(valorPorExtenso(180.5)).toBe("cento e oitenta reais e cinquenta centavos");
    expect(valorPorExtenso(0)).toBe("zero reais");
  });
  it("o modelo padrão vira texto sem tag sobrando", () => {
    const texto = aplicarTags(CONTEUDO_MODELO_PADRAO, { nomePaciente: "Rafael Moura", cpf: "12345678901", valor: 249, data: "2026-09-29", numero: 12, nomeProfissional: "Lucas Ferreira" });
    expect(texto).toContain("Rafael Moura");
    expect(texto).toContain("R$ 249,00");
    expect(temTagPendente(texto)).toBe(false);
  });
  it("só lançamento de entrada, sem estorno e sem recibo emite recibo", () => {
    expect(podeEmitirRecibo({ tipo: "entrada", estornada: false, recibo_id: null })).toBe(true);
    expect(podeEmitirRecibo({ tipo: "saida", estornada: false, recibo_id: null })).toBe(false);
    expect(podeEmitirRecibo({ tipo: "entrada", estornada: true, recibo_id: null })).toBe(false);
    expect(podeEmitirRecibo({ tipo: "entrada", estornada: false, recibo_id: "r1" })).toBe(false);
  });
  it("modelos: favorito primeiro; título e texto obrigatórios", () => {
    expect(ordenarModelosRecibo([{ favorito: false, titulo: "B" }, { favorito: true, titulo: "Z" }, { favorito: false, titulo: "A" }]).map((m) => m.titulo)).toEqual(["Z", "A", "B"]);
    expect(validarModelo("", "x")).toBe("Dê um título ao modelo");
    expect(validarModelo("Padrão", " ")).toBe("Escreva o texto do recibo");
    expect(validarModelo("Padrão", "Recebi de *|NOME_PACIENTE|*")).toBeNull();
  });
});

describe("lançamentos do aluno", () => {
  // hml-14d (D31): os totais (estornado fora, saída = gasto) são somados no banco — financeiro_totais_do_aluno (o teste da regra é o
  // da migration, no PGlite); aqui fica o sinal
  it("o sinal segue o tipo", () => {
    expect(valorComSinal("entrada", 249)).toBe("+R$ 249,00");
    expect(valorComSinal("saida", 40.5)).toBe("−R$ 40,50");
  });
});
