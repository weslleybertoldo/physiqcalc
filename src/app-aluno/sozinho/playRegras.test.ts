import { describe, expect, it } from "vitest";
import type { ProdutoPlay } from "@/lib/playBilling";
import { modoDaTroca as modoDoServidor } from "../../../supabase-principal/functions/_shared/play-regras";
import {
  MENSAGEM_PLAY, TEXTO_CANCELE, TEXTO_RENOVA, linhasDaOferta, menorPreco, mensagemPlay, modoDaTroca, normalizarVistaPlay, ofertaMensal,
  ofertasMensais, playDaAcesso, playRenovando, playTravada, playViva, porMes, textoDaAssinatura, textoDaTroca, type VistaPlay,
} from "./playRegras";

// play-W6 — as regras PURAS da assinatura da Google Play no app: a oferta (o preço que a Play devolve), a folha (preço, período,
// renovação, como cancelar, os dias que a pessoa já tem), a vista da assinatura, a troca e as mensagens — nada de site nem de MP.

const produto = (id: string, preco: string, micros: number, extra: Partial<ProdutoPlay> = {}): ProdutoPlay => ({
  id,
  nome: id,
  titulo: id,
  ofertas: [
    // uma oferta com teste (que o app NÃO usa — os 7 dias são do app) e o plano básico
    { planoBase: "mensal", oferta: "intro", token: `tok-${id}-intro`, tags: [], fases: [{ precoFormatado: "R$ 0,00", precoMicros: 0, moeda: "BRL", periodo: "P1W", ciclos: 1, recorrencia: 2 }, { precoFormatado: preco, precoMicros: micros, moeda: "BRL", periodo: "P1M", ciclos: 0, recorrencia: 1 }] },
    { planoBase: "mensal", oferta: null, token: `tok-${id}`, tags: [], fases: [{ precoFormatado: preco, precoMicros: micros, moeda: "BRL", periodo: "P1M", ciclos: 0, recorrencia: 1 }] },
  ],
  ...extra,
});
const vista = (p: Partial<VistaPlay> = {}): VistaPlay => ({ estado: "ativa", renova: true, expira_em: "2026-11-16T13:00:00.000Z", produto: "app_treino", ...p });

describe("a oferta: o plano básico mensal e o preço DA PLAY", () => {
  it("pega o plano básico (sem oferta extra) e o preço da fase que renova", () => {
    expect(ofertaMensal(produto("app_treino", "R$ 31,90", 31_900_000))).toEqual({
      produto: "app_treino", token: "tok-app_treino", preco: "R$ 31,90", micros: 31_900_000, moeda: "BRL",
    });
  });
  it("produto de fora do app, sem o plano básico ou sem o período mensal = não vende", () => {
    expect(ofertaMensal(produto("outro", "R$ 1,00", 1))).toBeNull();
    expect(ofertaMensal({ ...produto("app_treino", "R$ 1,00", 1), ofertas: [] })).toBeNull();
    const anual = produto("app_treino", "R$ 300,00", 300_000_000);
    anual.ofertas[1].fases[0].periodo = "P1Y";
    expect(ofertaMensal(anual)).toBeNull();
    expect(ofertaMensal(null)).toBeNull();
  });
  it("as ofertas por produto e o menor preço ('a partir de')", () => {
    const o = ofertasMensais([produto("app_treino", "R$ 31,90", 31_900_000), produto("app_treino_alimentacao", "R$ 51,90", 51_900_000)]);
    expect(Object.keys(o).sort()).toEqual(["app_treino", "app_treino_alimentacao"]);
    expect(menorPreco(o)).toBe("R$ 31,90");
    expect(menorPreco({})).toBeNull();
    expect(porMes("R$ 31,90")).toBe("R$ 31,90/mês");
  });
});

describe("a folha da oferta (a política da Play: o preço, o período, a renovação e como cancelar)", () => {
  const o = { produto: "app_treino" as const, token: "t", preco: "R$ 31,90", micros: 31_900_000, moeda: "BRL" };
  const agora = new Date("2026-10-16T12:00:00Z");
  it("sem dias a mais: o preço por mês, renova todo mês até cancelar, cancele na Google Play", () => {
    expect(linhasDaOferta(o, null, agora)).toEqual(["R$ 31,90 por mês.", TEXTO_RENOVA, TEXTO_CANCELE]);
    expect(TEXTO_RENOVA).toBe("Renova todo mês até você cancelar.");
    expect(TEXTO_CANCELE).toBe("Cancele quando quiser na Google Play.");
  });
  it("no teste (ou com um mês pago): cobra hoje e os dias que a pessoa já tem continuam (o servidor adia)", () => {
    const l = linhasDaOferta(o, "2026-10-21T02:59:59.000Z", agora);
    expect(l).toHaveLength(4);
    expect(l[3]).toMatch(/^A Google Play cobra hoje, e os dias que você já tem \(até 20\/10\) continuam: o mês pago começa depois deles\.$/);
    // menos de 1 dia não muda nada (o servidor também não adia)
    expect(linhasDaOferta(o, "2026-10-17T06:00:00.000Z", agora)).toHaveLength(3);
  });
});

describe("a vista da assinatura", () => {
  it("viva, dá acesso, renova, travada", () => {
    for (const estado of ["pendente", "ativa", "cancelada", "carencia", "suspensa", "pausada"] as const) expect(playViva(vista({ estado }))).toBe(true);
    expect(playViva(null)).toBe(false);
    expect(["ativa", "cancelada", "carencia"].every((estado) => playDaAcesso(vista({ estado: estado as VistaPlay["estado"] })))).toBe(true);
    expect(playDaAcesso(vista({ estado: "suspensa" }))).toBe(false);
    expect(playRenovando(vista())).toBe(true);
    expect(playRenovando(vista({ estado: "cancelada", renova: false }))).toBe(false);
    expect(playTravada(vista({ estado: "suspensa" }))).toBe(true);
    expect(playTravada(vista({ estado: "pausada" }))).toBe(true);
  });
  it("o JSON do servidor: só as vivas; o token nunca vem", () => {
    expect(normalizarVistaPlay({ estado: "ativa", renova: true, expira_em: "x", produto: "app_treino", token: "nao" })).toEqual({
      estado: "ativa", renova: true, expira_em: "x", produto: "app_treino",
    });
    expect(normalizarVistaPlay({ estado: "expirada", produto: "app_treino" })).toBeNull();
    expect(normalizarVistaPlay(null)).toBeNull();
    expect(normalizarVistaPlay({ estado: "ativa" })).toBeNull();
  });
  it("T2 (a): a troca agendada (DEFERRED) chega ao app — o troca_para do servidor, só com código do app; sem ela, a vista de hoje", () => {
    expect(normalizarVistaPlay({ estado: "ativa", renova: false, expira_em: "x", produto: "app_treino_alimentacao", troca_para: "app_treino" })).toEqual({
      estado: "ativa", renova: false, expira_em: "x", produto: "app_treino_alimentacao", troca_para: "app_treino",
    });
    for (const troca_para of [null, undefined, "", "outro_produto", 7]) {
      expect(normalizarVistaPlay({ estado: "ativa", renova: true, expira_em: "x", produto: "app_treino", troca_para })).toEqual({
        estado: "ativa", renova: true, expira_em: "x", produto: "app_treino",
      });
    }
  });
  it("T2 (a): com a troca agendada, o detalhe diz \"vira <Nome> em DD/MM\" (o fim do plano de hoje) no lugar de renova/não renova", () => {
    const deferred = vista({ produto: "app_treino_alimentacao", renova: false, troca_para: "app_treino" });
    expect(textoDaAssinatura(deferred)).toEqual({ titulo: "Assinatura pela Google Play", detalhe: "até 16/11 · vira Treino em 16/11", tom: "n" });
    expect(textoDaAssinatura({ ...deferred, renova: true }).detalhe).toBe("até 16/11 · vira Treino em 16/11");
    expect(textoDaAssinatura(vista({ produto: "app_treino", troca_para: "app_treino_alimentacao" })).detalhe).toBe("até 16/11 · vira Treino + Alimentação em 16/11");
    // sem a data: na renovação
    expect(textoDaAssinatura({ ...deferred, expira_em: null }).detalhe).toBe("vira Treino na renovação");
    // a troca para o MESMO produto, ou sem troca: igual a hoje
    expect(textoDaAssinatura(vista({ troca_para: "app_treino" })).detalhe).toBe("até 16/11 · renova sozinha");
    expect(textoDaAssinatura(vista({ renova: false })).detalhe).toBe("até 16/11 · não renova");
    // cancelada não renova: a troca não acontece (o texto de hoje)
    expect(textoDaAssinatura({ ...deferred, estado: "cancelada" }).detalhe).toBe("vale até 16/11 · cancelada, não renova");
  });
  it("o texto de cada estado (Pagamentos, Meu plano, a trava)", () => {
    expect(textoDaAssinatura(vista())).toEqual({ titulo: "Assinatura pela Google Play", detalhe: "até 16/11 · renova sozinha", tom: "n" });
    expect(textoDaAssinatura(vista({ estado: "cancelada", renova: false })).detalhe).toBe("vale até 16/11 · cancelada, não renova");
    expect(textoDaAssinatura(vista({ estado: "carencia" })).detalhe).toMatch(/atualize na Google Play/);
    expect(textoDaAssinatura(vista({ estado: "suspensa" }))).toMatchObject({ titulo: "Assinatura suspensa", tom: "r" });
    expect(textoDaAssinatura(vista({ estado: "pausada" })).titulo).toBe("Assinatura pausada");
    expect(textoDaAssinatura(vista({ estado: "pendente" })).titulo).toBe("Pagamento pendente na Google Play");
  });
});

describe("a troca (decisão 6) e as mensagens", () => {
  it("para o completo na hora; para o Treino na renovação — a MESMA regra do servidor", () => {
    const pares: Array<[string, string]> = [["app_treino", "app_treino_alimentacao"], ["app_treino_alimentacao", "app_treino"], ["app_treino", "app_treino"], ["x", "app_treino"]];
    for (const [de, para] of pares) expect(modoDaTroca(de, para)).toBe(modoDoServidor(de, para));
    expect(modoDaTroca("app_treino", "app_treino_alimentacao")).toBe("na_hora");
    expect(modoDaTroca("app_treino_alimentacao", "app_treino")).toBe("na_renovacao");
    expect(textoDaTroca("na_hora")).toMatch(/Vale na hora/);
    expect(textoDaTroca("na_renovacao")).toMatch(/próxima renovação/);
  });
  it("nada de site, Pix, cartão ou Mercado Pago nos textos da loja", () => {
    const textos = [...Object.values(MENSAGEM_PLAY), TEXTO_RENOVA, TEXTO_CANCELE, textoDaTroca("na_hora"), textoDaTroca("na_renovacao"),
      ...(["pendente", "ativa", "cancelada", "carencia", "suspensa", "pausada"] as const).flatMap((estado) => Object.values(textoDaAssinatura(vista({ estado })))),
      ...Object.values(textoDaAssinatura(vista({ produto: "app_treino_alimentacao", troca_para: "app_treino" })))];
    for (const t of textos) expect(t, t).not.toMatch(/Pix|cart[ãa]o|Mercado Pago|site|physiqcalc\.com\.br/i);
    expect(mensagemPlay("compra_de_outra_conta")).toMatch(/outra conta do Physiq/);
    expect(mensagemPlay("inexistente")).toBe("Não deu certo agora. Tente de novo.");
  });
  it("a revisão ⚪17: o compra_invalida NÃO diz \"Nada foi cobrado\" (a Play cobrou; sem o reconhecimento, ela devolve sozinha em 3 dias)", () => {
    expect(mensagemPlay("compra_invalida")).not.toMatch(/Nada foi cobrado/i);
    expect(mensagemPlay("compra_invalida")).toMatch(/devolve/);
  });
});
