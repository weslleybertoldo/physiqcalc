import { describe, expect, it } from "vitest";
import type { LegalSituacao } from "@/nucleo/situacao";
import { destinoDaExclusao } from "@/painel/configuracoes/excluirConta/regras";
import { conta, situacao } from "@/test/fixturesNucleo";
import { VERSAO_TEXTOS } from "../versao";
import {
  MENSAGEM_ACEITE,
  ROTA_EXCLUSAO_DO_PAINEL,
  abreAExclusao,
  dataDeHoje,
  decisaoDaPorta,
  erroDoNascimento,
  exclusaoAberta,
  idadeEm,
  mensagemAceite,
  origemDoAceite,
  rotaLivreDoAceite,
  tratarRecusa,
} from "./regras";

// hml-12 (H-30) — as regras puras da porta do aceite (spec §4.2 e §9.1).

const legal = (o: Partial<LegalSituacao> = {}): LegalSituacao => ({
  versao: "2026-10-08",
  aceite_pendente: false,
  saude_pendente: false,
  nascimento_pendente: false,
  menor: null,
  ...o,
});
const ONLINE = { rotaLivre: false, online: true, carregando: false };

describe("decisaoDaPorta (a tabela de verdade)", () => {
  it("desligado (versão nula), sem legal (servidor antigo, cache de antes) ou sem login → segue", () => {
    expect(decisaoDaPorta(legal({ versao: null, aceite_pendente: true }), ONLINE)).toBe("segue");
    expect(decisaoDaPorta(null, ONLINE)).toBe("segue");
    expect(decisaoDaPorta(undefined, ONLINE)).toBe("segue");
  });

  it("aceite, saúde ou data pendente + com internet → a tela do aceite", () => {
    expect(decisaoDaPorta(legal({ aceite_pendente: true }), ONLINE)).toBe("aceite");
    expect(decisaoDaPorta(legal({ saude_pendente: true }), ONLINE)).toBe("aceite");
    expect(decisaoDaPorta(legal({ nascimento_pendente: true }), ONLINE)).toBe("aceite");
  });

  it("pendente + sem internet → segue (o treino abre; a tela vem quando a internet volta, D9)", () => {
    expect(decisaoDaPorta(legal({ aceite_pendente: true, saude_pendente: true }), { ...ONLINE, online: false })).toBe("segue");
  });

  it("pendente + a situação carregando → a tela de carregar (o cache velho não pisca a tela)", () => {
    expect(decisaoDaPorta(legal({ aceite_pendente: true }), { ...ONLINE, carregando: true })).toBe("carregando");
    // nada pendente no cache: o app segue enquanto carrega
    expect(decisaoDaPorta(legal(), { ...ONLINE, carregando: true })).toBe("segue");
  });

  it("a trava de idade: menor_16 e sem_responsavel, mesmo sem internet (é o cache)", () => {
    expect(decisaoDaPorta(legal({ menor: "menor_16" }), ONLINE)).toBe("menor_16");
    expect(decisaoDaPorta(legal({ menor: "sem_responsavel" }), ONLINE)).toBe("sem_responsavel");
    expect(decisaoDaPorta(legal({ menor: "sem_responsavel" }), { ...ONLINE, online: false })).toBe("sem_responsavel");
    expect(decisaoDaPorta(legal({ menor: "menor_16" }), { ...ONLINE, online: false, carregando: true })).toBe("menor_16");
    // com internet e a situação nova chegando (o profissional pode ter registrado o responsável): espera
    expect(decisaoDaPorta(legal({ menor: "sem_responsavel" }), { ...ONLINE, carregando: true })).toBe("carregando");
  });

  it("aceite pendente e a trava: primeiro o aceite; sem internet, a trava", () => {
    expect(decisaoDaPorta(legal({ aceite_pendente: true, menor: "sem_responsavel" }), ONLINE)).toBe("aceite");
    expect(decisaoDaPorta(legal({ aceite_pendente: true, menor: "sem_responsavel" }), { ...ONLINE, online: false })).toBe("sem_responsavel");
  });

  it("nada pendente → segue; rota livre → segue, até com a trava", () => {
    expect(decisaoDaPorta(legal(), ONLINE)).toBe("segue");
    expect(decisaoDaPorta(legal({ aceite_pendente: true }), { ...ONLINE, rotaLivre: true })).toBe("segue");
    expect(decisaoDaPorta(legal({ menor: "menor_16" }), { ...ONLINE, rotaLivre: true })).toBe("segue");
  });
});

describe("rotaLivreDoAceite (as públicas e as de exclusão passam)", () => {
  it.each([
    ["/privacidade", ""],
    ["/termos", ""],
    ["/assinatura", ""],
    ["/excluir-conta", ""],
    ["/excluir-conta", "?x=1"],
    ["/f/abcd2345", ""],
    ["/d/XYZ123", ""],
    ["/c/PROF-ANA", ""],
    ["/p/abc", ""],
    ["/calculator", ""],
    ["/erro-teste", ""],
    ["/entrar", ""],
    ["/entrar/email", ""],
    ["/termos/", ""],
    ["/perfil", "?excluir=1"],
    ["/perfil", "?aba=x&excluir=1"],
    ["/painel/configuracoes/excluir-conta", ""],
  ])("%s%s passa", (caminho, busca) => {
    expect(rotaLivreDoAceite(caminho, busca)).toBe(true);
  });

  it.each([
    ["/", ""],
    ["/treino", ""],
    ["/dieta", ""],
    ["/painel", ""],
    ["/painel/configuracoes", ""],
    ["/boas-vindas", ""],
    ["/perfil", ""],
    ["/perfil", "?excluir=0"],
    ["/perfil/pagamentos", "?excluir=1"],
    ["/master", ""],
    ["/fotos", ""],
    ["/entrarx", ""],
  ])("%s%s não passa", (caminho, busca) => {
    expect(rotaLivreDoAceite(caminho, busca)).toBe(false);
  });

  it("as 2 telas de exclusão são as de destinoDaExclusao (o profissional e o aluno)", () => {
    const pro = situacao({ contas: [conta()] });
    expect(destinoDaExclusao(pro)).toBe(ROTA_EXCLUSAO_DO_PAINEL);
    const [caminho, busca] = destinoDaExclusao(situacao()).split("?");
    expect(rotaLivreDoAceite(caminho, `?${busca}`)).toBe(true);
    expect(abreAExclusao(caminho, `?${busca}`)).toBe(true);
    expect(abreAExclusao(ROTA_EXCLUSAO_DO_PAINEL)).toBe(true);
  });
});

describe("exclusaoAberta (a exclusão continua livre depois que o Perfil apaga o ?excluir=1)", () => {
  it("abre nas 2 rotas de exclusão, com ou sem o estado de antes", () => {
    expect(exclusaoAberta(false, "/perfil", "?excluir=1")).toBe(true);
    expect(exclusaoAberta(false, "/painel/configuracoes/excluir-conta")).toBe(true);
    expect(exclusaoAberta(true, "/perfil/", "?aba=x&excluir=1")).toBe(true);
  });

  it("aberta, continua no /perfil sem o ?excluir (a URL que o Perfil deixa) e na exclusão do painel", () => {
    expect(exclusaoAberta(true, "/perfil")).toBe(true);
    expect(exclusaoAberta(true, "/perfil/")).toBe(true);
    expect(exclusaoAberta(true, "/painel/configuracoes/excluir-conta")).toBe(true);
  });

  it("saiu para outra rota → fecha; o /perfil sem ter aberto não abre", () => {
    expect(exclusaoAberta(true, "/treino")).toBe(false);
    expect(exclusaoAberta(true, "/perfil/pagamentos")).toBe(false);
    expect(exclusaoAberta(true, "/painel")).toBe(false);
    expect(exclusaoAberta(true, "/excluir-conta")).toBe(false); // a pública já é livre por si
    expect(exclusaoAberta(false, "/perfil")).toBe(false);
    expect(exclusaoAberta(false, "/perfil", "?excluir=0")).toBe(false);
  });
});

describe("origemDoAceite", () => {
  it("loja (Google Play) · apk · site — a mesma plataforma do aviso de erro", () => {
    expect(origemDoAceite("loja")).toBe("loja");
    expect(origemDoAceite("app")).toBe("apk");
    expect(origemDoAceite("site")).toBe("site");
    // no Vitest (navegador, sem as flags do build): o site
    expect(origemDoAceite()).toBe("site");
  });
});

describe("a data de nascimento do plano sem profissional (18+)", () => {
  const HOJE = new Date(2026, 9, 8, 12); // 08/10/2026, meio-dia no fuso do aparelho

  it("a idade conta o aniversário do ano; 29/02 vira em 01/03 (como o age() do banco)", () => {
    expect(idadeEm("2008-10-08", HOJE)).toBe(18);
    expect(idadeEm("2008-10-09", HOJE)).toBe(17);
    expect(idadeEm("1996-01-31", HOJE)).toBe(30);
    expect(idadeEm("2008-02-29", new Date(2026, 1, 28))).toBe(17);
    expect(idadeEm("2008-02-29", new Date(2026, 2, 1))).toBe(18);
    expect(idadeEm("2008-02-30", HOJE)).toBeNull();
    expect(idadeEm("", HOJE)).toBeNull();
    expect(idadeEm("08/10/2008", HOJE)).toBeNull();
  });

  it("vazia, impossível, antes de 1900 ou no futuro → nascimento_invalido; menos de 18 → menor_de_18; 18+ → ok", () => {
    expect(erroDoNascimento("", HOJE)).toBe("nascimento_invalido");
    expect(erroDoNascimento("2001-02-30", HOJE)).toBe("nascimento_invalido");
    expect(erroDoNascimento("1899-12-31", HOJE)).toBe("nascimento_invalido");
    expect(erroDoNascimento("2026-10-09", HOJE)).toBe("nascimento_invalido");
    expect(erroDoNascimento("2009-01-01", HOJE)).toBe("menor_de_18");
    expect(erroDoNascimento("2008-10-09", HOJE)).toBe("menor_de_18");
    expect(erroDoNascimento("2008-10-08", HOJE)).toBeNull();
    expect(erroDoNascimento("1900-01-01", HOJE)).toBeNull();
    expect(dataDeHoje(HOJE)).toBe("2026-10-08");
  });
});

describe("as frases da tela do aceite", () => {
  it("cobrem todos os códigos do aceitar_no_acesso e os da tela; desconhecido → a genérica", () => {
    const DO_BANCO = [
      "sem_login",
      "conta_real_no_staging",
      "textos_desligados",
      "versao_desatualizada",
      "origem_invalida",
      "sem_consentimento_saude",
      "nascimento_invalido",
      "menor_de_18",
    ];
    for (const codigo of [...DO_BANCO, "sem_internet", "erro_interno", "atualize_o_app"]) expect(MENSAGEM_ACEITE[codigo], codigo).toBeTruthy();
    expect(mensagemAceite("atualize_o_app")).toBe("Os termos foram atualizados. Atualize o app para continuar.");
    expect(mensagemAceite("menor_de_18")).toBe(
      "O plano sem profissional é para maiores de 18 anos. Se você tem 16 ou 17 anos, treine com um profissional: peça o código a ele.",
    );
    expect(mensagemAceite("sem_internet")).toBe("Conecte-se à internet para aceitar.");
    expect(mensagemAceite("versao_desatualizada")).toBe("Os termos foram atualizados. Recarregue para ler a versão nova.");
    expect(mensagemAceite("nao_existe")).toBe("Não deu para registrar agora. Tente mais tarde.");
    expect(mensagemAceite("toString")).toBe("Não deu para registrar agora. Tente mais tarde.");
    expect(mensagemAceite(null)).toBe("Não deu para registrar agora. Tente mais tarde.");
  });

  it("versao_desatualizada: o banco na frente → Recarregar; o banco atrás (esquecido na virada) → a genérica e o aviso", () => {
    expect(tratarRecusa("versao_desatualizada", "2099-01-01", "2026-10-08")).toEqual({ codigo: "versao_desatualizada", recarregar: true, avisar: false });
    expect(tratarRecusa("versao_desatualizada", "2026-01-01", "2026-10-08")).toEqual({ codigo: "erro_interno", recarregar: false, avisar: true });
    expect(tratarRecusa("versao_desatualizada", null, "2026-10-08")).toEqual({ codigo: "erro_interno", recarregar: false, avisar: false });
    // a versão da tela é a VERSAO_TEXTOS; a origem é a do aparelho (no Vitest, o site)
    expect(tratarRecusa("versao_desatualizada", "9999-12-31").recarregar).toBe(true);
    expect(VERSAO_TEXTOS).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("versao_desatualizada com o banco na frente no APK e na loja: 'Atualize o app' (recarregar abriria o mesmo pacote — um laço)", () => {
    for (const origem of ["apk", "loja"] as const) {
      expect(tratarRecusa("versao_desatualizada", "2099-01-01", "2026-10-08", origem)).toEqual({ codigo: "atualize_o_app", recarregar: false, avisar: false });
      // o banco atrás continua a genérica com o aviso
      expect(tratarRecusa("versao_desatualizada", "2026-01-01", "2026-10-08", origem)).toEqual({ codigo: "erro_interno", recarregar: false, avisar: true });
    }
    expect(tratarRecusa("versao_desatualizada", "2099-01-01", "2026-10-08", "site")).toEqual({ codigo: "versao_desatualizada", recarregar: true, avisar: false });
  });

  it("as outras recusas viram o próprio código (ou a genérica, se desconhecido)", () => {
    expect(tratarRecusa("menor_de_18", null)).toEqual({ codigo: "menor_de_18", recarregar: false, avisar: false });
    expect(tratarRecusa("algo_novo", null)).toEqual({ codigo: "erro_interno", recarregar: false, avisar: false });
  });
});
