import { describe, expect, it } from "vitest";
import { mensagemErroAlunos } from "@/painel/alunos/regras";
import { MENSAGEM_EQUIPE, mensagemErroEquipe } from "@/painel/configuracoes/equipe/regras";
import { ABAS_CONFIG, estadoDaAbaConfig } from "@/painel/configuracoes/catalogoAbas";
import { conta } from "@/test/fixturesNucleo";
import { planoCartaoContaNova } from "./cartao";
import { avisoDoPlano, mensagemLimite, textoDoAviso, textoDoAvisoNeutro, type Aviso } from "./regras";

// W1 da loja — os textos do plano do profissional na versão da Google Play: a situação e as datas, sem preço, sem forma de pagar e
// sem mandar pagar/escolher/mudar o plano (ele paga pelo site). O parâmetro `loja` deixa provar as duas versões no mesmo teste;
// sem ele vale o build (nos testes, o site).
const PROIBIDO_NA_LOJA = /R\$|pag(ue|ar)|Pix|cartão|escolh|Mude|regularize|Configurações › Plano/i;
const HOJE = "2026-10-06";

describe("faixa de aviso do plano (textoDoAviso) — W1 da loja", () => {
  const casos: Aviso[] = [
    { marco: 7, dias: 5, vence: "2026-10-11", teste: false },
    { marco: 1, dias: 1, vence: "2026-10-07", teste: false },
    { marco: 0, dias: 0, vence: "2026-10-06", teste: false },
    { marco: 0, dias: 0, vence: "2026-10-06", teste: false, ate: "2026-10-13" },
    { marco: 7, dias: 4, vence: "2026-10-10", teste: true },
    { marco: 1, dias: 1, vence: "2026-10-07", teste: true },
    { marco: 0, dias: 0, vence: "2026-10-06", teste: true },
    { marco: "tolerancia", dias: 3, vence: "2026-10-02", teste: false, ate: "2026-10-09" },
  ];

  it("na loja: só a situação e as datas, sem valor e sem 'pague'/'escolha um plano'", () => {
    for (const a of casos) {
      const t = textoDoAviso(a, 59.9, true);
      expect(t).toBe(textoDoAvisoNeutro(a));
      expect(t).not.toMatch(PROIBIDO_NA_LOJA);
    }
    expect(textoDoAviso(casos[0], 59.9, true)).toBe("Seu plano vence em 5 dias (11/10).");
    expect(textoDoAviso(casos[3], 59.9, true)).toBe("Seu plano vence hoje. O painel fica aberto até 13/10.");
    expect(textoDoAviso(casos[4], null, true)).toBe("Seu teste grátis termina em 4 dias (10/10).");
    expect(textoDoAviso(casos[7], 59.9, true)).toBe("Seu plano venceu em 02/10. O painel fica aberto até 09/10.");
  });

  it("no site (sem a flag): os textos de hoje, com o valor e o 'pague'", () => {
    expect(textoDoAviso(casos[0], 59.9)).toMatch(/^Seu plano de R\$\s?59,90 vence em 5 dias \(11\/10\)\.$/);
    expect(textoDoAviso(casos[2], 59.9)).toMatch(/Pague para não ficar sem acesso ao painel amanhã/);
    expect(textoDoAviso(casos[6], null)).toBe("Seu teste grátis termina hoje. Escolha um plano para não ficar sem acesso ao painel.");
    expect(textoDoAviso(casos[7], 59.9, false)).toMatch(/Pague até 09\/10/);
  });

  it("o aviso de verdade (avisoDoPlano) também sai neutro na loja", () => {
    const a = avisoDoPlano(conta({ situacao: "ativa", teste_ate: null, vence_em: "2026-10-08" }), HOJE, false)!;
    expect(textoDoAviso(a, 79.9, true)).toBe("Seu plano vence em 2 dias (08/10).");
  });
});

describe("card do plano no menu (planoCartaoContaNova) — W1 da loja", () => {
  it("na loja a linha não diz a forma de pagar nem 'pague até'", () => {
    const ativa = conta({ situacao: "ativa", teste_ate: null, vence_em: "2026-10-20" });
    expect(planoCartaoContaNova(ativa, HOJE, true).linha).toBe("Vence em 20/10");
    expect(planoCartaoContaNova(ativa, HOJE, false).linha).toBe("Vence em 20/10 · Pix");
    const hoje = conta({ situacao: "ativa", teste_ate: null, vence_em: HOJE });
    expect(planoCartaoContaNova(hoje, HOJE, true).linha).toBe("Vence hoje");
    const cartao = conta({ situacao: "ativa", teste_ate: null, vence_em: "2026-10-20", assinatura: { status: "authorized", proximo_vencimento: null, valor: 79.9 } });
    expect(planoCartaoContaNova(cartao, HOJE, true).linha).toBe("Renova em 20/10");
    expect(planoCartaoContaNova(cartao, HOJE, false).linha).toBe("Renova em 20/10 · cartão");
    const tolerancia = conta({ origem: "legado_calc", situacao: "ativa", teste_ate: null, vence_em: "2026-10-03", tolerancia_dias: 7 });
    expect(planoCartaoContaNova(tolerancia, HOJE, true).linha).toBe("Venceu em 03/10 · acesso até 10/10");
    expect(planoCartaoContaNova(tolerancia, HOJE, false).linha).toBe("Venceu em 03/10 · pague até 10/10");
    for (const c of [ativa, hoje, cartao, tolerancia]) expect(planoCartaoContaNova(c, HOJE, true).linha).not.toMatch(PROIBIDO_NA_LOJA);
  });
});

describe("limite de alunos e recusas do plano — W1 da loja", () => {
  it("mensagemLimite: na loja o dono não é mandado mudar de faixa", () => {
    expect(mensagemLimite(10, true, null, true)).toBe("Seu plano permite 10 alunos ativos.");
    expect(mensagemLimite(10, true, null, false)).toBe("Seu plano permite 10 alunos ativos. Mude de faixa em Configurações › Plano.");
    // o membro continua com o "fale com o dono" nas duas versões
    expect(mensagemLimite(10, false, "Lucas", true)).toBe("O plano da conta permite 10 alunos ativos. Fale com Lucas.");
  });

  it("mensagemErroAlunos: limite e conta travada sem 'regularize'/'mude' na loja", () => {
    expect(mensagemErroAlunos("limite_plano", { limite: 10, em_uso: 10 }, true)).toBe("Seu plano permite 10 alunos ativos. (10 de 10 em uso)");
    expect(mensagemErroAlunos("conta_travada", {}, true)).not.toMatch(PROIBIDO_NA_LOJA);
    expect(mensagemErroAlunos("conta_travada", {}, false)).toMatch(/Regularize em Configurações › Plano/);
  });

  it("mensagemErroEquipe: as recusas do plano neutras na loja; as outras iguais", () => {
    for (const c of ["conta_travada", "papel_sem_modulo"]) {
      expect(mensagemErroEquipe(c, true)).not.toMatch(PROIBIDO_NA_LOJA);
      expect(mensagemErroEquipe(c, false)).toBe(MENSAGEM_EQUIPE[c]);
    }
    expect(mensagemErroEquipe("so_dono", true)).toBe(MENSAGEM_EQUIPE.so_dono);
    expect(mensagemErroEquipe("nao_existe", true)).toBe(MENSAGEM_EQUIPE.erro_interno);
  });
});

describe("Configurações › Aplicativo (baixar/atualizar o APK) — W1 da loja", () => {
  it("na loja a aba some (também no link direto); no site continua para todos — W2 da loja: Excluir minha conta nas 2 versões", () => {
    const visiveis = (loja: boolean, ehDono: boolean) =>
      ABAS_CONFIG.filter((a) => estadoDaAbaConfig(a, { ehDono }, () => true, loja) !== null).map((a) => a.id);
    expect(visiveis(true, true)).toEqual(["perfil", "conta", "equipe", "plano", "recebimento", "convite", "excluir-conta"]);
    expect(visiveis(true, false)).toEqual(["perfil", "convite", "excluir-conta"]);
    expect(visiveis(false, true)).toEqual(["perfil", "conta", "equipe", "plano", "recebimento", "convite", "aplicativo", "excluir-conta"]);
    expect(visiveis(false, false)).toEqual(["perfil", "convite", "aplicativo", "excluir-conta"]);
  });
});
