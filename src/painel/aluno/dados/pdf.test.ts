import { describe, expect, it, vi } from "vitest";

// os clientes dos 2 bancos não vão à rede neste teste (só as regras puras do PDF)
vi.mock("@/integrations/principal/client", () => ({ principal: {}, principalConfigurado: true }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {}, DB_SCHEMA: "staging" }));

import { avaliacaoDoPrincipal } from "@/evolucao/serie";
import type { AntropometriaPrincipal } from "@/evolucao/tipos";
import { tipoNoPdf } from "@/lib/generateAdminPDF";
import { linhaDaAntropometria, protocoloNoPdf } from "./pdf";

function antropo(extra: Partial<AntropometriaPrincipal>): AntropometriaPrincipal {
  return {
    id: "n-1", data: "2026-05-28", peso: 88.4, altura: 178, sexo: "masculino", idade: 31, circunferencias: null, dobras: null,
    protocolo: "pollock3", resultados: { percentual_gordura: 20.9, massa_gorda: 18.48, massa_magra: 69.92 },
    autor_id: "u-camila", autor_nome: "Camila Rocha", criado_em: "2026-05-28T15:00:00Z", ...extra,
  };
}

describe("PDF Dados & Evolução: o protocolo certo (W25 — herdado da W18)", () => {
  it("Faulkner e Guedes saem com o protocolo da Evolução, não como '3 dobras'", () => {
    const faulkner = linhaDaAntropometria(avaliacaoDoPrincipal(antropo({ protocolo: "faulkner" })));
    const guedes = linhaDaAntropometria(avaliacaoDoPrincipal(antropo({ protocolo: "guedes" })));
    expect(faulkner.rotulo_metodo).toBe("Faulkner - 4 dobras");
    expect(guedes.rotulo_metodo).toBe("Guedes - 3 dobras");
    expect(tipoNoPdf(faulkner)).toBe("Faulkner - 4 dobras");
    expect(tipoNoPdf(guedes)).toBe("Guedes - 3 dobras");
    expect(tipoNoPdf(faulkner)).not.toBe("3 dobras");
  });
  it("Pollock 3 e 7 com o nome do protocolo; só medidas e só peso/altura com o tipo da Evolução (sem acento no PDF)", () => {
    expect(tipoNoPdf(linhaDaAntropometria(avaliacaoDoPrincipal(antropo({ protocolo: "pollock3" }))))).toBe("Jackson & Pollock - 3 dobras");
    expect(tipoNoPdf(linhaDaAntropometria(avaliacaoDoPrincipal(antropo({ protocolo: "pollock7" }))))).toBe("Jackson & Pollock - 7 dobras");
    const soMedidas = avaliacaoDoPrincipal(antropo({ protocolo: null, resultados: null, circunferencias: { cintura: 82 } }));
    expect(protocoloNoPdf(soMedidas)).toBe("Só medidas");
    expect(tipoNoPdf(linhaDaAntropometria(soMedidas))).toBe("So medidas");
  });
  it("as avaliações do Calc continuam pelo método de sempre (3 dobras, 7 dobras, bioimpedância; sem método = 3 dobras)", () => {
    expect(tipoNoPdf({ metodo_avaliacao: "dobras_7" })).toBe("7 dobras");
    expect(tipoNoPdf({ metodo_avaliacao: "bioimpedancia" })).toBe("Bioimpedancia");
    expect(tipoNoPdf({ metodo_avaliacao: null })).toBe("3 dobras");
    expect(tipoNoPdf({ metodo_avaliacao: "dobras_7", rotulo_metodo: "" })).toBe("7 dobras");
  });
});
